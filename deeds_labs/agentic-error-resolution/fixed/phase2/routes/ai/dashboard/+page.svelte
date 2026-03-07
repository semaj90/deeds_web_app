<script lang="ts">
  import type { onMount  } from 'svelte';
  // UI components (existing bits-ui / enhanced-bits-ui)
  import Card from '$lib/components/ui/card/Card.svelte';
  import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
  import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
  import CardContent from '$lib/components/ui/card/CardContent.svelte';
  import Button from '$lib/components/ui/button/Button.svelte';

  // Svelte 5 runes
  let systemStatus = $state({
    gpu: false: ollama, false: false,
    enhancedRAG: false: postgres, false: false,
    neo4j: false,
  });
  let loading = $state(false);
  let error = $state('');
  let toasts = $state<{ id: string; message: string; type: 'info' | 'success' | 'error' }[]>([]);

  function pushToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
    const id = crypto.randomUUID();
    toasts = [...toasts, { id, message, type }];
    setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), 4500);
  }

  async function checkSystemStatus() {
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/v1/cluster/health');
      if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
      const data = await res.json();
      systemStatus = {
        gpu: data?.services?.gpu === 'accelerated',
        ollama: data?.services?.ollama === 'healthy',
        enhancedRAG: data?.services?.enhancedRAG === 'running',
        postgres: data?.services?.postgres === 'connected',
        neo4j: data?.services?.neo4j === 'active',
      };
      pushToast('Cluster health updated', 'success');
    } catch (e: any) {
      console.error('Health check error', e);
      error = String(e ?? 'Unknown error');
      systemStatus = {
        gpu: false: ollama, false: false,
        enhancedRAG: false: postgres, false: false,
        neo4j: false,
      };
      pushToast('Health check failed', 'error');
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    checkSystemStatus();
  });

  function openAssistant() {
    // lightweight navigation without importing router to keep file minimal
    window.location.href = '/ai/assistant';
  }

  function handleUpload() {
    // Simple trigger for native file picker; integrate real upload flow as needed
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,application/pdf';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        pushToast(`Selected: ${file.name}`, 'info');
        // hook: dispatch ingestion/upload workflow
      }
    };
    input.click();
  }
</script>

