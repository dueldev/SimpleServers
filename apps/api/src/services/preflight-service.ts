import fs from "node:fs";
import path from "node:path";
import type { ServerRecord } from "../domain/types.js";

export type PreflightIssue = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  recommendation: string;
};

export type PreflightReport = {
  serverId: string;
  checkedAt: string;
  issues: PreflightIssue[];
  passed: boolean;
};

function listJarBaseNames(folderPath: string): string[] {
  if (!fs.existsSync(folderPath)) {
    return [];
  }

  return fs
    .readdirSync(folderPath)
    .filter((entry) => entry.toLowerCase().endsWith(".jar"))
    .map((entry) => entry.toLowerCase().replace(/-[\d.].*\.jar$/, "").replace(/\.jar$/, ""));
}

function duplicateNames(items: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const item of items) {
    if (seen.has(item)) {
      dupes.add(item);
    }
    seen.add(item);
  }
  return Array.from(dupes);
}

export class PreflightService {
  run(server: ServerRecord): PreflightReport {
    const issues: PreflightIssue[] = [];

    const serverJarPath = path.join(server.rootPath, "server.jar");
    const eulaPath = path.join(server.rootPath, "eula.txt");

    if (!fs.existsSync(serverJarPath)) {
      issues.push({
        code: "missing_server_jar",
        severity: "critical",
        message: "server.jar is missing.",
        recommendation: "Re-run setup or place a valid server jar in the server root."
      });
    }

    if (!fs.existsSync(eulaPath)) {
      issues.push({
        code: "missing_eula",
        severity: "critical",
        message: "eula.txt is missing.",
        recommendation: "Create eula.txt with eula=true to allow startup."
      });
    }

    const pluginsDir = path.join(server.rootPath, "plugins");
    const modsDir = path.join(server.rootPath, "mods");

    if (server.type === "paper" && fs.existsSync(modsDir) && fs.readdirSync(modsDir).length > 0) {
      issues.push({
        code: "mods_on_paper",
        severity: "warning",
        message: "Found mods folder content on a Paper server.",
        recommendation: "Use plugins for Paper, or switch server type to Fabric if modded gameplay is intended."
      });
    }

    if (server.type === "fabric" && fs.existsSync(pluginsDir) && fs.readdirSync(pluginsDir).length > 0) {
      issues.push({
        code: "plugins_on_fabric",
        severity: "warning",
        message: "Found plugins folder content on a Fabric server.",
        recommendation: "Use mods for Fabric, or switch server type to Paper for plugin ecosystems."
      });
    }

    const pluginDupes = duplicateNames(listJarBaseNames(pluginsDir));
    if (pluginDupes.length > 0) {
      issues.push({
        code: "duplicate_plugins",
        severity: "critical",
        message: `Potential plugin duplicates detected: ${pluginDupes.join(", ")}`,
        recommendation: "Keep only one version of each plugin to prevent classpath conflicts."
      });
    }

    const modDupes = duplicateNames(listJarBaseNames(modsDir));
    if (modDupes.length > 0) {
      issues.push({
        code: "duplicate_mods",
        severity: "critical",
        message: `Potential mod duplicates detected: ${modDupes.join(", ")}`,
        recommendation: "Keep only one version of each mod to prevent classpath conflicts."
      });
    }

    return {
      serverId: server.id,
      checkedAt: new Date().toISOString(),
      issues,
      passed: issues.every((issue) => issue.severity !== "critical")
    };
  }
}
