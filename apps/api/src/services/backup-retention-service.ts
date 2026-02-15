import cron, { type ScheduledTask } from "node-cron";
import fs from "node:fs";
import { store } from "../repositories/store.js";

export class BackupRetentionService {
  private readonly tasks = new Map<string, ScheduledTask>();

  start(): void {
    this.refresh();
  }

  stop(): void {
    for (const task of this.tasks.values()) {
      task.stop();
      task.destroy();
    }
    this.tasks.clear();
  }

  refresh(): void {
    this.stop();

    for (const policy of store.listBackupPolicies()) {
      if (!policy.enabled || !cron.validate(policy.pruneCron)) {
        continue;
      }

      const job = cron.schedule(policy.pruneCron, async () => {
        await this.pruneForServer(policy.serverId);
      });

      this.tasks.set(policy.id, job);
    }
  }

  async pruneForServer(serverId: string): Promise<{ deleted: number }> {
    const policy = store.getBackupPolicy(serverId);
    if (!policy || !policy.enabled) {
      return { deleted: 0 };
    }

    const backups = store.listBackups(serverId);
    const now = Date.now();
    const maxAgeMs = policy.maxAgeDays * 24 * 60 * 60 * 1000;

    const toDelete = new Set<string>();

    backups.forEach((backup, index) => {
      const createdAtMs = new Date(backup.createdAt).getTime();
      if (index >= policy.maxBackups) {
        toDelete.add(backup.id);
        return;
      }

      if (now - createdAtMs > maxAgeMs) {
        toDelete.add(backup.id);
      }
    });

    for (const backupId of toDelete) {
      const backup = store.getBackup(backupId);
      if (!backup) {
        continue;
      }

      if (fs.existsSync(backup.filePath)) {
        fs.rmSync(backup.filePath, { force: true });
      }

      store.deleteBackup(backup.id);
    }

    return { deleted: toDelete.size };
  }
}
