import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { request } from "undici";
import { loadConfig } from "../lib/config.js";
import { downloadToFile, fetchJsonWithRetry } from "../lib/download.js";
import { nowIso } from "../lib/util.js";
import { store } from "../repositories/store.js";
import type { TunnelRecord } from "../domain/types.js";
import { ConsoleHub } from "./console-hub.js";

const config = loadConfig();
const tunnelBinDir = path.join(config.dataDir, "bin");
const tunnelCacheDir = path.join(config.cacheDir, "tunnels");

type GitHubRelease = {
  tag_name: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
  }>;
};

type TunnelRuntime = {
  tunnelId: string;
  child: ChildProcessWithoutNullStreams;
  launchCommand: string;
  endpointSyncTimer: NodeJS.Timeout | null;
};

type TunnelLaunchReadiness = {
  ok: boolean;
  command: string;
  reason?: string;
};

type PlayitSyncState = {
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  nextAttemptAt: string | null;
  lastPendingReason: string | null;
  lastError: string | null;
  endpointAssigned: boolean;
};

type PlayitPortType = "tcp" | "udp" | "both";

type PlayitRunDataResult = {
  status: "success" | "error" | "fail";
  data: {
    tunnels?: Array<{
      id?: string;
      internal_id?: number;
      name?: string;
      display_address: string;
      port_type: PlayitPortType;
      disabled_reason?: string | null;
      agent_config?: {
        fields?: Array<{
          name: string;
          value: string;
        }>;
      };
    }>;
    pending?: Array<{
      status_msg?: string;
    }>;
  } | null;
};

type PlayitTunnelBinding = {
  playitTunnelId?: string;
  playitInternalId?: number;
  playitTunnelName?: string;
  playitSecretPath?: string;
};

export class TunnelService {
  private readonly runtimes = new Map<string, TunnelRuntime>();
  private readonly playitSyncState = new Map<string, PlayitSyncState>();

  constructor(private readonly consoleHub: ConsoleHub) {}

  createTunnel(input: {
    serverId: string;
    provider: TunnelRecord["provider"];
    protocol: TunnelRecord["protocol"];
    localPort: number;
    publicHost: string;
    publicPort: number;
    config?: Record<string, unknown>;
  }): TunnelRecord {
    return store.createTunnel({
      serverId: input.serverId,
      provider: input.provider,
      protocol: input.protocol,
      localPort: input.localPort,
      publicHost: input.publicHost,
      publicPort: input.publicPort,
      status: input.provider === "manual" ? "active" : "idle",
      configJson: JSON.stringify(input.config ?? {})
    });
  }

  listTunnels(serverId?: string): TunnelRecord[] {
    return store.listTunnels(serverId);
  }

  getTunnelLaunchReadiness(tunnelOrId: TunnelRecord | string): TunnelLaunchReadiness {
    const tunnel = typeof tunnelOrId === "string" ? store.getTunnel(tunnelOrId) : tunnelOrId;
    if (!tunnel) {
      return {
        ok: false,
        command: "",
        reason: "Tunnel not found"
      };
    }

    if (tunnel.provider === "manual") {
      return {
        ok: true,
        command: "manual"
      };
    }

    const config = this.parseTunnelConfig(tunnel) as {
      command?: string;
      args?: string[];
    };
    const defaults = this.providerDefaults(tunnel.provider, tunnel.localPort, tunnel.protocol, tunnel.publicHost);
    const command = config.command ?? defaults.command;
    const available = this.commandExists(command);
    const hint = this.missingCommandHint(tunnel.provider, command);
    return {
      ok: available,
      command,
      reason: available ? undefined : hint
    };
  }

  ensureQuickTunnel(
    serverId: string,
    input?: {
      localPort?: number;
      protocol?: TunnelRecord["protocol"];
    }
  ): TunnelRecord {
    const server = store.getServerById(serverId);
    if (!server) {
      throw new Error("Server not found");
    }

    const existing = store.listTunnels(serverId).find((tunnel) => tunnel.provider === "playit");
    if (existing) {
      return existing;
    }

    const port = input?.localPort ?? server.port;
    const protocol = input?.protocol ?? "tcp";
    return this.createTunnel({
      serverId,
      provider: "playit",
      protocol,
      localPort: port,
      // playit allocates a public endpoint dynamically; placeholder shown until connected.
      publicHost: "pending.playit.gg",
      publicPort: port,
      config: {
        command: "playit",
        args: ["--stdout"]
      }
    });
  }

