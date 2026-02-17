import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireRole } from "../lib/auth.js";
import { loadConfig } from "../lib/config.js";
import { resolveUniqueServerName } from "../lib/server-name.js";
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
const playitSecretsDir = path.join(config.dataDir, "secrets", "playit");
const editableFiles = new Set(["server.properties", "ops.json", "whitelist.json", "banned-ips.json", "banned-players.json"]);
const editableTextExtensions = new Set([
  ".properties",
  ".json",
  ".txt",
  ".cfg",
  ".conf",
  ".ini",
  ".toml",
  ".yaml",
  ".yml",
  ".xml",
  ".mcmeta",
  ".md"
]);
const editableDirectoryRoots = ["", "config", "plugins", "mods", "world/datapacks"];
const ignoredDirectoryNames = new Set(["node_modules", "libraries", ".git", "cache", "logs"]);
const maxEditableFileBytes = 1024 * 1024; // 1 MB safety guard for in-app editing.
const maxEditorFiles = 350;
const maxEditorDepth = 5;
const APP_VERSION = "0.5.1";
const REPOSITORY_URL = "https://github.com/dueldev/SimpleServers";

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

const quickStartSchema = z.object({
  name: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9-_ ]+$/).default("My Server"),
  preset: z.enum(["custom", "survival", "modded", "minigame"]).default("survival"),
  type: z.enum(["vanilla", "paper", "fabric"]).optional(),
  mcVersion: z.string().min(3).optional(),
  port: z.number().int().min(1024).max(65535).optional(),
  bedrockPort: z.number().int().min(1024).max(65535).optional(),
  startServer: z.boolean().default(true),
  publicHosting: z.boolean().default(true),
  allowCracked: z.boolean().default(false)
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

