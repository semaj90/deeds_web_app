<script lang="ts">
  import type { PageData } from './$types';
  // $derived.by closure so navigation between wiki sub-routes re-runs
  // load(), mutates props.data, and re-renders the status block. Direct
  // destructure + $derived(expr) trips a "captures initial value" warning
  // because the destructured `data` ref is evaluated outside the closure.
  let props: { data: PageData } = $props();
  const ws = $derived.by(() => props.data.wikiStatus);

  const syncColor = (s: string) =>
    s === 'synced' ? 'text-green-400' : s === 'degraded' ? 'text-yellow-400' : 'text-red-400';
</script>

<svelte:head><title>Wiki — Code Intel</title></svelte:head>

<div class="p-6 max-w-6xl mx-auto space-y-6">
  <div class="flex items-center gap-4">
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a href="/code-intel" class="text-[var(--t-fg-muted)] hover:text-[var(--t-fg)] text-sm">← Code Intel</a>
    <h1 class="text-xl font-bold">📖 Karpathy Wiki</h1>
    <span class="ml-auto text-sm {syncColor(ws?.syncStatus ?? 'unknown')}">{ws?.syncStatus ?? 'unknown'}</span>
  </div>

  <!-- stats -->
  <div class="grid grid-cols-3 gap-4">
    <div class="panel p-4 rounded">
      <div class="text-xs text-[var(--t-fg-muted)] uppercase">Redis Notes</div>
      <div class="text-2xl font-bold">{ws?.noteCount ?? 0}</div>
      <div class="text-xs text-[var(--t-fg-muted)]">wiki:note:* keys</div>
    </div>
    <div class="panel p-4 rounded">
      <div class="text-xs text-[var(--t-fg-muted)] uppercase">CouchDB Notes</div>
      <div class="text-2xl font-bold">{ws?.couchNoteCount ?? 0}</div>
      <div class="text-xs {syncColor(ws?.couchDbStatus ?? 'unknown')}">{ws?.couchDbStatus ?? '—'}</div>
    </div>
    <div class="panel p-4 rounded">
      <div class="text-xs text-[var(--t-fg-muted)] uppercase">Latest Sync</div>
      <div class="text-sm font-mono mt-1 truncate">{ws?.latestSyncAt ?? '—'}</div>
    </div>
  </div>

  <!-- latest note preview -->
  {#if ws?.latestNote}
    <div class="panel p-4 rounded">
      <h2 class="text-xs uppercase text-[var(--t-fg-muted)] mb-2">Latest Note Preview</h2>
      <pre class="text-xs font-mono overflow-x-auto whitespace-pre-wrap text-[var(--t-fg-muted)]">{
        JSON.stringify(ws.latestNote, null, 2).slice(0, 600)
      }</pre>
    </div>
  {/if}

  <!-- actions -->
  <div class="panel p-4 rounded">
    <h2 class="text-xs uppercase text-[var(--t-fg-muted)] mb-3">Actions</h2>
    <div class="flex gap-2 flex-wrap text-xs">
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a href="/codebase-wiki" class="btn-base px-3 py-1.5">Open Wiki →</a>
    </div>
    <div class="mt-3 font-mono text-xs space-y-1 text-[var(--t-fg-muted)]">
      <div>Seed: <code>npm run wiki:seed</code></div>
      <div>Watch: wiki-vault-watcher auto-syncs on file change</div>
      <div>CouchDB: <a href="/api/admin/couchdb-proxy" target="_blank" class="text-[var(--t-accent)]">Management Console</a></div>
    </div>
  </div>
</div>
