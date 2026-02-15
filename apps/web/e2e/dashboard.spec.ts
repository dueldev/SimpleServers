import { test, expect } from "@playwright/test";

test("connects and renders dashboard sections", async ({ page }) => {
  let installCalled = false;

  await page.route("http://127.0.0.1:4010/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;

    const withJson = async (status: number, body: unknown) => {
      await route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"
        },
        body: JSON.stringify(body)
      });
    };

    if (method === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"
        }
      });
      return;
    }

    if (pathname === "/me" && method === "GET") {
      await withJson(200, { user: { username: "owner", role: "owner" } });
      return;
    }

    if (pathname === "/servers" && method === "GET") {
      await withJson(200, {
        servers: [
          {
            id: "srv_1",
            name: "Test Server",
            type: "paper",
            mcVersion: "1.21.11",
            port: 25565,
            bedrockPort: null,
            minMemoryMb: 1024,
            maxMemoryMb: 4096,
            status: "stopped",
            createdAt: new Date().toISOString()
          }
        ]
      });
      return;
    }

    if (pathname === "/alerts" && method === "GET") {
      await withJson(200, { alerts: [] });
      return;
    }

    if (pathname === "/tasks" && method === "GET") {
      await withJson(200, { tasks: [] });
      return;
    }

    if (pathname === "/tunnels" && method === "GET") {
      await withJson(200, { tunnels: [] });
      return;
    }

    if (pathname === "/audit" && method === "GET") {
      await withJson(200, { logs: [] });
      return;
    }

    if (pathname === "/system/status" && method === "GET") {
      await withJson(200, {
        servers: { total: 1, running: 0, crashed: 0 },
        alerts: { open: 0, total: 0 }
      });
      return;
    }

    if (pathname === "/setup/catalog" && method === "GET") {
      await withJson(200, {
        catalog: {
          vanilla: [{ id: "1.21.11", stable: true }],
          paper: [{ id: "1.21.11", stable: true }],
          fabric: [{ id: "1.21.11", stable: true }]
        },
        javaCandidates: [{ path: "java", version: 21, rawVersion: "21" }]
      });
      return;
    }

    if (pathname === "/servers/srv_1/logs" && method === "GET") {
      await withJson(200, { logs: [] });
      return;
    }

    if (pathname === "/servers/srv_1/backups" && method === "GET") {
      await withJson(200, { backups: [] });
      return;
    }

    if (pathname === "/servers/srv_1/backup-policy" && method === "GET") {
      await withJson(200, {
        policy: {
          serverId: "srv_1",
          maxBackups: 20,
          maxAgeDays: 30,
          pruneCron: "0 */6 * * *",
          enabled: 0
        }
      });
      return;
    }

    if (pathname === "/servers/srv_1/preflight" && method === "GET") {
      await withJson(200, {
        report: {
          serverId: "srv_1",
          checkedAt: new Date().toISOString(),
          passed: true,
          issues: []
        }
      });
      return;
    }

    if (pathname === "/servers/srv_1/public-hosting/status" && method === "GET") {
      await withJson(200, {
        server: {
          id: "srv_1",
          name: "Test Server",
          status: "stopped",
          localAddress: "127.0.0.1:25565"
        },
        quickHostReady: false,
        publicAddress: null,
        tunnel: null,
        steps: ["Enable quick hosting to avoid manual port forwarding."]
      });
      return;
    }

    if (pathname === "/servers/srv_1/public-hosting/quick-enable" && method === "POST") {
      await withJson(200, {
        tunnel: {
          id: "tnl_1",
          serverId: "srv_1",
          provider: "playit",
          protocol: "tcp",
          localPort: 25565,
          publicHost: "pending.playit.gg",
          publicPort: 25565,
          status: "idle"
        }
      });
      return;
    }

    if (pathname === "/servers/srv_1/crash-reports" && method === "GET") {
      await withJson(200, { reports: [] });
      return;
    }

    if (pathname === "/servers/srv_1/files/server.properties" && method === "GET") {
      await withJson(200, { fileName: "server.properties", content: "motd=SimpleServers" });
      return;
    }

    if (pathname === "/servers/srv_1/packages" && method === "GET") {
      await withJson(200, { packages: [] });
      return;
    }

    if (pathname === "/servers/srv_1/packages/updates" && method === "GET") {
      await withJson(200, { updates: [] });
      return;
    }

    if (pathname === "/users" && method === "GET") {
      await withJson(200, {
        users: [
          {
            id: "usr_owner",
            username: "owner",
            role: "owner",
            apiToken: "token",
            createdAt: new Date().toISOString()
          }
        ]
      });
      return;
    }

    if (pathname === "/remote/status" && method === "GET") {
      await withJson(200, {
        remote: {
          enabled: false,
          allowedOrigins: [],
          requireToken: true,
          configuredToken: false
        }
      });
      return;
    }

    if (pathname === "/system/java/channels" && method === "GET") {
      await withJson(200, {
        channels: [
          {
            major: 21,
            lts: true,
            recommendedFor: "Minecraft 1.20.5+ and modern server stacks",
            adoptiumApi: "https://api.adoptium.net/v3/assets/feature_releases/21/ga?image_type=jdk&jvm_impl=hotspot"
          }
        ],
        updateSignals: []
      });
      return;
    }

    if (pathname === "/content/search" && method === "GET") {
      await withJson(200, {
        results: [
          {
            provider: "modrinth",
            projectId: "AANobbMI",
            slug: "sodium",
            name: "Sodium",
            summary: "Rendering optimization mod",
            kind: "mod",
            iconUrl: null,
            downloads: 1000000,
            latestVersionId: "ver_1",
            compatible: true
          }
        ]
      });
      return;
    }

    if (pathname === "/servers/srv_1/packages/install" && method === "POST") {
      installCalled = true;
      await withJson(200, {
        install: {
          packageId: "pkg_1",
          serverId: "srv_1",
          provider: "modrinth",
          projectId: "AANobbMI",
          versionId: "ver_1",
          filePath: "/tmp/sodium.jar"
        }
      });
      return;
    }

    await withJson(404, { error: `Unhandled ${method} ${pathname}` });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Connect" }).click();

  await expect(page.getByRole("heading", { name: "Server Fleet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Test Server" })).toBeVisible();

  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Sodium")).toBeVisible();

  await page.getByRole("button", { name: "Install" }).click();
  await expect.poll(() => installCalled).toBe(true);
});
