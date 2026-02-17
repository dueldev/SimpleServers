import { db } from "../lib/db.js";
import { nowIso, safeJsonStringify, uid } from "../lib/util.js";
import type {
  AlertRecord,
  AuditRecord,
  BackupRestoreEventRecord,
  BackupRetentionPolicyRecord,
  BackupRecord,
  CloudBackupArtifactRecord,
  CloudBackupDestinationRecord,
  CrashReportRecord,
  EditorFileSnapshotRecord,
  MigrationImportRecord,
  ModpackRollbackRecord,
  PlayerAdminEventRecord,
  ServerPerformanceSampleRecord,
  ServerStartupEventRecord,
  ServerTickLagEventRecord,
  ServerPackageRecord,
  ServerRecord,
  TaskRecord,
  TunnelRecord,
  TunnelStatusEventRecord,
  UxTelemetryEventRecord,
  UserRecord,
  UserRole
} from "../domain/types.js";

type RawServer = {
  id: string;
  name: string;
  type: ServerRecord["type"];
  mc_version: string;
  jar_path: string;
  root_path: string;
  java_path: string;
  port: number;
  bedrock_port: number | null;
  min_memory_mb: number;
  max_memory_mb: number;
  status: ServerRecord["status"];
  pid: number | null;
  created_at: string;
  updated_at: string;
};

type RawServerPackage = {
  id: string;
  server_id: string;
  provider: ServerPackageRecord["provider"];
  project_id: string;
  version_id: string;
  slug: string;
  name: string;
  kind: ServerPackageRecord["kind"];
  loader: string;
  game_version: string;
  file_path: string;
  file_name: string;
  file_hash: string | null;
  installed_at: string;
  updated_at: string;
};

type RawBackupPolicy = {
  id: string;
  server_id: string;
  max_backups: number;
  max_age_days: number;
  prune_cron: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

type RawCrashReport = {
  id: string;
  server_id: string;
  reason: string;
  exit_code: number | null;
  report_path: string;
  created_at: string;
};

type RawUxTelemetryEvent = {
  id: string;
  session_id: string;
  event: string;
  metadata: string;
  created_at: string;
};

type RawEditorFileSnapshot = {
  id: string;
  server_id: string;
  path: string;
  content: string;
  reason: string;
  created_at: string;
};

type RawServerPerformanceSample = {
  id: string;
  server_id: string;
  cpu_percent: number;
  memory_mb: number;
  sampled_at: string;
};

type RawServerStartupEvent = {
  id: string;
  server_id: string;
  duration_ms: number;
  success: number;
  exit_code: number | null;
  detail: string;
  created_at: string;
};

type RawServerTickLagEvent = {
  id: string;
  server_id: string;
  lag_ms: number;
  ticks_behind: number;
  line: string;
  created_at: string;
};

type RawCloudBackupDestination = {
  id: string;
  server_id: string;
  provider: CloudBackupDestinationRecord["provider"];
  name: string;
  config_json: string;
  encryption_passphrase: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

type RawCloudBackupArtifact = {
  id: string;
  backup_id: string;
  server_id: string;
  destination_id: string;
  remote_key: string;
  checksum_sha256: string;
  encrypted: number;
  size_bytes: number;
  metadata_json: string;
  status: string;
  uploaded_at: string;
};

type RawBackupRestoreEvent = {
  id: string;
  server_id: string;
  backup_id: string | null;
  source: BackupRestoreEventRecord["source"];
  success: number;
  verified: number;
  detail: string;
  duration_ms: number;
  created_at: string;
};

type RawTunnelStatusEvent = {
  id: string;
  tunnel_id: string;
  server_id: string;
  status: string;
  created_at: string;
};

type RawModpackRollback = {
  id: string;
  server_id: string;
  package_id: string | null;
  backup_id: string;
  reason: string;
  created_at: string;
};

type RawPlayerAdminEvent = {
  id: string;
  server_id: string;
  kind: string;
  subject: string;
  detail: string;
  created_at: string;
};

type RawMigrationImport = {
  id: string;
  source: string;
  server_id: string | null;
  name: string;
  status: string;
  detail: string;
  created_at: string;
};

function toServer(row: RawServer): ServerRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    mcVersion: row.mc_version,
    jarPath: row.jar_path,
    rootPath: row.root_path,
    javaPath: row.java_path,
    port: row.port,
    bedrockPort: row.bedrock_port,
    minMemoryMb: row.min_memory_mb,
    maxMemoryMb: row.max_memory_mb,
    status: row.status,
    pid: row.pid,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toServerPackage(row: RawServerPackage): ServerPackageRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    provider: row.provider,
    projectId: row.project_id,
    versionId: row.version_id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    loader: row.loader,
    gameVersion: row.game_version,
    filePath: row.file_path,
    fileName: row.file_name,
    fileHash: row.file_hash,
    installedAt: row.installed_at,
    updatedAt: row.updated_at
  };
}

function toBackupPolicy(row: RawBackupPolicy): BackupRetentionPolicyRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    maxBackups: row.max_backups,
    maxAgeDays: row.max_age_days,
    pruneCron: row.prune_cron,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toCrashReport(row: RawCrashReport): CrashReportRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    reason: row.reason,
    exitCode: row.exit_code,
    reportPath: row.report_path,
    createdAt: row.created_at
  };
}

function toUxTelemetryEvent(row: RawUxTelemetryEvent): UxTelemetryEventRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    event: row.event,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

function toEditorFileSnapshot(row: RawEditorFileSnapshot): EditorFileSnapshotRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    path: row.path,
    content: row.content,
    reason: row.reason,
    createdAt: row.created_at
  };
}

function toServerPerformanceSample(row: RawServerPerformanceSample): ServerPerformanceSampleRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    cpuPercent: row.cpu_percent,
    memoryMb: row.memory_mb,
    sampledAt: row.sampled_at
  };
}

