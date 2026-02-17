import { KeyboardEvent } from "react";

type PreflightIssue = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  recommendation: string;
};

type ConsoleLine = {
  ts: string;
  line: string;
};

type ConsoleTabProps = {
  logs: ConsoleLine[];
  liveConsole: boolean;
  logStreamLabel: string;
  terminalCommand: string;
  sendingTerminalCommand: boolean;
  preflightIssues: PreflightIssue[];
  onToggleLiveConsole: (enabled: boolean) => void;
  onTerminalCommandChange: (value: string) => void;
  onSendCommand: () => void;
  onRefreshLogs: () => void;
};

export function ConsoleTab(props: ConsoleTabProps) {
  const {
    logs,
    liveConsole,
    logStreamLabel,
    terminalCommand,
    sendingTerminalCommand,
    preflightIssues,
    onToggleLiveConsole,
    onTerminalCommandChange,
    onSendCommand,
    onRefreshLogs
  } = props;
  const trimmedCommand = terminalCommand.trim();
  const canSendCommand = trimmedCommand.length > 0 && !sendingTerminalCommand;
  const quickCommands = ["list", "say Server restart in 5m", "save-all", "stop"];

  const handleCommandKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (canSendCommand) {
      onSendCommand();
    }
  };

  return (
    <section className="v2-console-tab">
      <article className="panel">
        <div className="inline-actions">
          <span className="status-pill tone-neutral">Stream {logStreamLabel}</span>
          <label className="toggle">
            <input type="checkbox" checked={liveConsole} onChange={(event) => onToggleLiveConsole(event.target.checked)} />
            Live stream
          </label>
          <button type="button" onClick={onRefreshLogs}>
            Refresh Snapshot
          </button>
        </div>
        <div className="log-box">
          {logs.map((entry, index) => (
            <div key={`${entry.ts}-${index}`}>
              <span>{new Date(entry.ts).toLocaleTimeString()}</span> {entry.line}
            </div>
          ))}
          {logs.length === 0 ? <div>No log lines yet.</div> : null}
        </div>
        <form
          className="v2-console-composer"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSendCommand) {
              onSendCommand();
            }
          }}
        >
          <label className="v2-console-command-field">
            Command
            <input
              value={terminalCommand}
              onChange={(event) => onTerminalCommandChange(event.target.value)}
              onKeyDown={handleCommandKeyDown}
              placeholder="say hello world"
              spellCheck={false}
              autoComplete="off"
            />
            <span className="muted-note">Press Enter to send quickly.</span>
          </label>
          <div className="v2-console-command-actions">
            <button type="submit" disabled={!canSendCommand}>
              {sendingTerminalCommand ? "Sending..." : "Send"}
            </button>
            <button type="button" disabled={sendingTerminalCommand || terminalCommand.length === 0} onClick={() => onTerminalCommandChange("")}>
              Clear
            </button>
          </div>
        </form>
        <div className="v2-console-quick-actions">
          <span className="muted-note">Quick commands</span>
          {quickCommands.map((command) => (
            <button key={command} type="button" onClick={() => onTerminalCommandChange(command)} disabled={sendingTerminalCommand}>
              {command}
            </button>
          ))}
        </div>
      </article>

      <article className="panel">
        <h3>Preflight Diagnostics</h3>
        <ul className="list list-compact">
          {preflightIssues.length === 0 ? (
            <li>
              <div>
                <strong>No blocking issues</strong>
                <span>Server preflight checks are clear.</span>
              </div>
            </li>
          ) : (
            preflightIssues.map((issue) => (
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
    </section>
  );
}
