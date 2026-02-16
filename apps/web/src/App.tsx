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

type VersionCatalog = {
  vanilla: Array<{ id: string; stable: boolean }>;
  paper: Array<{ id: string; stable: boolean }>;
  fabric: Array<{ id: string; stable: boolean }>;
};

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

type AppView = "overview" | "setup" | "manage" | "content" | "advanced";

type ViewerIdentity = {
  username: string;
  role: UserRecord["role"] | null;
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

function resolveDefaultApiBase(): string {
  const fallback = "http://127.0.0.1:4010";
  const queryValue = new URLSearchParams(window.location.search).get("apiBase");
  if (queryValue && isHttpUrl(queryValue)) {
    return queryValue;
  }

  const bridgeValue = (
    window as Window & {
      simpleServers?: {
        apiBase?: string;
      };
    }
  ).simpleServers?.apiBase;

  if (bridgeValue && isHttpUrl(bridgeValue)) {
    return bridgeValue;
  }

  return fallback;
}

const defaultApiBase = resolveDefaultApiBase();

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
  const [remoteState, setRemoteState] = useState<RemoteState | null>(null);
  const [javaChannels, setJavaChannels] = useState<JavaChannel[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [status, setStatus] = useState<{ servers: { total: number; running: number; crashed: number }; alerts: { open: number; total: number } } | null>(null);
  const [catalog, setCatalog] = useState<VersionCatalog>({ vanilla: [], paper: [], fabric: [] });
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);

  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ ts: string; line: string }>>([]);
  const [liveConsole, setLiveConsole] = useState(true);

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
  const [editorFiles, setEditorFiles] = useState<EditableFileEntry[]>([]);
  const [editorSearch, setEditorSearch] = useState("");
  const [loadingEditorFile, setLoadingEditorFile] = useState(false);
  const [savingEditorFile, setSavingEditorFile] = useState(false);
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
  const [powerMode, setPowerMode] = useState(false);
  const [viewer, setViewer] = useState<ViewerIdentity | null>(null);
  const [hasSearchedContent, setHasSearchedContent] = useState(false);

  const api = useRef(new ApiClient(defaultApiBase, token));
  const logSocketRef = useRef<WebSocket | null>(null);

  function setClientAuth(): void {
    api.current.setAuth(apiBase, token);
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

  function disconnectLogStream(): void {
    if (logSocketRef.current) {
      logSocketRef.current.close();
      logSocketRef.current = null;
    }
  }

  function connectLogStream(serverId: string): void {
    disconnectLogStream();

    const wsBase = apiBase.replace("http://", "ws://").replace("https://", "wss://");
    const socket = new WebSocket(`${wsBase}/servers/${serverId}/log-stream`, [`ss-token.${encodeTokenForWsSubprotocol(token)}`]);
    logSocketRef.current = socket;

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
      // fallback path remains periodic polling
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
    } catch (e) {
      setConnected(false);
      setViewer(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function refreshAll(): Promise<void> {
    try {
      setBusy(true);
      const [serversRes, alertsRes, tasksRes, tunnelsRes, auditRes, statusRes, catalogRes, hardwareRes] = await Promise.all([
        api.current.get<{ servers: Server[] }>("/servers"),
        api.current.get<{ alerts: Alert[] }>("/alerts"),
        api.current.get<{ tasks: Task[] }>("/tasks"),
        api.current.get<{ tunnels: Tunnel[] }>("/tunnels"),
        api.current.get<{ logs: Audit[] }>("/audit"),
        api.current.get<{ servers: { total: number; running: number; crashed: number }; alerts: { open: number; total: number } }>("/system/status"),
        api.current.get<{ catalog: VersionCatalog }>("/setup/catalog"),
        api.current.get<HardwareProfile>("/system/hardware")
      ]);

      setServers(serversRes.servers);
      setAlerts(alertsRes.alerts);
      setTasks(tasksRes.tasks);
      setTunnels(tunnelsRes.tunnels);
      setAudit(auditRes.logs);
      setStatus(statusRes);
      setCatalog(catalogRes.catalog);
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
        setEditorFiles([]);
        setFilePath("server.properties");
        setFileContent("");
        setFileOriginal("");
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
      const [backupsRes, policyRes, preflightRes, crashRes, quickHostRes] = await Promise.all([
        api.current.get<{ backups: BackupRecord[] }>(`/servers/${serverId}/backups`),
        api.current.get<{ policy: BackupPolicy }>(`/servers/${serverId}/backup-policy`),
        api.current.get<{ report: PreflightReport }>(`/servers/${serverId}/preflight`),
        api.current.get<{ reports: CrashReport[] }>(`/servers/${serverId}/crash-reports`),
        api.current.get<QuickHostingStatus>(`/servers/${serverId}/public-hosting/status`)
      ]);

      setBackups(backupsRes.backups);
      setBackupPolicy(policyRes.policy);
      setPreflight(preflightRes.report);
      setCrashReports(crashRes.reports);
      setQuickHostingStatus(quickHostRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function refreshAdminData(): Promise<void> {
    try {
      const [usersRes, remoteRes, javaRes] = await Promise.all([
        api.current.get<{ users: UserRecord[] }>("/users"),
        api.current.get<{ remote: RemoteState }>("/remote/status"),
        api.current.get<{ channels: JavaChannel[] }>("/system/java/channels")
      ]);

      setUsers(usersRes.users);
      setRemoteState(remoteRes.remote);
      setJavaChannels(javaRes.channels);

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
    setHasSearchedContent(false);
    setContentResults([]);
  }, [selectedServerId]);

  useEffect(() => {
    if (!connected || !selectedServerId || !liveConsole) {
      disconnectLogStream();
      return;
    }

    connectLogStream(selectedServerId);
    return () => disconnectLogStream();
  }, [connected, selectedServerId, liveConsole, apiBase, token]);

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
    return tips;
  }, [quickHostPending, selectedServerStatus, preflight, createServer.allowCracked]);

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
        publicHosting: true,
        startServer: true,
        allowCracked: createServer.allowCracked
      });
      if (response.server?.id) {
        setSelectedServerId(response.server.id);
        await refreshServerOperations(response.server.id);
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
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

  async function loadEditorFile(serverId: string, targetPath: string): Promise<void> {
    try {
      setLoadingEditorFile(true);
      const query = new URLSearchParams({ path: targetPath });
      const response = await api.current.get<{ path: string; content: string }>(`/servers/${serverId}/editor/file?${query.toString()}`);
      setFileContent(response.content);
      setFileOriginal(response.content);
      setFilePath(response.path);
      setError(null);
    } catch (e) {
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
      await refreshEditorFiles(selectedServerId);
      setNotice(`Saved ${filePath}.`);
      setError(null);
    } catch (e) {
      setNotice(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingEditorFile(false);
    }
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

    try {
      await api.current.post(`/servers/${selectedServerId}/backups/${backupId}/restore`);
      await refreshServerOperations(selectedServerId);
      await refreshAll();
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

      <section className="panel control-strip">
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
          <button className={activeView === "advanced" ? "active" : ""} onClick={() => setActiveView("advanced")} type="button">
            Advanced
          </button>
        </nav>
        <div className="inline-actions">
          <label className="toggle">
            <input type="checkbox" checked={powerMode} onChange={(e) => setPowerMode(e.target.checked)} />
            Power mode
          </label>
          <button type="button" onClick={() => void refreshAll()} disabled={!connected || busy}>
            {busy ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}
      {notice && !error ? <div className="notice-banner">{notice}</div> : null}

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
            Server
            <select value={selectedServerId ?? ""} onChange={(e) => setSelectedServerId(e.target.value || null)} disabled={servers.length === 0}>
              {servers.length === 0 ? <option value="">No servers yet</option> : null}
              {servers.map((server) => (
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
                  Public: <code>{quickHostingStatus?.publicAddress ?? "not enabled yet"}</code>
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
                <div className="inline-actions">
                  {selectedServerId ? (
                    <button onClick={() => void enableQuickHosting()} type="button" disabled={Boolean(quickHostingStatus?.quickHostReady)}>
                      Enable Public Hosting
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
            <h2>Server Fleet</h2>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Port</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((server) => (
                  <tr key={server.id} className={server.id === selectedServerId ? "selected" : ""}>
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
                    <td colSpan={6}>
                      <div className="empty-table-note">No servers yet. Open `Setup` and run Instant Launch to create your first server.</div>
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
              Pick a preset and launch in seconds. Enable power mode when you want full control over ports and memory.
            </p>
            <div className="inline-actions">
              <button onClick={() => void quickStartNow()} disabled={busy} type="button">
                {busy ? "Working..." : "Instant Launch (Recommended)"}
              </button>
              {!powerMode ? (
                <button onClick={() => setPowerMode(true)} type="button">
                  Show Advanced Setup
                </button>
              ) : null}
            </div>
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
              {servers.map((server) => (
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
              ) : null}
            </ul>
          </section>

          <section className="panel">
            <h2>Quick Hosting</h2>
            {selectedServerId ? (
              <>
                <div className="inline-actions">
                  <button onClick={() => void enableQuickHosting()} type="button" disabled={Boolean(quickHostingStatus?.quickHostReady)}>
                    Enable Public Hosting
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
                  Public: <code>{quickHostingStatus?.publicAddress ?? "not enabled yet"}</code>
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
          <section className="panel">
            <h2>Troubleshooting</h2>
            <p className="muted-note">Guidance based on current server health, tunnel status, and common setup mistakes.</p>
            <ul className="tip-list">
              {troubleshootingTips.length > 0 ? troubleshootingTips.map((tip) => <li key={tip}>{tip}</li>) : <li>No active issues detected.</li>}
            </ul>
            <div className="inline-actions">
              <button type="button" onClick={() => setActiveView("setup")}>
                Open Setup
              </button>
              {selectedServerId ? (
                <button type="button" onClick={() => void refreshServerOperations(selectedServerId)}>
                  Refresh Server Diagnostics
                </button>
              ) : null}
            </div>
          </section>

          <section className="dual-grid">
            <article className="panel">
              <h2>Console Logs</h2>
              <div className="inline-actions">
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

      {activeView === "advanced" ? (
        <>
          <section className="panel">
            <h2>Advanced Workspace</h2>
            <p className="muted-note">
              Power mode keeps all expert tools available while the main experience stays clean for everyday hosting tasks.
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
    </div>
  );
}