  async startTunnelsForServer(serverId: string): Promise<void> {
    const tunnels = store.listTunnels(serverId);
    for (const tunnel of tunnels) {
      try {
        await this.startTunnel(tunnel.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.consoleHub.publish(serverId, `[tunnel] failed to start ${tunnel.provider}: ${message}`);
      }
    }
  }

  async stopTunnelsForServer(serverId: string): Promise<void> {
    const tunnels = store.listTunnels(serverId);
    for (const tunnel of tunnels) {
      try {
        await this.stopTunnel(tunnel.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.consoleHub.publish(serverId, `[tunnel] failed to stop ${tunnel.provider}: ${message}`);
      }
    }
  }

  async startTunnel(tunnelId: string): Promise<void> {
    const tunnel = store.getTunnel(tunnelId);
    if (!tunnel) {
      throw new Error("Tunnel not found");
    }

    if (tunnel.provider === "manual") {
      store.updateTunnelStatus(tunnelId, "active");
      return;
    }

    if (this.runtimes.has(tunnelId)) {
      return;
    }

    const config = this.parseTunnelConfig(tunnel) as {
      command?: string;
      args?: string[];
    };

    const defaults = this.providerDefaults(tunnel.provider, tunnel.localPort, tunnel.protocol, tunnel.publicHost);
    const configuredCommand = config.command ?? defaults.command;
    const command = await this.resolveLaunchCommand(tunnel, configuredCommand, Boolean(config.command));
    const args = Array.isArray(config.args) && config.args.length > 0 ? config.args : defaults.args;

    const child = spawn(command, args, {
      stdio: "pipe"
    });

    this.runtimes.set(tunnelId, { tunnelId, child, launchCommand: command, endpointSyncTimer: null });
    store.updateTunnelStatus(tunnelId, tunnel.provider === "playit" ? "starting" : "active");

    const logPrefix = `[tunnel:${tunnel.publicHost}:${tunnel.publicPort}]`;

    child.stdout.on("data", (chunk) => {
      const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        this.consoleHub.publish(tunnel.serverId, `${logPrefix} ${line}`);
      }
    });

    child.stderr.on("data", (chunk) => {
      const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        this.consoleHub.publish(tunnel.serverId, `${logPrefix} [stderr] ${line}`);
      }
    });

    child.on("error", (error) => {
      this.clearTunnelSyncTimer(tunnelId);
      this.runtimes.delete(tunnelId);
      store.updateTunnelStatus(tunnelId, "error");
      this.consoleHub.publish(tunnel.serverId, `${logPrefix} failed to start: ${error.message}`);
    });

    child.on("exit", (code) => {
      this.clearTunnelSyncTimer(tunnelId);
      this.runtimes.delete(tunnelId);
      store.updateTunnelStatus(tunnelId, code === 0 ? "idle" : "error");
      this.consoleHub.publish(tunnel.serverId, `${logPrefix} exited with code ${String(code)}`);
    });

    if (tunnel.provider === "playit") {
      await this.refreshPlayitTunnelPublicEndpoint(tunnelId);

      const timer = setInterval(() => {
        void this.refreshPlayitTunnelPublicEndpoint(tunnelId);
      }, 7000);

      const runtime = this.runtimes.get(tunnelId);
      if (runtime) {
        runtime.endpointSyncTimer = timer;
        this.setPlayitSyncState(tunnelId, {
          nextAttemptAt: this.resolveNextPlayitAttemptAt(tunnelId)
        });
      } else {
        clearInterval(timer);
      }
    }
  }

