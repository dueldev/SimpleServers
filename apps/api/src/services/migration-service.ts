import fs from "node:fs";
import path from "node:path";
import { store } from "../repositories/store.js";

type ManualImportInput = {
  name: string;
  type: "vanilla" | "paper" | "fabric";
  mcVersion: string;
  rootPath: string;
  port: number;
  bedrockPort?: number | null;
  minMemoryMb: number;
  maxMemoryMb: number;
  javaPath?: string;
  jarPath?: string;
};

function ensureUniqueName(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    throw new Error("Server name cannot be empty");
  }
  const existingNames = new Set(store.listServers().map((server) => server.name.toLowerCase()));
  if (!existingNames.has(normalized.toLowerCase())) {
    return normalized;
  }

  for (let idx = 2; idx < 5000; idx += 1) {
    const candidate = `${normalized} (${idx})`;
    if (!existingNames.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  throw new Error("Could not resolve a unique server name");
}

function readSquidManifest(manifestPath: string): Array<Record<string, unknown>> {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid SquidServers manifest payload");
  }
  const asRecord = parsed as Record<string, unknown>;
  const servers = asRecord.servers;
  if (!Array.isArray(servers)) {
    throw new Error("Manifest does not include a servers[] array");
  }
  return servers.filter((entry) => entry && typeof entry === "object") as Array<Record<string, unknown>>;
}

function toInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

export class MigrationService {
  importManual(input: ManualImportInput): {
    serverId: string;
    name: string;
    rootPath: string;
    type: "vanilla" | "paper" | "fabric";
  } {
    const rootPath = path.resolve(input.rootPath);
    if (!fs.existsSync(rootPath)) {
      throw new Error(`Server root path does not exist: ${rootPath}`);
    }
    if (!fs.statSync(rootPath).isDirectory()) {
      throw new Error("Server root path must be a directory");
    }

    const name = ensureUniqueName(input.name);
    const jarPath = path.resolve(input.jarPath ?? path.join(rootPath, "server.jar"));
    if (!fs.existsSync(jarPath)) {
      throw new Error(`Server jar not found at ${jarPath}`);
    }

    const server = store.createServer({
      name,
      type: input.type,
      mcVersion: input.mcVersion,
      jarPath,
      rootPath,
      javaPath: input.javaPath?.trim() || "java",
      port: input.port,
      bedrockPort: input.bedrockPort ?? null,
      minMemoryMb: input.minMemoryMb,
      maxMemoryMb: input.maxMemoryMb
    });

    store.createMigrationImport({
      source: "manual",
      serverId: server.id,
      name: server.name,
      status: "imported",
      detail: "Imported existing server directory"
    });

    return {
      serverId: server.id,
      name: server.name,
      rootPath: server.rootPath,
      type: server.type
    };
  }

  importSquidServersManifest(input: {
    manifestPath: string;
    javaPath?: string;
  }): {
    imported: Array<{ serverId: string; name: string }>;
    failed: Array<{ name: string; error: string }>;
  } {
    const manifestPath = path.resolve(input.manifestPath);
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifest path does not exist: ${manifestPath}`);
    }

    const items = readSquidManifest(manifestPath);
    const imported: Array<{ serverId: string; name: string }> = [];
    const failed: Array<{ name: string; error: string }> = [];

    for (const item of items) {
      const name = String(item.name ?? item.serverName ?? "Imported Server");
      try {
        const result = this.importManual({
          name,
          type:
            item.type === "vanilla" || item.type === "fabric" || item.type === "paper"
              ? item.type
              : item.platform === "fabric"
                ? "fabric"
                : "paper",
          mcVersion: String(item.mcVersion ?? item.version ?? "1.21.11"),
          rootPath: String(item.rootPath ?? item.path ?? ""),
          port: toInt(item.port, 25565),
          bedrockPort: item.bedrockPort === null ? null : toInt(item.bedrockPort, 19132),
          minMemoryMb: toInt(item.minMemoryMb ?? item.minMemory, 1024),
          maxMemoryMb: toInt(item.maxMemoryMb ?? item.maxMemory, 4096),
          javaPath: typeof item.javaPath === "string" ? item.javaPath : input.javaPath,
          jarPath: typeof item.jarPath === "string" ? item.jarPath : undefined
        });
        imported.push({
          serverId: result.serverId,
          name: result.name
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed.push({
          name,
          error: message
        });
        store.createMigrationImport({
          source: "squidservers",
          serverId: null,
          name,
          status: "failed",
          detail: message
        });
      }
    }

    return {
      imported,
      failed
    };
  }

  listRecentImports(limit = 80) {
    return store.listMigrationImports(limit);
  }
}
