import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("simpleServers", {
  platform: process.platform,
  appVersion: process.env.npm_package_version ?? "0.1.0",
  packaged: process.env.SIMPLESERVERS_DESKTOP_DEV === "1" ? false : true,
  signatureStatus: process.env.SIMPLESERVERS_BUILD_SIGNATURE_STATUS ?? (process.env.SIMPLESERVERS_DESKTOP_DEV === "1" ? "development" : "unknown"),
  openPath: (targetPath: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke("simpleservers:open-path", targetPath)
});
