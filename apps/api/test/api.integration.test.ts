import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "simpleservers-api-test-"));
process.env.SIMPLESERVERS_DATA_DIR = testDataDir;
process.env.SIMPLESERVERS_ADMIN_TOKEN = "test-owner-token";
process.env.SIMPLESERVERS_REMOTE_TOKEN = "test-remote-token";
process.env.LOG_LEVEL = "error";

let app: FastifyInstance;
let store: typeof import("../src/repositories/store.js").store;

beforeAll(async () => {
  const [{ createApiApp }, storeModule] = await Promise.all([import("../src/app.js"), import("../src/repositories/store.js")]);
  store = storeModule.store;

  const created = await createApiApp({
    startBackgroundWorkers: false
  });

  app = created.app;
});

afterAll(async () => {
  await app.close();
  fs.rmSync(testDataDir, { recursive: true, force: true });
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

  it("rejects protected endpoints without token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/servers"
    });

    expect(response.statusCode).toBe(401);
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
    expect(status.json().publicAddress).toContain("pending.playit.gg");
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
