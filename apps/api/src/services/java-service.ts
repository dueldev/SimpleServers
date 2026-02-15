import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import AdmZip from "adm-zip";
import * as tar from "tar";
import { loadConfig } from "../lib/config.js";
import { downloadToFile, fetchJsonWithRetry } from "../lib/download.js";

const execFileAsync = promisify(execFile);
const config = loadConfig();
const managedJavaDir = path.join(config.dataDir, "java");
const managedJavaCacheDir = path.join(config.cacheDir, "java");

export type JavaRuntime = {
  path: string;
  version: number | null;
  rawVersion: string;
};

export type JavaChannel = {
  major: number;
  lts: boolean;
  recommendedFor: string;
  adoptiumApi: string;
};

type AdoptiumAsset = {
  binary?: {
    package?: {
      name?: string;
      link?: string;
      checksum?: string;
    };
  };
};

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function parseJavaMajor(versionOutput: string): number | null {
  const normalized = versionOutput.replaceAll("\n", " ").replaceAll("\r", " ");
  const quoted = normalized.match(/version\s+"([^"]+)"/);
  if (!quoted) {
    return null;
  }

  const token = quoted[1];
  if (token.startsWith("1.")) {
    const legacy = Number(token.split(".")[1]);
    return Number.isNaN(legacy) ? null : legacy;
  }

  const major = Number(token.split(".")[0]);
  return Number.isNaN(major) ? null : major;
}

function toAdoptiumOs(platformName: NodeJS.Platform): "windows" | "linux" | "mac" | null {
  if (platformName === "win32") {
    return "windows";
  }
  if (platformName === "linux") {
    return "linux";
  }
  if (platformName === "darwin") {
    return "mac";
  }
  return null;
}

function toAdoptiumArch(archName: string): "x64" | "aarch64" | null {
  if (archName === "x64") {
    return "x64";
  }
  if (archName === "arm64") {
    return "aarch64";
  }
  return null;
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function findJavaExecutables(rootDir: string, maxDepth = 8): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const matches: string[] = [];
  const stack: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }];
  const fileName = process.platform === "win32" ? "java.exe" : "java";

  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) {
      continue;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(next.dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(next.dir, entry.name);
      if (entry.isDirectory()) {
        if (next.depth < maxDepth) {
          stack.push({ dir: fullPath, depth: next.depth + 1 });
        }
        continue;
      }

      if (entry.isFile() && entry.name === fileName && fullPath.includes(`${path.sep}bin${path.sep}`)) {
        matches.push(fullPath);
      }
    }
  }

  matches.sort((left, right) => left.length - right.length);
  return matches;
}

function requiredJavaMajor(mcVersion: string): number {
  const match = mcVersion.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) {
    return 21;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);

  if (major > 1) {
    return 21;
  }

  if (minor >= 21) {
    return 21;
  }

  if (minor >= 17) {
    return 17;
  }

  return 8;
}

export class JavaService {
  async inspectJava(javaPath: string): Promise<JavaRuntime> {
    const { stderr, stdout } = await execFileAsync(javaPath, ["-version"]);
    const raw = `${stderr}\n${stdout}`.trim();
    return {
      path: javaPath,
      version: parseJavaMajor(raw),
      rawVersion: raw
    };
  }

  async discoverJavaCandidates(): Promise<JavaRuntime[]> {
    const candidates = ["java", ...findJavaExecutables(managedJavaDir)];
    const seen = new Set<string>();
    const results: JavaRuntime[] = [];

    for (const candidate of candidates) {
      if (seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);

      try {
        const runtime = await this.inspectJava(candidate);
        results.push(runtime);
      } catch {
        // ignore invalid candidates
      }
    }

    return results;
  }

  async chooseJavaForVersion(mcVersion: string): Promise<JavaRuntime> {
    const required = requiredJavaMajor(mcVersion);
    let runtimes = await this.discoverJavaCandidates();

    const exactOrHigher = runtimes.find((runtime) => runtime.version !== null && runtime.version >= required);
    if (exactOrHigher) {
      return exactOrHigher;
    }

    const managedRuntime = await this.installManagedRuntime(required);
    if (managedRuntime.version !== null && managedRuntime.version >= required) {
      return managedRuntime;
    }

    runtimes = await this.discoverJavaCandidates();
    const fallback = runtimes.find((runtime) => runtime.version !== null && runtime.version >= required);
    if (fallback) {
      return fallback;
    }

    throw new Error(`No Java runtime found meeting requirement Java ${required}+ for Minecraft ${mcVersion}`);
  }

  getRequiredJavaMajor(mcVersion: string): number {
    return requiredJavaMajor(mcVersion);
  }

  listJavaChannels(): JavaChannel[] {
    return [
      {
        major: 8,
        lts: true,
        recommendedFor: "legacy modpacks",
        adoptiumApi: "https://api.adoptium.net/v3/assets/feature_releases/8/ga?image_type=jdk&jvm_impl=hotspot"
      },
      {
        major: 17,
        lts: true,
        recommendedFor: "Minecraft 1.17 - 1.20.4",
        adoptiumApi: "https://api.adoptium.net/v3/assets/feature_releases/17/ga?image_type=jdk&jvm_impl=hotspot"
      },
      {
        major: 21,
        lts: true,
        recommendedFor: "Minecraft 1.20.5+ and modern server stacks",
        adoptiumApi: "https://api.adoptium.net/v3/assets/feature_releases/21/ga?image_type=jdk&jvm_impl=hotspot"
      }
    ];
  }