  async stopTunnel(tunnelId: string): Promise<void> {
    const tunnel = store.getTunnel(tunnelId);
    if (!tunnel) {
      throw new Error("Tunnel not found");
    }

    if (tunnel.provider === "manual") {
      store.updateTunnelStatus(tunnelId, "idle");
      return;
    }

    const runtime = this.runtimes.get(tunnelId);
    if (!runtime) {
      store.updateTunnelStatus(tunnelId, "idle");
      this.setPlayitSyncState(tunnelId, {
        nextAttemptAt: null
      });
      return;
    }

    this.clearTunnelSyncTimer(tunnelId);
    runtime.child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        runtime.child.kill("SIGKILL");
        resolve();
      }, 5000);

      runtime.child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    store.updateTunnelStatus(tunnelId, "idle");
    this.runtimes.delete(tunnelId);
  }

  async refreshPlayitTunnelPublicEndpoint(tunnelOrId: string | TunnelRecord): Promise<{
    synced: boolean;
    pendingReason?: string;
    endpoint?: { host: string; port: number };
  }> {
    const tunnel = typeof tunnelOrId === "string" ? store.getTunnel(tunnelOrId) : tunnelOrId;
    if (!tunnel || tunnel.provider !== "playit") {
      return { synced: false };
    }

    this.setPlayitSyncState(tunnel.id, {
      lastAttemptAt: nowIso(),
      nextAttemptAt: this.resolveNextPlayitAttemptAt(tunnel.id),
      endpointAssigned: tunnel.publicHost !== "pending.playit.gg"
    });

    try {
      const playitCommand = await this.resolvePlayitCommandForSync(tunnel);
      const secret = await this.resolvePlayitSecret(tunnel, playitCommand);
      if (!secret) {
        store.updateTunnelStatus(tunnel.id, "pending");
        this.setPlayitSyncState(tunnel.id, {
          endpointAssigned: false,
          lastPendingReason: "playit secret is not configured yet",
          lastError: null,
          nextAttemptAt: this.resolveNextPlayitAttemptAt(tunnel.id)
        });
        return { synced: false, pendingReason: "playit secret is not configured yet" };
      }

      const runData = await this.fetchPlayitRunData(secret);
      const tunnelMatch = this.findPlayitTunnelMatch(runData, tunnel);
      if (!tunnelMatch) {
        const pendingReason = this.extractPendingReason(runData);
        store.updateTunnelStatus(tunnel.id, pendingReason ? "pending" : "starting");
        this.setPlayitSyncState(tunnel.id, {
          endpointAssigned: false,
          lastPendingReason: pendingReason ?? "playit is still assigning a public endpoint",
          lastError: null,
          nextAttemptAt: this.resolveNextPlayitAttemptAt(tunnel.id)
        });
        return { synced: false, pendingReason };
      }

      const endpoint = parseDisplayAddress(tunnelMatch.display_address);
      if (!endpoint) {
        this.setPlayitSyncState(tunnel.id, {
          endpointAssigned: false,
          lastPendingReason: "playit returned an invalid tunnel address",
          lastError: null,
          nextAttemptAt: this.resolveNextPlayitAttemptAt(tunnel.id)
        });
        return { synced: false, pendingReason: "playit returned an invalid tunnel address" };
      }

      this.persistPlayitTunnelBinding(tunnel, tunnelMatch);

      if (endpoint.host !== tunnel.publicHost || endpoint.port !== tunnel.publicPort) {
        store.updateTunnelEndpoint(tunnel.id, {
          publicHost: endpoint.host,
          publicPort: endpoint.port
        });
        this.consoleHub.publish(
          tunnel.serverId,
          `[tunnel] playit endpoint updated: ${tunnel.publicHost}:${String(tunnel.publicPort)} -> ${endpoint.host}:${String(endpoint.port)}`
        );
      }

      store.updateTunnelStatus(tunnel.id, "active");
      this.setPlayitSyncState(tunnel.id, {
        endpointAssigned: true,
        lastSuccessAt: nowIso(),
        lastPendingReason: null,
        lastError: null,
        nextAttemptAt: this.resolveNextPlayitAttemptAt(tunnel.id)
      });
      return {
        synced: true,
        endpoint
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.consoleHub.publish(tunnel.serverId, `[tunnel] playit endpoint sync failed: ${message}`);
      this.setPlayitSyncState(tunnel.id, {
        endpointAssigned: false,
        lastError: message,
        nextAttemptAt: this.resolveNextPlayitAttemptAt(tunnel.id)
      });
      return {
        synced: false,
        pendingReason: message
      };
    }
  }

  async getTunnelDiagnostics(tunnelOrId: string | TunnelRecord): Promise<{
    tunnelId: string;
    provider: TunnelRecord["provider"];
    status: string;
    command: string;
    commandAvailable: boolean;
    authConfigured: boolean | null;
    endpointAssigned: boolean;
    endpoint: string | null;
    retry: {
      nextAttemptAt: string | null;
      nextAttemptInSeconds: number | null;
      lastAttemptAt: string | null;
      lastSuccessAt: string | null;
    };
    message: string | null;
  } | null> {
    const tunnel = typeof tunnelOrId === "string" ? store.getTunnel(tunnelOrId) : tunnelOrId;
    if (!tunnel) {
      return null;
    }

    const readiness = this.getTunnelLaunchReadiness(tunnel);
    const endpointAssigned = tunnel.publicHost !== "pending.playit.gg";
    const endpoint = endpointAssigned ? `${tunnel.publicHost}:${String(tunnel.publicPort)}` : null;

    if (tunnel.provider !== "playit") {
      return {
        tunnelId: tunnel.id,
        provider: tunnel.provider,
        status: tunnel.status,
        command: readiness.command,
        commandAvailable: readiness.ok,
        authConfigured: null,
        endpointAssigned,
        endpoint,
        retry: {
          nextAttemptAt: null,
          nextAttemptInSeconds: null,
          lastAttemptAt: null,
          lastSuccessAt: null
        },
        message: readiness.reason ?? null
      };
    }

    const command = await this.resolvePlayitCommandForSync(tunnel);
    const commandAvailable = Boolean(command && this.commandExists(command));
    const secret = await this.resolvePlayitSecret(tunnel, command);
    const authConfigured = Boolean(secret);
    const sync = this.getPlayitSyncState(tunnel.id);
    const nextAttemptAt = sync.nextAttemptAt;
    const nextAttemptInSeconds = nextAttemptAt ? Math.max(0, Math.ceil((Date.parse(nextAttemptAt) - Date.now()) / 1000)) : null;
    const message = sync.lastError ?? sync.lastPendingReason ?? readiness.reason ?? null;

    return {
      tunnelId: tunnel.id,
      provider: tunnel.provider,
      status: tunnel.status,
      command: command ?? readiness.command,
      commandAvailable,
      authConfigured,
      endpointAssigned,
      endpoint,
      retry: {
        nextAttemptAt,
        nextAttemptInSeconds,
        lastAttemptAt: sync.lastAttemptAt,
        lastSuccessAt: sync.lastSuccessAt
      },
      message
    };
  }

  private clearTunnelSyncTimer(tunnelId: string): void {
    const runtime = this.runtimes.get(tunnelId);
    if (!runtime?.endpointSyncTimer) {
      this.setPlayitSyncState(tunnelId, {
        nextAttemptAt: null
      });
      return;
    }
    clearInterval(runtime.endpointSyncTimer);
    runtime.endpointSyncTimer = null;
    this.setPlayitSyncState(tunnelId, {
      nextAttemptAt: null
    });
  }

  private async resolvePlayitCommandForSync(tunnel: TunnelRecord): Promise<string | null> {
    const runtimeCommand = this.runtimes.get(tunnel.id)?.launchCommand;
    if (runtimeCommand) {
      return runtimeCommand;
    }

    const config = this.parseTunnelConfig(tunnel) as { command?: string };
    const configuredCommand = config.command?.trim();
    if (configuredCommand && this.commandExists(configuredCommand)) {
      return configuredCommand;
    }

    if (this.commandExists("playit")) {
      return "playit";
    }

    return null;
  }

  private async resolvePlayitSecret(tunnel: TunnelRecord, playitCommand: string | null): Promise<string | null> {
    const tunnelSecretPath = this.getPlayitTunnelBinding(tunnel).playitSecretPath;
    if (tunnelSecretPath) {
      const fromTunnelConfig = readPlayitSecretFile(tunnelSecretPath);
      if (fromTunnelConfig) {
        return fromTunnelConfig;
      }
    }

    const explicitSecret = process.env.PLAYIT_SECRET?.trim();
    if (explicitSecret) {
      return explicitSecret;
    }

    const explicitSecretPath = process.env.PLAYIT_SECRET_PATH?.trim();
    if (explicitSecretPath) {
      return readPlayitSecretFile(explicitSecretPath);
    }

    if (!playitCommand) {
      return null;
    }

    const secretPath = await this.resolvePlayitSecretPath(playitCommand);
    if (!secretPath) {
      return null;
    }

    return readPlayitSecretFile(secretPath);
  }

  private async resolvePlayitSecretPath(playitCommand: string): Promise<string | null> {
    return new Promise((resolve) => {
      const child = spawn(playitCommand, ["secret-path"], {
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", () => resolve(null));
      child.on("exit", (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }

        const candidate = stdout.trim().split(/\r?\n/).find((line) => line.trim().length > 0)?.trim();
        if (!candidate) {
          resolve(null);
          return;
        }

        if (stderr.trim().length > 0) {
          // Some builds may emit warnings on stderr while still returning a valid path.
        }

        resolve(candidate);
      });
    });
  }

  private parseTunnelConfig(tunnel: TunnelRecord): Record<string, unknown> {
    try {
      const parsed = JSON.parse(tunnel.configJson || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private getPlayitTunnelBinding(tunnel: TunnelRecord): PlayitTunnelBinding {
    const config = this.parseTunnelConfig(tunnel);
    const playitTunnelId =
      typeof config.playitTunnelId === "string" && config.playitTunnelId.trim().length > 0 ? config.playitTunnelId.trim() : undefined;
    const playitInternalId =
      typeof config.playitInternalId === "number" && Number.isFinite(config.playitInternalId)
        ? Math.trunc(config.playitInternalId)
        : undefined;
    const playitTunnelName =
      typeof config.playitTunnelName === "string" && config.playitTunnelName.trim().length > 0
        ? config.playitTunnelName.trim()
        : undefined;
    const playitSecretPath =
      typeof config.playitSecretPath === "string" && config.playitSecretPath.trim().length > 0
        ? config.playitSecretPath.trim()
        : undefined;
    return {
      playitTunnelId,
      playitInternalId,
      playitTunnelName,
      playitSecretPath
    };
  }

  setPlayitSecretPath(tunnelId: string, secretPath: string): TunnelRecord {
    const tunnel = store.getTunnel(tunnelId);
    if (!tunnel) {
      throw new Error("Tunnel not found");
    }
    if (tunnel.provider !== "playit") {
      throw new Error("Tunnel is not playit-backed");
    }

    const config = this.parseTunnelConfig(tunnel);
    const nextConfig = {
      ...config,
      playitSecretPath: secretPath.trim()
    };
    store.updateTunnelConfig(tunnel.id, JSON.stringify(nextConfig));
    const updated = store.getTunnel(tunnelId);
    if (!updated) {
      throw new Error("Tunnel not found after secret update");
    }
    return updated;
  }

  private persistPlayitTunnelBinding(
    tunnel: TunnelRecord,
    remote: { id?: string; internal_id?: number; name?: string }
  ): void {
    const binding = this.getPlayitTunnelBinding(tunnel);
    const nextTunnelId = typeof remote.id === "string" && remote.id.length > 0 ? remote.id : undefined;
    const nextInternalId = typeof remote.internal_id === "number" && Number.isFinite(remote.internal_id) ? Math.trunc(remote.internal_id) : undefined;
    const nextTunnelName = typeof remote.name === "string" && remote.name.trim().length > 0 ? remote.name.trim() : undefined;

    const changed =
      (nextTunnelId ?? null) !== (binding.playitTunnelId ?? null) ||
      (nextInternalId ?? null) !== (binding.playitInternalId ?? null) ||
      (nextTunnelName ?? null) !== (binding.playitTunnelName ?? null);

    if (!changed) {
      return;
    }

    const config = this.parseTunnelConfig(tunnel);
    const nextConfig: Record<string, unknown> = { ...config };
    if (nextTunnelId) {
      nextConfig.playitTunnelId = nextTunnelId;
    } else {
      delete nextConfig.playitTunnelId;
    }

    if (nextInternalId !== undefined) {
      nextConfig.playitInternalId = nextInternalId;
    } else {
      delete nextConfig.playitInternalId;
    }

    if (nextTunnelName) {
      nextConfig.playitTunnelName = nextTunnelName;
    } else {
      delete nextConfig.playitTunnelName;
    }

    store.updateTunnelConfig(tunnel.id, JSON.stringify(nextConfig));
  }

  private async fetchPlayitRunData(secret: string): Promise<PlayitRunDataResult["data"]> {
    const response = await request("https://api.playit.gg/v1/agents/rundata", {
      method: "POST",
      headers: {
        authorization: `Agent-Key ${secret.trim()}`,
        "content-type": "application/json",
        "user-agent": "SimpleServers/0.1 (+https://github.com)"
      },
      body: JSON.stringify({})
    });

    const payload = (await response.body.json()) as PlayitRunDataResult;
    if (response.statusCode >= 400) {
      throw new Error(`playit API request failed with status ${response.statusCode}`);
    }

    if (payload.status !== "success" || !payload.data) {
      throw new Error(`playit API returned ${payload.status}`);
    }

    return payload.data;
  }

  private findPlayitTunnelMatch(
    runData: PlayitRunDataResult["data"],
    tunnel: TunnelRecord
  ): {
    id?: string;
    internal_id?: number;
    name?: string;
    display_address: string;
    port_type: PlayitPortType;
    agent_config?: {
      fields?: Array<{
        name: string;
        value: string;
      }>;
    };
  } | null {
    const tunnels = runData?.tunnels ?? [];
    const binding = this.getPlayitTunnelBinding(tunnel);
    const compatible = tunnels.filter((entry) => {
      if (!entry || !entry.display_address || entry.disabled_reason) {
        return false;
      }

      if (!portTypeMatches(tunnel.protocol, entry.port_type)) {
        return false;
      }

      return true;
    });

    if (binding.playitTunnelId) {
      const byTunnelId = compatible.find((entry) => entry.id === binding.playitTunnelId);
      if (byTunnelId) {
        return byTunnelId;
      }
    }

    if (binding.playitInternalId !== undefined) {
      const byInternalId = compatible.find((entry) => entry.internal_id === binding.playitInternalId);
      if (byInternalId) {
        return byInternalId;
      }
    }

    const exactLocalPortMatches = compatible.filter((entry) => {
      const localPort = resolvePlayitTunnelLocalPort(entry);
      return localPort !== null && localPort === tunnel.localPort;
    });
    if (exactLocalPortMatches.length > 0) {
      return exactLocalPortMatches[0];
    }

    // If only one compatible tunnel exists, prefer it to avoid stalling endpoint resolution.
    if (compatible.length === 1) {
      return compatible[0];
    }

    if (tunnel.publicHost !== "pending.playit.gg") {
      const sameEndpoint = compatible.find(
        (entry) => entry.display_address === `${tunnel.publicHost}:${String(tunnel.publicPort)}`
      );
      if (sameEndpoint) {
        return sameEndpoint;
      }
    }

    const publicPortMatches = compatible.filter((entry) => parseDisplayAddress(entry.display_address)?.port === tunnel.publicPort);
    if (publicPortMatches.length === 1) {
      return publicPortMatches[0];
    }

    if (compatible.length > 0) {
      // Prefer first compatible tunnel over a perpetual unresolved state.
      return compatible[0];
    }

    return null;
  }

  private extractPendingReason(runData: PlayitRunDataResult["data"]): string | undefined {
    const pending = runData?.pending ?? [];
    const first = pending.find((entry) => typeof entry.status_msg === "string" && entry.status_msg.trim().length > 0);
    return first?.status_msg?.trim();
  }

  private getPlayitSyncState(tunnelId: string): PlayitSyncState {
    return (
      this.playitSyncState.get(tunnelId) ?? {
        lastAttemptAt: null,
        lastSuccessAt: null,
        nextAttemptAt: null,
        lastPendingReason: null,
        lastError: null,
        endpointAssigned: false
      }
    );
  }

  private setPlayitSyncState(tunnelId: string, patch: Partial<PlayitSyncState>): void {
    const previous = this.getPlayitSyncState(tunnelId);
    this.playitSyncState.set(tunnelId, {
      ...previous,
      ...patch
    });
  }

  private resolveNextPlayitAttemptAt(tunnelId: string): string | null {
    if (!this.runtimes.has(tunnelId)) {
      return null;
    }
    return new Date(Date.now() + 7000).toISOString();
  }

  private providerDefaults(
    provider: TunnelRecord["provider"],
    localPort: number,
    protocol: TunnelRecord["protocol"],
    publicHost: string
  ): { command: string; args: string[] } {
    if (provider === "cloudflared") {
      return {
        command: "cloudflared",
        args: ["access", "tcp", "--hostname", publicHost, "--url", `localhost:${String(localPort)}`]
      };
    }

    if (provider === "ngrok") {
      return {
        command: "ngrok",
        args: [protocol, String(localPort)]
      };
    }

    return {
      command: "playit",
      args: ["--stdout"]
    };
  }

  private commandExists(command: string): boolean {
    if (!command.trim()) {
      return false;
    }

    if (pathHasSeparator(command)) {
      return existsFile(command);
    }

    const pathEnv = process.env.PATH ?? "";
    const pathParts = pathEnv.split(pathDelimiter()).filter(Boolean);
    const extensions = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
    for (const baseDir of pathParts) {
      for (const extension of extensions) {
        const candidate = `${command}${extension}`;
        const resolved = path.join(baseDir, candidate);
        if (existsFile(resolved)) {
          return true;
        }
      }
    }

    return false;
  }

  private missingCommandHint(provider: TunnelRecord["provider"], command: string): string {
    if (provider === "playit" && command === "playit") {
      if (process.platform === "linux" || process.platform === "win32") {
        return "playit is missing. SimpleServers will auto-download it when starting public hosting.";
      }
      return "playit is missing. SimpleServers will auto-install it via Homebrew when available, otherwise install it manually (brew install playit).";
    }

    return `${command} is not installed or not available on PATH`;
  }

  private async resolveLaunchCommand(tunnel: TunnelRecord, command: string, wasExplicitlyConfigured: boolean): Promise<string> {
    if (this.commandExists(command)) {
      return command;
    }

    if (wasExplicitlyConfigured) {
      throw new Error(`${command} is configured for this tunnel but was not found on PATH`);
    }

    if (tunnel.provider !== "playit") {
      throw new Error(this.missingCommandHint(tunnel.provider, command));
    }

    const managed = await this.ensureManagedPlayitBinary();
    if (!this.commandExists(managed)) {
      throw new Error("Managed playit binary install failed");
    }

    return managed;
  }

  private async ensureManagedPlayitBinary(): Promise<string> {
    if (process.platform === "darwin") {
      return this.ensureMacPlayitViaBrew();
    }

    const assetNames = this.getPlayitAssetNames();
    if (assetNames.length === 0) {
      throw new Error(`Automatic playit install is not supported on ${process.platform}/${process.arch}`);
    }

    fs.mkdirSync(tunnelBinDir, { recursive: true });
    fs.mkdirSync(tunnelCacheDir, { recursive: true });

    const executableName = process.platform === "win32" ? "playit-managed.exe" : "playit-managed";
    const targetPath = path.join(tunnelBinDir, executableName);
    if (existsFile(targetPath)) {
      if (process.platform !== "win32") {
        fs.chmodSync(targetPath, 0o755);
      }
      return targetPath;
    }

    const release = await this.fetchLatestPlayitRelease();
    const asset = assetNames.map((name) => release.assets.find((entry) => entry.name === name)).find(Boolean);
    if (!asset) {
      throw new Error(`playit release asset not found for ${process.platform}/${process.arch}`);
    }

    const cacheName = `${release.tag_name}-${asset.name}`.replace(/[^a-zA-Z0-9._-]/g, "_");
    const downloadPath = path.join(tunnelCacheDir, cacheName);
    await downloadToFile(asset.browser_download_url, downloadPath);
    fs.copyFileSync(downloadPath, targetPath);
    if (process.platform !== "win32") {
      fs.chmodSync(targetPath, 0o755);
    }

    return targetPath;
  }

  private async ensureMacPlayitViaBrew(): Promise<string> {
    if (this.commandExists("playit")) {
      return "playit";
    }

    if (!this.commandExists("brew")) {
      throw new Error("playit is missing and Homebrew was not found. Install Homebrew, then run: brew install playit");
    }

    await this.runCommand("brew", ["install", "playit"]);

    if (!this.commandExists("playit")) {
      throw new Error("Homebrew install completed but playit is still not available on PATH");
    }

    return "playit";
  }

  private async runCommand(command: string, args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { stdio: "pipe" });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        reject(error);
      });
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`${command} ${args.join(" ")} failed (code=${String(code)}): ${stderr.slice(-400)}`));
      });
    });
  }

  private async fetchLatestPlayitRelease(): Promise<GitHubRelease> {
    return fetchJsonWithRetry<GitHubRelease>("https://api.github.com/repos/playit-cloud/playit-agent/releases/latest");
  }

  private getPlayitAssetNames(): string[] {
    if (process.platform === "linux") {
      if (process.arch === "x64") {
        return ["playit-linux-amd64"];
      }
      if (process.arch === "arm64") {
        return ["playit-linux-aarch64"];
      }
      if (process.arch === "arm") {
        return ["playit-linux-armv7"];
      }
      if (process.arch === "ia32") {
        return ["playit-linux-i686"];
      }
      return [];
    }

    if (process.platform === "win32") {
      if (process.arch === "x64") {
        return ["playit-windows-x86_64-signed.exe", "playit-windows-x86_64.exe"];
      }
      if (process.arch === "ia32") {
        return ["playit-windows-x86-signed.exe", "playit-windows-x86.exe"];
      }
      return [];
    }

    return [];
  }
}

