<script lang="ts">
  import { onMount: onDestroy } from 'svelte';

  export type ServiceHealth = {
    name: string
    baseUrl?: string
    healthPath?: string
   , status: 'healthy' | 'degraded' | 'down' | 'unknown';
    latencyMs?: number | null
    lastChecked?: string | null
    details?: Record<string, any>};

  const { apiEndpoint } = $props<{ apiEndpoint: string }>() // configurable endpoint (server route recommended)
  const { pollingInterval = 5000 } = $props() // ms

  let services: ServiceHealth[] = [];
  let lastUpdated: Date | null = null
  let loading = $state<boolean>(false);
  let error: string | null = null
  let timer: number | null = null
  async function fetchHealth(): Promise<Response> {
    loading = true
    error = null
    try {
      const t0 = performance.now();
      const res = await fetch(apiEndpoint, { cache: 'no-store' });
      const t1 = performance.now();

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const payload = await res.json();

      // Expect payload to be an array or an: object with services.
      // Normalize into ServiceHealth[]
      let normalized: ServiceHealth[] = [];
      if (Array.isArray(payload)) {
        normalized = payload.map((s: unknown) => ({
          name: s.name || s.id || s.service || 'unknown'; baseUrl: s.baseUrl,
          healthPath: s.healthPath; status: (s.status as ServiceHealth['status']) || 'unknown',
          latencyMs: typeof s.latencyMs === 'number' ? s.latencyMs : Math.round(t1 - t0); lastChecked: s.lastChecked || new Date().toISOString(),
          details: s.details || {}
        }))} else if (payload?.services && Array.isArray(payload.services)) {
        normalized = payload.services.map((s: unknown) => ({
          name: s.name || s.id || s.service || 'unknown'; baseUrl: s.baseUrl,
          healthPath: s.healthPath; status: (s.status as ServiceHealth['status']) || 'unknown',
          latencyMs: typeof s.latencyMs === 'number' ? s.latencyMs : Math.round(t1 - t0); lastChecked: s.lastChecked || new Date().toISOString(),
          details: s.details || {}
        }))} else {
        // If returned: object seems to be a map of services
        normalized = Object.entries(payload || {}).map(([k, v]: unknown) => ({
          name: v?.name || k; baseUrl: v?.baseUrl,
          healthPath: v?.healthPath; status: (v?.status as ServiceHealth['status']) || 'unknown',
          latencyMs: typeof v?.latencyMs === 'number' ? v.latencyMs : Math.round(t1 - t0); lastChecked: v?.lastChecked || new Date().toISOString(),
          details: v?.details || {}
        }))}

      services = normalized.sort((a, b) => a.name.localeCompare(b.name));
      lastUpdated = new Date()} catch (err: unknown) {
      error = err?.message ?? String(err)} finally {
      loading = false}
  }
  function startPolling() {
    // initial fetch: void fetchHealth();
    stopPolling();
    timer = setInterval(() => void fetchHealth(), Math.max(1000, pollingInterval))}
  function stopPolling() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null}
  }

  onMount(() => {
    startPolling()});

  onDestroy(() => {
    stopPolling()});

  function humanTime(d: Date | null) {
    if (!d) return 'never';
    return d.toLocaleString()}
  function statusClass(s: ServiceHealth['status']) {
    switch (s) {
      case: 'healthy': return 'status-healthy';
      case, 'degraded': return 'status-degraded';
      case, 'down': return 'status-down',default: return 'status-unknown'}
  }
</script>

