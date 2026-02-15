import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../lib/config.js";
import { uid } from "../lib/util.js";
import { store } from "../repositories/store.js";
import type { ConsoleMessage } from "./console-hub.js";

const config = loadConfig();

export class CrashReportService {
  create(serverId: string, reason: string, exitCode: number | null, consoleHistory: ConsoleMessage[]): { reportId: string; reportPath: string } {
    const server = store.getServerById(serverId);
    if (!server) {
      throw new Error("Server not found for crash report creation");
    }

    const reportId = uid("crash");
    const reportPath = path.join(config.crashReportsDir, `${reportId}.json`);

    const payload = {
      reportId,
      createdAt: new Date().toISOString(),
      reason,
      exitCode,
      server: {
        id: server.id,
        name: server.name,
        type: server.type,
        mcVersion: server.mcVersion,
        port: server.port,
        rootPath: server.rootPath,
        javaPath: server.javaPath,
        memory: {
          minMb: server.minMemoryMb,
          maxMb: server.maxMemoryMb
        }
      },
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        uptimeSeconds: process.uptime()
      },
      recentConsole: consoleHistory.slice(-300)
    };

    fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), "utf8");

    const record = store.createCrashReport({
      serverId,
      reason,
      exitCode,
      reportPath
    });

    return {
      reportId: record.id,
      reportPath: record.reportPath
    };
  }

  list(serverId: string) {
    return store.listCrashReports(serverId);
  }

  read(reportId: string): string {
    const report = store.getCrashReport(reportId);
    if (!report) {
      throw new Error("Crash report not found");
    }

    return fs.readFileSync(report.reportPath, "utf8");
  }
}
