import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { request } from "undici";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import * as tar from "tar";
import { loadConfig } from "../lib/config.js";
import { store } from "../repositories/store.js";

const config = loadConfig();
const cloudMockRoot = path.join(config.dataDir, "cloud-mock");

type EncryptionMetadata = {
  algorithm: "aes-256-gcm";
  salt: string;
  iv: string;
  tag: string;
};

type VerifiedArchive = {
  entryCount: number;
  sampleEntries: string[];
  archiveSha256: string;
};

type S3LikeDestinationConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  dryRun?: boolean;
  mockDir?: string;
};

type GoogleDriveDestinationConfig = {
  accessToken: string;
  folderId: string;
  prefix?: string;
  dryRun?: boolean;
  mockDir?: string;
};

function fileName(serverName: string): string {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  return `${serverName}-${stamp}.tar.gz`;
}

function safeRemoteSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._/-]/g, "_");
}

function parseJsonConfig<T>(raw: string, label: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid ${label} JSON`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid ${label} payload`);
  }
  return parsed as T;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required field: ${field}`);
  }
  return value.trim();
}

async function createTarGz(sourceDir: string, outputFile: string): Promise<void> {
  await tar.create(
    {
      cwd: sourceDir,
      gzip: true,
      file: outputFile,
      portable: true
    },
    ["."]
  );
}

async function extractTarGz(inputFile: string, targetDir: string): Promise<void> {
  await tar.extract({ cwd: targetDir, file: inputFile, strip: 1 });
}

async function fileSha256(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk as Buffer));
    stream.on("error", reject);
    stream.on("end", () => resolve());
  });
  return hash.digest("hex");
}

async function encryptFile(inputPath: string, outputPath: string, passphrase: string): Promise<EncryptionMetadata> {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  await pipeline(fs.createReadStream(inputPath), cipher, fs.createWriteStream(outputPath));
  const tag = cipher.getAuthTag();
  return {
    algorithm: "aes-256-gcm",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64")
  };
}

async function decryptFile(
  inputPath: string,
  outputPath: string,
  passphrase: string,
  encryption: EncryptionMetadata
): Promise<void> {
  const key = crypto.scryptSync(passphrase, Buffer.from(encryption.salt, "base64"), 32);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(encryption.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encryption.tag, "base64"));
  await pipeline(fs.createReadStream(inputPath), decipher, fs.createWriteStream(outputPath));
}

async function verifyArchive(archivePath: string): Promise<VerifiedArchive> {
  const sampleEntries: string[] = [];
  let entryCount = 0;
  await tar.t({
    file: archivePath,
    onentry: (entry) => {
      entryCount += 1;
      if (sampleEntries.length < 12) {
        sampleEntries.push(entry.path);
      }
    }
  });
  if (entryCount === 0) {
    throw new Error("Backup archive is empty");
  }
  const archiveSha256 = await fileSha256(archivePath);
  return {
    entryCount,
    sampleEntries,
    archiveSha256
  };
}

async function writeStreamToFile(readable: unknown, outputPath: string): Promise<void> {
  if (!readable || typeof (readable as { pipe?: unknown }).pipe !== "function") {
    throw new Error("Provider did not return a readable stream");
  }
  await pipeline(readable as NodeJS.ReadableStream, fs.createWriteStream(outputPath));
}

function ensureInsideCloudMock(mockDir: string, remoteKey: string): string {
  const resolvedRoot = path.resolve(mockDir);
  const resolvedTarget = path.resolve(mockDir, remoteKey);
  if (!resolvedTarget.startsWith(resolvedRoot)) {
    throw new Error("Invalid cloud mock target");
  }
  return resolvedTarget;
}

function buildS3Client(destination: S3LikeDestinationConfig): S3Client {
  return new S3Client({
    region: destination.region,
    endpoint: destination.endpoint,
    forcePathStyle: destination.forcePathStyle ?? Boolean(destination.endpoint),
    credentials: {
      accessKeyId: destination.accessKeyId,
      secretAccessKey: destination.secretAccessKey
    }
  });
}

export class BackupService {
  async createBackup(serverId: string): Promise<{ backupId: string; filePath: string; sizeBytes: number }> {
    const server = store.getServerById(serverId);
    if (!server) {
      throw new Error("Server not found");
    }

    const outputFile = path.join(config.backupsDir, fileName(server.name));
    await createTarGz(server.rootPath, outputFile);

    const stat = fs.statSync(outputFile);
    const record = store.createBackup({
      serverId,
      filePath: outputFile,
      sizeBytes: stat.size
    });

    return {
      backupId: record.id,
      filePath: record.filePath,
      sizeBytes: record.sizeBytes
    };
  }

  listBackups(serverId: string) {
    return store.listBackups(serverId);
  }

  listCloudDestinations(serverId: string) {
    return store.listCloudBackupDestinations(serverId);
  }

  listCloudArtifacts(serverId: string) {
    return store.listCloudBackupArtifacts(serverId);
  }

  createCloudDestination(input: {
    serverId: string;
    provider: "s3" | "backblaze" | "google_drive";
    name: string;
    config: Record<string, unknown>;
    encryptionPassphrase: string;
    enabled: boolean;
  }) {
    if (!store.getServerById(input.serverId)) {
      throw new Error("Server not found");
    }
    return store.createCloudBackupDestination({
      serverId: input.serverId,
      provider: input.provider,
      name: input.name,
      configJson: JSON.stringify(input.config),
      encryptionPassphrase: input.encryptionPassphrase,
      enabled: input.enabled
    });
  }

  updateCloudDestination(
    destinationId: string,
    input: {
      name: string;
      config: Record<string, unknown>;
      encryptionPassphrase: string;
      enabled: boolean;
    }
  ) {
    return store.updateCloudBackupDestination(destinationId, {
      name: input.name,
      configJson: JSON.stringify(input.config),
      encryptionPassphrase: input.encryptionPassphrase,
      enabled: input.enabled
    });
  }

  deleteCloudDestination(destinationId: string): void {
    store.deleteCloudBackupDestination(destinationId);
  }

  async uploadBackupToCloud(input: {
    serverId: string;
    backupId: string;
    destinationId: string;
  }): Promise<{
    artifactId: string;
    destinationId: string;
    remoteKey: string;
    checksumSha256: string;
    encrypted: boolean;
    sizeBytes: number;
  }> {
    const server = store.getServerById(input.serverId);
    const backup = store.getBackup(input.backupId);
    const destination = store.getCloudBackupDestination(input.destinationId);
    if (!server) {
      throw new Error("Server not found");
    }
    if (!backup || backup.serverId !== input.serverId) {
      throw new Error("Backup not found for server");
    }
    if (!destination || destination.serverId !== input.serverId) {
      throw new Error("Cloud destination not found for server");
    }
    if (!fs.existsSync(backup.filePath)) {
      throw new Error("Backup file is missing from disk");
    }

    const tmpEncrypted = path.join(os.tmpdir(), `simpleservers-cloud-${backup.id}-${Date.now()}.enc`);
    const encryption = await encryptFile(backup.filePath, tmpEncrypted, destination.encryptionPassphrase);
    try {
      const checksumSha256 = await fileSha256(tmpEncrypted);
      const sizeBytes = fs.statSync(tmpEncrypted).size;
      const remoteKey = `${safeRemoteSegment(server.name)}/${backup.id}.tar.gz.enc`;

      const destinationConfig = parseJsonConfig<Record<string, unknown>>(destination.configJson, "cloud destination config");
      const providerMetadata = await this.uploadEncryptedFileByProvider({
        provider: destination.provider,
        destinationConfig,
        sourcePath: tmpEncrypted,
        remoteKey
      });

      const artifact = store.createCloudBackupArtifact({
        backupId: backup.id,
        serverId: input.serverId,
        destinationId: destination.id,
        remoteKey: providerMetadata.remoteKey,
        checksumSha256,
        encrypted: true,
        sizeBytes,
        metadataJson: JSON.stringify({
          encryption,
          providerMetadata: providerMetadata.metadata
        }),
        status: "uploaded"
      });

      return {
        artifactId: artifact.id,
        destinationId: artifact.destinationId,
        remoteKey: artifact.remoteKey,
        checksumSha256: artifact.checksumSha256,
        encrypted: artifact.encrypted === 1,
        sizeBytes: artifact.sizeBytes
      };
    } finally {
      if (fs.existsSync(tmpEncrypted)) {
        fs.rmSync(tmpEncrypted, { force: true });
      }
    }
  }

  async restoreBackup(serverId: string, backupId: string): Promise<{ preRestoreBackupId: string; verification: VerifiedArchive }> {
    const server = store.getServerById(serverId);
    const backup = store.getBackup(backupId);

    if (!server) {
      throw new Error("Server not found");
    }

    if (!backup || backup.serverId !== serverId) {
      throw new Error("Backup not found for server");
    }

    const startedAt = Date.now();
    try {
      const restore = await this.restoreArchive(serverId, backup.filePath, backupId);
      store.createBackupRestoreEvent({
        serverId,
        backupId,
        source: "local",
        success: true,
        verified: true,
        detail: `Restored ${restore.verification.entryCount} entries from local backup`,
        durationMs: Date.now() - startedAt
      });
      return restore;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      store.createBackupRestoreEvent({
        serverId,
        backupId,
        source: "local",
        success: false,
        verified: false,
        detail: message,
        durationMs: Date.now() - startedAt
      });
      throw error;
    }
  }

  async restoreCloudArtifact(serverId: string, artifactId: string): Promise<{ preRestoreBackupId: string; verification: VerifiedArchive }> {
    const artifact = store.getCloudBackupArtifact(artifactId);
    if (!artifact || artifact.serverId !== serverId) {
      throw new Error("Cloud artifact not found for server");
    }
    const destination = store.getCloudBackupDestination(artifact.destinationId);
    if (!destination || destination.serverId !== serverId) {
      throw new Error("Cloud destination not found for artifact");
    }

    const metadataPayload = parseJsonConfig<{
      encryption?: EncryptionMetadata;
      providerMetadata?: Record<string, unknown>;
    }>(artifact.metadataJson, "cloud artifact metadata");
    if (!metadataPayload.encryption) {
      throw new Error("Missing encryption metadata for cloud artifact");
    }

    const destinationConfig = parseJsonConfig<Record<string, unknown>>(destination.configJson, "cloud destination config");
    const encryptedTmp = path.join(os.tmpdir(), `simpleservers-cloud-restore-${artifact.id}-${Date.now()}.enc`);
    const archiveTmp = path.join(os.tmpdir(), `simpleservers-cloud-restore-${artifact.id}-${Date.now()}.tar.gz`);
    const startedAt = Date.now();

    try {
      await this.downloadEncryptedFileByProvider({
        provider: destination.provider,
        destinationConfig,
        remoteKey: artifact.remoteKey,
        providerMetadata: metadataPayload.providerMetadata ?? {},
        outputPath: encryptedTmp
      });

      const downloadedChecksum = await fileSha256(encryptedTmp);
      if (downloadedChecksum !== artifact.checksumSha256) {
        throw new Error("Downloaded cloud artifact checksum does not match metadata");
      }

      await decryptFile(encryptedTmp, archiveTmp, destination.encryptionPassphrase, metadataPayload.encryption);
      const restore = await this.restoreArchive(serverId, archiveTmp, artifact.backupId);
      store.createBackupRestoreEvent({
        serverId,
        backupId: artifact.backupId,
        source: "cloud",
        success: true,
        verified: true,
        detail: `Cloud restore verified with ${restore.verification.entryCount} entries`,
        durationMs: Date.now() - startedAt
      });
      return restore;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      store.createBackupRestoreEvent({
        serverId,
        backupId: artifact.backupId,
        source: "cloud",
        success: false,
        verified: false,
        detail: message,
        durationMs: Date.now() - startedAt
      });
      throw error;
    } finally {
      if (fs.existsSync(encryptedTmp)) {
        fs.rmSync(encryptedTmp, { force: true });
      }
      if (fs.existsSync(archiveTmp)) {
        fs.rmSync(archiveTmp, { force: true });
      }
    }
  }

  private async restoreArchive(
    serverId: string,
    archivePath: string,
    restoreTargetBackupId: string
  ): Promise<{ preRestoreBackupId: string; verification: VerifiedArchive }> {
    const server = store.getServerById(serverId);
    if (!server) {
      throw new Error("Server not found");
    }
    if (!fs.existsSync(archivePath)) {
      throw new Error("Backup archive file not found");
    }

    const verification = await verifyArchive(archivePath);
    const preRestoreSnapshot = await this.createBackup(serverId);

    const entries = fs.readdirSync(server.rootPath);
    for (const entry of entries) {
      if (entry === "server.jar") {
        continue;
      }
      fs.rmSync(path.join(server.rootPath, entry), { recursive: true, force: true });
    }

    await extractTarGz(archivePath, server.rootPath);
    store.markBackupRestored(restoreTargetBackupId);

    return {
      preRestoreBackupId: preRestoreSnapshot.backupId,
      verification
    };
  }

  private async uploadEncryptedFileByProvider(input: {
    provider: "s3" | "backblaze" | "google_drive";
    destinationConfig: Record<string, unknown>;
    sourcePath: string;
    remoteKey: string;
  }): Promise<{ remoteKey: string; metadata: Record<string, unknown> }> {
    if (input.provider === "s3" || input.provider === "backblaze") {
      const destination = input.destinationConfig as S3LikeDestinationConfig;
      const bucket = assertString(destination.bucket, "bucket");
      const region = assertString(destination.region, "region");
      const accessKeyId = assertString(destination.accessKeyId, "accessKeyId");
      const secretAccessKey = assertString(destination.secretAccessKey, "secretAccessKey");
      const prefix = typeof destination.prefix === "string" ? destination.prefix.trim() : "";
      const remoteKey = [prefix, input.remoteKey].filter(Boolean).join("/");

      if (destination.dryRun) {
        const mockDir = destination.mockDir ? path.resolve(destination.mockDir) : path.join(cloudMockRoot, `s3-${bucket}`);
        const targetPath = ensureInsideCloudMock(mockDir, remoteKey);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(input.sourcePath, targetPath);
        return {
          remoteKey,
          metadata: {
            mode: "dry_run",
            bucket,
            mockPath: targetPath
          }
        };
      }

      const client = buildS3Client({
        bucket,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint: destination.endpoint,
        forcePathStyle: destination.forcePathStyle
      });

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: remoteKey,
          Body: fs.createReadStream(input.sourcePath),
          ContentType: "application/octet-stream"
        })
      );

      return {
        remoteKey,
        metadata: {
          mode: "s3",
          bucket,
          region,
          endpoint: destination.endpoint ?? null
        }
      };
    }

    const destination = input.destinationConfig as GoogleDriveDestinationConfig;
    const accessToken = assertString(destination.accessToken, "accessToken");
    const folderId = assertString(destination.folderId, "folderId");
    const prefix = typeof destination.prefix === "string" ? destination.prefix.trim() : "";
    const fileName = [prefix, path.basename(input.remoteKey)].filter(Boolean).join("-");

    if (destination.dryRun) {
      const mockDir = destination.mockDir ? path.resolve(destination.mockDir) : path.join(cloudMockRoot, "google-drive");
      const targetPath = ensureInsideCloudMock(mockDir, `${folderId}/${fileName}`);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(input.sourcePath, targetPath);
      return {
        remoteKey: fileName,
        metadata: {
          mode: "dry_run",
          folderId,
          mockPath: targetPath,
          fileName
        }
      };
    }

    const init = await request("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json; charset=UTF-8",
        "x-upload-content-type": "application/octet-stream"
      },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId]
      })
    });

    const uploadLocationHeader = init.headers.location;
    const uploadLocation = Array.isArray(uploadLocationHeader) ? uploadLocationHeader[0] : uploadLocationHeader;
    if (!uploadLocation) {
      const raw = await init.body.text();
      throw new Error(`Google Drive resumable upload initialization failed: ${raw.slice(0, 300)}`);
    }

    const upload = await request(uploadLocation, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/octet-stream"
      },
      body: fs.createReadStream(input.sourcePath)
    });

    if (upload.statusCode >= 400) {
      const raw = await upload.body.text();
      throw new Error(`Google Drive upload failed: ${raw.slice(0, 300)}`);
    }

    const uploaded = (await upload.body.json()) as { id?: string; name?: string };
    if (!uploaded.id) {
      throw new Error("Google Drive upload did not return a file id");
    }

    return {
      remoteKey: uploaded.id,
      metadata: {
        mode: "google_drive",
        fileId: uploaded.id,
        fileName: uploaded.name ?? fileName,
        folderId
      }
    };
  }

  private async downloadEncryptedFileByProvider(input: {
    provider: "s3" | "backblaze" | "google_drive";
    destinationConfig: Record<string, unknown>;
    remoteKey: string;
    providerMetadata: Record<string, unknown>;
    outputPath: string;
  }): Promise<void> {
    if (input.provider === "s3" || input.provider === "backblaze") {
      const destination = input.destinationConfig as S3LikeDestinationConfig;
      const bucket = assertString(destination.bucket, "bucket");
      const region = assertString(destination.region, "region");
      const accessKeyId = assertString(destination.accessKeyId, "accessKeyId");
      const secretAccessKey = assertString(destination.secretAccessKey, "secretAccessKey");

      if (destination.dryRun) {
        const mockDir = destination.mockDir ? path.resolve(destination.mockDir) : path.join(cloudMockRoot, `s3-${bucket}`);
        const sourcePath = ensureInsideCloudMock(mockDir, input.remoteKey);
        if (!fs.existsSync(sourcePath)) {
          throw new Error("Cloud dry-run artifact not found");
        }
        fs.copyFileSync(sourcePath, input.outputPath);
        return;
      }

      const client = buildS3Client({
        bucket,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint: destination.endpoint,
        forcePathStyle: destination.forcePathStyle
      });
      const payload = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: input.remoteKey
        })
      );
      await writeStreamToFile(payload.Body, input.outputPath);
      return;
    }

    const destination = input.destinationConfig as GoogleDriveDestinationConfig;
    const accessToken = assertString(destination.accessToken, "accessToken");
    const dryRun = destination.dryRun;
    const fileId = typeof input.providerMetadata.fileId === "string" ? input.providerMetadata.fileId : input.remoteKey;

    if (dryRun) {
      const folderId = assertString(destination.folderId, "folderId");
      const fileName = typeof input.providerMetadata.fileName === "string" ? input.providerMetadata.fileName : input.remoteKey;
      const mockDir = destination.mockDir ? path.resolve(destination.mockDir) : path.join(cloudMockRoot, "google-drive");
      const sourcePath = ensureInsideCloudMock(mockDir, `${folderId}/${fileName}`);
      if (!fs.existsSync(sourcePath)) {
        throw new Error("Cloud dry-run artifact not found");
      }
      fs.copyFileSync(sourcePath, input.outputPath);
      return;
    }

    const response = await request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });

    if (response.statusCode >= 400) {
      const raw = await response.body.text();
      throw new Error(`Google Drive download failed: ${raw.slice(0, 300)}`);
    }

    await writeStreamToFile(response.body, input.outputPath);
  }
}
