import { request } from "undici";

export type VersionEntry = {
  id: string;
  stable: boolean;
  source: string;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await request(url, {
    headers: {
      "user-agent": "SimpleServers/0.1 (+https://github.com)"
    }
  });

  if (res.statusCode >= 400) {
    throw new Error(`Failed to fetch ${url}, status=${res.statusCode}`);
  }

  return (await res.body.json()) as T;
}

export class VersionCatalogService {
  async listVanillaVersions(): Promise<VersionEntry[]> {
    const manifest = await getJson<{
      latest: { release: string; snapshot: string };
      versions: Array<{ id: string; type: string }>;
    }>("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json");

    return manifest.versions.slice(0, 80).map((v) => ({
      id: v.id,
      stable: v.type === "release",
      source: "mojang"
    }));
  }

  async listPaperVersions(): Promise<VersionEntry[]> {
    try {
      const payload = await getJson<{ versions: string[] }>("https://api.papermc.io/v2/projects/paper");

      return payload.versions.slice().reverse().slice(0, 80).map((id) => ({
        id,
        stable: true,
        source: "papermc"
      }));
    } catch {
      return [];
    }
  }

  async listFabricVersions(): Promise<VersionEntry[]> {
    const payload = await getJson<Array<{ version: string; stable: boolean }>>(
      "https://meta.fabricmc.net/v2/versions/game"
    );

    return payload.slice(0, 80).map((v) => ({
      id: v.version,
      stable: v.stable,
      source: "fabric-meta"
    }));
  }

  async resolveVanillaServerJar(versionId: string): Promise<string> {
    const manifest = await getJson<{ versions: Array<{ id: string; url: string }> }>(
      "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json"
    );

    const match = manifest.versions.find((v) => v.id === versionId);
    if (!match) {
      throw new Error(`Vanilla version ${versionId} not found`);
    }

    const detail = await getJson<{ downloads?: { server?: { url: string } } }>(match.url);
    const url = detail.downloads?.server?.url;
    if (!url) {
      throw new Error(`Version ${versionId} does not expose a server jar`);
    }

    return url;
  }

  async resolvePaperServerJar(versionId: string): Promise<string> {
    const detail = await getJson<{
      builds: number[];
    }>(`https://api.papermc.io/v2/projects/paper/versions/${versionId}`);

    const latestBuild = detail.builds.at(-1);
    if (!latestBuild) {
      throw new Error(`No Paper builds for version ${versionId}`);
    }

    const buildDetail = await getJson<{
      downloads?: { application?: { name: string } };
    }>(`https://api.papermc.io/v2/projects/paper/versions/${versionId}/builds/${latestBuild}`);

    const fileName = buildDetail.downloads?.application?.name;
    if (!fileName) {
      throw new Error(`Paper build ${latestBuild} for ${versionId} missing download metadata`);
    }

    return `https://api.papermc.io/v2/projects/paper/versions/${versionId}/builds/${latestBuild}/downloads/${fileName}`;
  }

  async resolveFabricServerJar(versionId: string): Promise<string> {
    const [loaders, installers] = await Promise.all([
      getJson<Array<{ version: string; stable: boolean }>>("https://meta.fabricmc.net/v2/versions/loader"),
      getJson<Array<{ version: string; stable: boolean }>>("https://meta.fabricmc.net/v2/versions/installer")
    ]);

    const loader = loaders.find((v) => v.stable) ?? loaders[0];
    const installer = installers.find((v) => v.stable) ?? installers[0];

    if (!loader || !installer) {
      throw new Error("Unable to resolve Fabric loader/installer versions");
    }

    return `https://meta.fabricmc.net/v2/versions/loader/${versionId}/${loader.version}/${installer.version}/server/jar`;
  }

  async getSetupCatalog(): Promise<{
    vanilla: VersionEntry[];
    paper: VersionEntry[];
    fabric: VersionEntry[];
  }> {
    const [vanilla, paper, fabric] = await Promise.all([
      this.listVanillaVersions(),
      this.listPaperVersions(),
      this.listFabricVersions()
    ]);

    return { vanilla, paper, fabric };
  }
}