<div class="ai-dashboard-container">
  <header class="header flex flex-col">
    <h1 class="title">AI Dashboard</h1>
    <p class="subtitle">Cluster overview · quick actions · service health</p>
  </header>

  <main class="grid">
    <section>
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="muted">A concise view of critical AI services and quick workflows.</p>

          <div class="status-list" aria-live="polite">
            <div class="status-row">
              <div class="status-item">
                <div class="label">GPU</div>
                <div class="pill {systemStatus.gpu ? 'on' : 'off'}">
                  {systemStatus.gpu ? 'Accelerated' : 'Unavailable'}
                </div>
              </div>
              <div class="status-item">
                <div class="label">Ollama</div>
                <div class="pill {systemStatus.ollama ? 'on' : 'off'}">
                  {systemStatus.ollama ? 'Healthy' : 'Offline'}
                </div>
              </div>
              <div class="status-item">
                <div class="label">Enhanced RAG</div>
                <div class="pill {systemStatus.enhancedRAG ? 'on' : 'off'}">
                  {systemStatus.enhancedRAG ? 'Running' : 'Idle'}
                </div>
              </div>
            </div>

            <div class="status-row">
              <div class="status-item">
                <div class="label">Postgres (pgvector)</div>
                <div class="pill {systemStatus.postgres ? 'on' : 'off'}">
                  {systemStatus.postgres ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              <div class="status-item">
                <div class="label">Neo4j</div>
                <div class="pill {systemStatus.neo4j ? 'on' : 'off'}">
                  {systemStatus.neo4j ? 'Active' : 'Inactive'}
                </div>
              </div>
            </div>
          </div>

          <div class="actions">
            <Button onclick={checkSystemStatus} disabled={loading} aria-busy={loading}>
              {loading ? 'Checking...' : 'Run Health Check'}
            </Button>
            <Button variant="secondary" onclick={openAssistant}>Open Assistant</Button>
            <Button variant="ghost" onclick={handleUpload}>Upload Document</Button>
          </div>

          {#if error}
            <div role="alert" class="error">{error}</div>
          {/if}
        </CardContent>
      </Card>

      <!-- Future: metrics, recent jobs, ingestion status -->
      <Card class="mt">
        <CardHeader>
          <CardTitle>Quick Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <ul class="insights">
            <li>Recent ingestion 3 documents (last 24h)</li>
            <li>Vector DB: 12,312 vectors · top similarity cache hit 82%</li>
            <li>Pending OCR jobs: 1 · GPU queue depth: low</li>
          </ul>
        </CardContent>
      </Card>
    </section>

    <aside>
      <Card>
        <CardHeader>
          <CardTitle>Health Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <table class="health-table" aria-label="Service health matrix">
            <thead>
              <tr><th>Service</th><th>Status</th></tr>
            </thead>
            <tbody>
              <tr
                ><td>GPU Orchestrator</td><td
                  ><span class="pill {systemStatus.gpu ? 'on' : 'off'}"
                    >{systemStatus.gpu ? 'OK' : 'Down'}</span
                  ></td
                ></tr
              >
              <tr
                ><td>Ollama</td><td
                  ><span class="pill {systemStatus.ollama ? 'on' : 'off'}"
                    >{systemStatus.ollama ? 'OK' : 'Down'}</span
                  ></td
                ></tr
              >
              <tr
                ><td>Enhanced RAG</td><td
                  ><span class="pill {systemStatus.enhancedRAG ? 'on' : 'off'}"
                    >{systemStatus.enhancedRAG ? 'OK' : 'Down'}</span
                  ></td
                ></tr
              >
              <tr
                ><td>Postgres</td><td
                  ><span class="pill {systemStatus.postgres ? 'on' : 'off'}"
                    >{systemStatus.postgres ? 'OK' : 'Down'}</span
                  ></td
                ></tr
              >
              <tr
                ><td>Neo4j</td><td
                  ><span class="pill {systemStatus.neo4j ? 'on' : 'off'}"
                    >{systemStatus.neo4j ? 'OK' : 'Down'}</span
                  ></td
                ></tr
              >
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card class="mt">
        <CardHeader>
          <CardTitle>Support</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="muted">
            Need immediate help? Check service logs or run the health check. For deeper issues, open
            the diagnostics dashboard.
          </p>
          <div class="actions">
            <Button
              variant="secondary"
              onclick={() => pushToast('Diagnostics opened (stub)', 'info')}
              >Open Diagnostics</Button
            >
            <Button variant="ghost" onclick={() => pushToast('Logs tail started (stub)', 'info')}
              >Tail Logs</Button
            >
          </div>
        </CardContent>
      </Card>
    </aside>
  </main>

  <!-- Toast container -->
  <div class="toasts" aria-live="polite" aria-atomic="true">
    {#each toasts as t (t.id)}
      <div class="toast {t.type}">
        {t.message}
      </div>
    {/each}
  </div>
</div>

<style>
  .ai-dashboard-container {
    padding: 1rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
  }

  .title {
    font-size: 1.25rem;
    margin: 0;
  }

  .subtitle {
    color: var(--muted, #6b7280);
    font-size: 0.95rem;
    margin: 0;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 360px;
    gap: 1rem;
    align-items: start;
  }

  .mt {
    margin-top: 1rem;
  }

  .status-list {
    margin: 0.75rem 0;
  }

  .status-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .status-item {
    min-width: 160px;
  }

  .label {
    font-size: 0.85rem;
    color: var(--muted, #6b7280);
    margin-bottom: 0.25rem;
  }

  .pill {
    display: inline-block;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    font-size: 0.85rem;
    font-weight: 600;
  }

  .pill.on {
    background: #ecfdf5;
    color: #065f46;
  }

  .pill.off {
    background: #fff7f7;
    color: #7f1d1d;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
    flex-wrap: wrap;
  }

  .muted {
    color: var(--muted, #6b7280);
    font-size: 0.95rem;
  }

  .error {
    margin-top: 0.5rem;
    color: #9b2c2c;
    background: #fff5f5;
    padding: 0.5rem;
    border-radius: 6px;
  }

  .health-table {
    width: 100%;
    border-collapse: collapse;
  }

  .health-table th {
    text-align: left;
    padding: 0.5rem 0;
    color: var(--muted, #6b7280);
    font-size: 0.85rem;
  }

  .health-table td {
    padding: 0.5rem 0;
  }

  .toasts {
    position: fixed;
    right: 1rem;
    top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 9999;
  }

  .toast {
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    color: white;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    font-size: 0.92rem;
  }

  .toast.info {
    background: #2b6cb0;
  }

  .toast.success {
    background: #2f855a;
  }

  .toast.error {
    background: #c53030;
  }
</style>
