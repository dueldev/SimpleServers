import crypto from "node:crypto";
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
import { ReliabilityService } from "../services/reliability-service.js";
import { PlayerAdminService } from "../services/player-admin-service.js";
import { MigrationService } from "../services/migration-service.js";

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
const APP_VERSION = "0.5.8";
const PLAYIT_CONSENT_VERSION = "playit-terms-v1";
const REPOSITORY_URL = "https://github.com/dueldev/SimpleServers";
const SETUP_SESSION_TTL_MS = 15 * 60 * 1000;
const WORKSPACE_SUMMARY_WINDOW_HOURS = 6;

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
  preset: z.enum(["custom", "survival", "modded", "minigame"]).default("custom"),
  rootPath: z.string().trim().min(1).max(1024).optional()
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
  allowCracked: z.boolean().default(false),
  memoryPreset: z.enum(["small", "recommended", "large"]).default("recommended"),
  savePath: z.string().trim().min(1).max(1024).optional(),
  worldImportPath: z.string().trim().min(1).max(1024).optional()
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
  protocol: z.enum(["tcp", "udp"]).optional(),
  provider: z.enum(["playit", "cloudflared", "ngrok", "manual"]).optional()
});

const publicHostingSettingsUpdateSchema = z.object({
  autoEnable: z.boolean().optional(),
  defaultProvider: z.enum(["playit", "cloudflared", "ngrok", "manual"]).optional(),
  consentAccepted: z.boolean().optional(),
  consentVersion: z.string().trim().min(3).max(128).optional()
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

const installPackageBatchSchema = z.object({
  items: z
    .array(
      z.object({
        provider: z.enum(["modrinth", "curseforge"]).optional(),
        projectId: z.string().min(1),
        requestedVersionId: z.string().optional(),
        kind: z.enum(["plugin"]).default("plugin")
      })
    )
    .min(1)
    .max(50)
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
  action: z.enum(["start", "stop", "restart", "backup", "goLive", "delete"])
});

const performanceAdvisorQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(24 * 14).default(24)
});

const reliabilityQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(24 * 30).default(24 * 7),
  serverId: z.string().min(4).optional()
});

const cloudDestinationSchema = z.object({
  provider: z.enum(["s3", "backblaze", "google_drive"]),
  name: z.string().trim().min(2).max(80),
  encryptionPassphrase: z.string().min(12).max(512),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown())
});

const cloudDestinationUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  encryptionPassphrase: z.string().min(12).max(512),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown())
});

const uploadCloudBackupSchema = z.object({
  destinationId: z.string().min(4)
});

const playerIdentitySchema = z.object({
  name: z.string().trim().min(2).max(32),
  uuid: z.string().trim().min(2).max(128).optional()
});

const playerOpSchema = playerIdentitySchema.extend({
  level: z.number().int().min(1).max(4).default(4),
  bypassesPlayerLimit: z.boolean().default(true)
});

const playerBanSchema = playerIdentitySchema.extend({
  reason: z.string().trim().min(1).max(200).optional(),
  expires: z.string().trim().max(80).optional()
});

const removePlayerSchema = z.object({
  nameOrUuid: z.string().trim().min(2).max(128)
});

const banIpSchema = z.object({
  ip: z.string().trim().min(3).max(128),
  reason: z.string().trim().min(1).max(200).optional(),
  expires: z.string().trim().max(80).optional()
});

const unbanIpSchema = z.object({
  ip: z.string().trim().min(3).max(128)
});

const playerHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(400).default(150)
});

const playerAdminActionSchema = z.object({
  action: z.enum(["op", "deop", "whitelist", "unwhitelist", "ban", "unban"]),
  name: z.string().trim().min(2).max(32),
  uuid: z.string().trim().min(2).max(128).optional(),
  reason: z.string().trim().min(1).max(200).optional()
});

const modpackPlanSchema = z.object({
  provider: z.enum(["modrinth", "curseforge"]),
  projectId: z.string().min(1),
  requestedVersionId: z.string().optional()
});

const modpackRollbackSchema = z.object({
  rollbackId: z.string().min(4)
});

const migrationManualSchema = z.object({
  name: z.string().trim().min(2).max(80),
  type: z.enum(["vanilla", "paper", "fabric"]),
  mcVersion: z.string().trim().min(3).max(40),
  rootPath: z.string().trim().min(1).max(2048),
  port: z.number().int().min(1024).max(65535).default(25565),
  bedrockPort: z.number().int().min(1024).max(65535).nullable().optional(),
  minMemoryMb: z.number().int().min(256).max(32768).default(1024),
  maxMemoryMb: z.number().int().min(512).max(65536).default(4096),
  javaPath: z.string().trim().min(1).max(1024).optional(),
  jarPath: z.string().trim().min(1).max(2048).optional()
});

const migrationPlatformManifestSchema = z.object({
  manifestPath: z.string().trim().min(1).max(2048),
  javaPath: z.string().trim().min(1).max(1024).optional()
});

const auditExportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
  limit: z.coerce.number().int().min(1).max(5000).default(1000)
});