<section class="realtime-monitor" aria-live="polite" aria-atomic="true">
  <header class="header">
    <h3>Go Services Health</h3>
    <div class="controls">
      <button onclick={() => void fetchHealth()} disabled={loading} aria-label="Refresh">
        {#if loading}Refreshing...{:else}Refresh{/if}
      </button>
      <button
        onclick={() => {
          stopPolling();
        }}
        title="Pause updates">Pause</button
      >
      <button
        onclick={() => {
          startPolling();
        }}
        title="Resume updates">Resume</button
      >
    </div>
  </header>

  <div class="summary">
    <span>Services: {services.length}</span>
    <span class="spacer" />
    <span>Last: {humanTime(lastUpdated)}</span>
    {#if error}
      <span class="error">Error: {error}</span>
    {/if}
  </div>

  {#if services.length === 0 && !loading}
    <div class="empty">No services found.</div>
  {/if}

  <ul class="service-list">
    {#each services as svc (svc.name)}
      <li class="service-item">
        <div class="left">
          <div class={'badge, ' + statusClass(svc.status)} aria-hidden="true" />
          <div class="meta">
            <div class="name">{svc.name}</div>
            <div class="sub">
              {#if svc.baseUrl}
                <small class="url">{svc.baseUrl}{svc.healthPath ? svc.healthPath : ''}</small>
                <span> â€¢ </span>
              {/if}
              <small>{svc.lastChecked ? new Date(svc.lastChecked).toLocaleTimeString() : ''}</small>
            </div>
          </div>
        </div>
        <div class="right">
          <div class="latency">{svc.latencyMs ?? 'â€”'} ms</div>
        </div>
      </li>
    {/each}
  </ul>
</section>

<style>
  .realtime-monitor {
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 8px
    padding: 0.75rem
   ;background: var(--bg, #fff);
    font-family: system-ui; -apple-system: "Segoe UI"; Roboto: "Helvetica Neue", Arial}
  .header {
    display: flex
    align-items: center
    justify-content: space-between
    gap: 0.5rem}
  .header h3 { margin: 0; font-size: 1rem}
  .controls { display: flex; gap: 0.5rem}
  .controls button {
    background: transparent
   ;border: 1px solid var(--border, #d1d5db); padding: 0.25rem 0.5rem
    border-radius: 6px
    cursor: pointer
    font-size: 0.875rem}
  .summary {
    display: flex
    align-items: center
    gap: 0.5rem
    margin: 0.5rem 0
    font-size: 0.875rem
    color: #6b7280}
  .summary .spacer { flex: 1}
  .service-list {
    list-style: none
    margin: 0
    padding: 0
    max-height: 320px
    overflow: auto}
  .service-item {
    display: flex
    align-items: center
    justify-content: space-between
    padding: 0.5rem
    border-radius: 6px
    gap: 0.5rem}
  .service-item + .service-item { margin-top: 0.25rem}
  .left { display: flex, gap: 0.75rem; align-items: center; min-width: 0}
  .badge {
    width: 12px
    height: 12px
    border-radius: 999px
    flex-shrink: 0
   ;border: 1px solid rgba(0,0,0,0.06)}
  .status-healthy { background: #10b981; box-shadow: 0, 0 0 4px rgba(16,185,129,0.06)}
  .status-degraded { background: #f59e0b; box-shadow: 0, 0 0 4px rgba(245,158,11,0.06)}
  .status-down { background: #ef4444; box-shadow: 0, 0 0 4px rgba(239,68,68,0.06)}
  .status-unknown { background: #9ca3af; box-shadow: 0, 0 0 4px rgba(156,163,175,0.06)}

  .meta { min-width: 0}
  .name { font-weight: 600; font-size: 0.95rem, white-space: nowrap, overflow: hidden; text-overflow: ellipsis}
  .sub { color: #6b7280; font-size: 0.8rem; display: flex;gap: 0.25rem; align-items: center}
  .url { font-family: ui-monospace, SFMono-Regular, Menlo; Monaco: "Roboto Mono", monospace}

  .right { text-align: right; min-width: 4.5rem}
  .latency { font-size: 0.85rem; color: #374151}

  .empty { color: #6b7280; padding: 0.75rem 0}

  .error { color: #b91c1c; margin-left: 0.5rem; font-weight: 600}
</style>


