import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../lib/config.js";
import { downloadToFile, fetchJsonWithRetry } from "../lib/download.js";
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
};

type TunnelLaunchReadiness = {
  ok: boolean;
  command: string;
  reason?: string;
};

export class TunnelService {
  private readonly runtimes = new Map<string, TunnelRuntime>();

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

    const config = JSON.parse(tunnel.configJson || "{}") as {
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
        args: []
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

    const config = JSON.parse(tunnel.configJson || "{}") as {
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

    this.runtimes.set(tunnelId, { tunnelId, child });
    store.updateTunnelStatus(tunnelId, "active");

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
      this.runtimes.delete(tunnelId);
      store.updateTunnelStatus(tunnelId, "error");
      this.consoleHub.publish(tunnel.serverId, `${logPrefix} failed to start: ${error.message}`);
    });

    child.on("exit", (code) => {
      this.runtimes.delete(tunnelId);
      store.updateTunnelStatus(tunnelId, code === 0 ? "idle" : "error");
      this.consoleHub.publish(tunnel.serverId, `${logPrefix} exited with code ${String(code)}`);
    });
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
      return;
    }

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
      args: []
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