const checksumVerifySchema = z.object({
  filePath: z.string().trim().min(1).max(4096),
  expectedSha256: z.string().trim().regex(/^[a-fA-F0-9]{64}$/).optional()
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

function resolveUniqueServerRootPathInDir(name: string, parentDir: string): string {
  const base = sanitizeServerDirName(name);
  if (!base) {
    throw new Error("Server name must contain at least one letter or number");
  }

  const existing = new Set(
    store
      .listServers()
      .map((server) => server.rootPath)
      .filter((rootPath) => path.dirname(rootPath) === parentDir)
      .map((serverPath) => path.basename(serverPath))
  );
  let candidate = base;
  let sequence = 1;
  while (existing.has(candidate) || fs.existsSync(path.join(parentDir, candidate))) {
    candidate = `${base}-${String(sequence).padStart(2, "0")}`;
    sequence += 1;
  }
  return path.join(parentDir, candidate);
}

function resolveUniqueServerRootPath(name: string): string {
  return resolveUniqueServerRootPathInDir(name, config.serversDir);
}

function resolveRequestedServerRootPath(name: string, requestedSavePath: string): string {
  const requested = requestedSavePath.trim();
  if (!requested) {
    return resolveUniqueServerRootPath(name);
  }

  const resolvedParent = path.resolve(requested);
  fs.mkdirSync(resolvedParent, { recursive: true });
  return resolveUniqueServerRootPathInDir(name, resolvedParent);
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
  totalMemoryMb: number,
  memoryPreset: "small" | "recommended" | "large" = "recommended"
): { minMemoryMb: number; maxMemoryMb: number } {
  const baseline =
    preset === "modded" ? { minMemoryMb: 4096, maxMemoryMb: 8192 } : preset === "minigame" ? { minMemoryMb: 3072, maxMemoryMb: 6144 } : { minMemoryMb: 2048, maxMemoryMb: 4096 };

  const presetScale = memoryPreset === "small" ? 0.75 : memoryPreset === "large" ? 1.25 : 1;
  const scaledBaseline = {
    minMemoryMb: Math.max(1024, Math.round(baseline.minMemoryMb * presetScale)),
    maxMemoryMb: Math.max(1536, Math.round(baseline.maxMemoryMb * presetScale))
  };

  // Keep allocations conservative to avoid host thrashing on smaller systems.
  const cap = Math.max(2048, Math.floor(totalMemoryMb * 0.5));
  const boundedMax = Math.min(scaledBaseline.maxMemoryMb, cap);
  const boundedMin = Math.min(scaledBaseline.minMemoryMb, Math.max(1024, Math.floor(boundedMax * 0.6)));

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

function redactedCloudConfig(configValue: unknown): Record<string, unknown> {
  if (!configValue || typeof configValue !== "object") {
    return {};
  }
  const source = configValue as Record<string, unknown>;
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    const normalized = key.toLowerCase();
    if (
      normalized.includes("secret") ||
      normalized.includes("token") ||
      normalized.includes("password") ||
      normalized.includes("accesskey") ||
      normalized.includes("keyid")
    ) {
      redacted[key] = "***";
      continue;
    }
    redacted[key] = value;
  }
  return redacted;
}

function sanitizeCloudDestination(destination: {
  id: string;
  serverId: string;
  provider: string;
  name: string;
  configJson: string;
  enabled: number;
  createdAt: string;
  updatedAt: string;
}) {
  let parsedConfig: Record<string, unknown> = {};
  try {
    parsedConfig = JSON.parse(destination.configJson) as Record<string, unknown>;
  } catch {
    parsedConfig = {};
  }
  return {
    id: destination.id,
    serverId: destination.serverId,
    provider: destination.provider,
    name: destination.name,
    enabled: destination.enabled,
    createdAt: destination.createdAt,
    updatedAt: destination.updatedAt,
    config: redactedCloudConfig(parsedConfig)
  };
}

async function sha256ForFile(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk as Buffer));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  return hash.digest("hex");
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
    reliability: ReliabilityService;
    playerAdmin: PlayerAdminService;
    migration: MigrationService;
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

  app.post("/setup/sessions", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const parsedQuickStart = quickStartSchema.safeParse(request.body ?? {});
    if (!parsedQuickStart.success) {
      throw app.httpErrors.badRequest(parsedQuickStart.error.issues.map((issue) => issue.message).join("; "));
    }

    const session = createSetupSession(parsedQuickStart.data, request.user!.username);
    writeAudit(request.user!.username, "setup.session.create", "server", session.id, {
      expiresAt: session.expiresAt
    });
    return {
      session: {
        id: session.id,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt
      }
    };
  });

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

  app.get("/system/capabilities", { preHandler: [authenticate] }, async (request) => {
    const role = request.user!.role;
    return {
      user: {
        id: request.user!.id,
        username: request.user!.username,
        role
      },
      capabilities: buildCapabilities(role)
    };
  });

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
        repository: REPOSITORY_URL,
        signedRelease: signatureStatus === "signed",
        signingMethod: process.env.SIMPLESERVERS_BUILD_SIGNING_METHOD ?? null
      },
      verification: {
        checksumUrl: process.env.SIMPLESERVERS_RELEASE_CHECKSUM_URL ?? null,
        attestationUrl: process.env.SIMPLESERVERS_RELEASE_ATTESTATION_URL ?? null,
        sbomUrl: process.env.SIMPLESERVERS_RELEASE_SBOM_URL ?? null,
        checksumVerificationEnabled: Boolean(process.env.SIMPLESERVERS_RELEASE_CHECKSUM_URL)
      },
      attestations: {
        predicateType: process.env.SIMPLESERVERS_RELEASE_ATTESTATION_PREDICATE ?? "https://slsa.dev/provenance/v1",
        issuer: process.env.SIMPLESERVERS_RELEASE_ATTESTATION_ISSUER ?? null
      },
      security: {
        localOnlyByDefault: true,
        authModel: "token-rbac",
        auditTrailEnabled: true,
        remoteControlEnabled: remote.enabled,
        remoteTokenRequired: remote.requireToken,
        configuredRemoteToken: remote.configuredToken,
        allowedOrigins: remote.allowedOrigins
      },
      exports: {
        auditExportFormats: ["json", "csv"],
        auditExportEndpoint: "/audit/export"
      }
    };
  });

  app.post("/system/trust/verify-checksum", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const payload = checksumVerifySchema.parse(request.body ?? {});
    const resolved = path.resolve(payload.filePath);
    if (!fs.existsSync(resolved)) {
      throw app.httpErrors.notFound("File not found for checksum verification");
    }
    const sha256 = await sha256ForFile(resolved);
    return {
      filePath: resolved,
      sha256,
      matchesExpected: payload.expectedSha256 ? sha256.toLowerCase() === payload.expectedSha256.toLowerCase() : null
    };
  });

  app.get("/system/reliability", { preHandler: [authenticate] }, async (request) => {
    const query = reliabilityQuerySchema.parse(request.query ?? {});
    if (query.serverId && !store.getServerById(query.serverId)) {
      throw app.httpErrors.notFound("Server not found");
    }
    return deps.reliability.buildDashboard({
      hours: query.hours,
      serverId: query.serverId
    });
  });

  app.get("/system/bedrock-strategy", { preHandler: [authenticate] }, async () => {
    return {
      selectedStrategy: "java_geyser_floodgate_crossplay",
      nativeBedrockSupport: false,
      oneClickCrossplay: {
        available: true,
        serverType: "paper",
        toggles: {
          enableGeyser: true,
          enableFloodgate: true
        },
        limits: [
          "Requires Java Edition server runtime (Paper).",
          "Some Java-only plugins/mods can break Bedrock parity.",
          "Bedrock feature parity is managed through Geyser/Floodgate compatibility."
        ]
      },
      recommendation: "Use Paper + Geyser + Floodgate one-click crossplay for mixed Java/Bedrock players."
    };
  });

  app.get("/system/hardening-checklist", { preHandler: [authenticate] }, async () => {
    const owner = store.listUsers().find((user) => user.role === "owner");
    const ownerTokenIsDefault = owner?.apiToken === "simpleservers-dev-admin-token";
    const remote = deps.remoteControl.getStatus();
    const hasAnyCloudDestination = store
      .listServers()
      .some((server) => store.listCloudBackupDestinations(server.id).length > 0);
    const startupEvents = store
      .listServers()
      .flatMap((server) => store.listServerStartupEvents({ serverId: server.id, limit: 200 }))
      .filter((entry) => entry.success === 1)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return {
      quickLocalMode: {
        enabled: true,
        description: "Start locally with minimal security setup, then apply hardening after your first successful launch.",
        firstSuccessfulLaunchAt: startupEvents[0]?.createdAt ?? null
      },
      hardeningSteps: [
        {
          id: "rotate_owner_token",
          title: "Rotate default owner token",
          done: !ownerTokenIsDefault,
          detail: ownerTokenIsDefault
            ? "Owner token is still the development default."
            : "Owner token has been rotated from the default value."
        },
        {
          id: "configure_cloud_backup_destination",
          title: "Configure encrypted cloud backup destination",
          done: hasAnyCloudDestination,
          detail: hasAnyCloudDestination
            ? "At least one cloud destination is configured."
            : "No cloud backup destinations configured yet."
        },
        {
          id: "remote_control_review",
          title: "Review remote control policy",
          done: !remote.enabled || (remote.requireToken && remote.allowedOrigins.length > 0),
          detail: remote.enabled
            ? remote.requireToken
              ? remote.allowedOrigins.length > 0
                ? "Remote control is enabled with token and origin restrictions."
                : "Remote control is enabled, but allowed origins are not configured."
              : "Remote control is enabled without remote token enforcement."
            : "Remote control is disabled (safe local default)."
        },
        {
          id: "signed_release_validation",
          title: "Validate signed release + checksum",
          done: (process.env.SIMPLESERVERS_BUILD_SIGNATURE_STATUS ?? "") === "signed",
          detail:
            (process.env.SIMPLESERVERS_BUILD_SIGNATURE_STATUS ?? "") === "signed"
              ? "Release metadata reports signed build status."
              : "Current build metadata does not indicate a signed release."
        }
      ]
    };
  });

  const roleRank: Record<UserRole, number> = {
    viewer: 10,
    moderator: 20,
    admin: 30,
    owner: 40
  };

  const capabilityRoleThresholds: Record<string, UserRole> = {
    serverLifecycle: "moderator",
    serverCreate: "admin",
    advancedWorkspace: "admin",
    contentInstall: "admin",
    tunnelManage: "admin",
    userManage: "owner",
    remoteConfig: "owner",
    auditRead: "admin",
    trustRead: "viewer",
    telemetryRead: "admin"
  };

  function buildCapabilities(role: UserRole): Record<string, boolean> {
    const capabilities: Record<string, boolean> = {};
    for (const [capability, minRole] of Object.entries(capabilityRoleThresholds)) {
      capabilities[capability] = roleRank[role] >= roleRank[minRole];
    }
    return capabilities;
  }

  type SetupSessionRecord = {
    id: string;
    payload: z.infer<typeof quickStartSchema>;
    createdAt: string;
    expiresAt: string;
    createdBy: string;
  };

  const setupSessions = new Map<string, SetupSessionRecord>();

  const pruneSetupSessions = (): void => {
    const nowMs = Date.now();
    for (const [sessionId, session] of setupSessions.entries()) {
      if (new Date(session.expiresAt).getTime() <= nowMs) {
        setupSessions.delete(sessionId);
      }
    }
  };

  const createSetupSession = (
    payload: z.infer<typeof quickStartSchema>,
    createdBy: string
  ): SetupSessionRecord => {
    pruneSetupSessions();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SETUP_SESSION_TTL_MS).toISOString();
    const session: SetupSessionRecord = {
      id: crypto.randomUUID(),
      payload,
      createdAt,
      expiresAt,
      createdBy
    };
    setupSessions.set(session.id, session);
    return session;
  };

  const consumeSetupSession = (sessionId: string): SetupSessionRecord => {
    pruneSetupSessions();
    const session = setupSessions.get(sessionId);
    if (!session) {
      throw app.httpErrors.notFound("Setup session not found");
    }
    setupSessions.delete(sessionId);
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      throw app.httpErrors.badRequest("Setup session has expired. Start the wizard again.");
    }
    return session;
  };

  const loadQuickHostingSnapshot = async (serverId: string) => {
    const server = store.getServerById(serverId);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const hostingSettings = store.getServerPublicHostingSettings(server.id);

    const existingTunnels = deps.tunnels.listTunnels(serverId);
    await Promise.all(
      existingTunnels
        .filter((tunnel) => tunnel.provider === "playit")
        .map((tunnel) =>
          deps.tunnels.refreshPlayitTunnelPublicEndpoint(tunnel.id).catch(() => ({
            synced: false
          }))
        )
    );

    const tunnels = deps.tunnels.listTunnels(serverId);
    const preferredTunnel = tunnels.find((tunnel) => tunnel.provider === hostingSettings.defaultProvider) ?? null;
    const activeTunnel =
      tunnels.find((tunnel) => tunnel.status === "active" && tunnel.provider === hostingSettings.defaultProvider) ??
      preferredTunnel ??
      tunnels.find((tunnel) => tunnel.status === "active") ??
      tunnels[0] ??
      null;
    const readiness = activeTunnel ? deps.tunnels.getTunnelLaunchReadiness(activeTunnel) : null;
    const hasResolvedPublicAddress = isTunnelEndpointResolved(activeTunnel);
    const publicAddress =
      activeTunnel && hasResolvedPublicAddress ? `${activeTunnel.publicHost}:${String(activeTunnel.publicPort)}` : null;
    const diagnostics = activeTunnel ? await deps.tunnels.getTunnelDiagnostics(activeTunnel) : null;

    const steps = activeTunnel
      ? readiness?.ok && hasResolvedPublicAddress
        ? ["Share the public address with players.", "Keep this app running while hosting."]
        : [
            hasResolvedPublicAddress
              ? readiness?.reason ?? "Tunnel dependency missing."
              : activeTunnel.provider === "playit"
                ? "Playit is still assigning a public endpoint."
                : `${activeTunnel.provider} endpoint is still resolving.`,
            "Start your server to let SimpleServers provision tunnel dependencies automatically, or install the client manually."
          ]
      : hostingSettings.defaultProvider === "playit" && hostingSettings.consentVersion !== PLAYIT_CONSENT_VERSION
        ? [
            "Accept Playit terms to enable public hosting on this server.",
            "Enable quick hosting and start your server.",
            "Share the public address once it is active."
          ]
      : [
          "Enable quick hosting to avoid manual port forwarding.",
          "Start your server to activate your public tunnel.",
          "Share the public address once it is active."
        ];

    return {
      server,
      hostingSettings,
      activeTunnel,
      readiness,
      hasResolvedPublicAddress,
      publicAddress,
      diagnostics,
      steps
    };
  };

  const resolvePrimaryActionModel = (input: { running: boolean; publicAddress: string | null; role: UserRole }) => {
    if (!input.running) {
      return {
        id: "start_server" as const,
        label: "Start Server",
        available: roleRank[input.role] >= roleRank.moderator
      };
    }
    if (!input.publicAddress) {
      return {
        id: "go_live" as const,
        label: "Go Live",
        available: roleRank[input.role] >= roleRank.admin
      };
    }
    return {
      id: "copy_invite" as const,
      label: "Copy Invite Address",
      available: true
    };
  };

  const isTunnelEndpointResolved = (tunnel: ReturnType<TunnelService["listTunnels"]>[number] | null): boolean => {
    if (!tunnel) {
      return false;
    }
    return !tunnel.publicHost.startsWith("pending.");
  };

  const resolvePublicHostingSettings = (serverId: string) => {
    const settings = store.getServerPublicHostingSettings(serverId);
    return {
      ...settings,
      autoEnable: Boolean(settings.autoEnable),
      consentRequired: settings.defaultProvider === "playit" && settings.consentVersion !== PLAYIT_CONSENT_VERSION,
      consentCurrentVersion: PLAYIT_CONSENT_VERSION
    };
  };

  const hasPlayitConsent = (serverId: string, username: string): boolean => {
    const serverSettings = store.getServerPublicHostingSettings(serverId);
    if (serverSettings.consentVersion === PLAYIT_CONSENT_VERSION && serverSettings.consentAcceptedAt) {
      return true;
    }

    const latestConsent = store.getLatestUserLegalConsent(username, "playit");
    if (!latestConsent) {
      return false;
    }
    return latestConsent.consentVersion === PLAYIT_CONSENT_VERSION;
  };

  const acceptPlayitConsent = (serverId: string, username: string, acceptedAt = new Date().toISOString()) => {
    store.upsertUserLegalConsent({
      username,
      provider: "playit",
      consentVersion: PLAYIT_CONSENT_VERSION,
      acceptedAt
    });
    store.upsertServerPublicHostingSettings({
      serverId,
      consentVersion: PLAYIT_CONSENT_VERSION,
      consentAcceptedAt: acceptedAt
    });
  };

  const ensurePreferredTunnelForServer = (
    server: NonNullable<ReturnType<typeof store.getServerById>>,
    actorUsername?: string
  ): { tunnel: ReturnType<TunnelService["listTunnels"]>[number] | null; warning: string | null } => {
    const settings = store.getServerPublicHostingSettings(server.id);
    if (!settings.autoEnable) {
      return {
        tunnel: null,
        warning: null
      };
    }

    const provider = settings.defaultProvider;
    if (provider === "playit") {
      const username = actorUsername?.trim();
      if (!username || !hasPlayitConsent(server.id, username)) {
        return {
          tunnel: null,
          warning:
            "Public hosting uses Playit.gg. Accept Playit terms in Settings before enabling public hosting for this server."
        };
      }
    }

    const tunnel = deps.tunnels.ensurePreferredQuickTunnel(server.id, provider);
    return {
      tunnel,
      warning: null
    };
  };

  const createAndProvisionServer = async (
    payload: z.infer<typeof createServerSchema>,
    options?: {
      requestedSavePath?: string;
      worldImportPath?: string;
      actorUsername?: string;
    }
  ) => {
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

    const serverRoot = resolveRequestedServerRootPath(payload.name, options?.requestedSavePath ?? payload.rootPath ?? "");

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

    if (options?.worldImportPath) {
      const source = path.resolve(options.worldImportPath);
      if (!fs.existsSync(source)) {
        deps.alerts.createAlert(initialRecord.id, "warning", "world_import_missing", `World import path does not exist: ${source}`);
      } else {
        const worldTarget = path.join(initialRecord.rootPath, "world");
        try {
          fs.rmSync(worldTarget, { recursive: true, force: true });
          fs.cpSync(source, worldTarget, { recursive: true });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          deps.alerts.createAlert(initialRecord.id, "warning", "world_import_failed", message);
        }
      }
    }

    const server = store.getServerById(initialRecord.id);
    if (!server) {
      throw app.httpErrors.internalServerError("Server was created but could not be reloaded from store");
    }

    if (options?.actorUsername) {
      const latestConsent = store.getLatestUserLegalConsent(options.actorUsername, "playit");
      if (latestConsent?.consentVersion === PLAYIT_CONSENT_VERSION) {
        store.upsertServerPublicHostingSettings({
          serverId: server.id,
          consentVersion: latestConsent.consentVersion,
          consentAcceptedAt: latestConsent.acceptedAt
        });
      }
    }

    return { server, policyFindings };
  };

  const goLiveForServer = async (
    server: NonNullable<ReturnType<typeof store.getServerById>>,
    actorUsername: string
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

    const preferredTunnel = ensurePreferredTunnelForServer(server, actorUsername);
    if (!preferredTunnel.tunnel) {
      return {
        ok: true,
        blocked: false,
        preflight,
        warning: preferredTunnel.warning,
        publicHosting: {
          quickHostReady: false,
          publicAddress: null,
          tunnel: null,
          steps: [
            preferredTunnel.warning ?? "Public hosting is disabled for this server.",
            "Open Settings to configure hosting provider and consent."
          ]
        }
      };
    }

    const tunnel = preferredTunnel.tunnel;
    try {
      await deps.tunnels.startTunnel(tunnel.id);
      if (tunnel.provider === "playit") {
        const syncResult = await deps.tunnels.refreshPlayitTunnelPublicEndpoint(tunnel.id);
        if (syncResult.pendingReason) {
          warning = syncResult.pendingReason;
        }
      }
    } catch (error) {
      warning = error instanceof Error ? error.message : String(error);
    }

    const tunnels = deps.tunnels.listTunnels(server.id);
    const activeTunnel = tunnels.find((entry) => entry.id === tunnel.id) ?? tunnels[0] ?? null;
    const hasResolvedPublicAddress = isTunnelEndpointResolved(activeTunnel);
    const quickHostReady = Boolean(activeTunnel && hasResolvedPublicAddress);
    const publicAddress = hasResolvedPublicAddress ? `${activeTunnel!.publicHost}:${String(activeTunnel!.publicPort)}` : null;
    if (!publicAddress && !warning) {
      warning = activeTunnel?.provider === "playit" ? "Playit is still assigning a public endpoint." : "Public endpoint is still resolving.";
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
              activeTunnel?.provider === "playit" ? "Playit is still assigning a public endpoint." : "Public endpoint is still resolving.",
              "Keep this machine online until the endpoint resolves."
            ]
      }
    };
  };

  const deleteServerResources = async (
    server: NonNullable<ReturnType<typeof store.getServerById>>,
    options: {
      deleteFiles: boolean;
      deleteBackups: boolean;
    }
  ): Promise<{ warnings: string[] }> => {
    try {
      await deps.tunnels.stopTunnelsForServer(server.id);
      await deps.runtime.stop(server.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not stop server resources before delete: ${message}`);
    }

    const warnings: string[] = [];

    if (options.deleteBackups) {
      const backups = store.listBackups(server.id);
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

    store.deleteServer(server.id);
    deps.tasks.refresh();
    deps.backupRetention.refresh();

    if (options.deleteFiles) {
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

    return { warnings };
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

  const runQuickStart = async (
    payload: z.infer<typeof quickStartSchema>,
    actorUsername: string
  ) => {
    const type = payload.type ?? (payload.preset === "modded" ? "fabric" : "paper");
    const hostTotalMemoryMb = Math.max(1024, Math.floor(os.totalmem() / (1024 * 1024)));
    const memoryProfile = resolveQuickStartMemoryProfile(payload.preset, hostTotalMemoryMb, payload.memoryPreset);
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
        enableFloodgate: payload.preset !== "modded",
        rootPath: payload.savePath
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

    const { server, policyFindings } = await createAndProvisionServer(createPayload, {
      requestedSavePath: payload.savePath,
      worldImportPath: payload.worldImportPath,
      actorUsername
    });

    store.upsertServerPublicHostingSettings({
      serverId: server.id,
      autoEnable: payload.publicHosting,
      defaultProvider: "playit"
    });

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
      const preferredTunnel = ensurePreferredTunnelForServer(server, actorUsername);
      if (!preferredTunnel.tunnel) {
        quickHostingWarning = preferredTunnel.warning ?? "Public hosting is disabled for this server.";
      } else {
        const tunnel = preferredTunnel.tunnel;
        const readiness = deps.tunnels.getTunnelLaunchReadiness(tunnel);
        quickHostingWarning = readiness.ok ? null : readiness.reason ?? "Tunnel dependency missing";

        if (started) {
          try {
            await deps.tunnels.startTunnel(tunnel.id);
            if (tunnel.provider === "playit") {
              const syncResult = await deps.tunnels.refreshPlayitTunnelPublicEndpoint(tunnel.id);
              if (syncResult.pendingReason) {
                quickHostingWarning = quickHostingWarning ? `${quickHostingWarning}; ${syncResult.pendingReason}` : syncResult.pendingReason;
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            quickHostingWarning = message;
          }
        }

        const activeTunnel = deps.tunnels
          .listTunnels(server.id)
          .find((entry) => entry.id === tunnel.id || entry.status === "active");
        if (activeTunnel) {
          const hasResolvedPublicAddress = isTunnelEndpointResolved(activeTunnel);
          quickHostAddress = hasResolvedPublicAddress ? `${activeTunnel.publicHost}:${String(activeTunnel.publicPort)}` : null;
          if (!hasResolvedPublicAddress && !quickHostingWarning && activeTunnel.provider === "playit") {
            quickHostingWarning = "Playit is still assigning a public endpoint.";
          }
        }
      }
    }

    writeAudit(actorUsername, "server.quickstart", "server", server.id, {
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

    const refreshedServer = store.getServerById(server.id);
    if (!refreshedServer) {
      throw app.httpErrors.internalServerError("Server was created but could not be reloaded from store");
    }

    return {
      server: refreshedServer,
      policyFindings,
      started,
      blocked,
      preflight,
      warning,
      quickHosting: {
        enabled: payload.publicHosting,
        publicAddress: quickHostAddress,
        warning: quickHostingWarning
      },
      requested: {
        memoryPreset: payload.memoryPreset,
        savePath: payload.savePath ?? null,
        worldImportPath: payload.worldImportPath ?? null
      }
    };
  };

  app.get("/servers", { preHandler: [authenticate] }, async () => ({ servers: store.listServers() }));

  app.post("/servers", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const payload = applyPreset(createServerSchema.parse(request.body));
    const { server, policyFindings } = await createAndProvisionServer(payload, {
      actorUsername: request.user!.username
    });
    const preferredTunnel = ensurePreferredTunnelForServer(server, request.user!.username);
    if (preferredTunnel.tunnel) {
      writeAudit(request.user!.username, "public_hosting.auto_prepare", "server", server.id, {
        tunnelId: preferredTunnel.tunnel.id,
        provider: preferredTunnel.tunnel.provider
      });
    }
    writeAudit(request.user!.username, "server.create", "server", server.id, payload);
    return { server, policyFindings, publicHostingWarning: preferredTunnel.warning };
  });

  app.post("/servers/quickstart", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const parsedQuickStart = quickStartSchema.safeParse(request.body ?? {});
    if (!parsedQuickStart.success) {
      throw app.httpErrors.badRequest(parsedQuickStart.error.issues.map((issue) => issue.message).join("; "));
    }
    return runQuickStart(parsedQuickStart.data, request.user!.username);
  });

  app.post("/setup/sessions/:id/launch", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    const session = consumeSetupSession(id);
    return runQuickStart(session.payload, request.user!.username);
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
          const preferredTunnel = ensurePreferredTunnelForServer(server, request.user!.username);
          if (preferredTunnel.tunnel) {
            await deps.tunnels.startTunnel(preferredTunnel.tunnel.id);
            if (preferredTunnel.tunnel.provider === "playit") {
              await deps.tunnels.refreshPlayitTunnelPublicEndpoint(preferredTunnel.tunnel.id);
            }
          }
          results.push({
            serverId: server.id,
            ok: true,
            message: preferredTunnel.warning ? `Started (hosting warning: ${preferredTunnel.warning})` : "Started"
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
          const preferredTunnel = ensurePreferredTunnelForServer(server, request.user!.username);
          if (preferredTunnel.tunnel) {
            await deps.tunnels.startTunnel(preferredTunnel.tunnel.id);
            if (preferredTunnel.tunnel.provider === "playit") {
              await deps.tunnels.refreshPlayitTunnelPublicEndpoint(preferredTunnel.tunnel.id);
            }
          }
          results.push({
            serverId: server.id,
            ok: true,
            message: preferredTunnel.warning ? `Restarted (hosting warning: ${preferredTunnel.warning})` : "Restarted"
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
        const outcome = await goLiveForServer(server, request.user!.username);
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
        continue;
      }

      if (payload.action === "delete") {
        try {
          const deletion = await deleteServerResources(server, {
            deleteFiles: true,
            deleteBackups: true
          });
          const warningDetail =
            deletion.warnings.length > 0 ? ` (warnings: ${deletion.warnings.slice(0, 2).join(" | ")}${deletion.warnings.length > 2 ? " ..." : ""})` : "";
          results.push({
            serverId: server.id,
            ok: true,
            message: `Deleted${warningDetail}`
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          results.push({
            serverId: server.id,
            ok: false,
            message: `Delete failed: ${message}`
          });
        }
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
      const deletion = await deleteServerResources(server, {
        deleteFiles: query.deleteFiles,
        deleteBackups: query.deleteBackups
      });

      writeAudit(request.user!.username, "server.delete", "server", id, {
        deleteFiles: query.deleteFiles,
        deleteBackups: query.deleteBackups,
        warnings: deletion.warnings
      });

      return {
        ok: true,
        deleted: {
          serverId: id,
          deleteFiles: query.deleteFiles,
          deleteBackups: query.deleteBackups
        },
        warnings: deletion.warnings
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw app.httpErrors.conflict(message);
    }
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

    let hostingWarning: string | null = null;
    try {
      await deps.runtime.start(server);
      const preferredTunnel = ensurePreferredTunnelForServer(server, request.user!.username);
      hostingWarning = preferredTunnel.warning;
      if (preferredTunnel.tunnel) {
        await deps.tunnels.startTunnel(preferredTunnel.tunnel.id);
        if (preferredTunnel.tunnel.provider === "playit") {
          await deps.tunnels.refreshPlayitTunnelPublicEndpoint(preferredTunnel.tunnel.id);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.alerts.createAlert(server.id, "critical", "start_failed", message);
      const errorMessage = `Failed to start server: ${message}`;
      return reply.code(500).send({
        ok: false,
        code: "server_start_failed",
        message: errorMessage,
        error: errorMessage
      });
    }

    writeAudit(request.user!.username, "server.start", "server", id);
    return { ok: true, preflight, warning: hostingWarning };
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
    const preferredTunnel = ensurePreferredTunnelForServer(server, request.user!.username);
    const hostingWarning = preferredTunnel.warning;
    if (preferredTunnel.tunnel) {
      await deps.tunnels.startTunnel(preferredTunnel.tunnel.id);
      if (preferredTunnel.tunnel.provider === "playit") {
        await deps.tunnels.refreshPlayitTunnelPublicEndpoint(preferredTunnel.tunnel.id);
      }
    }
    writeAudit(request.user!.username, "server.restart", "server", id);
    return { ok: true, warning: hostingWarning };
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
      const errorMessage = `Failed to stop running server before safe restart: ${message}`;
      return reply.code(409).send({
        ok: false,
        code: "safe_restart_stop_failed",
        message: errorMessage,
        error: errorMessage
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
      const preferredTunnel = ensurePreferredTunnelForServer(refreshedServer, request.user!.username);
      if (preferredTunnel.tunnel) {
        await deps.tunnels.startTunnel(preferredTunnel.tunnel.id);
        if (preferredTunnel.tunnel.provider === "playit") {
          await deps.tunnels.refreshPlayitTunnelPublicEndpoint(preferredTunnel.tunnel.id);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.alerts.createAlert(refreshedServer.id, "critical", "safe_restart_failed", message);
      const errorMessage = `Safe restart failed: ${message}`;
      return reply.code(500).send({
        ok: false,
        code: "safe_restart_failed",
        message: errorMessage,
        error: errorMessage
      });
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

  app.post("/servers/:id/simple-fix", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const completed: string[] = [];
    const warnings: string[] = [];

    try {
      if (deps.runtime.isRunning(id) || server.status === "running" || server.status === "starting") {
        await deps.tunnels.stopTunnelsForServer(id);
        await deps.runtime.stop(id);
        completed.push("stopped running server");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        status: "needs_manual",
        summary: "Automatic fix could not stop the running server.",
        code: "fix_stop_failed",
        message: `Could not stop server before recovery: ${message}`,
        completed,
        warnings: [message]
      };
    }

    const refreshedServer = store.getServerById(id);
    if (!refreshedServer) {
      throw app.httpErrors.notFound("Server not found");
    }

    const preflightBefore = deps.preflight.run(refreshedServer);
    const hasRepairableIssue = preflightBefore.issues.some(
      (issue) => issue.code === "missing_eula" || issue.code === "missing_server_jar"
    );
    if (hasRepairableIssue) {
      const repaired = await deps.setup.repairCoreFiles(refreshedServer);
      if (repaired.repaired.length > 0) {
        completed.push(`repaired core files (${repaired.repaired.join(", ")})`);
      }
    }

    const latestSnapshot = store.listEditorFileSnapshots({
      serverId: refreshedServer.id,
      path: "server.properties",
      limit: 1
    })[0];
    if (latestSnapshot) {
      const resolved = resolveEditorFilePath(refreshedServer.rootPath, "server.properties");
      if (fs.existsSync(resolved.absolutePath)) {
        const existing = fs.readFileSync(resolved.absolutePath, "utf8");
        if (existing !== latestSnapshot.content) {
          store.createEditorFileSnapshot({
            serverId: refreshedServer.id,
            path: resolved.relativePath,
            content: existing,
            reason: "before_simple_fix"
          });
        }
      }
      fs.mkdirSync(path.dirname(resolved.absolutePath), { recursive: true });
      fs.writeFileSync(resolved.absolutePath, latestSnapshot.content, "utf8");
      store.pruneEditorFileSnapshots({
        serverId: refreshedServer.id,
        path: resolved.relativePath,
        keep: 40
      });
      completed.push("rolled back server.properties snapshot");
    }

    const preflightAfter = deps.preflight.run(refreshedServer);
    const criticalIssue = preflightAfter.issues.find((issue) => issue.severity === "critical");
    if (criticalIssue) {
      deps.alerts.createAlert(refreshedServer.id, "critical", "preflight_block", criticalIssue.message);
      writeAudit(request.user!.username, "server.simple_fix", "server", id, {
        status: "blocked",
        completed,
        warnings,
        issue: criticalIssue.message
      });
      return {
        ok: false,
        status: "blocked",
        summary: "Automatic fix is blocked by a critical preflight issue.",
        code: "fix_blocked_preflight",
        message: criticalIssue.message,
        completed,
        warnings,
        preflight: preflightAfter
      };
    }

    try {
      await deps.runtime.start(refreshedServer);
      const preferredTunnel = ensurePreferredTunnelForServer(refreshedServer, request.user!.username);
      if (preferredTunnel.tunnel) {
        await deps.tunnels.startTunnel(preferredTunnel.tunnel.id);
        if (preferredTunnel.tunnel.provider === "playit") {
          await deps.tunnels.refreshPlayitTunnelPublicEndpoint(preferredTunnel.tunnel.id);
        }
      }
      completed.push("restarted server safely");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.alerts.createAlert(refreshedServer.id, "critical", "simple_fix_restart_failed", message);
      warnings.push(message);
      writeAudit(request.user!.username, "server.simple_fix", "server", id, {
        status: "needs_manual",
        completed,
        warnings
      });
      return {
        ok: false,
        status: "needs_manual",
        summary: "Automatic fix completed partially but restart still failed.",
        code: "fix_restart_failed",
        message,
        completed,
        warnings,
        preflight: preflightAfter
      };
    }

    writeAudit(request.user!.username, "server.simple_fix", "server", id, {
      status: "fixed",
      completed,
      warnings
    });

    return {
      ok: true,
      status: "fixed",
      summary: "Automatic fix completed successfully.",
      code: "fixed",
      message: "Server restarted and recovery actions completed.",
      completed,
      warnings,
      preflight: preflightAfter
    };
  });

  app.post("/servers/:id/go-live", { preHandler: [authenticate, requireRole("admin")] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const outcome = await goLiveForServer(server, request.user!.username);
    if (!outcome.ok && !outcome.blocked && outcome.warning?.startsWith("Failed to start server:")) {
      const errorMessage = outcome.warning;
      return reply.code(500).send({
        ok: false,
        blocked: false,
        preflight: outcome.preflight,
        code: "go_live_start_failed",
        message: errorMessage,
        error: errorMessage
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

  app.get("/servers/:id/player-admin", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const query = playerHistoryQuerySchema.parse(request.query ?? {});
    return {
      state: deps.playerAdmin.getState(id, query.limit)
    };
  });

  app.post("/servers/:id/player-admin/action", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = playerAdminActionSchema.parse(request.body ?? {});
    const state = deps.playerAdmin.applyAction({
      serverId: id,
      action: payload.action,
      name: payload.name,
      uuid: payload.uuid,
      reason: payload.reason
    });
    writeAudit(request.user!.username, `players.action.${payload.action}`, "server", id, payload);
    return { state };
  });

  app.post("/servers/:id/players/op", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = playerOpSchema.parse(request.body ?? {});
    const ops = deps.playerAdmin.addOp({
      serverId: id,
      name: payload.name,
      uuid: payload.uuid,
      level: payload.level,
      bypassesPlayerLimit: payload.bypassesPlayerLimit
    });
    writeAudit(request.user!.username, "players.op.add", "server", id, {
      name: payload.name,
      uuid: payload.uuid
    });
    return { ops };
  });

  app.post("/servers/:id/players/op/remove", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = removePlayerSchema.parse(request.body ?? {});
    const ops = deps.playerAdmin.removeOp(id, payload.nameOrUuid);
    writeAudit(request.user!.username, "players.op.remove", "server", id, payload);
    return { ops };
  });

  app.post("/servers/:id/players/whitelist", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = playerIdentitySchema.parse(request.body ?? {});
    const whitelist = deps.playerAdmin.addWhitelist(id, payload.name, payload.uuid);
    writeAudit(request.user!.username, "players.whitelist.add", "server", id, payload);
    return { whitelist };
  });

  app.post("/servers/:id/players/whitelist/remove", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = removePlayerSchema.parse(request.body ?? {});
    const whitelist = deps.playerAdmin.removeWhitelist(id, payload.nameOrUuid);
    writeAudit(request.user!.username, "players.whitelist.remove", "server", id, payload);
    return { whitelist };
  });

  app.post("/servers/:id/players/ban", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = playerBanSchema.parse(request.body ?? {});
    const bans = deps.playerAdmin.banPlayer({
      serverId: id,
      name: payload.name,
      uuid: payload.uuid,
      reason: payload.reason,
      expires: payload.expires
    });
    writeAudit(request.user!.username, "players.ban.add", "server", id, payload);
    return { bans };
  });

  app.post("/servers/:id/players/unban", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = removePlayerSchema.parse(request.body ?? {});
    const bans = deps.playerAdmin.unbanPlayer(id, payload.nameOrUuid);
    writeAudit(request.user!.username, "players.ban.remove", "server", id, payload);
    return { bans };
  });

  app.post("/servers/:id/players/ban-ip", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = banIpSchema.parse(request.body ?? {});
    const bannedIps = deps.playerAdmin.banIp({
      serverId: id,
      ip: payload.ip,
      reason: payload.reason,
      expires: payload.expires
    });
    writeAudit(request.user!.username, "players.ip_ban.add", "server", id, payload);
    return { bannedIps };
  });

  app.post("/servers/:id/players/unban-ip", { preHandler: [authenticate, requireRole("moderator")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = unbanIpSchema.parse(request.body ?? {});
    const bannedIps = deps.playerAdmin.unbanIp(id, payload.ip);
    writeAudit(request.user!.username, "players.ip_ban.remove", "server", id, payload);
    return { bannedIps };
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
      const errorMessage = "Server must be stopped before running repair actions";
      return reply.code(409).send({
        code: "server_running_repair_blocked",
        message: errorMessage,
        error: errorMessage
      });
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
      const errorMessage = "Snapshot not found for this file";
      return reply.code(404).send({
        code: "snapshot_not_found",
        message: errorMessage,
        error: errorMessage
      });
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
      const errorMessage = "Server must be stopped before restoring a backup";
      return reply.code(409).send({
        code: "server_running_restore_blocked",
        message: errorMessage,
        error: errorMessage
      });
    }

    const restore = await deps.backup.restoreBackup(id, backupId);
    writeAudit(request.user!.username, "backup.restore", "server", id, { backupId });
    return { ok: true, restore };
  });

  app.get("/servers/:id/cloud-backup-destinations", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    if (!store.getServerById(id)) {
      throw app.httpErrors.notFound("Server not found");
    }
    const destinations = deps.backup.listCloudDestinations(id).map(sanitizeCloudDestination);
    return { destinations };
  });

  app.post("/servers/:id/cloud-backup-destinations", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = cloudDestinationSchema.parse(request.body ?? {});
    const destination = deps.backup.createCloudDestination({
      serverId: id,
      provider: payload.provider,
      name: payload.name,
      encryptionPassphrase: payload.encryptionPassphrase,
      enabled: payload.enabled,
      config: payload.config
    });
    writeAudit(request.user!.username, "backup.cloud_destination.create", "server", id, {
      provider: payload.provider,
      destinationId: destination.id
    });
    return { destination: sanitizeCloudDestination(destination) };
  });

  app.put(
    "/servers/:id/cloud-backup-destinations/:destinationId",
    { preHandler: [authenticate, requireRole("admin")] },
    async (request) => {
      const { id, destinationId } = request.params as { id: string; destinationId: string };
      const payload = cloudDestinationUpdateSchema.parse(request.body ?? {});
      const current = store.getCloudBackupDestination(destinationId);
      if (!current || current.serverId !== id) {
        throw app.httpErrors.notFound("Cloud destination not found for server");
      }
      const updated = deps.backup.updateCloudDestination(destinationId, {
        name: payload.name,
        encryptionPassphrase: payload.encryptionPassphrase,
        enabled: payload.enabled,
        config: payload.config
      });
      if (!updated) {
        throw app.httpErrors.notFound("Cloud destination not found");
      }
      writeAudit(request.user!.username, "backup.cloud_destination.update", "cloud_destination", destinationId, {
        serverId: id
      });
      return { destination: sanitizeCloudDestination(updated) };
    }
  );

  app.delete(
    "/servers/:id/cloud-backup-destinations/:destinationId",
    { preHandler: [authenticate, requireRole("admin")] },
    async (request) => {
      const { id, destinationId } = request.params as { id: string; destinationId: string };
      const destination = store.getCloudBackupDestination(destinationId);
      if (!destination || destination.serverId !== id) {
        throw app.httpErrors.notFound("Cloud destination not found for server");
      }
      deps.backup.deleteCloudDestination(destinationId);
      writeAudit(request.user!.username, "backup.cloud_destination.delete", "cloud_destination", destinationId, {
        serverId: id
      });
      return { ok: true };
    }
  );

  app.get("/servers/:id/cloud-backups", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    if (!store.getServerById(id)) {
      throw app.httpErrors.notFound("Server not found");
    }
    return {
      artifacts: deps.backup.listCloudArtifacts(id)
    };
  });

  app.post(
    "/servers/:id/backups/:backupId/upload-cloud",
    { preHandler: [authenticate, requireRole("moderator")] },
    async (request) => {
      const { id, backupId } = request.params as { id: string; backupId: string };
      const payload = uploadCloudBackupSchema.parse(request.body ?? {});
      const upload = await deps.backup.uploadBackupToCloud({
        serverId: id,
        backupId,
        destinationId: payload.destinationId
      });
      writeAudit(request.user!.username, "backup.cloud_upload", "backup", backupId, {
        serverId: id,
        destinationId: payload.destinationId,
        artifactId: upload.artifactId
      });
      return { upload };
    }
  );

  app.post(
    "/servers/:id/cloud-backups/:artifactId/restore",
    { preHandler: [authenticate, requireRole("admin")] },
    async (request, reply) => {
      const { id, artifactId } = request.params as { id: string; artifactId: string };
      const server = store.getServerById(id);
      if (!server) {
        throw app.httpErrors.notFound("Server not found");
      }

      if (deps.runtime.isRunning(id) || server.status === "running" || server.status === "starting") {
        const errorMessage = "Server must be stopped before restoring a cloud backup";
        return reply.code(409).send({
          code: "server_running_restore_blocked",
          message: errorMessage,
          error: errorMessage
        });
      }

      const restore = await deps.backup.restoreCloudArtifact(id, artifactId);
      writeAudit(request.user!.username, "backup.cloud_restore", "cloud_backup_artifact", artifactId, {
        serverId: id
      });
      return { ok: true, restore };
    }
  );

  app.post("/servers/:id/public-hosting/quick-enable", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = quickPublicHostingSchema.parse(request.body ?? {});
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const existingSettings = store.getServerPublicHostingSettings(id);
    const provider = payload.provider ?? existingSettings.defaultProvider;
    store.upsertServerPublicHostingSettings({
      serverId: id,
      autoEnable: true,
      defaultProvider: provider
    });

    if (provider === "playit" && !hasPlayitConsent(id, request.user!.username)) {
      return {
        tunnel: null,
        warning: "Playit consent is required before enabling public hosting.",
        settings: resolvePublicHostingSettings(id)
      };
    }

    const tunnel = deps.tunnels.ensurePreferredQuickTunnel(id, provider, payload);
    const readiness = deps.tunnels.getTunnelLaunchReadiness(tunnel);
    let warning: string | null = readiness.ok ? null : readiness.reason ?? "Tunnel dependency missing.";
    if (server.status === "running" || server.status === "starting") {
      try {
        await deps.tunnels.startTunnel(tunnel.id);
        if (tunnel.provider === "playit") {
          const syncResult = await deps.tunnels.refreshPlayitTunnelPublicEndpoint(tunnel.id);
          if (syncResult.pendingReason) {
            warning = warning ? `${warning}; ${syncResult.pendingReason}` : syncResult.pendingReason;
          }
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
      warning,
      settings: resolvePublicHostingSettings(id)
    };
  });

  app.get("/servers/:id/public-hosting/settings", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    return {
      settings: resolvePublicHostingSettings(id)
    };
  });

  app.put("/servers/:id/public-hosting/settings", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const payload = publicHostingSettingsUpdateSchema.parse(request.body ?? {});
    const consentVersion = payload.consentVersion ?? PLAYIT_CONSENT_VERSION;
    if (payload.consentAccepted) {
      acceptPlayitConsent(id, request.user!.username, new Date().toISOString());
    }

    const updated = store.upsertServerPublicHostingSettings({
      serverId: id,
      autoEnable: payload.autoEnable,
      defaultProvider: payload.defaultProvider,
      consentVersion: payload.consentAccepted ? consentVersion : undefined,
      consentAcceptedAt: payload.consentAccepted ? new Date().toISOString() : undefined
    });

    writeAudit(request.user!.username, "public_hosting.settings.update", "server", id, {
      autoEnable: payload.autoEnable,
      defaultProvider: payload.defaultProvider,
      consentAccepted: payload.consentAccepted ?? false,
      consentVersion
    });

    return {
      settings: {
        ...updated,
        autoEnable: Boolean(updated.autoEnable),
        consentCurrentVersion: PLAYIT_CONSENT_VERSION
      }
    };
  });

  app.get("/servers/:id/public-hosting/diagnostics", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const tunnels = deps.tunnels.listTunnels(id);
    const settings = store.getServerPublicHostingSettings(id);
    const tunnel = tunnels.find((entry) => entry.provider === settings.defaultProvider) ?? tunnels[0] ?? null;
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
        ],
        settings: resolvePublicHostingSettings(id),
        legal: {
          playitTermsUrl: "https://playit.gg/terms-of-service",
          playitPrivacyUrl: "https://playit.gg/privacy-policy",
          consentVersion: PLAYIT_CONSENT_VERSION
        }
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
      if (diagnostics.authRequired) {
        actions.push("Open Playit authorization and complete agent linking.");
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
        id: "open_playit_auth",
        label: "Open Playit Authorization",
        description: "Open Playit account authorization and link the agent."
      });
      fixes.push({
        id: "set_playit_secret",
        label: "Set Playit Secret (Fallback)",
        description: "Use secret entry only if automatic authorization cannot be completed."
      });
      fixes.push({
        id: "copy_playit_auth_steps",
        label: "Copy Auth Steps (Fallback)",
        description: "Copy fallback manual auth instructions."
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
      fixes,
      settings: resolvePublicHostingSettings(id),
      legal: {
        playitTermsUrl: "https://playit.gg/terms-of-service",
        playitPrivacyUrl: "https://playit.gg/privacy-policy",
        consentVersion: PLAYIT_CONSENT_VERSION
      }
    };
  });

  app.get("/servers/:id/public-hosting/status", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const snapshot = await loadQuickHostingSnapshot(id);
    const localAddress = `127.0.0.1:${String(snapshot.server.port)}`;
    return {
      server: {
        id: snapshot.server.id,
        name: snapshot.server.name,
        status: snapshot.server.status,
        localAddress
      },
      quickHostReady: Boolean(snapshot.activeTunnel && snapshot.readiness?.ok && snapshot.hasResolvedPublicAddress),
      publicAddress: snapshot.publicAddress,
      tunnel: snapshot.activeTunnel,
      settings: {
        autoEnable: Boolean(snapshot.hostingSettings.autoEnable),
        defaultProvider: snapshot.hostingSettings.defaultProvider,
        consentVersion: snapshot.hostingSettings.consentVersion,
        consentAcceptedAt: snapshot.hostingSettings.consentAcceptedAt,
        consentCurrentVersion: PLAYIT_CONSENT_VERSION
      },
      steps: snapshot.steps
    };
  });

  app.get("/servers/:id/simple-status", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const snapshot = await loadQuickHostingSnapshot(id);
    const running =
      deps.runtime.isRunning(id) || snapshot.server.status === "running" || snapshot.server.status === "starting";
    const preflight = deps.preflight.run(snapshot.server);
    const criticalIssue = preflight.issues.find((issue) => issue.severity === "critical");

    const primaryAction = resolvePrimaryActionModel({
      running,
      publicAddress: snapshot.publicAddress,
      role: request.user!.role
    });

    return {
      server: {
        id: snapshot.server.id,
        name: snapshot.server.name,
        status: snapshot.server.status,
        localAddress: `127.0.0.1:${String(snapshot.server.port)}`,
        inviteAddress: snapshot.publicAddress
      },
      quickHosting: {
        enabled: Boolean(snapshot.activeTunnel),
        autoEnable: Boolean(snapshot.hostingSettings.autoEnable),
        defaultProvider: snapshot.hostingSettings.defaultProvider,
        consentRequired:
          snapshot.hostingSettings.defaultProvider === "playit" && snapshot.hostingSettings.consentVersion !== PLAYIT_CONSENT_VERSION,
        status: snapshot.activeTunnel?.status ?? "disabled",
        endpointPending: Boolean(snapshot.activeTunnel && !snapshot.publicAddress),
        diagnostics: snapshot.diagnostics
          ? {
              message: snapshot.diagnostics.message,
              endpointAssigned: snapshot.diagnostics.endpointAssigned,
              retry: snapshot.diagnostics.retry
            }
          : null
      },
      checklist: {
        created: true,
        running,
        publicReady: Boolean(snapshot.publicAddress)
      },
      primaryAction,
      preflight: {
        passed: preflight.passed,
        blocked: Boolean(criticalIssue),
        issues: preflight.issues
      }
    };
  });

  app.get("/servers/:id/workspace-summary", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    const snapshot = await loadQuickHostingSnapshot(id);
    const running =
      deps.runtime.isRunning(id) || snapshot.server.status === "running" || snapshot.server.status === "starting";
    const preflight = deps.preflight.run(snapshot.server);
    const criticalIssue = preflight.issues.find((issue) => issue.severity === "critical");
    const primaryAction = resolvePrimaryActionModel({
      running,
      publicAddress: snapshot.publicAddress,
      role: request.user!.role
    });

    const playerState = deps.playerAdmin.getState(id, 120);
    const alerts = store.listAlerts(id);
    const openAlerts = alerts.filter((entry) => !entry.resolvedAt).length;
    const crashes = store.listCrashReports(id).length;
    const since = new Date(Date.now() - WORKSPACE_SUMMARY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const samples = store.listServerPerformanceSamples({
      serverId: id,
      since,
      limit: 240
    });
    const cpuPeakPercent = samples.length > 0 ? toFixedNumber(Math.max(...samples.map((entry) => entry.cpuPercent)), 1) : 0;
    const memoryPeakMb = samples.length > 0 ? toFixedNumber(Math.max(...samples.map((entry) => entry.memoryMb)), 0) : 0;
    const latestSample = samples[0]
      ? {
          sampledAt: samples[0].sampledAt,
          cpuPercent: toFixedNumber(samples[0].cpuPercent, 1),
          memoryMb: toFixedNumber(samples[0].memoryMb, 0)
        }
      : null;
    const startupEvents = store.listServerStartupEvents({
      serverId: id,
      limit: 40
    });
    const latestSuccessfulStartup = startupEvents.find((entry) => entry.success === 1) ?? null;
    const uptimeSeconds =
      running && latestSuccessfulStartup
        ? Math.max(0, Math.floor((Date.now() - new Date(latestSuccessfulStartup.createdAt).getTime()) / 1000))
        : null;

    return {
      summary: {
        server: {
          id: snapshot.server.id,
          name: snapshot.server.name,
          type: snapshot.server.type,
          mcVersion: snapshot.server.mcVersion,
          status: snapshot.server.status,
          visibility: snapshot.publicAddress ? "public" : "private"
        },
        addresses: {
          local: `127.0.0.1:${String(snapshot.server.port)}`,
          invite: snapshot.publicAddress
        },
        players: {
          online: playerState.onlinePlayers.length,
          known: playerState.knownPlayers.length,
          capacity: playerState.capacity,
          list: playerState.knownPlayers,
          onlineList: playerState.onlinePlayers,
          knownList: playerState.knownPlayers
        },
        metrics: {
          windowHours: WORKSPACE_SUMMARY_WINDOW_HOURS,
          latest: latestSample,
          cpuPeakPercent,
          memoryPeakMb,
          uptimeSeconds,
          openAlerts,
          crashes,
          startupTrend: startupEvents.slice(0, 12).map((entry) => ({
            createdAt: entry.createdAt,
            durationMs: entry.durationMs,
            success: entry.success === 1
          }))
        },
        tunnel: {
          enabled: Boolean(snapshot.activeTunnel),
          autoEnable: Boolean(snapshot.hostingSettings.autoEnable),
          provider: snapshot.activeTunnel?.provider ?? null,
          defaultProvider: snapshot.hostingSettings.defaultProvider,
          consentVersion: snapshot.hostingSettings.consentVersion,
          consentAcceptedAt: snapshot.hostingSettings.consentAcceptedAt,
          consentCurrentVersion: PLAYIT_CONSENT_VERSION,
          status: snapshot.activeTunnel?.status ?? "disabled",
          publicAddress: snapshot.publicAddress,
          endpointPending: Boolean(snapshot.activeTunnel && !snapshot.publicAddress),
          steps: snapshot.steps
        },
        preflight: {
          passed: preflight.passed,
          blocked: Boolean(criticalIssue),
          issues: preflight.issues
        },
        primaryAction
      }
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

  app.get("/audit/export", { preHandler: [authenticate, requireRole("admin")] }, async (request, reply) => {
    const query = auditExportQuerySchema.parse(request.query ?? {});
    const logs = store.listAudit(query.limit);

    if (query.format === "csv") {
      const header = "id,actor,action,targetType,targetId,createdAt,payload\n";
      const rows = logs.map((entry) =>
        [
          entry.id,
          entry.actor,
          entry.action,
          entry.targetType,
          entry.targetId,
          entry.createdAt,
          JSON.stringify(entry.payload).replaceAll('"', '""')
        ]
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(",")
      );
      reply.header("content-type", "text/csv; charset=utf-8");
      return `${header}${rows.join("\n")}\n`;
    }

    return {
      exportedAt: new Date().toISOString(),
      total: logs.length,
      logs
    };
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

  app.post("/servers/:id/packages/install-batch", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = installPackageBatchSchema.parse(request.body ?? {});
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const result = await deps.content.installPackageBatch({
      serverId: id,
      items: payload.items.map((item) => ({
        provider: item.provider ?? "modrinth",
        projectId: item.projectId,
        requestedVersionId: item.requestedVersionId,
        kind: "plugin"
      }))
    });

    writeAudit(request.user!.username, "package.install_batch", "server", id, {
      summary: result.summary,
      results: result.results.map((entry) => ({
        projectId: entry.projectId,
        provider: entry.provider,
        ok: entry.ok,
        versionId: entry.install?.versionId ?? null,
        error: entry.error ?? null
      }))
    });

    return result;
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

  app.post("/servers/:id/modpack/plan", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = modpackPlanSchema.parse(request.body ?? {});
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }

    const installed = deps.content.listInstalled(id);
    const conflicts: Array<{ level: "warning" | "critical"; code: string; message: string; recommendation: string }> = [];

    if (server.type === "paper" && installed.some((pkg) => pkg.kind === "plugin")) {
      conflicts.push({
        level: "warning",
        code: "paper_plugins_present",
        message: "This server already has Paper plugins installed.",
        recommendation: "Review plugin compatibility before importing a modpack."
      });
    }

    const loaderMismatch = installed.filter(
      (pkg) => pkg.kind === "mod" && pkg.loader && !pkg.loader.toLowerCase().includes(server.type.toLowerCase())
    );
    if (loaderMismatch.length > 0) {
      conflicts.push({
        level: "critical",
        code: "existing_loader_mismatch",
        message: `${loaderMismatch.length} installed mods target a different loader than the selected server type.`,
        recommendation: "Switch loader or remove incompatible mods before continuing."
      });
    }

    return {
      provider: payload.provider,
      projectId: payload.projectId,
      requestedVersionId: payload.requestedVersionId ?? null,
      conflicts,
      rollbackPlan: {
        strategy: "create_backup_before_apply",
        automaticBackup: true,
        rollbackEndpoint: `/servers/${id}/modpack/rollback`
      },
      safeToApply: conflicts.every((entry) => entry.level !== "critical")
    };
  });

  app.post("/servers/:id/modpack/import", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = modpackPlanSchema.parse(request.body ?? {});
    if (!store.getServerById(id)) {
      throw app.httpErrors.notFound("Server not found");
    }

    const preChangeBackup = await deps.backup.createBackup(id);
    const install = await deps.content.installPackage({
      serverId: id,
      provider: payload.provider,
      projectId: payload.projectId,
      requestedVersionId: payload.requestedVersionId,
      kind: "modpack"
    });

    const rollback = store.createModpackRollback({
      serverId: id,
      packageId: install.packageId,
      backupId: preChangeBackup.backupId,
      reason: "modpack_import"
    });
    writeAudit(request.user!.username, "modpack.import", "server", id, {
      provider: payload.provider,
      projectId: payload.projectId,
      rollbackId: rollback.id
    });
    return {
      install,
      rollback
    };
  });

  app.post(
    "/servers/:id/modpack/:packageId/update",
    { preHandler: [authenticate, requireRole("admin")] },
    async (request) => {
      const { id, packageId } = request.params as { id: string; packageId: string };
      if (!store.getServerById(id)) {
        throw app.httpErrors.notFound("Server not found");
      }
      const preChangeBackup = await deps.backup.createBackup(id);
      const update = await deps.content.updateInstalledPackage(id, packageId);
      const rollback = store.createModpackRollback({
        serverId: id,
        packageId,
        backupId: preChangeBackup.backupId,
        reason: "modpack_update"
      });
      writeAudit(request.user!.username, "modpack.update", "server_package", packageId, {
        serverId: id,
        rollbackId: rollback.id
      });
      return {
        update,
        rollback
      };
    }
  );

  app.get("/servers/:id/modpack/rollbacks", { preHandler: [authenticate] }, async (request) => {
    const { id } = request.params as { id: string };
    if (!store.getServerById(id)) {
      throw app.httpErrors.notFound("Server not found");
    }
    return {
      rollbacks: store.listModpackRollbacks(id, 120)
    };
  });

  app.post("/servers/:id/modpack/rollback", { preHandler: [authenticate, requireRole("admin")] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = modpackRollbackSchema.parse(request.body ?? {});
    const server = store.getServerById(id);
    if (!server) {
      throw app.httpErrors.notFound("Server not found");
    }
    if (deps.runtime.isRunning(id) || server.status === "running" || server.status === "starting") {
      const errorMessage = "Server must be stopped before rollback";
      return reply.code(409).send({
        code: "server_running_restore_blocked",
        message: errorMessage,
        error: errorMessage
      });
    }
    const rollback = store.getModpackRollback(payload.rollbackId);
    if (!rollback || rollback.serverId !== id) {
      throw app.httpErrors.notFound("Rollback plan not found for this server");
    }
    const restore = await deps.backup.restoreBackup(id, rollback.backupId);
    writeAudit(request.user!.username, "modpack.rollback", "server", id, {
      rollbackId: rollback.id
    });
    return {
      ok: true,
      rollback,
      restore
    };
  });

  app.delete("/servers/:id/packages/:packageId", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const { id, packageId } = request.params as { id: string; packageId: string };
    deps.content.uninstallPackage(id, packageId);
    writeAudit(request.user!.username, "package.uninstall", "server_package", packageId, { serverId: id });
    return { ok: true };
  });

  app.get("/migration/imports", { preHandler: [authenticate, requireRole("admin")] }, async () => {
    return {
      imports: deps.migration.listRecentImports(120)
    };
  });

  app.post("/migration/import/manual", { preHandler: [authenticate, requireRole("admin")] }, async (request) => {
    const payload = migrationManualSchema.parse(request.body ?? {});
    const imported = deps.migration.importManual(payload);
    writeAudit(request.user!.username, "migration.manual.import", "server", imported.serverId, {
      source: "manual",
      rootPath: payload.rootPath
    });
    return {
      imported
    };
  });

  const importPlatformManifest = (request: { body?: unknown; user?: { username: string } }) => {
    const payload = migrationPlatformManifestSchema.parse(request.body ?? {});
    const outcome = deps.migration.importPlatformManifest({
      manifestPath: payload.manifestPath,
      javaPath: payload.javaPath
    });
    writeAudit(request.user!.username, "migration.manifest.import", "system", "migration", {
      imported: outcome.imported.length,
      failed: outcome.failed.length
    });
    return outcome;
  };

  app.post("/migration/import/platform-manifest", { preHandler: [authenticate, requireRole("admin")] }, async (request) =>
    importPlatformManifest(request)
  );

  app.post("/migration/import/manifest", { preHandler: [authenticate, requireRole("admin")] }, async (request) =>
    importPlatformManifest(request)
  );

  app.post("/migration/import/squidservers", { preHandler: [authenticate, requireRole("admin")] }, async (request, reply) => {
    // Backward-compatible legacy alias; clients should migrate to /migration/import/platform-manifest.
    reply.header("x-simpleservers-deprecated-route", "/migration/import/squidservers");
    reply.header("x-simpleservers-canonical-route", "/migration/import/platform-manifest");
    reply.header("warning", '299 - "Deprecated route. Use /migration/import/platform-manifest"');
    return importPlatformManifest(request);
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
