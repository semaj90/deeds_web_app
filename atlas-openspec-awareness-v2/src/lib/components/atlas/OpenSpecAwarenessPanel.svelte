<script lang="ts">
  import { Tabs } from 'bits-ui';
  import type { AtlasAwarenessSnapshotV2 } from '$lib/server/atlas/openspec-board/awareness';

  let { awareness }: { awareness: AtlasAwarenessSnapshotV2 } = $props();

  const protocolGates = $derived(
    awareness.readiness.gates.filter((gate) => /ACP|A2A|HUMAN|PYTORCH|LEARNING/.test(gate.key))
  );

  function authorityDetail(gate: { details?: Record<string, unknown> }) {
    const value = gate.details?.authority;
    return typeof value === 'string' ? value : '';
  }

  function tone(state: string) {
    if (state === 'PROVEN') return 'ok';
    if (state === 'READY') return 'action';
    if (state === 'WAITING') return 'warn';
    if (state === 'PARTIAL') return 'partial';
    return 'muted';
  }
</script>

<section class="awareness panel">
  <div class="panel-head">
    <div><p class="eyebrow">CODE / RUNTIME / HUMAN AWARENESS</p><h2>Atlas graph & readiness</h2></div>
    <span class="machine">read-only · receipt-gated</span>
  </div>

  <div class="mini-summary">
    <article><small>FILES</small><strong>{awareness.progress.directoryFiles.toLocaleString()}</strong></article>
    <article><small>IMPORT EDGES</small><strong>{awareness.progress.directoryEdges.toLocaleString()}</strong></article>
    <article><small>TASK→FILE LINKS</small><strong>{awareness.progress.taskFileLinks.toLocaleString()}</strong></article>
    <article><small>KMEANS</small><strong>{awareness.progress.kmeansClusters}</strong></article>
    <article><small>READY PROOFS</small><strong>{Number(awareness.readiness.summary.PROVEN ?? 0)}</strong></article>
  </div>

  <Tabs.Root value="readiness">
    <Tabs.List class="subtabs" aria-label="Atlas awareness views">
      <Tabs.Trigger value="readiness">Readiness</Tabs.Trigger>
      <Tabs.Trigger value="dag">DAG / files</Tabs.Trigger>
      <Tabs.Trigger value="clusters">Clusters</Tabs.Trigger>
      <Tabs.Trigger value="protocols">ACP / A2A / HITL</Tabs.Trigger>
      <Tabs.Trigger value="tournament">Tournament</Tabs.Trigger>
      <Tabs.Trigger value="progression">Progression</Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="readiness">
      <div class="gate-grid">
        {#each awareness.readiness.gates as gate (gate.key)}
          <article><span class={`state ${tone(gate.state)}`}>{gate.state}</span><strong>{gate.key}</strong><small>{gate.blockers.length ? gate.blockers.join(' · ') : 'no blocker recorded'}</small><em>{gate.evidence.length} evidence ref(s)</em></article>
        {:else}<p class="empty">Runtime readiness audit has not been generated.</p>{/each}
      </div>
    </Tabs.Content>

    <Tabs.Content value="dag">
      <div class="two-col">
        <div><h3>Directory relation links</h3>{#each awareness.fileGraph.directoryEdges.slice(0, 40) as edge}<div class="edge"><code>{edge.from || '/'}</code><span>→</span><code>{edge.to || '/'}</code><b>{edge.count}</b></div>{:else}<p class="empty">Generate openspec-directory-graph-v1.json.</p>{/each}</div>
        <div><h3>Directory density</h3>{#each awareness.fileGraph.topDirectories.slice(0, 30) as dir}<div class="dir"><strong>{dir.directory || '/'}</strong><span>{dir.files} files · in {dir.inboundEdges} · out {dir.outboundEdges}</span><small>{dir.topics.map((x) => `${x.topic}:${x.count}`).join(' · ')}</small></div>{/each}</div>
      </div>
    </Tabs.Content>

    <Tabs.Content value="clusters">
      <div class="cluster-grid">
        {#each awareness.clusters as cluster (cluster.clusterId)}
          <article><div><strong>Cluster {cluster.clusterId}</strong><b>{cluster.count}</b></div><small>{cluster.dominantTopics.map((x) => `${x.topic}:${x.count}`).join(' · ')}</small><p>{cluster.sampleFiles.slice(0, 5).join(' · ')}</p></article>
        {:else}<p class="empty">Structural KMeans challenger has not been generated.</p>{/each}
      </div>
    </Tabs.Content>

    <Tabs.Content value="protocols">
      <div class="gate-grid">
        {#each protocolGates as gate (gate.key)}
          <article><span class={`state ${tone(gate.state)}`}>{gate.state}</span><strong>{gate.key}</strong><small>{gate.blockers.join(' · ') || 'receipt satisfied'}</small><em>{authorityDetail(gate)}</em></article>
        {:else}<p class="empty">No protocol/human-learning readiness gates found.</p>{/each}
      </div>
      <p class="rule">Protocol configuration ≠ compliance. Human decisions are receipts. PyTorch/reinforcement outputs stay shadow-only until an evaluation and promotion receipt exists.</p>
    </Tabs.Content>

    <Tabs.Content value="tournament">
      <div class="tournament">
        {#each awareness.tournament.slice(0, 50) as row (row.taskId)}
          <article><code>{row.taskId}</code><span>det {row.deterministicRank ?? '—'}</span><span>challenger {row.challengerRank ?? '—'}</span><b>{row.rankDelta == null ? '—' : `${row.rankDelta > 0 ? '+' : ''}${row.rankDelta}`}</b></article>
        {:else}<p class="empty">No challenger tournament yet. Deterministic rank remains authority.</p>{/each}
      </div>
    </Tabs.Content>

    <Tabs.Content value="progression">
      <ol class="progression">{#each awareness.progress.progression as step}<li>{step}</li>{/each}</ol>
      <div class="rules">{#each awareness.invariants as invariant}<p>• {invariant}</p>{/each}</div>
    </Tabs.Content>
  </Tabs.Root>
</section>

<style>
  .awareness{margin-bottom:12px}.mini-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:10px 0 14px}.mini-summary article{padding:10px;border:1px solid var(--line);border-radius:10px;background:#09131c}.mini-summary small{display:block;color:var(--muted);font:.58rem var(--mono)}.mini-summary strong{font-size:1.15rem}.subtabs{display:flex;gap:6px;overflow:auto;margin-bottom:12px}.subtabs :global(button){border:1px solid var(--line);border-radius:8px;background:#0d1a26;color:#a9bdcb;padding:.5rem .65rem;font:700 .65rem var(--mono);cursor:pointer}.subtabs :global(button[data-state='active']){background:#153042;color:var(--cyan)}
  .gate-grid,.cluster-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.gate-grid article,.cluster-grid article{padding:11px;border:1px solid #ffffff0d;border-radius:10px;background:#08121b}.gate-grid strong{display:block;margin:.35rem 0}.gate-grid small,.gate-grid em,.cluster-grid small{display:block;color:var(--muted);font-style:normal}.state{display:inline-block;font:700 .58rem var(--mono);padding:.2rem .35rem;border:1px solid var(--line);border-radius:5px}.state.ok{color:var(--green)}.state.action{color:var(--cyan)}.state.warn{color:var(--amber)}.state.partial{color:#bea7ff}.state.muted{color:var(--muted)}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:14px}.edge{display:grid;grid-template-columns:minmax(0,1fr) 20px minmax(0,1fr) 45px;gap:6px;padding:6px 0;border-bottom:1px solid #ffffff0d}.edge code{overflow:hidden;text-overflow:ellipsis}.edge b{text-align:right}.dir{padding:7px 0;border-bottom:1px solid #ffffff0d}.dir strong,.dir span,.dir small{display:block}.dir span,.dir small{color:var(--muted)}.cluster-grid article>div{display:flex;justify-content:space-between}.cluster-grid p{color:#8da4b5;font-size:.75rem}.tournament article{display:grid;grid-template-columns:minmax(0,1fr) 90px 110px 50px;gap:8px;padding:7px;border-bottom:1px solid #ffffff0d}.tournament b{text-align:right}.progression{columns:2;gap:30px}.progression li{margin:0 0 .45rem;color:#a9bdcb}.rules,.rule{color:#879dad;font-size:.8rem}.empty{color:var(--muted)}
  @media(max-width:900px){.mini-summary{grid-template-columns:repeat(2,1fr)}.gate-grid,.cluster-grid,.two-col{grid-template-columns:1fr}.progression{columns:1}}
</style>
