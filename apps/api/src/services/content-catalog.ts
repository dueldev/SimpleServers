import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { request } from "undici";
import type { ContentProvider, PackageKind, ServerRecord } from "../domain/types.js";
import { loadConfig } from "../lib/config.js";
import { downloadToFile } from "../lib/download.js";
import { store } from "../repositories/store.js";

const config = loadConfig();

export type ContentSearchResult = {
  provider: ContentProvider;
  projectId: string;
  slug: string;
  name: string;
  summary: string;
  kind: PackageKind;
  iconUrl: string | null;
  downloads: number;
  latestVersionId: string | null;
  compatible: boolean;
};

export type ContentVersion = {
  provider: ContentProvider;
  versionId: string;
  name: string;
  fileName: string;
  fileUrl: string;
  fileHash: string | null;
  gameVersions: string[];
  loaders: string[];
  kind: PackageKind;
  publishedAt: string;
};

export type InstallResult = {
  packageId: string;
  serverId: string;
  provider: ContentProvider;
  projectId: string;
  versionId: string;
  filePath: string;
};

function getLoaderHints(server: ServerRecord): string[] {
  if (server.type === "paper") {
    return ["paper", "spigot", "bukkit", "purpur"];
  }

  if (server.type === "fabric") {
    return ["fabric", "quilt"];
  }

  return ["vanilla", "minecraft"];
}

function mapProjectTypeToKind(projectType: string): PackageKind {
  if (projectType === "plugin") return "plugin";
  if (projectType === "modpack") return "modpack";
  if (projectType === "resourcepack") return "resourcepack";
  return "mod";
}

function isVersionCompatible(server: ServerRecord, version: ContentVersion): boolean {
  const gameVersionOk = version.gameVersions.length === 0 || version.gameVersions.includes(server.mcVersion);
  if (!gameVersionOk) {
    return false;
  }

  const loaderHints = getLoaderHints(server);
  if (version.loaders.length === 0) {
    return true;
  }

  return version.loaders.some((loader) => loaderHints.includes(loader));
}

function resolveInstallDir(server: ServerRecord, kind: PackageKind): string {
  if (kind === "plugin") {
    return path.join(server.rootPath, "plugins");
  }

  if (kind === "resourcepack") {
    return path.join(server.rootPath, "resourcepacks");
  }

  return path.join(server.rootPath, "mods");
}

function fileSha1(filePath: string): string {
  const hash = crypto.createHash("sha1");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await request(url, {
    headers: {
      "user-agent": "SimpleServers/0.2 (+https://github.com)",
      ...headers
    }
  });

  if (res.statusCode >= 400) {
    const raw = await res.body.text();
    throw new Error(`HTTP ${res.statusCode} for ${url}: ${raw.slice(0, 400)}`);
  }

  return (await res.body.json()) as T;
}

type ModrinthSearchResponse = {
  hits: Array<{
    project_id: string;
    slug: string;
    title: string;
    description: string;
    project_type: string;
    downloads: number;
    icon_url: string | null;
    latest_version: string | null;
    versions?: string[];
    display_categories?: string[];
  }>;
};

type ModrinthVersion = {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  date_published: string;
  files: Array<{
    filename: string;
    url: string;
    primary: boolean;
    hashes?: {
      sha1?: string;
    };
  }>;
  project_id: string;
};

type CurseForgeSearchResponse = {
  data: Array<{
    id: number;
    slug: string;
    name: string;
    summary: string;
    links?: { websiteUrl?: string };
    logo?: { thumbnailUrl?: string };
    downloadCount?: number;
    classId?: number;
    latestFilesIndexes?: Array<{
      fileId: number;
      gameVersion: string;
      modLoader?: number;
    }>;
  }>;
};

type CurseForgeFileResponse = {
  data: Array<{
    id: number;
    displayName: string;
    fileName: string;
    downloadUrl: string | null;
    fileDate: string;
    hashes: Array<{ algo: number; value: string }>;
    gameVersions: string[];
  }>;
};

export class ContentCatalogService {
  private readonly curseForgeApiBase = "https://api.curseforge.com/v1";
  private readonly modrinthApiBase = "https://api.modrinth.com/v2";

  async search(input: {
    provider: ContentProvider;
    query: string;
    server: ServerRecord;
    kind?: PackageKind;
    limit?: number;
  }): Promise<ContentSearchResult[]> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

