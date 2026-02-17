import Database from "better-sqlite3";
import { loadConfig } from "./config.js";

const config = loadConfig();

export const db = new Database(config.dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function closeDb(): void {
  if (db.open) {
    db.close();
  }
}

export function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      api_token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      mc_version TEXT NOT NULL,
      jar_path TEXT NOT NULL,
      root_path TEXT NOT NULL,
      java_path TEXT NOT NULL,
      port INTEGER NOT NULL,
      bedrock_port INTEGER,
      min_memory_mb INTEGER NOT NULL,
      max_memory_mb INTEGER NOT NULL,
      status TEXT NOT NULL,
      pid INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      restored_at TEXT,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      severity TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      name TEXT NOT NULL,
      cron_expr TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      last_run_at TEXT,
      last_status TEXT,
      last_output TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tunnels (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      protocol TEXT NOT NULL,
      local_port INTEGER NOT NULL,
      public_host TEXT NOT NULL,
      public_port INTEGER NOT NULL,
      status TEXT NOT NULL,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS server_packages (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      project_id TEXT NOT NULL,
      version_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      loader TEXT NOT NULL,
      game_version TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_hash TEXT,
      installed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_server_packages_server_id ON server_packages(server_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_server_packages_unique_version ON server_packages(server_id, provider, project_id, version_id);

    CREATE TABLE IF NOT EXISTS backup_policies (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL UNIQUE,
      max_backups INTEGER NOT NULL,
      max_age_days INTEGER NOT NULL,
      prune_cron TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS crash_reports (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      exit_code INTEGER,
      report_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_crash_reports_server_id ON crash_reports(server_id);

    CREATE TABLE IF NOT EXISTS ux_telemetry_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      event TEXT NOT NULL,
      metadata TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ux_telemetry_created_at ON ux_telemetry_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_ux_telemetry_event ON ux_telemetry_events(event);

    CREATE TABLE IF NOT EXISTS editor_file_snapshots (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_editor_file_snapshots_server_path_created
      ON editor_file_snapshots(server_id, path, created_at DESC);

    CREATE TABLE IF NOT EXISTS server_performance_samples (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      cpu_percent REAL NOT NULL,
      memory_mb REAL NOT NULL,
      sampled_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_server_perf_samples_server_sampled
      ON server_performance_samples(server_id, sampled_at DESC);

    CREATE TABLE IF NOT EXISTS server_startup_events (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      success INTEGER NOT NULL,
      exit_code INTEGER,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_server_startup_events_server_created
      ON server_startup_events(server_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS server_tick_lag_events (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      lag_ms INTEGER NOT NULL,
      ticks_behind INTEGER NOT NULL,
      line TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_server_tick_lag_events_server_created
      ON server_tick_lag_events(server_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS cloud_backup_destinations (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      config_json TEXT NOT NULL,
      encryption_passphrase TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_cloud_backup_destinations_server_created
      ON cloud_backup_destinations(server_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS cloud_backup_artifacts (
      id TEXT PRIMARY KEY,
      backup_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      destination_id TEXT NOT NULL,
      remote_key TEXT NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      encrypted INTEGER NOT NULL,
      size_bytes INTEGER NOT NULL,
      metadata_json TEXT NOT NULL,
      status TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE,
      FOREIGN KEY(destination_id) REFERENCES cloud_backup_destinations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_cloud_backup_artifacts_server_uploaded
      ON cloud_backup_artifacts(server_id, uploaded_at DESC);

    CREATE TABLE IF NOT EXISTS backup_restore_events (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      backup_id TEXT,
      source TEXT NOT NULL,
      success INTEGER NOT NULL,
      verified INTEGER NOT NULL,
      detail TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_backup_restore_events_server_created
      ON backup_restore_events(server_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS tunnel_status_events (
      id TEXT PRIMARY KEY,
      tunnel_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE,
      FOREIGN KEY(tunnel_id) REFERENCES tunnels(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tunnel_status_events_tunnel_created
      ON tunnel_status_events(tunnel_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS modpack_rollbacks (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      package_id TEXT,
      backup_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_modpack_rollbacks_server_created
      ON modpack_rollbacks(server_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS player_admin_events (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      subject TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_player_admin_events_server_created
      ON player_admin_events(server_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS migration_imports (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      server_id TEXT,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_migration_imports_created
      ON migration_imports(created_at DESC);
  `);
}
