<script lang="ts">
  interface CommunityRoute {
    id: number;
    domain: string;
    label: string;
    status: 'CONFIGURED' | 'UNROUTED' | 'UNAVAILABLE';
    llmsTxt: string[];
    okfProfile: string | null;
    validationCmd: string | null;
  }

  // Pinned 47 Louvain Communities from scripts/atlas/kag_prefill_router_v1.py
  const configuredRoutes: Record<number, Omit<CommunityRoute, 'id'>> = {
    1: {
      domain: 'Task / Workboard Execution',
      label: 'current source recheck packet graphify snapshot',
      status: 'CONFIGURED',
      llmsTxt: ['docs/llms/generated/sveltekit.llms-full.txt'],
      okfProfile: 'atlas.okf-reconciliation-by-cause.v1',
      validationCmd: 'python scripts/atlas/openspec-task-extract-v1.py --top 10'
    },
    6: {
      domain: 'GPU / sm_86 / Tile Kernels',
      label: 'tile rtx gpu proof',
      status: 'CONFIGURED',
      llmsTxt: ['docs/llms/generated/cuda.llms-full.txt', 'docs/llms/generated/webgpu.llms-full.txt'],
      okfProfile: 'atlas.okf-reconciliation-by-cause.v1',
      validationCmd: 'python scripts/retrieval/embeddinggemma2_shadow_parity_gate.py'
    },
    9: {
      domain: 'Drizzle / PostgreSQL 18 Drift',
      label: 'migration postgresql drizzle audit',
      status: 'CONFIGURED',
      llmsTxt: ['docs/llms/generated/drizzle.llms-full.txt', 'docs/llms/generated/postgres.llms-full.txt'],
      okfProfile: 'atlas.okf-reconciliation-by-cause.v1',
      validationCmd: 'npm run audit:drizzle'
    },
    10: {
      domain: 'Tree-sitter / LangExtract AST',
      label: 'ast langextract symbol evidence',
      status: 'UNAVAILABLE',
      llmsTxt: ['docs/llms/generated/sveltekit.llms-full.txt'],
      okfProfile: '.okf/schemas/okf-concept-gap-v1.schema.json',
      validationCmd: null
    },
    21: {
      domain: 'GPU / cuVS CAGRA Vector Index',
      label: 'cuvs cagra',
      status: 'CONFIGURED',
      llmsTxt: ['docs/llms/generated/cuda.llms-full.txt', 'docs/llms/generated/postgres.llms-full.txt'],
      okfProfile: 'atlas.okf-reconciliation-by-cause.v1',
      validationCmd: 'python scripts/retrieval/embeddinggemma2_shadow_parity_gate.py'
    },
    32: {
      domain: 'Svelte 5 Runes / UI Carousels',
      label: 'fabric studio search rollout',
      status: 'CONFIGURED',
      llmsTxt: ['docs/llms/generated/sveltekit.llms-full.txt', 'docs/llms/generated/webgpu.llms-full.txt'],
      okfProfile: 'atlas.okf-reconciliation-by-cause.v1',
      validationCmd: 'npx vitest run src/lib/components/evidence/EvidenceCarouselGallery.spec.ts'
    }
  };

  const allCommunities: CommunityRoute[] = Array.from({ length: 47 }, (_, i) => {
    const id = i + 1;
    if (configuredRoutes[id]) {
      return { id, ...configuredRoutes[id] };
    }
    return {
      id,
      domain: 'UNROUTED',
      label: 'unrouted community cohort',
      status: 'UNROUTED',
      llmsTxt: [],
      okfProfile: null,
      validationCmd: null
    };
  });

  let selectedId = $state<number>(1);
  const selected = $derived(allCommunities.find((c) => c.id === selectedId) ?? allCommunities[0]);

  const configuredCount = 6;
  const unroutedCount = 41;
  const coveragePercent = Math.round((configuredCount / 47) * 1000) / 10;
</script>

