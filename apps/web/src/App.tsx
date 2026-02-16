import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ApiClient } from "./lib/api";

type Server = {
  id: string;
  name: string;
  type: "vanilla" | "paper" | "fabric";
  mcVersion: string;
  port: number;
  bedrockPort: number | null;
  minMemoryMb: number;
  maxMemoryMb: number;
  status: string;
  createdAt: string;
};

type Alert = {
  id: string;
  serverId: string;
  severity: string;
  kind: string;
  message: string;
  createdAt: string;
  resolvedAt: string | null;
};

type Task = {
  id: string;
  serverId: string;
  name: string;
  cronExpr: string;
  action: string;
  payload: string;
  enabled: number;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastOutput: string | null;
};

type Tunnel = {
  id: string;
  serverId: string;
  provider: "manual" | "playit" | "cloudflared" | "ngrok";
  protocol: "tcp" | "udp";
  localPort: number;
  publicHost: string;
  publicPort: number;
  status: string;
};

type QuickHostingStatus = {
  server: {
    id: string;
    name: string;
    status: string;
    localAddress: string;
  };
  quickHostReady: boolean;
  publicAddress: string | null;
  tunnel: Tunnel | null;
  steps: string[];
};

type QuickHostingDiagnostics = {
  diagnostics: {
    tunnelId: string;
    provider: "manual" | "playit" | "cloudflared" | "ngrok";
    status: string;
    command: string;
    commandAvailable: boolean;
    authConfigured: boolean | null;
    endpointAssigned: boolean;
    endpoint: string | null;
    retry: {
      nextAttemptAt: string | null;
      nextAttemptInSeconds: number | null;
      lastAttemptAt: string | null;
      lastSuccessAt: string | null;
    };
    message: string | null;
  } | null;
  actions: string[];
  fixes: Array<{
    id: string;
    label: string;
    description: string;
  }>;
};

type QuickStartResult = {
  server: Server;
  started: boolean;
  blocked: boolean;
  warning: string | null;
  quickHosting: {
    enabled: boolean;
    publicAddress: string | null;
    warning: string | null;
  };
};

type InstalledPackage = {
  id: string;
  serverId: string;
  provider: "modrinth" | "curseforge";
  projectId: string;
  versionId: string;
  slug: string;
  name: string;
  kind: "mod" | "plugin" | "modpack" | "resourcepack";
  loader: string;
  gameVersion: string;
  filePath: string;
  fileName: string;
  fileHash: string | null;
  installedAt: string;
  updatedAt: string;
};

type PackageUpdate = {
  packageId: string;
  provider: "modrinth" | "curseforge";
  projectId: string;
  currentVersionId: string;
  latestVersionId: string;
  available: boolean;
};

type ContentSearchResult = {
  provider: "modrinth" | "curseforge";
  projectId: string;
  slug: string;
  name: string;
  summary: string;
  kind: "mod" | "plugin" | "modpack" | "resourcepack";
  iconUrl: string | null;
  downloads: number;
  latestVersionId: string | null;
  compatible: boolean;
};

type UserRecord = {
  id: string;
  username: string;
  role: "owner" | "admin" | "moderator" | "viewer";
  apiToken: string;
  createdAt: string;
};

type BackupRecord = {
  id: string;
  serverId: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  restoredAt: string | null;
};

type BackupPolicy = {
  serverId: string;
  maxBackups: number;
  maxAgeDays: number;
  pruneCron: string;
  enabled: number;
};

type PreflightIssue = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  recommendation: string;
};

type PreflightReport = {
  serverId: string;
  checkedAt: string;
  passed: boolean;
  issues: PreflightIssue[];
};

type CrashReport = {
  id: string;
  serverId: string;
  reason: string;
  exitCode: number | null;
  reportPath: string;
  createdAt: string;
};

type RemoteState = {
  enabled: boolean;
  allowedOrigins: string[];
  requireToken: boolean;
  configuredToken: boolean;
};

type JavaChannel = {
  major: number;
  lts: boolean;
  recommendedFor: string;
  adoptiumApi: string;
};

type Audit = {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  payload: string;
  createdAt: string;
};

type TelemetryFunnel = {
  windowHours: number;
  sessionsObserved: number;
  stageTotals: {
    connect: number;
    create: number;
    start: number;
    publicReady: number;
  };
  conversion: {
    createFromConnectPct: number;
    startFromCreatePct: number;
    publicReadyFromStartPct: number;
  };
};

type VersionCatalog = {
  vanilla: Array<{ id: string; stable: boolean }>;
  paper: Array<{ id: string; stable: boolean }>;
  fabric: Array<{ id: string; stable: boolean }>;
};

type SetupPreset = {
  id: "custom" | "survival" | "modded" | "minigame";
  label: string;
  description: string;
};

type LogStreamState = "disconnected" | "connecting" | "live" | "error";

type HardwareProfile = {
  platform: string;
  arch: string;
  cpuCores: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  recommendations: {
    quickStartMinMemoryMb: number;
    quickStartMaxMemoryMb: number;
  };
};

type EditableFileEntry = {
  path: string;
  sizeBytes: number;
  updatedAt: string | null;
  exists: boolean;
};

type ServerPropertiesFormValues = {
  motd: string;
  maxPlayers: number;
  difficulty: "peaceful" | "easy" | "normal" | "hard";
  gameMode: "survival" | "creative" | "adventure" | "spectator";
  pvp: boolean;
  whitelist: boolean;
  onlineMode: boolean;
  viewDistance: number;
  simulationDistance: number;
};

type ServerPropertiesSnapshot = {
  id: string;
  path: string;
  reason: string;
  createdAt: string;
};

type GoLiveResult = {
  ok: boolean;
  blocked: boolean;
  preflight?: PreflightReport | null;
  warning?: string | null;
  publicHosting?: {
    quickHostReady: boolean;
    publicAddress: string | null;
    tunnel: Tunnel | null;
    steps: string[];
  };
};

type ExperienceMode = "beginner" | "advanced";
type ThemePreference = "colorful" | "dark" | "light" | "system";

type BulkServerAction = "start" | "stop" | "restart" | "backup" | "goLive";

type BulkServerActionResult = {
  serverId: string;
  ok: boolean;
  blocked?: boolean;
  warning?: string | null;
  message: string;
  publicAddress?: string | null;
};

type BulkServerActionResponse = {
  ok: boolean;
  action: BulkServerAction;
  total: number;
  succeeded: number;
  failed: number;
  results: BulkServerActionResult[];
};

type PerformanceAdvisorReport = {
  server: {
    id: string;
    name: string;
    status: string;
    maxMemoryMb: number;
  };
  advisor: {
    windowHours: number;
    sampleCount: number;
    metrics: {
      latest: {
        sampledAt: string;
        cpuPercent: number;
        memoryMb: number;
      } | null;
      cpu: {
        avgPercent: number;
        peakPercent: number;
      };
      memory: {
        avgMb: number;
        peakMb: number;
        configuredMaxMb: number;
      };
    };
    startup: {
      trend: "improving" | "stable" | "regressing" | "insufficient_data";
      recent: Array<{
        createdAt: string;
        durationMs: number;
        success: boolean;
        exitCode: number | null;
      }>;
      averageDurationMs: number | null;
      latestDurationMs: number | null;
    };
    tickLag: {
      eventsInWindow: number;
      lastEventAt: string | null;
      maxLagMs: number;
      recent: Array<{
        createdAt: string;
        lagMs: number;
        ticksBehind: number;
        line: string;
      }>;
    };
    hints: Array<{
      level: "ok" | "warning" | "critical";
      title: string;
      detail: string;
    }>;
  };
};

type TrustReport = {
  generatedAt: string;
  build: {
    appVersion: string;
    platform: string;
    arch: string;
    nodeVersion: string;
    mode: string;
    signatureStatus: string;
    signatureProvider: string | null;
    releaseChannel: string;
    repository: string;
  };
  verification: {
    checksumUrl: string | null;
    attestationUrl: string | null;
  };
  security: {
    localOnlyByDefault: boolean;
    authModel: string;
    auditTrailEnabled: boolean;
    remoteControlEnabled: boolean;
    remoteTokenRequired: boolean;
    configuredRemoteToken: boolean;
    allowedOrigins: string[];
  };
};

type AppView = "overview" | "setup" | "manage" | "content" | "advanced" | "trust";

type ViewerIdentity = {
  username: string;
  role: UserRecord["role"] | null;
};

type DesktopBridgeInfo = {
  apiBase?: string;
  platform?: string;
  appVersion?: string;
  packaged?: boolean;
  signatureStatus?: string;
};

type EditorFileSnapshot = {
  id: string;
  path: string;
  reason: string;
  createdAt: string;
};

type CommandPaletteAction = {
  id: string;
  label: string;
  detail: string;
  keywords: string[];
  run: () => void;
  disabled?: boolean;
};

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? "unknown").toLowerCase();
}

function isServerRunning(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "running";
}

function isServerTransitioning(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized === "starting" || normalized === "stopping" || normalized === "provisioning" || normalized === "pending";
}

function canStartServer(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized !== "running" && normalized !== "starting" && normalized !== "provisioning";
}

function canStopServer(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status);
  return normalized !== "stopped" && normalized !== "stopping";
}

function statusTone(status: string | null | undefined): "ok" | "warn" | "error" | "neutral" {
  const normalized = normalizeStatus(status);
  if (normalized === "running" || normalized === "active" || normalized === "ready" || normalized === "online") {
    return "ok";
  }
  if (normalized === "crashed" || normalized === "error" || normalized === "failed") {
    return "error";
  }
  if (normalized === "idle" || normalized === "pending" || normalized === "starting" || normalized === "stopping" || normalized === "provisioning") {
    return "warn";
  }
  if (isServerTransitioning(normalized)) {
    return "warn";
  }
  return "neutral";
}

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

function readDesktopBridge(): DesktopBridgeInfo | null {
  return (
    (window as Window & {
      simpleServers?: DesktopBridgeInfo;
    }).simpleServers ?? null
  );
}

function resolveDefaultApiBase(): string {
  const fallback = "http://127.0.0.1:4010";
  const queryValue = new URLSearchParams(window.location.search).get("apiBase");
  if (queryValue && isHttpUrl(queryValue)) {
    return queryValue;
  }

  const bridgeValue = readDesktopBridge()?.apiBase;

  if (bridgeValue && isHttpUrl(bridgeValue)) {
    return bridgeValue;
  }

  return fallback;
}

const defaultApiBase = resolveDefaultApiBase();

const fallbackSetupPresets: SetupPreset[] = [
  {
    id: "custom",
    label: "Custom",
    description: "Manual control over all settings."
  },
  {
    id: "survival",
    label: "Survival Starter",
    description: "Balanced default for most friend groups."
  },
  {
    id: "modded",
    label: "Modded Fabric",
    description: "Fabric-focused profile with more memory."
  },
  {
    id: "minigame",
    label: "Minigame Performance",
    description: "Paper profile tuned for plugin-heavy servers."
  }
];

const defaultServerProperties: ServerPropertiesFormValues = {
  motd: "SimpleServers",
  maxPlayers: 20,
  difficulty: "normal",
  gameMode: "survival",
  pvp: true,
  whitelist: false,
  onlineMode: true,
  viewDistance: 10,
  simulationDistance: 10
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return fallback;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseServerProperties(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    result[key] = value;
  }
  return result;
}

function deriveServerPropertiesForm(content: string): ServerPropertiesFormValues {
  const values = parseServerProperties(content);
  const difficulty = values["difficulty"];
  const gameMode = values["gamemode"];
  const normalizedDifficulty: ServerPropertiesFormValues["difficulty"] =
    difficulty === "peaceful" || difficulty === "easy" || difficulty === "normal" || difficulty === "hard"
      ? difficulty
      : defaultServerProperties.difficulty;
  const normalizedGameMode: ServerPropertiesFormValues["gameMode"] =
    gameMode === "survival" || gameMode === "creative" || gameMode === "adventure" || gameMode === "spectator"
      ? gameMode
      : defaultServerProperties.gameMode;
  return {
    motd: values["motd"] ?? defaultServerProperties.motd,
    maxPlayers: parseNumber(values["max-players"], defaultServerProperties.maxPlayers),
    difficulty: normalizedDifficulty,
    gameMode: normalizedGameMode,
    pvp: parseBoolean(values["pvp"], defaultServerProperties.pvp),
    whitelist: parseBoolean(values["white-list"], defaultServerProperties.whitelist),
    onlineMode: parseBoolean(values["online-mode"], defaultServerProperties.onlineMode),
    viewDistance: parseNumber(values["view-distance"], defaultServerProperties.viewDistance),
    simulationDistance: parseNumber(values["simulation-distance"], defaultServerProperties.simulationDistance)
  };
}

function applyServerPropertiesForm(currentContent: string, form: ServerPropertiesFormValues): string {
  const replacements = new Map<string, string>([
    ["motd", form.motd],
    ["max-players", String(form.maxPlayers)],
    ["difficulty", form.difficulty],
    ["gamemode", form.gameMode],
    ["pvp", String(form.pvp)],
    ["white-list", String(form.whitelist)],
    ["online-mode", String(form.onlineMode)],
    ["view-distance", String(form.viewDistance)],
    ["simulation-distance", String(form.simulationDistance)]
  ]);

  const lines = currentContent.split(/\r?\n/);
  const touched = new Set<string>();
  const nextLines = lines.map((line) => {
    const separator = line.indexOf("=");
    if (separator <= 0) {
      return line;
    }
    const key = line.slice(0, separator).trim();
    const replacement = replacements.get(key);
    if (replacement === undefined) {
      return line;
    }
    touched.add(key);
    return `${key}=${replacement}`;
  });

  for (const [key, value] of replacements.entries()) {
    if (!touched.has(key)) {
      nextLines.push(`${key}=${value}`);
    }
  }

  return nextLines.join("\n").trimEnd() + "\n";
}

function validateServerProperties(form: ServerPropertiesFormValues): string[] {
  const issues: string[] = [];
  if (!form.motd.trim()) {
    issues.push("MOTD cannot be empty.");
  }
  if (form.maxPlayers < 1 || form.maxPlayers > 500) {
    issues.push("Max players must be between 1 and 500.");
  }
  if (form.viewDistance < 2 || form.viewDistance > 32) {
    issues.push("View distance must be between 2 and 32.");
  }
  if (form.simulationDistance < 2 || form.simulationDistance > 32) {
    issues.push("Simulation distance must be between 2 and 32.");
  }
  return issues;
}

