import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { ApiServices } from "../src/app.js";

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "simpleservers-api-test-"));
process.env.SIMPLESERVERS_DATA_DIR = testDataDir;
process.env.SIMPLESERVERS_ADMIN_TOKEN = "test-owner-token";
process.env.SIMPLESERVERS_REMOTE_TOKEN = "test-remote-token";
process.env.LOG_LEVEL = "error";

let app: FastifyInstance;
let store: typeof import("../src/repositories/store.js").store;
let services: ApiServices;

beforeAll(async () => {
  const [{ createApiApp }, storeModule] = await Promise.all([import("../src/app.js"), import("../src/repositories/store.js")]);
  store = storeModule.store;

  const created = await createApiApp({
    startBackgroundWorkers: false
  });

  app = created.app;
  services = created.services;
});

afterAll(async () => {
  await app.close();
  const { closeDb } = await import("../src/lib/db.js");
  closeDb();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EBUSY" && code !== "ENOTEMPTY" && code !== "EPERM") {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
});

describe("api integration", () => {
  it("returns health without auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true });
  });

  it("returns host hardware profile", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/system/hardware",
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      platform: expect.any(String),
      arch: expect.any(String),
      cpuCores: expect.any(Number),
      totalMemoryMb: expect.any(Number),
      freeMemoryMb: expect.any(Number),
      recommendations: {
        quickStartMinMemoryMb: expect.any(Number),
        quickStartMaxMemoryMb: expect.any(Number)
      }
    });
  });

  it("returns build trust and security transparency report", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/system/trust",
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().build.appVersion).toBe("0.5.3");
    expect(response.json().security.localOnlyByDefault).toBe(true);
    expect(response.json().security.authModel).toBe("token-rbac");
    expect(response.json().exports.auditExportEndpoint).toBe("/audit/export");
    expect(response.json().verification).toHaveProperty("sbomUrl");
  });

  it("verifies local file checksum through trust endpoint", async () => {
    const targetPath = path.join(testDataDir, "checksum-target.txt");
    fs.writeFileSync(targetPath, "checksum-target", "utf8");
    const expectedSha256 = crypto.createHash("sha256").update("checksum-target").digest("hex");

    const response = await app.inject({
      method: "POST",
      url: "/system/trust/verify-checksum",
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        filePath: targetPath,
        expectedSha256
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().sha256).toBe(expectedSha256);
    expect(response.json().matchesExpected).toBe(true);
  });

  it("returns reliability, hardening, and bedrock strategy payloads", async () => {
    const [reliability, hardening, bedrock] = await Promise.all([
      app.inject({
        method: "GET",
        url: "/system/reliability?hours=24",
        headers: {
          "x-api-token": "test-owner-token"
        }
      }),
      app.inject({
        method: "GET",
        url: "/system/hardening-checklist",
        headers: {
          "x-api-token": "test-owner-token"
        }
      }),
      app.inject({
        method: "GET",
        url: "/system/bedrock-strategy",
        headers: {
          "x-api-token": "test-owner-token"
        }
      })
    ]);

    expect(reliability.statusCode).toBe(200);
    expect(reliability.json().startup).toBeDefined();
    expect(reliability.json().backups).toBeDefined();
    expect(hardening.statusCode).toBe(200);
    expect(Array.isArray(hardening.json().hardeningSteps)).toBe(true);
    expect(bedrock.statusCode).toBe(200);
    expect(bedrock.json().selectedStrategy).toContain("crossplay");
  });

  it("exports audit entries in json and csv formats", async () => {
    const jsonResponse = await app.inject({
      method: "GET",
      url: "/audit/export?format=json&limit=20",
      headers: {
        "x-api-token": "test-owner-token"
      }
    });
    expect(jsonResponse.statusCode).toBe(200);
    expect(jsonResponse.json()).toHaveProperty("logs");

    const csvResponse = await app.inject({
      method: "GET",
      url: "/audit/export?format=csv&limit=20",
      headers: {
        "x-api-token": "test-owner-token"
      }
    });
    expect(csvResponse.statusCode).toBe(200);
    expect(csvResponse.headers["content-type"]).toContain("text/csv");
    expect(csvResponse.body).toContain("actor");
  });

  it("creates encrypted cloud backup destinations and uploads/restores via dry-run storage", async () => {
    const serverRoot = path.join(testDataDir, "servers", "cloud-backup-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    fs.writeFileSync(path.join(serverRoot, "server.properties"), "motd=cloud-before\n", "utf8");
    fs.writeFileSync(path.join(serverRoot, "server.jar"), "placeholder", "utf8");
    fs.writeFileSync(path.join(serverRoot, "eula.txt"), "eula=true\n", "utf8");

    const server = store.createServer({
      name: "cloud-backup-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25618,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const backupResponse = await app.inject({
      method: "POST",
      url: `/servers/${server.id}/backups`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });
    expect(backupResponse.statusCode).toBe(200);
    const backupId = backupResponse.json().backup.backupId as string;

    const destinationResponse = await app.inject({
      method: "POST",
      url: `/servers/${server.id}/cloud-backup-destinations`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        provider: "s3",
        name: "dry-run-s3",
        encryptionPassphrase: "very-secure-passphrase",
        enabled: true,
        config: {
          bucket: "dry-run-bucket",
          region: "us-east-1",
          accessKeyId: "dry-run-key",
          secretAccessKey: "dry-run-secret",
          prefix: "integration",
          dryRun: true,
          mockDir: path.join(testDataDir, "cloud-mock")
        }
      }
    });
    expect(destinationResponse.statusCode).toBe(200);
    const destinationId = destinationResponse.json().destination.id as string;

    fs.writeFileSync(path.join(serverRoot, "server.properties"), "motd=cloud-after\n", "utf8");

    const uploadResponse = await app.inject({
      method: "POST",
      url: `/servers/${server.id}/backups/${backupId}/upload-cloud`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        destinationId
      }
    });
    expect(uploadResponse.statusCode).toBe(200);
    const artifactId = uploadResponse.json().upload.artifactId as string;

    const restoreResponse = await app.inject({
      method: "POST",
      url: `/servers/${server.id}/cloud-backups/${artifactId}/restore`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {}
    });
    expect(restoreResponse.statusCode).toBe(200);
    expect(fs.readFileSync(path.join(serverRoot, "server.properties"), "utf8")).toContain("motd=cloud-before");
  });

  it("manages player admin state via first-class endpoints", async () => {
    const serverRoot = path.join(testDataDir, "servers", "player-admin-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    fs.writeFileSync(path.join(serverRoot, "server.jar"), "placeholder", "utf8");
    const server = store.createServer({
      name: "player-admin-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25619,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const opResponse = await app.inject({
      method: "POST",
      url: `/servers/${server.id}/players/op`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        name: "Alice"
      }
    });
    expect(opResponse.statusCode).toBe(200);

    const whitelistResponse = await app.inject({
      method: "POST",
      url: `/servers/${server.id}/players/whitelist`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        name: "Alice"
      }
    });
    expect(whitelistResponse.statusCode).toBe(200);

    const banIpResponse = await app.inject({
      method: "POST",
      url: `/servers/${server.id}/players/ban-ip`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        ip: "203.0.113.10",
        reason: "test"
      }
    });
    expect(banIpResponse.statusCode).toBe(200);

    const stateResponse = await app.inject({
      method: "GET",
      url: `/servers/${server.id}/player-admin?limit=100`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });
    expect(stateResponse.statusCode).toBe(200);
    expect(stateResponse.json().state.ops.some((entry: { name: string }) => entry.name === "Alice")).toBe(true);
    expect(stateResponse.json().state.whitelist.some((entry: { name: string }) => entry.name === "Alice")).toBe(true);
    expect(stateResponse.json().state.bannedIps.some((entry: { ip: string }) => entry.ip === "203.0.113.10")).toBe(true);
  });

  it("supports modpack planning and rollback history endpoints", async () => {
    const serverRoot = path.join(testDataDir, "servers", "modpack-plan-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    fs.writeFileSync(path.join(serverRoot, "server.jar"), "placeholder", "utf8");
    const server = store.createServer({
      name: "modpack-plan-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25620,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const planResponse = await app.inject({
      method: "POST",
      url: `/servers/${server.id}/modpack/plan`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        provider: "modrinth",
        projectId: "demo-modpack"
      }
    });
    expect(planResponse.statusCode).toBe(200);
    expect(planResponse.json().rollbackPlan.rollbackEndpoint).toBe(`/servers/${server.id}/modpack/rollback`);

    const rollbacksResponse = await app.inject({
      method: "GET",
      url: `/servers/${server.id}/modpack/rollbacks`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });
    expect(rollbacksResponse.statusCode).toBe(200);
    expect(Array.isArray(rollbacksResponse.json().rollbacks)).toBe(true);
  });

  it("imports manual migration sources and reports import history", async () => {
    const rootPath = path.join(testDataDir, "migration-manual-server");
    fs.mkdirSync(rootPath, { recursive: true });
    fs.writeFileSync(path.join(rootPath, "server.jar"), "placeholder", "utf8");

    const importResponse = await app.inject({
      method: "POST",
      url: "/migration/import/manual",
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        name: "manual-migration",
        type: "paper",
        mcVersion: "1.21.11",
        rootPath,
        port: 25621,
        bedrockPort: 19132,
        minMemoryMb: 1024,
        maxMemoryMb: 4096
      }
    });
    expect(importResponse.statusCode).toBe(200);
    expect(importResponse.json().imported.serverId).toBeTruthy();

    const listResponse = await app.inject({
      method: "GET",
      url: "/migration/imports",
      headers: {
        "x-api-token": "test-owner-token"
      }
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().imports.some((entry: { source: string }) => entry.source === "manual")).toBe(true);
  });

  it("routes terminal command submissions to runtime command dispatcher", async () => {
    const serverRoot = path.join(testDataDir, "servers", "command-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    fs.writeFileSync(path.join(serverRoot, "server.jar"), "placeholder", "utf8");
    const server = store.createServer({
      name: "command-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25622,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const originalSendCommand = services.runtime.sendCommand.bind(services.runtime);
    const seen: Array<{ serverId: string; command: string }> = [];
    services.runtime.sendCommand = (serverId: string, command: string) => {
      seen.push({ serverId, command });
    };

    try {
      const response = await app.inject({
        method: "POST",
        url: `/servers/${server.id}/command`,
        headers: {
          "x-api-token": "test-owner-token"
        },
        payload: {
          command: "say integration"
        }
      });
      expect(response.statusCode).toBe(200);
      expect(seen).toEqual([{ serverId: server.id, command: "say integration" }]);
    } finally {
      services.runtime.sendCommand = originalSendCommand;
    }
  });

  it("returns guided setup presets", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/setup/presets",
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(response.statusCode).toBe(200);
    const presetIds = response.json().presets.map((preset: { id: string }) => preset.id);
    expect(presetIds).toEqual(["custom", "survival", "modded", "minigame"]);
  });

  it("records telemetry events and returns funnel metrics", async () => {
    const eventResponse = await app.inject({
      method: "POST",
      url: "/telemetry/events",
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        sessionId: "session-abc",
        event: "ui.connect.success",
        metadata: { source: "test" }
      }
    });
    expect(eventResponse.statusCode).toBe(200);
    expect(eventResponse.json().eventId).toBeTruthy();

    await app.inject({
      method: "POST",
      url: "/telemetry/events",
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        sessionId: "session-abc",
        event: "server.create.success",
        metadata: {}
      }
    });

    const funnelResponse = await app.inject({
      method: "GET",
      url: "/telemetry/funnel?hours=24",
      headers: {
        "x-api-token": "test-owner-token"
      }
    });
    expect(funnelResponse.statusCode).toBe(200);
    expect(funnelResponse.json().stageTotals.connect).toBeGreaterThanOrEqual(1);
    expect(funnelResponse.json().stageTotals.create).toBeGreaterThanOrEqual(1);
  });

  it("rejects protected endpoints without token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/servers"
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "missing_api_token",
      message: "Missing x-api-token",
      error: "Missing x-api-token"
    });
  });

  it("returns owner identity with default token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.username).toBe("owner");
  });

  it("returns role capabilities for current user", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/system/capabilities",
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({
      username: "owner",
      role: "owner"
    });
    expect(response.json().capabilities).toMatchObject({
      serverLifecycle: true,
      serverCreate: true,
      advancedWorkspace: true,
      userManage: true,
      auditRead: true
    });
  });

  it("returns conflict when creating a server with a duplicate name", async () => {
    const serverRoot = path.join(testDataDir, "servers", "duplicate-name-existing");
    fs.mkdirSync(serverRoot, { recursive: true });
    store.createServer({
      name: "Duplicate Name",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25564,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const response = await app.inject({
      method: "POST",
      url: "/servers",
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        name: "Duplicate Name",
        type: "paper",
        mcVersion: "1.21.11",
        port: 25565,
        minMemoryMb: 1024,
        maxMemoryMb: 2048
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain("already in use");
  });

  it("creates users with owner role auth", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/users",
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        username: "ops-admin",
        role: "admin",
        apiToken: "ops-admin-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.username).toBe("ops-admin");
  });

  it("allows viewer core data access even when audit endpoint is forbidden", async () => {
    const viewerCreate = await app.inject({
      method: "POST",
      url: "/users",
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        username: "ops-viewer",
        role: "viewer",
        apiToken: "ops-viewer-token"
      }
    });
    expect(viewerCreate.statusCode).toBe(200);

    const auditResponse = await app.inject({
      method: "GET",
      url: "/audit",
      headers: {
        "x-api-token": "ops-viewer-token"
      }
    });
    expect(auditResponse.statusCode).toBe(403);
    expect(auditResponse.json().code).toBe("insufficient_role");

    const serversResponse = await app.inject({
      method: "GET",
      url: "/servers",
      headers: {
        "x-api-token": "ops-viewer-token"
      }
    });
    expect(serversResponse.statusCode).toBe(200);
    expect(Array.isArray(serversResponse.json().servers)).toBe(true);
  });

  it("rotates a user token", async () => {
    const usersResponse = await app.inject({
      method: "GET",
      url: "/users",
      headers: {
        "x-api-token": "test-owner-token"
      }
    });
    const userId = usersResponse.json().users.find((u: { username: string }) => u.username === "ops-admin").id as string;

    const rotateResponse = await app.inject({
      method: "POST",
      url: `/users/${userId}/rotate-token`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        newToken: "rotated-token-12345"
      }
    });

    expect(rotateResponse.statusCode).toBe(200);
    expect(rotateResponse.json().user.apiToken).toBe("rotated-token-12345");
  });

  it("returns package list for server", async () => {
    const serverRoot = path.join(testDataDir, "servers", "integration-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    const server = store.createServer({
      name: "integration-server",
      type: "fabric",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25599,
      bedrockPort: null,
      minMemoryMb: 512,
      maxMemoryMb: 1024
    });

    const response = await app.inject({
      method: "GET",
      url: `/servers/${server.id}/packages`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().packages).toEqual([]);
  });

  it("indexes and edits server files through editor endpoints", async () => {
    const serverRoot = path.join(testDataDir, "servers", "editor-server");
    fs.mkdirSync(path.join(serverRoot, "config"), { recursive: true });
    fs.writeFileSync(path.join(serverRoot, "server.properties"), "motd=Before\\n", "utf8");
    fs.writeFileSync(path.join(serverRoot, "config", "paper-global.yml"), "timings:\\n  enabled: false\\n", "utf8");

    const server = store.createServer({
      name: "editor-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25601,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const listResponse = await app.inject({
      method: "GET",
      url: `/servers/${server.id}/editor/files`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().files.some((entry: { path: string }) => entry.path === "server.properties")).toBe(true);
    expect(listResponse.json().files.some((entry: { path: string }) => entry.path === "config/paper-global.yml")).toBe(true);

    const readResponse = await app.inject({
      method: "GET",
      url: `/servers/${server.id}/editor/file?path=server.properties`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json().content).toContain("motd=Before");

    const writeResponse = await app.inject({
      method: "PUT",
      url: `/servers/${server.id}/editor/file`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        path: "config/paper-global.yml",
        content: "timings:\\n  enabled: true\\n"
      }
    });

    expect(writeResponse.statusCode).toBe(200);
    expect(fs.readFileSync(path.join(serverRoot, "config", "paper-global.yml"), "utf8")).toContain("enabled: true");
  });

  it("returns editor diff preview lines", async () => {
    const serverRoot = path.join(testDataDir, "servers", "editor-diff-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    fs.writeFileSync(path.join(serverRoot, "server.properties"), "motd=Before\nmax-players=10\n", "utf8");

    const server = store.createServer({
      name: "editor-diff-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25603,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const response = await app.inject({
      method: "POST",
      url: `/servers/${server.id}/editor/file/diff`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        path: "server.properties",
        nextContent: "motd=After\nmax-players=20\n"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().diff).toContain("- motd=Before");
    expect(response.json().diff).toContain("+ motd=After");
    expect(response.json().diff).toContain("- max-players=10");
    expect(response.json().diff).toContain("+ max-players=20");
  });

  it("stores editor snapshots and can rollback the latest snapshot", async () => {
    const serverRoot = path.join(testDataDir, "servers", "editor-snapshot-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    fs.writeFileSync(path.join(serverRoot, "server.properties"), "motd=SnapshotBefore\n", "utf8");

    const server = store.createServer({
      name: "editor-snapshot-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25607,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const updateResponse = await app.inject({
      method: "PUT",
      url: `/servers/${server.id}/editor/file`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        path: "server.properties",
        content: "motd=SnapshotAfter\n"
      }
    });
    expect(updateResponse.statusCode).toBe(200);

    const snapshotsResponse = await app.inject({
      method: "GET",
      url: `/servers/${server.id}/editor/file/snapshots?path=server.properties&limit=5`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });
    expect(snapshotsResponse.statusCode).toBe(200);
    expect(snapshotsResponse.json().snapshots.length).toBeGreaterThan(0);

    const snapshotId = snapshotsResponse.json().snapshots[0].id as string;
    const rollbackResponse = await app.inject({
      method: "POST",
      url: `/servers/${server.id}/editor/file/rollback`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        path: "server.properties",
        snapshotId
      }
    });
    expect(rollbackResponse.statusCode).toBe(200);
    expect(fs.readFileSync(path.join(serverRoot, "server.properties"), "utf8")).toContain("SnapshotBefore");
  });

  it("returns default backup policy and updates it", async () => {
    const policyGet = await app.inject({
      method: "GET",
      url: "/servers/srv_content/backup-policy",
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(policyGet.statusCode).toBe(404);

    const serverRoot = path.join(testDataDir, "servers", "policy-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    const policyServer = store.createServer({
      name: "policy-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25590,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const update = await app.inject({
      method: "PUT",
      url: `/servers/${policyServer.id}/backup-policy`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        maxBackups: 15,
        maxAgeDays: 20,
        pruneCron: "0 */8 * * *",
        enabled: true
      }
    });

    expect(update.statusCode).toBe(200);
    expect(update.json().policy.maxBackups).toBe(15);
  });

  it("blocks backup restore while server is running", async () => {
    const serverRoot = path.join(testDataDir, "servers", "restore-running-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    const restoreServer = store.createServer({
      name: "restore-running-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25591,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });
    store.updateServerState(restoreServer.id, "running", 9999);

    const response = await app.inject({
      method: "POST",
      url: `/servers/${restoreServer.id}/backups/missing/restore`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain("must be stopped");
  });

  it("repairs missing core startup files through preflight repair endpoint", async () => {
    const serverRoot = path.join(testDataDir, "servers", "repair-core-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    fs.writeFileSync(path.join(serverRoot, "server.jar"), "placeholder", "utf8");
    const repairServer = store.createServer({
      name: "repair-core-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25605,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const response = await app.inject({
      method: "POST",
      url: `/servers/${repairServer.id}/preflight/repair-core`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {}
    });

    expect(response.statusCode).toBe(200);
    expect(fs.existsSync(path.join(serverRoot, "eula.txt"))).toBe(true);
    expect(fs.existsSync(path.join(serverRoot, "server.jar"))).toBe(true);
    expect(response.json().preflight.serverId).toBe(repairServer.id);
  });

  it("restores backups and creates a pre-restore safety snapshot", async () => {
    const serverRoot = path.join(testDataDir, "servers", "restore-safety-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    fs.writeFileSync(path.join(serverRoot, "server.properties"), "motd=before-backup\\n", "utf8");

    const restoreServer = store.createServer({
      name: "restore-safety-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25604,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const backupResponse = await app.inject({
      method: "POST",
      url: `/servers/${restoreServer.id}/backups`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });
    expect(backupResponse.statusCode).toBe(200);
    const originalBackupId = backupResponse.json().backup.backupId as string;

    fs.writeFileSync(path.join(serverRoot, "server.properties"), "motd=after-change\\n", "utf8");

    const restoreResponse = await app.inject({
      method: "POST",
      url: `/servers/${restoreServer.id}/backups/${originalBackupId}/restore`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(restoreResponse.statusCode).toBe(200);
    const preRestoreBackupId = restoreResponse.json().restore.preRestoreBackupId as string;
    expect(preRestoreBackupId).toBeTruthy();
    expect(preRestoreBackupId).not.toBe(originalBackupId);

    const restoredContent = fs.readFileSync(path.join(serverRoot, "server.properties"), "utf8");
    expect(restoredContent).toContain("motd=before-backup");

    const backupsResponse = await app.inject({
      method: "GET",
      url: `/servers/${restoreServer.id}/backups`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });
    expect(backupsResponse.statusCode).toBe(200);
    const backups = backupsResponse.json().backups as Array<{ id: string; restoredAt: string | null }>;
    expect(backups.some((entry) => entry.id === originalBackupId && entry.restoredAt !== null)).toBe(true);
    expect(backups.some((entry) => entry.id === preRestoreBackupId)).toBe(true);
  });

  it("enables quick public hosting and returns status", async () => {
    const serverRoot = path.join(testDataDir, "servers", "quick-host-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    const quickHostServer = store.createServer({
      name: "quick-host-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25592,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const enable = await app.inject({
      method: "POST",
      url: `/servers/${quickHostServer.id}/public-hosting/quick-enable`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {}
    });
    expect(enable.statusCode).toBe(200);
    expect(enable.json().tunnel.provider).toBe("playit");

    const status = await app.inject({
      method: "GET",
      url: `/servers/${quickHostServer.id}/public-hosting/status`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });
    expect(status.statusCode).toBe(200);
    expect(status.json().server.id).toBe(quickHostServer.id);
    expect(status.json().server.localAddress).toBe("127.0.0.1:25592");
    expect(status.json().publicAddress).toBeNull();
    expect(status.json().steps[0]).toContain("assigning a public endpoint");
  });

  it("returns beginner simple status payload", async () => {
    const serverRoot = path.join(testDataDir, "servers", "simple-status-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    fs.writeFileSync(path.join(serverRoot, "server.jar"), "placeholder", "utf8");
    fs.writeFileSync(path.join(serverRoot, "eula.txt"), "eula=true\n", "utf8");

    const server = store.createServer({
      name: "simple-status-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25614,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const response = await app.inject({
      method: "GET",
      url: `/servers/${server.id}/simple-status`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().server).toMatchObject({
      id: server.id,
      name: "simple-status-server",
      inviteAddress: null
    });
    expect(response.json().checklist).toMatchObject({
      created: true,
      running: false,
      publicReady: false
    });
    expect(response.json().primaryAction).toMatchObject({
      id: "start_server",
      label: "Start Server",
      available: true
    });
  });

  it("blocks safe restart when preflight has critical issues", async () => {
    const serverRoot = path.join(testDataDir, "servers", "safe-restart-blocked-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    const blockedServer = store.createServer({
      name: "safe-restart-blocked-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25608,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const response = await app.inject({
      method: "POST",
      url: `/servers/${blockedServer.id}/safe-restart`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {}
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().blocked).toBe(true);
    expect(response.json().preflight.issues.some((issue: { severity: string }) => issue.severity === "critical")).toBe(true);
  });

  it("blocks go-live when critical preflight issues are present", async () => {
    const serverRoot = path.join(testDataDir, "servers", "go-live-blocked-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    const blockedServer = store.createServer({
      name: "go-live-blocked-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25609,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const response = await app.inject({
      method: "POST",
      url: `/servers/${blockedServer.id}/go-live`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {}
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().blocked).toBe(true);
    expect(response.json().warning).toContain("blocked");
  });

  it("supports multi-server bulk actions", async () => {
    const rootA = path.join(testDataDir, "servers", "bulk-a");
    const rootB = path.join(testDataDir, "servers", "bulk-b");
    fs.mkdirSync(rootA, { recursive: true });
    fs.mkdirSync(rootB, { recursive: true });
    fs.writeFileSync(path.join(rootA, "server.jar"), "placeholder", "utf8");
    fs.writeFileSync(path.join(rootA, "eula.txt"), "eula=true\n", "utf8");
    fs.writeFileSync(path.join(rootA, "server.properties"), "motd=bulk-a\n", "utf8");
    fs.writeFileSync(path.join(rootB, "server.jar"), "placeholder", "utf8");
    fs.writeFileSync(path.join(rootB, "eula.txt"), "eula=true\n", "utf8");
    fs.writeFileSync(path.join(rootB, "server.properties"), "motd=bulk-b\n", "utf8");

    const serverA = store.createServer({
      name: "bulk-a",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(rootA, "server.jar"),
      rootPath: rootA,
      javaPath: "java",
      port: 25610,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });
    const serverB = store.createServer({
      name: "bulk-b",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(rootB, "server.jar"),
      rootPath: rootB,
      javaPath: "java",
      port: 25611,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const response = await app.inject({
      method: "POST",
      url: "/servers/bulk-action",
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        action: "backup",
        serverIds: [serverA.id, serverB.id]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().action).toBe("backup");
    expect(response.json().succeeded).toBe(2);
    expect(response.json().failed).toBe(0);
  });

  it("returns a per-server performance advisor summary", async () => {
    const serverRoot = path.join(testDataDir, "servers", "advisor-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    const advisorServer = store.createServer({
      name: "advisor-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25612,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const now = Date.now();
    for (let idx = 0; idx < 6; idx += 1) {
      store.createServerPerformanceSample({
        serverId: advisorServer.id,
        cpuPercent: 40 + idx * 7,
        memoryMb: 1100 + idx * 120,
        sampledAt: new Date(now - idx * 5 * 60 * 1000).toISOString()
      });
    }
    store.createServerStartupEvent({
      serverId: advisorServer.id,
      durationMs: 32000,
      success: true,
      exitCode: null,
      detail: "ok"
    });
    store.createServerStartupEvent({
      serverId: advisorServer.id,
      durationMs: 42000,
      success: true,
      exitCode: null,
      detail: "ok"
    });
    store.createServerTickLagEvent({
      serverId: advisorServer.id,
      lagMs: 1800,
      ticksBehind: 35,
      line: "Can't keep up! Is the server overloaded? Running 1800ms or 35 ticks behind"
    });

    const response = await app.inject({
      method: "GET",
      url: `/servers/${advisorServer.id}/performance/advisor?hours=24`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().server.id).toBe(advisorServer.id);
    expect(response.json().advisor.sampleCount).toBeGreaterThan(0);
    expect(response.json().advisor.metrics.memory.peakMb).toBeGreaterThan(1100);
    expect(response.json().advisor.tickLag.eventsInWindow).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(response.json().advisor.hints)).toBe(true);
  });

  it("returns public-hosting diagnostics and support bundle", async () => {
    const serverRoot = path.join(testDataDir, "servers", "diagnostics-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    const diagnosticsServer = store.createServer({
      name: "diagnostics-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25606,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const quickEnableResponse = await app.inject({
      method: "POST",
      url: `/servers/${diagnosticsServer.id}/public-hosting/quick-enable`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {}
    });
    expect(quickEnableResponse.statusCode).toBe(200);
    const tunnelId = quickEnableResponse.json().tunnel.id as string;

    const secretResponse = await app.inject({
      method: "POST",
      url: `/tunnels/${tunnelId}/playit/secret`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        secret: "Agent-Key abcdef1234567890"
      }
    });
    expect(secretResponse.statusCode).toBe(200);

    const diagnosticsResponse = await app.inject({
      method: "GET",
      url: `/servers/${diagnosticsServer.id}/public-hosting/diagnostics`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });
    expect(diagnosticsResponse.statusCode).toBe(200);
    expect(diagnosticsResponse.json().diagnostics.provider).toBe("playit");
    expect(
      (diagnosticsResponse.json().fixes as Array<{ id: string }>).some((fix) => fix.id === "restart_tunnel")
    ).toBe(true);
    expect(
      (diagnosticsResponse.json().fixes as Array<{ id: string }>).some((fix) => fix.id === "go_live_recovery")
    ).toBe(true);

    const bundleResponse = await app.inject({
      method: "GET",
      url: `/servers/${diagnosticsServer.id}/support-bundle`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });
    expect(bundleResponse.statusCode).toBe(200);
    expect(bundleResponse.json().server.id).toBe(diagnosticsServer.id);
    expect(bundleResponse.json().preflight.serverId).toBe(diagnosticsServer.id);
  });

  it("deletes a server and removes local files and backup archives", async () => {
    const serverRoot = path.join(testDataDir, "servers", "delete-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    fs.writeFileSync(path.join(serverRoot, "server.properties"), "motd=delete me\\n", "utf8");

    const deleteServer = store.createServer({
      name: "delete-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25602,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const backupFilePath = path.join(testDataDir, "backups", "delete-server-backup.tar.gz");
    fs.mkdirSync(path.dirname(backupFilePath), { recursive: true });
    fs.writeFileSync(backupFilePath, "backup", "utf8");
    store.createBackup({
      serverId: deleteServer.id,
      filePath: backupFilePath,
      sizeBytes: 6
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/servers/${deleteServer.id}?deleteFiles=true&deleteBackups=true`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
    expect(store.getServerById(deleteServer.id)).toBeUndefined();
    expect(fs.existsSync(serverRoot)).toBe(false);
    expect(fs.existsSync(backupFilePath)).toBe(false);
  });

  it("accepts empty JSON POST bodies for lifecycle actions", async () => {
    const serverRoot = path.join(testDataDir, "servers", "empty-json-stop-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    const server = store.createServer({
      name: "empty-json-stop-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25594,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const response = await app.inject({
      method: "POST",
      url: `/servers/${server.id}/stop`,
      headers: {
        "x-api-token": "test-owner-token",
        "content-type": "application/json"
      },
      payload: ""
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true });
  });

  it("returns conflict when starting a tunnel with missing explicit command", async () => {
    const serverRoot = path.join(testDataDir, "servers", "tunnel-start-conflict-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    const server = store.createServer({
      name: "tunnel-start-conflict-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25593,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    const createTunnel = await app.inject({
      method: "POST",
      url: "/tunnels",
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        serverId: server.id,
        provider: "ngrok",
        protocol: "tcp",
        localPort: 25593,
        publicHost: "example.invalid",
        publicPort: 25593,
        config: {
          command: "missing-tunnel-command",
          args: ["tcp", "25593"]
        }
      }
    });

    expect(createTunnel.statusCode).toBe(200);
    const tunnelId = createTunnel.json().tunnel.id as string;

    const startTunnel = await app.inject({
      method: "POST",
      url: `/tunnels/${tunnelId}/start`,
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(startTunnel.statusCode).toBe(409);
    expect(startTunnel.json().message).toContain("missing-tunnel-command");
  });

  it("supports beginner quickstart inputs for memory preset, save path, and world import", async () => {
    const worldImportDir = path.join(testDataDir, "imports", "wizard-world");
    const saveParent = path.join(testDataDir, "custom-saves");
    fs.mkdirSync(path.join(worldImportDir, "region"), { recursive: true });
    fs.writeFileSync(path.join(worldImportDir, "level.dat"), "world-data", "utf8");
    fs.writeFileSync(path.join(worldImportDir, "region", "r.0.0.mca"), "region-data", "utf8");

    const originalProvision = services.setup.provisionServer.bind(services.setup);
    services.setup.provisionServer = async (input) => {
      fs.mkdirSync(input.rootPath, { recursive: true });
      const jarPath = path.join(input.rootPath, "server.jar");
      fs.writeFileSync(jarPath, "placeholder", "utf8");
      fs.writeFileSync(path.join(input.rootPath, "eula.txt"), "eula=true\n", "utf8");
      fs.writeFileSync(path.join(input.rootPath, "server.properties"), "motd=quickstart\n", "utf8");
      return { jarPath };
    };

    try {
      const response = await app.inject({
        method: "POST",
        url: "/servers/quickstart",
        headers: {
          "x-api-token": "test-owner-token"
        },
        payload: {
          name: "Wizard Server",
          type: "paper",
          preset: "survival",
          memoryPreset: "large",
          savePath: saveParent,
          worldImportPath: worldImportDir,
          startServer: false,
          publicHosting: false
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().requested).toMatchObject({
        memoryPreset: "large",
        savePath: saveParent,
        worldImportPath: worldImportDir
      });

      const serverId = response.json().server.id as string;
      const createdServer = store.getServerById(serverId);
      expect(createdServer).toBeDefined();
      expect(createdServer?.rootPath.startsWith(path.resolve(saveParent))).toBe(true);
      expect(fs.existsSync(path.join(createdServer!.rootPath, "world", "level.dat"))).toBe(true);
      expect(fs.existsSync(path.join(createdServer!.rootPath, "world", "region", "r.0.0.mca"))).toBe(true);
      expect(createdServer!.maxMemoryMb).toBeGreaterThanOrEqual(4096);
    } finally {
      services.setup.provisionServer = originalProvision;
    }
  });

  it("returns deterministic simple-fix outcome payload", async () => {
    const serverRoot = path.join(testDataDir, "servers", "simple-fix-server");
    fs.mkdirSync(serverRoot, { recursive: true });
    fs.writeFileSync(path.join(serverRoot, "server.jar"), "placeholder", "utf8");
    fs.writeFileSync(path.join(serverRoot, "eula.txt"), "eula=true\n", "utf8");
    fs.writeFileSync(path.join(serverRoot, "server.properties"), "motd=current\n", "utf8");

    const server = store.createServer({
      name: "simple-fix-server",
      type: "paper",
      mcVersion: "1.21.11",
      jarPath: path.join(serverRoot, "server.jar"),
      rootPath: serverRoot,
      javaPath: "java",
      port: 25615,
      bedrockPort: null,
      minMemoryMb: 1024,
      maxMemoryMb: 2048
    });

    store.createEditorFileSnapshot({
      serverId: server.id,
      path: "server.properties",
      content: "motd=restored\n",
      reason: "manual_test"
    });

    const response = await app.inject({
      method: "POST",
      url: `/servers/${server.id}/simple-fix`,
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {}
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: expect.stringMatching(/^(fixed|blocked|needs_manual)$/),
      code: expect.any(String),
      message: expect.any(String),
      summary: expect.any(String),
      completed: expect.any(Array),
      warnings: expect.any(Array)
    });
  });

  it("validates quickstart payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/servers/quickstart",
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        name: "x"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBeDefined();
    expect(response.json().message).toBeDefined();
    expect(response.json().error).toBeDefined();
  });

  it("validates content search against server existence", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/content/search?provider=modrinth&q=sodium&serverId=missing",
      headers: {
        "x-api-token": "test-owner-token"
      }
    });

    expect(response.statusCode).toBe(404);
  });

  it("blocks non-local requests when remote mode is disabled", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
      remoteAddress: "203.0.113.10"
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toContain("Remote mode is disabled");
  });

  it("requires remote token and allowed origin for non-local access when remote mode is enabled", async () => {
    const enableRemote = await app.inject({
      method: "PUT",
      url: "/remote/config",
      headers: {
        "x-api-token": "test-owner-token"
      },
      payload: {
        enabled: true,
        requireToken: true,
        allowedOrigins: ["https://panel.example.com"]
      }
    });

    expect(enableRemote.statusCode).toBe(200);

    const missingRemoteToken = await app.inject({
      method: "GET",
      url: "/me",
      remoteAddress: "198.51.100.44",
      headers: {
        origin: "https://panel.example.com",
        "x-api-token": "test-owner-token"
      }
    });

    expect(missingRemoteToken.statusCode).toBe(403);
    expect(missingRemoteToken.json().error).toContain("invalid_remote_token");

    const missingOrigin = await app.inject({
      method: "GET",
      url: "/me",
      remoteAddress: "198.51.100.44",
      headers: {
        "x-api-token": "test-owner-token",
        "x-remote-token": "test-remote-token"
      }
    });

    expect(missingOrigin.statusCode).toBe(403);
    expect(missingOrigin.json().error).toContain("origin_required");

    const disallowedOrigin = await app.inject({
      method: "GET",
      url: "/me",
      remoteAddress: "198.51.100.44",
      headers: {
        origin: "https://evil.example.com",
        "x-api-token": "test-owner-token",
        "x-remote-token": "test-remote-token"
      }
    });

    expect(disallowedOrigin.statusCode).toBe(403);
    expect(disallowedOrigin.json().error).toContain("origin_not_allowed");

    const allowedRequest = await app.inject({
      method: "GET",
      url: "/me",
      remoteAddress: "198.51.100.44",
      headers: {
        origin: "https://panel.example.com",
        "x-api-token": "test-owner-token",
        "x-remote-token": "test-remote-token"
      }
    });

    expect(allowedRequest.statusCode).toBe(200);
    expect(allowedRequest.json().user.username).toBe("owner");
  });
});
