<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import type { PageData } from './$types';

  interface CacheStats {
    timestamp: string;
    status: string;
    uptime?: number;
    kvCacheEnabled: boolean;
    stats: Array<{
      totalRequests: number;
      contextTokens: number;
      cachedTokens: number;
      newTokens: number;
      cacheHitRate: number;
    }>;
    aggregates: {
      totalRequests: number;
      totalContextTokens: number;
      totalCachedTokens: number;
      totalNewTokens: number;
      averageCacheHitRate: number;
      estimatedSpeedup: string;
      costSavings: string;
    };
    recommendation: string;
  }

  interface SearchSource {
    type: string;
    id: string;
    content: string;
    relevance: number;
    metadata: Record<string, unknown>;
  }

  let { data }: { data: PageData } = $props();

  // --- State Management using runes ---
  let query = $state('');
  let loading = $state(false);
  let results = $state<SearchSource[]>([]);
  let searchedSources = $state<string[]>([]);
  let validationError = $state('');
  let cacheStats = $state<CacheStats | null>(null);
  let cacheError = $state<string | null>(null);
  let refreshing = $state(false);

  // --- Kanban Ticket Board & Ticket Creation State (Runes) ---
  let kanbanTasksList = $state<NonNullable<NonNullable<PageData['operations']>['kanbanBoard']>['tasks']>([]);
  let kanbanTotal = $state(0);
  let kanbanEventsList = $state<NonNullable<NonNullable<PageData['operations']>['kanbanBoard']>['recentEvents']>([]);
  let newTicketFeatureId = $state('feature:graphify-source-bridge');
  let newTicketLabel = $state('');
  let newTicketSourceRefs = $state('scripts/atlas/audit-graphify-workspace-snapshot-binding-v1.mts');
  let newTicketValidationCmd = $state('npx tsx scripts/atlas/audit-graphify-workspace-snapshot-binding-v1.mts');
  let newTicketPriority = $state<'low' | 'medium' | 'high' | 'critical'>('high');
  let newTicketPermissionMode = $state<'read_only' | 'proposal_only' | 'patch_allowed'>('proposal_only');
  let kanbanBusy = $state(false);
  let kanbanStatusMsg = $state('');
  let kanbanErrorMsg = $state('');

  $effect(() => {
    cacheStats = data?.cacheStats ?? null;
    cacheError = data?.error ?? null;
    kanbanTasksList = data?.operations?.kanbanBoard?.tasks ?? [];
    kanbanTotal = data?.operations?.kanbanBoard?.total ?? 0;
    kanbanEventsList = data?.operations?.kanbanBoard?.recentEvents ?? [];
  });

  const todoTasks = $derived(kanbanTasksList.filter((t) => t.lane === 'todo'));
  const inProgressTasks = $derived(kanbanTasksList.filter((t) => t.lane === 'in_progress'));
  const doneTasks = $derived(kanbanTasksList.filter((t) => t.lane === 'done'));

  // Derived Progress Bar & ETA calculation using Svelte 5 runes
  const completedCount = $derived(doneTasks.length);
  const activeCount = $derived(inProgressTasks.length);
  const pendingCount = $derived(todoTasks.length);
  const totalCount = $derived(kanbanTasksList.length);
  const progressPercent = $derived(
    totalCount === 0 ? 0 : Math.min(100, Math.round((completedCount / totalCount) * 100))
  );
  const formattedETA = $derived.by(() => {
    if (totalCount === 0) return 'No tasks';
    if (pendingCount + activeCount === 0) return 'Complete';
    return 'Estimating…';
  });

  async function refreshKanbanBoard() {
    kanbanBusy = true;
    kanbanErrorMsg = '';
    try {
      const res = await fetch('/api/admin/atlas/kanban-tickets?limit=30');
      const body = await res.json();
      if (!res.ok || !body.ok) {
        kanbanErrorMsg = body.error ?? `Failed to load Kanban board (${res.status})`;
      } else {
        kanbanTasksList = body.tasks ?? [];
        kanbanTotal = body.total ?? 0;
        kanbanEventsList = body.events ?? [];
      }
    } catch (err) {
      kanbanErrorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      kanbanBusy = false;
    }
  }

  async function handleCreateTicket() {
    if (!newTicketLabel.trim() || !newTicketFeatureId.trim() || !newTicketValidationCmd.trim()) {
      kanbanErrorMsg = 'Feature ID, Ticket Title, and Validation Command are required.';
      return;
    }
    kanbanBusy = true;
    kanbanErrorMsg = '';
    kanbanStatusMsg = '';
    try {
      const refs = newTicketSourceRefs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const workspaceRevision =
        data?.operations?.graphifyAdmission?.admitted?.workspaceRevision ?? null;
      const res = await fetch('/api/admin/atlas/kanban-tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create_ticket',
          featureId: newTicketFeatureId.trim(),
          featureLabel: newTicketLabel.trim(),
          priority: newTicketPriority,
          sourceRefs: refs.length > 0 ? refs : ['openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md'],
          validationCommand: newTicketValidationCmd.trim(),
          permissionMode: newTicketPermissionMode,
          workspaceRevision,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        kanbanErrorMsg = body.error ?? `Create ticket failed (${res.status})`;
      } else {
        kanbanStatusMsg = `Created ticket ${body.task.taskId} (${body.recommendationProjection?.status ?? 'proposed'})`;
        newTicketLabel = '';
        await refreshKanbanBoard();
      }
    } catch (err) {
      kanbanErrorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      kanbanBusy = false;
    }
  }

  async function handleTicketAction(
    action: 'claim' | 'heartbeat' | 'complete' | 'block' | 'retry' | 'reclaim_stale',
    task: NonNullable<NonNullable<PageData['operations']>['kanbanBoard']>['tasks'][number],
  ) {
    kanbanBusy = true;
    kanbanErrorMsg = '';
    kanbanStatusMsg = '';
    try {
      const payload: Record<string, unknown> = {
        action,
        taskId: task.taskId,
      };
      if (action === 'heartbeat') {
        payload.claimToken = task.claimToken ?? '';
        payload.runId = task.currentRunId ?? '';
        payload.note = 'Operator control-panel heartbeat';
      }
      const res = await fetch('/api/admin/atlas/kanban-tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        kanbanErrorMsg = body.error ?? `Action ${action} failed (${res.status})`;
      } else {
        kanbanStatusMsg = `Action '${action}' succeeded on ${task.taskId}`;
        await refreshKanbanBoard();
      }
    } catch (err) {
      kanbanErrorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      kanbanBusy = false;
    }
  }

  // --- Derived State ---
  const hasSources = $derived(results.length > 0);
  const isLoading = $derived(loading);
  const hasCacheStats = $derived(cacheStats !== null && cacheError === null);
  const cacheHitPercentage = $derived(
    cacheStats ? (cacheStats.aggregates.averageCacheHitRate * 100).toFixed(1) : '0'
  );
  const totalRequests = $derived(cacheStats?.aggregates.totalRequests ?? 0);
  const contextTokensSaved = $derived(cacheStats?.aggregates.totalCachedTokens ?? 0);
  const speedupPercentage = $derived(cacheStats?.aggregates.estimatedSpeedup ?? '0%');

  // --- Cache Stats Refresh Handler ---
  async function refreshCacheStats() {
    refreshing = true;
    try {
      const response = await fetch('/api/acp/kv-cache-stats', {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        cacheError = `HTTP ${response.status}: Failed to fetch cache stats`;
        cacheStats = null;
      } else {
        const data = await response.json();
        cacheStats = data;
        cacheError = null;
      }
    } catch (error) {
      cacheError = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      cacheStats = null;
    } finally {
      refreshing = false;
    }
  }

  async function handleAtlasAudit() {
    const searchText = query.trim();
    if (!searchText) {
      results = [];
      searchedSources = [];
      return;
    }

    loading = true;
    validationError = '';
    results = [];
    searchedSources = [];
    try {
      const response = await fetch('/api/error-brain/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ errorMessage: searchText, limit: 10 }),
        signal: AbortSignal.timeout(15000)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Search failed (${response.status})`);
      results = Array.isArray(payload.sources) ? payload.sources : [];
      searchedSources = Array.isArray(payload.searchedDatabases) ? payload.searchedDatabases : [];
      if (payload.errorLogSearchStatus === 'unavailable') {
        validationError = 'PostgreSQL error-log search is unavailable; other sources may still have results.';
      }
    } catch (error) {
      validationError = error instanceof Error ? error.message : 'Search request failed';
    } finally {
      loading = false;
    }
  }
</script>

<div class="p-8 max-w-7xl mx-auto">
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-3xl font-bold text-primary">Parent Atlas Operations</h1>
      <p class="text-muted-foreground">Search recorded errors and retrieval sources. Results are candidates, not verified fixes.</p>
    </div>
    <div class="text-right text-sm text-muted-foreground">
      {#if cacheStats}
        <p>Last updated: {new Date(cacheStats.timestamp).toLocaleTimeString()}</p>
        <p>Uptime: {((cacheStats.uptime ?? 0) / 3600).toFixed(1)}h</p>
      {/if}
    </div>
  </div>

  <!-- Cache Statistics Panel -->
  {#if hasCacheStats}
    <div class="mb-10 p-6 border rounded-lg bg-gradient-to-r from-blue-50 to-purple-50">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold flex items-center gap-2">
          <span class="text-accent">⚡</span> KV Cache Monitoring
        </h2>
        <Button onclick={refreshCacheStats} disabled={refreshing} class="text-sm">
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {#if cacheError}
        <div class="p-3 bg-red-100 text-red-800 border border-red-200 rounded-md text-sm">
          <strong>Cache Error:</strong> {cacheError}
        </div>
      {:else}
        <div class="grid grid-cols-4 gap-4 mb-4">
          <div class="bg-white p-4 rounded-md border border-gray-200">
            <p class="text-xs text-muted-foreground mb-1">Total Requests</p>
            <p class="text-2xl font-bold text-primary">{totalRequests}</p>
          </div>
          <div class="bg-white p-4 rounded-md border border-gray-200">
            <p class="text-xs text-muted-foreground mb-1">Cache Hit Rate</p>
            <p class="text-2xl font-bold text-green-600">{cacheHitPercentage}%</p>
          </div>
          <div class="bg-white p-4 rounded-md border border-gray-200">
            <p class="text-xs text-muted-foreground mb-1">Tokens Saved</p>
            <p class="text-2xl font-bold text-blue-600">{contextTokensSaved}</p>
          </div>
          <div class="bg-white p-4 rounded-md border border-gray-200">
            <p class="text-xs text-muted-foreground mb-1">Speedup</p>
            <p class="text-2xl font-bold text-purple-600">{speedupPercentage}</p>
          </div>
        </div>

        <div class="bg-white p-4 rounded-md border border-gray-200 mb-4">
          <h3 class="text-sm font-semibold mb-2">Recommendation</h3>
          <p class="text-sm text-gray-700">{cacheStats?.recommendation || 'N/A'}</p>
        </div>

        {#if cacheStats?.stats && cacheStats.stats.length > 0}
          <div class="bg-white p-4 rounded-md border border-gray-200">
            <h3 class="text-sm font-semibold mb-3">Cache Performance by Request</h3>
            <div class="space-y-2 max-h-32 overflow-y-auto">
              {#each cacheStats.stats.slice(0, 5) as stat, idx}
                <div class="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                  <div>
                    <p class="font-semibold text-primary">Request {idx + 1}</p>
                    <p class="text-xs text-muted-foreground">
                      Context: {stat.contextTokens} tokens | Cached: {stat.cachedTokens} | New: {stat.newTokens}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="text-xs font-semibold text-green-600">
                      {(stat.cacheHitRate * 100).toFixed(0)}% hit
                    </p>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    </div>
  {:else if cacheError}
    <div class="mb-10 p-6 border rounded-lg bg-red-50">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold flex items-center gap-2">
          <span class="text-red-600">⚠️</span> Cache Statistics Unavailable
        </h2>
        <Button onclick={refreshCacheStats} disabled={refreshing} class="text-sm">
          {refreshing ? 'Retrying...' : 'Retry'}
        </Button>
      </div>
      <p class="text-sm text-red-700">{cacheError}</p>
    </div>
  {/if}

  {#if data.operations?.catalogStatus === 'ADMIN_ONLY'}
    <p class="mb-5 text-sm text-muted-foreground">Operations catalog and error counts are restricted to administrators.</p>
  {:else if data.operations}
    <section class="mb-8 rounded-lg border bg-card p-5" aria-label="Parent Atlas operations status">
      <h2 class="mb-1 text-xl font-semibold">Parent Atlas operations</h2>
      <p class="mb-4 text-sm text-muted-foreground">Read-only status. Catalog presence and indexes do not prove population, source qualification, retrieval admission, or GPU execution.</p>
      <div class="mb-4 grid gap-3 md:grid-cols-3">
        <article class="rounded border p-3">
          <h3 class="font-semibold">PostgreSQL catalog</h3>
          <p class="text-sm">{data.operations.catalogStatus}</p>
          {#if data.operations.error}<p class="mt-1 text-xs text-amber-700">Some reads failed.</p>{/if}
        </article>
        <article class="rounded border p-3">
          <h3 class="font-semibold">Recorded errors</h3>
          {#if data.operations.errorCounts}
            <p class="text-sm">{data.operations.errorCounts.total} total · {data.operations.errorCounts.unresolved} unresolved</p>
          {:else}<p class="text-sm text-muted-foreground">Unavailable or table absent</p>{/if}
        </article>
        <article class="rounded border p-3">
          <h3 class="font-semibold">Graphify admission</h3>
          {#if data.operations.graphifyAdmission}
            <p class="text-sm">{data.operations.graphifyAdmission.admitted.badge}</p>
            <p class="text-xs text-muted-foreground">Execution rows: {data.operations.graphifyAdmission.admitted.matchingCount}; canonical owners: {data.operations.graphifyAdmission.admitted.canonicalCount}</p>
          {:else}<p class="text-sm text-muted-foreground">Admission receipts unavailable</p>{/if}
        </article>
      </div>
      <h3 class="mb-2 font-semibold">Table and index catalog</h3>
      {#if data.operations.tables.length > 0}
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {#each data.operations.tables as table (table.tableName)}
            <div class="rounded border p-3 text-sm">
              <div class="flex justify-between gap-2"><code>{table.tableName}</code><span>{table.exists ? 'present' : 'absent'}</span></div>
              <p class="mt-1 text-xs text-muted-foreground">{table.exists ? `${table.indexNames.length} indexes: ${table.indexNames.join(', ') || 'none'}` : 'No live table found'}</p>
            </div>
          {/each}
        </div>
      {:else}<p class="text-sm text-muted-foreground">Catalog was not read; migration files alone are not live-deployment proof.</p>{/if}
      <p class="mt-4 text-sm text-muted-foreground">GPU execution is not probed here; no benchmark or workload was started. OpenSpec tasks are authoritative; workboards are generated views.</p>
    </section>

    <!-- Kanban Taskboard & Agent Control Panel Section -->
    <section class="mb-8 rounded-lg border bg-card p-5" aria-label="Parent Atlas Kanban Taskboard">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-semibold">Parent Atlas Kanban Taskboard &amp; Agent Ticket Control</h2>
          <p class="text-sm text-muted-foreground">
            Non-authoritative human review and agent ticket queue backed by <code>kanban_tasks</code> + <code>kanban_task_events</code> ({kanbanTotal} total tasks). OpenSpec tasks remain authoritative.
          </p>
        </div>
        <Button onclick={refreshKanbanBoard} disabled={kanbanBusy} class="w-auto text-xs">
          {kanbanBusy ? 'Syncing...' : 'Refresh Board'}
        </Button>
      </div>

      {#if kanbanStatusMsg}
        <div class="mb-4 rounded border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          {kanbanStatusMsg}
        </div>
      {/if}
      {#if kanbanErrorMsg}
        <div class="mb-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
          {kanbanErrorMsg}
        </div>
      {/if}

      <!-- Create Revision-Bound Ticket Form -->
      <div class="mb-6 rounded border bg-background/50 p-4">
        <h3 class="mb-3 text-sm font-semibold">
          Create Revision-Bound Kanban Ticket (<code>projectRecommendationToKanbanV1</code> → <code>kanban_tasks</code>)
        </h3>
        <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <input
            type="text"
            bind:value={newTicketFeatureId}
            placeholder="Feature ID (e.g. feat:oaklib-tuple-gate)"
            aria-label="Feature ID"
            class="rounded border bg-background p-2 text-xs"
          />
          <input
            type="text"
            bind:value={newTicketLabel}
            placeholder="Ticket Title / Summary"
            aria-label="Ticket Title"
            class="rounded border bg-background p-2 text-xs lg:col-span-2"
          />
          <input
            type="text"
            bind:value={newTicketSourceRefs}
            placeholder="Source Refs (comma-separated paths)"
            aria-label="Source Refs"
            class="rounded border bg-background p-2 text-xs"
          />
          <input
            type="text"
            bind:value={newTicketValidationCmd}
            placeholder="Validation Command"
            aria-label="Validation Command"
            class="rounded border bg-background p-2 text-xs font-mono"
          />
          <div class="flex gap-2">
            <select
              bind:value={newTicketPriority}
              aria-label="Ticket Priority"
              class="rounded border bg-background p-2 text-xs"
            >
              <option value="critical">critical</option>
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
            <select
              bind:value={newTicketPermissionMode}
              aria-label="Permission Mode"
              class="rounded border bg-background p-2 text-xs"
            >
              <option value="read_only">read_only</option>
              <option value="proposal_only">proposal_only</option>
              <option value="patch_allowed">patch_allowed</option>
            </select>
            <Button onclick={handleCreateTicket} disabled={kanbanBusy} class="w-auto text-xs">
              Create Ticket
            </Button>
          </div>
        </div>
      </div>

      <!-- Agentic Throughput & ETA Progress Bar -->
      <div class="mb-6 rounded-lg border bg-gradient-to-r from-muted/20 to-muted/40 p-4">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-primary">Agentic Job Throughput</span>
            <span class="rounded bg-primary/10 px-2 py-0.5 font-mono text-[11px] text-primary">
              {progressPercent}% Complete
            </span>
            {#if activeCount > 0}
              <span class="inline-flex items-center gap-1 text-amber-500 text-[11px]">
                <span class="inline-block h-2 w-2 animate-ping rounded-full bg-amber-400"></span>
                {activeCount} active job{activeCount > 1 ? 's' : ''} in flight
              </span>
            {/if}
          </div>
          <div class="font-mono text-[11px] text-muted-foreground">
            <span>ETA: <strong class="text-foreground">{formattedETA}</strong></span>
            <span class="mx-1.5">·</span>
            <span>{completedCount}/{kanbanTasksList.length} tasks</span>
          </div>
        </div>

        <div class="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            class="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style="width: {progressPercent}%"
          ></div>
        </div>

        <div class="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>Queued: {pendingCount}</span>
          <span>Claimed / Active: {activeCount}</span>
          <span>Verified / Done: {completedCount}</span>
        </div>
      </div>

      <!-- 3-Lane Kanban Board -->
      <div class="grid gap-4 lg:grid-cols-3">
        <!-- TODO LANE -->
        <div class="rounded border bg-background/40 p-3">
          <div class="mb-3 flex items-center justify-between border-b pb-2">
            <h3 class="text-sm font-semibold">To Do / Queued</h3>
            <span class="rounded bg-muted px-2 py-0.5 text-xs font-mono">{todoTasks.length}</span>
          </div>
          <div class="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {#each todoTasks as task (task.taskId)}
              <article class="rounded border bg-card p-3 text-xs shadow-sm">
                <div class="flex items-start justify-between gap-2">
                  <span class="font-semibold">{task.featureLabel}</span>
                  <span class="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase">{task.status}</span>
                </div>
                <p class="mt-1 font-mono text-[11px] text-muted-foreground">{task.taskId} · {task.featureId}</p>
                {#if task.sourceRefs.length > 0}
                  <p class="mt-1 truncate text-[11px] text-muted-foreground" title={task.sourceRefs.join(', ')}>
                    Refs: {task.sourceRefs.slice(0, 2).join(', ')}{task.sourceRefs.length > 2 ? ` +${task.sourceRefs.length - 2}` : ''}
                  </p>
                {/if}
                <div class="mt-2.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={kanbanBusy}
                    onclick={() => handleTicketAction('claim', task)}
                    class="rounded border px-2 py-1 text-[11px] font-medium hover:bg-muted"
                  >
                    Claim
                  </button>
                  <button
                    type="button"
                    disabled={kanbanBusy}
                    onclick={() => handleTicketAction('block', task)}
                    class="rounded border px-2 py-1 text-[11px] hover:bg-muted"
                  >
                    Block
                  </button>
                </div>
              </article>
            {:else}
              <p class="text-xs text-muted-foreground">No queued tasks in To Do lane.</p>
            {/each}
          </div>
        </div>

        <!-- IN PROGRESS LANE -->
        <div class="rounded border bg-background/40 p-3">
          <div class="mb-3 flex items-center justify-between border-b pb-2">
            <h3 class="text-sm font-semibold">In Progress / Claimed</h3>
            <span class="rounded bg-muted px-2 py-0.5 text-xs font-mono">{inProgressTasks.length}</span>
          </div>
          <div class="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {#each inProgressTasks as task (task.taskId)}
              <article class="rounded border bg-card p-3 text-xs shadow-sm">
                <div class="flex items-start justify-between gap-2">
                  <span class="font-semibold">{task.featureLabel}</span>
                  <span class="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase">{task.status}</span>
                </div>
                <p class="mt-1 font-mono text-[11px] text-muted-foreground">{task.taskId} · {task.featureId}</p>
                {#if task.currentRunId}
                  <p class="mt-1 font-mono text-[10px] text-muted-foreground">Run: {task.currentRunId}</p>
                {/if}
                <div class="mt-2.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={kanbanBusy}
                    onclick={() => handleTicketAction('heartbeat', task)}
                    class="rounded border px-2 py-1 text-[11px] hover:bg-muted"
                  >
                    Heartbeat
                  </button>
                  <button
                    type="button"
                    disabled={kanbanBusy}
                    onclick={() => handleTicketAction('complete', task)}
                    class="rounded border px-2 py-1 text-[11px] font-medium hover:bg-muted"
                  >
                    Complete
                  </button>
                  <button
                    type="button"
                    disabled={kanbanBusy}
                    onclick={() => handleTicketAction('retry', task)}
                    class="rounded border px-2 py-1 text-[11px] hover:bg-muted"
                  >
                    Return to Queue
                  </button>
                </div>
              </article>
            {:else}
              <p class="text-xs text-muted-foreground">No active tasks in progress.</p>
            {/each}
          </div>
        </div>

        <!-- DONE LANE -->
        <div class="rounded border bg-background/40 p-3">
          <div class="mb-3 flex items-center justify-between border-b pb-2">
            <h3 class="text-sm font-semibold">Done / Verified</h3>
            <span class="rounded bg-muted px-2 py-0.5 text-xs font-mono">{doneTasks.length}</span>
          </div>
          <div class="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {#each doneTasks as task (task.taskId)}
              <article class="rounded border bg-card p-3 text-xs shadow-sm">
                <div class="flex items-start justify-between gap-2">
                  <span class="font-semibold">{task.featureLabel}</span>
                  <span class="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase">{task.status}</span>
                </div>
                <p class="mt-1 font-mono text-[11px] text-muted-foreground">{task.taskId} · {task.featureId}</p>
                {#if task.validationCommand}
                  <p class="mt-1 truncate font-mono text-[10px] text-muted-foreground">{task.validationCommand}</p>
                {/if}
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={kanbanBusy}
                    onclick={() => handleTicketAction('retry', task)}
                    class="rounded border px-2 py-1 text-[11px] hover:bg-muted"
                  >
                    Reopen
                  </button>
                </div>
              </article>
            {:else}
              <p class="text-xs text-muted-foreground">No completed tasks in current window.</p>
            {/each}
          </div>
        </div>
      </div>

      {#if kanbanEventsList.length > 0}
        <div class="mt-5 border-t pt-4">
          <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Kanban Audit Events (<code>kanban_task_events</code>)
          </h3>
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {#each kanbanEventsList.slice(0, 6) as ev, idx (`${ev.taskId}-${ev.eventType}-${idx}`)}
              <div class="rounded border bg-background/60 p-2.5 text-xs">
                <div class="flex justify-between gap-2">
                  <code class="font-semibold">{ev.eventType}</code>
                  <span class="font-mono text-[10px] text-muted-foreground">{ev.taskId}</span>
                </div>
                {#if ev.payload?.workspaceRevision}
                  <p class="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                    rev: {String(ev.payload.workspaceRevision).slice(0, 23)}…
                  </p>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <div class="mb-5 flex flex-wrap gap-3 text-sm">
    <a class="underline" href="/admin/graphify-readiness">Graphify readiness and admission</a>
    <a class="underline" href="/admin/error-brain">Error Brain</a>
    <span class="text-muted-foreground">OpenSpec tasks are the task ledger; generated workboards are projections.</span>
    <span class="text-muted-foreground">GPU execution is not probed by this page.</span>
  </div>

  <!-- Query Input Area -->
  <div class="mb-10 p-6 border rounded-lg bg-background/50">
    <div class="flex gap-3 mb-4">
      <input 
        type="text" 
        bind:value={query} 
        placeholder="Search a recorded error message, route, or file path"
        class="flex-grow p-3 border rounded-md focus:ring-accent focus:border-accent"
      />
      <Button onclick={handleAtlasAudit} disabled={isLoading || !query} class="w-auto">
        {isLoading ? 'Searching...' : 'Search errors'}
      </Button>
    </div>
    {#if validationError}
      <div class="mt-4 p-3 bg-red-100 text-red-800 border border-red-200 rounded-md">
        <strong>Search status:</strong> {validationError}
      </div>
    {/if}
  </div>

  <!-- Retrieved candidates are shown without fabricated synthesis or fix commands. -->
  {#if query.trim() && !loading}
    <section class="bg-card p-6 rounded-xl shadow-lg border" aria-live="polite">
      <h2 class="text-xl font-semibold mb-2">Search candidates ({results.length})</h2>
      <p class="text-xs text-muted-foreground mb-4">Sources queried: {searchedSources.join(', ') || 'none reported'}. Scores are retrieval hints, not probabilities or fix confidence.</p>
      {#if hasSources}
        <div class="space-y-3">
          {#each results as result (result.type + ':' + result.id)}
            <article class="border rounded-lg p-4">
              <div class="flex items-center justify-between gap-3 mb-2">
                <span class="text-sm font-semibold">{result.type}</span>
                <span class="text-xs text-muted-foreground">Heuristic score: {result.relevance}</span>
              </div>
              <p class="text-sm whitespace-pre-wrap break-words">{result.content}</p>
              {#if result.metadata.filePath || result.metadata.routePath || result.metadata.sourceRef}
                <p class="mt-2 text-xs text-muted-foreground">
                  {[result.metadata.sourceRef, result.metadata.filePath, result.metadata.routePath].filter(Boolean).join(' · ')}
                  {#if result.metadata.lineNumber} :{result.metadata.lineNumber}{/if}
                </p>
              {/if}
            </article>
          {/each}
        </div>
      {:else}
        <p class="text-sm text-muted-foreground">No candidates returned for this query.</p>
      {/if}
    </section>
  {/if}
</div>