    if (input.provider === "modrinth") {
      const url = new URL(`${this.modrinthApiBase}/search`);
      url.searchParams.set("query", input.query);
      url.searchParams.set("limit", String(limit));

      if (input.kind) {
        const facets = [[`project_type:${input.kind === "plugin" ? "plugin" : input.kind === "resourcepack" ? "resourcepack" : input.kind === "modpack" ? "modpack" : "mod"}`]];
        url.searchParams.set("facets", JSON.stringify(facets));
      }

      const payload = await getJson<ModrinthSearchResponse>(url.toString());

      return payload.hits.map((hit) => {
        const kind = mapProjectTypeToKind(hit.project_type);
        const compatByVersion = (hit.versions ?? []).includes(input.server.mcVersion);
        const compatByLoader = (hit.display_categories ?? []).some((cat) => getLoaderHints(input.server).includes(cat));

        return {
          provider: "modrinth",
          projectId: hit.project_id,
          slug: hit.slug,
          name: hit.title,
          summary: hit.description,
          kind,
          iconUrl: hit.icon_url,
          downloads: hit.downloads,
          latestVersionId: hit.latest_version,
          compatible: compatByVersion || compatByLoader
        };
      });
    }

    if (!config.curseForgeApiKey) {
      throw new Error("CURSEFORGE_API_KEY is required for CurseForge operations");
    }

    const url = new URL(`${this.curseForgeApiBase}/mods/search`);
    url.searchParams.set("gameId", "432");
    url.searchParams.set("searchFilter", input.query);
    url.searchParams.set("pageSize", String(limit));

    const payload = await getJson<CurseForgeSearchResponse>(url.toString(), {
      "x-api-key": config.curseForgeApiKey,
      accept: "application/json"
    });

