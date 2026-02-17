import { type KeyboardEvent, type ReactNode, useId } from "react";

export type WorkspaceTab = "dashboard" | "console" | "players" | "plugins" | "backups" | "scheduler" | "settings";

type WorkspacePlayer = {
  name: string;
  uuid: string;
};

type WorkspaceLayoutProps = {
  serverName: string;
  serverVersion: string;
  serverStatus: string;
  publicAddress: string | null;
  playerCapacityLabel: string;
  canStart: boolean;
  canStop: boolean;
  onOpenServers: () => void;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onKill: () => void;
  activeTab: WorkspaceTab;
  onChangeTab: (tab: WorkspaceTab) => void;
  onlinePlayers: WorkspacePlayer[];
  playerSearch: string;
  onPlayerSearchChange: (value: string) => void;
  onSelectPlayer: (player: WorkspacePlayer) => void;
  children: ReactNode;
};

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "console", label: "Console" },
  { id: "players", label: "Players" },
  { id: "plugins", label: "Plugins" },
  { id: "backups", label: "Backups" },
  { id: "scheduler", label: "Scheduler" },
  { id: "settings", label: "Settings" }
];

export function WorkspaceLayout(props: WorkspaceLayoutProps) {
  const {
    serverName,
    serverVersion,
    serverStatus,
    publicAddress,
    playerCapacityLabel,
    canStart,
    canStop,
    onOpenServers,
    onStart,
    onStop,
    onRestart,
    onKill,
    activeTab,
    onChangeTab,
    onlinePlayers,
    playerSearch,
    onPlayerSearchChange,
    onSelectPlayer,
    children
  } = props;

  const tabsIdPrefix = useId();
  const playerSearchId = useId();
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);
  const activeTabRecord = tabs[Math.max(0, activeIndex)];
  const filteredPlayers = onlinePlayers.filter((entry) => entry.name.toLowerCase().includes(playerSearch.trim().toLowerCase()));

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const max = tabs.length - 1;
    let nextIndex = index;
    if (event.key === "ArrowRight") {
      nextIndex = index === max ? 0 : index + 1;
    } else if (event.key === "ArrowLeft") {
      nextIndex = index === 0 ? max : index - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = max;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    onChangeTab(nextTab.id);
    const nextTabId = `${tabsIdPrefix}-tab-${nextTab.id}`;
    window.requestAnimationFrame(() => {
      const nextTabButton = document.getElementById(nextTabId);
      if (nextTabButton instanceof HTMLButtonElement) {
        nextTabButton.focus();
      }
    });
  };

  return (
    <section className="v2-workspace">
      <header className="panel v2-workspace-header">
        <div>
          <h2>{serverName}</h2>
          <p className="muted-note">{serverVersion}</p>
        </div>
        <div className="v2-workspace-meta">
          <span className="status-pill tone-ok">{serverStatus}</span>
          <span className="muted-note">
            Java <code>{publicAddress ?? "No invite address yet"}</code>
          </span>
          <span className="status-pill tone-neutral">{playerCapacityLabel}</span>
          <button type="button" onClick={onOpenServers}>
            All Servers
          </button>
        </div>
      </header>

      <section className="panel v2-workspace-controls">
        <h3>Server Controls</h3>
        <div className="inline-actions">
          <button type="button" onClick={onStart} disabled={!canStart}>
            Start
          </button>
          <button type="button" onClick={onStop} disabled={!canStop}>
            Stop
          </button>
          <button type="button" onClick={onRestart}>
            Restart
          </button>
          <button type="button" className="danger-btn" onClick={onKill}>
            Kill
          </button>
        </div>
      </section>

      <section className="v2-workspace-grid">
        <article className="panel v2-workspace-main">
          <nav className="v2-workspace-tabs" role="tablist" aria-label="Server workspace tabs">
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                id={`${tabsIdPrefix}-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`${tabsIdPrefix}-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={activeTab === tab.id ? "active" : ""}
                onClick={() => onChangeTab(tab.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <div
            className="v2-tab-content"
            id={`${tabsIdPrefix}-panel-${activeTabRecord.id}`}
            role="tabpanel"
            aria-labelledby={`${tabsIdPrefix}-tab-${activeTabRecord.id}`}
            tabIndex={0}
          >
            {children}
          </div>
        </article>

        <aside className="panel v2-workspace-rail">
          <div className="v2-rail-header">
            <h3>Online Players</h3>
            <span className="muted-note">{filteredPlayers.length}</span>
          </div>
          <label htmlFor={playerSearchId}>
            Search players
            <input
              id={playerSearchId}
              value={playerSearch}
              onChange={(event) => onPlayerSearchChange(event.target.value)}
              placeholder="Player name..."
            />
          </label>
          <ul className="list list-compact">
            {filteredPlayers.map((entry) => (
              <li key={entry.uuid}>
                <button
                  type="button"
                  className="player-row-btn"
                  onClick={() => onSelectPlayer(entry)}
                  aria-label={`Open player profile for ${entry.name}`}
                >
                  <div>
                    <strong>{entry.name}</strong>
                    <span>{entry.uuid}</span>
                  </div>
                </button>
              </li>
            ))}
            {filteredPlayers.length === 0 ? (
              <li>
                <div>
                  <strong>No players found</strong>
                  <span>Online players will appear here while the server is running.</span>
                </div>
              </li>
            ) : null}
          </ul>
        </aside>
      </section>
    </section>
  );
}
