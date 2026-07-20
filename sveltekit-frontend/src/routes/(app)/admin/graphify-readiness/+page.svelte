<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Card from '$lib/components/ui/card/Card.svelte';
  import CardContent from '$lib/components/ui/card/CardContent.svelte';
  import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
  import CardTitle from '$lib/components/ui/card/CardTitle.svelte';

  interface LaneStatus {
    lane: string;
    state: string;
    reason: string;
  }

  interface PipelineStage {
    name: string;
    command: string;
    ready: boolean;
    message: string;
  }

  let status = $state<any>({
    status: { coreStructural: 'loading', optionalEnrichment: 'loading', gatedIntegrations: 'loading' },
    blockingLanes: [],
    nonBlockingLanes: [],
    pipeline: { allReady: false, stages: [] },
  });

  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    loadStatus();
  });

  async function loadStatus() {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/graphify/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      status = await res.json();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load graphify status';
    } finally {
      loading = false;
    }
  }

  async function runGraphifyDaily() {
    if (!confirm('Run graphify:daily? This will take ~30 minutes.')) return;
    try {
      // Could wire to /api/graphify/trigger in future
      alert('To run graphify:daily, execute: npm run graphify:daily');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to trigger graphify';
    }
  }

  function getStatusColor(statusStr: string): string {
    if (statusStr === 'PASS' || statusStr === 'ACTIVE_VERIFIED') return 'text-green-500';
    if (statusStr === 'WARN' || statusStr === 'ACTIVE_DEGRADED') return 'text-yellow-500';
    if (statusStr === 'FAIL' || statusStr === 'FAILED') return 'text-red-500';
    if (statusStr === 'REFERENCE_ONLY') return 'text-blue-500';
    if (statusStr === 'GATED') return 'text-orange-500';
    return 'text-gray-500';
  }

  function getStatusIcon(statusStr: string): string {
    if (statusStr === 'PASS' || statusStr === 'ACTIVE_VERIFIED') return 'check-circle-2';
    if (statusStr === 'WARN' || statusStr === 'ACTIVE_DEGRADED') return 'alert-circle';
    if (statusStr === 'FAIL' || statusStr === 'FAILED') return 'x-circle';
    if (statusStr === 'REFERENCE_ONLY') return 'info';
    if (statusStr === 'GATED') return 'lock';
    return 'help-circle';
  }
</script>

