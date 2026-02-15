import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { downloadToFile, fetchJsonWithRetry } from "../src/lib/download.js";

type StartedServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

async function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse<http.IncomingMessage>) => void
): Promise<StartedServer> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start test server");
  }

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}

describe("download helpers", () => {
  const tempRoots: string[] = [];
  const servers: StartedServer[] = [];

  afterEach(async () => {
    while (servers.length > 0) {
      const server = servers.pop();
      if (server) {
        await server.close();
      }
    }

    while (tempRoots.length > 0) {
      const tempRoot = tempRoots.pop();
      if (tempRoot) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  });

  it("retries JSON fetch on transient failures", async () => {
    let attempts = 0;
    const server = await startServer((_req, res) => {
      attempts += 1;
      if (attempts < 3) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: "temporarily unavailable" }));
        return;
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
    servers.push(server);

    const payload = await fetchJsonWithRetry<{ ok: boolean }>(`${server.baseUrl}/json`, {
      attempts: 4,
      initialDelayMs: 10
    });
    expect(payload.ok).toBe(true);
    expect(attempts).toBe(3);
  });

  it("retries downloads and writes destination atomically", async () => {
    let attempts = 0;
    const server = await startServer((_req, res) => {
      attempts += 1;
      if (attempts < 2) {
        res.statusCode = 500;
        res.end("internal error");
        return;
      }
      res.statusCode = 200;
      res.end("artifact-bytes");
    });
    servers.push(server);

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "simpleservers-download-test-"));
    tempRoots.push(tempRoot);
    const destination = path.join(tempRoot, "artifact.bin");
    fs.writeFileSync(destination, "old-content", "utf8");

    await downloadToFile(`${server.baseUrl}/artifact`, destination, {
      attempts: 3,
      initialDelayMs: 10
    });

    expect(attempts).toBe(2);
    expect(fs.readFileSync(destination, "utf8")).toBe("artifact-bytes");
    expect(fs.existsSync(`${destination}.tmp`)).toBe(false);
  });

  it("does not retry non-retryable status codes", async () => {
    let attempts = 0;
    const server = await startServer((_req, res) => {
      attempts += 1;
      res.statusCode = 404;
      res.end("missing");
    });
    servers.push(server);

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "simpleservers-download-test-"));
    tempRoots.push(tempRoot);
    const destination = path.join(tempRoot, "artifact.bin");

    await expect(
      downloadToFile(`${server.baseUrl}/artifact`, destination, {
        attempts: 4,
        initialDelayMs: 10
      })
    ).rejects.toThrowError(/status=404/);

    expect(attempts).toBe(1);
    expect(fs.existsSync(`${destination}.tmp`)).toBe(false);
    expect(fs.existsSync(destination)).toBe(false);
  });
});
