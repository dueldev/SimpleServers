import fs from "node:fs";
import path from "node:path";
import { nowIso } from "../lib/util.js";
import { store } from "../repositories/store.js";

type PlayerOpEntry = {
  uuid: string;
  name: string;
  level: number;
  bypassesPlayerLimit: boolean;
};

type PlayerWhitelistEntry = {
  uuid: string;
  name: string;
};

type PlayerBanEntry = {
  uuid: string;
  name: string;
  created: string;
  source: string;
  expires: string;
  reason: string;
};

type IpBanEntry = {
  ip: string;
  created: string;
  source: string;
  expires: string;
  reason: string;
};

type PlayerHistoryEntry = {
  ts: string;
  kind: string;
  subject: string;
  detail: string;
  source: "admin" | "runtime";
};

function normalizeName(value: string): string {
  return value.trim();
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function uuidFallback(name: string): string {
  return `offline-${name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "") || "player"}`;
}

function readJsonArray<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJsonArray(filePath: string, value: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseRuntimePlayerHistory(serverRoot: string, limit: number): PlayerHistoryEntry[] {
  const latestLog = path.join(serverRoot, "logs", "latest.log");
  if (!fs.existsSync(latestLog)) {
    return [];
  }

  const lines = fs.readFileSync(latestLog, "utf8").split(/\r?\n/);
  const history: PlayerHistoryEntry[] = [];

  for (const line of lines) {
    const stampMatch = line.match(/^\[([0-9]{2}:[0-9]{2}:[0-9]{2})\]/);
    const joinedMatch = line.match(/]: ([A-Za-z0-9_]{2,16}) joined the game/);
    const leftMatch = line.match(/]: ([A-Za-z0-9_]{2,16}) left the game/);
    const commandMatch = line.match(/]: ([A-Za-z0-9_]{2,16}) issued server command: (.+)$/);
    const ts = stampMatch ? `${new Date().toISOString().slice(0, 10)}T${stampMatch[1]}.000Z` : nowIso();

    if (joinedMatch) {
      history.push({
        ts,
        kind: "player_join",
        subject: joinedMatch[1],
        detail: "joined the game",
        source: "runtime"
      });
      continue;
    }
    if (leftMatch) {
      history.push({
        ts,
        kind: "player_leave",
        subject: leftMatch[1],
        detail: "left the game",
        source: "runtime"
      });
      continue;
    }
    if (commandMatch) {
      history.push({
        ts,
        kind: "player_command",
        subject: commandMatch[1],
        detail: commandMatch[2],
        source: "runtime"
      });
    }
  }

  return history.slice(-limit);
}

export class PlayerAdminService {
  private resolveServer(serverId: string) {
    const server = store.getServerById(serverId);
    if (!server) {
      throw new Error("Server not found");
    }
    return server;
  }

  private paths(serverId: string): {
    ops: string;
    whitelist: string;
    bannedPlayers: string;
    bannedIps: string;
  } {
    const server = this.resolveServer(serverId);
    return {
      ops: path.join(server.rootPath, "ops.json"),
      whitelist: path.join(server.rootPath, "whitelist.json"),
      bannedPlayers: path.join(server.rootPath, "banned-players.json"),
      bannedIps: path.join(server.rootPath, "banned-ips.json")
    };
  }

  getState(serverId: string, historyLimit = 150): {
    ops: PlayerOpEntry[];
    whitelist: PlayerWhitelistEntry[];
    bannedPlayers: PlayerBanEntry[];
    bannedIps: IpBanEntry[];
    knownPlayers: Array<{ name: string; uuid: string }>;
    history: PlayerHistoryEntry[];
  } {
    const server = this.resolveServer(serverId);
    const filePaths = this.paths(serverId);
    const ops = readJsonArray<PlayerOpEntry>(filePaths.ops);
    const whitelist = readJsonArray<PlayerWhitelistEntry>(filePaths.whitelist);
    const bannedPlayers = readJsonArray<PlayerBanEntry>(filePaths.bannedPlayers);
    const bannedIps = readJsonArray<IpBanEntry>(filePaths.bannedIps);

    const known = new Map<string, { name: string; uuid: string }>();
    for (const entry of [...ops, ...whitelist, ...bannedPlayers]) {
      const key = normalizeId(entry.uuid || entry.name);
      if (!known.has(key)) {
        known.set(key, {
          name: entry.name,
          uuid: entry.uuid || uuidFallback(entry.name)
        });
      }
    }

    const adminHistory = store.listPlayerAdminEvents(serverId, historyLimit).map((entry) => ({
      ts: entry.createdAt,
      kind: entry.kind,
      subject: entry.subject,
      detail: entry.detail,
      source: "admin" as const
    }));
    const runtimeHistory = parseRuntimePlayerHistory(server.rootPath, historyLimit);
    const history = [...adminHistory, ...runtimeHistory]
      .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
      .slice(0, historyLimit);

    return {
      ops,
      whitelist,
      bannedPlayers,
      bannedIps,
      knownPlayers: [...known.values()].sort((a, b) => a.name.localeCompare(b.name)),
      history
    };
  }

  addOp(input: {
    serverId: string;
    name: string;
    uuid?: string;
    level?: number;
    bypassesPlayerLimit?: boolean;
  }): PlayerOpEntry[] {
    const filePaths = this.paths(input.serverId);
    const ops = readJsonArray<PlayerOpEntry>(filePaths.ops);
    const name = normalizeName(input.name);
    const uuid = input.uuid?.trim() || uuidFallback(name);
    const level = Number.isFinite(input.level) ? Math.max(1, Math.min(4, Number(input.level))) : 4;
    const bypassesPlayerLimit = input.bypassesPlayerLimit ?? true;

    const filtered = ops.filter((entry) => normalizeId(entry.uuid) !== normalizeId(uuid) && normalizeId(entry.name) !== normalizeId(name));
    filtered.push({
      uuid,
      name,
      level,
      bypassesPlayerLimit
    });
    writeJsonArray(filePaths.ops, filtered);
    store.createPlayerAdminEvent({
      serverId: input.serverId,
      kind: "op_add",
      subject: name,
      detail: `Added operator (level ${level})`
    });
    return filtered;
  }

