import { store } from "../repositories/store.js";

function toPct(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 1000) / 10;
}

function isActiveTunnelStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return normalized === "active" || normalized === "running" || normalized === "ready";
}

export class ReliabilityService {
  buildDashboard(input?: { hours?: number; serverId?: string }) {
    const hours = Math.max(1, Math.min(input?.hours ?? 24 * 7, 24 * 30));
    const sinceMs = Date.now() - hours * 60 * 60 * 1000;
    const sinceIso = new Date(sinceMs).toISOString();
    const serverId = input?.serverId;
    const servers = serverId ? [store.getServerById(serverId)].filter(Boolean) : store.listServers();

    const startupEvents = servers.flatMap((server) =>
      store
        .listServerStartupEvents({
          serverId: server!.id,
          limit: 500
        })
        .filter((entry) => new Date(entry.createdAt).getTime() >= sinceMs)
    );
    const totalStarts = startupEvents.length;
    const successfulStarts = startupEvents.filter((entry) => entry.success === 1).length;
    const failedStarts = totalStarts - successfulStarts;

    const crashEvents = servers.flatMap((server) =>
      store
        .listCrashReports(server!.id)
        .filter((entry) => new Date(entry.createdAt).getTime() >= sinceMs)
        .map((entry) => ({
          ...entry,
          createdAtMs: new Date(entry.createdAt).getTime()
        }))
    );

    const successfulStartsByServer = new Map<string, Array<number>>();
    for (const event of startupEvents) {
      if (event.success !== 1) {
        continue;
      }
      const createdAtMs = new Date(event.createdAt).getTime();
      const list = successfulStartsByServer.get(event.serverId) ?? [];
      list.push(createdAtMs);
      successfulStartsByServer.set(event.serverId, list);
    }
    for (const values of successfulStartsByServer.values()) {
      values.sort((a, b) => a - b);
    }

    const recoveryDurationsMs: number[] = [];
    for (const crash of crashEvents) {
      const starts = successfulStartsByServer.get(crash.serverId) ?? [];
      const next = starts.find((createdAtMs) => createdAtMs > crash.createdAtMs);
      if (next) {
        recoveryDurationsMs.push(next - crash.createdAtMs);
      }
    }
    const meanRecoveryTimeMs =
      recoveryDurationsMs.length > 0
        ? Math.round(recoveryDurationsMs.reduce((sum, value) => sum + value, 0) / recoveryDurationsMs.length)
        : null;

    const restoreEvents = store.listBackupRestoreEvents({
      serverId,
      since: sinceIso,
      limit: 4000
    });
    const restoreAttempts = restoreEvents.length;
    const restoreSuccesses = restoreEvents.filter((event) => event.success === 1).length;
    const restoreVerified = restoreEvents.filter((event) => event.success === 1 && event.verified === 1).length;

    const tunnels = serverId ? store.listTunnels(serverId) : store.listTunnels();
    const tunnelDurations = tunnels.map((tunnel) => {
      const events = store
        .listTunnelStatusEvents({
          tunnelId: tunnel.id,
          limit: 5000
        })
        .map((entry) => ({
          ...entry,
          createdAtMs: new Date(entry.createdAt).getTime()
        }))
        .sort((a, b) => a.createdAtMs - b.createdAtMs);

      let active = false;
      let activeStartMs = sinceMs;
      let activeDurationMs = 0;

      for (const event of events) {
        if (event.createdAtMs < sinceMs) {
          active = isActiveTunnelStatus(event.status);
          continue;
        }

        if (active) {
          activeDurationMs += Math.max(0, event.createdAtMs - activeStartMs);
        }
        active = isActiveTunnelStatus(event.status);
        activeStartMs = event.createdAtMs;
      }

      if (active) {
        activeDurationMs += Math.max(0, Date.now() - activeStartMs);
      }

      return {
        tunnelId: tunnel.id,
        serverId: tunnel.serverId,
        provider: tunnel.provider,
        activeDurationMs,
        windowDurationMs: Date.now() - sinceMs
      };
    });

    const tunnelWindowTotal = tunnelDurations.reduce((sum, item) => sum + item.windowDurationMs, 0);
    const tunnelActiveTotal = tunnelDurations.reduce((sum, item) => sum + item.activeDurationMs, 0);

    return {
      generatedAt: new Date().toISOString(),
      windowHours: hours,
      scope: {
        serverId: serverId ?? null,
        servers: servers.length
      },
      startup: {
        total: totalStarts,
        success: successfulStarts,
        failed: failedStarts,
        successRatePct: toPct(successfulStarts, totalStarts)
      },
      crashes: {
        total: crashEvents.length,
        crashRatePer100Starts: totalStarts > 0 ? Math.round((crashEvents.length / totalStarts) * 10_000) / 100 : 0
      },
      recovery: {
        measuredEvents: recoveryDurationsMs.length,
        meanRecoveryTimeMs,
        meanRecoveryTimeMinutes: meanRecoveryTimeMs !== null ? Math.round((meanRecoveryTimeMs / 60_000) * 10) / 10 : null
      },
      tunnels: {
        tracked: tunnelDurations.length,
        uptimePct: tunnelWindowTotal > 0 ? Math.round((tunnelActiveTotal / tunnelWindowTotal) * 1000) / 10 : 0,
        details: tunnelDurations.map((item) => ({
          tunnelId: item.tunnelId,
          serverId: item.serverId,
          provider: item.provider,
          uptimePct: toPct(item.activeDurationMs, item.windowDurationMs)
        }))
      },
      backups: {
        restoreAttempts,
        restoreSuccess: restoreSuccesses,
        restoreSuccessRatePct: toPct(restoreSuccesses, restoreAttempts),
        verifiedSuccessRatePct: toPct(restoreVerified, restoreAttempts)
      }
    };
  }
}