  async checkRuntimeUpdates(): Promise<
    Array<{
      path: string;
      version: number | null;
      recommendedChannel: number;
      updateRecommended: boolean;
    }>
  > {
    const runtimes = await this.discoverJavaCandidates();
    return runtimes.map((runtime) => {
      const recommended = runtime.version && runtime.version >= 21 ? runtime.version : 21;
      return {
        path: runtime.path,
        version: runtime.version,
        recommendedChannel: recommended,
        updateRecommended: runtime.version === null || runtime.version < 17
      };
    });
  }

  private async installManagedRuntime(requiredMajor: number): Promise<JavaRuntime> {
    const platform = toAdoptiumOs(process.platform);
    const arch = toAdoptiumArch(process.arch);
    if (!platform || !arch) {
      throw new Error(`Automatic Java install is not supported on platform=${process.platform} arch=${process.arch}`);
    }

    ensureDir(managedJavaDir);
    ensureDir(managedJavaCacheDir);

    const runtimeDir = path.join(managedJavaDir, `temurin-${requiredMajor}-${platform}-${arch}`);
    const existingJava = findJavaExecutables(runtimeDir)[0];
    if (existingJava) {
      try {
        const runtime = await this.inspectJava(existingJava);
        if (runtime.version !== null && runtime.version >= requiredMajor) {
          return runtime;
        }
      } catch {
        // continue to reinstall managed runtime
      }
    }

    const pkg = await this.resolveAdoptiumPackage(requiredMajor, platform, arch);
    const ext = pkg.link.endsWith(".zip") ? ".zip" : pkg.link.endsWith(".tar.gz") ? ".tar.gz" : pkg.link.endsWith(".tgz") ? ".tgz" : "";
    const safeName = (pkg.name ?? `temurin-${requiredMajor}-${platform}-${arch}${ext}`)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 180);
    const archivePath = path.join(managedJavaCacheDir, safeName);

    await downloadToFile(pkg.link, archivePath);
    if (pkg.checksum) {
      const actualSha256 = sha256File(archivePath).toLowerCase();
      if (actualSha256 !== pkg.checksum.toLowerCase()) {
        fs.rmSync(archivePath, { force: true });
        throw new Error("Downloaded Java runtime checksum mismatch");
      }
    }

    fs.rmSync(runtimeDir, { recursive: true, force: true });
    fs.mkdirSync(runtimeDir, { recursive: true });
    await this.extractArchive(archivePath, runtimeDir);

    const javaExecutable = findJavaExecutables(runtimeDir)[0];
    if (!javaExecutable) {
      throw new Error("Managed Java runtime install succeeded but no java executable was found");
    }

    if (process.platform !== "win32") {
      fs.chmodSync(javaExecutable, 0o755);
    }

    return this.inspectJava(javaExecutable);
  }

  private async resolveAdoptiumPackage(
    major: number,
    platform: "windows" | "linux" | "mac",
    arch: "x64" | "aarch64"
  ): Promise<{ link: string; name: string | null; checksum: string | null }> {
    const imageTypes: Array<"jre" | "jdk"> = ["jre", "jdk"];
    for (const imageType of imageTypes) {
      const url = new URL(`https://api.adoptium.net/v3/assets/latest/${major}/hotspot`);
      url.searchParams.set("architecture", arch);
      url.searchParams.set("os", platform);
      url.searchParams.set("image_type", imageType);
      url.searchParams.set("jvm_impl", "hotspot");
      url.searchParams.set("heap_size", "normal");
      url.searchParams.set("project", "jdk");
      url.searchParams.set("vendor", "eclipse");

      let payload: AdoptiumAsset[];
      try {
        payload = await fetchJsonWithRetry<AdoptiumAsset[]>(url.toString());
      } catch {
        continue;
      }

      for (const asset of payload) {
        const pkg = asset.binary?.package;
        if (!pkg?.link) {
          continue;
        }
        if (!pkg.link.endsWith(".zip") && !pkg.link.endsWith(".tar.gz") && !pkg.link.endsWith(".tgz")) {
          continue;
        }

        return {
          link: pkg.link,
          name: pkg.name ?? null,
          checksum: pkg.checksum ?? null
        };
      }
    }

    throw new Error(`No downloadable Temurin runtime found for Java ${major} (${platform}/${arch})`);
  }

  private async extractArchive(archivePath: string, targetDir: string): Promise<void> {
    if (archivePath.endsWith(".zip")) {
      const zip = new AdmZip(archivePath);
      zip.extractAllTo(targetDir, true);
      return;
    }

    if (archivePath.endsWith(".tar.gz") || archivePath.endsWith(".tgz")) {
      await tar.x({
        file: archivePath,
        cwd: targetDir
      });
      return;
    }

    throw new Error(`Unsupported Java archive format: ${archivePath}`);
  }
}
