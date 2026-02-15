import fs from "node:fs";
import path from "node:path";

export type AppConfig = {
  host: string;
  port: number;
  dataDir: string;
  serversDir: string;
  backupsDir: string;
  dbPath: string;
  defaultAdminToken: string;
  cacheDir: string;
  curseForgeApiKey: string | null;
  crashReportsDir: string;
  remoteControlEnabled: boolean;
  remoteControlToken: string | null;
  remoteAllowedOrigins: string[];
};

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): AppConfig {
  const dataDir = process.env.SIMPLESERVERS_DATA_DIR ?? path.join(process.cwd(), "data");
  const serversDir = path.join(dataDir, "servers");
  const backupsDir = path.join(dataDir, "backups");
  const dbPath = path.join(dataDir, "simpleservers.db");
  const cacheDir = path.join(dataDir, "cache");
  const crashReportsDir = path.join(dataDir, "crash-reports");

  ensureDir(dataDir);
  ensureDir(serversDir);
  ensureDir(backupsDir);
  ensureDir(cacheDir);
  ensureDir(crashReportsDir);

  const remoteAllowedOrigins = (process.env.SIMPLESERVERS_REMOTE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    host: process.env.SIMPLESERVERS_HOST ?? "127.0.0.1",
    port: Number(process.env.SIMPLESERVERS_PORT ?? "4010"),
    dataDir,
    serversDir,
    backupsDir,
    dbPath,
    defaultAdminToken: process.env.SIMPLESERVERS_ADMIN_TOKEN ?? "simpleservers-dev-admin-token",
    cacheDir,
    curseForgeApiKey: process.env.CURSEFORGE_API_KEY ?? null,
    crashReportsDir,
    remoteControlEnabled: process.env.SIMPLESERVERS_REMOTE_ENABLED === "1",
    remoteControlToken: process.env.SIMPLESERVERS_REMOTE_TOKEN ?? null,
    remoteAllowedOrigins
  };
}
