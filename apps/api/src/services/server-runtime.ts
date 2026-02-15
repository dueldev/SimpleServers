import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import type { ServerRecord } from "../domain/types.js";
import { store } from "../repositories/store.js";
import { ConsoleHub } from "./console-hub.js";
import { ServerSetupService } from "./server-setup.js";

const STARTUP_GRACE_MS = 2000;

type RuntimeEntry = {
  serverId: string;
  child: ChildProcessWithoutNullStreams;
};

export class ServerRuntimeService {
  private readonly runtimes = new Map<string, RuntimeEntry>();

  constructor(
    private readonly setupService: ServerSetupService,
    private readonly consoleHub: ConsoleHub,
    private readonly onCrash: (serverId: string, code: number | null) => void
  ) {}

  isRunning(serverId: string): boolean {
    return this.runtimes.has(serverId);
  }

  async start(server: ServerRecord): Promise<void> {
    if (this.isRunning(server.id)) {
      return;
    }

    const command = this.setupService.buildLaunchCommand(server);
    store.updateServerState(server.id, "starting", null);

    const child = spawn(command.executable, command.args, {
      cwd: server.rootPath,
      stdio: "pipe"
    });

    this.runtimes.set(server.id, { serverId: server.id, child });
    store.updateServerState(server.id, "running", child.pid ?? null);

    child.stdout.on("data", (chunk) => {
      const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        this.consoleHub.publish(server.id, line);
      }
    });

    child.stderr.on("data", (chunk) => {
      const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        this.consoleHub.publish(server.id, `[stderr] ${line}`);
      }
    });

    child.on("exit", (code) => {
      this.runtimes.delete(server.id);
      const crashed = code !== 0 && code !== null;
      store.updateServerState(server.id, crashed ? "crashed" : "stopped", null);
      this.consoleHub.publish(server.id, `Process exited with code ${String(code)}`);
      if (crashed) {
        this.onCrash(server.id, code);
      }
    });

    // Do not report successful start until the process survives a short grace window.
    const startupFailure = await new Promise<Error | null>((resolve) => {
      let settled = false;

      const finish = (error: Error | null): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        child.off("error", onError);
        child.off("exit", onEarlyExit);
        resolve(error);
      };

      const onError = (error: Error): void => {
        finish(new Error(`Failed to spawn server process: ${error.message}`));
      };

      const onEarlyExit = (code: number | null): void => {
        finish(new Error(`Server process exited during startup with code ${String(code)}`));
      };

      const timer = setTimeout(() => {
        finish(null);
      }, STARTUP_GRACE_MS);

      child.once("error", onError);
      child.once("exit", onEarlyExit);
    });

    if (startupFailure) {
      const current = store.getServerById(server.id);
      if (current?.status === "starting") {
        store.updateServerState(server.id, "stopped", null);
      }
      throw startupFailure;
    }
  }

  async stop(serverId: string): Promise<void> {
    const runtime = this.runtimes.get(serverId);
    if (!runtime) {
      store.updateServerState(serverId, "stopped", null);
      return;
    }

    store.updateServerState(serverId, "stopping", runtime.child.pid ?? null);

    runtime.child.stdin.write("stop\n");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        runtime.child.kill("SIGKILL");
        resolve();
      }, 10000);

      runtime.child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  async restart(server: ServerRecord): Promise<void> {
    await this.stop(server.id);
    await this.start(server);
  }

  sendCommand(serverId: string, command: string): void {
    const runtime = this.runtimes.get(serverId);
    if (!runtime) {
      throw new Error("Server not running");
    }

    runtime.child.stdin.write(`${command}\n`);
    this.consoleHub.publish(serverId, `> ${command}`);
  }

  getPid(serverId: string): number | null {
    return this.runtimes.get(serverId)?.child.pid ?? null;
  }
}
