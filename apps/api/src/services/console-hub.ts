import { EventEmitter } from "node:events";

export type ConsoleMessage = {
  serverId: string;
  line: string;
  ts: string;
};

export class ConsoleHub {
  private readonly emitter = new EventEmitter();
  private readonly history = new Map<string, ConsoleMessage[]>();
  private maxHistory = 500;

  publish(serverId: string, line: string): void {
    const message: ConsoleMessage = {
      serverId,
      line,
      ts: new Date().toISOString()
    };

    const entries = this.history.get(serverId) ?? [];
    entries.push(message);
    if (entries.length > this.maxHistory) {
      entries.shift();
    }
    this.history.set(serverId, entries);

    this.emitter.emit(this.eventName(serverId), message);
  }

  subscribe(serverId: string, listener: (message: ConsoleMessage) => void): () => void {
    const eventName = this.eventName(serverId);
    this.emitter.on(eventName, listener);
    return () => this.emitter.off(eventName, listener);
  }

  getHistory(serverId: string): ConsoleMessage[] {
    return this.history.get(serverId) ?? [];
  }

  private eventName(serverId: string): string {
    return `console:${serverId}`;
  }
}