<div class="orbit-panel">
  <div class="panel-head">
    <div>
      <p class="eyebrow">47 LOUVAIN COMMUNITIES · PINNED ROUTER COVERAGE</p>
      <h2>Community Orbit & Routing Topology</h2>
    </div>
    <span class="machine">stamp: 20261107T192448Z · fail-closed routing</span>
  </div>

  <div class="orbit-metrics">
    <article>
      <small>TOTAL COMMUNITIES</small>
      <strong>47</strong>
      <span>Louvain graph clusters</span>
    </article>
    <article class="configured-card">
      <small>EXPLICIT ROUTES</small>
      <strong>{configuredCount}</strong>
      <span>{coveragePercent}% configured</span>
    </article>
    <article class="unrouted-card">
      <small>UNROUTED</small>
      <strong>{unroutedCount}</strong>
      <span>fail-closed protection</span>
    </article>
    <article>
      <small>CANONICAL WRITES</small>
      <strong>DISABLED</strong>
      <span>read-only shadow projection</span>
    </article>
  </div>

  <div class="orbit-layout">
    <!-- Orbital Constellation View -->
    <div class="constellation-view" role="region" aria-label="Community constellation map">
      <svg viewBox="-220 -220 440 440" class="orbit-svg" aria-hidden="true">
        <!-- Concentric Orbital Tracks -->
        <circle cx="0" cy="0" r="60" class="track" />
        <circle cx="0" cy="0" r="110" class="track" />
        <circle cx="0" cy="0" r="160" class="track" />
        <circle cx="0" cy="0" r="200" class="track" />

        <!-- Core Hub -->
        <circle cx="0" cy="0" r="16" class="hub" />
        <text x="0" y="4" text-anchor="middle" class="hub-text">KAG</text>

        <!-- 47 Community Nodes placed in Archimedean / Orbital Pattern -->
        {#each allCommunities as comm (comm.id)}
          {@const angle = (comm.id * 137.5 * Math.PI) / 180}
          {@const radius = 45 + (comm.id / 47) * 155}
          {@const cx = Math.cos(angle) * radius}
          {@const cy = Math.sin(angle) * radius}
          <g
            class="node-group"
            class:selected={selectedId === comm.id}
            class:configured={comm.status === 'CONFIGURED'}
            class:unavailable={comm.status === 'UNAVAILABLE'}
            class:unrouted={comm.status === 'UNROUTED'}
            onclick={() => (selectedId = comm.id)}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectedId = comm.id; }}
            role="button"
            tabindex="0"
            aria-label={`Community ${comm.id}: ${comm.domain}`}
          >
            {#if selectedId === comm.id}
              <circle {cx} {cy} r="12" class="halo" />
            {/if}
            <circle {cx} {cy} r={comm.status === 'CONFIGURED' ? 7 : 4} class="node" />
            {#if comm.status === 'CONFIGURED' || selectedId === comm.id}
              <text x={cx} y={cy - 10} text-anchor="middle" class="node-label">#{comm.id}</text>
            {/if}
          </g>
        {/each}
      </svg>
    </div>

    <!-- Inspector Pane for Selected Community -->
    <div class="detail-card">
      <div class="detail-head">
        <div>
          <span class={`status-tag ${selected.status.toLowerCase()}`}>{selected.status}</span>
          <h3>Community #{selected.id}</h3>
        </div>
        <small class="domain-badge">{selected.domain}</small>
      </div>

      <p class="description">{selected.label}</p>

      <div class="detail-grid">
        <div class="item">
          <small>OKF PROFILE</small>
          <code>{selected.okfProfile ?? 'None (unrouted candidate)'}</code>
        </div>
        <div class="item">
          <small>VALIDATION COMMAND</small>
          <code>{selected.validationCmd ?? 'None (fail-closed)'}</code>
        </div>
      </div>

      <div class="silos">
        <small>GROUNDING SLICES (LLMS.TXT)</small>
        {#if selected.llmsTxt.length > 0}
          <ul>
            {#each selected.llmsTxt as silo}
              <li><code>{silo}</code></li>
            {/each}
          </ul>
        {:else}
          <p class="empty-hint">No grounding slice assigned. Unrouted candidates never borrow unrelated gates.</p>
        {/if}
      </div>

      <div class="advisory-callout">
        <strong>Fidelity Tier: TIER_4_DAG_COMMUNITY_KAG</strong>
        <p>Community coordinates and cluster groupings are advisory routing hints. They do not grant execution authority or override task dependency blockers.</p>
      </div>
    </div>
  </div>
</div>

<style>
  .orbit-panel {
    display: grid;
    gap: 14px;
    padding: 18px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: linear-gradient(180deg, #09121a, #060b12);
  }
  .panel-head {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 12px;
  }
  .panel-head h2 {
    margin: 0.2rem 0;
    font-size: 1.4rem;
  }
  .orbit-metrics {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  .orbit-metrics article {
    padding: 12px;
    border: 1px solid #ffffff0c;
    border-radius: 10px;
    background: #09131c;
  }
  .orbit-metrics small {
    display: block;
    color: var(--muted);
    font: 0.58rem var(--mono);
  }
  .orbit-metrics strong {
    display: block;
    margin-top: 4px;
    font-size: 1.3rem;
  }
  .orbit-metrics span {
    display: block;
    color: #7890a3;
    font-size: 0.68rem;
    margin-top: 3px;
  }
  .configured-card {
    border-color: #4ae5ff44 !important;
  }
  .configured-card strong {
    color: var(--cyan);
  }
  .unrouted-card strong {
    color: var(--amber);
  }

  .orbit-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    align-items: center;
    margin-top: 6px;
  }
  .constellation-view {
    position: relative;
    width: 100%;
    max-width: 480px;
    margin: auto;
    aspect-ratio: 1;
  }
  .orbit-svg {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 0 20px #00f0ff11);
  }
  .track {
    fill: none;
    stroke: #25445e;
    stroke-width: 1;
    stroke-dasharray: 2 6;
  }
  .hub {
    fill: #0c2336;
    stroke: var(--cyan);
    stroke-width: 1.5;
  }
  .hub-text {
    fill: var(--cyan);
    font: 700 8px var(--mono);
  }
  .node-group {
    cursor: pointer;
    outline: none;
  }
  .node {
    transition: r 0.15s ease, fill 0.15s ease;
  }
  .node-group.configured .node {
    fill: var(--cyan);
    filter: drop-shadow(0 0 6px #00f0ff88);
  }
  .node-group.unavailable .node {
    fill: var(--red);
  }
  .node-group.unrouted .node {
    fill: #3b5066;
  }
  .node-group:hover .node,
  .node-group:focus-visible .node {
    r: 9;
    fill: #ffffff;
  }
  .halo {
    fill: none;
    stroke: var(--cyan);
    stroke-width: 1.5;
    animation: pulse 2s infinite ease-in-out;
  }
  .node-label {
    fill: #d5ecff;
    font: 700 8px var(--mono);
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.8; }
    50% { transform: scale(1.15); opacity: 0.3; }
  }

  @media (prefers-reduced-motion: reduce) {
    .halo {
      animation: none;
    }
  }

  .detail-card {
    padding: 16px;
    border: 1px solid #ffffff12;
    border-radius: 12px;
    background: #0b1622;
    display: grid;
    gap: 12px;
  }
  .detail-head {
    display: flex;
    justify-content: space-between;
    align-items: start;
  }
  .detail-head h3 {
    margin: 4px 0 0;
    font-size: 1.25rem;
  }
  .status-tag {
    font: 700 0.6rem var(--mono);
    padding: 2px 6px;
    border-radius: 4px;
    display: inline-block;
  }
  .status-tag.configured {
    background: #00f0ff22;
    color: var(--cyan);
    border: 1px solid var(--cyan);
  }
  .status-tag.unavailable {
    background: #ff8d9822;
    color: var(--red);
    border: 1px solid var(--red);
  }
  .status-tag.unrouted {
    background: #f2d46c22;
    color: var(--amber);
    border: 1px solid var(--amber);
  }
  .domain-badge {
    color: var(--muted);
    font: 0.65rem var(--mono);
  }
  .description {
    color: #9cb4c7;
    margin: 0;
    font-size: 0.85rem;
  }
  .detail-grid {
    display: grid;
    gap: 8px;
  }
  .detail-grid .item small {
    display: block;
    color: var(--muted);
    font: 0.58rem var(--mono);
    margin-bottom: 2px;
  }
  .detail-grid code {
    display: block;
    padding: 6px 8px;
    background: #060d14;
    border: 1px solid #ffffff0a;
    border-radius: 6px;
    color: #bfe5ff;
    font: 0.7rem var(--mono);
    word-break: break-all;
  }
  .silos small {
    display: block;
    color: var(--muted);
    font: 0.58rem var(--mono);
    margin-bottom: 4px;
  }
  .silos ul {
    margin: 0;
    padding-left: 16px;
  }
  .silos li {
    margin-bottom: 4px;
  }
  .silos code {
    font: 0.68rem var(--mono);
    color: #79aecd;
  }
  .empty-hint {
    margin: 0;
    color: var(--muted);
    font-size: 0.75rem;
  }
  .advisory-callout {
    padding: 10px;
    border: 1px dashed var(--line);
    border-radius: 8px;
    background: #08121a;
  }
  .advisory-callout strong {
    display: block;
    color: var(--amber);
    font: 0.65rem var(--mono);
  }
  .advisory-callout p {
    margin: 4px 0 0;
    color: #8fa6b8;
    font-size: 0.72rem;
  }

  @media (max-width: 900px) {
    .orbit-layout {
      grid-template-columns: 1fr;
    }
    .orbit-metrics {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