function toServerStartupEvent(row: RawServerStartupEvent): ServerStartupEventRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    durationMs: row.duration_ms,
    success: row.success,
    exitCode: row.exit_code,
    detail: row.detail,
    createdAt: row.created_at
  };
}

function toServerTickLagEvent(row: RawServerTickLagEvent): ServerTickLagEventRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    lagMs: row.lag_ms,
    ticksBehind: row.ticks_behind,
    line: row.line,
    createdAt: row.created_at
  };
}

function toCloudBackupDestination(row: RawCloudBackupDestination): CloudBackupDestinationRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    provider: row.provider,
    name: row.name,
    configJson: row.config_json,
    encryptionPassphrase: row.encryption_passphrase,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toCloudBackupArtifact(row: RawCloudBackupArtifact): CloudBackupArtifactRecord {
  return {
    id: row.id,
    backupId: row.backup_id,
    serverId: row.server_id,
    destinationId: row.destination_id,
    remoteKey: row.remote_key,
    checksumSha256: row.checksum_sha256,
    encrypted: row.encrypted,
    sizeBytes: row.size_bytes,
    metadataJson: row.metadata_json,
    status: row.status,
    uploadedAt: row.uploaded_at
  };
}

function toBackupRestoreEvent(row: RawBackupRestoreEvent): BackupRestoreEventRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    backupId: row.backup_id,
    source: row.source,
    success: row.success,
    verified: row.verified,
    detail: row.detail,
    durationMs: row.duration_ms,
    createdAt: row.created_at
  };
}

function toTunnelStatusEvent(row: RawTunnelStatusEvent): TunnelStatusEventRecord {
  return {
    id: row.id,
    tunnelId: row.tunnel_id,
    serverId: row.server_id,
    status: row.status,
    createdAt: row.created_at
  };
}

function toModpackRollback(row: RawModpackRollback): ModpackRollbackRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    packageId: row.package_id,
    backupId: row.backup_id,
    reason: row.reason,
    createdAt: row.created_at
  };
}

function toPlayerAdminEvent(row: RawPlayerAdminEvent): PlayerAdminEventRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    kind: row.kind,
    subject: row.subject,
    detail: row.detail,
    createdAt: row.created_at
  };
}

function toMigrationImport(row: RawMigrationImport): MigrationImportRecord {
  return {
    id: row.id,
    source: row.source,
    serverId: row.server_id,
    name: row.name,
    status: row.status,
    detail: row.detail,
    createdAt: row.created_at
  };
}

