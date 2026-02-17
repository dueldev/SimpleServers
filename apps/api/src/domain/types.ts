export type ServerRuntimeStatus = "stopped" | "starting" | "running" | "stopping" | "crashed";

export type ServerType = "vanilla" | "paper" | "fabric";

export type UserRole = "owner" | "admin" | "moderator" | "viewer";

export type AlertSeverity = "info" | "warning" | "critical";

export type TunnelProvider = "manual" | "playit" | "cloudflared" | "ngrok";

export type TunnelProtocol = "tcp" | "udp";

export type TaskAction = "restart" | "backup" | "command";
export type ContentProvider = "modrinth" | "curseforge";
export type PackageKind = "mod" | "plugin" | "modpack" | "resourcepack";
export type CloudBackupProvider = "s3" | "backblaze" | "google_drive";

export type ServerRecord = {
  id: string;
  name: string;
  type: ServerType;
  mcVersion: string;
  jarPath: string;
  rootPath: string;
  javaPath: string;
  port: number;
  bedrockPort: number | null;
  minMemoryMb: number;
  maxMemoryMb: number;
  status: ServerRuntimeStatus;
  pid: number | null;
  createdAt: string;
  updatedAt: string;
};

export type UserRecord = {
  id: string;
  username: string;
  role: UserRole;
  apiToken: string;
  createdAt: string;
};

export type AuditRecord = {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  payload: string;
  createdAt: string;
};

export type BackupRecord = {
  id: string;
  serverId: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  restoredAt: string | null;
};

export type AlertRecord = {
  id: string;
  serverId: string;
  severity: AlertSeverity;
  kind: string;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type TaskRecord = {
  id: string;
  serverId: string;
  name: string;
  cronExpr: string;
  action: TaskAction;
  payload: string;
  enabled: number;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastOutput: string | null;
  createdAt: string;
};

export type TunnelRecord = {
  id: string;
  serverId: string;
  provider: TunnelProvider;
  protocol: TunnelProtocol;
  localPort: number;
  publicHost: string;
  publicPort: number;
  status: string;
  configJson: string;
  createdAt: string;
  updatedAt: string;
};

export type ServerPackageRecord = {
  id: string;
  serverId: string;
  provider: ContentProvider;
  projectId: string;
  versionId: string;
  slug: string;
  name: string;
  kind: PackageKind;
  loader: string;
  gameVersion: string;
  filePath: string;
  fileName: string;
  fileHash: string | null;
  installedAt: string;
  updatedAt: string;
};

export type BackupRetentionPolicyRecord = {
  id: string;
  serverId: string;
  maxBackups: number;
  maxAgeDays: number;
  pruneCron: string;
  enabled: number;
  createdAt: string;
  updatedAt: string;
};

export type CrashReportRecord = {
  id: string;
  serverId: string;
  reason: string;
  exitCode: number | null;
  reportPath: string;
  createdAt: string;
};

export type UxTelemetryEventRecord = {
  id: string;
  sessionId: string;
  event: string;
  metadata: string;
  createdAt: string;
};

export type EditorFileSnapshotRecord = {
  id: string;
  serverId: string;
  path: string;
  content: string;
  reason: string;
  createdAt: string;
};

export type ServerPerformanceSampleRecord = {
  id: string;
  serverId: string;
  cpuPercent: number;
  memoryMb: number;
  sampledAt: string;
};

export type ServerStartupEventRecord = {
  id: string;
  serverId: string;
  durationMs: number;
  success: number;
  exitCode: number | null;
  detail: string;
  createdAt: string;
};

export type ServerTickLagEventRecord = {
  id: string;
  serverId: string;
  lagMs: number;
  ticksBehind: number;
  line: string;
  createdAt: string;
};

export type CloudBackupDestinationRecord = {
  id: string;
  serverId: string;
  provider: CloudBackupProvider;
  name: string;
  configJson: string;
  encryptionPassphrase: string;
  enabled: number;
  createdAt: string;
  updatedAt: string;
};

export type CloudBackupArtifactRecord = {
  id: string;
  backupId: string;
  serverId: string;
  destinationId: string;
  remoteKey: string;
  checksumSha256: string;
  encrypted: number;
  sizeBytes: number;
  metadataJson: string;
  status: string;
  uploadedAt: string;
};

export type BackupRestoreEventRecord = {
  id: string;
  serverId: string;
  backupId: string | null;
  source: "local" | "cloud";
  success: number;
  verified: number;
  detail: string;
  durationMs: number;
  createdAt: string;
};

export type TunnelStatusEventRecord = {
  id: string;
  tunnelId: string;
  serverId: string;
  status: string;
  createdAt: string;
};

export type ModpackRollbackRecord = {
  id: string;
  serverId: string;
  packageId: string | null;
  backupId: string;
  reason: string;
  createdAt: string;
};

export type PlayerAdminEventRecord = {
  id: string;
  serverId: string;
  kind: string;
  subject: string;
  detail: string;
  createdAt: string;
};

export type MigrationImportRecord = {
  id: string;
  source: string;
  serverId: string | null;
  name: string;
  status: string;
  detail: string;
  createdAt: string;
};
