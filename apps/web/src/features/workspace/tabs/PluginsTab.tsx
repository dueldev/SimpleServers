type PluginSearchResult = {
  provider: "modrinth" | "curseforge";
  projectId: string;
  name: string;
  summary: string;
  iconUrl: string | null;
  downloads: number;
  compatible: boolean;
  latestVersionId: string | null;
};

type InstalledPlugin = {
  id: string;
  provider: "modrinth" | "curseforge";
  projectId: string;
  versionId: string;
  name: string;
  gameVersion: string;
};

type PluginUpdate = {
  packageId: string;
  latestVersionId: string;
  available: boolean;
};

type FeaturedFilter = {
  id: string;
  label: string;
  query: string;
};

type PluginsTabProps = {
  serverType: "vanilla" | "paper" | "fabric";
  query: string;
  searching: boolean;
  hasSearched: boolean;
  results: PluginSearchResult[];
  selectedProjectIds: string[];
  installingSelected: boolean;
  installingProjectId: string | null;
  installedPlugins: InstalledPlugin[];
  pluginUpdates: PluginUpdate[];
  runningPackageActionId: string | null;
  canManagePlugins: boolean;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onApplyFeaturedQuery: (query: string) => void;
  onToggleSelect: (projectId: string) => void;
  onInstallOne: (projectId: string) => void;
  onInstallSelected: () => void;
  onClearSelection: () => void;
  onUpdateInstalled: (packageId: string) => void;
  onRemoveInstalled: (packageId: string) => void;
};

const featuredFilters: FeaturedFilter[] = [
  { id: "performance", label: "Performance", query: "performance optimization" },
  { id: "admin", label: "Admin", query: "administration moderation" },
  { id: "qol", label: "QoL", query: "quality of life" },
  { id: "crossplay", label: "Crossplay", query: "crossplay geyser" }
];

export function PluginsTab(props: PluginsTabProps) {
  const {
    serverType,
    query,
    searching,
    hasSearched,
    results,
    selectedProjectIds,
    installingSelected,
    installingProjectId,
    installedPlugins,
    pluginUpdates,
    runningPackageActionId,
    canManagePlugins,
    onQueryChange,
    onSearch,
    onApplyFeaturedQuery,
    onToggleSelect,
    onInstallOne,
    onInstallSelected,
    onClearSelection,
    onUpdateInstalled,
    onRemoveInstalled
  } = props;

  const selectedCount = selectedProjectIds.length;

  return (
    <section className="v2-plugins-tab">
      <article className="panel">
        <h3>Plugin Discovery</h3>
        <p className="muted-note">Browse modern plugins from Modrinth and install one or many in one action.</p>
        {serverType !== "paper" ? (
          <p className="muted-note">
            This server type is <code>{serverType}</code>. Plugins are usually best on <code>paper</code>; compatibility may vary.
          </p>
        ) : null}
        <form
          className="v2-plugin-search-row"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch();
          }}
        >
          <label className="v2-plugin-search-field">
            Search plugins
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="anti-cheat, economy, worldedit..."
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button type="submit" className="primary-cta" disabled={searching}>
            {searching ? "Searching..." : "Search"}
          </button>
        </form>
        <div className="v2-plugin-filters">
          {featuredFilters.map((filter) => (
            <button key={filter.id} type="button" onClick={() => onApplyFeaturedQuery(filter.query)} disabled={searching}>
              {filter.label}
            </button>
          ))}
        </div>
      </article>

      {selectedCount > 0 ? (
        <article className="panel v2-plugin-selection-bar">
          <div>
            <strong>{selectedCount} selected</strong>
            <p className="muted-note">Install all selected plugins to this server now.</p>
          </div>
          <div className="inline-actions">
            <button type="button" className="primary-cta" onClick={onInstallSelected} disabled={!canManagePlugins || installingSelected}>
              {installingSelected ? "Installing..." : `Install Selected (${selectedCount})`}
            </button>
            <button type="button" onClick={onClearSelection} disabled={installingSelected}>
              Clear
            </button>
          </div>
        </article>
      ) : null}

      <article className="panel">
        <h3>Search Results</h3>
        <div className="v2-plugin-grid">
          {results.map((result) => {
            const isSelected = selectedProjectIds.includes(result.projectId);
            return (
              <article key={result.projectId} className="v2-plugin-card">
                <div className="v2-plugin-card-header">
                  <label className="toggle">
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(result.projectId)} />
                    Select
                  </label>
                  <span className={`status-pill ${result.compatible ? "tone-ok" : "tone-warn"}`}>
                    {result.compatible ? "Compatible" : "Check compatibility"}
                  </span>
                </div>
                <div className="v2-plugin-card-body">
                  <div className="v2-plugin-avatar" aria-hidden="true">
                    {result.iconUrl ? <img src={result.iconUrl} alt="" loading="lazy" /> : <span>{result.name.slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <div>
                    <h4>{result.name}</h4>
                    <p className="muted-note">{result.summary}</p>
                  </div>
                </div>
                <div className="v2-plugin-card-meta">
                  <span>{result.downloads.toLocaleString()} downloads</span>
                  <span>{result.provider}</span>
                </div>
                <div className="inline-actions">
                  <button
                    type="button"
                    onClick={() => onInstallOne(result.projectId)}
                    disabled={!canManagePlugins || installingProjectId === result.projectId || installingSelected}
                  >
                    {installingProjectId === result.projectId ? "Installing..." : "Install"}
                  </button>
                </div>
              </article>
            );
          })}
          {hasSearched && results.length === 0 ? (
            <div className="v2-plugin-empty">
              <strong>No plugins matched this query.</strong>
              <span>Try another keyword or one of the featured filters.</span>
            </div>
          ) : null}
          {!hasSearched ? (
            <div className="v2-plugin-empty">
              <strong>Search to discover plugins</strong>
              <span>Use a keyword or featured filter to populate results.</span>
            </div>
          ) : null}
        </div>
      </article>

      <article className="panel">
        <h3>Installed Plugins</h3>
        <ul className="list">
          {installedPlugins.map((plugin) => {
            const update = pluginUpdates.find((entry) => entry.packageId === plugin.id);
            return (
              <li key={plugin.id}>
                <div>
                  <strong>{plugin.name || plugin.projectId}</strong>
                  <span>
                    {plugin.provider}:{plugin.projectId}
                  </span>
                  <span>version {plugin.versionId}</span>
                  <span>{update?.available ? `update available: ${update.latestVersionId}` : "up-to-date"}</span>
                </div>
                <div className="inline-actions">
                  <button
                    type="button"
                    disabled={!canManagePlugins || !update?.available || runningPackageActionId === plugin.id}
                    onClick={() => onUpdateInstalled(plugin.id)}
                  >
                    {runningPackageActionId === plugin.id ? "Updating..." : "Update"}
                  </button>
                  <button
                    type="button"
                    className="danger-btn"
                    disabled={!canManagePlugins || runningPackageActionId === plugin.id}
                    onClick={() => onRemoveInstalled(plugin.id)}
                  >
                    {runningPackageActionId === plugin.id ? "Removing..." : "Remove"}
                  </button>
                </div>
              </li>
            );
          })}
          {installedPlugins.length === 0 ? (
            <li>
              <div>
                <strong>No plugins installed</strong>
                <span>Install plugins from search results to build your server stack.</span>
              </div>
            </li>
          ) : null}
        </ul>
      </article>
    </section>
  );
}