const playitSecretSchema = z.object({
  secret: z.string().trim().min(8).max(4096)
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

const deleteServerQuerySchema = z.object({
  deleteFiles: z.coerce.boolean().default(true),
  deleteBackups: z.coerce.boolean().default(true)
});

const editorFileQuerySchema = z.object({
  path: z.string().trim().min(1).max(260)
});

const editorWriteSchema = z.object({
  path: z.string().trim().min(1).max(260),
  content: z.string()
});

const editorDiffSchema = z.object({
  path: z.string().trim().min(1).max(260),
  nextContent: z.string()
});

const editorFileSnapshotsQuerySchema = z.object({
  path: z.string().trim().min(1).max(260),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const editorRollbackSchema = z.object({
  path: z.string().trim().min(1).max(260),
  snapshotId: z.string().trim().optional()
});

const telemetryEventSchema = z.object({
  sessionId: z.string().trim().min(6).max(128),
  event: z.string().trim().min(3).max(120),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const telemetryFunnelQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(24 * 30).default(24)
});

const bulkServerActionSchema = z.object({
  serverIds: z.array(z.string().min(4)).min(1).max(100),
  action: z.enum(["start", "stop", "restart", "backup", "goLive"])
});

const performanceAdvisorQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(24 * 14).default(24)
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

function pickLatestVersionForType(
  catalog: {
    vanilla: Array<{ id: string; stable: boolean }>;
    paper: Array<{ id: string; stable: boolean }>;
    fabric: Array<{ id: string; stable: boolean }>;
  },
  type: "vanilla" | "paper" | "fabric"
): string | null {
  const entries = type === "paper" ? catalog.paper : type === "fabric" ? catalog.fabric : catalog.vanilla;
  const stable = entries.find((entry) => entry.stable)?.id;
  return stable ?? entries[0]?.id ?? null;
}

function resolveQuickStartMemoryProfile(
  preset: "custom" | "survival" | "modded" | "minigame",
  totalMemoryMb: number
): { minMemoryMb: number; maxMemoryMb: number } {
  const baseline =
    preset === "modded" ? { minMemoryMb: 4096, maxMemoryMb: 8192 } : preset === "minigame" ? { minMemoryMb: 3072, maxMemoryMb: 6144 } : { minMemoryMb: 2048, maxMemoryMb: 4096 };

  // Keep allocations conservative to avoid host thrashing on smaller systems.
  const cap = Math.max(2048, Math.floor(totalMemoryMb * 0.5));
  const boundedMax = Math.min(baseline.maxMemoryMb, cap);
  const boundedMin = Math.min(baseline.minMemoryMb, Math.max(1024, Math.floor(boundedMax * 0.6)));

  return {
    minMemoryMb: boundedMin,
    maxMemoryMb: Math.max(boundedMin, boundedMax)
  };
}

function validateEditableFile(fileName: string): string {
  if (!editableFiles.has(fileName)) {
    throw new Error(`File ${fileName} is not editable via API`);
  }
  return fileName;
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function isPathInsideRoot(rootPath: string, targetPath: string): boolean {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isTextEditablePath(fileNameOrPath: string): boolean {
  const baseName = path.basename(fileNameOrPath);
  if (editableFiles.has(baseName)) {
    return true;
  }
  const extension = path.extname(baseName).toLowerCase();
  return editableTextExtensions.has(extension);
}

function resolveEditorFilePath(serverRoot: string, requestedPath: string): { relativePath: string; absolutePath: string } {
  const relativePath = normalizeRelativePath(requestedPath);
  if (!relativePath || relativePath.includes("\0")) {
    throw new Error("Invalid file path");
  }

  if (!isTextEditablePath(relativePath)) {
    throw new Error(`File ${relativePath} is not editable via API`);
  }

  const absolutePath = path.resolve(serverRoot, relativePath);
  if (!isPathInsideRoot(serverRoot, absolutePath)) {
    throw new Error("File path escapes server directory");
  }

  return { relativePath, absolutePath };
}

function listEditableFiles(serverRoot: string): Array<{ path: string; sizeBytes: number; updatedAt: string | null; exists: boolean }> {
  const files = new Map<string, { path: string; sizeBytes: number; updatedAt: string | null; exists: boolean }>();

  const addEntry = (relativePath: string, stats?: fs.Stats): void => {
    const normalized = normalizeRelativePath(relativePath);
    if (!normalized || files.size >= maxEditorFiles) {
      return;
    }

    files.set(normalized, {
      path: normalized,
      sizeBytes: stats?.size ?? 0,
      updatedAt: stats?.mtime ? new Date(stats.mtime).toISOString() : null,
      exists: Boolean(stats)
    });
  };

  const walkDirectory = (absoluteDir: string, relativeDir: string, depth: number): void => {
    if (depth > maxEditorDepth || files.size >= maxEditorFiles) {
      return;
    }

    if (!fs.existsSync(absoluteDir)) {
      return;
    }

    const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.size >= maxEditorFiles) {
        return;
      }

      const nextRelativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const nextAbsolutePath = path.join(absoluteDir, entry.name);

      if (!isPathInsideRoot(serverRoot, nextAbsolutePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        if (ignoredDirectoryNames.has(entry.name) || entry.name.startsWith(".")) {
          continue;
        }
        walkDirectory(nextAbsolutePath, nextRelativePath, depth + 1);
        continue;
      }

      if (!entry.isFile() || !isTextEditablePath(nextRelativePath)) {
        continue;
      }

      const stats = fs.statSync(nextAbsolutePath);
      if (stats.size > maxEditableFileBytes) {
        continue;
      }
      addEntry(nextRelativePath, stats);
    }
  };

  for (const root of editableDirectoryRoots) {
    const absoluteRoot = root ? path.join(serverRoot, root) : serverRoot;
    walkDirectory(absoluteRoot, normalizeRelativePath(root), 0);
  }

  for (const knownFile of editableFiles) {
    if (!files.has(knownFile)) {
      const knownPath = path.join(serverRoot, knownFile);
      if (fs.existsSync(knownPath)) {
        const stats = fs.statSync(knownPath);
        if (stats.isFile() && stats.size <= maxEditableFileBytes) {
          addEntry(knownFile, stats);
          continue;
        }
      }
      addEntry(knownFile);
    }
  }

  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function removeFileIfPresent(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }
  fs.rmSync(filePath, { recursive: true, force: true });
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

function normalizePlayitSecretInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const first = lines[0] ?? "";
  const direct = first.replace(/^Agent-Key\s+/i, "").trim();
  if (/^[A-Za-z0-9_-]{8,}$/.test(direct)) {
    return direct;
  }

  const fromToml = trimmed.match(/secret_key\s*=\s*["']?([A-Za-z0-9_-]{8,})["']?/i)?.[1];
  if (fromToml) {
    return fromToml.trim();
  }

  const fromEnv = trimmed.match(/PLAYIT_SECRET\s*=\s*["']?([A-Za-z0-9_-]{8,})["']?/i)?.[1];
  if (fromEnv) {
    return fromEnv.trim();
  }

  const fromAgentKey = trimmed.match(/Agent-Key\s+([A-Za-z0-9_-]{8,})/i)?.[1];
  if (fromAgentKey) {
    return fromAgentKey.trim();
  }

  return "";
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

  app.get("/system/hardware", { preHandler: [authenticate] }, async () => {
    const totalMemoryMb = Math.floor(os.totalmem() / (1024 * 1024));
    const freeMemoryMb = Math.floor(os.freemem() / (1024 * 1024));
    const quickStartProfile = resolveQuickStartMemoryProfile("survival", totalMemoryMb);

    return {
      platform: process.platform,
      arch: process.arch,
      cpuCores: os.cpus().length,
      totalMemoryMb,
      freeMemoryMb,
      recommendations: {
        quickStartMinMemoryMb: quickStartProfile.minMemoryMb,
        quickStartMaxMemoryMb: quickStartProfile.maxMemoryMb
      }
    };
  });

  app.get("/system/trust", { preHandler: [authenticate] }, async () => {
    const remote = deps.remoteControl.getStatus();
    const signatureStatus =
      process.env.SIMPLESERVERS_BUILD_SIGNATURE_STATUS ??
      (process.env.SIMPLESERVERS_DESKTOP_DEV === "1" ? "development" : "unknown");

    return {
      generatedAt: new Date().toISOString(),
      build: {
        appVersion: APP_VERSION,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        mode: process.env.NODE_ENV ?? "development",
        signatureStatus,
        signatureProvider: process.env.SIMPLESERVERS_BUILD_SIGNATURE_PROVIDER ?? null,
        releaseChannel: process.env.SIMPLESERVERS_UPDATE_CHANNEL ?? "stable",
        repository: REPOSITORY_URL
      },
      verification: {
        checksumUrl: process.env.SIMPLESERVERS_RELEASE_CHECKSUM_URL ?? null,
        attestationUrl: process.env.SIMPLESERVERS_RELEASE_ATTESTATION_URL ?? null
      },
      security: {
        localOnlyByDefault: true,
        authModel: "token-rbac",
        auditTrailEnabled: true,
        remoteControlEnabled: remote.enabled,
        remoteTokenRequired: remote.requireToken,
        configuredRemoteToken: remote.configuredToken,
        allowedOrigins: remote.allowedOrigins
      }
    };
  });

  const createAndProvisionServer = async (payload: z.infer<typeof createServerSchema>) => {
    if (payload.maxMemoryMb < payload.minMemoryMb) {
      throw app.httpErrors.badRequest("maxMemoryMb must be >= minMemoryMb");
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
      throw app.httpErrors.badRequest(`Policy violation: ${blocking.message}`);
    }

    const nameInUse = store.listServers().some((server) => server.name.toLowerCase() === payload.name.toLowerCase());
    if (nameInUse) {
      throw app.httpErrors.conflict(`Server name "${payload.name}" is already in use.`);
    }

    const javaRuntime = payload.javaPath
      ? await deps.java.inspectJava(payload.javaPath)
      : await deps.java.chooseJavaForVersion(payload.mcVersion);

    const requiredJava = deps.java.getRequiredJavaMajor(payload.mcVersion);
    if (!javaRuntime.version || javaRuntime.version < requiredJava) {
      throw app.httpErrors.badRequest(
        `Java ${requiredJava}+ required for Minecraft ${payload.mcVersion}. Found ${javaRuntime.version ?? "unknown"}`
      );
    }

    const serverRoot = resolveUniqueServerRootPath(payload.name);

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
      throw app.httpErrors.internalServerError(`Failed to provision server: ${message}`);
    }

    const server = store.getServerById(initialRecord.id);
    if (!server) {
      throw app.httpErrors.internalServerError("Server was created but could not be reloaded from store");
    }

    return { server, policyFindings };
  };

  const goLiveForServer = async (
    server: NonNullable<ReturnType<typeof store.getServerById>>
  ): Promise<{
    ok: boolean;
    blocked: boolean;
    preflight: ReturnType<PreflightService["run"]>;
    warning: string | null;
    publicHosting: {
      quickHostReady: boolean;
      publicAddress: string | null;
      tunnel: ReturnType<TunnelService["listTunnels"]>[number] | null;
      steps: string[];
    };
  }> => {
    const preflight = deps.preflight.run(server);
    const criticalIssue = preflight.issues.find((issue) => issue.severity === "critical");
    if (criticalIssue) {
      deps.alerts.createAlert(server.id, "critical", "preflight_block", criticalIssue.message);
      return {
        ok: false,
        blocked: true,
        preflight,
        warning: "Go Live blocked by critical preflight issue.",
        publicHosting: {
          quickHostReady: false,
          publicAddress: null,
          tunnel: null,
          steps: [criticalIssue.message]
        }
      };
    }

    for (const issue of preflight.issues.filter((issue) => issue.severity === "warning")) {
      deps.alerts.createAlert(server.id, "warning", "preflight_warning", issue.message);
    }

    let warning: string | null = null;
    const running = deps.runtime.isRunning(server.id) || server.status === "running" || server.status === "starting";
    if (!running) {
      try {
        await deps.runtime.start(server);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        deps.alerts.createAlert(server.id, "critical", "go_live_start_failed", message);
        return {
          ok: false,
          blocked: false,
          preflight,
          warning: `Failed to start server: ${message}`,
          publicHosting: {
            quickHostReady: false,
            publicAddress: null,
            tunnel: null,
            steps: ["Fix startup errors before enabling public hosting."]
          }
        };
      }
    }

    const tunnel = deps.tunnels.ensureQuickTunnel(server.id);
    try {
      await deps.tunnels.startTunnel(tunnel.id);
      const syncResult = await deps.tunnels.refreshPlayitTunnelPublicEndpoint(tunnel.id);
      if (syncResult.pendingReason) {
        warning = syncResult.pendingReason;
      }
    } catch (error) {
      warning = error instanceof Error ? error.message : String(error);
    }

    const tunnels = deps.tunnels.listTunnels(server.id);
    const activeTunnel = tunnels.find((entry) => entry.provider === "playit") ?? tunnels[0] ?? null;
    const hasResolvedPublicAddress = Boolean(activeTunnel && activeTunnel.publicHost !== "pending.playit.gg");
    const quickHostReady = Boolean(activeTunnel && hasResolvedPublicAddress);
    const publicAddress = hasResolvedPublicAddress ? `${activeTunnel!.publicHost}:${String(activeTunnel!.publicPort)}` : null;
    if (!publicAddress && !warning) {
      warning = "Playit is still assigning a public endpoint.";
    }

    return {
      ok: true,
      blocked: false,
      preflight,
      warning,
      publicHosting: {
        quickHostReady,
        publicAddress,
        tunnel: activeTunnel,
        steps: quickHostReady
          ? ["Share the public address with players.", "Keep this app running while hosting."]
          : [
              "Playit is still assigning a public endpoint.",
              "Keep this machine online until the endpoint resolves."
            ]
      }
    };
  };

  const toFixedNumber = (value: number, digits = 1): number => Number(value.toFixed(digits));

  const buildPerformanceAdvisor = (
    server: NonNullable<ReturnType<typeof store.getServerById>>,
    hours: number
  ): {
    windowHours: number;
    sampleCount: number;
    metrics: {
      latest: { sampledAt: string; cpuPercent: number; memoryMb: number } | null;
      cpu: { avgPercent: number; peakPercent: number };
      memory: { avgMb: number; peakMb: number; configuredMaxMb: number };
    };
    startup: {
      trend: "improving" | "stable" | "regressing" | "insufficient_data";
      recent: Array<{
        createdAt: string;
        durationMs: number;
        success: boolean;
        exitCode: number | null;
      }>;
      averageDurationMs: number | null;
      latestDurationMs: number | null;
    };
    tickLag: {
      eventsInWindow: number;
      lastEventAt: string | null;
      maxLagMs: number;
      recent: Array<{ createdAt: string; lagMs: number; ticksBehind: number; line: string }>;
    };
    hints: Array<{
      level: "ok" | "warning" | "critical";
      title: string;
      detail: string;
    }>;
  } => {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const samples = store.listServerPerformanceSamples({
      serverId: server.id,
      since,
      limit: 400
    });
    const startupEvents = store.listServerStartupEvents({
      serverId: server.id,
      limit: 30
    });
    const tickLagEvents = store.listServerTickLagEvents({
      serverId: server.id,
      since,
      limit: 120
    });

    const sampleCount = samples.length;
    const cpuValues = samples.map((entry) => entry.cpuPercent);
    const memoryValues = samples.map((entry) => entry.memoryMb);
    const latest = samples[0]
      ? {
          sampledAt: samples[0].sampledAt,
          cpuPercent: toFixedNumber(samples[0].cpuPercent, 1),
          memoryMb: toFixedNumber(samples[0].memoryMb, 0)
        }
      : null;
    const avgCpu = cpuValues.length > 0 ? cpuValues.reduce((sum, value) => sum + value, 0) / cpuValues.length : 0;
    const peakCpu = cpuValues.length > 0 ? Math.max(...cpuValues) : 0;
    const avgMemory = memoryValues.length > 0 ? memoryValues.reduce((sum, value) => sum + value, 0) / memoryValues.length : 0;
    const peakMemory = memoryValues.length > 0 ? Math.max(...memoryValues) : 0;

    const startupSuccessful = startupEvents.filter((entry) => entry.success === 1);
    const latestStartup = startupSuccessful[0] ?? null;
    const averageStartupMs =
      startupSuccessful.length > 0
        ? Math.round(startupSuccessful.reduce((sum, entry) => sum + entry.durationMs, 0) / startupSuccessful.length)
        : null;
    const recentStartupSlice = startupSuccessful.slice(0, 5);
    const olderStartupSlice = startupSuccessful.slice(5, 10);
    let startupTrend: "improving" | "stable" | "regressing" | "insufficient_data" = "insufficient_data";
    if (recentStartupSlice.length >= 2 && olderStartupSlice.length >= 2) {
      const recentAvg = recentStartupSlice.reduce((sum, entry) => sum + entry.durationMs, 0) / recentStartupSlice.length;
      const olderAvg = olderStartupSlice.reduce((sum, entry) => sum + entry.durationMs, 0) / olderStartupSlice.length;
      const deltaRatio = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;
      if (deltaRatio > 0.12) {
        startupTrend = "regressing";
      } else if (deltaRatio < -0.12) {
        startupTrend = "improving";
      } else {
        startupTrend = "stable";
      }
    } else if (startupSuccessful.length >= 2) {
      startupTrend = "stable";
    }

    const lagMaxMs = tickLagEvents.length > 0 ? Math.max(...tickLagEvents.map((entry) => entry.lagMs)) : 0;
    const hints: Array<{ level: "ok" | "warning" | "critical"; title: string; detail: string }> = [];
    if (sampleCount === 0) {
      hints.push({
        level: "ok",
        title: "No performance samples yet",
        detail: "Start the server and keep it running for a few minutes to build advisor trends."
      });
    } else {
      if (peakMemory > server.maxMemoryMb * 1.05) {
        hints.push({
          level: "critical",
          title: "Memory usage exceeded configured max",
          detail: `Peak memory reached ${toFixedNumber(peakMemory, 0)} MB while max allocation is ${server.maxMemoryMb} MB. Increase max memory or remove heavy mods/plugins.`
        });
      } else if (peakMemory > server.maxMemoryMb * 0.92) {
        hints.push({
          level: "warning",
          title: "Memory close to limit",
          detail: `Peak memory is ${toFixedNumber((peakMemory / server.maxMemoryMb) * 100, 0)}% of configured max. Consider +1-2 GB headroom for stability.`
        });
      } else if (avgMemory < server.maxMemoryMb * 0.45) {
        hints.push({
          level: "ok",
          title: "Memory headroom is healthy",
          detail: `Average memory usage is ${toFixedNumber(avgMemory, 0)} MB. You may be able to lower max memory to reduce host pressure.`
        });
      }

      if (peakCpu > 95) {
        hints.push({
          level: "critical",
          title: "CPU saturation detected",
          detail: `CPU peaked at ${toFixedNumber(peakCpu, 1)}%. Reduce simulation load (view/simulation distance) or use a higher-performance preset.`
        });
      } else if (avgCpu > 75) {
        hints.push({
          level: "warning",
          title: "Sustained high CPU load",
          detail: `Average CPU usage is ${toFixedNumber(avgCpu, 1)}%. Watch for TPS drops during player spikes.`
        });
      }
    }

    if (tickLagEvents.length >= 8 || lagMaxMs >= 2000) {
      hints.push({
        level: "warning",
        title: "Tick lag spikes detected",
        detail: `${tickLagEvents.length} lag events observed in the last ${hours}h (max ${lagMaxMs}ms). Reduce heavy mods/plugins or lower view distance.`
      });
    } else if (tickLagEvents.length > 0) {
      hints.push({
        level: "ok",
        title: "Minor tick lag events",
        detail: `${tickLagEvents.length} lag events detected, max ${lagMaxMs}ms. Continue monitoring under higher load.`
      });
    }

    if (startupTrend === "regressing") {
      hints.push({
        level: "warning",
        title: "Startup time trend is regressing",
        detail: "Recent starts are materially slower than earlier starts. Review newly added mods/plugins and startup scripts."
      });
    } else if (startupTrend === "improving") {
      hints.push({
        level: "ok",
        title: "Startup trend is improving",
        detail: "Recent startup times are lower than earlier runs."
      });
    } else if (averageStartupMs !== null && averageStartupMs > 45000) {
      hints.push({
        level: "warning",
        title: "Slow startup baseline",
        detail: `Average startup time is ${(averageStartupMs / 1000).toFixed(1)}s. Consider trimming mod/plugin load or increasing storage throughput.`
      });
    }

    return {
      windowHours: hours,
      sampleCount,
      metrics: {
        latest,
        cpu: {
          avgPercent: toFixedNumber(avgCpu, 1),
          peakPercent: toFixedNumber(peakCpu, 1)
        },
        memory: {
          avgMb: toFixedNumber(avgMemory, 0),
          peakMb: toFixedNumber(peakMemory, 0),
          configuredMaxMb: server.maxMemoryMb
        }
      },
      startup: {
        trend: startupTrend,
        recent: startupEvents.slice(0, 10).map((entry) => ({
          createdAt: entry.createdAt,
          durationMs: entry.durationMs,
          success: entry.success === 1,
          exitCode: entry.exitCode
        })),
        averageDurationMs: averageStartupMs,
        latestDurationMs: latestStartup?.durationMs ?? null
      },
      tickLag: {
        eventsInWindow: tickLagEvents.length,
        lastEventAt: tickLagEvents[0]?.createdAt ?? null,
        maxLagMs: lagMaxMs,
        recent: tickLagEvents.slice(0, 20).map((entry) => ({
          createdAt: entry.createdAt,
          lagMs: entry.lagMs,
          ticksBehind: entry.ticksBehind,
          line: entry.line
        }))
      },
      hints
    };
  };

  app.get("/servers", { preHandler: [authenticate] }, async () => ({ servers: store.listServers() }));

  app.post("/servers", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const payload = applyPreset(createServerSchema.parse(request.body));
    const { server, policyFindings } = await createAndProvisionServer(payload);
    writeAudit(request.user!.username, "server.create", "server", server.id, payload);
    return { server, policyFindings };
  });

  app.post("/servers/quickstart", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const parsedQuickStart = quickStartSchema.safeParse(request.body ?? {});
    if (!parsedQuickStart.success) {
      throw app.httpErrors.badRequest(parsedQuickStart.error.issues.map((issue) => issue.message).join("; "));
    }
    const payload = parsedQuickStart.data;
    const type = payload.type ?? (payload.preset === "modded" ? "fabric" : "paper");
    const hostTotalMemoryMb = Math.max(1024, Math.floor(os.totalmem() / (1024 * 1024)));
    const memoryProfile = resolveQuickStartMemoryProfile(payload.preset, hostTotalMemoryMb);
    const catalog = await deps.versions.getSetupCatalog();
    const resolvedVersion = payload.mcVersion ?? pickLatestVersionForType(catalog, type);
    if (!resolvedVersion) {
      throw app.httpErrors.internalServerError(`No compatible Minecraft versions available for ${type}`);
    }

    const createPayload = applyPreset(
      createServerSchema.parse({
        name: payload.name,
        preset: payload.preset,
        type,
        mcVersion: resolvedVersion,
        port: payload.port ?? 25565,
        bedrockPort: payload.bedrockPort ?? 19132,
        minMemoryMb: memoryProfile.minMemoryMb,
        maxMemoryMb: memoryProfile.maxMemoryMb,
        allowCracked: payload.allowCracked,
        enableGeyser: payload.preset !== "modded",
        enableFloodgate: payload.preset !== "modded"
      })
    );
    if (!createPayload.enableGeyser) {
      createPayload.bedrockPort = null;
    }

    try {
      createPayload.name = resolveUniqueServerName(
        createPayload.name,
        store.listServers().map((server) => server.name)
      );
    } catch (error) {
      throw app.httpErrors.conflict(error instanceof Error ? error.message : "Unable to generate a unique server name.");
    }

    const { server, policyFindings } = await createAndProvisionServer(createPayload);

    let blocked = false;
    let started = false;
    let preflight = null as ReturnType<PreflightService["run"]> | null;
    let warning: string | null = null;

    if (payload.startServer) {
      preflight = deps.preflight.run(server);
      const criticalIssue = preflight.issues.find((issue) => issue.severity === "critical");
      if (criticalIssue) {
        deps.alerts.createAlert(server.id, "critical", "preflight_block", criticalIssue.message);
        blocked = true;
      } else {
        for (const issue of preflight.issues.filter((issue) => issue.severity === "warning")) {
          deps.alerts.createAlert(server.id, "warning", "preflight_warning", issue.message);
        }
        try {
          await deps.runtime.start(server);
          started = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          deps.alerts.createAlert(server.id, "critical", "start_failed", message);
          warning = `Server was created, but startup failed: ${message}`;
        }
      }
    }

    let quickHostingWarning: string | null = null;
    let quickHostAddress: string | null = null;
    if (payload.publicHosting) {
      const tunnel = deps.tunnels.ensureQuickTunnel(server.id);
      const readiness = deps.tunnels.getTunnelLaunchReadiness(tunnel);
      quickHostingWarning = readiness.ok ? null : readiness.reason ?? "Tunnel dependency missing";

      if (started) {
        try {
          await deps.tunnels.startTunnel(tunnel.id);
          const syncResult = await deps.tunnels.refreshPlayitTunnelPublicEndpoint(tunnel.id);
          if (syncResult.pendingReason) {
            quickHostingWarning = quickHostingWarning ? `${quickHostingWarning}; ${syncResult.pendingReason}` : syncResult.pendingReason;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          quickHostingWarning = message;
        }
      }

      const activeTunnel = deps.tunnels
        .listTunnels(server.id)
        .find((entry) => entry.provider === "playit" || entry.status === "active");
      if (activeTunnel) {
        const hasResolvedPublicAddress = activeTunnel.publicHost !== "pending.playit.gg";
        quickHostAddress = hasResolvedPublicAddress ? `${activeTunnel.publicHost}:${String(activeTunnel.publicPort)}` : null;
        if (!hasResolvedPublicAddress && !quickHostingWarning) {
          quickHostingWarning = "Playit is still assigning a public endpoint.";
        }
      }
    }

    writeAudit(request.user!.username, "server.quickstart", "server", server.id, {
      preset: payload.preset,
      type,
      version: resolvedVersion,
      memoryMb: {
        min: createPayload.minMemoryMb,
        max: createPayload.maxMemoryMb
      },
      publicHosting: payload.publicHosting,
      startServer: payload.startServer,
      started,
      blocked,
      warning,
      quickHostingWarning
    });

    return {
      server: store.getServerById(server.id),
      policyFindings,
      started,
      blocked,
      preflight,
      warning,
      quickHosting: {
        enabled: payload.publicHosting,
        publicAddress: quickHostAddress,
        warning: quickHostingWarning
      }
    };
  });

  app.post("/servers/bulk-action", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const payload = bulkServerActionSchema.parse(request.body);
    const uniqueServerIds = [...new Set(payload.serverIds)];
    const results: Array<{
      serverId: string;
      ok: boolean;
      blocked?: boolean;
      warning?: string | null;
      message: string;
      publicAddress?: string | null;
    }> = [];

    for (const serverId of uniqueServerIds) {
      const server = store.getServerById(serverId);
      if (!server) {
        results.push({
          serverId,
          ok: false,
          message: "Server not found"
        });
        continue;
      }

      if (payload.action === "start") {
        const preflight = deps.preflight.run(server);
        const criticalIssue = preflight.issues.find((issue) => issue.severity === "critical");
        if (criticalIssue) {
          deps.alerts.createAlert(server.id, "critical", "preflight_block", criticalIssue.message);
          results.push({
            serverId: server.id,
            ok: false,
            blocked: true,
            message: `Blocked by preflight: ${criticalIssue.message}`
          });
          continue;
        }

        try {
          await deps.runtime.start(server);
          await deps.tunnels.startTunnelsForServer(server.id);
          results.push({
            serverId: server.id,
            ok: true,
            message: "Started"
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          deps.alerts.createAlert(server.id, "critical", "start_failed", message);
          results.push({
            serverId: server.id,
            ok: false,
            message: `Start failed: ${message}`
          });
        }
        continue;
      }

      if (payload.action === "stop") {
        try {
          await deps.tunnels.stopTunnelsForServer(server.id);
          await deps.runtime.stop(server.id);
          results.push({
            serverId: server.id,
            ok: true,
            message: "Stopped"
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({
            serverId: server.id,
            ok: false,
            message: `Stop failed: ${message}`
          });
        }
        continue;
      }

      if (payload.action === "restart") {
        try {
          await deps.tunnels.stopTunnelsForServer(server.id);
          await deps.runtime.restart(server);
          await deps.tunnels.startTunnelsForServer(server.id);
          results.push({
            serverId: server.id,
            ok: true,
            message: "Restarted"
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({
            serverId: server.id,
            ok: false,
            message: `Restart failed: ${message}`
          });
        }
        continue;
      }

      if (payload.action === "backup") {
        try {
          await deps.backup.createBackup(server.id);
          results.push({
            serverId: server.id,
            ok: true,
            message: "Backup created"
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({
            serverId: server.id,
            ok: false,
            message: `Backup failed: ${message}`
          });
        }
        continue;
      }

      if (payload.action === "goLive") {
        const outcome = await goLiveForServer(server);
        results.push({
          serverId: server.id,
          ok: outcome.ok,
          blocked: outcome.blocked,
          warning: outcome.warning,
          message: outcome.ok
            ? outcome.publicHosting.publicAddress
              ? "Public address ready"
              : "Go Live started; endpoint is still resolving"
            : outcome.warning ?? "Go Live failed",
          publicAddress: outcome.publicHosting.publicAddress
        });
      }
    }

    writeAudit(request.user!.username, "server.bulk_action", "server", payload.action, {
      action: payload.action,
      serverIds: uniqueServerIds,
      results
    });

    return {
      ok: results.every((entry) => entry.ok),
      action: payload.action,
      total: uniqueServerIds.length,
      succeeded: results.filter((entry) => entry.ok).length,
      failed: results.filter((entry) => !entry.ok).length,
      results
    };
  });

  app.delete("/servers/:id", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    const query = deleteServerQuerySchema.parse(request.query ?? {});
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    try {
      await deps.tunnels.stopTunnelsForServer(id);
      await deps.runtime.stop(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw app.httpErrors.conflict(`Could not stop server resources before delete: ${message}`);
    }

    const warnings: string[] = [];

    if (query.deleteBackups) {
      const backups = store.listBackups(id);
      for (const backup of backups) {
        if (!isPathInsideRoot(config.backupsDir, backup.filePath)) {
          warnings.push(`Skipped backup cleanup outside backups directory: ${backup.filePath}`);
          continue;
        }
        try {
          removeFileIfPresent(backup.filePath);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Failed to delete backup ${backup.filePath}: ${message}`);
        }
      }
    }

    store.deleteServer(id);
    deps.tasks.refresh();
    deps.backupRetention.refresh();

    if (query.deleteFiles) {
      if (!isPathInsideRoot(config.serversDir, server.rootPath)) {
        warnings.push(`Skipped server directory cleanup outside servers directory: ${server.rootPath}`);
      } else {
        try {
          removeFileIfPresent(server.rootPath);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          warnings.push(`Failed to delete server directory ${server.rootPath}: ${message}`);
        }
      }
    }

    writeAudit(request.user!.username, "server.delete", "server", id, {
      deleteFiles: query.deleteFiles,
      deleteBackups: query.deleteBackups,
      warnings
    });

    return {
      ok: true,
      deleted: {
        serverId: id,
        deleteFiles: query.deleteFiles,
        deleteBackups: query.deleteBackups
      },
      warnings
    };
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
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

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

  app.post("/servers/:id/safe-restart", { preHandler: [authenticate, requireRole("admin")] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    try {
      if (deps.runtime.isRunning(id) || server.status === "running" || server.status === "starting") {
        await deps.tunnels.stopTunnelsForServer(id);
        await deps.runtime.stop(id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(409).send({
        ok: false,
        error: `Failed to stop running server before safe restart: ${message}`
      });
    }

    const refreshedServer = store.getServerById(id);
    if (!refreshedServer) {
      throw app.httpErrors.notFound("Server not found");
    }

    const preflight = deps.preflight.run(refreshedServer);
    const criticalIssue = preflight.issues.find((issue) => issue.severity === "critical");
    if (criticalIssue) {
      deps.alerts.createAlert(refreshedServer.id, "critical", "preflight_block", criticalIssue.message);
      return {
        ok: false,
        blocked: true,
        preflight
      };
    }

    for (const issue of preflight.issues.filter((issue) => issue.severity === "warning")) {
      deps.alerts.createAlert(refreshedServer.id, "warning", "preflight_warning", issue.message);
    }

    try {
      await deps.runtime.start(refreshedServer);
      await deps.tunnels.startTunnelsForServer(refreshedServer.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.alerts.createAlert(refreshedServer.id, "critical", "safe_restart_failed", message);
      return reply.code(500).send({ ok: false, error: `Safe restart failed: ${message}` });
    }

    writeAudit(request.user!.username, "server.safe_restart", "server", id, {
      mode: "stop_preflight_start"
    });

    return {
      ok: true,
      blocked: false,
      preflight
    };
  });

  app.post("/servers/:id/go-live", { preHandler: [authenticate, requireRole("admin")] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const outcome = await goLiveForServer(server);
    if (!outcome.ok && !outcome.blocked && outcome.warning?.startsWith("Failed to start server:")) {
      return reply.code(500).send({
        ok: false,
        blocked: false,
        preflight: outcome.preflight,
        error: outcome.warning
      });
    }

    writeAudit(request.user!.username, "server.go_live", "server", id, {
      tunnelId: outcome.publicHosting.tunnel?.id ?? null,
      quickHostReady: outcome.publicHosting.quickHostReady,
      publicAddress: outcome.publicHosting.publicAddress,
      warning: outcome.warning
    });

    return outcome;
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

  app.get("/servers/:id/performance/advisor", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const query = performanceAdvisorQuerySchema.parse(request.query);
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    return {
      server: {
        id: server.id,
        name: server.name,
        status: server.status,
        maxMemoryMb: server.maxMemoryMb
      },
      advisor: buildPerformanceAdvisor(server, query.hours)
    };
  });

  app.post("/servers/:id/preflight/repair-core", { preHandler: [authenticate, requireRole("admin")] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    if (deps.runtime.isRunning(id) || server.status === "running" || server.status === "starting") {
      return reply.code(409).send({ error: "Server must be stopped before running repair actions" });
    }

    const repaired = await deps.setup.repairCoreFiles(server);
    const preflight = deps.preflight.run(server);
    writeAudit(request.user!.username, "server.preflight.repair_core", "server", id, repaired);
    return {
      repaired: repaired.repaired,
      preflight
    };
  });

  app.get("/servers/:id/support-bundle", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const report = deps.preflight.run(server);
    const logs = deps.consoleHub.getHistory(id).slice(-500);
    const crashes = deps.crashReports.list(id).slice(0, 10);
    const tunnels = deps.tunnels.listTunnels(id);
    return {
      generatedAt: new Date().toISOString(),
      server: {
        id: server.id,
        name: server.name,
        status: server.status,
        type: server.type,
        mcVersion: server.mcVersion,
        port: server.port,
        bedrockPort: server.bedrockPort,
        javaPath: server.javaPath,
        rootPath: server.rootPath
      },
      preflight: report,
      tunnels: tunnels.map((tunnel) => ({
        id: tunnel.id,
        provider: tunnel.provider,
        status: tunnel.status,
        localPort: tunnel.localPort,
        publicAddress: `${tunnel.publicHost}:${String(tunnel.publicPort)}`
      })),
      crashReports: crashes,
      recentLogs: logs
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

  app.get("/servers/:id/editor/files", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    return {
      files: listEditableFiles(server.rootPath)
    };
  });

  app.get("/servers/:id/editor/file", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const query = editorFileQuerySchema.parse(request.query);
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const resolved = resolveEditorFilePath(server.rootPath, query.path);
    if (!fs.existsSync(resolved.absolutePath)) {
      return {
        path: resolved.relativePath,
        content: "",
        exists: false
      };
    }

    const stats = fs.statSync(resolved.absolutePath);
    if (!stats.isFile()) {
      throw app.httpErrors.badRequest("Requested path is not a file");
    }

    if (stats.size > maxEditableFileBytes) {
      throw app.httpErrors.badRequest(`File is larger than ${Math.floor(maxEditableFileBytes / 1024)} KB editor limit`);
    }

    return {
      path: resolved.relativePath,
      content: fs.readFileSync(resolved.absolutePath, "utf8"),
      exists: true
    };
  });

  app.get("/servers/:id/editor/file/snapshots", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const query = editorFileSnapshotsQuerySchema.parse(request.query);
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const resolved = resolveEditorFilePath(server.rootPath, query.path);
    const snapshots = store.listEditorFileSnapshots({
      serverId: server.id,
      path: resolved.relativePath,
      limit: query.limit
    });

    return {
      path: resolved.relativePath,
      snapshots: snapshots.map((snapshot) => ({
        id: snapshot.id,
        path: snapshot.path,
        reason: snapshot.reason,
        createdAt: snapshot.createdAt
      }))
    };
  });

  app.put("/servers/:id/editor/file", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = editorWriteSchema.parse(request.body);
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const resolved = resolveEditorFilePath(server.rootPath, body.path);
    const fileSize = Buffer.byteLength(body.content, "utf8");
    if (fileSize > maxEditableFileBytes) {
      throw app.httpErrors.badRequest(`File content exceeds ${Math.floor(maxEditableFileBytes / 1024)} KB editor limit`);
    }

    if (fs.existsSync(resolved.absolutePath)) {
      const existingStats = fs.statSync(resolved.absolutePath);
      if (existingStats.isFile() && existingStats.size <= maxEditableFileBytes) {
        const existingContent = fs.readFileSync(resolved.absolutePath, "utf8");
        if (existingContent !== body.content) {
          store.createEditorFileSnapshot({
            serverId: server.id,
            path: resolved.relativePath,
            content: existingContent,
            reason: "before_save"
          });
          store.pruneEditorFileSnapshots({
            serverId: server.id,
            path: resolved.relativePath,
            keep: 40
          });
        }
      }
    }

    fs.mkdirSync(path.dirname(resolved.absolutePath), { recursive: true });
    fs.writeFileSync(resolved.absolutePath, body.content, "utf8");

    writeAudit(request.user!.username, "server.editor_file.update", "server", id, {
      path: resolved.relativePath,
      sizeBytes: fileSize
    });

    return { ok: true, path: resolved.relativePath };
  });

  app.post("/servers/:id/editor/file/rollback", { preHandler: [authenticate, requireRole("admin")] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = editorRollbackSchema.parse(request.body);
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const resolved = resolveEditorFilePath(server.rootPath, body.path);
    const snapshot = body.snapshotId
      ? store.getEditorFileSnapshot(body.snapshotId)
      : store.listEditorFileSnapshots({
          serverId: server.id,
          path: resolved.relativePath,
          limit: 1
        })[0];

    if (!snapshot || snapshot.serverId !== server.id || snapshot.path !== resolved.relativePath) {
      return reply.code(404).send({ error: "Snapshot not found for this file" });
    }

    if (fs.existsSync(resolved.absolutePath)) {
      const existingStats = fs.statSync(resolved.absolutePath);
      if (existingStats.isFile() && existingStats.size <= maxEditableFileBytes) {
        const existingContent = fs.readFileSync(resolved.absolutePath, "utf8");
        if (existingContent !== snapshot.content) {
          store.createEditorFileSnapshot({
            serverId: server.id,
            path: resolved.relativePath,
            content: existingContent,
            reason: "before_rollback"
          });
        }
      }
    }

    fs.mkdirSync(path.dirname(resolved.absolutePath), { recursive: true });
    fs.writeFileSync(resolved.absolutePath, snapshot.content, "utf8");
    store.pruneEditorFileSnapshots({
      serverId: server.id,
      path: resolved.relativePath,
      keep: 40
    });

    writeAudit(request.user!.username, "server.editor_file.rollback", "server", id, {
      path: resolved.relativePath,
      snapshotId: snapshot.id
    });

    return {
      ok: true,
      path: resolved.relativePath,
      restoredSnapshotId: snapshot.id
    };
  });

  app.post("/servers/:id/editor/file/diff", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = editorDiffSchema.parse(request.body);
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const resolved = resolveEditorFilePath(server.rootPath, body.path);
    const current = fs.existsSync(resolved.absolutePath) ? fs.readFileSync(resolved.absolutePath, "utf8") : "";
    return {
      path: resolved.relativePath,
      diff: buildSimpleDiff(current, body.nextContent)
    };
  });

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
        const syncResult = await deps.tunnels.refreshPlayitTunnelPublicEndpoint(tunnel.id);
        if (syncResult.pendingReason) {
          warning = warning ? `${warning}; ${syncResult.pendingReason}` : syncResult.pendingReason;
        }
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

  app.get("/servers/:id/public-hosting/diagnostics", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const tunnels = deps.tunnels.listTunnels(id);
    const tunnel = tunnels.find((entry) => entry.provider === "playit") ?? tunnels[0] ?? null;
    if (!tunnel) {
      return {
        diagnostics: null,
        actions: ["Enable quick hosting to create and diagnose a tunnel."],
        fixes: [
          {
            id: "enable_quick_hosting",
            label: "Enable Quick Hosting",
            description: "Create the managed Playit tunnel for this server."
          }
        ]
      };
    }

    if (tunnel.provider === "playit") {
      await deps.tunnels.refreshPlayitTunnelPublicEndpoint(tunnel.id).catch(() => ({ synced: false }));
    }

    const diagnostics = await deps.tunnels.getTunnelDiagnostics(tunnel.id);
    const actions: string[] = [];
    if (diagnostics?.provider === "playit") {
      if (!diagnostics.commandAvailable) {
        actions.push("Install or allow SimpleServers to manage the playit binary.");
      }
      if (diagnostics.authConfigured === false) {
        actions.push("Paste your Playit secret from the Playit dashboard, or launch playit once and complete agent auth.");
      }
      if (!diagnostics.endpointAssigned) {
        actions.push("Keep the app running while playit assigns a public endpoint.");
      }
    }

    const fixes: Array<{ id: string; label: string; description: string }> = [];
    if (server.status !== "running" && server.status !== "starting") {
      fixes.push({
        id: "start_server",
        label: "Start Server",
        description: "Tunnel provisioning completes faster once the server is running."
      });
    }
    if (diagnostics?.provider === "playit" && !diagnostics.commandAvailable) {
      fixes.push({
        id: "start_tunnel",
        label: "Install and Start Tunnel",
        description: "Attempt to auto-install Playit and launch the tunnel."
      });
    }
    if (
      diagnostics &&
      (diagnostics.status === "error" ||
        diagnostics.status === "pending" ||
        (diagnostics.provider === "playit" && !diagnostics.endpointAssigned))
    ) {
      fixes.push({
        id: "restart_tunnel",
        label: "Restart Tunnel Agent",
        description: "Restart the tunnel process to recover from stale or broken sessions."
      });
    }
    if (diagnostics?.provider === "playit" && diagnostics.authConfigured === false) {
      fixes.push({
        id: "set_playit_secret",
        label: "Set Playit Secret",
        description: "Paste your Playit agent secret once so endpoint sync can authenticate."
      });
      fixes.push({
        id: "copy_playit_auth_steps",
        label: "Copy Auth Steps",
        description: "Copy the exact steps needed to authenticate the Playit agent."
      });
    }
    if (diagnostics && !diagnostics.endpointAssigned) {
      fixes.push({
        id: "refresh_diagnostics",
        label: "Retry Endpoint Check",
        description: "Run tunnel diagnostics again and force an endpoint sync attempt."
      });
      fixes.push({
        id: "go_live_recovery",
        label: "Run Go Live Recovery",
        description: "Run start + quick-host activation + endpoint sync in one guided flow."
      });
    }

    return {
      diagnostics,
      actions,
      fixes
    };
  });

  app.get("/servers/:id/public-hosting/status", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const existingTunnels = deps.tunnels.listTunnels(id);
    await Promise.all(
      existingTunnels
        .filter((tunnel) => tunnel.provider === "playit")
        .map((tunnel) =>
          deps.tunnels.refreshPlayitTunnelPublicEndpoint(tunnel.id).catch(() => ({
            synced: false
          }))
        )
    );

    const tunnels = deps.tunnels.listTunnels(id);
    const activeTunnel = tunnels.find((tunnel) => tunnel.status === "active") ?? tunnels[0] ?? null;
    const readiness = activeTunnel ? deps.tunnels.getTunnelLaunchReadiness(activeTunnel) : null;
    const localAddress = `127.0.0.1:${String(server.port)}`;
    const hasResolvedPublicAddress = Boolean(activeTunnel && activeTunnel.publicHost !== "pending.playit.gg");
    return {
      server: {
        id: server.id,
        name: server.name,
        status: server.status,
        localAddress
      },
      quickHostReady: Boolean(activeTunnel && readiness?.ok && hasResolvedPublicAddress),
      publicAddress: hasResolvedPublicAddress ? `${activeTunnel!.publicHost}:${String(activeTunnel!.publicPort)}` : null,
      tunnel: activeTunnel,
      steps: activeTunnel
        ? readiness?.ok && hasResolvedPublicAddress
          ? ["Share the public address with players.", "Keep this app running while hosting."]
          : [
              hasResolvedPublicAddress ? readiness?.reason ?? "Tunnel dependency missing." : "Playit is still assigning a public endpoint.",
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

  app.post("/telemetry/events", { preHandler: [authenticate] }, async (request) => {
    const payload = telemetryEventSchema.parse(request.body ?? {});
    const event = store.createUxTelemetryEvent({
      sessionId: payload.sessionId,
      event: payload.event,
      metadata: payload.metadata ?? {}
    });
    return { eventId: event.id };
  });

  app.get("/telemetry/funnel", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const query = telemetryFunnelQuerySchema.parse(request.query ?? {});
    const since = new Date(Date.now() - query.hours * 60 * 60 * 1000).toISOString();
    const events = store.listUxTelemetryEvents({ since, limit: 10000 }).reverse();
    const stageEvents = ["ui.connect.success", "server.create.success", "server.start.success", "hosting.public.ready"] as const;

    const bySession = new Map<string, Set<string>>();
    for (const event of events) {
      if (!stageEvents.includes(event.event as (typeof stageEvents)[number])) {
        continue;
      }
      const reached = bySession.get(event.sessionId) ?? new Set<string>();
      reached.add(event.event);
      bySession.set(event.sessionId, reached);
    }

    const sessions = Array.from(bySession.values());
    const stageTotals = {
      connect: sessions.filter((stage) => stage.has("ui.connect.success")).length,
      create: sessions.filter((stage) => stage.has("server.create.success")).length,
      start: sessions.filter((stage) => stage.has("server.start.success")).length,
      publicReady: sessions.filter((stage) => stage.has("hosting.public.ready")).length
    };

    const connectBase = Math.max(1, stageTotals.connect);
    const createBase = Math.max(1, stageTotals.create);
    const startBase = Math.max(1, stageTotals.start);

    return {
      windowHours: query.hours,
      sessionsObserved: bySession.size,
      stageTotals,
      conversion: {
        createFromConnectPct: Math.round((stageTotals.create / connectBase) * 100),
        startFromCreatePct: Math.round((stageTotals.start / createBase) * 100),
        publicReadyFromStartPct: Math.round((stageTotals.publicReady / startBase) * 100)
      },
      recentEvents: events.slice(-100)
    };
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

  app.post("/tunnels/:id/playit/secret", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = playitSecretSchema.parse(request.body);
    const tunnel = store.getTunnel(id);
    if (!tunnel) {
      throw app.httpErrors.notFound("Tunnel not found");
    }
    if (tunnel.provider !== "playit") {
      throw app.httpErrors.badRequest("Tunnel is not playit-backed");
    }

    const normalizedSecret = normalizePlayitSecretInput(payload.secret);
    if (!normalizedSecret) {
      throw app.httpErrors.badRequest("Could not parse a valid Playit secret from input");
    }

    fs.mkdirSync(playitSecretsDir, { recursive: true });
    const secretPath = path.join(playitSecretsDir, `${tunnel.id}.secret`);
    fs.writeFileSync(secretPath, `${normalizedSecret}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    try {
      fs.chmodSync(secretPath, 0o600);
    } catch {
      // best-effort permission hardening on platforms without chmod semantics.
    }

    const updatedTunnel = deps.tunnels.setPlayitSecretPath(id, secretPath);
    const sync = await deps.tunnels.refreshPlayitTunnelPublicEndpoint(updatedTunnel.id).catch(() => ({ synced: false }));
    writeAudit(request.user!.username, "tunnel.playit.secret.set", "tunnel", id, {
      tunnelId: id,
      configured: true,
      synced: sync.synced
    });

    return {
      ok: true,
      tunnelId: updatedTunnel.id,
      provider: updatedTunnel.provider,
      synced: sync.synced
    };
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
    version: APP_VERSION,
    dataDir: config.dataDir
  }));

  app.get("/roles", async () => ({
    roles: ["owner", "admin", "moderator", "viewer"] satisfies UserRole[]
  }));
}
