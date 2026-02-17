import { test, expect } from "@playwright/test";

test("connects and renders dashboard sections", async ({ page }) => {
  let installCalled = false;
  let quickStartCalled = false;
  let stopCalled = false;
  let stopUsedEmptyJsonHeader = false;
  let telemetryPosted = false;
  let bulkCalled = false;
  let commandCalled = false;
  let cloudDestinationSaved = false;
  let cloudUploadCalled = false;
  let modpackPlanCalled = false;
  let modpackImportCalled = false;
  let setupSessionCreated = false;
  let setupSessionLaunched = false;
  let workspaceSummaryCalls = 0;
  let playerAdminActionCalled = false;

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

    if (pathname === "/system/capabilities" && method === "GET") {
      await withJson(200, {
        user: {
          id: "usr_owner",
          username: "owner",
          role: "owner"
        },
        capabilities: {
          serverLifecycle: true,
          serverCreate: true,
          advancedWorkspace: true,
          contentInstall: true,
          tunnelManage: true,
          userManage: true,
          remoteConfig: true,
          auditRead: true,
          trustRead: true,
          telemetryRead: true
        }
      });
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

    if (pathname === "/setup/sessions" && method === "POST") {
      setupSessionCreated = true;
      await withJson(200, {
        session: {
          id: "setup_1",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        }
      });
      return;
    }

    if (pathname === "/setup/sessions/setup_1/launch" && method === "POST") {
      setupSessionLaunched = true;
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
          publicAddress: "play.example.test:25565",
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
      await withJson(200, {
        backups: [
          {
            id: "bkp_1",
            serverId: "srv_1",
            filePath: "/tmp/bkp_1.tar.gz",
            sizeBytes: 1024 * 1024 * 12,
            createdAt: new Date().toISOString(),
            restoredAt: null
          }
        ]
      });
      return;
    }

    if (pathname === "/servers/srv_1/cloud-backup-destinations" && method === "GET") {
      await withJson(200, {
        destinations: [
          {
            id: "dst_1",
            serverId: "srv_1",
            provider: "s3",
            name: "Primary Cloud Backup",
            enabled: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            config: {
              bucket: "test-bucket",
              region: "us-east-1",
              prefix: "simpleservers",
              dryRun: true
            }
          }
        ]
      });
      return;
    }

    if (pathname === "/servers/srv_1/cloud-backup-destinations" && method === "POST") {
      cloudDestinationSaved = true;
      await withJson(200, {
        destination: {
          id: "dst_2",
          serverId: "srv_1",
          provider: "s3",
          name: "Primary Cloud Backup",
          enabled: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          config: {
            bucket: "test-bucket",
            region: "us-east-1",
            prefix: "simpleservers",
            dryRun: true
          }
        }
      });
      return;
    }

    if (pathname === "/servers/srv_1/backups/bkp_1/upload-cloud" && method === "POST") {
      cloudUploadCalled = true;
      await withJson(200, {
        upload: {
          artifactId: "cba_1"
        }
      });
      return;
    }

    if (pathname === "/servers/srv_1/cloud-backups" && method === "GET") {
      await withJson(200, {
        artifacts: []
      });
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

    if (pathname === "/servers/srv_1/simple-status" && method === "GET") {
      await withJson(200, {
        server: {
          id: "srv_1",
          name: "Test Server",
          status: "running",
          localAddress: "127.0.0.1:25565",
          inviteAddress: null
        },
        quickHosting: {
          enabled: true,
          status: "pending",
          endpointPending: true,
          diagnostics: {
            message: "waiting for endpoint",
            endpointAssigned: false,
            retry: {
              nextAttemptAt: new Date(Date.now() + 5000).toISOString(),
              nextAttemptInSeconds: 5,
              lastAttemptAt: new Date().toISOString(),
              lastSuccessAt: null
            }
          }
        },
        checklist: {
          created: true,
          running: true,
          publicReady: false
        },
        primaryAction: {
          id: "go_live",
          label: "Go Live",
          available: true
        },
        preflight: {
          passed: true,
          blocked: false,
          issues: []
        }
      });
      return;
    }

    if (pathname === "/servers/srv_1/workspace-summary" && method === "GET") {
      workspaceSummaryCalls += 1;
      const onlineList =
        workspaceSummaryCalls >= 2
          ? [
              { name: "Alice", uuid: "offline-alice" },
              { name: "Bob", uuid: "offline-bob" }
            ]
          : [{ name: "Alice", uuid: "offline-alice" }];
      const knownList = [
        { name: "Alice", uuid: "offline-alice" },
        { name: "Bob", uuid: "offline-bob" },
        { name: "CachedOnly", uuid: "offline-cachedonly" }
      ];
      await withJson(200, {
        summary: {
          server: {
            id: "srv_1",
            name: "Test Server",
            type: "paper",
            mcVersion: "1.21.11",
            status: "running",
            visibility: "private"
          },
          addresses: {
            local: "127.0.0.1:25565",
            invite: null
          },
          players: {
            online: onlineList.length,
            known: knownList.length,
            capacity: 20,
            list: knownList,
            onlineList,
            knownList
          },
          metrics: {
            windowHours: 6,
            latest: {
              sampledAt: new Date().toISOString(),
              cpuPercent: 10,
              memoryMb: 1024
            },
            cpuPeakPercent: 20,
            memoryPeakMb: 1500,
            uptimeSeconds: 120,
            openAlerts: 0,
            crashes: 0,
            startupTrend: []
          },
          tunnel: {
            enabled: false,
            provider: null,
            status: "disabled",
            publicAddress: null,
            endpointPending: false,
            steps: []
          },
          preflight: {
            passed: true,
            blocked: false,
            issues: []
          },
          primaryAction: {
            id: "go_live",
            label: "Go Live",
            available: true
          }
        }
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

    if (pathname === "/servers/srv_1/player-admin" && method === "GET") {
      const onlinePlayers =
        workspaceSummaryCalls >= 2
          ? [
              { name: "Alice", uuid: "offline-alice" },
              { name: "Bob", uuid: "offline-bob" }
            ]
          : [{ name: "Alice", uuid: "offline-alice" }];
      await withJson(200, {
        state: {
          ops: [],
          whitelist: [],
          bannedPlayers: [],
          bannedIps: [],
          knownPlayers: [
            { name: "Alice", uuid: "offline-alice" },
            { name: "Bob", uuid: "offline-bob" },
            { name: "CachedOnly", uuid: "offline-cachedonly" }
          ],
          onlinePlayers,
          capacity: 20,
          profiles: [
            {
              name: "Alice",
              uuid: "offline-alice",
              isOp: false,
              isWhitelisted: false,
              isBanned: false,
              lastSeenAt: new Date().toISOString(),
              lastActionAt: null
            },
            {
              name: "Bob",
              uuid: "offline-bob",
              isOp: false,
              isWhitelisted: false,
              isBanned: false,
              lastSeenAt: new Date().toISOString(),
              lastActionAt: null
            }
          ],
          history: []
        }
      });
      return;
    }

    if (pathname === "/servers/srv_1/player-admin/action" && method === "POST") {
      playerAdminActionCalled = true;
      await withJson(200, {
        state: {
          ops: [],
          whitelist: [],
          bannedPlayers: [],
          bannedIps: [],
          knownPlayers: [
            { name: "Alice", uuid: "offline-alice" },
            { name: "Bob", uuid: "offline-bob" }
          ],
          onlinePlayers: [{ name: "Alice", uuid: "offline-alice" }],
          capacity: 20,
          profiles: [
            {
              name: "Alice",
              uuid: "offline-alice",
              isOp: true,
              isWhitelisted: false,
              isBanned: false,
              lastSeenAt: new Date().toISOString(),
              lastActionAt: new Date().toISOString()
            },
            {
              name: "Bob",
              uuid: "offline-bob",
              isOp: false,
              isWhitelisted: false,
              isBanned: false,
              lastSeenAt: new Date().toISOString(),
              lastActionAt: null
            }
          ],
          history: [
            {
              ts: new Date().toISOString(),
              kind: "op",
              subject: "Alice",
              detail: "Promoted to operator",
              source: "admin"
            }
          ]
        }
      });
      return;
    }

    if (pathname === "/servers/srv_1/command" && method === "POST") {
      commandCalled = true;
      await withJson(200, { ok: true });
      return;
    }

    if (pathname === "/servers/srv_1/modpack/rollbacks" && method === "GET") {
      await withJson(200, { rollbacks: [] });
      return;
    }

    if (pathname === "/servers/srv_1/modpack/plan" && method === "POST") {
      modpackPlanCalled = true;
      await withJson(200, {
        provider: "modrinth",
        projectId: "modpack-demo",
        requestedVersionId: null,
        conflicts: [],
        rollbackPlan: {
          strategy: "create_backup_before_apply",
          automaticBackup: true,
          rollbackEndpoint: "/servers/srv_1/modpack/rollback"
        },
        safeToApply: true
      });
      return;
    }

    if (pathname === "/servers/srv_1/modpack/import" && method === "POST") {
      modpackImportCalled = true;
      await withJson(200, {
        install: {
          packageId: "pkg_modpack_1"
        },
        rollback: {
          id: "mrb_1",
          serverId: "srv_1",
          packageId: "pkg_modpack_1",
          backupId: "bkp_1",
          reason: "modpack_import",
          createdAt: new Date().toISOString()
        }
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

    if (pathname === "/servers/srv_1/simple-fix" && method === "POST") {
      await withJson(200, {
        ok: true,
        status: "fixed",
        code: "fixed",
        message: "Server restarted and recovery actions completed.",
        summary: "Automatic fix completed successfully.",
        completed: ["restarted server safely"],
        warnings: []
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
          appVersion: "0.5.7",
          platform: "darwin",
          arch: "arm64",
          nodeVersion: "v20.0.0",
          mode: "development",
          signatureStatus: "development",
          signatureProvider: null,
          releaseChannel: "stable",
          repository: "https://github.com/dueldev/SimpleServers",
          signedRelease: false,
          signingMethod: null
        },
        verification: {
          checksumUrl: null,
          attestationUrl: null,
          sbomUrl: null,
          checksumVerificationEnabled: false
        },
        attestations: {
          predicateType: "https://slsa.dev/provenance/v1",
          issuer: null
        },
        exports: {
          auditExportFormats: ["json", "csv"],
          auditExportEndpoint: "/audit/export"
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

    if (pathname === "/system/reliability" && method === "GET") {
      await withJson(200, {
        generatedAt: new Date().toISOString(),
        windowHours: 168,
        scope: {
          serverId: null,
          servers: 1
        },
        startup: {
          total: 10,
          success: 9,
          failed: 1,
          successRatePct: 90
        },
        crashes: {
          total: 1,
          crashRatePer100Starts: 10
        },
        recovery: {
          measuredEvents: 1,
          meanRecoveryTimeMs: 120000,
          meanRecoveryTimeMinutes: 2
        },
        tunnels: {
          tracked: 1,
          uptimePct: 98.1,
          details: [
            {
              tunnelId: "tnl_1",
              serverId: "srv_1",
              provider: "playit",
              uptimePct: 98.1
            }
          ]
        },
        backups: {
          restoreAttempts: 2,
          restoreSuccess: 2,
          restoreSuccessRatePct: 100,
          verifiedSuccessRatePct: 100
        }
      });
      return;
    }

    if (pathname === "/system/hardening-checklist" && method === "GET") {
      await withJson(200, {
        quickLocalMode: {
          enabled: true,
          description: "Start local first, then apply hardening.",
          firstSuccessfulLaunchAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
        },
        hardeningSteps: [
          {
            id: "rotate_owner_token",
            title: "Rotate default owner token",
            done: true,
            detail: "Owner token has been rotated."
          },
          {
            id: "configure_cloud_backup_destination",
            title: "Configure encrypted cloud backup destination",
            done: false,
            detail: "No cloud destination configured yet."
          }
        ]
      });
      return;
    }

    if (pathname === "/system/bedrock-strategy" && method === "GET") {
      await withJson(200, {
        selectedStrategy: "java_geyser_floodgate_crossplay",
        nativeBedrockSupport: false,
        oneClickCrossplay: {
          available: true,
          serverType: "paper",
          toggles: {
            enableGeyser: true,
            enableFloodgate: true
          },
          limits: [
            "Requires Java Edition server runtime (Paper).",
            "Some Java-only plugins/mods can break Bedrock parity."
          ]
        },
        recommendation: "Use Paper + Geyser + Floodgate one-click crossplay for mixed Java/Bedrock players."
      });
      return;
    }

    if (pathname === "/migration/imports" && method === "GET") {
      await withJson(200, { imports: [] });
      return;
    }

    if (pathname === "/system/trust/verify-checksum" && method === "POST") {
      await withJson(200, {
        filePath: "/tmp/example",
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        matchesExpected: true
      });
      return;
    }

    if (pathname === "/audit/export" && method === "GET") {
      const format = url.searchParams.get("format");
      if (format === "csv") {
        await route.fulfill({
          status: 200,
          contentType: "text/csv; charset=utf-8",
          body: "id,actor,action\n1,owner,test\n",
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"
          }
        });
        return;
      }
      await withJson(200, {
        exportedAt: new Date().toISOString(),
        total: 1,
        logs: []
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

  await expect(page.getByRole("heading", { name: "Servers", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Open Workspace" }).first().click();
  await expect(page.getByRole("heading", { name: "Server Controls" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open player profile for Alice" })).toBeVisible();
  await expect.poll(async () => page.getByRole("button", { name: "Open player profile for Bob" }).count()).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Open player profile for Alice" }).click();
  await expect(page.getByRole("heading", { name: "Alice" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Alice" })).toBeHidden();

  const dashboardTab = page.getByRole("tab", { name: "Dashboard" });
  await dashboardTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Console" })).toHaveAttribute("aria-selected", "true");

  await expect(page.getByRole("heading", { name: "Preflight Diagnostics" })).toBeVisible();
  await page.getByLabel("Command").fill("say e2e command");
  await page.getByLabel("Command").press("Enter");
  await expect.poll(() => commandCalled).toBe(true);

  await page.evaluate(() => {
    window.location.hash = "#servers-list";
  });
  await expect(page.getByRole("heading", { name: "Servers", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create Server" }).first().click();

  await expect(page.getByRole("heading", { name: "Minecraft Server Setup Wizard" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Minecraft Server Setup Wizard" })).toBeHidden();
  await page.evaluate(() => {
    window.location.hash = "#servers-list";
  });
  await expect(page.getByRole("heading", { name: "Servers", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create Server" }).first().click();
  await expect(page.getByRole("heading", { name: "Minecraft Server Setup Wizard" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Fabric" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Launch Server" }).click();

  await expect.poll(() => setupSessionCreated).toBe(true);
  await expect.poll(() => setupSessionLaunched).toBe(true);
  await expect(page.getByRole("heading", { name: "Server Ready" })).toBeVisible();

  await page.getByRole("button", { name: "Continue to Dashboard" }).click();
  await expect(page.getByRole("heading", { name: "Server Controls" })).toBeVisible();
  await page.getByRole("button", { name: "Open player profile for Alice" }).click();
  await page.locator(".v2-modal").getByRole("button", { name: "Op", exact: true }).click();
  await expect.poll(() => playerAdminActionCalled).toBe(true);
});
