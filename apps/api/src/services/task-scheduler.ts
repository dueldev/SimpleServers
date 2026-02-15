import cron, { type ScheduledTask } from "node-cron";
import { store } from "../repositories/store.js";
import { BackupService } from "./backup-service.js";
import { ServerRuntimeService } from "./server-runtime.js";

export class TaskSchedulerService {
  private readonly tasks = new Map<string, ScheduledTask>();

  constructor(
    private readonly runtimeService: ServerRuntimeService,
    private readonly backupService: BackupService,
    private readonly addAlert: (serverId: string, severity: "warning" | "critical", kind: string, message: string) => void
  ) {}

  start(): void {
    this.refresh();
  }

  refresh(): void {
    for (const task of this.tasks.values()) {
      task.stop();
      task.destroy();
    }
    this.tasks.clear();

    const allTasks = store.listTasks();

    for (const taskRecord of allTasks) {
      if (!taskRecord.enabled) {
        continue;
      }

      if (!cron.validate(taskRecord.cronExpr)) {
        store.updateTaskRun(taskRecord.id, "failed", `Invalid cron expression: ${taskRecord.cronExpr}`);
        continue;
      }

      const scheduled = cron.schedule(taskRecord.cronExpr, async () => {
        const server = store.getServerById(taskRecord.serverId);
        if (!server) {
          store.updateTaskRun(taskRecord.id, "failed", "Server not found");
          return;
        }

        try {
          if (taskRecord.action === "backup") {
            const backup = await this.backupService.createBackup(server.id);
            store.updateTaskRun(taskRecord.id, "success", `Backup created: ${backup.filePath}`);
            return;
          }

          if (taskRecord.action === "restart") {
            await this.runtimeService.restart(server);
            store.updateTaskRun(taskRecord.id, "success", "Server restarted");
            return;
          }

          const payload = JSON.parse(taskRecord.payload || "{}") as { command?: string };
          if (!payload.command) {
            store.updateTaskRun(taskRecord.id, "failed", "Missing command payload");
            return;
          }

          this.runtimeService.sendCommand(server.id, payload.command);
          store.updateTaskRun(taskRecord.id, "success", `Command sent: ${payload.command}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          store.updateTaskRun(taskRecord.id, "failed", message);
          this.addAlert(server.id, "warning", "task_failure", `Task '${taskRecord.name}' failed: ${message}`);
        }
      });

      this.tasks.set(taskRecord.id, scheduled);
    }
  }
}