function pathHasSeparator(value: string): boolean {
  return value.includes("/") || value.includes("\\");
}

function pathDelimiter(): string {
  return process.platform === "win32" ? ";" : ":";
}

function existsFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function portTypeMatches(protocol: TunnelRecord["protocol"], portType: PlayitPortType): boolean {
  if (portType === "both") {
    return true;
  }
  return portType === protocol;
}

function readPlayitFieldNumber(
  fields: Array<{
    name: string;
    value: string;
  }> | undefined,
  key: string
): number | null {
  if (!fields) {
    return null;
  }

  const value = fields.find((entry) => entry.name === key)?.value;
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
}

function resolvePlayitTunnelLocalPort(entry: {
  display_address: string;
  agent_config?: {
    fields?: Array<{
      name: string;
      value: string;
    }>;
  };
}): number | null {
  const fields = entry.agent_config?.fields;
  const localPort =
    readPlayitFieldNumber(fields, "local_port") ??
    readPlayitFieldNumber(fields, "localPort") ??
    readPlayitFieldNumber(fields, "from_port") ??
    readPlayitFieldNumber(fields, "port");
  if (localPort !== null) {
    return localPort;
  }

  return parseDisplayAddress(entry.display_address)?.port ?? null;
}

function readPlayitSecretFile(secretPath: string): string | null {
  try {
    if (!fs.existsSync(secretPath)) {
      return null;
    }

    const content = fs.readFileSync(secretPath, "utf8").trim();
    if (!content) {
      return null;
    }

    return normalizePlayitSecret(content);
  } catch {
    return null;
  }
}

