import { app, BrowserWindow, dialog, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_API_PORT = process.env.SIMPLESERVERS_PORT ?? "4010";
const DEFAULT_API_HOST = process.env.SIMPLESERVERS_HOST ?? "127.0.0.1";
const DEFAULT_API_BASE = `http://${DEFAULT_API_HOST}:${DEFAULT_API_PORT}`;
const STARTUP_TIMEOUT_MS = 45_000;

let mainWindow: BrowserWindow | null = null;
let apiProcess: ChildProcessWithoutNullStreams | null = null;
let updateInterval: NodeJS.Timeout | null = null;
let latestApiFailure: string | null = null;
let desktopLogPath: string | null = null;

function isDevMode(): boolean {
  return process.env.SIMPLESERVERS_DESKTOP_DEV === "1" || !app.isPackaged;
}

function resolveApiEntry(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar", "api", "main.js");
  }

  return path.resolve(__dirname, "../../api/dist/main.js");
}

function resolveRendererIndex(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar", "web", "index.html");
  }

  return path.resolve(__dirname, "../../web/dist/index.html");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function writeDesktopLog(message: string): void {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  if (desktopLogPath) {
    fs.appendFileSync(desktopLogPath, line, "utf8");
  }
  // eslint-disable-next-line no-console
  console.log(message);
}

async function waitForApiReady(baseUrl: string, timeoutMs = STARTUP_TIMEOUT_MS): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (latestApiFailure) {
      throw new Error(`Embedded API failed during startup: ${latestApiFailure}`);
    }

    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // continue polling
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`API did not become ready within ${timeoutMs}ms`);
}

async function loadBootScreen(title: string, detail: string): Promise<void> {
  if (!mainWindow) {
    return;
  }

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SimpleServers</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 20% 15%, rgba(91, 193, 120, 0.25), transparent 45%),
          radial-gradient(circle at 80% 85%, rgba(45, 117, 255, 0.2), transparent 45%),
          linear-gradient(165deg, #081019 0%, #0f1b2a 55%, #0a121c 100%);
        color: #e7f3ff;
        font-family: "Inter", "Segoe UI", Roboto, sans-serif;
      }
      main {
        width: min(760px, calc(100vw - 64px));
        border: 1px solid rgba(122, 182, 255, 0.28);
        border-radius: 18px;
        background: rgba(6, 14, 24, 0.76);
        box-shadow: 0 24px 80px rgba(5, 10, 18, 0.55);
        padding: 28px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(26px, 2.8vw, 34px);
        font-weight: 700;
      }
      p {
        margin: 0;
        color: #b5cbe5;
        line-height: 1.6;
        white-space: pre-wrap;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      .spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(170, 220, 193, 0.35);
        border-top-color: #7be79e;
        border-radius: 999px;
        animation: spin 900ms linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <main>
      <div class="row">
        <div class="spinner"></div>
        <strong>SimpleServers</strong>
      </div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(detail)}</p>
    </main>
  </body>
