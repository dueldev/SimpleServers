type ServerRow = {
  id: string;
  name: string;
  type: "vanilla" | "paper" | "fabric";
  mcVersion: string;
  port: number;
  status: string;
  rootPath: string;
};

type BulkServerAction = "start" | "stop" | "restart" | "backup" | "goLive" | "delete";

type ServersListViewProps = {
  servers: ServerRow[];
  filteredServers: ServerRow[];
  selectedServerId: string | null;
  search: string;
  busy: boolean;
  deletingServerId: string | null;
  bulkSelectedServerIds: string[];
  allFilteredServersSelected: boolean;
  bulkActionInFlight: BulkServerAction | null;
  canOpenFolder: boolean;
  onSearchChange: (value: string) => void;
  onSelectServer: (serverId: string) => void;
  onOpenSetup: () => void;
  onOpenWorkspace: (serverId: string) => void;
  onDeleteServer: (server: ServerRow) => void;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
  onRestartServer: (serverId: string) => void;
  onOpenFolder: (server: ServerRow) => void;
  onToggleBulkSelection: (serverId: string) => void;
  onToggleBulkSelectAll: () => void;
  onRunBulkAction: (action: BulkServerAction) => void;
  statusTone: (status: string) => "ok" | "warn" | "error" | "neutral";
  normalizeStatus: (status?: string | null) => string;
};

function canStart(status: string): boolean {
  return status !== "running" && status !== "starting" && status !== "provisioning";
}

function canStop(status: string): boolean {
  return status !== "stopped" && status !== "stopping";
}

export function ServersListView(props: ServersListViewProps) {
  const {
    servers,
    filteredServers,
    selectedServerId,
    search,
    busy,
    deletingServerId,
    bulkSelectedServerIds,
    allFilteredServersSelected,
    bulkActionInFlight,
    canOpenFolder,
    onSearchChange,
    onSelectServer,
    onOpenSetup,
    onOpenWorkspace,
    onDeleteServer,
    onStartServer,
    onStopServer,
    onRestartServer,
    onOpenFolder,
    onToggleBulkSelection,
    onToggleBulkSelectAll,
    onRunBulkAction,
    statusTone,
    normalizeStatus
  } = props;

  const hasServers = servers.length > 0;
  const runningCount = servers.filter((server) => normalizeStatus(server.status) === "running").length;
  const stoppedCount = servers.filter((server) => normalizeStatus(server.status) === "stopped").length;
  const crashedCount = servers.filter((server) => normalizeStatus(server.status) === "crashed").length;

  return (
    <section className="v2-servers">
      <div className="v2-servers-toolbar panel">
        <div>
          <h2>Servers</h2>
          <p className="muted-note">
            {hasServers
              ? "Operate servers in one place, then jump into workspace tabs for deeper controls."
              : "Start with one guided action, then continue in the workspace tabs."}
          </p>
        </div>
        <div className="inline-actions">
          <label className="compact-field">
            Search
            <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="name, type, version, status, port..." />
          </label>
          <button type="button" className="primary-cta" onClick={onOpenSetup} disabled={busy}>
            {busy ? "Working..." : hasServers ? "Create Server" : "Create Your First Server"}
          </button>
        </div>
      </div>

      {hasServers ? (
        <section className="v2-server-summary-grid">
          <article className="panel">
            <h3>Total</h3>
            <strong>{servers.length}</strong>
          </article>
          <article className="panel">
            <h3>Running</h3>
            <strong>{runningCount}</strong>
          </article>
          <article className="panel">
            <h3>Stopped</h3>
            <strong>{stoppedCount}</strong>
          </article>
          <article className="panel">
            <h3>Crashed</h3>
            <strong>{crashedCount}</strong>
          </article>
        </section>
      ) : null}

      {bulkSelectedServerIds.length > 0 ? (
        <section className="panel v2-server-bulk-bar">
          <div>
            <strong>{bulkSelectedServerIds.length} selected</strong>
            <p className="muted-note">Run one bulk action across selected servers.</p>
          </div>
          <div className="inline-actions">
            <button type="button" onClick={() => onRunBulkAction("start")} disabled={bulkActionInFlight !== null}>
              Start
            </button>
            <button type="button" onClick={() => onRunBulkAction("stop")} disabled={bulkActionInFlight !== null}>
              Stop
            </button>
            <button type="button" onClick={() => onRunBulkAction("restart")} disabled={bulkActionInFlight !== null}>
              Restart
            </button>
            <button type="button" onClick={() => onRunBulkAction("backup")} disabled={bulkActionInFlight !== null}>
              Backup
            </button>
            <button type="button" onClick={() => onRunBulkAction("goLive")} disabled={bulkActionInFlight !== null}>
              Go Live
            </button>
            <button type="button" className="danger-btn" onClick={() => onRunBulkAction("delete")} disabled={bulkActionInFlight !== null}>
              Delete
            </button>
          </div>
        </section>
      ) : null}

      {!hasServers ? (
        <article className="panel v2-empty-state">
          <h3>Ready to launch your first server?</h3>
          <p className="muted-note">Create, launch, and continue to a focused workspace in a single wizard flow.</p>
          <button type="button" className="primary-cta" onClick={onOpenSetup} disabled={busy}>
            Open Setup Wizard
          </button>
        </article>
      ) : (
        <section className="panel v2-servers-table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <label className="table-checkbox">
                    <input type="checkbox" checked={allFilteredServersSelected} onChange={onToggleBulkSelectAll} />
                    <span className="sr-only">Select all filtered servers</span>
                  </label>
                </th>
                <th>Name</th>
                <th>Type</th>
                <th>Version</th>
                <th>Status</th>
                <th>Port</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredServers.map((server) => {
                const normalized = normalizeStatus(server.status);
                const selected = bulkSelectedServerIds.includes(server.id);
                return (
                  <tr key={server.id} className={server.id === selectedServerId ? "selected" : ""}>
                    <td>
                      <label className="table-checkbox">
                        <input type="checkbox" checked={selected} onChange={() => onToggleBulkSelection(server.id)} />
                        <span className="sr-only">Select {server.name}</span>
                      </label>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => {
                          onSelectServer(server.id);
                          onOpenWorkspace(server.id);
                        }}
                      >
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
                      <div className="inline-actions v2-server-row-actions">
                        <button type="button" onClick={() => onOpenWorkspace(server.id)}>
                          Workspace
                        </button>
                        <button type="button" onClick={() => onStartServer(server.id)} disabled={!canStart(normalized)}>
                          Start
                        </button>
                        <button type="button" onClick={() => onStopServer(server.id)} disabled={!canStop(normalized)}>
                          Stop
                        </button>
                        <button type="button" onClick={() => onRestartServer(server.id)}>
                          Restart
                        </button>
                        {canOpenFolder ? (
                          <button type="button" onClick={() => onOpenFolder(server)}>
                            Open Folder
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="danger-btn"
                          onClick={() => onDeleteServer(server)}
                          disabled={deletingServerId === server.id}
                        >
                          {deletingServerId === server.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredServers.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-table-note">No servers matched your search.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
}
