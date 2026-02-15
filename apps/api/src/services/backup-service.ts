import fs from "node:fs";
import path from "node:path";
import * as tar from "tar";
import { loadConfig } from "../lib/config.js";
import { store } from "../repositories/store.js";

const config = loadConfig();

function fileName(serverName: string): string {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  return `${serverName}-${stamp}.tar.gz`;
}

async function createTarGz(sourceDir: string, outputFile: string): Promise<void> {
  await tar.create(
    {
      cwd: sourceDir,
      gzip: true,
      file: outputFile,
      portable: true
    },
    ["."]
  );
}

async function extractTarGz(inputFile: string, targetDir: string): Promise<void> {
  await tar.extract({ cwd: targetDir, file: inputFile, strip: 1 });
}

export class BackupService {
  async createBackup(serverId: string): Promise<{ backupId: string; filePath: string; sizeBytes: number }> {
    const server = store.getServerById(serverId);
    if (!server) {
      throw new Error("Server not found");
    }

    const outputFile = path.join(config.backupsDir, fileName(server.name));
    await createTarGz(server.rootPath, outputFile);

    const stat = fs.statSync(outputFile);
    const record = store.createBackup({
      serverId,
      filePath: outputFile,
      sizeBytes: stat.size
    });

    return {
      backupId: record.id,
      filePath: record.filePath,
      sizeBytes: record.sizeBytes
    };
  }

  listBackups(serverId: string) {
    return store.listBackups(serverId);
  }

  async restoreBackup(serverId: string, backupId: string): Promise<{ preRestoreBackupId: string }> {
    const server = store.getServerById(serverId);
    const backup = store.getBackup(backupId);

    if (!server) {
      throw new Error("Server not found");
    }

    if (!backup || backup.serverId !== serverId) {
      throw new Error("Backup not found for server");
    }

    // Safety checkpoint: always snapshot current state before applying a restore.
    const preRestoreSnapshot = await this.createBackup(serverId);

    const entries = fs.readdirSync(server.rootPath);
    for (const entry of entries) {
      if (entry === "server.jar") {
        continue;
      }
      fs.rmSync(path.join(server.rootPath, entry), { recursive: true, force: true });
    }

    await extractTarGz(backup.filePath, server.rootPath);
    store.markBackupRestored(backupId);

    return { preRestoreBackupId: preRestoreSnapshot.backupId };
  }
}