function normalizePlayitSecret(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const candidate = line.replace(/^Agent-Key\s+/i, "").trim();
    if (/^[A-Za-z0-9_-]{8,}$/.test(candidate)) {
      return candidate;
    }
  }

  const fromToml = trimmed.match(/secret_key\s*=\s*["']?([A-Za-z0-9_-]{8,})["']?/i)?.[1];
  if (fromToml) {
    return fromToml.trim();
  }

  const fromEnv = trimmed.match(/PLAYIT_SECRET\s*=\s*["']?([A-Za-z0-9_-]{8,})["']?/i)?.[1];
  if (fromEnv) {
    return fromEnv.trim();
  }

  const fromHeader = trimmed.match(/Agent-Key\s+([A-Za-z0-9_-]{8,})/i)?.[1];
  if (fromHeader) {
    return fromHeader.trim();
  }

  return null;
}

function parseDisplayAddress(value: string): { host: string; port: number } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("[")) {
    const close = trimmed.lastIndexOf("]");
    if (close <= 0) {
      return null;
    }
    const host = trimmed.slice(0, close + 1);
    const portPart = trimmed.slice(close + 2);
    const port = Number.parseInt(portPart, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return null;
    }
    return { host, port };
  }

  const idx = trimmed.lastIndexOf(":");
  if (idx <= 0 || idx === trimmed.length - 1) {
    return null;
  }

  const host = trimmed.slice(0, idx).trim();
  const port = Number.parseInt(trimmed.slice(idx + 1), 10);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return { host, port };
}
