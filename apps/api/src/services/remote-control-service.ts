import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../lib/config.js";

const config = loadConfig();
const stateFile = path.join(config.dataDir, "remote-control.json");

export type RemoteControlState = {
  enabled: boolean;
  allowedOrigins: string[];
  requireToken: boolean;
};

function readStateFile(): RemoteControlState | null {
  if (!fs.existsSync(stateFile)) {
    return null;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(stateFile, "utf8")) as RemoteControlState;
    return {
      enabled: Boolean(raw.enabled),
      allowedOrigins: Array.isArray(raw.allowedOrigins) ? raw.allowedOrigins : [],
      requireToken: raw.requireToken !== false
    };
  } catch {
    return null;
  }
}

export class RemoteControlService {
  private state: RemoteControlState;

  constructor() {
    this.state =
      readStateFile() ?? {
        enabled: config.remoteControlEnabled,
        allowedOrigins: config.remoteAllowedOrigins,
        requireToken: true
      };
  }

  getStatus(): RemoteControlState & { configuredToken: boolean } {
    return {
      ...this.state,
      configuredToken: Boolean(config.remoteControlToken)
    };
  }

  setState(input: Partial<RemoteControlState>): RemoteControlState {
    this.state = {
      ...this.state,
      ...input,
      allowedOrigins: input.allowedOrigins ?? this.state.allowedOrigins
    };

    fs.writeFileSync(stateFile, JSON.stringify(this.state, null, 2), "utf8");
    return this.state;
  }

  validateRemoteRequest(origin: string | undefined, token: string | undefined): { ok: boolean; reason?: string } {
    if (!this.state.enabled) {
      return { ok: false, reason: "remote_mode_disabled" };
    }

    if (this.state.allowedOrigins.length > 0) {
      if (!origin) {
        return { ok: false, reason: "origin_required" };
      }
      if (!this.state.allowedOrigins.includes(origin)) {
        return { ok: false, reason: "origin_not_allowed" };
      }
    }

    if (this.state.requireToken) {
      if (!config.remoteControlToken) {
        return { ok: false, reason: "remote_token_not_configured" };
      }

      if (!token || token !== config.remoteControlToken) {
        return { ok: false, reason: "invalid_remote_token" };
      }
    }

    return { ok: true };
  }
}
