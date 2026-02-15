import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("simpleServers", {
  platform: process.platform,
  appVersion: process.env.npm_package_version ?? "0.1.0"
});
