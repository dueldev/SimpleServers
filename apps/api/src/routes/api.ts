import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRole } from "../lib/auth.js";
import { loadConfig } from "../lib/config.js";
import type { UserRole } from "../domain/types.js";
import { store } from "../repositories/store.js";
import { BackupService } from "../services/backup-service.js";
import { ConsoleHub } from "../services/console-hub.js";
import { JavaService } from "../services/java-service.js";
import { ServerRuntimeService } from "../services/server-runtime.js";
import { ServerSetupService } from "../services/server-setup.js";
import { TaskSchedulerService } from "../services/task-scheduler.js";
import { TunnelService } from "../services/tunnel-service.js";
import { VersionCatalogService } from "../services/version-catalog.js";
import { AlertMonitorService } from "../services/alert-monitor.js";
import { ContentCatalogService } from "../services/content-catalog.js";
import { BackupRetentionService } from "../services/backup-retention-service.js";
import { CrashReportService } from "../services/crash-report-service.js";
import { PolicyService } from "../services/policy-service.js";
import { RemoteControlService } from "../services/remote-control-service.js";
import { PreflightService } from "../services/preflight-service.js";

const config = loadConfig();
const editableFiles = new Set(["server.properties", "ops.json", "whitelist.json", "banned-ips.json", "banned-players.json"]);

const userCreateSchema = z.object({
  username: z.string().min(2).max(24),
  role: z.enum(["owner", "admin", "moderator", "viewer"]),
  apiToken: z.string().min(8)
});

const createServerSchema = z.object({
  name: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9-_ ]+$/),
  type: z.enum(["vanilla", "paper", "fabric"]),
  mcVersion: z.string().min(3),
  port: z.number().int().min(1024).max(65535).default(25565),
  bedrockPort: z.number().int().min(1024).max(65535).nullable().optional(),
  minMemoryMb: z.number().int().min(256).max(32768).default(1024),
  maxMemoryMb: z.number().int().min(512).max(65536).default(4096),
  javaPath: z.string().optional(),
  allowCracked: z.boolean().default(false),
  enableGeyser: z.boolean().default(false),
  enableFloodgate: z.boolean().default(false),
  preset: z.enum(["custom", "survival", "modded", "minigame"]).default("custom")
});

const commandSchema = z.object({
  command: z.string().min(1)
});

const createTaskSchema = z.object({
  serverId: z.string().min(4),
  name: z.string().min(2),
  cronExpr: z.string().min(3),
  action: z.enum(["restart", "backup", "command"]),
  payload: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().default(true)
});

const createTunnelSchema = z.object({
  serverId: z.string().min(4),
  provider: z.enum(["manual", "playit", "cloudflared", "ngrok"]),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
  localPort: z.number().int().min(1).max(65535),
  publicHost: z.string().min(3),
  publicPort: z.number().int().min(1).max(65535),
  config: z.record(z.string(), z.unknown()).optional()
});

const quickPublicHostingSchema = z.object({
  localPort: z.number().int().min(1).max(65535).optional(),
  protocol: z.enum(["tcp", "udp"]).optional()
});

