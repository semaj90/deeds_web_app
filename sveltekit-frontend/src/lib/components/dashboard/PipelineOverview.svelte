<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    compact?: boolean;
  }

  let { compact = false }: Props = $props();

  const PIPELINE_STAGES = [
    { id: 'upload', label: 'MinIO Upload', detail: 'SHA-256 hash + PostgreSQL record', icon: 'upload', deps: ['minio'] as string[], color: '#3b82f6' },
    { id: 'extract', label: 'Text Extraction', detail: 'pdf-parse \u2192 OCR fallback', icon: 'file-text', deps: [] as string[], color: '#8b5cf6' },
    { id: 'chunk', label: 'Legal Chunking', detail: 'ARTICLE / SECTION / \u00A7 structure', icon: 'split', deps: [] as string[], color: '#06b6d4' },
    { id: 'embed', label: 'Embedding', detail: 'gRPC \u2192 embeddinggemma \u2192 nomic', icon: 'cpu', deps: ['ollama', 'grpc'] as string[], color: '#f59e0b' },
    { id: 'store', label: 'Dual Storage', detail: 'pgvector + Qdrant', icon: 'database', deps: ['postgres', 'qdrant'] as string[], color: '#10b981' },
    { id: 'entity', label: 'Entity Extraction', detail: 'EMAIL, PHONE, DATE, CITATION', icon: 'scan', deps: ['ollama'] as string[], color: '#a78bfa' },
    { id: 'forensic', label: 'Forensic Detection', detail: 'SSN, CC, contact density', icon: 'shield', deps: [] as string[], color: '#ef4444' },
    { id: 'summarize', label: 'Summarization', detail: 'Ollama gemma3-legal', icon: 'scroll-text', deps: ['ollama'] as string[], color: '#c8a84b' },
    { id: 'gpu', label: 'GPU Analysis', detail: 'CUDA similarity + clustering', icon: 'zap', deps: ['cuda'] as string[], color: '#38bdf8' },
  ];

  interface InfraStatus {
    ollama: boolean;
    postgres: boolean;
    qdrant: boolean;
    redis: boolean;
    rabbitmq: boolean;
    minio: boolean;
    grpc: boolean;
    cuda: boolean;
  }

  const SERVICES: { key: keyof InfraStatus; label: string; icon: string }[] = [
    { key: 'ollama', label: 'Ollama', icon: 'bot' },
    { key: 'postgres', label: 'PostgreSQL', icon: 'database' },
    { key: 'qdrant', label: 'Qdrant', icon: 'search' },
    { key: 'redis', label: 'Redis', icon: 'zap' },
    { key: 'rabbitmq', label: 'RabbitMQ', icon: 'mail' },
    { key: 'minio', label: 'MinIO', icon: 'hard-drive' },
    { key: 'grpc', label: 'gRPC', icon: 'network' },
    { key: 'cuda', label: 'CUDA', icon: 'gpu' },
  ];

  let infraStatus = $state<InfraStatus>({
    ollama: false, postgres: false, qdrant: false, redis: false,
    rabbitmq: false, minio: false, grpc: false, cuda: false,
  });
  let loading = $state(true);

  $effect(() => {
    const controller = new AbortController();
    fetchInfraStatus(controller.signal);
    return () => controller.abort();
  });

  async function fetchInfraStatus(signal?: AbortSignal) {
    loading = true;
    try {
      const res = await fetch('/api/infrastructure/status', { signal });
      if (!res.ok) return;
      const data = await res.json();
      infraStatus = {
        ollama: data.inference?.ollama?.available ?? false,
        postgres: data.services?.postgres ?? false,
        qdrant: data.services?.qdrant?.ok ?? data.services?.qdrant ?? false,
        redis: data.services?.redis?.ok ?? data.services?.redis ?? false,
        rabbitmq: data.services?.rabbitmq?.ok ?? data.services?.rabbitmq ?? false,
        minio: data.services?.simd?.minioConnected ?? false,
        grpc: data.tiers?.tier1_grpc?.available ?? false,
        cuda: data.gpu?.cudaAddon ?? false,
      };
    } catch { /* non-fatal */ }
    finally { loading = false; }
  }

  function getStageHealth(deps: string[]): 'ok' | 'degraded' | 'na' {
    if (deps.length === 0) return 'na';
    return deps.every(d => infraStatus[d as keyof InfraStatus]) ? 'ok' : 'degraded';
  }

  let healthyCount = $derived(SERVICES.filter(s => infraStatus[s.key]).length);
</script>

