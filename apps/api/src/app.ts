import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { closeDb, migrate } from "./lib/db.js";
import { loadConfig, type AppConfig } from "./lib/config.js";
import { store } from "./repositories/store.js";
import { registerApiRoutes } from "./routes/api.js";
import { AlertMonitorService } from "./services/alert-monitor.js";
import { BackupService } from "./services/backup-service.js";
import { BackupRetentionService } from "./services/backup-retention-service.js";
import { ConsoleHub } from "./services/console-hub.js";
import { ContentCatalogService } from "./services/content-catalog.js";
import { CrashReportService } from "./services/crash-report-service.js";
import { JavaService } from "./services/java-service.js";
import { PolicyService } from "./services/policy-service.js";
import { PreflightService } from "./services/preflight-service.js";
import { RemoteControlService } from "./services/remote-control-service.js";
import { ReliabilityService } from "./services/reliability-service.js";
import { PlayerAdminService } from "./services/player-admin-service.js";
import { MigrationService } from "./services/migration-service.js";
import { ServerRuntimeService } from "./services/server-runtime.js";
import { ServerSetupService } from "./services/server-setup.js";
import { TaskSchedulerService } from "./services/task-scheduler.js";
import { TunnelService } from "./services/tunnel-service.js";
import { VersionCatalogService } from "./services/version-catalog.js";

export type ApiServices = {
  versions: VersionCatalogService;
  java: JavaService;
  setup: ServerSetupService;
  consoleHub: ConsoleHub;
  alerts: AlertMonitorService;
  runtime: ServerRuntimeService;
  backup: BackupService;
  tunnels: TunnelService;
  tasks: TaskSchedulerService;
  content: ContentCatalogService;
  preflight: PreflightService;
  crashReports: CrashReportService;
  backupRetention: BackupRetentionService;
  policy: PolicyService;
  remoteControl: RemoteControlService;
  reliability: ReliabilityService;
  playerAdmin: PlayerAdminService;
  migration: MigrationService;
};

export type CreateApiAppResult = {
  app: FastifyInstance;
  config: AppConfig;
  services: ApiServices;
  adminToken: string;
};

export async function createApiApp(options?: {
  config?: AppConfig;
  startBackgroundWorkers?: boolean;
}): Promise<CreateApiAppResult> {
  const config = options?.config ?? loadConfig();
  const startBackgroundWorkers = options?.startBackgroundWorkers ?? true;

  migrate();
  const admin = store.ensureDefaultAdmin("owner", config.defaultAdminToken);

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  // Some clients send `content-type: application/json` with an empty POST body.
  // Accept that shape as `{}` to avoid hard failures on no-body action endpoints.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const rawBody = typeof body === "string" ? body : body.toString("utf8");
    const raw = rawBody.trim();
    if (!raw) {
      done(null, {});
      return;
    }

    try {
      done(null, JSON.parse(raw));
    } catch {
      done(app.httpErrors.badRequest("Invalid JSON body"));
    }
  });

  const remoteControl = new RemoteControlService();
  const localhostOrigins = new Set(["http://127.0.0.1:5174", "http://localhost:5174", "http://127.0.0.1:4010", "http://localhost:4010"]);
  const localhostIps = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

  function isLoopbackOrigin(origin: string): boolean {
    if (origin.startsWith("file://")) {
      return true;
    }

    if (localhostOrigins.has(origin)) {
      return true;
    }

    try {
      const parsed = new URL(origin);
      return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
    } catch {
      return false;
    }
  }

  function isLoopbackIp(ip: string): boolean {
    if (localhostIps.has(ip)) {
      return true;
    }

    if (ip.startsWith("::ffff:127.")) {
      return true;
    }

    return false;
  }

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (isLoopbackOrigin(origin)) {
        callback(null, true);
        return;
      }

      const remote = remoteControl.getStatus();
      const allowed = remote.enabled && remote.allowedOrigins.includes(origin);
      callback(null, allowed);
    }
  });
  await app.register(sensible);
  await app.register(websocket);

  app.setErrorHandler((error, request, reply) => {
    if (reply.sent) {
      return;
    }

    let statusCode = Number((error as { statusCode?: number }).statusCode ?? 500);
    if (!Number.isFinite(statusCode) || statusCode < 400 || statusCode > 599) {
      statusCode = 500;
    }

    let code = typeof (error as { code?: unknown }).code === "string" ? String((error as { code?: string }).code) : "";
    let message = typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : "Request failed";
    let details: Record<string, unknown> | undefined;

    if (error instanceof ZodError) {
      statusCode = 400;
      code = "validation_error";
      message = error.issues.map((issue) => issue.message).join("; ") || "Validation failed";
      details = {
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code
        }))
      };
    }

    if (!code) {
      code = statusCode >= 500 ? "internal_error" : "request_error";
    }

    const payload: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
      error: string;
    } = {
      code,
      message,
      error: message
    };
    if (details) {
      payload.details = details;
    }

    request.log.error({ err: error, code, statusCode }, "request failed");
    reply.code(statusCode).send(payload);
  });

  app.addHook("onRequest", async (request, reply) => {
    if (isLoopbackIp(request.ip)) {
      return;
    }

    const remote = remoteControl.getStatus();
    if (!remote.enabled) {
      const message = "Remote mode is disabled for non-local requests";
      reply.code(403).send({
        code: "remote_mode_disabled",
        message,
        error: message
      });
      return;
    }

    const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;
    const header = request.headers["x-remote-token"];
    const token = typeof header === "string" ? header : Array.isArray(header) ? header[0] : undefined;
    const validation = remoteControl.validateRemoteRequest(origin, token);
    if (!validation.ok) {
      const reason = validation.reason ?? "unknown";
      const message = `Remote request rejected (${reason})`;
      reply.code(403).send({
        code: "remote_request_rejected",
        message,
        details: {
          reason
        },
        error: message
      });
      return;
    }
  });

  const versions = new VersionCatalogService();
  const java = new JavaService();
  const setup = new ServerSetupService(versions);
  const consoleHub = new ConsoleHub();
  const alerts = new AlertMonitorService();
  const preflight = new PreflightService();
  const crashReports = new CrashReportService();
  const policy = new PolicyService();

  const runtime = new ServerRuntimeService(setup, consoleHub, (serverId, code) => {
    alerts.recordCrash(serverId, code);
    try {
      crashReports.create(serverId, "process_exit", code, consoleHub.getHistory(serverId));
    } catch {
      // Avoid crashing callback path if report creation fails.
    }
  });

  const backup = new BackupService();
  const backupRetention = new BackupRetentionService();
  const tunnels = new TunnelService(consoleHub);
  const tasks = new TaskSchedulerService(runtime, backup, (serverId, severity, kind, message) => {
    alerts.createAlert(serverId, severity, kind, message);
  });
  const content = new ContentCatalogService();
  const reliability = new ReliabilityService();
  const playerAdmin = new PlayerAdminService();
  const migration = new MigrationService();

  const services: ApiServices = {
    versions,
    java,
    setup,
    consoleHub,
    alerts,
    runtime,
    backup,
    tunnels,
    tasks,
    content,
    preflight,
    crashReports,
    backupRetention,
    policy,
    remoteControl,
    reliability,
    playerAdmin,
    migration
  };

  await registerApiRoutes(app, services);

  if (startBackgroundWorkers) {
    alerts.start();
    tasks.start();
    backupRetention.start();
  }

  app.addHook("onClose", async () => {
    alerts.stop();
    backupRetention.stop();
    closeDb();
  });

  return {
    app,
    config,
    services,
    adminToken: admin.apiToken
  };
}
