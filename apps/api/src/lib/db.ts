import Database from "better-sqlite3";
import { loadConfig } from "./config.js";

const config = loadConfig();

export const db = new Database(config.dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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
  `);
}