<div class="graphify-readiness">
  <header class="readiness-header">
    <div>
      <p class="eyebrow">Infrastructure Status</p>
      <h1>Graphify Daily Readiness</h1>
      <p class="subtitle">Lane-by-lane pipeline status and blocking checks for graphify:daily execution.</p>
    </div>
    <div class="header-actions">
      <Button
        on:click={loadStatus}
        variant="outline"
        size="sm"
      >
        <Icon name="refresh-cw" class="w-4 h-4 mr-1" />
        Refresh
      </Button>
    </div>
  </header>

  {#if loading}
    <div class="loading-state">
      <Icon name="loader" class="w-6 h-6 animate-spin" />
      <p>Loading graphify status...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <Icon name="alert-triangle" class="w-6 h-6" />
      <p>{error}</p>
      <Button on:click={loadStatus} variant="outline" size="sm">Retry</Button>
    </div>
  {:else}
    <!-- Status Overview -->
    <section class="status-overview">
      <div class="status-grid">
        <div class="status-card core">
          <div class="status-label">Core Structural</div>
          <div class={`status-value ${getStatusColor(status.status.coreStructural)}`}>
            <Icon name={getStatusIcon(status.status.coreStructural)} class="w-5 h-5" />
            {status.status.coreStructural}
          </div>
          <p class="status-note">Required for operation</p>
        </div>

        <div class="status-card optional">
          <div class="status-label">Optional Enrichment</div>
          <div class={`status-value ${getStatusColor(status.status.optionalEnrichment)}`}>
            <Icon name={getStatusIcon(status.status.optionalEnrichment)} class="w-5 h-5" />
            {status.status.optionalEnrichment}
          </div>
          <p class="status-note">Recommended, not blocking</p>
        </div>

        <div class="status-card gated">
          <div class="status-label">Gated Integrations</div>
          <div class={`status-value ${getStatusColor(status.status.gatedIntegrations)}`}>
            <Icon name={getStatusIcon(status.status.gatedIntegrations)} class="w-5 h-5" />
            {status.status.gatedIntegrations}
          </div>
          <p class="status-note">Auth/config required</p>
        </div>
      </div>
    </section>

    <!-- Pipeline Stages -->
    <section class="pipeline-section">
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Stages</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="stages-list">
            {#each status.pipeline.stages as stage (stage.name)}
              <div class="stage-item">
                <div class="stage-status">
                  {#if stage.ready}
                    <Icon name="check-circle-2" class="w-5 h-5 text-green-500" />
                  {:else}
                    <Icon name="x-circle" class="w-5 h-5 text-red-500" />
                  {/if}
                </div>
                <div class="stage-info">
                  <div class="stage-name">{stage.name}</div>
                  <code class="stage-cmd">{stage.command}</code>
                  <p class="stage-msg">{stage.message}</p>
                </div>
              </div>
            {/each}
          </div>
        </CardContent>
      </Card>
    </section>

    <!-- Blocking Lanes -->
    {#if status.blockingLanes.length > 0}
      <section class="blocking-section">
        <Card>
          <CardHeader>
            <CardTitle>⚠️ Blocking Lanes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul class="lanes-list blocking">
              {#each status.blockingLanes as lane (lane)}
                <li>{lane}</li>
              {/each}
            </ul>
            <p class="note error">Fix these lanes before running graphify:daily</p>
          </CardContent>
        </Card>
      </section>
    {/if}

    <!-- Non-Blocking Lanes -->
    {#if status.nonBlockingLanes.length > 0}
      <section class="nonblocking-section">
        <Card>
          <CardHeader>
            <CardTitle>ℹ️ Non-Blocking Lanes</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="lanes-detail">
              {#each status.nonBlockingLanes as lane (lane.lane)}
                <div class="lane-item">
                  <div class="lane-header">
                    <Icon name={getStatusIcon(lane.state)} class={`w-4 h-4 ${getStatusColor(lane.state)}`} />
                    <span class="lane-name">{lane.lane}</span>
                    <span class={`lane-badge ${lane.state.toLowerCase()}`}>{lane.state}</span>
                  </div>
                  <p class="lane-reason">{lane.reason}</p>
                </div>
              {/each}
            </div>
            <p class="note info">These lanes do not block graphify:daily execution</p>
          </CardContent>
        </Card>
      </section>
    {/if}

    <!-- Action Panel -->
    <section class="action-panel">
      <Card>
        <CardHeader>
          <CardTitle>Next Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="action-list">
            {#if status.pipeline.allReady}
              <div class="action-ready">
                <Icon name="check" class="w-5 h-5 text-green-500" />
                <div>
                  <p>✓ All services ready</p>
                  <p class="action-note">Execute: <code>npm run graphify:daily</code></p>
                </div>
                <Button on:click={runGraphifyDaily} variant="primary">Run Now</Button>
              </div>
            {:else}
              <div class="action-blocked">
                <Icon name="alert-circle" class="w-5 h-5 text-yellow-500" />
                <div>
                  <p>⚠️ Services unavailable</p>
                  <p class="action-note">Check blocking lanes above</p>
                </div>
              </div>
            {/if}
          </div>
          <p class="timestamp">Updated: {status.timestamp}</p>
        </CardContent>
      </Card>
    </section>
  {/if}
</div>

<style>
  .graphify-readiness {
    min-height: 100vh;
    padding: 2rem;
    background: #0e0d0b;
  }

  .readiness-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    gap: 2rem;
  }

  .eyebrow {
    margin: 0 0 0.5rem;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(212, 199, 163, 0.48);
  }

  h1 {
    margin: 0;
    font-size: 2.5rem;
    line-height: 1;
    color: #d4c7a3;
  }

  .subtitle {
    margin: 0.5rem 0 0;
    color: rgba(212, 199, 163, 0.7);
    font-size: 0.95rem;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .status-overview {
    margin-bottom: 2rem;
  }

  .status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
  }

  .status-card {
    border: 1px solid rgba(212, 199, 163, 0.2);
    border-radius: 8px;
    padding: 1rem;
    background: rgba(212, 199, 163, 0.03);
  }

  .status-label {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(212, 199, 163, 0.6);
    margin-bottom: 0.5rem;
  }

  .status-value {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.3rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .status-note {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(212, 199, 163, 0.5);
  }

  .loading-state,
  .error-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem;
    text-align: center;
    color: rgba(212, 199, 163, 0.7);
  }

  .pipeline-section,
  .blocking-section,
  .nonblocking-section,
  .action-panel {
    margin-bottom: 1.5rem;
  }

  .stages-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .stage-item {
    display: flex;
    gap: 1rem;
    padding: 0.75rem;
    background: rgba(212, 199, 163, 0.03);
    border-radius: 4px;
    border-left: 3px solid rgba(212, 199, 163, 0.2);
  }

  .stage-status {
    flex-shrink: 0;
  }

  .stage-info {
    flex: 1;
  }

  .stage-name {
    font-weight: 600;
    color: #d4c7a3;
    margin-bottom: 0.25rem;
  }

  .stage-cmd {
    display: block;
    background: rgba(0, 0, 0, 0.3);
    padding: 0.25rem 0.5rem;
    border-radius: 2px;
    font-size: 0.8rem;
    color: rgba(212, 199, 163, 0.8);
    margin-bottom: 0.25rem;
  }

  .stage-msg {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(212, 199, 163, 0.6);
  }

  .lanes-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .lanes-list.blocking li {
    color: #ef4444;
    margin-bottom: 0.5rem;
  }

  .lanes-detail {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .lane-item {
    padding: 0.75rem;
    background: rgba(212, 199, 163, 0.03);
    border-radius: 4px;
  }

  .lane-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .lane-name {
    font-weight: 500;
    color: #d4c7a3;
    flex: 1;
  }

  .lane-badge {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 2px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .lane-badge.reference_only {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }

  .lane-badge.gated {
    background: rgba(249, 115, 22, 0.2);
    color: #fb923c;
  }

  .lane-reason {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(212, 199, 163, 0.6);
  }

  .note {
    margin-top: 1rem;
    padding: 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
  }

  .note.error {
    background: rgba(239, 68, 68, 0.1);
    color: #fca5a5;
    border-left: 3px solid #ef4444;
  }

  .note.info {
    background: rgba(59, 130, 246, 0.1);
    color: #93c5fd;
    border-left: 3px solid #3b82f6;
  }

  .action-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .action-ready,
  .action-blocked {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: rgba(212, 199, 163, 0.03);
    border-radius: 4px;
  }

  .action-ready > :last-child {
    flex: 1;
  }

  .action-note {
    margin: 0.25rem 0 0;
    font-size: 0.85rem;
    color: rgba(212, 199, 163, 0.6);
  }

  .timestamp {
    margin-top: 1rem;
    font-size: 0.75rem;
    color: rgba(212, 199, 163, 0.4);
  }
</style>
