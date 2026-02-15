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

let mainWindow: BrowserWindow | null = null;
let apiProcess: ChildProcessWithoutNullStreams | null = null;
let updateInterval: NodeJS.Timeout | null = null;

function isDevMode(): boolean {
  return process.env.SIMPLESERVERS_DESKTOP_DEV === "1" || !app.isPackaged;
}

function resolveApiEntry(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "api", "main.js");
  }

  return path.resolve(__dirname, "../../api/dist/main.js");
}

function resolveRendererIndex(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "web", "index.html");
  }

  return path.resolve(__dirname, "../../web/dist/index.html");
}

async function waitForApiReady(baseUrl: string, timeoutMs = 20_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
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
    stdio: "pipe"
  });

  apiProcess.stdout.pipe(logStream);
  apiProcess.stderr.pipe(logStream);

  apiProcess.on("exit", (code) => {
    logStream.write(`\n[api-exit] code=${String(code)}\n`);
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
  const devMode = isDevMode();
  const rendererDevUrl = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5174";

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
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (devMode && rendererDevUrl) {
    await mainWindow.loadURL(rendererDevUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await mainWindow.loadFile(resolveRendererIndex());
}

async function boot(): Promise<void> {
  app.setName("SimpleServers");

  if (!app.requestSingleInstanceLock()) {
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

  startEmbeddedApi();
  configureAutoUpdates();
  await waitForApiReady(DEFAULT_API_BASE);
  await createMainWindow();

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

void boot().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Desktop boot failed", error);
  app.quit();
});