  removeOp(serverId: string, nameOrUuid: string): PlayerOpEntry[] {
    const filePaths = this.paths(serverId);
    const ops = readJsonArray<PlayerOpEntry>(filePaths.ops);
    const target = normalizeId(nameOrUuid);
    const next = ops.filter((entry) => normalizeId(entry.uuid) !== target && normalizeId(entry.name) !== target);
    writeJsonArray(filePaths.ops, next);
    store.createPlayerAdminEvent({
      serverId,
      kind: "op_remove",
      subject: nameOrUuid,
      detail: "Removed operator"
    });
    return next;
  }

  addWhitelist(serverId: string, name: string, uuid?: string): PlayerWhitelistEntry[] {
    const filePaths = this.paths(serverId);
    const whitelist = readJsonArray<PlayerWhitelistEntry>(filePaths.whitelist);
    const normalizedName = normalizeName(name);
    const normalizedUuid = uuid?.trim() || uuidFallback(normalizedName);
    const next = whitelist.filter(
      (entry) => normalizeId(entry.uuid) !== normalizeId(normalizedUuid) && normalizeId(entry.name) !== normalizeId(normalizedName)
    );
    next.push({
      uuid: normalizedUuid,
      name: normalizedName
    });
    writeJsonArray(filePaths.whitelist, next);
    store.createPlayerAdminEvent({
      serverId,
      kind: "whitelist_add",
      subject: normalizedName,
      detail: "Added to whitelist"
    });
    return next;
  }

  removeWhitelist(serverId: string, nameOrUuid: string): PlayerWhitelistEntry[] {
    const filePaths = this.paths(serverId);
    const whitelist = readJsonArray<PlayerWhitelistEntry>(filePaths.whitelist);
    const target = normalizeId(nameOrUuid);
    const next = whitelist.filter((entry) => normalizeId(entry.uuid) !== target && normalizeId(entry.name) !== target);
    writeJsonArray(filePaths.whitelist, next);
    store.createPlayerAdminEvent({
      serverId,
      kind: "whitelist_remove",
      subject: nameOrUuid,
      detail: "Removed from whitelist"
    });
    return next;
  }

  banPlayer(input: {
    serverId: string;
    name: string;
    uuid?: string;
    reason?: string;
    expires?: string;
  }): PlayerBanEntry[] {
    const filePaths = this.paths(input.serverId);
    const bans = readJsonArray<PlayerBanEntry>(filePaths.bannedPlayers);
    const name = normalizeName(input.name);
    const uuid = input.uuid?.trim() || uuidFallback(name);
    const next = bans.filter((entry) => normalizeId(entry.uuid) !== normalizeId(uuid) && normalizeId(entry.name) !== normalizeId(name));
    next.push({
      uuid,
      name,
      created: nowIso(),
      source: "SimpleServers",
      expires: input.expires?.trim() || "forever",
      reason: input.reason?.trim() || "Banned by operator"
    });
    writeJsonArray(filePaths.bannedPlayers, next);
    store.createPlayerAdminEvent({
      serverId: input.serverId,
      kind: "player_ban",
      subject: name,
      detail: input.reason?.trim() || "Banned by operator"
    });
    return next;
  }

  unbanPlayer(serverId: string, nameOrUuid: string): PlayerBanEntry[] {
    const filePaths = this.paths(serverId);
    const bans = readJsonArray<PlayerBanEntry>(filePaths.bannedPlayers);
    const target = normalizeId(nameOrUuid);
    const next = bans.filter((entry) => normalizeId(entry.uuid) !== target && normalizeId(entry.name) !== target);
    writeJsonArray(filePaths.bannedPlayers, next);
    store.createPlayerAdminEvent({
      serverId,
      kind: "player_unban",
      subject: nameOrUuid,
      detail: "Player unbanned"
    });
    return next;
  }

  banIp(input: {
    serverId: string;
    ip: string;
    reason?: string;
    expires?: string;
  }): IpBanEntry[] {
    const filePaths = this.paths(input.serverId);
    const bans = readJsonArray<IpBanEntry>(filePaths.bannedIps);
    const ip = input.ip.trim();
    const next = bans.filter((entry) => entry.ip.trim() !== ip);
    next.push({
      ip,
      created: nowIso(),
      source: "SimpleServers",
      expires: input.expires?.trim() || "forever",
      reason: input.reason?.trim() || "IP banned by operator"
    });
    writeJsonArray(filePaths.bannedIps, next);
    store.createPlayerAdminEvent({
      serverId: input.serverId,
      kind: "ip_ban",
      subject: ip,
      detail: input.reason?.trim() || "IP banned by operator"
    });
    return next;
  }

  unbanIp(serverId: string, ip: string): IpBanEntry[] {
    const filePaths = this.paths(serverId);
    const bans = readJsonArray<IpBanEntry>(filePaths.bannedIps);
    const target = ip.trim();
    const next = bans.filter((entry) => entry.ip.trim() !== target);
    writeJsonArray(filePaths.bannedIps, next);
    store.createPlayerAdminEvent({
      serverId,
      kind: "ip_unban",
      subject: target,
      detail: "IP unbanned"
    });
    return next;
  }
}