const contentSearchSchema = z.object({
  provider: z.enum(["modrinth", "curseforge"]),
  q: z.string().min(1),
  serverId: z.string().min(4),
  kind: z.enum(["mod", "plugin", "modpack", "resourcepack"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional()
});

const contentVersionsSchema = z.object({
  serverId: z.string().min(4),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const installPackageSchema = z.object({
  provider: z.enum(["modrinth", "curseforge"]),
  projectId: z.string().min(1),
  requestedVersionId: z.string().optional(),
  kind: z.enum(["mod", "plugin", "modpack", "resourcepack"]).optional()
});

const rotateTokenSchema = z.object({
  newToken: z.string().min(12)
});

const backupPolicySchema = z.object({
  maxBackups: z.number().int().min(1).max(500).default(20),
  maxAgeDays: z.number().int().min(1).max(3650).default(30),
  pruneCron: z.string().min(5).default("0 */6 * * *"),
  enabled: z.boolean().default(true)
});

const remoteConfigSchema = z.object({
  enabled: z.boolean().optional(),
  allowedOrigins: z.array(z.string().url()).optional(),
  requireToken: z.boolean().optional()
});

function applyPreset(payload: z.infer<typeof createServerSchema>): z.infer<typeof createServerSchema> {
  if (payload.preset === "survival") {
    return {
      ...payload,
      type: payload.type === "fabric" ? "fabric" : "paper",
      minMemoryMb: Math.max(payload.minMemoryMb, 2048),
      maxMemoryMb: Math.max(payload.maxMemoryMb, 4096),
      enableGeyser: true,
      enableFloodgate: true
    };
  }

  if (payload.preset === "modded") {
    return {
      ...payload,
      type: "fabric",
      minMemoryMb: Math.max(payload.minMemoryMb, 4096),
      maxMemoryMb: Math.max(payload.maxMemoryMb, 8192)
    };
  }

  if (payload.preset === "minigame") {
    return {
      ...payload,
      type: "paper",
      minMemoryMb: Math.max(payload.minMemoryMb, 3072),
      maxMemoryMb: Math.max(payload.maxMemoryMb, 6144),
      enableGeyser: false,
      enableFloodgate: false
    };
  }

  return payload;
}

function sanitizeServerDirName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

function resolveUniqueServerRootPath(name: string): string {
  const base = sanitizeServerDirName(name);
  if (!base) {
    throw new Error("Server name must contain at least one letter or number");
  }

  const existing = new Set(store.listServers().map((server) => path.basename(server.rootPath)));
  let candidate = base;
  let sequence = 1;
  while (existing.has(candidate) || fs.existsSync(path.join(config.serversDir, candidate))) {
    candidate = `${base}-${String(sequence).padStart(2, "0")}`;
    sequence += 1;
  }
  return path.join(config.serversDir, candidate);
}

function validateEditableFile(fileName: string): string {
  if (!editableFiles.has(fileName)) {
    throw new Error(`File ${fileName} is not editable via API`);
  }
  return fileName;
}

function writeAudit(actor: string, action: string, targetType: string, targetId: string, payload?: unknown): void {
  store.createAudit({ actor, action, targetType, targetId, payload });
}

function buildSimpleDiff(current: string, next: string): string[] {
  const currentLines = current.split("\n");
  const nextLines = next.split("\n");
  const max = Math.max(currentLines.length, nextLines.length);
  const diff: string[] = [];

  for (let index = 0; index < max; index += 1) {
    const oldLine = currentLines[index];
    const newLine = nextLines[index];
    if (oldLine === newLine) {
      continue;
    }

    if (oldLine !== undefined) {
      diff.push(`- ${oldLine}`);
    }

    if (newLine !== undefined) {
      diff.push(`+ ${newLine}`);
    }
  }

  return diff;
}

export async function registerApiRoutes(
  app: FastifyInstance,
  deps: {
    versions: VersionCatalogService;
    java: JavaService;
    setup: ServerSetupService;
    runtime: ServerRuntimeService;
    backup: BackupService;
    tasks: TaskSchedulerService;
    tunnels: TunnelService;
    consoleHub: ConsoleHub;
    alerts: AlertMonitorService;
    content: ContentCatalogService;
    preflight: PreflightService;
    crashReports: CrashReportService;
    backupRetention: BackupRetentionService;
    policy: PolicyService;
    remoteControl: RemoteControlService;
  }
): Promise<void> {
  app.get("/health", async () => ({ ok: true, name: "SimpleServers API" }));

  app.get("/setup/catalog", { preHandler: [authenticate] }, async () => {
    const [catalog, javaCandidates] = await Promise.all([deps.versions.getSetupCatalog(), deps.java.discoverJavaCandidates()]);
    return { catalog, javaCandidates };
  });

  app.get("/setup/presets", { preHandler: [authenticate] }, async () => ({
    presets: [
      {
        id: "custom",
        label: "Custom",
        description: "Manual control over all settings"
      },
      {
        id: "survival",
        label: "Survival Starter",
        description: "Paper defaults with crossplay toggles and moderate memory"
      },
      {
        id: "modded",
        label: "Modded Fabric",
        description: "Fabric-focused settings with higher memory baseline"
      },
      {
        id: "minigame",
        label: "Minigame Performance",
        description: "Paper settings tuned for plugin-heavy minigame servers"
      }
    ]
  }));

  app.post("/policy/server-create-preview", { preHandler: [authenticate] }, async (request) => {
    const payload = applyPreset(createServerSchema.parse(request.body));
    const findings = deps.policy.evaluateServerCreatePolicy({
      name: payload.name,
      type: payload.type,
      allowCracked: payload.allowCracked,
      maxMemoryMb: payload.maxMemoryMb,
      port: payload.port
    });
    return { findings };
  });

  app.get("/me", { preHandler: [authenticate] }, async (request) => ({ user: request.user }));

  app.get("/users", { preHandler: [authenticate, requireRole("owner")] }, async () => {
    return { users: store.listUsers() };
  });

  app.post("/users", { preHandler: [authenticate, requireRole("owner")] }, async (request) => {
    const payload = userCreateSchema.parse(request.body);
    const user = store.createUser(payload);
    writeAudit(request.user!.username, "user.create", "user", user.id, payload);
    return { user };
  });

  app.post("/users/:id/rotate-token", { preHandler: [authenticate, requireRole("owner")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = rotateTokenSchema.parse(request.body);
    const user = store.rotateUserToken(id, payload.newToken);
    if (!user) {
      throw app.httpErrors.notFound("User not found");
    }

    writeAudit(request.user!.username, "user.rotate_token", "user", id);
    return { user };
  });

  app.get("/system/java", { preHandler: [authenticate] }, async () => {
    const runtimes = await deps.java.discoverJavaCandidates();
    return { runtimes };
  });

  app.get("/system/java/channels", { preHandler: [authenticate] }, async () => {
    const [channels, updateSignals] = await Promise.all([deps.java.listJavaChannels(), deps.java.checkRuntimeUpdates()]);
    return { channels, updateSignals };
  });

  app.get("/system/status", { preHandler: [authenticate] }, async () => {
    const servers = store.listServers();
    const alerts = store.listAlerts();
    return {
      servers: {
        total: servers.length,
        running: servers.filter((s) => s.status === "running").length,
        crashed: servers.filter((s) => s.status === "crashed").length
      },
      alerts: {
        open: alerts.filter((a) => a.resolvedAt === null).length,
        total: alerts.length
      }
    };
  });

  app.get("/servers", { preHandler: [authenticate] }, async () => ({ servers: store.listServers() }));

  app.post("/servers", { preHandler: [authenticate, requireRole("admin")] }, async (request, reply) => {
    const payload = applyPreset(createServerSchema.parse(request.body));

    if (payload.maxMemoryMb < payload.minMemoryMb) {
      return reply.code(400).send({ error: "maxMemoryMb must be >= minMemoryMb" });
    }

    const policyFindings = deps.policy.evaluateServerCreatePolicy({
      name: payload.name,
      type: payload.type,
      allowCracked: payload.allowCracked,
      maxMemoryMb: payload.maxMemoryMb,
      port: payload.port
    });

    const blocking = policyFindings.find((finding) => finding.severity === "critical");
    if (blocking) {
      return reply.code(400).send({
        error: `Policy violation: ${blocking.message}`,
        findings: policyFindings
      });
    }

    const javaRuntime = payload.javaPath
      ? await deps.java.inspectJava(payload.javaPath)
      : await deps.java.chooseJavaForVersion(payload.mcVersion);

    const requiredJava = deps.java.getRequiredJavaMajor(payload.mcVersion);
    if (!javaRuntime.version || javaRuntime.version < requiredJava) {
      return reply
        .code(400)
        .send({ error: `Java ${requiredJava}+ required for Minecraft ${payload.mcVersion}. Found ${javaRuntime.version ?? "unknown"}` });
    }

    let serverRoot: string;
    try {
      serverRoot = resolveUniqueServerRootPath(payload.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(400).send({ error: message });
    }

    const initialRecord = store.createServer({
      name: payload.name,
      type: payload.type,
      mcVersion: payload.mcVersion,
      javaPath: javaRuntime.path,
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      port: payload.port,
      bedrockPort: payload.bedrockPort ?? null,
      minMemoryMb: payload.minMemoryMb,
      maxMemoryMb: payload.maxMemoryMb
    });

    try {
      await deps.setup.provisionServer({
        id: initialRecord.id,
        name: initialRecord.name,
        type: initialRecord.type,
        mcVersion: initialRecord.mcVersion,
        rootPath: initialRecord.rootPath,
        port: initialRecord.port,
        allowCracked: payload.allowCracked,
        enableGeyser: payload.enableGeyser,
        enableFloodgate: payload.enableFloodgate
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.alerts.createAlert(initialRecord.id, "critical", "provision_failed", message);
      store.deleteServer(initialRecord.id);
      return reply.code(500).send({ error: `Failed to provision server: ${message}` });
    }

    writeAudit(request.user!.username, "server.create", "server", initialRecord.id, payload);
    return { server: store.getServerById(initialRecord.id), policyFindings };
  });

  app.post("/servers/:id/start", { preHandler: [authenticate, requireRole("moderator")] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const preflight = deps.preflight.run(server);
    const criticalIssue = preflight.issues.find((issue) => issue.severity === "critical");
    if (criticalIssue) {
      deps.alerts.createAlert(server.id, "critical", "preflight_block", criticalIssue.message);
      return {
        ok: false,
        blocked: true,
        preflight
      };
    }

    for (const issue of preflight.issues.filter((issue) => issue.severity === "warning")) {
      deps.alerts.createAlert(server.id, "warning", "preflight_warning", issue.message);
    }

    try {
      await deps.runtime.start(server);
      await deps.tunnels.startTunnelsForServer(server.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.alerts.createAlert(server.id, "critical", "start_failed", message);
      return reply.code(500).send({ ok: false, error: `Failed to start server: ${message}` });
    }

    writeAudit(request.user!.username, "server.start", "server", id);
    return { ok: true, preflight };
  });

  app.post("/servers/:id/stop", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    await deps.tunnels.stopTunnelsForServer(id);
    await deps.runtime.stop(id);
    writeAudit(request.user!.username, "server.stop", "server", id);
    return { ok: true };
  });

  app.post("/servers/:id/restart", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    await deps.tunnels.stopTunnelsForServer(server.id);
    await deps.runtime.restart(server);
    await deps.tunnels.startTunnelsForServer(server.id);
    writeAudit(request.user!.username, "server.restart", "server", id);
    return { ok: true };
  });

  app.post("/servers/:id/command", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = commandSchema.parse(request.body);

    deps.runtime.sendCommand(id, payload.command);
    writeAudit(request.user!.username, "server.command", "server", id, payload);
    return { ok: true };
  });

  app.get("/servers/:id/logs", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return {
      logs: deps.consoleHub.getHistory(id)
    };
  });

  app.get("/servers/:id/preflight", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    return {
      report: deps.preflight.run(server)
    };
  });

  app.get(
    "/servers/:id/log-stream",
    { websocket: true },
    (connection, request) => {
      const { id } = request.params as { id: string };
      const query = request.query as { token?: string };
      const protocolHeader = request.headers["sec-websocket-protocol"];
      const protocolValue = typeof protocolHeader === "string" ? protocolHeader : "";
      const protocolTokenRaw = protocolValue
        .split(",")
        .map((value) => value.trim())
        .find((value) => value.startsWith("ss-token."))?.slice("ss-token.".length);

      let protocolToken: string | undefined;
      if (protocolTokenRaw) {
        try {
          const normalized = protocolTokenRaw.replace(/-/g, "+").replace(/_/g, "/");
          const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
          protocolToken = Buffer.from(padded, "base64").toString("utf8");
        } catch {
          protocolToken = undefined;
        }
      }

      const token = query.token ?? protocolToken;
      if (!token || !store.findUserByToken(token)) {
        connection.close();
        return;
      }

      for (const entry of deps.consoleHub.getHistory(id)) {
        connection.send(JSON.stringify(entry));
      }

      const unsubscribe = deps.consoleHub.subscribe(id, (message) => {
        connection.send(JSON.stringify(message));
      });

      connection.on("close", () => unsubscribe());
    }
  );

  app.get("/servers/:id/files/:fileName", { preHandler: [authenticate] }, async (request) => {
    const { id, fileName } = request.params as { id: string; fileName: string };
    const server = store.getServerById(id);

    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const name = validateEditableFile(fileName);
    const filePath = path.join(server.rootPath, name);

    if (!fs.existsSync(filePath)) {
      return { fileName: name, content: "" };
    }

    return { fileName: name, content: fs.readFileSync(filePath, "utf8") };
  });

  app.put("/servers/:id/files/:fileName", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id, fileName } = request.params as { id: string; fileName: string };
    const body = z.object({ content: z.string() }).parse(request.body);

    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const name = validateEditableFile(fileName);
    const filePath = path.join(server.rootPath, name);
    fs.writeFileSync(filePath, body.content, "utf8");

    writeAudit(request.user!.username, "server.file.update", "server", id, { fileName: name });
    return { ok: true };
  });

  app.post("/servers/:id/files/:fileName/diff", { preHandler: [authenticate] }, async (request) => {
    const { id, fileName } = request.params as { id: string; fileName: string };
    const body = z.object({ nextContent: z.string() }).parse(request.body);
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const name = validateEditableFile(fileName);
    const filePath = path.join(server.rootPath, name);
    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
    const diff = buildSimpleDiff(current, body.nextContent);
    return { diff };
  });

  app.get("/servers/:id/backups", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return { backups: deps.backup.listBackups(id) };
  });

  app.post("/servers/:id/backups", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    const backup = await deps.backup.createBackup(id);
    writeAudit(request.user!.username, "backup.create", "server", id, backup);
    return { backup };
  });

  app.post("/servers/:id/backups/:backupId/restore", { preHandler: [authenticate, requireRole("admin")] }, async (request, reply) => {
    const { id, backupId } = request.params as { id: string; backupId: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    if (deps.runtime.isRunning(id) || server.status === "running" || server.status === "starting") {
      return reply.code(409).send({ error: "Server must be stopped before restoring a backup" });
    }

    const restore = await deps.backup.restoreBackup(id, backupId);
    writeAudit(request.user!.username, "backup.restore", "server", id, { backupId });
    return { ok: true, restore };
  });

  app.post("/servers/:id/public-hosting/quick-enable", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = quickPublicHostingSchema.parse(request.body ?? {});
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const tunnel = deps.tunnels.ensureQuickTunnel(id, payload);
    const readiness = deps.tunnels.getTunnelLaunchReadiness(tunnel);
    let warning: string | null = readiness.ok ? null : readiness.reason ?? "Tunnel dependency missing.";
    if (server.status === "running" || server.status === "starting") {
      try {
        await deps.tunnels.startTunnel(tunnel.id);
      } catch (error) {
        warning = error instanceof Error ? error.message : String(error);
      }
    }

    writeAudit(request.user!.username, "public_hosting.quick_enable", "server", id, {
      tunnelId: tunnel.id,
      protocol: tunnel.protocol,
      localPort: tunnel.localPort,
      readiness: readiness.ok ? "ready" : readiness.reason
    });
    return {
      tunnel,
      warning
    };
  });

  app.get("/servers/:id/public-hosting/status", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const tunnels = deps.tunnels.listTunnels(id);
    const activeTunnel = tunnels.find((tunnel) => tunnel.status === "active") ?? tunnels[0] ?? null;
    const readiness = activeTunnel ? deps.tunnels.getTunnelLaunchReadiness(activeTunnel) : null;
    const localAddress = `127.0.0.1:${String(server.port)}`;
    return {
      server: {
        id: server.id,
        name: server.name,
        status: server.status,
        localAddress
      },
      quickHostReady: Boolean(activeTunnel && readiness?.ok),
      publicAddress: activeTunnel ? `${activeTunnel.publicHost}:${String(activeTunnel.publicPort)}` : null,
      tunnel: activeTunnel,
      steps: activeTunnel
        ? readiness?.ok
          ? ["Share the public address with players.", "Keep this app running while hosting."]
          : [
              readiness?.reason ?? "Tunnel dependency missing.",
              "Start your server to let SimpleServers provision tunnel dependencies automatically, or install the client manually."
            ]
        : [
            "Enable quick hosting to avoid manual port forwarding.",
            "Start your server to activate your public tunnel.",
            "Share the public address once it is active."
          ]
    };
  });

  app.get("/servers/:id/backup-policy", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    if (!store.getServerById(id)) {
      throw app.httpErrors.notFound("Server not found");
    }
    const policy = store.getBackupPolicy(id);
    return {
      policy:
        policy ?? {
          serverId: id,
          maxBackups: 20,
          maxAgeDays: 30,
          pruneCron: "0 */6 * * *",
          enabled: 0
        }
    };
  });

  app.put("/servers/:id/backup-policy", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    if (!store.getServerById(id)) {
      throw app.httpErrors.notFound("Server not found");
    }
    const payload = backupPolicySchema.parse(request.body);
    const policy = store.setBackupPolicy({
      serverId: id,
      maxBackups: payload.maxBackups,
      maxAgeDays: payload.maxAgeDays,
      pruneCron: payload.pruneCron,
      enabled: payload.enabled
    });
    deps.backupRetention.refresh();
    writeAudit(request.user!.username, "backup_policy.update", "server", id, payload);
    return { policy };
  });

  app.post("/servers/:id/backup-policy/prune-now", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    if (!store.getServerById(id)) {
      throw app.httpErrors.notFound("Server not found");
    }
    const result = await deps.backupRetention.pruneForServer(id);
    writeAudit(request.user!.username, "backup_policy.prune_now", "server", id, result);
    return { result };
  });

  app.get("/tasks", { preHandler: [authenticate] }, async (request) => {
    const query = request.query as { serverId?: string };
    return { tasks: store.listTasks(query.serverId) };
  });

  app.post("/tasks", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const payload = createTaskSchema.parse(request.body);
    const task = store.createTask(payload);
    deps.tasks.refresh();
    writeAudit(request.user!.username, "task.create", "task", task.id, payload);
    return { task };
  });

  app.post("/tasks/:id/enable", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    store.setTaskEnabled(id, true);
    deps.tasks.refresh();
    writeAudit(request.user!.username, "task.enable", "task", id);
    return { ok: true };
  });

  app.post("/tasks/:id/disable", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    store.setTaskEnabled(id, false);
    deps.tasks.refresh();
    writeAudit(request.user!.username, "task.disable", "task", id);
    return { ok: true };
  });

  app.delete("/tasks/:id", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    store.deleteTask(id);
    deps.tasks.refresh();
    writeAudit(request.user!.username, "task.delete", "task", id);
    return { ok: true };
  });

  app.get("/alerts", { preHandler: [authenticate] }, async (request) => {
    const query = request.query as { serverId?: string };
    return { alerts: store.listAlerts(query.serverId) };
  });

  app.post("/alerts/:id/resolve", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    store.resolveAlert(id);
    writeAudit(request.user!.username, "alert.resolve", "alert", id);
    return { ok: true };
  });

  app.get("/audit", { preHandler: [authenticate, requireRole("admin")] }, async () => {
    return { logs: store.listAudit(300) };
  });

  app.get("/tunnels", { preHandler: [authenticate] }, async (request) => {
    const query = request.query as { serverId?: string };
    return { tunnels: deps.tunnels.listTunnels(query.serverId) };
  });

  app.post("/tunnels", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const payload = createTunnelSchema.parse(request.body);
    const tunnel = deps.tunnels.createTunnel(payload);
    writeAudit(request.user!.username, "tunnel.create", "tunnel", tunnel.id, payload);
    return { tunnel };
  });

  app.post("/tunnels/:id/start", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    try {
      await deps.tunnels.startTunnel(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw app.httpErrors.conflict(message);
    }
    writeAudit(request.user!.username, "tunnel.start", "tunnel", id);
    return { ok: true };
  });

  app.post("/tunnels/:id/stop", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    await deps.tunnels.stopTunnel(id);
    writeAudit(request.user!.username, "tunnel.stop", "tunnel", id);
    return { ok: true };
  });

  app.get("/content/search", { preHandler: [authenticate] }, async (request) => {
    const query = contentSearchSchema.parse(request.query);
    const server = store.getServerById(query.serverId);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const results = await deps.content.search({
      provider: query.provider,
      query: query.q,
      server,
      kind: query.kind,
      limit: query.limit
    });
    return { results };
  });

  app.get("/content/:provider/projects/:projectId/versions", { preHandler: [authenticate] }, async (request) => {
    const params = request.params as { provider: "modrinth" | "curseforge"; projectId: string };
    const query = contentVersionsSchema.parse(request.query);
    const server = store.getServerById(query.serverId);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const versions = await deps.content.listVersions({
      provider: params.provider,
      projectId: params.projectId,
      server,
      limit: query.limit
    });

    return { versions };
  });

  app.get("/servers/:id/packages", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return { packages: deps.content.listInstalled(id) };
  });

  app.get("/servers/:id/packages/updates", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const updates = await deps.content.checkForUpdates(id);
    return { updates };
  });

  app.post("/servers/:id/packages/install", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = installPackageSchema.parse(request.body);
    const result = await deps.content.installPackage({
      serverId: id,
      provider: payload.provider,
      projectId: payload.projectId,
      requestedVersionId: payload.requestedVersionId,
      kind: payload.kind
    });

    writeAudit(request.user!.username, "package.install", "server", id, {
      provider: payload.provider,
      projectId: payload.projectId,
      versionId: result.versionId
    });
    return { install: result };
  });

  app.post(
    "/servers/:id/packages/:packageId/update",
    { preHandler: [authenticate, requireRole("admin")] },
    async (request) => {
      const { id, packageId } = request.params as { id: string; packageId: string };
      const result = await deps.content.updateInstalledPackage(id, packageId);
      writeAudit(request.user!.username, "package.update", "server_package", packageId, {
        serverId: id,
        versionId: result.versionId
      });
      return { update: result };
    }
  );

  app.delete("/servers/:id/packages/:packageId", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id, packageId } = request.params as { id: string; packageId: string };
    deps.content.uninstallPackage(id, packageId);
    writeAudit(request.user!.username, "package.uninstall", "server_package", packageId, { serverId: id });
    return { ok: true };
  });

  app.get("/servers/:id/crash-reports", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    return { reports: deps.crashReports.list(id) };
  });

  app.get("/crash-reports/:id", { preHandler: [authenticate, requireRole("admin")] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const raw = deps.crashReports.read(id);
    reply.header("content-type", "application/json");
    return JSON.parse(raw);
  });

  app.get("/remote/status", { preHandler: [authenticate, requireRole("owner")] }, async () => {
    return { remote: deps.remoteControl.getStatus() };
  });

  app.put("/remote/config", { preHandler: [authenticate, requireRole("owner")] }, async (request) => {
    const payload = remoteConfigSchema.parse(request.body);
    const remote = deps.remoteControl.setState(payload);
    writeAudit(request.user!.username, "remote.config.update", "system", "remote_control", payload);
    return { remote };
  });

  app.get("/meta", async () => ({
    name: "SimpleServers",
    version: "0.1.0",
    dataDir: config.dataDir
  }));

  app.get("/roles", async () => ({
    roles: ["owner", "admin", "moderator", "viewer"] satisfies UserRole[]
  }));
}
