import pidusage from "pidusage";
import fs from "node:fs";
import { store } from "../repositories/store.js";

const MB = 1024 * 1024;

export class AlertMonitorService {
  private timer: NodeJS.Timeout | null = null;
  private readonly dedupe = new Map<string, number>();

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.poll();
    }, 15000);

    void this.poll();
  }

  stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  recordCrash(serverId: string, code: number | null): void {
    this.createAlert(serverId, "critical", "server_crash", `Server exited unexpectedly with code ${String(code)}`);
  }

  private async poll(): Promise<void> {
    const servers = store.listServers().filter((s) => s.status === "running" && s.pid !== null);

    for (const server of servers) {
      if (!server.pid) {
        continue;
      }

      try {
        const stats = await pidusage(server.pid);
        const memoryMb = stats.memory / MB;
        const cpuPercent = stats.cpu;

        if (memoryMb > server.maxMemoryMb * 1.2) {
          this.createAlert(
            server.id,
            "critical",
            "memory_pressure",
            `Memory usage ${memoryMb.toFixed(0)} MB exceeds max allocation (${server.maxMemoryMb} MB)`
          );
        } else if (memoryMb > server.maxMemoryMb * 0.95) {
          this.createAlert(
            server.id,
            "warning",
            "memory_warning",
            `Memory usage ${memoryMb.toFixed(0)} MB is near max allocation (${server.maxMemoryMb} MB)`
          );
        }

        if (cpuPercent > 95) {
          this.createAlert(server.id, "critical", "cpu_pressure", `CPU usage ${cpuPercent.toFixed(1)}% is critically high`);
        } else if (cpuPercent > 80) {
          this.createAlert(server.id, "warning", "cpu_warning", `CPU usage ${cpuPercent.toFixed(1)}% is elevated`);
        }

        try {
          const statsFs = fs.statfsSync(server.rootPath);
          const available = statsFs.bavail * statsFs.bsize;
          const total = statsFs.blocks * statsFs.bsize;
          const freeRatio = total > 0 ? available / total : 1;
          const freePercent = freeRatio * 100;

          if (freePercent < 5) {
            this.createAlert(server.id, "critical", "disk_pressure", `Disk free space is critically low (${freePercent.toFixed(1)}%)`);
          } else if (freePercent < 12) {
            this.createAlert(server.id, "warning", "disk_warning", `Disk free space is low (${freePercent.toFixed(1)}%)`);
          }
        } catch (diskError) {
          const diskMessage = diskError instanceof Error ? diskError.message : String(diskError);
          this.createAlert(server.id, "warning", "disk_probe_failed", `Unable to sample disk usage: ${diskMessage}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.createAlert(server.id, "warning", "pid_probe_failed", `Unable to sample process metrics: ${message}`);
      }
    }
  }

  createAlert(serverId: string, severity: "info" | "warning" | "critical", kind: string, message: string): void {
    const key = `${serverId}:${kind}:${message}`;
    const now = Date.now();
    const previous = this.dedupe.get(key);

    if (previous && now - previous < 60_000) {
      return;
    }

    this.dedupe.set(key, now);
    store.createAlert({ serverId, severity, kind, message });
  }
}