<div class="pipeline-overview" class:compact>
  <div class="pipeline-header">
    <h3 class="pipeline-title">
      <Icon name="activity" size={14} />
      Evidence Pipeline
    </h3>
    <span class="pipeline-subtitle">9-Stage Processing Flow</span>
  </div>

  <div class="pipeline-body">
    <!-- Flow Diagram -->
    <div class="flow-column">
      {#each PIPELINE_STAGES as stage, i}
        {#if i > 0}
          <div class="connector"></div>
        {/if}
        <div class="stage-node" style="border-color: {stage.color}40; background: {stage.color}0a;">
          <span class="stage-dot" style="background: {stage.color};"></span>
          <div class="stage-icon" style="color: {stage.color};">
            <Icon name={stage.icon} size={compact ? 12 : 14} />
          </div>
          <div class="stage-info">
            <span class="stage-label">{stage.label}</span>
            {#if !compact}
              <span class="stage-detail">{stage.detail}</span>
            {/if}
          </div>
          <span
            class="health-dot"
            class:health-ok={getStageHealth(stage.deps) === 'ok'}
            class:health-bad={getStageHealth(stage.deps) === 'degraded'}
            class:health-na={getStageHealth(stage.deps) === 'na'}
            title={stage.deps.length ? stage.deps.join(', ') : 'CPU only'}
          ></span>
        </div>
      {/each}
    </div>

    <!-- Infrastructure Health -->
    <div class="infra-column">
      <div class="infra-header">
        <span class="infra-title">Infrastructure</span>
        <span class="infra-count" class:all-ok={healthyCount === SERVICES.length}>
          {healthyCount}/{SERVICES.length}
        </span>
      </div>
      {#if loading}
        <div class="infra-loading">Loading...</div>
      {:else}
        {#each SERVICES as svc}
          <div class="infra-row">
            <span class="infra-dot" class:online={infraStatus[svc.key]}></span>
            <Icon name={svc.icon} size={12} />
            <span class="infra-label">{svc.label}</span>
            <span class="infra-status" class:online={infraStatus[svc.key]}>
              {infraStatus[svc.key] ? 'online' : 'offline'}
            </span>
          </div>
        {/each}
      {/if}
      <button class="refresh-btn" onclick={() => fetchInfraStatus()} disabled={loading}>
        <Icon name="refresh-cw" size={10} />
        Refresh
      </button>
    </div>
  </div>
</div>

<style>
  .pipeline-overview {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(212, 199, 163, 0.1);
    border-radius: 8px;
    overflow: hidden;
  }

  .pipeline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(212, 199, 163, 0.08);
  }

  .pipeline-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: rgb(212 199 163);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0;
  }

  .pipeline-subtitle {
    font-size: 0.65rem;
    color: rgb(212 199 163 / 0.4);
  }

  .pipeline-body {
    display: grid;
    grid-template-columns: 1fr 200px;
    gap: 1rem;
    padding: 1rem;
  }

  .compact .pipeline-body {
    grid-template-columns: 1fr 160px;
    gap: 0.75rem;
    padding: 0.75rem;
  }

  /* Flow Column */
  .flow-column {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stage-node {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    border: 1px solid;
    border-radius: 6px;
    width: 100%;
    max-width: 360px;
    position: relative;
  }

  .compact .stage-node {
    padding: 0.3rem 0.5rem;
    gap: 0.375rem;
  }

  .stage-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .stage-icon {
    flex-shrink: 0;
    display: flex;
  }

  .stage-info {
    flex: 1;
    min-width: 0;
  }

  .stage-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: rgb(212 199 163);
  }

  .compact .stage-label {
    font-size: 0.65rem;
  }

  .stage-detail {
    display: block;
    font-size: 0.6rem;
    color: rgb(212 199 163 / 0.4);
    line-height: 1.2;
  }

  .health-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .health-dot.health-ok { background: #22c55e; }
  .health-dot.health-bad { background: #ef4444; }
  .health-dot.health-na { background: rgb(212 199 163 / 0.15); }

  .connector {
    width: 2px;
    height: 12px;
    background: rgb(212 199 163 / 0.15);
  }

  .compact .connector {
    height: 8px;
  }

  /* Infrastructure Column */
  .infra-column {
    background: rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(212, 199, 163, 0.06);
    border-radius: 6px;
    padding: 0.625rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .infra-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.375rem;
    border-bottom: 1px solid rgba(212, 199, 163, 0.06);
    margin-bottom: 0.125rem;
  }

  .infra-title {
    font-size: 0.625rem;
    font-weight: 600;
    color: rgb(212 199 163 / 0.6);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .infra-count {
    font-size: 0.625rem;
    font-weight: 700;
    color: rgb(212 199 163 / 0.4);
    font-family: 'JetBrains Mono', monospace;
  }

  .infra-count.all-ok {
    color: #22c55e;
  }

  .infra-loading {
    font-size: 0.65rem;
    color: rgb(212 199 163 / 0.3);
    text-align: center;
    padding: 1rem 0;
  }

  .infra-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.65rem;
    color: rgb(212 199 163 / 0.5);
  }

  .infra-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #ef4444;
    flex-shrink: 0;
  }

  .infra-dot.online {
    background: #22c55e;
  }

  .infra-label {
    flex: 1;
  }

  .infra-status {
    font-size: 0.55rem;
    font-family: 'JetBrains Mono', monospace;
    color: #ef4444;
  }

  .infra-status.online {
    color: #22c55e;
  }

  .refresh-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    margin-top: auto;
    padding: 0.25rem 0.5rem;
    font-size: 0.55rem;
    font-family: inherit;
    color: rgb(212 199 163 / 0.4);
    background: rgba(212, 199, 163, 0.05);
    border: 1px solid rgba(212, 199, 163, 0.08);
    border-radius: 4px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .refresh-btn:hover {
    color: rgb(212 199 163 / 0.7);
    background: rgba(212, 199, 163, 0.1);
  }

  .refresh-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (max-width: 640px) {
    .pipeline-body {
      grid-template-columns: 1fr;
    }
    .infra-column {
      flex-direction: row;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .infra-header {
      width: 100%;
    }
    .infra-row {
      flex: 0 0 calc(50% - 0.25rem);
    }
  }
</style>