export const store = {
  ensureDefaultAdmin(username: string, token: string): UserRecord {
    const existing = db
      .prepare("SELECT id, username, role, api_token as apiToken, created_at as createdAt FROM users WHERE username = ?")
      .get(username) as UserRecord | undefined;

    if (existing) {
      if (existing.apiToken !== token) {
        db.prepare("UPDATE users SET api_token = ? WHERE id = ?").run(token, existing.id);
        return { ...existing, apiToken: token };
      }
      return existing;
    }

    const record: UserRecord = {
      id: uid("usr"),
      username,
      role: "owner",
      apiToken: token,
      createdAt: nowIso()
    };

    db.prepare("INSERT INTO users (id, username, role, api_token, created_at) VALUES (?, ?, ?, ?, ?)").run(
      record.id,
      record.username,
      record.role,
      record.apiToken,
      record.createdAt
    );

    return record;
  },

  findUserByToken(token: string): UserRecord | undefined {
    const row = db
      .prepare("SELECT id, username, role, api_token as apiToken, created_at as createdAt FROM users WHERE api_token = ?")
      .get(token) as UserRecord | undefined;
    return row;
  },

  listUsers(): UserRecord[] {
    return db
      .prepare("SELECT id, username, role, api_token as apiToken, created_at as createdAt FROM users ORDER BY created_at DESC")
      .all() as UserRecord[];
  },

  getUserById(id: string): UserRecord | undefined {
    return db
      .prepare("SELECT id, username, role, api_token as apiToken, created_at as createdAt FROM users WHERE id = ?")
      .get(id) as UserRecord | undefined;
  },

  createUser(input: { username: string; role: UserRole; apiToken: string }): UserRecord {
    const record: UserRecord = {
      id: uid("usr"),
      username: input.username,
      role: input.role,
      apiToken: input.apiToken,
      createdAt: nowIso()
    };

    db.prepare("INSERT INTO users (id, username, role, api_token, created_at) VALUES (?, ?, ?, ?, ?)").run(
      record.id,
      record.username,
      record.role,
      record.apiToken,
      record.createdAt
    );

    return record;
  },

  rotateUserToken(userId: string, newToken: string): UserRecord | undefined {
    db.prepare("UPDATE users SET api_token = ? WHERE id = ?").run(newToken, userId);
    return this.getUserById(userId);
  },

  listServers(): ServerRecord[] {
    const rows = db.prepare("SELECT * FROM servers ORDER BY created_at DESC").all() as RawServer[];
    return rows.map(toServer);
  },

  getServerById(id: string): ServerRecord | undefined {
    const row = db.prepare("SELECT * FROM servers WHERE id = ?").get(id) as RawServer | undefined;
    return row ? toServer(row) : undefined;
  },

  createServer(input: {
    name: string;
    type: ServerRecord["type"];
    mcVersion: string;
    jarPath: string;
    rootPath: string;
    javaPath: string;
    port: number;
    bedrockPort: number | null;
    minMemoryMb: number;
    maxMemoryMb: number;
  }): ServerRecord {
    const now = nowIso();
    const record: ServerRecord = {
      id: uid("srv"),
      name: input.name,
      type: input.type,
      mcVersion: input.mcVersion,
      jarPath: input.jarPath,
      rootPath: input.rootPath,
      javaPath: input.javaPath,
      port: input.port,
      bedrockPort: input.bedrockPort,
      minMemoryMb: input.minMemoryMb,
      maxMemoryMb: input.maxMemoryMb,
      status: "stopped",
      pid: null,
      createdAt: now,
      updatedAt: now
    };

    db.prepare(
      `INSERT INTO servers (
        id, name, type, mc_version, jar_path, root_path, java_path, port, bedrock_port,
        min_memory_mb, max_memory_mb, status, pid, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      record.id,
      record.name,
      record.type,
      record.mcVersion,
      record.jarPath,
      record.rootPath,
      record.javaPath,
      record.port,
      record.bedrockPort,
      record.minMemoryMb,
      record.maxMemoryMb,
      record.status,
      record.pid,
      record.createdAt,
      record.updatedAt
    );

    return record;
  },

  updateServerState(id: string, status: ServerRecord["status"], pid: number | null): void {
    db.prepare("UPDATE servers SET status = ?, pid = ?, updated_at = ? WHERE id = ?").run(status, pid, nowIso(), id);
  },

  deleteServer(id: string): void {
    db.prepare("DELETE FROM servers WHERE id = ?").run(id);
  },

  createAudit(input: {
    actor: string;
    action: string;
    targetType: string;
    targetId: string;
    payload?: unknown;
  }): AuditRecord {
    const record: AuditRecord = {
      id: uid("audit"),
      actor: input.actor,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      payload: safeJsonStringify(input.payload ?? {}),
      createdAt: nowIso()
    };

    db.prepare(
      "INSERT INTO audit_logs (id, actor, action, target_type, target_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(record.id, record.actor, record.action, record.targetType, record.targetId, record.payload, record.createdAt);

    return record;
  },

  listAudit(limit = 200): AuditRecord[] {
    return db
      .prepare(
        "SELECT id, actor, action, target_type as targetType, target_id as targetId, payload, created_at as createdAt FROM audit_logs ORDER BY created_at DESC LIMIT ?"
      )
      .all(limit) as AuditRecord[];
  },

  createBackup(input: { serverId: string; filePath: string; sizeBytes: number }): BackupRecord {
    const record: BackupRecord = {
      id: uid("bkp"),
      serverId: input.serverId,
      filePath: input.filePath,
      sizeBytes: input.sizeBytes,
      createdAt: nowIso(),
      restoredAt: null
    };

    db.prepare(
      "INSERT INTO backups (id, server_id, file_path, size_bytes, created_at, restored_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(record.id, record.serverId, record.filePath, record.sizeBytes, record.createdAt, record.restoredAt);

    return record;
  },

  markBackupRestored(backupId: string): void {
    db.prepare("UPDATE backups SET restored_at = ? WHERE id = ?").run(nowIso(), backupId);
  },

  listBackups(serverId: string): BackupRecord[] {
    return db
      .prepare(
        "SELECT id, server_id as serverId, file_path as filePath, size_bytes as sizeBytes, created_at as createdAt, restored_at as restoredAt FROM backups WHERE server_id = ? ORDER BY created_at DESC"
      )
      .all(serverId) as BackupRecord[];
  },

  getBackup(id: string): BackupRecord | undefined {
    return db
      .prepare(
        "SELECT id, server_id as serverId, file_path as filePath, size_bytes as sizeBytes, created_at as createdAt, restored_at as restoredAt FROM backups WHERE id = ?"
      )
      .get(id) as BackupRecord | undefined;
  },

  deleteBackup(id: string): void {
    db.prepare("DELETE FROM backups WHERE id = ?").run(id);
  },

  createAlert(input: { serverId: string; severity: AlertRecord["severity"]; kind: string; message: string }): AlertRecord {
    const record: AlertRecord = {
      id: uid("alrt"),
      serverId: input.serverId,
      severity: input.severity,
      kind: input.kind,
      message: input.message,
      createdAt: nowIso(),
      resolvedAt: null
    };

    db.prepare(
      "INSERT INTO alerts (id, server_id, severity, kind, message, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(record.id, record.serverId, record.severity, record.kind, record.message, record.createdAt, record.resolvedAt);

    return record;
  },

  listAlerts(serverId?: string): AlertRecord[] {
    if (serverId) {
      return db
        .prepare(
          "SELECT id, server_id as serverId, severity, kind, message, created_at as createdAt, resolved_at as resolvedAt FROM alerts WHERE server_id = ? ORDER BY created_at DESC"
        )
        .all(serverId) as AlertRecord[];
    }

    return db
      .prepare(
        "SELECT id, server_id as serverId, severity, kind, message, created_at as createdAt, resolved_at as resolvedAt FROM alerts ORDER BY created_at DESC"
      )
      .all() as AlertRecord[];
  },

  resolveAlert(id: string): void {
    db.prepare("UPDATE alerts SET resolved_at = ? WHERE id = ?").run(nowIso(), id);
  },

  listTasks(serverId?: string): TaskRecord[] {
    if (serverId) {
      return db
        .prepare(
          "SELECT id, server_id as serverId, name, cron_expr as cronExpr, action, payload, enabled, last_run_at as lastRunAt, last_status as lastStatus, last_output as lastOutput, created_at as createdAt FROM tasks WHERE server_id = ? ORDER BY created_at DESC"
        )
        .all(serverId) as TaskRecord[];
    }

    return db
      .prepare(
        "SELECT id, server_id as serverId, name, cron_expr as cronExpr, action, payload, enabled, last_run_at as lastRunAt, last_status as lastStatus, last_output as lastOutput, created_at as createdAt FROM tasks ORDER BY created_at DESC"
      )
      .all() as TaskRecord[];
  },

  createTask(input: {
    serverId: string;
    name: string;
    cronExpr: string;
    action: TaskRecord["action"];
    payload?: unknown;
    enabled: boolean;
  }): TaskRecord {
    const record: TaskRecord = {
      id: uid("tsk"),
      serverId: input.serverId,
      name: input.name,
      cronExpr: input.cronExpr,
      action: input.action,
      payload: safeJsonStringify(input.payload ?? {}),
      enabled: input.enabled ? 1 : 0,
      lastRunAt: null,
      lastStatus: null,
      lastOutput: null,
      createdAt: nowIso()
    };

    db.prepare(
      "INSERT INTO tasks (id, server_id, name, cron_expr, action, payload, enabled, last_run_at, last_status, last_output, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      record.id,
      record.serverId,
      record.name,
      record.cronExpr,
      record.action,
      record.payload,
      record.enabled,
      record.lastRunAt,
      record.lastStatus,
      record.lastOutput,
      record.createdAt
    );

    return record;
  },

  updateTaskRun(taskId: string, status: string, output: string): void {
    db.prepare("UPDATE tasks SET last_run_at = ?, last_status = ?, last_output = ? WHERE id = ?").run(
      nowIso(),
      status,
      output,
      taskId
    );
  },

  setTaskEnabled(taskId: string, enabled: boolean): void {
    db.prepare("UPDATE tasks SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, taskId);
  },

  deleteTask(taskId: string): void {
    db.prepare("DELETE FROM tasks WHERE id = ?").run(taskId);
  },

  createTunnel(input: {
    serverId: string;
    provider: TunnelRecord["provider"];
    protocol: TunnelRecord["protocol"];
    localPort: number;
    publicHost: string;
    publicPort: number;
    status: string;
    configJson?: string;
  }): TunnelRecord {
    const now = nowIso();
    const record: TunnelRecord = {
      id: uid("tnl"),
      serverId: input.serverId,
      provider: input.provider,
      protocol: input.protocol,
      localPort: input.localPort,
      publicHost: input.publicHost,
      publicPort: input.publicPort,
      status: input.status,
      configJson: input.configJson ?? "{}",
      createdAt: now,
      updatedAt: now
    };

    db.prepare(
      "INSERT INTO tunnels (id, server_id, provider, protocol, local_port, public_host, public_port, status, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      record.id,
      record.serverId,
      record.provider,
      record.protocol,
      record.localPort,
      record.publicHost,
      record.publicPort,
      record.status,
      record.configJson,
      record.createdAt,
      record.updatedAt
    );

    db.prepare(
      "INSERT INTO tunnel_status_events (id, tunnel_id, server_id, status, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(uid("tnlstat"), record.id, record.serverId, record.status, now);

    return record;
  },

  listTunnels(serverId?: string): TunnelRecord[] {
    const query =
      "SELECT id, server_id as serverId, provider, protocol, local_port as localPort, public_host as publicHost, public_port as publicPort, status, config_json as configJson, created_at as createdAt, updated_at as updatedAt FROM tunnels";

    if (serverId) {
      return db.prepare(`${query} WHERE server_id = ? ORDER BY created_at DESC`).all(serverId) as TunnelRecord[];
    }

    return db.prepare(`${query} ORDER BY created_at DESC`).all() as TunnelRecord[];
  },

  getTunnel(id: string): TunnelRecord | undefined {
    return db
      .prepare(
        "SELECT id, server_id as serverId, provider, protocol, local_port as localPort, public_host as publicHost, public_port as publicPort, status, config_json as configJson, created_at as createdAt, updated_at as updatedAt FROM tunnels WHERE id = ?"
      )
      .get(id) as TunnelRecord | undefined;
  },

  updateTunnelStatus(id: string, status: string): void {
    const tunnel = this.getTunnel(id);
    const now = nowIso();
    db.prepare("UPDATE tunnels SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
    if (tunnel) {
      db.prepare(
        "INSERT INTO tunnel_status_events (id, tunnel_id, server_id, status, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(uid("tnlstat"), tunnel.id, tunnel.serverId, status, now);
    }
  },

  updateTunnelEndpoint(id: string, input: { publicHost: string; publicPort: number }): void {
    db.prepare("UPDATE tunnels SET public_host = ?, public_port = ?, updated_at = ? WHERE id = ?").run(
      input.publicHost,
      input.publicPort,
      nowIso(),
      id
    );
  },

  updateTunnelConfig(id: string, configJson: string): void {
    db.prepare("UPDATE tunnels SET config_json = ?, updated_at = ? WHERE id = ?").run(configJson, nowIso(), id);
  },

  listServerPackages(serverId: string): ServerPackageRecord[] {
    const rows = db
      .prepare("SELECT * FROM server_packages WHERE server_id = ? ORDER BY installed_at DESC")
      .all(serverId) as RawServerPackage[];
    return rows.map(toServerPackage);
  },

  getServerPackage(id: string): ServerPackageRecord | undefined {
    const row = db.prepare("SELECT * FROM server_packages WHERE id = ?").get(id) as RawServerPackage | undefined;
    return row ? toServerPackage(row) : undefined;
  },

  getServerPackageByProject(serverId: string, provider: ServerPackageRecord["provider"], projectId: string): ServerPackageRecord | undefined {
    const row = db
      .prepare(
        "SELECT * FROM server_packages WHERE server_id = ? AND provider = ? AND project_id = ? ORDER BY installed_at DESC LIMIT 1"
      )
      .get(serverId, provider, projectId) as RawServerPackage | undefined;
    return row ? toServerPackage(row) : undefined;
  },

  createServerPackage(input: Omit<ServerPackageRecord, "id" | "installedAt" | "updatedAt">): ServerPackageRecord {
    const now = nowIso();
    const record: ServerPackageRecord = {
      id: uid("pkg"),
      installedAt: now,
      updatedAt: now,
      ...input
    };

    db.prepare(
      `INSERT INTO server_packages (
        id, server_id, provider, project_id, version_id, slug, name, kind, loader, game_version, file_path, file_name, file_hash, installed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      record.id,
      record.serverId,
      record.provider,
      record.projectId,
      record.versionId,
      record.slug,
      record.name,
      record.kind,
      record.loader,
      record.gameVersion,
      record.filePath,
      record.fileName,
      record.fileHash,
      record.installedAt,
      record.updatedAt
    );

    return record;
  },

  updateServerPackageVersion(
    id: string,
    input: {
      versionId: string;
      gameVersion: string;
      filePath: string;
      fileName: string;
      fileHash: string | null;
      loader: string;
    }
  ): void {
    db.prepare(
      "UPDATE server_packages SET version_id = ?, game_version = ?, file_path = ?, file_name = ?, file_hash = ?, loader = ?, updated_at = ? WHERE id = ?"
    ).run(input.versionId, input.gameVersion, input.filePath, input.fileName, input.fileHash, input.loader, nowIso(), id);
  },

  deleteServerPackage(id: string): void {
    db.prepare("DELETE FROM server_packages WHERE id = ?").run(id);
  },

  getBackupPolicy(serverId: string): BackupRetentionPolicyRecord | undefined {
    const row = db.prepare("SELECT * FROM backup_policies WHERE server_id = ?").get(serverId) as RawBackupPolicy | undefined;
    return row ? toBackupPolicy(row) : undefined;
  },

  setBackupPolicy(input: {
    serverId: string;
    maxBackups: number;
    maxAgeDays: number;
    pruneCron: string;
    enabled: boolean;
  }): BackupRetentionPolicyRecord {
    const existing = this.getBackupPolicy(input.serverId);
    const now = nowIso();

    if (!existing) {
      const record: BackupRetentionPolicyRecord = {
        id: uid("pol"),
        serverId: input.serverId,
        maxBackups: input.maxBackups,
        maxAgeDays: input.maxAgeDays,
        pruneCron: input.pruneCron,
        enabled: input.enabled ? 1 : 0,
        createdAt: now,
        updatedAt: now
      };

      db.prepare(
        "INSERT INTO backup_policies (id, server_id, max_backups, max_age_days, prune_cron, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        record.id,
        record.serverId,
        record.maxBackups,
        record.maxAgeDays,
        record.pruneCron,
        record.enabled,
        record.createdAt,
        record.updatedAt
      );

      return record;
    }

    db.prepare(
      "UPDATE backup_policies SET max_backups = ?, max_age_days = ?, prune_cron = ?, enabled = ?, updated_at = ? WHERE id = ?"
    ).run(input.maxBackups, input.maxAgeDays, input.pruneCron, input.enabled ? 1 : 0, now, existing.id);

    return this.getBackupPolicy(input.serverId)!;
  },

  listBackupPolicies(): BackupRetentionPolicyRecord[] {
    const rows = db.prepare("SELECT * FROM backup_policies ORDER BY created_at DESC").all() as RawBackupPolicy[];
    return rows.map(toBackupPolicy);
  },

  createCrashReport(input: { serverId: string; reason: string; exitCode: number | null; reportPath: string }): CrashReportRecord {
    const record: CrashReportRecord = {
      id: uid("crash"),
      serverId: input.serverId,
      reason: input.reason,
      exitCode: input.exitCode,
      reportPath: input.reportPath,
      createdAt: nowIso()
    };

    db.prepare(
      "INSERT INTO crash_reports (id, server_id, reason, exit_code, report_path, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(record.id, record.serverId, record.reason, record.exitCode, record.reportPath, record.createdAt);

    return record;
  },

  listCrashReports(serverId: string): CrashReportRecord[] {
    const rows = db
      .prepare("SELECT * FROM crash_reports WHERE server_id = ? ORDER BY created_at DESC")
      .all(serverId) as RawCrashReport[];
    return rows.map(toCrashReport);
  },

  getCrashReport(id: string): CrashReportRecord | undefined {
    const row = db.prepare("SELECT * FROM crash_reports WHERE id = ?").get(id) as RawCrashReport | undefined;
    return row ? toCrashReport(row) : undefined;
  },

  createEditorFileSnapshot(input: {
    serverId: string;
    path: string;
    content: string;
    reason: string;
  }): EditorFileSnapshotRecord {
    const record: EditorFileSnapshotRecord = {
      id: uid("snap"),
      serverId: input.serverId,
      path: input.path,
      content: input.content,
      reason: input.reason,
      createdAt: nowIso()
    };

    db.prepare(
      "INSERT INTO editor_file_snapshots (id, server_id, path, content, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(record.id, record.serverId, record.path, record.content, record.reason, record.createdAt);

    return record;
  },

  listEditorFileSnapshots(input: {
    serverId: string;
    path: string;
    limit?: number;
  }): EditorFileSnapshotRecord[] {
    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    const rows = db
      .prepare(
        "SELECT * FROM editor_file_snapshots WHERE server_id = ? AND path = ? ORDER BY created_at DESC LIMIT ?"
      )
      .all(input.serverId, input.path, limit) as RawEditorFileSnapshot[];
    return rows.map(toEditorFileSnapshot);
  },

  getEditorFileSnapshot(id: string): EditorFileSnapshotRecord | undefined {
    const row = db.prepare("SELECT * FROM editor_file_snapshots WHERE id = ?").get(id) as RawEditorFileSnapshot | undefined;
    return row ? toEditorFileSnapshot(row) : undefined;
  },

  pruneEditorFileSnapshots(input: {
    serverId: string;
    path: string;
    keep: number;
  }): void {
    const keep = Math.max(1, Math.min(input.keep, 200));
    db.prepare(
      `DELETE FROM editor_file_snapshots
       WHERE id IN (
         SELECT id FROM editor_file_snapshots
         WHERE server_id = ? AND path = ?
         ORDER BY created_at DESC
         LIMIT -1 OFFSET ?
       )`
    ).run(input.serverId, input.path, keep);
  },

  createServerPerformanceSample(input: {
    serverId: string;
    cpuPercent: number;
    memoryMb: number;
    sampledAt?: string;
  }): ServerPerformanceSampleRecord {
    const record: ServerPerformanceSampleRecord = {
      id: uid("perf"),
      serverId: input.serverId,
      cpuPercent: input.cpuPercent,
      memoryMb: input.memoryMb,
      sampledAt: input.sampledAt ?? nowIso()
    };

    db.prepare(
      "INSERT INTO server_performance_samples (id, server_id, cpu_percent, memory_mb, sampled_at) VALUES (?, ?, ?, ?, ?)"
    ).run(record.id, record.serverId, record.cpuPercent, record.memoryMb, record.sampledAt);

    return record;
  },

  listServerPerformanceSamples(input: {
    serverId: string;
    since?: string;
    limit?: number;
  }): ServerPerformanceSampleRecord[] {
    const limit = Math.max(1, Math.min(input.limit ?? 200, 2000));
    const rows = input.since
      ? (db
          .prepare(
            "SELECT * FROM server_performance_samples WHERE server_id = ? AND sampled_at >= ? ORDER BY sampled_at DESC LIMIT ?"
          )
          .all(input.serverId, input.since, limit) as RawServerPerformanceSample[])
      : (db
          .prepare("SELECT * FROM server_performance_samples WHERE server_id = ? ORDER BY sampled_at DESC LIMIT ?")
          .all(input.serverId, limit) as RawServerPerformanceSample[]);
    return rows.map(toServerPerformanceSample);
  },

  pruneServerPerformanceSamples(input: {
    olderThan: string;
  }): number {
    const result = db.prepare("DELETE FROM server_performance_samples WHERE sampled_at < ?").run(input.olderThan);
    return result.changes;
  },

  createServerStartupEvent(input: {
    serverId: string;
    durationMs: number;
    success: boolean;
    exitCode: number | null;
    detail: string;
    createdAt?: string;
  }): ServerStartupEventRecord {
    const record: ServerStartupEventRecord = {
      id: uid("boot"),
      serverId: input.serverId,
      durationMs: input.durationMs,
      success: input.success ? 1 : 0,
      exitCode: input.exitCode,
      detail: input.detail,
      createdAt: input.createdAt ?? nowIso()
    };

    db.prepare(
      "INSERT INTO server_startup_events (id, server_id, duration_ms, success, exit_code, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(record.id, record.serverId, record.durationMs, record.success, record.exitCode, record.detail, record.createdAt);

    return record;
  },

  listServerStartupEvents(input: {
    serverId: string;
    limit?: number;
  }): ServerStartupEventRecord[] {
    const limit = Math.max(1, Math.min(input.limit ?? 50, 500));
    const rows = db
      .prepare("SELECT * FROM server_startup_events WHERE server_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(input.serverId, limit) as RawServerStartupEvent[];
    return rows.map(toServerStartupEvent);
  },

  createServerTickLagEvent(input: {
    serverId: string;
    lagMs: number;
    ticksBehind: number;
    line: string;
    createdAt?: string;
  }): ServerTickLagEventRecord {
    const record: ServerTickLagEventRecord = {
      id: uid("tick"),
      serverId: input.serverId,
      lagMs: input.lagMs,
      ticksBehind: input.ticksBehind,
      line: input.line.slice(0, 600),
      createdAt: input.createdAt ?? nowIso()
    };

    db.prepare(
      "INSERT INTO server_tick_lag_events (id, server_id, lag_ms, ticks_behind, line, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(record.id, record.serverId, record.lagMs, record.ticksBehind, record.line, record.createdAt);

    return record;
  },

  listServerTickLagEvents(input: {
    serverId: string;
    since?: string;
    limit?: number;
  }): ServerTickLagEventRecord[] {
    const limit = Math.max(1, Math.min(input.limit ?? 100, 1000));
    const rows = input.since
      ? (db
          .prepare(
            "SELECT * FROM server_tick_lag_events WHERE server_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?"
          )
          .all(input.serverId, input.since, limit) as RawServerTickLagEvent[])
      : (db
          .prepare("SELECT * FROM server_tick_lag_events WHERE server_id = ? ORDER BY created_at DESC LIMIT ?")
          .all(input.serverId, limit) as RawServerTickLagEvent[]);
    return rows.map(toServerTickLagEvent);
  },

  pruneServerTickLagEvents(input: {
    olderThan: string;
  }): number {
    const result = db.prepare("DELETE FROM server_tick_lag_events WHERE created_at < ?").run(input.olderThan);
    return result.changes;
  },

  createUxTelemetryEvent(input: {
    sessionId: string;
    event: string;
    metadata?: unknown;
  }): UxTelemetryEventRecord {
    const record: UxTelemetryEventRecord = {
      id: uid("uxevt"),
      sessionId: input.sessionId,
      event: input.event,
      metadata: safeJsonStringify(input.metadata ?? {}),
      createdAt: nowIso()
    };

    db.prepare("INSERT INTO ux_telemetry_events (id, session_id, event, metadata, created_at) VALUES (?, ?, ?, ?, ?)").run(
      record.id,
      record.sessionId,
      record.event,
      record.metadata,
      record.createdAt
    );

    return record;
  },

  listUxTelemetryEvents(input?: {
    since?: string;
    limit?: number;
  }): UxTelemetryEventRecord[] {
    const limit = input?.limit ?? 500;
    if (input?.since) {
      const rows = db
        .prepare("SELECT * FROM ux_telemetry_events WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?")
        .all(input.since, limit) as RawUxTelemetryEvent[];
      return rows.map(toUxTelemetryEvent);
    }

    const rows = db.prepare("SELECT * FROM ux_telemetry_events ORDER BY created_at DESC LIMIT ?").all(limit) as RawUxTelemetryEvent[];
    return rows.map(toUxTelemetryEvent);
  },

  createCloudBackupDestination(input: {
    serverId: string;
    provider: CloudBackupDestinationRecord["provider"];
    name: string;
    configJson: string;
    encryptionPassphrase: string;
    enabled: boolean;
  }): CloudBackupDestinationRecord {
    const now = nowIso();
    const record: CloudBackupDestinationRecord = {
      id: uid("cldst"),
      serverId: input.serverId,
      provider: input.provider,
      name: input.name,
      configJson: input.configJson,
      encryptionPassphrase: input.encryptionPassphrase,
      enabled: input.enabled ? 1 : 0,
      createdAt: now,
      updatedAt: now
    };

    db.prepare(
      `INSERT INTO cloud_backup_destinations (
        id, server_id, provider, name, config_json, encryption_passphrase, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      record.id,
      record.serverId,
      record.provider,
      record.name,
      record.configJson,
      record.encryptionPassphrase,
      record.enabled,
      record.createdAt,
      record.updatedAt
    );

    return record;
  },

  updateCloudBackupDestination(
    id: string,
    input: {
      name: string;
      configJson: string;
      encryptionPassphrase: string;
      enabled: boolean;
    }
  ): CloudBackupDestinationRecord | undefined {
    db.prepare(
      "UPDATE cloud_backup_destinations SET name = ?, config_json = ?, encryption_passphrase = ?, enabled = ?, updated_at = ? WHERE id = ?"
    ).run(input.name, input.configJson, input.encryptionPassphrase, input.enabled ? 1 : 0, nowIso(), id);
    return this.getCloudBackupDestination(id);
  },

  listCloudBackupDestinations(serverId: string): CloudBackupDestinationRecord[] {
    const rows = db
      .prepare("SELECT * FROM cloud_backup_destinations WHERE server_id = ? ORDER BY created_at DESC")
      .all(serverId) as RawCloudBackupDestination[];
    return rows.map(toCloudBackupDestination);
  },

  getCloudBackupDestination(id: string): CloudBackupDestinationRecord | undefined {
    const row = db.prepare("SELECT * FROM cloud_backup_destinations WHERE id = ?").get(id) as RawCloudBackupDestination | undefined;
    return row ? toCloudBackupDestination(row) : undefined;
  },

  deleteCloudBackupDestination(id: string): void {
    db.prepare("DELETE FROM cloud_backup_destinations WHERE id = ?").run(id);
  },

  createCloudBackupArtifact(input: {
    backupId: string;
    serverId: string;
    destinationId: string;
    remoteKey: string;
    checksumSha256: string;
    encrypted: boolean;
    sizeBytes: number;
    metadataJson: string;
    status: string;
  }): CloudBackupArtifactRecord {
    const record: CloudBackupArtifactRecord = {
      id: uid("cldart"),
      backupId: input.backupId,
      serverId: input.serverId,
      destinationId: input.destinationId,
      remoteKey: input.remoteKey,
      checksumSha256: input.checksumSha256,
      encrypted: input.encrypted ? 1 : 0,
      sizeBytes: input.sizeBytes,
      metadataJson: input.metadataJson,
      status: input.status,
      uploadedAt: nowIso()
    };

    db.prepare(
      `INSERT INTO cloud_backup_artifacts (
        id, backup_id, server_id, destination_id, remote_key, checksum_sha256, encrypted, size_bytes, metadata_json, status, uploaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      record.id,
      record.backupId,
      record.serverId,
      record.destinationId,
      record.remoteKey,
      record.checksumSha256,
      record.encrypted,
      record.sizeBytes,
      record.metadataJson,
      record.status,
      record.uploadedAt
    );

    return record;
  },

  listCloudBackupArtifacts(serverId: string): CloudBackupArtifactRecord[] {
    const rows = db
      .prepare("SELECT * FROM cloud_backup_artifacts WHERE server_id = ? ORDER BY uploaded_at DESC")
      .all(serverId) as RawCloudBackupArtifact[];
    return rows.map(toCloudBackupArtifact);
  },

  getCloudBackupArtifact(id: string): CloudBackupArtifactRecord | undefined {
    const row = db.prepare("SELECT * FROM cloud_backup_artifacts WHERE id = ?").get(id) as RawCloudBackupArtifact | undefined;
    return row ? toCloudBackupArtifact(row) : undefined;
  },

  createBackupRestoreEvent(input: {
    serverId: string;
    backupId: string | null;
    source: BackupRestoreEventRecord["source"];
    success: boolean;
    verified: boolean;
    detail: string;
    durationMs: number;
    createdAt?: string;
  }): BackupRestoreEventRecord {
    const record: BackupRestoreEventRecord = {
      id: uid("rstrev"),
      serverId: input.serverId,
      backupId: input.backupId,
      source: input.source,
      success: input.success ? 1 : 0,
      verified: input.verified ? 1 : 0,
      detail: input.detail,
      durationMs: input.durationMs,
      createdAt: input.createdAt ?? nowIso()
    };

    db.prepare(
      "INSERT INTO backup_restore_events (id, server_id, backup_id, source, success, verified, detail, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      record.id,
      record.serverId,
      record.backupId,
      record.source,
      record.success,
      record.verified,
      record.detail,
      record.durationMs,
      record.createdAt
    );

    return record;
  },

  listBackupRestoreEvents(input: {
    serverId?: string;
    since?: string;
    limit?: number;
  }): BackupRestoreEventRecord[] {
    const limit = Math.max(1, Math.min(input.limit ?? 200, 5000));
    const rows = input.serverId
      ? input.since
        ? (db
            .prepare(
              "SELECT * FROM backup_restore_events WHERE server_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?"
            )
            .all(input.serverId, input.since, limit) as RawBackupRestoreEvent[])
        : (db
            .prepare("SELECT * FROM backup_restore_events WHERE server_id = ? ORDER BY created_at DESC LIMIT ?")
            .all(input.serverId, limit) as RawBackupRestoreEvent[])
      : input.since
        ? (db
            .prepare("SELECT * FROM backup_restore_events WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?")
            .all(input.since, limit) as RawBackupRestoreEvent[])
        : (db
            .prepare("SELECT * FROM backup_restore_events ORDER BY created_at DESC LIMIT ?")
            .all(limit) as RawBackupRestoreEvent[]);
    return rows.map(toBackupRestoreEvent);
  },

  listTunnelStatusEvents(input: {
    tunnelId?: string;
    serverId?: string;
    since?: string;
    limit?: number;
  }): TunnelStatusEventRecord[] {
    const limit = Math.max(1, Math.min(input.limit ?? 500, 5000));

    if (input.tunnelId) {
      const rows = input.since
        ? (db
            .prepare(
              "SELECT * FROM tunnel_status_events WHERE tunnel_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?"
            )
            .all(input.tunnelId, input.since, limit) as RawTunnelStatusEvent[])
        : (db
            .prepare("SELECT * FROM tunnel_status_events WHERE tunnel_id = ? ORDER BY created_at DESC LIMIT ?")
            .all(input.tunnelId, limit) as RawTunnelStatusEvent[]);
      return rows.map(toTunnelStatusEvent);
    }

    if (input.serverId) {
      const rows = input.since
        ? (db
            .prepare(
              "SELECT * FROM tunnel_status_events WHERE server_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?"
            )
            .all(input.serverId, input.since, limit) as RawTunnelStatusEvent[])
        : (db
            .prepare("SELECT * FROM tunnel_status_events WHERE server_id = ? ORDER BY created_at DESC LIMIT ?")
            .all(input.serverId, limit) as RawTunnelStatusEvent[]);
      return rows.map(toTunnelStatusEvent);
    }

    const rows = input.since
      ? (db
          .prepare("SELECT * FROM tunnel_status_events WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?")
          .all(input.since, limit) as RawTunnelStatusEvent[])
      : (db.prepare("SELECT * FROM tunnel_status_events ORDER BY created_at DESC LIMIT ?").all(limit) as RawTunnelStatusEvent[]);
    return rows.map(toTunnelStatusEvent);
  },

  createModpackRollback(input: {
    serverId: string;
    packageId: string | null;
    backupId: string;
    reason: string;
  }): ModpackRollbackRecord {
    const record: ModpackRollbackRecord = {
      id: uid("mdrbk"),
      serverId: input.serverId,
      packageId: input.packageId,
      backupId: input.backupId,
      reason: input.reason,
      createdAt: nowIso()
    };

    db.prepare(
      "INSERT INTO modpack_rollbacks (id, server_id, package_id, backup_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(record.id, record.serverId, record.packageId, record.backupId, record.reason, record.createdAt);

    return record;
  },

  listModpackRollbacks(serverId: string, limit = 100): ModpackRollbackRecord[] {
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const rows = db
      .prepare("SELECT * FROM modpack_rollbacks WHERE server_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(serverId, safeLimit) as RawModpackRollback[];
    return rows.map(toModpackRollback);
  },

  getModpackRollback(id: string): ModpackRollbackRecord | undefined {
    const row = db.prepare("SELECT * FROM modpack_rollbacks WHERE id = ?").get(id) as RawModpackRollback | undefined;
    return row ? toModpackRollback(row) : undefined;
  },

  createPlayerAdminEvent(input: {
    serverId: string;
    kind: string;
    subject: string;
    detail: string;
  }): PlayerAdminEventRecord {
    const record: PlayerAdminEventRecord = {
      id: uid("plyevt"),
      serverId: input.serverId,
      kind: input.kind,
      subject: input.subject,
      detail: input.detail,
      createdAt: nowIso()
    };

    db.prepare(
      "INSERT INTO player_admin_events (id, server_id, kind, subject, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(record.id, record.serverId, record.kind, record.subject, record.detail, record.createdAt);

    return record;
  },

  listPlayerAdminEvents(serverId: string, limit = 200): PlayerAdminEventRecord[] {
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    const rows = db
      .prepare("SELECT * FROM player_admin_events WHERE server_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(serverId, safeLimit) as RawPlayerAdminEvent[];
    return rows.map(toPlayerAdminEvent);
  },

  createMigrationImport(input: {
    source: string;
    serverId: string | null;
    name: string;
    status: string;
    detail: string;
  }): MigrationImportRecord {
    const record: MigrationImportRecord = {
      id: uid("migr"),
      source: input.source,
      serverId: input.serverId,
      name: input.name,
      status: input.status,
      detail: input.detail,
      createdAt: nowIso()
    };

    db.prepare(
      "INSERT INTO migration_imports (id, source, server_id, name, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(record.id, record.source, record.serverId, record.name, record.status, record.detail, record.createdAt);

    return record;
  },

  listMigrationImports(limit = 100): MigrationImportRecord[] {
    const safeLimit = Math.max(1, Math.min(limit, 1000));
    const rows = db.prepare("SELECT * FROM migration_imports ORDER BY created_at DESC LIMIT ?").all(safeLimit) as RawMigrationImport[];
    return rows.map(toMigrationImport);
  }
};