</html>`;

  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function startEmbeddedApi(): void {
  const apiEntry = resolveApiEntry();
  if (!fs.existsSync(apiEntry)) {
    throw new Error(`API entry not found: ${apiEntry}. Run desktop build first.`);
  }

  const logPath = path.join(app.getPath("userData"), "api.log");
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const dataDir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  apiProcess = spawn(process.execPath, [apiEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      SIMPLESERVERS_HOST: DEFAULT_API_HOST,
      SIMPLESERVERS_PORT: DEFAULT_API_PORT,
      SIMPLESERVERS_DATA_DIR: dataDir
    },
    stdio: "pipe",
    windowsHide: true
  });

  apiProcess.stdout.pipe(logStream);
  apiProcess.stderr.pipe(logStream);

  latestApiFailure = null;
  apiProcess.on("error", (error) => {
    latestApiFailure = `spawn error: ${error.message}`;
    writeDesktopLog(`api spawn error: ${error.message}`);
  });

  apiProcess.on("exit", (code) => {
    latestApiFailure = `exit code=${String(code)}`;
    logStream.write(`\n[api-exit] code=${String(code)}\n`);
    writeDesktopLog(`api exited with code ${String(code)}`);
    apiProcess = null;
  });
}

function configureAutoUpdates(): void {
  if (!app.isPackaged) {
    return;
  }

  const updateConfigPath = path.join(process.resourcesPath, "app-update.yml");
  if (!fs.existsSync(updateConfigPath)) {
    // Local/unpublished builds do not include update config.
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    // eslint-disable-next-line no-console
    console.error("auto-updater error", error);
  });

  autoUpdater.on("update-available", (info) => {
    // eslint-disable-next-line no-console
    console.log(`Update available: ${info.version}`);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    if (!mainWindow) {
      return;
    }

    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update Ready",
      message: `SimpleServers ${info.version} has been downloaded.`,
      detail: "Restart now to install this update.",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  const checkForUpdates = async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("update check failed", error);
    }
  };

  void checkForUpdates();
  updateInterval = setInterval(() => {
    void checkForUpdates();
  }, 1000 * 60 * 60 * 6);
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 720,
    title: "SimpleServers",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    backgroundColor: "#0b1420",
    show: false
  });

  const showFallbackTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 2500);

  mainWindow.once("ready-to-show", () => {
    clearTimeout(showFallbackTimer);
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    clearTimeout(showFallbackTimer);
    mainWindow = null;
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    writeDesktopLog(`renderer crashed: reason=${details.reason} exitCode=${String(details.exitCode)}`);
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) {
      writeDesktopLog(`renderer load failed: code=${String(code)} description=${description} url=${url}`);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  await loadBootScreen("Starting SimpleServers", "Preparing local server services and dashboard...");
}

async function loadMainRenderer(): Promise<void> {
  if (!mainWindow) {
    return;
  }

  const devMode = isDevMode();
  const rendererDevUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5174";

  if (devMode && rendererDevUrl) {
    await mainWindow.loadURL(rendererDevUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await mainWindow.loadFile(resolveRendererIndex());
}

async function handleBootFailure(error: unknown): Promise<void> {
  const detail = error instanceof Error ? `${error.message}` : String(error);
  const logDir = app.getPath("userData");
  const message = `SimpleServers could not finish startup.\n\n${detail}\n\nLogs: ${logDir}`;
  writeDesktopLog(`boot failure: ${detail}`);
  await loadBootScreen("Startup failed", message);
  if (mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
  }

  const dialogOptions = {
    type: "error" as const,
    title: "SimpleServers Startup Failed",
    message: "SimpleServers failed to start.",
    detail: `${detail}\n\nCheck logs in:\n${logDir}`,
    buttons: ["Open Logs Folder", "Close"],
    defaultId: 0,
    cancelId: 1
  };
  const response = mainWindow
    ? await dialog.showMessageBox(mainWindow, dialogOptions)
    : await dialog.showMessageBox(dialogOptions);

  if (response.response === 0) {
    await shell.openPath(logDir);
  }
}

async function boot(): Promise<void> {
  app.setName("SimpleServers");
  writeDesktopLog("boot start");

  if (!app.requestSingleInstanceLock()) {
    writeDesktopLog("second instance detected; exiting");
    app.quit();
    return;
  }

  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  await app.whenReady();
  desktopLogPath = path.join(app.getPath("userData"), "desktop.log");
  writeDesktopLog("app ready");

  await createMainWindow();
  try {
    startEmbeddedApi();
    configureAutoUpdates();
    await waitForApiReady(DEFAULT_API_BASE);
    writeDesktopLog("api ready; loading renderer");
    await loadMainRenderer();
    writeDesktopLog("renderer loaded");
  } catch (error) {
    await handleBootFailure(error);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });

  app.on("before-quit", () => {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }

    if (!apiProcess) {
      return;
    }

    apiProcess.kill("SIGTERM");
    setTimeout(() => {
      if (apiProcess) {
        apiProcess.kill("SIGKILL");
      }
    }, 5000);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

process.on("uncaughtException", (error) => {
  writeDesktopLog(`uncaught exception: ${error.message}`);
});

process.on("unhandledRejection", (reason) => {
  writeDesktopLog(`unhandled rejection: ${String(reason)}`);
});

void boot().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Desktop boot failed", error);
  writeDesktopLog(`desktop boot failed: ${String(error)}`);
  app.quit();
});
