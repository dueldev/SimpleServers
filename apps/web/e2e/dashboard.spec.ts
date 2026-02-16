import { test, expect } from "@playwright/test";

test("connects and renders dashboard sections", async ({ page }) => {
  let installCalled = false;
  let quickStartCalled = false;
  let stopCalled = false;
  let stopUsedEmptyJsonHeader = false;
  let telemetryPosted = false;
  let bulkCalled = false;

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
            status: "running",
            createdAt: new Date().toISOString()
          }
        ]
      });
      return;
    }

    if (pathname === "/servers/quickstart" && method === "POST") {
      quickStartCalled = true;
      await withJson(200, {
        server: {
          id: "srv_1",
          name: "Test Server",
          type: "paper",
          mcVersion: "1.21.11",
          port: 25565,
          bedrockPort: null,
          minMemoryMb: 2048,
          maxMemoryMb: 4096,
          status: "running",
          createdAt: new Date().toISOString()
        },
        started: true,
        blocked: false,
        warning: null,
        quickHosting: {
          enabled: true,
          publicAddress: "pending.playit.gg:25565",
          warning: null
        }
      });
      return;
    }

    if (pathname === "/servers/srv_1/stop" && method === "POST") {
      stopCalled = true;
      const contentType = request.headers()["content-type"] ?? "";
      const body = request.postData();
      if (contentType.includes("application/json") && !body) {
        stopUsedEmptyJsonHeader = true;
        await withJson(400, {
          statusCode: 400,
          code: "FST_ERR_CTP_EMPTY_JSON_BODY",
          error: "Bad Request",
          message: "Body cannot be empty when content-type is set to 'application/json'"
        });
        return;
      }
      await withJson(200, { ok: true });
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
        servers: { total: 1, running: 1, crashed: 0 },
        alerts: { open: 0, total: 0 }
      });
      return;
    }

    if (pathname === "/system/hardware" && method === "GET") {
      await withJson(200, {
        platform: "darwin",
        arch: "arm64",
        cpuCores: 8,
        totalMemoryMb: 16384,
        freeMemoryMb: 8192,
        recommendations: {
          quickStartMinMemoryMb: 2048,
          quickStartMaxMemoryMb: 4096
        }
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

    if (pathname === "/setup/presets" && method === "GET") {
      await withJson(200, {
        presets: [
          { id: "custom", label: "Custom", description: "Manual control over all settings" },
          { id: "survival", label: "Survival Starter", description: "Paper defaults with crossplay toggles and moderate memory" },
          { id: "modded", label: "Modded Fabric", description: "Fabric-focused settings with higher memory baseline" },
          { id: "minigame", label: "Minigame Performance", description: "Paper settings tuned for plugin-heavy minigame servers" }
        ]
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

    if (pathname === "/servers/srv_1/performance/advisor" && method === "GET") {
      await withJson(200, {
        server: {
          id: "srv_1",
          name: "Test Server",
          status: "running",
          maxMemoryMb: 4096
        },
        advisor: {
          windowHours: 24,
          sampleCount: 6,
          metrics: {
            latest: {
              sampledAt: new Date().toISOString(),
              cpuPercent: 44,
              memoryMb: 1800
            },
            cpu: {
              avgPercent: 38,
              peakPercent: 82
            },
            memory: {
              avgMb: 1500,
              peakMb: 2100,
              configuredMaxMb: 4096
            }
          },
          startup: {
            trend: "stable",
            recent: [],
            averageDurationMs: 18000,
            latestDurationMs: 17500
          },
          tickLag: {
            eventsInWindow: 1,
            lastEventAt: new Date().toISOString(),
            maxLagMs: 900,
            recent: []
          },
          hints: [
            {
              level: "ok",
              title: "Memory headroom is healthy",
              detail: "Average memory usage is healthy."
            }
          ]
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

    if (pathname === "/servers/srv_1/public-hosting/diagnostics" && method === "GET") {
      await withJson(200, {
        diagnostics: {
          tunnelId: "tnl_1",
          provider: "playit",
          status: "pending",
          command: "playit",
          commandAvailable: true,
          authConfigured: true,
          endpointAssigned: false,
          endpoint: null,
          retry: {
            nextAttemptAt: new Date(Date.now() + 5000).toISOString(),
            nextAttemptInSeconds: 5,
            lastAttemptAt: new Date().toISOString(),
            lastSuccessAt: null
          },
          message: "waiting for endpoint"
        },
        actions: ["Keep the app running while playit assigns a public endpoint."],
        fixes: [
          {
            id: "set_playit_secret",
            label: "Set Playit Secret",
            description: "Paste Playit secret."
          },
          {
            id: "refresh_diagnostics",
            label: "Retry Endpoint Check",
            description: "Run diagnostics again."
          }
        ]
      });
      return;
    }

    if (pathname === "/servers/srv_1/go-live" && method === "POST") {
      await withJson(200, {
        ok: true,
        blocked: false,
        warning: "Playit is still assigning a public endpoint.",
        publicHosting: {
          quickHostReady: false,
          publicAddress: null,
          tunnel: {
            id: "tnl_1",
            serverId: "srv_1",
            provider: "playit",
            protocol: "tcp",
            localPort: 25565,
            publicHost: "pending.playit.gg",
            publicPort: 25565,
            status: "pending"
          },
          steps: ["Playit is still assigning a public endpoint."]
        }
      });
      return;
    }

    if (pathname === "/servers/srv_1/safe-restart" && method === "POST") {
      await withJson(200, { ok: true, blocked: false });
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

    if (pathname === "/servers/srv_1/editor/files" && method === "GET") {
      await withJson(200, {
        files: [
          {
            path: "server.properties",
            sizeBytes: 22,
            updatedAt: new Date().toISOString(),
            exists: true
          }
        ]
      });
      return;
    }

    if (pathname === "/servers/srv_1/editor/file" && method === "GET") {
      await withJson(200, { path: "server.properties", content: "motd=SimpleServers" });
      return;
    }

    if (pathname === "/servers/srv_1/editor/file/snapshots" && method === "GET") {
      await withJson(200, {
        path: "server.properties",
        snapshots: [
          {
            id: "snap_1",
            path: "server.properties",
            reason: "before_save",
            createdAt: new Date().toISOString()
          }
        ]
      });
      return;
    }

    if (pathname === "/servers/srv_1/editor/file" && method === "PUT") {
      await withJson(200, { ok: true, path: "server.properties" });
      return;
    }

    if (pathname === "/servers/srv_1/editor/file/rollback" && method === "POST") {
      await withJson(200, { ok: true, path: "server.properties", restoredSnapshotId: "snap_1" });
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

    if (pathname === "/system/trust" && method === "GET") {
      await withJson(200, {
        generatedAt: new Date().toISOString(),
        build: {
          appVersion: "0.5.0",
          platform: "darwin",
          arch: "arm64",
          nodeVersion: "v20.0.0",
          mode: "development",
          signatureStatus: "development",
          signatureProvider: null,
          releaseChannel: "stable",
          repository: "https://github.com/dueldev/SimpleServers"
        },
        verification: {
          checksumUrl: null,
          attestationUrl: null
        },
        security: {
          localOnlyByDefault: true,
          authModel: "token-rbac",
          auditTrailEnabled: true,
          remoteControlEnabled: false,
          remoteTokenRequired: true,
          configuredRemoteToken: false,
          allowedOrigins: []
        }
      });
      return;
    }

    if (pathname === "/telemetry/funnel" && method === "GET") {
      await withJson(200, {
        windowHours: 168,
        sessionsObserved: 1,
        stageTotals: {
          connect: 1,
          create: 1,
          start: 1,
          publicReady: 0
        },
        conversion: {
          createFromConnectPct: 100,
          startFromCreatePct: 100,
          publicReadyFromStartPct: 0
        }
      });
      return;
    }

    if (pathname === "/telemetry/events" && method === "POST") {
      telemetryPosted = true;
      await withJson(200, { eventId: "uxevt_1" });
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

    if (pathname === "/servers/bulk-action" && method === "POST") {
      bulkCalled = true;
      await withJson(200, {
        ok: true,
        action: "backup",
        total: 1,
        succeeded: 1,
        failed: 0,
        results: [
          {
            serverId: "srv_1",
            ok: true,
            message: "Backup created"
          }
        ]
      });
      return;
    }

    await withJson(404, { error: `Unhandled ${method} ${pathname}` });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Connect" }).click();

  await expect(page.getByRole("heading", { name: "Server Fleet" })).toBeVisible();
  await page.getByRole("button", { name: "Set Playit Secret" }).first().click();
  await expect(page.getByLabel("Playit Secret").first()).toBeVisible();
  await page.getByLabel("Layout density").selectOption("full");
  await expect(page.getByRole("heading", { name: "Onboarding Funnel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Test Server" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Select Test Server" }).check();
  await page.getByRole("button", { name: "Backup Selected" }).click();
  await expect.poll(() => bulkCalled).toBe(true);
  await page.getByRole("button", { name: "Stop" }).first().click();
  await expect.poll(() => stopCalled).toBe(true);
  await expect.poll(() => stopUsedEmptyJsonHeader).toBe(false);

  await page.getByRole("button", { name: /^Setup$/ }).click();
  await expect(page.getByRole("heading", { name: "Guided Server Setup" })).toBeVisible();
  await page.getByRole("button", { name: /Modded Fabric/i }).first().click();
  await expect(page.getByLabel("Type")).toHaveValue("fabric");

  await page.getByRole("button", { name: "Instant Launch (Recommended)" }).click();
  await expect.poll(() => quickStartCalled).toBe(true);

  await page.getByRole("button", { name: "Content" }).click();
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Sodium")).toBeVisible();

  await page.getByRole("button", { name: "Quick Actions" }).click();
  await expect(page.getByRole("heading", { name: "Quick Actions" })).toBeVisible();
  await page.getByRole("button", { name: /Open Trust Workspace/i }).click();
  await expect(page.getByRole("heading", { name: "Security Transparency" })).toBeVisible();

  await page.getByRole("button", { name: /^Trust$/ }).click();
  await expect(page.getByRole("heading", { name: "Security Transparency" })).toBeVisible();
  await page.getByRole("button", { name: "Content" }).click();

  await page.getByRole("button", { name: "Install" }).click();
  await expect.poll(() => installCalled).toBe(true);
  await expect.poll(() => telemetryPosted).toBe(true);
});