    return payload.data.map((entry) => {
      const kind: PackageKind = input.kind ?? "mod";
      const isCompatible = (entry.latestFilesIndexes ?? []).some((idx) => idx.gameVersion === input.server.mcVersion);

      return {
        provider: "curseforge",
        projectId: String(entry.id),
        slug: entry.slug,
        name: entry.name,
        summary: entry.summary,
        kind,
        iconUrl: entry.logo?.thumbnailUrl ?? null,
        downloads: entry.downloadCount ?? 0,
        latestVersionId: entry.latestFilesIndexes?.[0]?.fileId ? String(entry.latestFilesIndexes[0].fileId) : null,
        compatible: isCompatible
      };
    });
  }

  async listVersions(input: {
    provider: ContentProvider;
    projectId: string;
    server: ServerRecord;
    limit?: number;
  }): Promise<ContentVersion[]> {
    const limit = Math.min(Math.max(input.limit ?? 40, 1), 100);

    if (input.provider === "modrinth") {
      const url = new URL(`${this.modrinthApiBase}/project/${input.projectId}/version`);
      url.searchParams.set("game_versions", JSON.stringify([input.server.mcVersion]));
      url.searchParams.set("loaders", JSON.stringify(getLoaderHints(input.server)));

      const payload = await getJson<ModrinthVersion[]>(url.toString());

      return payload.slice(0, limit).map((version) => {
        const primaryFile = version.files.find((file) => file.primary) ?? version.files[0];

        return {
          provider: "modrinth",
          versionId: version.id,
          name: `${version.name} (${version.version_number})`,
          fileName: primaryFile.filename,
          fileUrl: primaryFile.url,
          fileHash: primaryFile.hashes?.sha1 ?? null,
          gameVersions: version.game_versions,
          loaders: version.loaders,
          kind: "mod",
          publishedAt: version.date_published
        };
      });
    }

    if (!config.curseForgeApiKey) {
      throw new Error("CURSEFORGE_API_KEY is required for CurseForge operations");
    }

    const url = new URL(`${this.curseForgeApiBase}/mods/${input.projectId}/files`);
    url.searchParams.set("gameVersion", input.server.mcVersion);
    url.searchParams.set("pageSize", String(limit));

    const payload = await getJson<CurseForgeFileResponse>(url.toString(), {
      "x-api-key": config.curseForgeApiKey,
      accept: "application/json"
    });

    return payload.data
      .filter((file) => file.downloadUrl !== null)
      .map((file) => ({
        provider: "curseforge",
        versionId: String(file.id),
        name: file.displayName,
        fileName: file.fileName,
        fileUrl: file.downloadUrl!,
        fileHash: file.hashes.find((hash) => hash.algo === 1)?.value ?? null,
        gameVersions: file.gameVersions,
        loaders: [],
        kind: "mod",
        publishedAt: file.fileDate
      }));
  }

  async installPackage(input: {
    serverId: string;
    provider: ContentProvider;
    projectId: string;
    requestedVersionId?: string;
    kind?: PackageKind;
  }): Promise<InstallResult> {
    const server = store.getServerById(input.serverId);
    if (!server) {
      throw new Error("Server not found");
    }

    const versions = await this.listVersions({
      provider: input.provider,
      projectId: input.projectId,
      server,
      limit: 50
    });

    if (versions.length === 0) {
      throw new Error("No installable versions were found for this project and server version");
    }

    const version = input.requestedVersionId
      ? versions.find((entry) => entry.versionId === input.requestedVersionId)
      : versions.find((entry) => isVersionCompatible(server, entry));

    if (!version) {
      throw new Error("No compatible version found for this server");
    }

    const installKind = input.kind ?? version.kind;
    const installDir = resolveInstallDir(server, installKind);
    ensureDir(installDir);

    const outputPath = path.join(installDir, version.fileName);
    await downloadToFile(version.fileUrl, outputPath);

    const hash = version.fileHash ?? fileSha1(outputPath);

    const existing = store.getServerPackageByProject(server.id, input.provider, input.projectId);
    if (existing) {
      if (existing.filePath !== outputPath && fs.existsSync(existing.filePath)) {
        fs.rmSync(existing.filePath, { force: true });
      }

      store.updateServerPackageVersion(existing.id, {
        versionId: version.versionId,
        gameVersion: server.mcVersion,
        filePath: outputPath,
        fileName: version.fileName,
        fileHash: hash,
        loader: version.loaders.join(",")
      });

      return {
        packageId: existing.id,
        serverId: server.id,
        provider: input.provider,
        projectId: input.projectId,
        versionId: version.versionId,
        filePath: outputPath
      };
    }

    const packageRecord = store.createServerPackage({
      serverId: server.id,
      provider: input.provider,
      projectId: input.projectId,
      versionId: version.versionId,
      slug: input.projectId,
      name: `${input.provider}:${input.projectId}`,
      kind: installKind,
      loader: version.loaders.join(","),
      gameVersion: server.mcVersion,
      filePath: outputPath,
      fileName: version.fileName,
      fileHash: hash
    });

    return {
      packageId: packageRecord.id,
      serverId: server.id,
      provider: input.provider,
      projectId: input.projectId,
      versionId: version.versionId,
      filePath: outputPath
    };
  }

  listInstalled(serverId: string) {
    return store.listServerPackages(serverId);
  }

  uninstallPackage(serverId: string, packageId: string): void {
    const existing = store.getServerPackage(packageId);
    if (!existing || existing.serverId !== serverId) {
      throw new Error("Installed package not found for server");
    }

    if (fs.existsSync(existing.filePath)) {
      fs.rmSync(existing.filePath, { force: true });
    }

    store.deleteServerPackage(packageId);
  }

  async checkForUpdates(serverId: string): Promise<
    Array<{
      packageId: string;
      provider: ContentProvider;
      projectId: string;
      currentVersionId: string;
      latestVersionId: string;
      available: boolean;
    }>
  > {
    const server = store.getServerById(serverId);
    if (!server) {
      throw new Error("Server not found");
    }

    const installed = store.listServerPackages(serverId);
    const updates: Array<{
      packageId: string;
      provider: ContentProvider;
      projectId: string;
      currentVersionId: string;
      latestVersionId: string;
      available: boolean;
    }> = [];

    for (const pkg of installed) {
      const versions = await this.listVersions({
        provider: pkg.provider,
        projectId: pkg.projectId,
        server,
        limit: 20
      });

      const latest = versions.find((version) => isVersionCompatible(server, version)) ?? versions[0];
      if (!latest) {
        updates.push({
          packageId: pkg.id,
          provider: pkg.provider,
          projectId: pkg.projectId,
          currentVersionId: pkg.versionId,
          latestVersionId: pkg.versionId,
          available: false
        });
        continue;
      }

      updates.push({
        packageId: pkg.id,
        provider: pkg.provider,
        projectId: pkg.projectId,
        currentVersionId: pkg.versionId,
        latestVersionId: latest.versionId,
        available: latest.versionId !== pkg.versionId
      });
    }

    return updates;
  }

  async updateInstalledPackage(serverId: string, packageId: string): Promise<InstallResult> {
    const installed = store.getServerPackage(packageId);
    if (!installed || installed.serverId !== serverId) {
      throw new Error("Installed package not found for server");
    }

    const updates = await this.checkForUpdates(serverId);
    const candidate = updates.find((entry) => entry.packageId === packageId);
    if (!candidate || !candidate.available) {
      return {
        packageId,
        serverId,
        provider: installed.provider,
        projectId: installed.projectId,
        versionId: installed.versionId,
        filePath: installed.filePath
      };
    }

    return this.installPackage({
      serverId,
      provider: installed.provider,
      projectId: installed.projectId,
      requestedVersionId: candidate.latestVersionId,
      kind: installed.kind
    });
  }
}