export default function App() {
  const [apiBase, setApiBase] = useState(defaultApiBase);
  const [token, setToken] = useState("simpleservers-dev-admin-token");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [servers, setServers] = useState<Server[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [installedPackages, setInstalledPackages] = useState<InstalledPackage[]>([]);
  const [packageUpdates, setPackageUpdates] = useState<PackageUpdate[]>([]);
  const [contentResults, setContentResults] = useState<ContentSearchResult[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [backupPolicy, setBackupPolicy] = useState<BackupPolicy | null>(null);
  const [preflight, setPreflight] = useState<PreflightReport | null>(null);
  const [crashReports, setCrashReports] = useState<CrashReport[]>([]);
  const [quickHostingStatus, setQuickHostingStatus] = useState<QuickHostingStatus | null>(null);
  const [quickHostingDiagnostics, setQuickHostingDiagnostics] = useState<QuickHostingDiagnostics | null>(null);
  const [quickHostRetryCountdown, setQuickHostRetryCountdown] = useState<number | null>(null);
  const [remoteState, setRemoteState] = useState<RemoteState | null>(null);
  const [javaChannels, setJavaChannels] = useState<JavaChannel[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [funnelMetrics, setFunnelMetrics] = useState<TelemetryFunnel | null>(null);
  const [status, setStatus] = useState<{ servers: { total: number; running: number; crashed: number }; alerts: { open: number; total: number } } | null>(null);
  const [catalog, setCatalog] = useState<VersionCatalog>({ vanilla: [], paper: [], fabric: [] });
  const [setupPresets, setSetupPresets] = useState<SetupPreset[]>(fallbackSetupPresets);
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ ts: string; line: string }>>([]);
  const [liveConsole, setLiveConsole] = useState(true);
  const [logStreamState, setLogStreamState] = useState<LogStreamState>("disconnected");

  const [createServer, setCreateServer] = useState({
    name: "My Server",
    preset: "custom" as "custom" | "survival" | "modded" | "minigame",
    type: "paper" as "vanilla" | "paper" | "fabric",
    mcVersion: "",
    port: 25565,
    bedrockPort: 19132,
    minMemoryMb: 1024,
    maxMemoryMb: 4096,
    allowCracked: false,
    enableGeyser: true,
    enableFloodgate: true,
    quickPublicHosting: true
  });

  const [taskForm, setTaskForm] = useState({
    serverId: "",
    name: "Nightly backup",
    cronExpr: "0 4 * * *",
    action: "backup" as "restart" | "backup" | "command",
    command: "say Scheduled restart in 30 seconds"
  });

  const [tunnelForm, setTunnelForm] = useState({
    serverId: "",
    provider: "manual" as "manual" | "playit" | "cloudflared" | "ngrok",
    protocol: "tcp" as "tcp" | "udp",
    localPort: 25565,
    publicHost: "example.your-domain.com",
    publicPort: 25565,
    playitCommand: "playit",
    playitArgs: ""
  });

  const [filePath, setFilePath] = useState("server.properties");
  const [fileContent, setFileContent] = useState("");
  const [fileOriginal, setFileOriginal] = useState("");
  const [serverPropertiesRaw, setServerPropertiesRaw] = useState("");
  const [serverPropertiesForm, setServerPropertiesForm] = useState<ServerPropertiesFormValues>(defaultServerProperties);
  const [serverPropertySnapshots, setServerPropertySnapshots] = useState<ServerPropertiesSnapshot[]>([]);
  const [loadingServerProperties, setLoadingServerProperties] = useState(false);
  const [savingServerProperties, setSavingServerProperties] = useState(false);
  const [serverPropertiesIssues, setServerPropertiesIssues] = useState<string[]>([]);
  const [repairingCore, setRepairingCore] = useState(false);
  const [rollingBackConfig, setRollingBackConfig] = useState(false);
  const [safeRestarting, setSafeRestarting] = useState(false);
  const [runningCrashDoctor, setRunningCrashDoctor] = useState(false);
  const [downloadingSupportBundle, setDownloadingSupportBundle] = useState(false);
  const [applyingNetworkFix, setApplyingNetworkFix] = useState<string | null>(null);
  const [editorFiles, setEditorFiles] = useState<EditableFileEntry[]>([]);
  const [editorSearch, setEditorSearch] = useState("");
  const [loadingEditorFile, setLoadingEditorFile] = useState(false);
  const [savingEditorFile, setSavingEditorFile] = useState(false);
  const [editorFileSnapshots, setEditorFileSnapshots] = useState<EditorFileSnapshot[]>([]);
  const [loadingEditorSnapshots, setLoadingEditorSnapshots] = useState(false);
  const [restoringEditorSnapshotId, setRestoringEditorSnapshotId] = useState<string | null>(null);
  const [rollingBackEditorSnapshot, setRollingBackEditorSnapshot] = useState(false);
  const [deletingServerId, setDeletingServerId] = useState<string | null>(null);
  const [contentForm, setContentForm] = useState({
    provider: "modrinth" as "modrinth" | "curseforge",
    query: "essential",
    kind: "mod" as "mod" | "plugin" | "modpack" | "resourcepack"
  });
  const [userForm, setUserForm] = useState({
    username: "operator",
    role: "admin" as UserRecord["role"],
    apiToken: "operator-token-change-me"
  });
  const [rotateTokenForm, setRotateTokenForm] = useState({
    userId: "",
    newToken: ""
  });
  const [remoteConfigForm, setRemoteConfigForm] = useState({
    enabled: false,
    requireToken: true,
    allowedOriginsCsv: ""
  });
  const [activeView, setActiveView] = useState<AppView>("overview");
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("beginner");
  const [themePreference, setThemePreference] = useState<ThemePreference>("colorful");
  const [powerMode, setPowerMode] = useState(false);
  const [viewer, setViewer] = useState<ViewerIdentity | null>(null);
  const [hasSearchedContent, setHasSearchedContent] = useState(false);
  const [serverSearch, setServerSearch] = useState("");
  const [bulkSelectedServerIds, setBulkSelectedServerIds] = useState<string[]>([]);
  const [bulkActionInFlight, setBulkActionInFlight] = useState<BulkServerAction | null>(null);
  const [performanceAdvisor, setPerformanceAdvisor] = useState<PerformanceAdvisorReport | null>(null);
  const [trustReport, setTrustReport] = useState<TrustReport | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState("");

  const api = useRef(new ApiClient(defaultApiBase, token));
  const desktopBridge = useMemo(() => readDesktopBridge(), []);
  const logSocketRef = useRef<WebSocket | null>(null);
  const manuallyClosedSocketsRef = useRef(new WeakSet<WebSocket>());
  const logReconnectTimerRef = useRef<number | null>(null);
  const logStreamServerRef = useRef<string | null>(null);
  const manualLogDisconnectRef = useRef(false);
  const commandPaletteInputRef = useRef<HTMLInputElement | null>(null);
  const telemetrySessionIdRef = useRef(
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `session-${Math.random().toString(36).slice(2, 10)}`
  );
  const telemetryKeysRef = useRef(new Set<string>());

  function setClientAuth(): void {
    api.current.setAuth(apiBase, token);
  }

  function markTelemetryKey(key: string): boolean {
    if (telemetryKeysRef.current.has(key)) {
      return false;
    }
    telemetryKeysRef.current.add(key);
    return true;
  }

  async function trackTelemetryEvent(event: string, metadata?: Record<string, unknown>): Promise<void> {
    try {
      await api.current.post("/telemetry/events", {
        sessionId: telemetrySessionIdRef.current,
        event,
        metadata: metadata ?? {}
      });
    } catch {
      // telemetry should never block UX
    }
  }

  function computeDiff(current: string, next: string): string[] {
    const currentLines = current.split("\n");
    const nextLines = next.split("\n");
    const lines: string[] = [];
    const max = Math.max(currentLines.length, nextLines.length);
    for (let index = 0; index < max; index += 1) {
      const oldLine = currentLines[index];
      const newLine = nextLines[index];
      if (oldLine === newLine) {
        continue;
      }
      if (oldLine !== undefined) {
        lines.push(`- ${oldLine}`);
      }
      if (newLine !== undefined) {
        lines.push(`+ ${newLine}`);
      }
    }
    return lines;
  }

  function encodeTokenForWsSubprotocol(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function copyAddress(value: string): void {
    if (!value) {
      return;
    }

    void navigator.clipboard.writeText(value).catch(() => {
      setError("Clipboard write failed. Copy manually from the displayed address.");
    });
  }

  function clearLogReconnectTimer(): void {
    if (logReconnectTimerRef.current === null) {
      return;
    }
    window.clearTimeout(logReconnectTimerRef.current);
    logReconnectTimerRef.current = null;
  }

  function scheduleLogReconnect(serverId: string): void {
    if (logReconnectTimerRef.current !== null) {
      return;
    }

    logReconnectTimerRef.current = window.setTimeout(() => {
      logReconnectTimerRef.current = null;
      if (manualLogDisconnectRef.current) {
        return;
      }
      if (logStreamServerRef.current !== serverId) {
        return;
      }
      connectLogStream(serverId);
    }, 1800);
  }

  function disconnectLogStream(options?: { manual?: boolean }): void {
    const manual = options?.manual ?? true;
    manualLogDisconnectRef.current = manual;
    clearLogReconnectTimer();
    if (logSocketRef.current) {
      if (manual) {
        manuallyClosedSocketsRef.current.add(logSocketRef.current);
      }
      logSocketRef.current.close();
      logSocketRef.current = null;
    }
    if (manual) {
      setLogStreamState("disconnected");
    }
  }

  function connectLogStream(serverId: string): void {
    disconnectLogStream({ manual: true });
    manualLogDisconnectRef.current = false;
    logStreamServerRef.current = serverId;
    setLogStreamState("connecting");

    const wsBase = apiBase.replace("http://", "ws://").replace("https://", "wss://");
    const socket = new WebSocket(`${wsBase}/servers/${serverId}/log-stream`, [`ss-token.${encodeTokenForWsSubprotocol(token)}`]);
    logSocketRef.current = socket;

    socket.onopen = () => {
      setLogStreamState("live");
    };

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as { ts: string; line: string };
        setLogs((previous) => {
          const next = [...previous, parsed];
          return next.slice(-500);
        });
      } catch {
        // ignore malformed lines
      }
    };

    socket.onerror = () => {
      setLogStreamState("error");
    };

    socket.onclose = () => {
      const manuallyClosed = manuallyClosedSocketsRef.current.has(socket);
      if (manuallyClosed) {
        manuallyClosedSocketsRef.current.delete(socket);
      }
      if (logSocketRef.current === socket) {
        logSocketRef.current = null;
      }
      if (manualLogDisconnectRef.current || manuallyClosed) {
        setLogStreamState("disconnected");
        return;
      }
      setLogStreamState("disconnected");
      scheduleLogReconnect(serverId);
    };
  }

  async function connect(): Promise<void> {
    try {
      setClientAuth();
      const me = await api.current.get<{ user: { username: string; role?: UserRecord["role"] } }>("/me");
      setViewer({ username: me.user.username, role: me.user.role ?? null });
      setConnected(true);
      setError(null);
      await refreshAll();
      if (markTelemetryKey("ui.connect.success")) {
        void trackTelemetryEvent("ui.connect.success", {
          role: me.user.role ?? "unknown"
        });
      }
    } catch (e) {
      setConnected(false);
      setViewer(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function refreshAll(): Promise<void> {
    try {
      setBusy(true);
      const [serversRes, alertsRes, tasksRes, tunnelsRes, auditRes, statusRes, catalogRes, presetsRes, hardwareRes] = await Promise.all([
        api.current.get<{ servers: Server[] }>("/servers"),
        api.current.get<{ alerts: Alert[] }>("/alerts"),
        api.current.get<{ tasks: Task[] }>("/tasks"),
        api.current.get<{ tunnels: Tunnel[] }>("/tunnels"),
        api.current.get<{ logs: Audit[] }>("/audit"),
        api.current.get<{ servers: { total: number; running: number; crashed: number }; alerts: { open: number; total: number } }>("/system/status"),
        api.current.get<{ catalog: VersionCatalog }>("/setup/catalog"),
        api.current.get<{ presets: SetupPreset[] }>("/setup/presets"),
        api.current.get<HardwareProfile>("/system/hardware")
      ]);

      setServers(serversRes.servers);
      setAlerts(alertsRes.alerts);
      setTasks(tasksRes.tasks);
      setTunnels(tunnelsRes.tunnels);
      setAudit(auditRes.logs);
      setStatus(statusRes);
      setCatalog(catalogRes.catalog);
      setSetupPresets(presetsRes.presets.length > 0 ? presetsRes.presets : fallbackSetupPresets);
      setHardware(hardwareRes);

      const hasSelectedServer = selectedServerId ? serversRes.servers.some((server) => server.id === selectedServerId) : false;
      if ((!selectedServerId || !hasSelectedServer) && serversRes.servers.length > 0) {
        setSelectedServerId(serversRes.servers[0].id);
      }

      if (!createServer.mcVersion) {
        const v = catalogRes.catalog.paper[0]?.id ?? catalogRes.catalog.vanilla[0]?.id ?? "1.21.1";
        setCreateServer((prev) => ({ ...prev, mcVersion: v }));
      }

      if (!taskForm.serverId && serversRes.servers.length > 0) {
        setTaskForm((prev) => ({ ...prev, serverId: serversRes.servers[0].id }));
      }

      if (!tunnelForm.serverId && serversRes.servers.length > 0) {
        setTunnelForm((prev) => ({ ...prev, serverId: serversRes.servers[0].id, localPort: serversRes.servers[0].port }));
      }

      const activeServerId = hasSelectedServer ? selectedServerId : serversRes.servers[0]?.id;
      if (activeServerId) {
        await Promise.all([refreshPackages(activeServerId), refreshServerOperations(activeServerId)]);
      } else {
        setInstalledPackages([]);
        setPackageUpdates([]);
        setContentResults([]);
        setBackups([]);
        setBackupPolicy(null);
        setPreflight(null);
        setCrashReports([]);
        setQuickHostingStatus(null);
        setQuickHostingDiagnostics(null);
        setPerformanceAdvisor(null);
        setEditorFiles([]);
        setEditorFileSnapshots([]);
        setFilePath("server.properties");
        setFileContent("");
        setFileOriginal("");
        setServerPropertySnapshots([]);
      }

      await refreshAdminData();

      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function refreshLogs(serverId: string): Promise<void> {
    try {
      const response = await api.current.get<{ logs: Array<{ ts: string; line: string }> }>(`/servers/${serverId}/logs`);
      setLogs(response.logs);
    } catch {
      // ignore noisy log polling failures
    }
  }

  async function refreshPackages(serverId: string): Promise<void> {
    try {
      const [packagesRes, updatesRes] = await Promise.all([
        api.current.get<{ packages: InstalledPackage[] }>(`/servers/${serverId}/packages`),
        api.current.get<{ updates: PackageUpdate[] }>(`/servers/${serverId}/packages/updates`)
      ]);
      setInstalledPackages(packagesRes.packages);
      setPackageUpdates(updatesRes.updates);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function refreshServerOperations(serverId: string): Promise<void> {
    try {
      const [backupsRes, policyRes, preflightRes, crashRes, quickHostRes, quickHostDiagnosticsRes, performanceRes] = await Promise.all([
        api.current.get<{ backups: BackupRecord[] }>(`/servers/${serverId}/backups`),
        api.current.get<{ policy: BackupPolicy }>(`/servers/${serverId}/backup-policy`),
        api.current.get<{ report: PreflightReport }>(`/servers/${serverId}/preflight`),
        api.current.get<{ reports: CrashReport[] }>(`/servers/${serverId}/crash-reports`),
        api.current.get<QuickHostingStatus>(`/servers/${serverId}/public-hosting/status`),
        api.current.get<QuickHostingDiagnostics>(`/servers/${serverId}/public-hosting/diagnostics`),
        api.current.get<PerformanceAdvisorReport>(`/servers/${serverId}/performance/advisor?hours=24`)
      ]);

      setBackups(backupsRes.backups);
      setBackupPolicy(policyRes.policy);
      setPreflight(preflightRes.report);
      setCrashReports(crashRes.reports);
      setQuickHostingStatus(quickHostRes);
      setQuickHostingDiagnostics(quickHostDiagnosticsRes);
      setPerformanceAdvisor(performanceRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function refreshAdminData(): Promise<void> {
    try {
      const [usersRes, remoteRes, javaRes, funnelRes, trustRes] = await Promise.all([
        api.current.get<{ users: UserRecord[] }>("/users"),
        api.current.get<{ remote: RemoteState }>("/remote/status"),
        api.current.get<{ channels: JavaChannel[] }>("/system/java/channels"),
        api.current.get<TelemetryFunnel>("/telemetry/funnel?hours=168"),
        api.current.get<TrustReport>("/system/trust")
      ]);

      setUsers(usersRes.users);
      setRemoteState(remoteRes.remote);
      setJavaChannels(javaRes.channels);
      setFunnelMetrics(funnelRes);
      setTrustReport(trustRes);

      setRotateTokenForm((previous) => ({
        ...previous,
        userId: previous.userId || usersRes.users[0]?.id || ""
      }));

      setRemoteConfigForm({
        enabled: remoteRes.remote.enabled,
        requireToken: remoteRes.remote.requireToken,
        allowedOriginsCsv: remoteRes.remote.allowedOrigins.join(", ")
      });
    } catch {
      // non-owner users may not have access to these endpoints
      setFunnelMetrics(null);
      try {
        const trust = await api.current.get<TrustReport>("/system/trust");
        setTrustReport(trust);
      } catch {
        setTrustReport(null);
      }
    }
  }

  async function refreshTrustReport(): Promise<void> {
    try {
      const trust = await api.current.get<TrustReport>("/system/trust");
      setTrustReport(trust);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function searchContent(): Promise<void> {
    if (!selectedServerId || contentForm.query.trim().length === 0) {
      return;
    }

    try {
      setHasSearchedContent(true);
      const query = new URLSearchParams({
        provider: contentForm.provider,
        q: contentForm.query,
        serverId: selectedServerId,
        kind: contentForm.kind,
        limit: "20"
      });
      const response = await api.current.get<{ results: ContentSearchResult[] }>(`/content/search?${query.toString()}`);
      setContentResults(response.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function installPackage(provider: "modrinth" | "curseforge", projectId: string, kind: ContentSearchResult["kind"]): Promise<void> {
    if (!selectedServerId) {
      return;
    }

    try {
      await api.current.post(`/servers/${selectedServerId}/packages/install`, {
        provider,
        projectId,
        kind
      });
      await refreshPackages(selectedServerId);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function updatePackage(packageId: string): Promise<void> {
    if (!selectedServerId) {
      return;
    }

    try {
      await api.current.post(`/servers/${selectedServerId}/packages/${packageId}/update`);
      await refreshPackages(selectedServerId);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function uninstallPackage(packageId: string): Promise<void> {
    if (!selectedServerId) {
      return;
    }

    try {
      await api.current.delete(`/servers/${selectedServerId}/packages/${packageId}`);
      await refreshPackages(selectedServerId);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    if (!connected) {
      return;
    }

    const timer = setInterval(() => {
      void refreshAll();
      if (selectedServerId && !liveConsole) {
        void refreshLogs(selectedServerId);
      }
    }, 10000);

    return () => clearInterval(timer);
  }, [connected, selectedServerId, liveConsole]);

  useEffect(() => {
    void connect();
    // Initial out-of-box experience: attempt connection using default local settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!connected || !selectedServerId) {
      return;
    }

    if (!liveConsole) {
      void refreshLogs(selectedServerId);
    }
    void refreshPackages(selectedServerId);
    void refreshServerOperations(selectedServerId);
  }, [connected, selectedServerId, liveConsole]);

  useEffect(() => {
    if (!connected || !selectedServerId) {
      return;
    }

    void refreshEditorFiles(selectedServerId);
  }, [connected, selectedServerId]);

  useEffect(() => {
    if (!connected || !selectedServerId) {
      setServerPropertiesRaw("");
      setServerPropertiesForm(defaultServerProperties);
      setServerPropertiesIssues([]);
      setServerPropertySnapshots([]);
      setEditorFileSnapshots([]);
      return;
    }

    void loadServerPropertiesForm(selectedServerId);
    void refreshServerPropertySnapshots(selectedServerId);
  }, [connected, selectedServerId]);

  useEffect(() => {
    setHasSearchedContent(false);
    setContentResults([]);
  }, [selectedServerId]);

  useEffect(() => {
    if (!connected || !selectedServerId || !liveConsole) {
      logStreamServerRef.current = null;
      disconnectLogStream({ manual: true });
      return;
    }

    connectLogStream(selectedServerId);
    return () => disconnectLogStream({ manual: true });
  }, [connected, selectedServerId, liveConsole, apiBase, token]);

  useEffect(() => {
    const stored = window.localStorage.getItem("simpleservers.onboarding.dismissed");
    setOnboardingDismissed(stored === "1");
  }, []);

  useEffect(() => {
    const storedMode = window.localStorage.getItem("simpleservers.ui.mode");
    if (storedMode === "beginner" || storedMode === "advanced") {
      setExperienceMode(storedMode);
      setPowerMode(storedMode === "advanced");
    }

    const storedTheme = window.localStorage.getItem("simpleservers.ui.theme");
    if (storedTheme === "colorful" || storedTheme === "dark" || storedTheme === "light" || storedTheme === "system") {
      setThemePreference(storedTheme);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("simpleservers.ui.mode", experienceMode);
    const advancedMode = experienceMode === "advanced";
    setPowerMode(advancedMode);
    if (!advancedMode && activeView === "advanced") {
      setActiveView("overview");
    }
  }, [experienceMode, activeView]);

  useEffect(() => {
    window.localStorage.setItem("simpleservers.ui.theme", themePreference);

    const media = window.matchMedia("(prefers-color-scheme: light)");
    const applyTheme = (): void => {
      const resolvedTheme =
        themePreference === "system" ? (media.matches ? "light" : "dark") : themePreference;
      document.documentElement.setAttribute("data-theme", resolvedTheme);
      document.documentElement.style.colorScheme = resolvedTheme === "light" ? "light" : "dark";
    };

    applyTheme();
    if (themePreference !== "system") {
      return;
    }

    const listener = () => applyTheme();
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [themePreference]);

  useEffect(() => {
    if (!commandPaletteOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      commandPaletteInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [commandPaletteOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typingTarget =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen((previous) => !previous);
        return;
      }

      if (event.key === "/" && !typingTarget && !commandPaletteOpen) {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (event.key === "Escape" && commandPaletteOpen) {
        event.preventDefault();
        setCommandPaletteOpen(false);
        setCommandPaletteQuery("");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandPaletteOpen]);

  useEffect(() => {
    if (!selectedServerId || !quickHostingStatus?.publicAddress) {
      return;
    }
    const key = `hosting.public.ready:${selectedServerId}:${quickHostingStatus.publicAddress}`;
    if (!markTelemetryKey(key)) {
      return;
    }
    void trackTelemetryEvent("hosting.public.ready", {
      serverId: selectedServerId,
      publicAddress: quickHostingStatus.publicAddress
    });
  }, [selectedServerId, quickHostingStatus?.publicAddress]);

  useEffect(() => {
    const retrySeconds = quickHostingDiagnostics?.diagnostics?.retry.nextAttemptInSeconds ?? null;
    if (retrySeconds === null || retrySeconds < 0) {
      setQuickHostRetryCountdown(null);
      return;
    }

    setQuickHostRetryCountdown(retrySeconds);
    const timer = window.setInterval(() => {
      setQuickHostRetryCountdown((previous) => {
        if (previous === null) {
          return null;
        }
        return previous > 0 ? previous - 1 : 0;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [quickHostingDiagnostics?.diagnostics?.retry.nextAttemptAt, quickHostingDiagnostics?.diagnostics?.retry.nextAttemptInSeconds]);

  const versionOptions = useMemo(() => {
    return catalog[createServer.type].map((v) => v.id);
  }, [catalog, createServer.type]);

  useEffect(() => {
    const first = versionOptions[0];
    if (first && !versionOptions.includes(createServer.mcVersion)) {
      setCreateServer((prev) => ({ ...prev, mcVersion: first }));
    }
  }, [versionOptions]);

  const selectedServer = useMemo(() => {
    return servers.find((server) => server.id === selectedServerId) ?? null;
  }, [servers, selectedServerId]);

  const unresolvedAlerts = useMemo(() => {
    return alerts.filter((entry) => !entry.resolvedAt);
  }, [alerts]);

  const activePreset = useMemo(() => {
    return setupPresets.find((preset) => preset.id === createServer.preset) ?? fallbackSetupPresets.find((preset) => preset.id === createServer.preset) ?? fallbackSetupPresets[0];
  }, [setupPresets, createServer.preset]);

  const filteredServers = useMemo(() => {
    const query = serverSearch.trim().toLowerCase();
    if (!query) {
      return servers;
    }
    return servers.filter((server) => {
      return (
        server.name.toLowerCase().includes(query) ||
        server.type.toLowerCase().includes(query) ||
        server.mcVersion.toLowerCase().includes(query) ||
        String(server.port).includes(query)
      );
    });
  }, [servers, serverSearch]);

  useEffect(() => {
    setBulkSelectedServerIds((previous) => previous.filter((id) => servers.some((server) => server.id === id)));
  }, [servers]);

  const bulkSelectedSet = useMemo(() => new Set(bulkSelectedServerIds), [bulkSelectedServerIds]);

  const allFilteredServersSelected = useMemo(() => {
    if (filteredServers.length === 0) {
      return false;
    }
    return filteredServers.every((server) => bulkSelectedSet.has(server.id));
  }, [filteredServers, bulkSelectedSet]);

  const serverSelectorOptions = useMemo(() => {
    if (!selectedServerId) {
      return filteredServers;
    }
    if (filteredServers.some((server) => server.id === selectedServerId)) {
      return filteredServers;
    }
    const selected = servers.find((server) => server.id === selectedServerId);
    return selected ? [selected, ...filteredServers] : filteredServers;
  }, [filteredServers, selectedServerId, servers]);

  const filteredEditorFiles = useMemo(() => {
    const query = editorSearch.trim().toLowerCase();
    if (!query) {
      return editorFiles;
    }
    return editorFiles.filter((entry) => entry.path.toLowerCase().includes(query));
  }, [editorFiles, editorSearch]);

  const hasFileChanges = fileContent !== fileOriginal;

  const selectedServerStatus = normalizeStatus(selectedServer?.status);
  const selectedCanStart = canStartServer(selectedServerStatus);
  const selectedCanStop = canStopServer(selectedServerStatus);
  const isAdvancedExperience = experienceMode === "advanced";

  const launchChecklist = useMemo(() => {
    const hasServer = servers.length > 0;
    const running = isServerRunning(selectedServerStatus);
    const hasPublicAddress = Boolean(quickHostingStatus?.publicAddress);

    return [
      {
        id: "server",
        label: "Create your server",
        done: hasServer,
        detail: hasServer ? "A server environment exists." : "Use Instant Launch or Guided Setup to create one."
      },
      {
        id: "runtime",
        label: "Start the server runtime",
        done: running,
        detail: running ? "Server process is running." : "Start the selected server from Active Server controls."
      },
      {
        id: "public",
        label: "Resolve public tunnel address",
        done: hasPublicAddress,
        detail: hasPublicAddress
          ? `Public endpoint ready: ${quickHostingStatus?.publicAddress}`
          : "Enable quick hosting and wait for Playit to assign an endpoint."
      }
    ];
  }, [servers.length, selectedServerStatus, quickHostingStatus?.publicAddress]);

  const setupChecklist = useMemo(() => {
    return [
      {
        id: "preset",
        label: `Pick a preset (${activePreset.label})`,
        detail: activePreset.description
      },
      {
        id: "launch",
        label: "Launch with one click",
        detail: "Use Instant Launch for auto-create + auto-start."
      },
      {
        id: "share",
        label: "Share address with players",
        detail: createServer.quickPublicHosting
          ? "Quick hosting is enabled. Wait for the public endpoint to resolve."
          : "Quick hosting is disabled. Players can join over your local network unless you enable public hosting."
      }
    ];
  }, [activePreset.label, activePreset.description, createServer.quickPublicHosting]);

  const startupWizardSteps = useMemo(() => {
    const hasServer = servers.length > 0;
    const running = isServerRunning(selectedServerStatus);
    const hasPublicAddress = Boolean(quickHostingStatus?.publicAddress);
    return [
      {
        id: "create",
        title: "Create server",
        done: hasServer,
        detail: hasServer ? "Server created." : "Use Instant Launch to create a server."
      },
      {
        id: "start",
        title: "Start server",
        done: running,
        detail: running ? "Server is online." : "Start the selected server."
      },
      {
        id: "publish",
        title: "Publish address",
        done: hasPublicAddress,
        detail: hasPublicAddress ? "Public address is ready to share." : "Enable quick hosting and wait for endpoint assignment."
      }
    ];
  }, [servers.length, selectedServerStatus, quickHostingStatus?.publicAddress]);

  const logStreamBadge = useMemo(() => {
    if (!liveConsole) {
      return { label: "Off", tone: "neutral" as const };
    }
    if (logStreamState === "live") {
      return { label: "Live", tone: "ok" as const };
    }
    if (logStreamState === "connecting") {
      return { label: "Connecting", tone: "warn" as const };
    }
    if (logStreamState === "error") {
      return { label: "Error", tone: "error" as const };
    }
    return { label: "Disconnected", tone: "warn" as const };
  }, [liveConsole, logStreamState]);

  const quickTunnelStatus = normalizeStatus(quickHostingStatus?.tunnel?.status);
  const quickHostPending = Boolean(
    quickHostingStatus &&
      !quickHostingStatus.publicAddress &&
      (quickTunnelStatus === "starting" || quickTunnelStatus === "pending" || quickTunnelStatus === "idle")
  );

  const troubleshootingTips = useMemo(() => {
    const tips: string[] = [];
    if (quickHostPending) {
      tips.push("Tunnel is still provisioning. Keep the app open and refresh tunnel status if it takes more than a minute.");
    }
    if (selectedServerStatus === "crashed") {
      tips.push("Server crashed. Open Crash Reports in Manage to inspect the latest failure bundle.");
    }
    const criticalPreflightIssue = preflight?.issues.find((issue) => issue.severity === "critical");
    if (criticalPreflightIssue) {
      tips.push(`Preflight block: ${criticalPreflightIssue.message}`);
    }
    if (createServer.allowCracked) {
      tips.push("Non-premium mode is enabled. Use only with trusted players to avoid account spoofing risk.");
    }
    if (quickHostingDiagnostics?.diagnostics?.message) {
      tips.push(`Tunnel diagnostics: ${quickHostingDiagnostics.diagnostics.message}`);
    }
    return tips;
  }, [quickHostPending, selectedServerStatus, preflight, createServer.allowCracked, quickHostingDiagnostics?.diagnostics?.message]);

  const nextBestAction = useMemo(() => {
    if (servers.length === 0) {
      return {
        id: "create" as const,
        title: "Create your first server",
        detail: "Use Instant Launch to create + start + configure quick hosting in one guided step.",
        cta: "Instant Launch",
        tone: "tone-warn" as const
      };
    }

    if (!selectedServerId) {
      return {
        id: "select" as const,
        title: "Select an active server",
        detail: "Pick a server from the Active Server selector to unlock targeted actions.",
        cta: "Open Server Picker",
        tone: "tone-warn" as const
      };
    }

    if (!isServerRunning(selectedServerStatus)) {
      return {
        id: "start" as const,
        title: "Start the selected server",
        detail: "The runtime must be online before players can join.",
        cta: "Start Server",
        tone: "tone-warn" as const
      };
    }

    if (!quickHostingStatus?.publicAddress) {
      return {
        id: "go_live" as const,
        title: "Publish a shareable address",
        detail: "Run Go Live to start quick hosting checks and resolve the public endpoint.",
        cta: "Go Live",
        tone: "tone-warn" as const
      };
    }

    return {
      id: "copy_address" as const,
      title: "Share your public address",
      detail: `Address is ready: ${quickHostingStatus.publicAddress}`,
      cta: "Copy Address",
      tone: "tone-ok" as const
    };
  }, [servers.length, selectedServerId, selectedServerStatus, quickHostingStatus?.publicAddress]);

  function runNextBestAction(): void {
    if (nextBestAction.id === "create") {
      void quickStartNow();
      return;
    }
    if (nextBestAction.id === "select") {
      setActiveView("overview");
      return;
    }
    if (nextBestAction.id === "start" && selectedServerId) {
      void serverAction(selectedServerId, "start");
      return;
    }
    if (nextBestAction.id === "go_live") {
      void goLiveNow();
      return;
    }
    if (nextBestAction.id === "copy_address" && quickHostingStatus?.publicAddress) {
      copyAddress(quickHostingStatus.publicAddress);
    }
  }

  const commandPaletteActions = useMemo<CommandPaletteAction[]>(() => {
    const actions: CommandPaletteAction[] = [
      {
        id: "reconnect-api",
        label: connected ? "Reconnect API" : "Connect to API",
        detail: connected ? "Reconnect using current API base and token." : "Attempt API connection with current credentials.",
        keywords: ["connect", "reconnect", "api", "auth"],
        run: () => {
          void connect();
        }
      },
      {
        id: "view-overview",
        label: "Open Overview",
        detail: "Command center and hosting journey.",
        keywords: ["overview", "home", "dashboard"],
        run: () => setActiveView("overview")
      },
      {
        id: "view-setup",
        label: "Open Setup",
        detail: "Guided server creation and launch presets.",
        keywords: ["setup", "create", "launch"],
        run: () => setActiveView("setup")
      },
      {
        id: "view-manage",
        label: "Open Manage",
        detail: "Crash doctor, backups, and config management.",
        keywords: ["manage", "fix", "backup", "crash"],
        run: () => setActiveView("manage")
      },
      {
        id: "view-content",
        label: "Open Content",
        detail: "Install and update mods/plugins/modpacks.",
        keywords: ["content", "mods", "plugins", "packages"],
        run: () => setActiveView("content")
      },
      {
        id: "view-trust",
        label: "Open Trust Workspace",
        detail: "Review build signature and security controls.",
        keywords: ["trust", "security", "signature"],
        run: () => setActiveView("trust")
      },
      {
        id: "refresh-all",
        label: "Refresh Everything",
        detail: "Reload server, tunnel, and diagnostics state.",
        keywords: ["refresh", "reload", "sync"],
        disabled: !connected,
        run: () => {
          void refreshAll();
        }
      }
    ];

    if (isAdvancedExperience) {
      actions.push({
        id: "view-advanced",
        label: "Open Advanced",
        detail: "Raw file editor, tunnel controls, and admin settings.",
        keywords: ["advanced", "editor", "admin"],
        run: () => setActiveView("advanced")
      });
    } else {
      actions.push({
        id: "switch-advanced",
        label: "Switch to Advanced Mode",
        detail: "Show expert controls and deeper tooling.",
        keywords: ["advanced", "power", "expert"],
        run: () => setExperienceMode("advanced")
      });
    }

    if (!selectedServerId) {
      actions.push({
        id: "instant-launch",
        label: "Instant Launch Server",
        detail: "Create and start a server in one step.",
        keywords: ["create", "server", "launch"],
        disabled: !connected,
        run: () => {
          void quickStartNow();
        }
      });
      return actions;
    }

    actions.push(
      {
        id: "start-server",
        label: "Start Selected Server",
        detail: "Start Minecraft runtime for the active server.",
        keywords: ["start", "server", "runtime"],
        disabled: !connected,
        run: () => {
          void serverAction(selectedServerId, "start");
        }
      },
      {
        id: "stop-server",
        label: "Stop Selected Server",
        detail: "Gracefully stop runtime and tunnels.",
        keywords: ["stop", "server", "runtime"],
        disabled: !connected,
        run: () => {
          void serverAction(selectedServerId, "stop");
        }
      },
      {
        id: "restart-server",
        label: "Restart Selected Server",
        detail: "Restart runtime and reconnect tunnels.",
        keywords: ["restart", "server", "runtime"],
        disabled: !connected,
        run: () => {
          void serverAction(selectedServerId, "restart");
        }
      },
      {
        id: "go-live-server",
        label: "Go Live (Selected)",
        detail: "Run start + quick-host diagnostics in one flow.",
        keywords: ["go live", "publish", "public"],
        disabled: !connected,
        run: () => {
          void goLiveNow();
        }
      },
      {
        id: "backup-server",
        label: "Create Backup (Selected)",
        detail: "Create an on-demand safety snapshot.",
        keywords: ["backup", "snapshot", "restore"],
        disabled: !connected,
        run: () => {
          void createBackup(selectedServerId);
        }
      },
      {
        id: "crash-doctor",
        label: "Run Crash Doctor",
        detail: "Apply guided recovery actions automatically.",
        keywords: ["crash", "doctor", "repair", "fix"],
        disabled: !connected,
        run: () => {
          void runCrashDoctor();
        }
      }
    );

    if (quickHostingStatus?.publicAddress) {
      actions.push({
        id: "copy-public-address",
        label: "Copy Public Address",
        detail: quickHostingStatus.publicAddress,
        keywords: ["copy", "public", "address", "share"],
        run: () => copyAddress(quickHostingStatus.publicAddress ?? "")
      });
    }

    return actions;
  }, [
    connected,
    connect,
    createBackup,
    refreshAll,
    quickStartNow,
    goLiveNow,
    isAdvancedExperience,
    quickHostingStatus?.publicAddress,
    runCrashDoctor,
    selectedServerId,
    serverAction
  ]);

  const filteredCommandPaletteActions = useMemo(() => {
    const query = commandPaletteQuery.trim().toLowerCase();
    if (!query) {
      return commandPaletteActions;
    }
    return commandPaletteActions.filter((action) =>
      `${action.label} ${action.detail} ${action.keywords.join(" ")}`.toLowerCase().includes(query)
    );
  }, [commandPaletteActions, commandPaletteQuery]);

  const hasRepairablePreflightIssue = useMemo(() => {
    return Boolean(preflight?.issues.some((issue) => issue.code === "missing_eula" || issue.code === "missing_server_jar"));
  }, [preflight?.issues]);

  useEffect(() => {
    if (!connected || !selectedServerId || !quickHostPending) {
      return;
    }

    const timer = setInterval(() => {
      void refreshServerOperations(selectedServerId);
    }, 5000);

    return () => clearInterval(timer);
  }, [connected, selectedServerId, quickHostPending]);

  function applyPreset(preset: "custom" | "survival" | "modded" | "minigame"): void {
    setCreateServer((previous) => {
      if (preset === "survival") {
        return {
          ...previous,
          preset,
          type: "paper",
          minMemoryMb: 2048,
          maxMemoryMb: 4096,
          enableGeyser: true,
          enableFloodgate: true
        };
      }

      if (preset === "modded") {
        return {
          ...previous,
          preset,
          type: "fabric",
          minMemoryMb: 4096,
          maxMemoryMb: 8192,
          enableGeyser: false,
          enableFloodgate: false
        };
      }

      if (preset === "minigame") {
        return {
          ...previous,
          preset,
          type: "paper",
          minMemoryMb: 3072,
          maxMemoryMb: 6144,
          enableGeyser: false,
          enableFloodgate: false
        };
      }

      return {
        ...previous,
        preset
      };
    });
  }

  function applySetupRecipe(recipe: "crossplay" | "modded" | "nonPremium"): void {
    if (recipe === "crossplay") {
      setCreateServer((previous) => ({
        ...previous,
        preset: "survival",
        type: "paper",
        enableGeyser: true,
        enableFloodgate: true,
        quickPublicHosting: true
      }));
      setNotice("Applied Crossplay recipe (Paper + Geyser + Floodgate + quick hosting).");
      setError(null);
      return;
    }

    if (recipe === "modded") {
      applyPreset("modded");
      setNotice("Applied Modded recipe (Fabric preset).");
      setError(null);
      return;
    }

    setCreateServer((previous) => ({
      ...previous,
      allowCracked: true
    }));
    setNotice("Applied Non-premium recipe (online-mode disabled equivalent). Use only with trusted players.");
    setError(null);
  }

  async function createServerSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    try {
      const createResponse = await api.current.post<{ server: Server }>("/servers", {
        ...createServer,
        bedrockPort: createServer.enableGeyser ? createServer.bedrockPort : null
      });
      const createdServerId = createResponse.server?.id;
      if (createdServerId && createServer.quickPublicHosting) {
        await api.current.post(`/servers/${createdServerId}/public-hosting/quick-enable`, {});
      }
      if (createdServerId) {
        setSelectedServerId(createdServerId);
        if (markTelemetryKey(`server.create.success:${createdServerId}`)) {
          void trackTelemetryEvent("server.create.success", {
            serverId: createdServerId,
            preset: createServer.preset,
            flow: "guided_setup"
          });
        }
      }
      await refreshAll();
      setNotice("Server provisioned successfully.");
      setError(null);
    } catch (e) {
      setNotice(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function quickStartNow(): Promise<void> {
    setBusy(true);
    try {
      const response = await api.current.post<QuickStartResult>("/servers/quickstart", {
        name: createServer.name,
        preset: createServer.preset,
        publicHosting: createServer.quickPublicHosting,
        startServer: true,
        allowCracked: createServer.allowCracked
      });
      if (response.server?.id) {
        setSelectedServerId(response.server.id);
        await refreshServerOperations(response.server.id);
        if (markTelemetryKey(`server.create.success:${response.server.id}`)) {
          void trackTelemetryEvent("server.create.success", {
            serverId: response.server.id,
            preset: createServer.preset,
            flow: "instant_launch"
          });
        }
        if (response.started && markTelemetryKey(`server.start.success:${response.server.id}`)) {
          void trackTelemetryEvent("server.start.success", {
            serverId: response.server.id,
            flow: "instant_launch"
          });
        }
      }
      await refreshAll();

      const notices: string[] = [];
      if (response.started) {
        notices.push("Quick start completed and server is running.");
      } else if (response.blocked) {
        notices.push("Server created, but startup was blocked by preflight checks.");
      } else {
        notices.push("Server created, but it is not running yet.");
      }
      if (response.quickHosting.publicAddress) {
        notices.push(`Public address: ${response.quickHosting.publicAddress}`);
      }
      if (response.quickHosting.warning) {
        notices.push(`Quick hosting: ${response.quickHosting.warning}`);
      }
      if (response.warning) {
        notices.push(response.warning);
      }

      setNotice(notices.join(" "));
      setError(null);
    } catch (e) {
      setNotice(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function serverAction(serverId: string, action: "start" | "stop" | "restart"): Promise<void> {
    try {
      const result = await api.current.post<{ ok: boolean; blocked?: boolean; preflight?: PreflightReport }>(`/servers/${serverId}/${action}`);
      if (result.blocked) {
        setPreflight(result.preflight ?? null);
        setError("Start blocked by preflight checks. Resolve critical issues and retry.");
      }
      if ((action === "start" || action === "restart") && result.ok && !result.blocked && markTelemetryKey(`server.start.success:${serverId}`)) {
        void trackTelemetryEvent("server.start.success", {
          serverId,
          action
        });
      }
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function toggleBulkServerSelection(serverId: string): void {
    setBulkSelectedServerIds((previous) => {
      if (previous.includes(serverId)) {
        return previous.filter((id) => id !== serverId);
      }
      return [...previous, serverId];
    });
  }

  function toggleSelectAllFilteredServers(): void {
    if (filteredServers.length === 0) {
      return;
    }
    setBulkSelectedServerIds((previous) => {
      const previousSet = new Set(previous);
      if (filteredServers.every((server) => previousSet.has(server.id))) {
        return previous.filter((id) => !filteredServers.some((server) => server.id === id));
      }
      const nextSet = new Set(previous);
      for (const server of filteredServers) {
        nextSet.add(server.id);
      }
      return [...nextSet];
    });
  }

  async function runBulkServerAction(action: BulkServerAction): Promise<void> {
    if (bulkSelectedServerIds.length === 0) {
      setNotice("Select at least one server for bulk actions.");
      return;
    }

    try {
      setBulkActionInFlight(action);
      const response = await api.current.post<BulkServerActionResponse>("/servers/bulk-action", {
        action,
        serverIds: bulkSelectedServerIds
      });
      await refreshAll();

      const failedSummaries = response.results
        .filter((entry) => !entry.ok)
        .map((entry) => {
          const serverName = servers.find((server) => server.id === entry.serverId)?.name ?? entry.serverId;
          return `${serverName}: ${entry.message}`;
        });
      if (failedSummaries.length > 0) {
        setNotice(
          `Bulk ${action}: ${response.succeeded}/${response.total} succeeded. Issues: ${failedSummaries.slice(0, 3).join(" | ")}${
            failedSummaries.length > 3 ? " ..." : ""
          }`
        );
      } else {
        setNotice(`Bulk ${action}: ${response.succeeded}/${response.total} succeeded.`);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkActionInFlight(null);
    }
  }

  async function createBackup(serverId: string): Promise<void> {
    try {
      await api.current.post(`/servers/${serverId}/backups`);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function enableQuickHosting(): Promise<void> {
    if (!selectedServerId) {
      return;
    }

    try {
      await api.current.post(`/servers/${selectedServerId}/public-hosting/quick-enable`, {});
      await refreshServerOperations(selectedServerId);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function refreshEditorFileSnapshots(serverId: string, targetPath: string, limit = 12): Promise<void> {
    try {
      setLoadingEditorSnapshots(true);
      const query = new URLSearchParams({
        path: targetPath,
        limit: String(limit)
      });
      const response = await api.current.get<{ path: string; snapshots: EditorFileSnapshot[] }>(
        `/servers/${serverId}/editor/file/snapshots?${query.toString()}`
      );
      setEditorFileSnapshots(response.snapshots ?? []);
    } catch {
      setEditorFileSnapshots([]);
    } finally {
      setLoadingEditorSnapshots(false);
    }
  }

  async function loadEditorFile(serverId: string, targetPath: string): Promise<void> {
    try {
      setLoadingEditorFile(true);
      const query = new URLSearchParams({ path: targetPath });
      const response = await api.current.get<{ path: string; content: string }>(`/servers/${serverId}/editor/file?${query.toString()}`);
      setFileContent(response.content);
      setFileOriginal(response.content);
      setFilePath(response.path);
      if (response.path === "server.properties") {
        setServerPropertiesRaw(response.content);
        setServerPropertiesForm(deriveServerPropertiesForm(response.content));
      }
      await refreshEditorFileSnapshots(serverId, response.path);
      setError(null);
    } catch (e) {
      setEditorFileSnapshots([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingEditorFile(false);
    }
  }

  async function refreshEditorFiles(serverId: string): Promise<void> {
    try {
      const response = await api.current.get<{ files: EditableFileEntry[] }>(`/servers/${serverId}/editor/files`);
      setEditorFiles(response.files);

      if (response.files.length === 0) {
        setFileContent("");
        setFileOriginal("");
        setEditorFileSnapshots([]);
        return;
      }

      const hasCurrentPath = response.files.some((entry) => entry.path === filePath);
      const hasUnsavedChanges = fileContent !== fileOriginal;
      const nextPath = hasCurrentPath ? filePath : response.files[0].path;

      if (!nextPath) {
        return;
      }

      if (hasUnsavedChanges && hasCurrentPath) {
        return;
      }

      await loadEditorFile(serverId, nextPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function openEditorFile(targetPath: string): void {
    if (!selectedServerId) {
      return;
    }

    if (targetPath === filePath) {
      return;
    }

    if (fileContent !== fileOriginal) {
      const confirmed = window.confirm("Discard unsaved file changes and switch files?");
      if (!confirmed) {
        return;
      }
    }

    void loadEditorFile(selectedServerId, targetPath);
  }

  async function saveEditorFile(): Promise<void> {
    if (!selectedServerId) {
      return;
    }

    try {
      setSavingEditorFile(true);
      await api.current.put(`/servers/${selectedServerId}/editor/file`, { path: filePath, content: fileContent });
      setFileOriginal(fileContent);
      if (filePath === "server.properties") {
        setServerPropertiesRaw(fileContent);
        setServerPropertiesForm(deriveServerPropertiesForm(fileContent));
      }
      await refreshEditorFiles(selectedServerId);
      if (filePath === "server.properties") {
        await refreshServerPropertySnapshots(selectedServerId);
      }
      await refreshEditorFileSnapshots(selectedServerId, filePath);
      setNotice(`Saved ${filePath}.`);
      setError(null);
    } catch (e) {
      setNotice(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingEditorFile(false);
    }
  }

  async function restoreEditorFileSnapshot(snapshot: EditorFileSnapshot): Promise<void> {
    if (!selectedServerId) {
      return;
    }
    const confirmed = window.confirm(`Restore ${snapshot.path} from ${new Date(snapshot.createdAt).toLocaleString()}?`);
    if (!confirmed) {
      return;
    }

    try {
      setRestoringEditorSnapshotId(snapshot.id);
      await api.current.post(`/servers/${selectedServerId}/editor/file/rollback`, {
        path: snapshot.path,
        snapshotId: snapshot.id
      });
      await loadEditorFile(selectedServerId, snapshot.path);
      await refreshEditorFileSnapshots(selectedServerId, snapshot.path);
      if (snapshot.path === "server.properties") {
        await loadServerPropertiesForm(selectedServerId);
        await refreshServerPropertySnapshots(selectedServerId);
      }
      setNotice(`Restored ${snapshot.path} snapshot.`);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoringEditorSnapshotId(null);
    }
  }

  async function rollbackLatestEditorSnapshot(): Promise<void> {
    if (!selectedServerId) {
      return;
    }

    const latest = editorFileSnapshots[0];
    if (!latest) {
      setNotice(`No snapshots found yet for ${filePath}.`);
      return;
    }

    try {
      setRollingBackEditorSnapshot(true);
      await api.current.post(`/servers/${selectedServerId}/editor/file/rollback`, {
        path: latest.path,
        snapshotId: latest.id
      });
      await loadEditorFile(selectedServerId, latest.path);
      await refreshEditorFileSnapshots(selectedServerId, latest.path);
      if (latest.path === "server.properties") {
        await loadServerPropertiesForm(selectedServerId);
        await refreshServerPropertySnapshots(selectedServerId);
      }
      setNotice(`Rolled back ${latest.path} to the latest snapshot.`);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRollingBackEditorSnapshot(false);
    }
  }

  async function loadServerPropertiesForm(serverId: string): Promise<void> {
    try {
      setLoadingServerProperties(true);
      const query = new URLSearchParams({ path: "server.properties" });
      const response = await api.current.get<{ path: string; content: string }>(`/servers/${serverId}/editor/file?${query.toString()}`);
      const content = response.content ?? "";
      setServerPropertiesRaw(content);
      setServerPropertiesForm(deriveServerPropertiesForm(content));
      setServerPropertiesIssues([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingServerProperties(false);
    }
  }

  async function refreshServerPropertySnapshots(serverId: string): Promise<void> {
    try {
      const query = new URLSearchParams({
        path: "server.properties",
        limit: "20"
      });
      const response = await api.current.get<{ path: string; snapshots: ServerPropertiesSnapshot[] }>(
        `/servers/${serverId}/editor/file/snapshots?${query.toString()}`
      );
      setServerPropertySnapshots(response.snapshots ?? []);
    } catch {
      setServerPropertySnapshots([]);
    }
  }

  async function saveServerPropertiesForm(): Promise<void> {
    if (!selectedServerId) {
      return;
    }

    const issues = validateServerProperties(serverPropertiesForm);
    setServerPropertiesIssues(issues);
    if (issues.length > 0) {
      return;
    }

    const nextContent = applyServerPropertiesForm(serverPropertiesRaw, serverPropertiesForm);
    try {
      setSavingServerProperties(true);
      await api.current.put(`/servers/${selectedServerId}/editor/file`, {
        path: "server.properties",
        content: nextContent
      });

      setServerPropertiesRaw(nextContent);
      if (filePath === "server.properties") {
        setFileContent(nextContent);
        setFileOriginal(nextContent);
      }

      setNotice("Saved server.properties from the guided form.");
      setError(null);
      await refreshEditorFiles(selectedServerId);
      await refreshServerPropertySnapshots(selectedServerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingServerProperties(false);
    }
  }

  async function restoreServerPropertiesSnapshot(snapshot: ServerPropertiesSnapshot): Promise<void> {
    if (!selectedServerId) {
      return;
    }
    const confirmed = window.confirm("Restore this saved snapshot to server.properties?");
    if (!confirmed) {
      return;
    }

    try {
      setSavingServerProperties(true);
      await api.current.post(`/servers/${selectedServerId}/editor/file/rollback`, {
        path: "server.properties",
        snapshotId: snapshot.id
      });
      await loadServerPropertiesForm(selectedServerId);
      if (filePath === "server.properties") {
        const query = new URLSearchParams({ path: "server.properties" });
        const response = await api.current.get<{ path: string; content: string }>(`/servers/${selectedServerId}/editor/file?${query.toString()}`);
        setFileContent(response.content ?? "");
        setFileOriginal(response.content ?? "");
      }
      setNotice("Restored server.properties snapshot.");
      setError(null);
      await refreshEditorFiles(selectedServerId);
      await refreshServerPropertySnapshots(selectedServerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingServerProperties(false);
    }
  }

  async function rollbackLatestServerPropertiesSnapshot(): Promise<void> {
    if (!selectedServerId) {
      return;
    }
    const latest = serverPropertySnapshots[0];
    if (!latest) {
      setNotice("No server.properties snapshots found yet.");
      return;
    }

    try {
      setRollingBackConfig(true);
      await api.current.post(`/servers/${selectedServerId}/editor/file/rollback`, {
        path: "server.properties",
        snapshotId: latest.id
      });
      await loadServerPropertiesForm(selectedServerId);
      await refreshEditorFiles(selectedServerId);
      await refreshServerPropertySnapshots(selectedServerId);
      setNotice("Rolled back to the latest server.properties snapshot.");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRollingBackConfig(false);
    }
  }

  async function safeRestartServer(): Promise<void> {
    if (!selectedServerId) {
      return;
    }

    try {
      setSafeRestarting(true);
      const result = await api.current.post<{ ok: boolean; blocked?: boolean; preflight?: PreflightReport; error?: string }>(
        `/servers/${selectedServerId}/safe-restart`,
        {}
      );
      if (result.blocked) {
        setPreflight(result.preflight ?? null);
        setError("Safe restart blocked by critical preflight issues.");
      } else {
        setNotice("Safe restart completed.");
        setError(null);
      }
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSafeRestarting(false);
    }
  }

  async function goLiveNow(): Promise<void> {
    if (!selectedServerId) {
      setNotice("Create or select a server first.");
      return;
    }

    try {
      setBusy(true);
      const response = await api.current.post<GoLiveResult>(`/servers/${selectedServerId}/go-live`, {});
      if (response.blocked) {
        setPreflight(response.preflight ?? null);
        setError("Go Live was blocked by preflight checks. Open Fix to apply guided recovery.");
      } else {
        setNotice(
          response.publicHosting?.publicAddress
            ? `Server is live: ${response.publicHosting.publicAddress}`
            : response.warning ?? "Go Live started. Tunnel is still resolving."
        );
        setError(null);
      }
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function runNetworkFix(fixId: string): Promise<void> {
    if (!selectedServerId) {
      return;
    }

    try {
      setApplyingNetworkFix(fixId);
      if (fixId === "enable_quick_hosting") {
        await api.current.post(`/servers/${selectedServerId}/public-hosting/quick-enable`, {});
      } else if (fixId === "start_server") {
        await serverAction(selectedServerId, "start");
      } else if (fixId === "start_tunnel") {
        const tunnelId = quickHostingDiagnostics?.diagnostics?.tunnelId;
        if (tunnelId) {
          await api.current.post(`/tunnels/${tunnelId}/start`);
        }
      } else if (fixId === "refresh_diagnostics") {
        await refreshServerOperations(selectedServerId);
      } else if (fixId === "copy_playit_auth_steps") {
        copyAddress(
          "Run `playit` once to complete login, or set PLAYIT_SECRET / PLAYIT_SECRET_PATH so SimpleServers can sync your endpoint."
        );
        setNotice("Copied Playit auth steps to clipboard.");
      } else if (fixId === "restart_tunnel") {
        const tunnelId = quickHostingDiagnostics?.diagnostics?.tunnelId;
        if (tunnelId) {
          await api.current.post(`/tunnels/${tunnelId}/stop`);
          await api.current.post(`/tunnels/${tunnelId}/start`);
        }
      } else if (fixId === "go_live_recovery") {
        await api.current.post(`/servers/${selectedServerId}/go-live`, {});
      }

      await refreshServerOperations(selectedServerId);
      await refreshAll();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplyingNetworkFix(null);
    }
  }

  async function runCrashDoctor(): Promise<void> {
    if (!selectedServerId) {
      return;
    }

    try {
      setRunningCrashDoctor(true);
      const completed: string[] = [];

      if (hasRepairablePreflightIssue) {
        const repairResponse = await api.current.post<{ repaired: string[] }>(`/servers/${selectedServerId}/preflight/repair-core`, {});
        if (repairResponse.repaired.length > 0) {
          completed.push("repaired core files");
        }
      }

      const latestSnapshot = serverPropertySnapshots[0];
      if (latestSnapshot) {
        await api.current.post(`/servers/${selectedServerId}/editor/file/rollback`, {
          path: "server.properties",
          snapshotId: latestSnapshot.id
        });
        completed.push("rolled back config");
      }

      const restartResult = await api.current.post<{ blocked?: boolean; preflight?: PreflightReport }>(
        `/servers/${selectedServerId}/safe-restart`,
        {}
      );
      if (restartResult.blocked) {
        setPreflight(restartResult.preflight ?? null);
        throw new Error("Safe restart was blocked by preflight checks.");
      }

      completed.push("safe restart complete");
      await refreshAll();
      await refreshServerPropertySnapshots(selectedServerId);
      setNotice(`Crash Doctor: ${completed.join(", ")}.`);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunningCrashDoctor(false);
    }
  }

  async function repairCoreStartupFiles(): Promise<void> {
    if (!selectedServerId) {
      return;
    }

    try {
      setRepairingCore(true);
      const response = await api.current.post<{ repaired: string[]; preflight: PreflightReport }>(
        `/servers/${selectedServerId}/preflight/repair-core`,
        {}
      );
      setPreflight(response.preflight);
      if (response.repaired.length === 0) {
        setNotice("Core startup files were already present.");
      } else {
        setNotice(`Repaired startup files: ${response.repaired.join(", ")}.`);
      }
      setError(null);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRepairingCore(false);
    }
  }

  async function downloadSupportBundle(): Promise<void> {
    if (!selectedServerId) {
      return;
    }

    try {
      setDownloadingSupportBundle(true);
      const response = await fetch(`${apiBase}/servers/${selectedServerId}/support-bundle`, {
        headers: {
          "x-api-token": token
        }
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to create support bundle");
      }
      const payload = await response.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `simpleservers-support-${selectedServerId}-${Date.now()}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice("Support bundle downloaded.");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloadingSupportBundle(false);
    }
  }

  function dismissOnboarding(): void {
    setOnboardingDismissed(true);
    window.localStorage.setItem("simpleservers.onboarding.dismissed", "1");
  }

  function resetOnboarding(): void {
    setOnboardingDismissed(false);
    window.localStorage.removeItem("simpleservers.onboarding.dismissed");
  }

  async function deleteServer(server: Server): Promise<void> {
    const confirmed = window.confirm(
      `Delete "${server.name}"? This removes the server entry, files, and backup archives. This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    try {
      setDeletingServerId(server.id);
      if (selectedServerId === server.id) {
        setSelectedServerId(null);
      }

      const response = await api.current.delete<{ warnings?: string[] }>(
        `/servers/${server.id}?deleteFiles=true&deleteBackups=true`
      );
      await refreshAll();

      if ((response.warnings ?? []).length > 0) {
        setNotice(`Deleted ${server.name} with warnings: ${(response.warnings ?? []).join(" ")}`);
      } else {
        setNotice(`Deleted ${server.name}.`);
      }
      setError(null);
    } catch (e) {
      setNotice(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingServerId(null);
    }
  }

  async function createTaskSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    try {
      await api.current.post("/tasks", {
        serverId: taskForm.serverId,
        name: taskForm.name,
        cronExpr: taskForm.cronExpr,
        action: taskForm.action,
        payload: taskForm.action === "command" ? { command: taskForm.command } : {},
        enabled: true
      });
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleTask(task: Task): Promise<void> {
    try {
      await api.current.post(`/tasks/${task.id}/${task.enabled ? "disable" : "enable"}`);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function createTunnelSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    try {
      await api.current.post("/tunnels", {
        serverId: tunnelForm.serverId,
        provider: tunnelForm.provider,
        protocol: tunnelForm.protocol,
        localPort: tunnelForm.localPort,
        publicHost: tunnelForm.publicHost,
        publicPort: tunnelForm.publicPort,
        config:
          tunnelForm.provider !== "manual"
            ? {
                command: tunnelForm.playitCommand,
                args: tunnelForm.playitArgs.split(" ").map((v) => v.trim()).filter(Boolean)
              }
            : {}
      });
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function resolveAlert(alertId: string): Promise<void> {
    try {
      await api.current.post(`/alerts/${alertId}/resolve`);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function tunnelAction(tunnelId: string, action: "start" | "stop"): Promise<void> {
    try {
      await api.current.post(`/tunnels/${tunnelId}/${action}`);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function restoreBackup(backupId: string): Promise<void> {
    if (!selectedServerId) {
      return;
    }

    const confirmed = window.confirm("Restore this backup? Current server files will be replaced, and a safety snapshot will be created first.");
    if (!confirmed) {
      return;
    }

    try {
      const response = await api.current.post<{ ok: boolean; restore: { preRestoreBackupId: string } }>(
        `/servers/${selectedServerId}/backups/${backupId}/restore`
      );
      await refreshServerOperations(selectedServerId);
      await refreshAll();
      setNotice(`Restore complete. Safety snapshot created (${response.restore.preRestoreBackupId}).`);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveBackupPolicy(): Promise<void> {
    if (!selectedServerId || !backupPolicy) {
      return;
    }

    try {
      await api.current.put(`/servers/${selectedServerId}/backup-policy`, {
        maxBackups: backupPolicy.maxBackups,
        maxAgeDays: backupPolicy.maxAgeDays,
        pruneCron: backupPolicy.pruneCron,
        enabled: Boolean(backupPolicy.enabled)
      });
      await refreshServerOperations(selectedServerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function pruneBackupsNow(): Promise<void> {
    if (!selectedServerId) {
      return;
    }

    try {
      await api.current.post(`/servers/${selectedServerId}/backup-policy/prune-now`);
      await refreshServerOperations(selectedServerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function createUser(): Promise<void> {
    try {
      await api.current.post("/users", userForm);
      await refreshAdminData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function rotateToken(): Promise<void> {
    if (!rotateTokenForm.userId || !rotateTokenForm.newToken) {
      return;
    }

    try {
      await api.current.post(`/users/${rotateTokenForm.userId}/rotate-token`, { newToken: rotateTokenForm.newToken });
      setRotateTokenForm((previous) => ({ ...previous, newToken: "" }));
      await refreshAdminData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveRemoteConfig(): Promise<void> {
    try {
      const allowedOrigins = remoteConfigForm.allowedOriginsCsv
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      await api.current.put("/remote/config", {
        enabled: remoteConfigForm.enabled,
        requireToken: remoteConfigForm.requireToken,
        allowedOrigins
      });
      await refreshAdminData();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function viewCrashReport(reportId: string): Promise<void> {
    try {
      const raw = await api.current.get<unknown>(`/crash-reports/${reportId}`);
      const blob = new Blob([JSON.stringify(raw, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to Main Content
      </a>
      <header className="hero">
        <div>
          <h1>SimpleServers</h1>
          <p>Host Minecraft servers without getting buried in infrastructure settings.</p>
          <div className="hero-meta">
            <span className={`status-pill ${connected ? "tone-ok" : "tone-warn"}`}>{connected ? "Connected" : "Disconnected"}</span>
            {viewer ? (
              <span className="muted-note">
                Signed in as <strong>{viewer.username}</strong>
                {viewer.role ? ` (${viewer.role})` : ""}
              </span>
            ) : null}
          </div>
        </div>
        <form
          className="auth-box"
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
        >
          <label>
            API Base
            <input value={apiBase} onChange={(e) => setApiBase(e.target.value)} />
          </label>
          <label>
            API Token
            <input value={token} onChange={(e) => setToken(e.target.value)} type="password" />
          </label>
          <button type="submit">{connected ? "Reconnect" : "Connect"}</button>
        </form>
      </header>

      <section className="panel control-strip" id="main-content">
        <nav className="view-nav" aria-label="Workspace views">
          <button className={activeView === "overview" ? "active" : ""} onClick={() => setActiveView("overview")} type="button">
            Overview
          </button>
          <button className={activeView === "setup" ? "active" : ""} onClick={() => setActiveView("setup")} type="button">
            Setup
          </button>
          <button className={activeView === "manage" ? "active" : ""} onClick={() => setActiveView("manage")} type="button">
            Manage
          </button>
          <button className={activeView === "content" ? "active" : ""} onClick={() => setActiveView("content")} type="button">
            Content
          </button>
          <button className={activeView === "trust" ? "active" : ""} onClick={() => setActiveView("trust")} type="button">
            Trust
          </button>
          {isAdvancedExperience ? (
            <button className={activeView === "advanced" ? "active" : ""} onClick={() => setActiveView("advanced")} type="button">
              Advanced
            </button>
          ) : null}
        </nav>
        <div className="inline-actions">
          <label className="compact-field">
            Mode
            <select
              aria-label="Experience mode"
              value={experienceMode}
              onChange={(event) => setExperienceMode(event.target.value as ExperienceMode)}
            >
              <option value="beginner">Beginner</option>
              <option value="advanced">Advanced</option>
            </select>
          </label>
          <label className="compact-field">
            Theme
            <select
              aria-label="Theme preference"
              value={themePreference}
              onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
            >
              <option value="colorful">Colorful</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </label>
          <button type="button" onClick={() => void refreshAll()} disabled={!connected || busy}>
            {busy ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" onClick={() => setCommandPaletteOpen(true)} disabled={!connected}>
            Quick Actions
          </button>
          <span className="muted-note">Shortcut: Ctrl/Cmd + K</span>
        </div>
      </section>

      {error ? <div className="error-banner" role="alert">{error}</div> : null}
      {notice && !error ? <div className="notice-banner" aria-live="polite">{notice}</div> : null}

      <section className="panel context-strip">
        <div>
          <h2>Active Server</h2>
          <p className="muted-note">
            {selectedServer
              ? `${selectedServer.name} (${selectedServer.type} ${selectedServer.mcVersion})`
              : "No server selected yet. Create one from Setup or use Instant Launch."}
          </p>
          {selectedServer ? (
            <div className="context-meta">
              <span className={`status-pill tone-${statusTone(selectedServerStatus)}`}>{selectedServerStatus}</span>
              <span className="muted-note">
                Java port <code>{selectedServer.port}</code>
              </span>
              {quickHostingStatus?.publicAddress ? (
                <span className="muted-note">
                  Public <code>{quickHostingStatus.publicAddress}</code>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="inline-actions">
          <label className="compact-field">
            Search Servers
            <input value={serverSearch} onChange={(e) => setServerSearch(e.target.value)} placeholder="name, version, port..." />
          </label>
          <label className="compact-field">
            Server
            <select value={selectedServerId ?? ""} onChange={(e) => setSelectedServerId(e.target.value || null)} disabled={servers.length === 0}>
              {servers.length === 0 ? <option value="">No servers yet</option> : null}
              {serverSelectorOptions.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </select>
          </label>
          {selectedServerId ? (
            <>
              <button type="button" onClick={() => void serverAction(selectedServerId, "start")} disabled={!selectedCanStart}>
                Start
              </button>
              <button type="button" onClick={() => void serverAction(selectedServerId, "stop")} disabled={!selectedCanStop}>
                Stop
              </button>
              <button type="button" onClick={() => void serverAction(selectedServerId, "restart")} disabled={isServerTransitioning(selectedServerStatus)}>
                Restart
              </button>
              <button type="button" onClick={() => void createBackup(selectedServerId)}>
                Backup
              </button>
              {selectedServer ? (
                <button
                  type="button"
                  className="danger-btn"
                  onClick={() => void deleteServer(selectedServer)}
                  disabled={deletingServerId === selectedServer.id}
                >
                  {deletingServerId === selectedServer.id ? "Deleting..." : "Delete"}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      {activeView === "overview" ? (
        <>
          <section className="panel command-center">
            <h2>Command Center</h2>
            <p className="muted-note">
              Two actions for non-technical hosting: create a server, then go live with a shareable multiplayer address.
            </p>
            <div className="command-grid">
              <button
                type="button"
                className="primary-cta"
                onClick={() => {
                  if (servers.length === 0) {
                    void quickStartNow();
                    return;
                  }
                  setActiveView("setup");
                }}
                disabled={busy}
              >
                {busy ? "Working..." : servers.length === 0 ? "Create Server" : "Create Another Server"}
              </button>
              <button type="button" className="primary-cta secondary" onClick={() => void goLiveNow()} disabled={busy || !selectedServerId}>
                {busy ? "Working..." : "Go Live"}
              </button>
            </div>
            <p className="muted-note">
              {selectedServerId
                ? quickHostingStatus?.publicAddress
                  ? `Ready to share: ${quickHostingStatus.publicAddress}`
                  : "No public address yet. Use Go Live to start hosting + tunnel checks."
                : "Create a server first to unlock Go Live."}
            </p>
          </section>

          <section className="panel next-action-card">
            <h2>Next Best Action</h2>
            <p className="muted-note">{nextBestAction.title}</p>
            <p className="muted-note">{nextBestAction.detail}</p>
            <div className="inline-actions">
              <span className={`status-pill ${nextBestAction.tone}`}>
                {nextBestAction.id === "copy_address" ? "Ready" : "Recommended"}
              </span>
              <button type="button" onClick={runNextBestAction} disabled={busy}>
                {nextBestAction.cta}
              </button>
            </div>
          </section>

          <section className="goal-grid">
            <article className="panel goal-card">
              <h3>Start</h3>
              <p className="muted-note">Make sure the selected server runtime is online.</p>
              <span className={`status-pill ${isServerRunning(selectedServerStatus) ? "tone-ok" : "tone-warn"}`}>
                {isServerRunning(selectedServerStatus) ? "Running" : "Stopped"}
              </span>
              <div className="inline-actions">
                {selectedServerId ? (
                  <button type="button" onClick={() => void serverAction(selectedServerId, "start")} disabled={!selectedCanStart}>
                    Start Server
                  </button>
                ) : null}
                {selectedServerId ? (
                  <button type="button" onClick={() => void safeRestartServer()} disabled={safeRestarting}>
                    {safeRestarting ? "Restarting..." : "Safe Restart"}
                  </button>
                ) : null}
              </div>
            </article>

            <article className="panel goal-card">
              <h3>Share</h3>
              <p className="muted-note">Publish and copy a public endpoint your players can use.</p>
              <span className={`status-pill ${quickHostingStatus?.publicAddress ? "tone-ok" : "tone-warn"}`}>
                {quickHostingStatus?.publicAddress ? "Address Ready" : "Needs Tunnel"}
              </span>
              <div className="inline-actions">
                {selectedServerId ? (
                  <button type="button" onClick={() => void enableQuickHosting()}>
                    Enable Hosting
                  </button>
                ) : null}
                {quickHostingStatus?.publicAddress ? (
                  <button type="button" onClick={() => copyAddress(quickHostingStatus.publicAddress ?? "")}>
                    Copy Address
                  </button>
                ) : null}
              </div>
            </article>

            <article className="panel goal-card">
              <h3>Fix</h3>
              <p className="muted-note">Run guided recovery if startup or tunnel resolution fails.</p>
              <span className={`status-pill ${selectedServerStatus === "crashed" || unresolvedAlerts.length > 0 ? "tone-error" : "tone-ok"}`}>
                {selectedServerStatus === "crashed" || unresolvedAlerts.length > 0 ? "Needs Attention" : "Healthy"}
              </span>
              <div className="inline-actions">
                <button type="button" onClick={() => setActiveView("manage")}>
                  Open Crash Doctor
                </button>
                {selectedServerId ? (
                  <button type="button" onClick={() => void runCrashDoctor()} disabled={runningCrashDoctor}>
                    {runningCrashDoctor ? "Running..." : "Run Auto Fix"}
                  </button>
                ) : null}
              </div>
            </article>
          </section>

          <section className="panel network-health">
            <h2>Network Health</h2>
            <p className="muted-note">Live tunnel readiness with one-click fixes for dependency, auth, endpoint sync, and retries.</p>
            {quickHostingDiagnostics?.diagnostics ? (
              <>
                <ul className="list list-compact">
                  <li>
                    <div>
                      <strong>Dependency</strong>
                      <span>Command: <code>{quickHostingDiagnostics.diagnostics.command}</code></span>
                    </div>
                    <span className={`status-pill ${quickHostingDiagnostics.diagnostics.commandAvailable ? "tone-ok" : "tone-error"}`}>
                      {quickHostingDiagnostics.diagnostics.commandAvailable ? "Ready" : "Missing"}
                    </span>
                  </li>
                  <li>
                    <div>
                      <strong>Authentication</strong>
                      <span>
                        {quickHostingDiagnostics.diagnostics.authConfigured === null
                          ? "Not required for this provider."
                          : quickHostingDiagnostics.diagnostics.authConfigured
                          ? "Playit secret is configured."
                          : "Playit secret missing."}
                      </span>
                    </div>
                    <span
                      className={`status-pill ${
                        quickHostingDiagnostics.diagnostics.authConfigured === false ? "tone-warn" : "tone-ok"
                      }`}
                    >
                      {quickHostingDiagnostics.diagnostics.authConfigured === false ? "Needs Setup" : "Ready"}
                    </span>
                  </li>
                  <li>
                    <div>
                      <strong>Endpoint</strong>
                      <span>{quickHostingDiagnostics.diagnostics.endpoint ?? "Waiting for public endpoint assignment."}</span>
                    </div>
                    <span className={`status-pill ${quickHostingDiagnostics.diagnostics.endpointAssigned ? "tone-ok" : "tone-warn"}`}>
                      {quickHostingDiagnostics.diagnostics.endpointAssigned ? "Assigned" : "Pending"}
                    </span>
                  </li>
                  <li>
                    <div>
                      <strong>Retry Window</strong>
                      <span>
                        {quickHostRetryCountdown !== null
                          ? `Auto retry in ${quickHostRetryCountdown}s`
                          : quickHostingDiagnostics.diagnostics.retry.lastAttemptAt
                          ? `Last attempt ${new Date(quickHostingDiagnostics.diagnostics.retry.lastAttemptAt).toLocaleTimeString()}`
                          : "No retry scheduled"}
                      </span>
                    </div>
                    <span className={`status-pill ${quickHostRetryCountdown !== null ? "tone-warn" : "tone-neutral"}`}>
                      {quickHostRetryCountdown !== null ? "Waiting" : "Idle"}
                    </span>
                  </li>
                </ul>
                {quickHostingDiagnostics.diagnostics.message ? <p className="muted-note">{quickHostingDiagnostics.diagnostics.message}</p> : null}
                <div className="inline-actions">
                  {(quickHostingDiagnostics.fixes ?? []).map((fix) => (
                    <button
                      key={fix.id}
                      type="button"
                      onClick={() => void runNetworkFix(fix.id)}
                      disabled={applyingNetworkFix === fix.id}
                      title={fix.description}
                    >
                      {applyingNetworkFix === fix.id ? "Applying..." : fix.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted-note">Enable quick hosting to start network diagnostics.</p>
            )}
          </section>

          <section className="stats-grid">
            <article>
              <h3>Servers</h3>
              <strong>{status?.servers.total ?? 0}</strong>
              <span>{status?.servers.running ?? 0} running</span>
            </article>
            <article>
              <h3>Open Alerts</h3>
              <strong>{status?.alerts.open ?? 0}</strong>
              <span>{status?.alerts.total ?? 0} total</span>
            </article>
            <article>
              <h3>Crashes</h3>
              <strong>{status?.servers.crashed ?? 0}</strong>
              <span>require attention</span>
            </article>
          </section>

          {!onboardingDismissed ? (
            <section className="panel">
              <h2>Startup Wizard</h2>
              <p className="muted-note">For first-time hosting: follow these three steps and share your multiplayer address.</p>
              <ul className="list">
                {startupWizardSteps.map((step) => (
                  <li key={step.id}>
                    <div>
                      <strong>{step.title}</strong>
                      <span>{step.detail}</span>
                    </div>
                    <span className={`status-pill ${step.done ? "tone-ok" : "tone-warn"}`}>{step.done ? "Done" : "Pending"}</span>
                  </li>
                ))}
              </ul>
              <div className="inline-actions">
                {servers.length === 0 ? (
                  <button onClick={() => void quickStartNow()} disabled={busy} type="button">
                    {busy ? "Working..." : "Create Server"}
                  </button>
                ) : selectedServerId && !quickHostingStatus?.publicAddress ? (
                  <button onClick={() => void goLiveNow()} type="button" disabled={busy}>
                    {busy ? "Working..." : "Go Live"}
                  </button>
                ) : quickHostingStatus?.publicAddress ? (
                  <button onClick={() => copyAddress(quickHostingStatus.publicAddress ?? "")} type="button">
                    Copy Public Address
                  </button>
                ) : null}
                <button type="button" onClick={dismissOnboarding}>
                  Hide Wizard
                </button>
              </div>
            </section>
          ) : (
            <section className="panel">
              <h2>Startup Wizard</h2>
              <p className="muted-note">Wizard hidden. Re-enable if you want the beginner flow back.</p>
              <button type="button" onClick={resetOnboarding}>
                Show Wizard Again
              </button>
            </section>
          )}

          <section className="dual-grid">
            <article className="panel">
              <h2>Fast Launch</h2>
              <p className="muted-note">Best for first-time setup. This creates, starts, and publishes your server in one flow.</p>
              <p className="muted-note">Local-first behavior: your server stays online while this machine and app are running.</p>
              <div className="inline-actions">
                <button onClick={() => void quickStartNow()} disabled={busy} type="button">
                  {busy ? "Working..." : "Instant Launch (Recommended)"}
                </button>
                <button type="button" onClick={() => setActiveView("setup")}>
                  Open Guided Setup
                </button>
              </div>
              {hardware ? (
                <p className="muted-note">
                  Host profile: {hardware.cpuCores} cores, {Math.floor(hardware.totalMemoryMb / 1024)} GB RAM, recommended quick-start memory{" "}
                  {hardware.recommendations.quickStartMinMemoryMb}-{hardware.recommendations.quickStartMaxMemoryMb} MB.
                </p>
              ) : null}
              <div className="quick-host-status">
                <p className="muted-note">
                  Local: <code>{quickHostingStatus?.server.localAddress ?? "unknown"}</code>
                </p>
                <p className="muted-note">
                  Public: <code>{quickHostingStatus?.publicAddress ?? (quickHostPending ? "resolving..." : "not enabled yet")}</code>
                </p>
                {quickHostingStatus?.tunnel ? (
                  <p className="muted-note">
                    Tunnel: <code>{quickHostingStatus.tunnel.provider}</code> /{" "}
                    <span className={`status-pill tone-${statusTone(quickHostingStatus.tunnel.status)}`}>{normalizeStatus(quickHostingStatus.tunnel.status)}</span>
                  </p>
                ) : null}
                {quickHostPending ? (
                  <p className="muted-note">Public tunnel is still provisioning. Keep this page open or hit Refresh in a few seconds.</p>
                ) : null}
                {quickHostPending && quickHostRetryCountdown !== null ? (
                  <p className="muted-note">Auto-retry in {quickHostRetryCountdown}s.</p>
                ) : null}
                <div className="inline-actions">
                  {selectedServerId ? (
                    <button onClick={() => void goLiveNow()} type="button" disabled={busy}>
                      {busy ? "Working..." : "Go Live"}
                    </button>
                  ) : null}
                  {quickHostingStatus?.publicAddress ? (
                    <button onClick={() => copyAddress(quickHostingStatus.publicAddress ?? "")} type="button">
                      Copy Public Address
                    </button>
                  ) : null}
                </div>
              </div>
            </article>

            <article className="panel">
              <h2>Action Queue</h2>
              <ul className="tip-list">
                <li>1. Launch from `Setup` with a preset.</li>
                <li>2. Wait until tunnel status becomes running.</li>
                <li>3. Share the public address from the Overview card.</li>
              </ul>
              <ul className="list">
                {(quickHostingStatus?.steps ?? []).length > 0 ? (
                  (quickHostingStatus?.steps ?? []).map((step) => (
                    <li key={step}>
                      <div>
                        <strong>Hosting</strong>
                        <span>{step}</span>
                      </div>
                    </li>
                  ))
                ) : (
                  <li>
                    <div>
                      <strong>No pending setup tasks</strong>
                      <span>Everything required for hosting is complete.</span>
                    </div>
                  </li>
                )}
                {unresolvedAlerts.slice(0, 4).map((alert) => (
                  <li key={alert.id}>
                    <div>
                      <strong>{alert.severity.toUpperCase()}</strong>
                      <span>{alert.message}</span>
                    </div>
                    <button type="button" onClick={() => void resolveAlert(alert.id)}>
                      Resolve
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <section className="panel">
            <h2>Hosting Journey</h2>
            <p className="muted-note">Follow this flow to get from setup to a shareable multiplayer address with fewer dead ends.</p>
            <ul className="list">
              {launchChecklist.map((step) => (
                <li key={step.id}>
                  <div>
                    <strong>{step.label}</strong>
                    <span>{step.detail}</span>
                  </div>
                  <span className={`status-pill ${step.done ? "tone-ok" : "tone-warn"}`}>{step.done ? "Done" : "Pending"}</span>
                </li>
              ))}
            </ul>
          </section>

          {funnelMetrics ? (
            <section className="panel">
              <h2>Onboarding Funnel</h2>
              <p className="muted-note">Last {funnelMetrics.windowHours}h across {funnelMetrics.sessionsObserved} observed sessions.</p>
              <table>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Sessions</th>
                    <th>Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Connected</td>
                    <td>{funnelMetrics.stageTotals.connect}</td>
                    <td>-</td>
                  </tr>
                  <tr>
                    <td>Created Server</td>
                    <td>{funnelMetrics.stageTotals.create}</td>
                    <td>{funnelMetrics.conversion.createFromConnectPct}%</td>
                  </tr>
                  <tr>
                    <td>Started Server</td>
                    <td>{funnelMetrics.stageTotals.start}</td>
                    <td>{funnelMetrics.conversion.startFromCreatePct}%</td>
                  </tr>
                  <tr>
                    <td>Public Address Ready</td>
                    <td>{funnelMetrics.stageTotals.publicReady}</td>
                    <td>{funnelMetrics.conversion.publicReadyFromStartPct}%</td>
                  </tr>
                </tbody>
              </table>
            </section>
          ) : null}

          <section className="panel">
            <h2>Bulk Operations</h2>
            <p className="muted-note">
              Select multiple servers and run one action across all of them.
            </p>
            <div className="inline-actions">
              <span className="status-pill tone-neutral">{bulkSelectedServerIds.length} selected</span>
              <button type="button" onClick={toggleSelectAllFilteredServers} disabled={filteredServers.length === 0}>
                {allFilteredServersSelected ? "Clear Filtered Selection" : "Select Filtered"}
              </button>
              <button type="button" onClick={() => void runBulkServerAction("start")} disabled={bulkActionInFlight !== null}>
                {bulkActionInFlight === "start" ? "Starting..." : "Start Selected"}
              </button>
              <button type="button" onClick={() => void runBulkServerAction("stop")} disabled={bulkActionInFlight !== null}>
                {bulkActionInFlight === "stop" ? "Stopping..." : "Stop Selected"}
              </button>
              <button type="button" onClick={() => void runBulkServerAction("restart")} disabled={bulkActionInFlight !== null}>
                {bulkActionInFlight === "restart" ? "Restarting..." : "Restart Selected"}
              </button>
              <button type="button" onClick={() => void runBulkServerAction("backup")} disabled={bulkActionInFlight !== null}>
                {bulkActionInFlight === "backup" ? "Backing Up..." : "Backup Selected"}
              </button>
              <button type="button" onClick={() => void runBulkServerAction("goLive")} disabled={bulkActionInFlight !== null}>
                {bulkActionInFlight === "goLive" ? "Publishing..." : "Go Live Selected"}
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>Server Fleet</h2>
            <table>
              <thead>
                <tr>
                  <th>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={allFilteredServersSelected}
                        onChange={toggleSelectAllFilteredServers}
                        aria-label="Select filtered servers"
                      />
                    </label>
                  </th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Port</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredServers.map((server) => (
                  <tr key={server.id} className={server.id === selectedServerId ? "selected" : ""}>
                    <td>
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={bulkSelectedSet.has(server.id)}
                          onChange={() => toggleBulkServerSelection(server.id)}
                          aria-label={`Select ${server.name}`}
                        />
                      </label>
                    </td>
                    <td>
                      <button className="link-btn" onClick={() => setSelectedServerId(server.id)} type="button">
                        {server.name}
                      </button>
                    </td>
                    <td>{server.type}</td>
                    <td>{server.mcVersion}</td>
                    <td>
                      <span className={`status-pill tone-${statusTone(server.status)}`}>{normalizeStatus(server.status)}</span>
                    </td>
                    <td>{server.port}</td>
                    <td>
                      <div className="inline-actions">
                        <button onClick={() => void serverAction(server.id, "start")} type="button" disabled={!canStartServer(server.status)}>
                          Start
                        </button>
                        <button onClick={() => void serverAction(server.id, "stop")} type="button" disabled={!canStopServer(server.status)}>
                          Stop
                        </button>
                        <button
                          onClick={() => void serverAction(server.id, "restart")}
                          type="button"
                          disabled={isServerTransitioning(server.status)}
                        >
                          Restart
                        </button>
                        <button onClick={() => void createBackup(server.id)} type="button">
                          Backup
                        </button>
                        <button
                          className="danger-btn"
                          onClick={() => void deleteServer(server)}
                          type="button"
                          disabled={deletingServerId === server.id}
                        >
                          {deletingServerId === server.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {servers.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-table-note">No servers yet. Open `Setup` and run Instant Launch to create your first server.</div>
                    </td>
                  </tr>
                ) : filteredServers.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-table-note">No servers matched your search.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {activeView === "setup" ? (
        <>
          <section className="panel">
            <h2>Guided Server Setup</h2>
            <p className="muted-note">
              Pick a preset and launch in seconds. Advanced fields stay hidden until you switch to Advanced mode.
            </p>
            <div className="preset-grid">
              {setupPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`preset-card ${createServer.preset === preset.id ? "active" : ""}`}
                  onClick={() => applyPreset(preset.id)}
                >
                  <strong>{preset.label}</strong>
                  <p className="preset-card-description">{preset.description}</p>
                  <span className={`status-pill ${createServer.preset === preset.id ? "tone-ok" : "tone-neutral"}`}>
                    {createServer.preset === preset.id ? "Selected" : "Use Preset"}
                  </span>
                </button>
              ))}
            </div>
            <div className="inline-actions">
              <button onClick={() => void quickStartNow()} disabled={busy} type="button">
                {busy ? "Working..." : "Instant Launch (Recommended)"}
              </button>
              {!isAdvancedExperience ? (
                <button onClick={() => setExperienceMode("advanced")} type="button">
                  Switch to Advanced Mode
                </button>
              ) : null}
            </div>
            <ul className="list list-compact">
              {setupChecklist.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>{entry.label}</strong>
                    <span>{entry.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="setup-recipes">
              <h3>Popular Recipes</h3>
              <p className="muted-note">Based on common community hosting flows: quick start, crossplay, modded, and optional non-premium access.</p>
              <div className="inline-actions">
                <button type="button" onClick={() => applySetupRecipe("crossplay")}>
                  Apply Crossplay Recipe
                </button>
                <button type="button" onClick={() => applySetupRecipe("modded")}>
                  Apply Modded Recipe
                </button>
                <button type="button" onClick={() => applySetupRecipe("nonPremium")}>
                  Apply Non-premium Recipe
                </button>
              </div>
            </div>
            <form className="grid-form" onSubmit={(event) => void createServerSubmit(event)}>
              <label>
                Name
                <input value={createServer.name} onChange={(e) => setCreateServer((prev) => ({ ...prev, name: e.target.value }))} />
              </label>
              <label>
                Preset
                <select
                  value={createServer.preset}
                  onChange={(e) => applyPreset(e.target.value as "custom" | "survival" | "modded" | "minigame")}
                >
                  <option value="custom">Custom</option>
                  <option value="survival">Survival Starter</option>
                  <option value="modded">Modded Fabric</option>
                  <option value="minigame">Minigame Performance</option>
                </select>
              </label>
              <label>
                Type
                <select
                  value={createServer.type}
                  onChange={(e) =>
                    setCreateServer((prev) => ({
                      ...prev,
                      type: e.target.value as "vanilla" | "paper" | "fabric"
                    }))
                  }
                >
                  <option value="vanilla">Vanilla</option>
                  <option value="paper">Paper</option>
                  <option value="fabric">Fabric</option>
                </select>
              </label>
              <label>
                Minecraft Version
                <select
                  value={createServer.mcVersion}
                  onChange={(e) => setCreateServer((prev) => ({ ...prev, mcVersion: e.target.value }))}
                >
                  {versionOptions.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={createServer.quickPublicHosting}
                  onChange={(e) => setCreateServer((prev) => ({ ...prev, quickPublicHosting: e.target.checked }))}
                />
                Auto-enable quick public hosting
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={createServer.enableGeyser}
                  onChange={(e) => setCreateServer((prev) => ({ ...prev, enableGeyser: e.target.checked }))}
                />
                Install Geyser for crossplay
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={createServer.enableFloodgate}
                  onChange={(e) => setCreateServer((prev) => ({ ...prev, enableFloodgate: e.target.checked }))}
                />
                Install Floodgate bridge
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={createServer.allowCracked}
                  onChange={(e) => setCreateServer((prev) => ({ ...prev, allowCracked: e.target.checked }))}
                />
                Allow non-premium players
              </label>

              {powerMode ? (
                <>
                  <label>
                    Java Port
                    <input
                      type="number"
                      value={createServer.port}
                      onChange={(e) => setCreateServer((prev) => ({ ...prev, port: Number(e.target.value) }))}
                    />
                  </label>
                  <label>
                    Bedrock Port
                    <input
                      type="number"
                      value={createServer.bedrockPort}
                      onChange={(e) => setCreateServer((prev) => ({ ...prev, bedrockPort: Number(e.target.value) }))}
                    />
                  </label>
                  <label>
                    Min Memory (MB)
                    <input
                      type="number"
                      value={createServer.minMemoryMb}
                      onChange={(e) => setCreateServer((prev) => ({ ...prev, minMemoryMb: Number(e.target.value) }))}
                    />
                  </label>
                  <label>
                    Max Memory (MB)
                    <input
                      type="number"
                      value={createServer.maxMemoryMb}
                      onChange={(e) => setCreateServer((prev) => ({ ...prev, maxMemoryMb: Number(e.target.value) }))}
                    />
                  </label>
                </>
              ) : null}

              <button type="submit" disabled={busy}>
                {busy ? "Working..." : "Provision Server"}
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>Server Library</h2>
            <p className="muted-note">Create and run multiple servers. Use this list to quickly switch context or remove old environments.</p>
            <ul className="list">
              {filteredServers.map((server) => (
                <li key={server.id}>
                  <div>
                    <strong>{server.name}</strong>
                    <span>
                      {server.type} {server.mcVersion} on port {server.port}
                    </span>
                    <span className={`status-pill tone-${statusTone(server.status)}`}>{normalizeStatus(server.status)}</span>
                  </div>
                  <div className="inline-actions">
                    <button type="button" onClick={() => setSelectedServerId(server.id)}>
                      Open
                    </button>
                    <button
                      type="button"
                      className="danger-btn"
                      onClick={() => void deleteServer(server)}
                      disabled={deletingServerId === server.id}
                    >
                      {deletingServerId === server.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </li>
              ))}
              {servers.length === 0 ? (
                <li>
                  <div>
                    <strong>No servers yet</strong>
                    <span>Use Instant Launch above or the full setup form to create your first server.</span>
                  </div>
                </li>
              ) : filteredServers.length === 0 ? (
                <li>
                  <div>
                    <strong>No matches</strong>
                    <span>Adjust your server search to view and manage additional servers.</span>
                  </div>
                </li>
              ) : null}
            </ul>
          </section>

          <section className="panel">
            <h2>Quick Hosting</h2>
            {selectedServerId ? (
              <>
                <div className="inline-actions">
                  <button onClick={() => void goLiveNow()} type="button" disabled={busy}>
                    {busy ? "Working..." : "Go Live"}
                  </button>
                  {selectedServerId ? (
                    <button onClick={() => void refreshServerOperations(selectedServerId)} type="button">
                      Refresh Tunnel Status
                    </button>
                  ) : null}
                  {quickHostingStatus?.publicAddress ? (
                    <button onClick={() => copyAddress(quickHostingStatus.publicAddress ?? "")} type="button">
                      Copy Public Address
                    </button>
                  ) : null}
                  {quickHostingStatus?.server.localAddress ? (
                    <button onClick={() => copyAddress(quickHostingStatus.server.localAddress ?? "")} type="button">
                      Copy Local Address
                    </button>
                  ) : null}
                </div>
                <p className="muted-note">
                  Local: <code>{quickHostingStatus?.server.localAddress ?? "unknown"}</code>
                </p>
                <p className="muted-note">
                  Public: <code>{quickHostingStatus?.publicAddress ?? (quickHostPending ? "resolving..." : "not enabled yet")}</code>
                </p>
                {quickHostingStatus?.tunnel ? (
                  <p className="muted-note">
                    Tunnel: <code>{quickHostingStatus.tunnel.provider}</code> /{" "}
                    <span className={`status-pill tone-${statusTone(quickHostingStatus.tunnel.status)}`}>{normalizeStatus(quickHostingStatus.tunnel.status)}</span>
                  </p>
                ) : null}
                {quickHostPending ? (
                  <p className="muted-note">Tunnel is pending. It can take a short time for providers like Playit to assign a public endpoint.</p>
                ) : null}
                {quickHostingDiagnostics?.diagnostics ? (
                  <div className="diagnostics-box">
                    <h3>Tunnel Diagnostics</h3>
                    <ul className="list list-compact">
                      <li>
                        <div>
                          <strong>Dependency</strong>
                          <span>
                            Command <code>{quickHostingDiagnostics.diagnostics.command}</code>{" "}
                            {quickHostingDiagnostics.diagnostics.commandAvailable ? "is available." : "is missing."}
                          </span>
                        </div>
                        <span className={`status-pill ${quickHostingDiagnostics.diagnostics.commandAvailable ? "tone-ok" : "tone-error"}`}>
                          {quickHostingDiagnostics.diagnostics.commandAvailable ? "Ready" : "Missing"}
                        </span>
                      </li>
                      {quickHostingDiagnostics.diagnostics.authConfigured !== null ? (
                        <li>
                          <div>
                            <strong>Playit Auth</strong>
                            <span>{quickHostingDiagnostics.diagnostics.authConfigured ? "Agent secret found." : "Agent secret not configured yet."}</span>
                          </div>
                          <span className={`status-pill ${quickHostingDiagnostics.diagnostics.authConfigured ? "tone-ok" : "tone-warn"}`}>
                            {quickHostingDiagnostics.diagnostics.authConfigured ? "Ready" : "Pending"}
                          </span>
                        </li>
                      ) : null}
                      <li>
                        <div>
                          <strong>Endpoint</strong>
                          <span>
                            {quickHostingDiagnostics.diagnostics.endpointAssigned
                              ? quickHostingDiagnostics.diagnostics.endpoint
                              : "Waiting for tunnel endpoint assignment."}
                          </span>
                        </div>
                        <span className={`status-pill ${quickHostingDiagnostics.diagnostics.endpointAssigned ? "tone-ok" : "tone-warn"}`}>
                          {quickHostingDiagnostics.diagnostics.endpointAssigned ? "Assigned" : "Pending"}
                        </span>
                      </li>
                    </ul>
                    {quickHostingDiagnostics.diagnostics.message ? (
                      <p className="muted-note">{quickHostingDiagnostics.diagnostics.message}</p>
                    ) : null}
                    {(quickHostingDiagnostics.actions ?? []).length > 0 ? (
                      <ul className="tip-list">
                        {quickHostingDiagnostics.actions.map((action) => (
                          <li key={action}>{action}</li>
                        ))}
                      </ul>
                    ) : null}
                    {(quickHostingDiagnostics.fixes ?? []).length > 0 ? (
                      <div className="inline-actions">
                        {quickHostingDiagnostics.fixes.map((fix) => (
                          <button
                            key={fix.id}
                            type="button"
                            onClick={() => void runNetworkFix(fix.id)}
                            disabled={applyingNetworkFix === fix.id}
                            title={fix.description}
                          >
                            {applyingNetworkFix === fix.id ? "Applying..." : fix.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {quickHostPending && quickHostRetryCountdown !== null ? (
                      <p className="muted-note">Auto-retry in {quickHostRetryCountdown}s.</p>
                    ) : null}
                  </div>
                ) : null}
                <ul className="list">
                  {(quickHostingStatus?.steps ?? ["Enable quick hosting to publish your server without router setup."]).map((step) => (
                    <li key={step}>
                      <div>
                        <span>{step}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Select a server to enable one-click public hosting.</p>
            )}
          </section>
        </>
      ) : null}

      {activeView === "manage" ? (
        <>
          <section className="panel crash-doctor-panel">
            <h2>Crash Doctor</h2>
            <p className="muted-note">Guided recovery runbook with auto-actions for startup failures and broken tunnel sessions.</p>
            <ol className="runbook-list">
              <li>
                <strong>Repair core startup files</strong>
                <span>Regenerate missing `eula.txt` / bootstrap files when preflight is blocked.</span>
              </li>
              <li>
                <strong>Rollback latest config snapshot</strong>
                <span>Restore the previous `server.properties` state saved before edits.</span>
              </li>
              <li>
                <strong>Safe restart</strong>
                <span>Stop, run preflight, then start again with tunnel restart checks.</span>
              </li>
            </ol>
            <div className="inline-actions">
              {selectedServerId ? (
                <button type="button" onClick={() => void runCrashDoctor()} disabled={runningCrashDoctor}>
                  {runningCrashDoctor ? "Running..." : "Run Crash Doctor"}
                </button>
              ) : null}
              {selectedServerId && hasRepairablePreflightIssue ? (
                <button type="button" onClick={() => void repairCoreStartupFiles()} disabled={repairingCore}>
                  {repairingCore ? "Repairing..." : "Repair Core Files"}
                </button>
              ) : null}
              {selectedServerId ? (
                <button type="button" onClick={() => void rollbackLatestServerPropertiesSnapshot()} disabled={rollingBackConfig}>
                  {rollingBackConfig ? "Rolling Back..." : "Rollback Latest Config"}
                </button>
              ) : null}
              {selectedServerId ? (
                <button type="button" onClick={() => void safeRestartServer()} disabled={safeRestarting}>
                  {safeRestarting ? "Restarting..." : "Safe Restart"}
                </button>
              ) : null}
              {selectedServerId ? (
                <button type="button" onClick={() => void downloadSupportBundle()} disabled={downloadingSupportBundle}>
                  {downloadingSupportBundle ? "Preparing Bundle..." : "Export Support Bundle"}
                </button>
              ) : null}
            </div>
            <ul className="tip-list">
              {troubleshootingTips.length > 0 ? troubleshootingTips.map((tip) => <li key={tip}>{tip}</li>) : <li>No active issues detected.</li>}
            </ul>
          </section>

          <section className="panel">
            <h2>Performance Advisor</h2>
            <p className="muted-note">Per-server trends for memory pressure, tick lag signals, and startup-time drift.</p>
            {performanceAdvisor ? (
              <>
                <div className="stats-grid advisor-stats">
                  <article>
                    <h3>RAM</h3>
                    <strong>{performanceAdvisor.advisor.metrics.memory.peakMb} MB</strong>
                    <span>
                      avg {performanceAdvisor.advisor.metrics.memory.avgMb} MB / max {performanceAdvisor.advisor.metrics.memory.configuredMaxMb} MB
                    </span>
                  </article>
                  <article>
                    <h3>CPU</h3>
                    <strong>{performanceAdvisor.advisor.metrics.cpu.peakPercent}%</strong>
                    <span>avg {performanceAdvisor.advisor.metrics.cpu.avgPercent}%</span>
                  </article>
                  <article>
                    <h3>Tick Lag</h3>
                    <strong>{performanceAdvisor.advisor.tickLag.eventsInWindow}</strong>
                    <span>max {performanceAdvisor.advisor.tickLag.maxLagMs}ms in window</span>
                  </article>
                </div>
                <ul className="list list-compact">
                  <li>
                    <div>
                      <strong>Startup Trend</strong>
                      <span>
                        {performanceAdvisor.advisor.startup.latestDurationMs !== null
                          ? `latest ${(performanceAdvisor.advisor.startup.latestDurationMs / 1000).toFixed(1)}s`
                          : "no startup samples yet"}
                      </span>
                    </div>
                    <span className={`status-pill ${performanceAdvisor.advisor.startup.trend === "regressing" ? "tone-warn" : "tone-ok"}`}>
                      {performanceAdvisor.advisor.startup.trend}
                    </span>
                  </li>
                  <li>
                    <div>
                      <strong>Latest Sample</strong>
                      <span>
                        {performanceAdvisor.advisor.metrics.latest
                          ? `${new Date(performanceAdvisor.advisor.metrics.latest.sampledAt).toLocaleTimeString()} · ${performanceAdvisor.advisor.metrics.latest.memoryMb} MB · ${performanceAdvisor.advisor.metrics.latest.cpuPercent}% CPU`
                          : "No live metrics sample yet"}
                      </span>
                    </div>
                  </li>
                </ul>
                <h3>Advisor Hints</h3>
                <ul className="list">
                  {performanceAdvisor.advisor.hints.map((hint) => (
                    <li key={`${hint.title}-${hint.detail}`}>
                      <div>
                        <strong>{hint.title}</strong>
                        <span>{hint.detail}</span>
                      </div>
                      <span className={`status-pill ${hint.level === "critical" ? "tone-error" : hint.level === "warning" ? "tone-warn" : "tone-ok"}`}>
                        {hint.level}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted-note">No advisor data yet. Start this server and reopen Manage after a few minutes.</p>
            )}
          </section>

          <section className="dual-grid">
            <article className="panel">
              <h2>Console Logs</h2>
              <div className="inline-actions">
                <span className={`status-pill tone-${logStreamBadge.tone}`}>Stream {logStreamBadge.label}</span>
                <label className="toggle">
                  <input type="checkbox" checked={liveConsole} onChange={(e) => setLiveConsole(e.target.checked)} />
                  Live stream (WebSocket)
                </label>
                {selectedServerId ? (
                  <button onClick={() => void refreshLogs(selectedServerId)} type="button">
                    Refresh Snapshot
                  </button>
                ) : null}
              </div>
              <p className="muted-note">If the stream drops, the dashboard automatically retries the WebSocket connection.</p>
              <div className="log-box">
                {logs.map((line, index) => (
                  <div key={`${line.ts}-${index}`}>
                    <span>{new Date(line.ts).toLocaleTimeString()}</span> {line.line}
                  </div>
                ))}
              </div>
              <h3>Preflight Diagnostics</h3>
              <ul className="list">
                {(preflight?.issues ?? []).length === 0 ? (
                  <li>
                    <div>
                      <strong>No blocking issues</strong>
                      <span>Server is ready to start.</span>
                    </div>
                  </li>
                ) : (
                  (preflight?.issues ?? []).map((issue) => (
                    <li key={`${issue.code}-${issue.message}`}>
                      <div>
                        <strong>{issue.severity.toUpperCase()}</strong>
                        <span>{issue.message}</span>
                        <span>{issue.recommendation}</span>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </article>

            <article className="panel">
              <h2>Backups and Retention</h2>
              <p className="muted-note">Restore actions automatically create a safety snapshot before replacing files.</p>
              <div className="grid-form">
                <label>
                  Max Backups
                  <input
                    type="number"
                    value={backupPolicy?.maxBackups ?? 20}
                    onChange={(e) =>
                      setBackupPolicy((previous) =>
                        previous
                          ? {
                              ...previous,
                              maxBackups: Number(e.target.value)
                            }
                          : previous
                      )
                    }
                  />
                </label>
                <label>
                  Max Age (days)
                  <input
                    type="number"
                    value={backupPolicy?.maxAgeDays ?? 30}
                    onChange={(e) =>
                      setBackupPolicy((previous) =>
                        previous
                          ? {
                              ...previous,
                              maxAgeDays: Number(e.target.value)
                            }
                          : previous
                      )
                    }
                  />
                </label>
                <label>
                  Prune Cron
                  <input
                    value={backupPolicy?.pruneCron ?? "0 */6 * * *"}
                    onChange={(e) =>
                      setBackupPolicy((previous) =>
                        previous
                          ? {
                              ...previous,
                              pruneCron: e.target.value
                            }
                          : previous
                      )
                    }
                  />
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(backupPolicy?.enabled)}
                    onChange={(e) =>
                      setBackupPolicy((previous) =>
                        previous
                          ? {
                              ...previous,
                              enabled: e.target.checked ? 1 : 0
                            }
                          : previous
                      )
                    }
                  />
                  Retention enabled
                </label>
                <button onClick={() => void saveBackupPolicy()} type="button">
                  Save Policy
                </button>
                <button onClick={() => void pruneBackupsNow()} type="button">
                  Prune Now
                </button>
              </div>
              <ul className="list">
                {backups.map((backup) => (
                  <li key={backup.id}>
                    <div>
                      <strong>{new Date(backup.createdAt).toLocaleString()}</strong>
                      <span>{(backup.sizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                      <span>{backup.restoredAt ? `restored at ${new Date(backup.restoredAt).toLocaleString()}` : "not restored"}</span>
                    </div>
                    <button onClick={() => void restoreBackup(backup.id)} type="button">
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <section className="panel">
            <h2>Simple Config Editor</h2>
            <p className="muted-note">Edit common `server.properties` settings with guided controls. Raw file editing is still available in Advanced.</p>
            {selectedServerId ? (
              <>
                <div className="grid-form">
                  <label>
                    Server Name (MOTD)
                    <input
                      value={serverPropertiesForm.motd}
                      onChange={(event) => setServerPropertiesForm((previous) => ({ ...previous, motd: event.target.value }))}
                    />
                  </label>
                  <label>
                    Max Players
                    <input
                      type="number"
                      value={serverPropertiesForm.maxPlayers}
                      onChange={(event) =>
                        setServerPropertiesForm((previous) => ({
                          ...previous,
                          maxPlayers: Number(event.target.value)
                        }))
                      }
                    />
                  </label>
                  <label>
                    Difficulty
                    <select
                      value={serverPropertiesForm.difficulty}
                      onChange={(event) =>
                        setServerPropertiesForm((previous) => ({
                          ...previous,
                          difficulty: event.target.value as ServerPropertiesFormValues["difficulty"]
                        }))
                      }
                    >
                      <option value="peaceful">peaceful</option>
                      <option value="easy">easy</option>
                      <option value="normal">normal</option>
                      <option value="hard">hard</option>
                    </select>
                  </label>
                  <label>
                    Default Gamemode
                    <select
                      value={serverPropertiesForm.gameMode}
                      onChange={(event) =>
                        setServerPropertiesForm((previous) => ({
                          ...previous,
                          gameMode: event.target.value as ServerPropertiesFormValues["gameMode"]
                        }))
                      }
                    >
                      <option value="survival">survival</option>
                      <option value="creative">creative</option>
                      <option value="adventure">adventure</option>
                      <option value="spectator">spectator</option>
                    </select>
                  </label>
                  <label>
                    View Distance
                    <input
                      type="number"
                      value={serverPropertiesForm.viewDistance}
                      onChange={(event) =>
                        setServerPropertiesForm((previous) => ({
                          ...previous,
                          viewDistance: Number(event.target.value)
                        }))
                      }
                    />
                  </label>
                  <label>
                    Simulation Distance
                    <input
                      type="number"
                      value={serverPropertiesForm.simulationDistance}
                      onChange={(event) =>
                        setServerPropertiesForm((previous) => ({
                          ...previous,
                          simulationDistance: Number(event.target.value)
                        }))
                      }
                    />
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={serverPropertiesForm.onlineMode}
                      onChange={(event) =>
                        setServerPropertiesForm((previous) => ({
                          ...previous,
                          onlineMode: event.target.checked
                        }))
                      }
                    />
                    Require premium accounts (`online-mode`)
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={serverPropertiesForm.whitelist}
                      onChange={(event) =>
                        setServerPropertiesForm((previous) => ({
                          ...previous,
                          whitelist: event.target.checked
                        }))
                      }
                    />
                    Whitelist only
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={serverPropertiesForm.pvp}
                      onChange={(event) =>
                        setServerPropertiesForm((previous) => ({
                          ...previous,
                          pvp: event.target.checked
                        }))
                      }
                    />
                    Enable PVP combat
                  </label>
                </div>
                {serverPropertiesIssues.length > 0 ? (
                  <ul className="tip-list">
                    {serverPropertiesIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="inline-actions">
                  <button type="button" onClick={() => void saveServerPropertiesForm()} disabled={savingServerProperties || loadingServerProperties}>
                    {savingServerProperties ? "Saving..." : "Save server.properties"}
                  </button>
                  <button type="button" onClick={() => void loadServerPropertiesForm(selectedServerId)} disabled={loadingServerProperties}>
                    {loadingServerProperties ? "Loading..." : "Reload File"}
                  </button>
                </div>
                <h3>Saved Snapshots</h3>
                <ul className="list">
                  {serverPropertySnapshots.length === 0 ? (
                    <li>
                      <div>
                        <strong>No saved snapshots yet</strong>
                        <span>Every successful form save stores the previous file so you can roll back quickly.</span>
                      </div>
                    </li>
                  ) : (
                    serverPropertySnapshots.map((snapshot) => (
                      <li key={snapshot.id}>
                        <div>
                          <strong>{new Date(snapshot.createdAt).toLocaleString()}</strong>
                          <span>
                            {snapshot.reason === "before_rollback" ? "State captured before rollback" : "Previous server.properties state"}
                          </span>
                        </div>
                        <button type="button" onClick={() => void restoreServerPropertiesSnapshot(snapshot)} disabled={savingServerProperties}>
                          Restore Snapshot
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </>
            ) : (
              <p>Select a server to edit guided config settings.</p>
            )}
          </section>

          <section className="dual-grid">
            <article className="panel">
              <h2>Automation</h2>
              <form onSubmit={(event) => void createTaskSubmit(event)} className="grid-form">
                <label>
                  Server
                  <select value={taskForm.serverId} onChange={(e) => setTaskForm((prev) => ({ ...prev, serverId: e.target.value }))}>
                    {servers.map((server) => (
                      <option key={server.id} value={server.id}>
                        {server.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Name
                  <input value={taskForm.name} onChange={(e) => setTaskForm((prev) => ({ ...prev, name: e.target.value }))} />
                </label>
                <label>
                  Cron
                  <input value={taskForm.cronExpr} onChange={(e) => setTaskForm((prev) => ({ ...prev, cronExpr: e.target.value }))} />
                </label>
                <label>
                  Action
                  <select
                    value={taskForm.action}
                    onChange={(e) =>
                      setTaskForm((prev) => ({ ...prev, action: e.target.value as "restart" | "backup" | "command" }))
                    }
                  >
                    <option value="backup">backup</option>
                    <option value="restart">restart</option>
                    <option value="command">command</option>
                  </select>
                </label>
                {taskForm.action === "command" ? (
                  <label>
                    Command
                    <input value={taskForm.command} onChange={(e) => setTaskForm((prev) => ({ ...prev, command: e.target.value }))} />
                  </label>
                ) : null}
                <button type="submit">Create Task</button>
              </form>
              <ul className="list">
                {tasks.map((task) => (
                  <li key={task.id}>
                    <div>
                      <strong>{task.name}</strong>
                      <span>
                        {task.action} at <code>{task.cronExpr}</code>
                      </span>
                      <span>
                        Last: {task.lastStatus ?? "n/a"} {task.lastRunAt ? `(${new Date(task.lastRunAt).toLocaleString()})` : ""}
                      </span>
                    </div>
                    <button onClick={() => void toggleTask(task)} type="button">
                      {task.enabled ? "Disable" : "Enable"}
                    </button>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <h2>Crash Reports</h2>
              <div className="recovery-box">
                <h3>Crash Doctor Actions</h3>
                <p className="muted-note">Use this runbook when the server crashes or fails to start.</p>
                <div className="inline-actions">
                  {selectedServerId ? (
                    <button type="button" onClick={() => void runCrashDoctor()} disabled={runningCrashDoctor}>
                      {runningCrashDoctor ? "Running..." : "Run Auto Fix"}
                    </button>
                  ) : null}
                  {selectedServerId && hasRepairablePreflightIssue ? (
                    <button type="button" onClick={() => void repairCoreStartupFiles()} disabled={repairingCore}>
                      {repairingCore ? "Repairing..." : "Repair Missing Core Files"}
                    </button>
                  ) : null}
                  {selectedServerId ? (
                    <button type="button" onClick={() => void rollbackLatestServerPropertiesSnapshot()} disabled={rollingBackConfig}>
                      {rollingBackConfig ? "Rolling Back..." : "Rollback Config Snapshot"}
                    </button>
                  ) : null}
                  {selectedServerId ? (
                    <button type="button" onClick={() => void safeRestartServer()} disabled={safeRestarting}>
                      {safeRestarting ? "Restarting..." : "Safe Restart"}
                    </button>
                  ) : null}
                  {selectedServerId ? (
                    <button type="button" onClick={() => void downloadSupportBundle()} disabled={downloadingSupportBundle}>
                      {downloadingSupportBundle ? "Preparing Bundle..." : "Export Logs Bundle"}
                    </button>
                  ) : null}
                </div>
              </div>
              <ul className="list">
                {crashReports.length === 0 ? (
                  <li>
                    <div>
                      <strong>No crash reports</strong>
                      <span>Recent crash bundles will appear here.</span>
                    </div>
                  </li>
                ) : (
                  crashReports.map((report) => (
                    <li key={report.id}>
                      <div>
                        <strong>{new Date(report.createdAt).toLocaleString()}</strong>
                        <span>{report.reason}</span>
                        <span>exit code: {String(report.exitCode)}</span>
                      </div>
                      <button onClick={() => void viewCrashReport(report.id)} type="button">
                        View Bundle
                      </button>
                    </li>
                  ))
                )}
              </ul>
              <h3>Alerts</h3>
              <ul className="list">
                {alerts.map((alert) => (
                  <li key={alert.id}>
                    <div>
                      <strong>{alert.severity.toUpperCase()}</strong>
                      <span>{alert.kind}</span>
                      <span>{alert.message}</span>
                    </div>
                    {alert.resolvedAt ? (
                      <span className="resolved">resolved</span>
                    ) : (
                      <button onClick={() => void resolveAlert(alert.id)} type="button">
                        Resolve
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </>
      ) : null}

      {activeView === "content" ? (
        <section className="dual-grid">
          <article className="panel">
            <h2>Content Manager</h2>
            <form
              className="grid-form"
              onSubmit={(event) => {
                event.preventDefault();
                void searchContent();
              }}
            >
              <label>
                Server
                <select value={selectedServerId ?? ""} onChange={(e) => setSelectedServerId(e.target.value || null)}>
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Provider
                <select
                  value={contentForm.provider}
                  onChange={(e) => setContentForm((prev) => ({ ...prev, provider: e.target.value as "modrinth" | "curseforge" }))}
                >
                  <option value="modrinth">Modrinth</option>
                  <option value="curseforge">CurseForge</option>
                </select>
              </label>
              <label>
                Package Type
                <select
                  value={contentForm.kind}
                  onChange={(e) =>
                    setContentForm((prev) => ({
                      ...prev,
                      kind: e.target.value as "mod" | "plugin" | "modpack" | "resourcepack"
                    }))
                  }
                >
                  <option value="mod">mod</option>
                  <option value="plugin">plugin</option>
                  <option value="modpack">modpack</option>
                  <option value="resourcepack">resourcepack</option>
                </select>
              </label>
              <label>
                Query
                <input value={contentForm.query} onChange={(e) => setContentForm((prev) => ({ ...prev, query: e.target.value }))} />
              </label>
              <button type="submit">Search</button>
            </form>

            <ul className="list">
              {contentResults.map((result) => (
                <li key={`${result.provider}-${result.projectId}`}>
                  <div>
                    <strong>{result.name}</strong>
                    <span>{result.summary}</span>
                    <span>
                      {result.provider} / {result.kind} / {result.downloads.toLocaleString()} downloads
                    </span>
                    <span>{result.compatible ? "compatible" : "compatibility unknown"}</span>
                  </div>
                  <button onClick={() => void installPackage(result.provider, result.projectId, result.kind)} type="button">
                    Install
                  </button>
                </li>
              ))}
              {hasSearchedContent && contentResults.length === 0 ? (
                <li>
                  <div>
                    <strong>No results found</strong>
                    <span>Try a different keyword, switch provider, or use another package type.</span>
                  </div>
                </li>
              ) : null}
            </ul>
          </article>

          <article className="panel">
            <h2>Installed Packages</h2>
            <ul className="list">
              {installedPackages.map((pkg) => {
                const update = packageUpdates.find((entry) => entry.packageId === pkg.id);
                return (
                  <li key={pkg.id}>
                    <div>
                      <strong>
                        {pkg.provider}:{pkg.projectId}
                      </strong>
                      <span>
                        version {pkg.versionId} ({pkg.kind})
                      </span>
                      <span>
                        update: {update?.available ? `available -> ${update.latestVersionId}` : "up-to-date"}
                      </span>
                    </div>
                    <div className="inline-actions">
                      <button disabled={!update?.available} onClick={() => void updatePackage(pkg.id)} type="button">
                        Update
                      </button>
                      <button onClick={() => void uninstallPackage(pkg.id)} type="button">
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        </section>
      ) : null}

      {activeView === "trust" ? (
        <>
          <section className="panel">
            <h2>Security Transparency</h2>
            <p className="muted-note">
              Verify build trust signals, update provenance, and active security controls before exposing servers publicly.
            </p>
            <div className="inline-actions">
              <button type="button" onClick={() => void refreshTrustReport()} disabled={!connected}>
                Refresh Trust Report
              </button>
              {trustReport?.build.repository ? (
                <a href={trustReport.build.repository} target="_blank" rel="noreferrer">
                  Source Repository
                </a>
              ) : null}
            </div>
          </section>

          <section className="dual-grid">
            <article className="panel">
              <h2>Build Trust</h2>
              {trustReport ? (
                <ul className="list">
                  <li>
                    <div>
                      <strong>App Version</strong>
                      <span>{trustReport.build.appVersion}</span>
                      <span>
                        {trustReport.build.platform}/{trustReport.build.arch} · Node {trustReport.build.nodeVersion}
                      </span>
                    </div>
                  </li>
                  <li>
                    <div>
                      <strong>Signature Status</strong>
                      <span>{desktopBridge?.signatureStatus ?? trustReport.build.signatureStatus}</span>
                      <span>{trustReport.build.signatureProvider ?? "No signing provider metadata provided."}</span>
                    </div>
                    <span
                      className={`status-pill ${
                        (desktopBridge?.signatureStatus ?? trustReport.build.signatureStatus) === "signed" ? "tone-ok" : "tone-warn"
                      }`}
                    >
                      {(desktopBridge?.signatureStatus ?? trustReport.build.signatureStatus) === "signed" ? "Verified" : "Review"}
                    </span>
                  </li>
                  <li>
                    <div>
                      <strong>Release Channel</strong>
                      <span>{trustReport.build.releaseChannel}</span>
                    </div>
                  </li>
                  <li>
                    <div>
                      <strong>Desktop Context</strong>
                      <span>
                        {desktopBridge
                          ? `Desktop app ${desktopBridge.appVersion ?? "unknown"} on ${desktopBridge.platform ?? "unknown"}`
                          : "Browser mode (no desktop bridge metadata)."}
                      </span>
                    </div>
                  </li>
                </ul>
              ) : (
                <p className="muted-note">Trust report unavailable. Connect to the API and refresh.</p>
              )}
            </article>

            <article className="panel">
              <h2>Security Controls</h2>
              {trustReport ? (
                <ul className="list">
                  <li>
                    <div>
                      <strong>Access Model</strong>
                      <span>{trustReport.security.authModel}</span>
                      <span>{trustReport.security.localOnlyByDefault ? "Non-local access denied by default." : "Remote access is allowed by default."}</span>
                    </div>
                  </li>
                  <li>
                    <div>
                      <strong>Remote Control</strong>
                      <span>{trustReport.security.remoteControlEnabled ? "Enabled" : "Disabled"}</span>
                      <span>Token required: {trustReport.security.remoteTokenRequired ? "yes" : "no"}</span>
                    </div>
                    <span className={`status-pill ${trustReport.security.remoteControlEnabled ? "tone-warn" : "tone-ok"}`}>
                      {trustReport.security.remoteControlEnabled ? "Review" : "Safe Default"}
                    </span>
                  </li>
                  <li>
                    <div>
                      <strong>Configured Remote Token</strong>
                      <span>{trustReport.security.configuredRemoteToken ? "Configured" : "Missing"}</span>
                    </div>
                    <span className={`status-pill ${trustReport.security.configuredRemoteToken ? "tone-ok" : "tone-warn"}`}>
                      {trustReport.security.configuredRemoteToken ? "Ready" : "Action Needed"}
                    </span>
                  </li>
                  <li>
                    <div>
                      <strong>Allowed Origins</strong>
                      <span>{trustReport.security.allowedOrigins.length > 0 ? trustReport.security.allowedOrigins.join(", ") : "none configured"}</span>
                    </div>
                  </li>
                </ul>
              ) : (
                <p className="muted-note">Security controls unavailable.</p>
              )}
            </article>
          </section>

          <section className="panel">
            <h2>Verification Links</h2>
            {trustReport ? (
              <ul className="list">
                <li>
                  <div>
                    <strong>Checksums</strong>
                    <span>{trustReport.verification.checksumUrl ?? "No checksum URL published for this build."}</span>
                  </div>
                  {trustReport.verification.checksumUrl ? (
                    <a href={trustReport.verification.checksumUrl} target="_blank" rel="noreferrer">
                      Open Checksums
                    </a>
                  ) : null}
                </li>
                <li>
                  <div>
                    <strong>Attestation</strong>
                    <span>{trustReport.verification.attestationUrl ?? "No attestation URL published for this build."}</span>
                  </div>
                  {trustReport.verification.attestationUrl ? (
                    <a href={trustReport.verification.attestationUrl} target="_blank" rel="noreferrer">
                      Open Attestation
                    </a>
                  ) : null}
                </li>
              </ul>
            ) : (
              <p className="muted-note">No verification metadata available.</p>
            )}
          </section>
        </>
      ) : null}

      {activeView === "advanced" && isAdvancedExperience ? (
        <>
          <section className="panel">
            <h2>Advanced Workspace</h2>
            <p className="muted-note">
              Advanced mode keeps expert tools available while Beginner mode stays focused on simple goals.
            </p>
          </section>

          <details className="panel advanced-panel" open={powerMode}>
            <summary>File Editor</summary>
            {selectedServerId ? (
              <>
                <div className="file-editor-toolbar">
                  <label className="compact-field">
                    Search files
                    <input
                      value={editorSearch}
                      onChange={(event) => setEditorSearch(event.target.value)}
                      placeholder="server.properties, plugins/..."
                    />
                  </label>
                  <button type="button" onClick={() => void refreshEditorFiles(selectedServerId)}>
                    Refresh File Index
                  </button>
                </div>

                <div className="file-editor-grid">
                  <div className="file-list">
                    {filteredEditorFiles.map((entry) => (
                      <button
                        key={entry.path}
                        className={`file-list-item ${entry.path === filePath ? "active" : ""}`}
                        onClick={() => openEditorFile(entry.path)}
                        type="button"
                      >
                        <span>{entry.path}</span>
                        <small>{entry.exists ? `${Math.max(1, Math.round(entry.sizeBytes / 1024))} KB` : "new file"}</small>
                      </button>
                    ))}
                    {filteredEditorFiles.length === 0 ? (
                      <div className="muted-note">No editable text files found for this server.</div>
                    ) : null}
                  </div>

                  <div>
                    <p className="muted-note">
                      Editing <code>{filePath}</code>
                    </p>
                    <textarea value={fileContent} onChange={(e) => setFileContent(e.target.value)} rows={18} disabled={loadingEditorFile} />
                  </div>
                </div>
                <h3>Config Diff Preview</h3>
                <div className="diff-box">
                  {computeDiff(fileOriginal, fileContent).length === 0 ? (
                    <div>No pending changes</div>
                  ) : (
                    computeDiff(fileOriginal, fileContent).map((line, index) => (
                      <div key={`${line}-${index}`} className={line.startsWith("+") ? "diff-add" : "diff-remove"}>
                        {line}
                      </div>
                    ))
                  )}
                </div>
                <h3>File Snapshots</h3>
                <p className="muted-note">
                  Every save stores the previous file revision. Restore snapshots if a change breaks startup.
                </p>
                <div className="inline-actions">
                  <button
                    type="button"
                    onClick={() => void refreshEditorFileSnapshots(selectedServerId, filePath)}
                    disabled={loadingEditorSnapshots}
                  >
                    {loadingEditorSnapshots ? "Refreshing..." : "Refresh Snapshots"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void rollbackLatestEditorSnapshot()}
                    disabled={rollingBackEditorSnapshot || editorFileSnapshots.length === 0}
                  >
                    {rollingBackEditorSnapshot ? "Rolling Back..." : "Rollback Latest Snapshot"}
                  </button>
                </div>
                <ul className="list list-compact">
                  {editorFileSnapshots.slice(0, 8).map((snapshot) => (
                    <li key={snapshot.id}>
                      <div>
                        <strong>{new Date(snapshot.createdAt).toLocaleString()}</strong>
                        <span>
                          {snapshot.path} · {snapshot.reason === "before_rollback" ? "captured before rollback" : "captured before save"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void restoreEditorFileSnapshot(snapshot)}
                        disabled={restoringEditorSnapshotId === snapshot.id}
                      >
                        {restoringEditorSnapshotId === snapshot.id ? "Restoring..." : "Restore"}
                      </button>
                    </li>
                  ))}
                  {editorFileSnapshots.length === 0 ? (
                    <li>
                      <div>
                        <strong>No snapshots yet</strong>
                        <span>Save this file once to create rollback history.</span>
                      </div>
                    </li>
                  ) : null}
                </ul>
                <div className="inline-actions">
                  <button
                    onClick={() => {
                      setFileContent(fileOriginal);
                    }}
                    disabled={!hasFileChanges || loadingEditorFile}
                    type="button"
                  >
                    Revert Unsaved
                  </button>
                  <button onClick={() => void saveEditorFile()} disabled={!hasFileChanges || savingEditorFile || loadingEditorFile} type="button">
                    {savingEditorFile ? "Saving..." : `Save ${filePath}`}
                  </button>
                </div>
              </>
            ) : (
              <p>Select a server to edit config files.</p>
            )}
          </details>

          <details className="panel advanced-panel">
            <summary>Tunnels</summary>
            <form onSubmit={(event) => void createTunnelSubmit(event)} className="grid-form">
              <label>
                Server
                <select value={tunnelForm.serverId} onChange={(e) => setTunnelForm((prev) => ({ ...prev, serverId: e.target.value }))}>
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Provider
                <select
                  value={tunnelForm.provider}
                  onChange={(e) =>
                    setTunnelForm((prev) => ({ ...prev, provider: e.target.value as "manual" | "playit" | "cloudflared" | "ngrok" }))
                  }
                >
                  <option value="manual">manual</option>
                  <option value="playit">playit</option>
                  <option value="cloudflared">cloudflared</option>
                  <option value="ngrok">ngrok</option>
                </select>
              </label>
              <label>
                Public Host
                <input value={tunnelForm.publicHost} onChange={(e) => setTunnelForm((prev) => ({ ...prev, publicHost: e.target.value }))} />
              </label>
              <label>
                Public Port
                <input
                  type="number"
                  value={tunnelForm.publicPort}
                  onChange={(e) => setTunnelForm((prev) => ({ ...prev, publicPort: Number(e.target.value) }))}
                />
              </label>
              <label>
                Local Port
                <input
                  type="number"
                  value={tunnelForm.localPort}
                  onChange={(e) => setTunnelForm((prev) => ({ ...prev, localPort: Number(e.target.value) }))}
                />
              </label>
              {tunnelForm.provider !== "manual" ? (
                <>
                  <label>
                    Command
                    <input
                      value={tunnelForm.playitCommand}
                      onChange={(e) => setTunnelForm((prev) => ({ ...prev, playitCommand: e.target.value }))}
                    />
                  </label>
                  <label>
                    Args
                    <input
                      value={tunnelForm.playitArgs}
                      onChange={(e) => setTunnelForm((prev) => ({ ...prev, playitArgs: e.target.value }))}
                      placeholder="--secret my-secret"
                    />
                  </label>
                </>
              ) : null}
              <button type="submit">Create Tunnel</button>
            </form>
            <ul className="list">
              {tunnels.map((tunnel) => (
                <li key={tunnel.id}>
                  <div>
                    <strong>
                      {tunnel.publicHost}:{tunnel.publicPort}
                    </strong>
                    <span>
                      {tunnel.provider} {tunnel.protocol} {" -> "} {tunnel.localPort}
                    </span>
                    <span>Status: {tunnel.status}</span>
                  </div>
                  <div className="inline-actions">
                    <button onClick={() => void tunnelAction(tunnel.id, "start")} type="button">
                      Start
                    </button>
                    <button onClick={() => void tunnelAction(tunnel.id, "stop")} type="button">
                      Stop
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </details>

          <section className="dual-grid">
            <article className="panel">
              <h2>Users and Token Rotation</h2>
              <form
                className="grid-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createUser();
                }}
              >
                <label>
                  Username
                  <input value={userForm.username} onChange={(e) => setUserForm((previous) => ({ ...previous, username: e.target.value }))} />
                </label>
                <label>
                  Role
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm((previous) => ({ ...previous, role: e.target.value as UserRecord["role"] }))}
                  >
                    <option value="owner">owner</option>
                    <option value="admin">admin</option>
                    <option value="moderator">moderator</option>
                    <option value="viewer">viewer</option>
                  </select>
                </label>
                <label>
                  API Token
                  <input value={userForm.apiToken} onChange={(e) => setUserForm((previous) => ({ ...previous, apiToken: e.target.value }))} />
                </label>
                <button type="submit">Create User</button>
              </form>

              <form
                className="grid-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void rotateToken();
                }}
              >
                <label>
                  Rotate User
                  <select
                    value={rotateTokenForm.userId}
                    onChange={(e) => setRotateTokenForm((previous) => ({ ...previous, userId: e.target.value }))}
                  >
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.username}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  New Token
                  <input
                    value={rotateTokenForm.newToken}
                    onChange={(e) => setRotateTokenForm((previous) => ({ ...previous, newToken: e.target.value }))}
                  />
                </label>
                <button type="submit">Rotate Token</button>
              </form>

              <ul className="list">
                {users.map((user) => (
                  <li key={user.id}>
                    <div>
                      <strong>{user.username}</strong>
                      <span>{user.role}</span>
                      <span>created {new Date(user.createdAt).toLocaleString()}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <h2>Remote Control and Java Channels</h2>
              <form
                className="grid-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveRemoteConfig();
                }}
              >
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={remoteConfigForm.enabled}
                    onChange={(e) => setRemoteConfigForm((previous) => ({ ...previous, enabled: e.target.checked }))}
                  />
                  Enable remote control mode
                </label>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={remoteConfigForm.requireToken}
                    onChange={(e) => setRemoteConfigForm((previous) => ({ ...previous, requireToken: e.target.checked }))}
                  />
                  Require remote token
                </label>
                <label>
                  Allowed Origins (CSV)
                  <input
                    value={remoteConfigForm.allowedOriginsCsv}
                    onChange={(e) => setRemoteConfigForm((previous) => ({ ...previous, allowedOriginsCsv: e.target.value }))}
                  />
                </label>
                <button type="submit">Save Remote Policy</button>
              </form>

              {remoteState ? (
                <p className="muted-note">
                  Remote status: {remoteState.enabled ? "enabled" : "disabled"}; token configured:{" "}
                  {remoteState.configuredToken ? "yes" : "no"}
                </p>
              ) : null}

              <ul className="list">
                {javaChannels.map((channel) => (
                  <li key={channel.major}>
                    <div>
                      <strong>Java {channel.major}</strong>
                      <span>{channel.lts ? "LTS channel" : "non-LTS"}</span>
                      <span>{channel.recommendedFor}</span>
                    </div>
                    <a href={channel.adoptiumApi} target="_blank" rel="noreferrer">
                      Channel API
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <section className="panel">
            <h2>Audit Trail</h2>
            <div className="audit-list">
              {audit.map((entry) => (
                <div key={entry.id}>
                  <strong>{entry.actor}</strong> {entry.action} <code>{entry.targetType}</code> <code>{entry.targetId}</code>
                  <span>{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {commandPaletteOpen ? (
        <div
          className="command-palette-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setCommandPaletteOpen(false);
              setCommandPaletteQuery("");
            }
          }}
        >
          <section className="command-palette" role="dialog" aria-modal="true" aria-label="Quick actions">
            <div className="command-palette-header">
              <h2>Quick Actions</h2>
              <button
                type="button"
                onClick={() => {
                  setCommandPaletteOpen(false);
                  setCommandPaletteQuery("");
                }}
              >
                Close
              </button>
            </div>
            <input
              ref={commandPaletteInputRef}
              value={commandPaletteQuery}
              onChange={(event) => setCommandPaletteQuery(event.target.value)}
              placeholder="Search actions, views, and recovery tools..."
              aria-label="Search quick actions"
            />
            <ul className="command-palette-list">
              {filteredCommandPaletteActions.map((action) => (
                <li key={action.id}>
                  <button
                    type="button"
                    disabled={action.disabled}
                    onClick={() => {
                      if (action.disabled) {
                        return;
                      }
                      setCommandPaletteOpen(false);
                      setCommandPaletteQuery("");
                      action.run();
                    }}
                  >
                    <strong>{action.label}</strong>
                    <span>{action.detail}</span>
                    {action.disabled ? <span>Unavailable until API connection succeeds.</span> : null}
                  </button>
                </li>
              ))}
              {filteredCommandPaletteActions.length === 0 ? (
                <li>
                  <div className="muted-note">No actions matched your search.</div>
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      ) : null}
    </div>
  );
}
