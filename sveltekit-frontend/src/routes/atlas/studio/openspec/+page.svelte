<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { Progress, Tabs } from 'bits-ui';
  import type { PageData } from './$types';
  import OpenSpecAwarenessPanel from '$lib/components/atlas/OpenSpecAwarenessPanel.svelte';
  import CapabilityCensusPanel from '$lib/components/atlas/CapabilityCensusPanel.svelte';

  let { data }: { data: PageData } = $props();
  let streamState = $state<'connecting' | 'live' | 'reconnecting'>('connecting');
  let lastRefresh = $state(Date.now());

  const completionPercent = $derived(
    data.board.summary.total > 0
      ? Math.round((data.board.summary.proven / data.board.summary.total) * 1000) / 10
      : 0
  );

  const missingReports = $derived(data.board.reports.filter((report) => !report.exists));

  onMount(() => {
    const source = new EventSource('/atlas/studio/openspec/events');
    source.addEventListener('ready', () => (streamState = 'live'));
    source.addEventListener('changed', async () => {
      streamState = 'live';
      lastRefresh = Date.now();
      await invalidate('atlas:openspec-board');
    });
    source.onerror = () => (streamState = 'reconnecting');
    return () => source.close();
  });

  function stateTone(state: string) {
    if (state === 'PROVEN') return 'ok';
    if (state === 'ACTIONABLE') return 'action';
    if (state.startsWith('WAITING_')) return 'warn';
    if (state === 'DEFERRED' || state === 'SUPERSEDED') return 'muted';
    return 'neutral';
  }

  function formatAge(ms: number) {
    if (!ms) return 'missing';
    const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.round(minutes / 60)}h ago`;
  }
</script>

<svelte:head>
  <title>Parent Atlas · OpenSpec Board</title>
  <meta name="description" content="SSR Parent Atlas OpenSpec execution-controller, blocker, cluster and actionable-work board." />
</svelte:head>

<div class="board-shell">
  <header class="hero">
    <div>
      <p class="eyebrow">PARENT ATLAS · OPENSPEC EXECUTION CONTROL</p>
      <h1>Completion Board</h1>
      <p class="lede">Server-rendered projection of the read-only execution controller. Reports remain authority; PostgreSQL history and recommendation signals remain downstream projections.</p>
    </div>
    <div class="hero-actions">
      <a href="/atlas/studio">Studio</a>
      <a href="/atlas/runs">Agent runs</a>
      <span class:live={streamState === 'live'} class="stream">● {streamState}</span>
    </div>
  </header>

  <section class="summary">
    <article><small>TOTAL LEDGER</small><strong>{data.board.summary.total.toLocaleString()}</strong></article>
    <article><small>PROVEN</small><strong>{data.board.summary.proven.toLocaleString()}</strong></article>
    <article class="action-card"><small>ACTIONABLE</small><strong>{data.board.summary.actionable.toLocaleString()}</strong></article>
    <article><small>WAITING</small><strong>{data.board.summary.waiting.toLocaleString()}</strong></article>
    <article><small>DEFERRED</small><strong>{(data.board.summary.deferred + data.board.summary.superseded).toLocaleString()}</strong></article>
    <article><small>WRITES</small><strong>{data.board.summary.writesPerformed ? 'YES' : 'NO'}</strong></article>
  </section>

  <section class="panel progress-panel">
    <div class="panel-head">
      <div><p class="eyebrow">LEDGER COMPLETENESS · NOT SCHEDULER PRIORITY</p><h2>{completionPercent}% proven</h2></div>
      <span class:stale={data.board.freshness.stale} class="machine">{data.board.freshness.newestReport ?? 'no report'} · {formatAge(data.board.freshness.newestMtimeMs)}</span>
    </div>
    <Progress.Root class="progress" value={completionPercent} max={100} aria-label={`${completionPercent}% ledger proven`}>
      <div class="fill" style:width={`${completionPercent}%`}></div>
    </Progress.Root>
  </section>

  <OpenSpecAwarenessPanel awareness={data.awareness} />
  <section class="notice" aria-label="Utility helper readiness">
    <strong>Utility helpers: {data.awareness.utilityHelpers.status}</strong>
    <span>{data.awareness.utilityHelpers.helperCount} audited · {data.awareness.utilityHelpers.waiting} gated · canonical writes disabled.</span>
  </section>
  {#if data.capabilityCensus}
    <CapabilityCensusPanel census={data.capabilityCensus} />
  {/if}

  {#if missingReports.length}
    <section class="notice warn">
      <strong>{missingReports.length} optional/expected report(s) are not present.</strong>
      <span>{missingReports.map((x) => x.name).join(', ')}</span>
    </section>
  {/if}

  <Tabs.Root value="actionable" class="tabs">
    <Tabs.List class="tab-list" aria-label="OpenSpec board views">
      <Tabs.Trigger value="actionable">Actionable</Tabs.Trigger>
      <Tabs.Trigger value="blockers">Blockers</Tabs.Trigger>
      <Tabs.Trigger value="topics">Topics</Tabs.Trigger>
      <Tabs.Trigger value="changes">Changes</Tabs.Trigger>
      <Tabs.Trigger value="reports">Reports</Tabs.Trigger>
    </Tabs.List>

    <Tabs.Content value="actionable" class="panel tab-panel">
      <div class="panel-head"><div><p class="eyebrow">ONLY RUNNABLE WORK</p><h2>Actionable tasks</h2></div><span class="machine">selection authority remains upstream</span></div>
      <div class="task-list">
        {#each data.board.tasks.filter((task) => task.state === 'ACTIONABLE').slice(0, 250) as task (task.id)}
          <article>
            <span class={`state ${stateTone(task.state)}`}>{task.state}</span>
            <div><strong>{task.title}</strong><small>{task.changeId} · {task.topic}{task.priority ? ` · ${task.priority}` : ''}</small></div>
          </article>
        {:else}<p class="empty">No ACTIONABLE rows were found in the current report projection.</p>{/each}
      </div>
    </Tabs.Content>

    <Tabs.Content value="blockers" class="panel tab-panel">
      <div class="panel-head"><div><p class="eyebrow">RELEASE-EVENT AWARE</p><h2>Blocker groups</h2></div></div>
      <div class="blocker-grid">
        {#each data.board.blockers as blocker (blocker.key)}
          <article><strong>{blocker.count.toLocaleString()}</strong><h3>{blocker.key}</h3><p>{blocker.meaning ?? 'No meaning recorded'}</p><small>owner: {blocker.owner ?? 'unresolved'}</small><small>release: {blocker.releaseEvent ?? 'not recorded'}</small><small>retry: {blocker.retryPolicy ?? 'not recorded'}</small></article>
        {:else}<p class="empty">No blocker audit rows found.</p>{/each}
      </div>
    </Tabs.Content>

    <Tabs.Content value="topics" class="panel tab-panel">
      <div class="panel-head"><div><p class="eyebrow">DETERMINISTIC ONTOLOGY CLUSTERING</p><h2>Topics & concepts</h2></div><span class="machine">advisory navigation only</span></div>
      <div class="contract"><strong>Topic identity readiness</strong><p>{data.awareness.topicIdentities.status} · {data.awareness.topicIdentities.uniqueTopicIds} topic UUIDs · {data.awareness.topicIdentities.uniqueTitleIds} compatibility title IDs.</p><small>Derived report only; canonical authority: {data.awareness.topicIdentities.canonicalAuthority ? 'enabled' : 'disabled'}; writes: {data.awareness.topicIdentities.writesPerformed ? 'enabled' : 'disabled'}.</small></div>
      <div class="topic-grid">
        {#each data.clusters as cluster (cluster.id)}
          <article>
            <div class="topic-head"><strong>{cluster.label}</strong><b>{cluster.count}</b></div>
            <small>{cluster.actionable} actionable · {cluster.waiting} waiting · {cluster.proven} proven</small>
            <p>{cluster.concepts.join(' · ')}</p>
            <div class="chips">{#each cluster.changes.slice(0, 6) as change}<span>{change}</span>{/each}</div>
          </article>
        {/each}
      </div>
    </Tabs.Content>

    <Tabs.Content value="changes" class="panel tab-panel">
      <div class="panel-head"><div><p class="eyebrow">TASK DENSITY</p><h2>Most represented OpenSpec changes</h2></div></div>
      <div class="change-list">
        {#each data.topChanges as change, index (change.changeId)}
          <article><b>{index + 1}</b><span>{change.changeId}</span><strong>{change.count}</strong></article>
        {/each}
      </div>
    </Tabs.Content>

    <Tabs.Content value="reports" class="panel tab-panel">
      <div class="panel-head"><div><p class="eyebrow">SERVER-ONLY FILE READS</p><h2>Report provenance</h2></div><span class="machine">checksum {data.board.semanticChecksum.slice(0, 12)}</span></div>
      <div class="report-list">
        {#each data.board.reports as report (report.name)}
          <article class:missing={!report.exists}><div><strong>{report.name}</strong><small>{report.exists ? `${report.size.toLocaleString()} bytes · ${formatAge(report.mtimeMs)}` : 'not present'}</small></div><code>{report.sha256?.slice(0, 16) ?? '—'}</code></article>
        {/each}
      </div>
      <div class="contract"><strong>Persistence contract</strong><p>{data.persistence.authority}; {data.persistence.postgresRole}. Browser writes: {data.persistence.writesPerformed ? 'enabled' : 'disabled'}.</p><p>Referenced source files discovered from current task rows: {data.referencedFileCount}.</p></div>
    </Tabs.Content>
  </Tabs.Root>

  <footer>
    <span>SSR snapshot → report-change SSE → SvelteKit invalidate → fresh server snapshot</span>
    <span>last UI refresh {new Date(lastRefresh).toLocaleTimeString()}</span>
  </footer>
</div>

<style>
  :global(body){margin:0;background:#070d14;color:#eaf5ff;font-family:Inter,system-ui,sans-serif}:global(*){box-sizing:border-box}:global(:root){--line:#8bcfff25;--panel:#0d1824;--muted:#8399aa;--cyan:#4ae5ff;--green:#65ed83;--red:#ff8d98;--amber:#f2d46c;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  .board-shell{max-width:1680px;margin:auto;padding:24px}.hero{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:18px}.eyebrow{margin:0;color:#7890a3;font:800 .65rem var(--mono);letter-spacing:.12em}.hero h1{font-size:clamp(2.4rem,5vw,5rem);line-height:.95;margin:.3rem 0}.lede{max-width:900px;color:#91a6b7}.hero-actions{display:flex;gap:8px;align-items:center}.hero-actions a{border:1px solid var(--line);border-radius:9px;background:#142334;color:#eaf5ff;padding:.65rem .8rem;text-decoration:none}.stream{font:700 .7rem var(--mono);color:var(--amber)}.stream.live{color:var(--green)}
  .summary{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:12px}.summary article,.panel,.notice{border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,#0e1a27,#0a141e)}.summary article{padding:13px}.summary small{display:block;color:var(--muted);font:.58rem var(--mono)}.summary strong{display:block;margin-top:5px;font-size:1.25rem}.summary .action-card{border-color:#4ae5ff55;box-shadow:inset 0 0 30px #4ae5ff08}
  .panel{padding:16px;margin-bottom:12px}.panel-head{display:flex;justify-content:space-between;gap:16px;align-items:start}.panel h2{margin:.15rem 0 .65rem}.machine{font:.68rem var(--mono);color:var(--muted)}.machine.stale{color:var(--amber)}.progress{height:8px;border-radius:999px;overflow:hidden;background:#142536}.fill{height:100%;background:linear-gradient(90deg,#2aa6ff,#56edbe)}.notice{padding:12px 14px;margin-bottom:12px}.notice.warn{border-color:#f2d46c55}.notice span{display:block;color:var(--muted);margin-top:4px}
  .tab-list{display:flex;gap:7px;overflow:auto;margin:0 0 10px}.tab-list :global(button){border:1px solid var(--line);border-radius:9px;background:#101d2a;color:#a9bdcb;padding:.6rem .78rem;font:700 .7rem var(--mono);cursor:pointer}.tab-list :global(button[data-state='active']){color:#041219;background:var(--cyan);border-color:var(--cyan)}.tab-panel{min-height:380px}
  .task-list{display:grid;gap:7px}.task-list article{display:grid;grid-template-columns:max-content 1fr;gap:11px;align-items:start;padding:10px;border:1px solid #ffffff0c;border-radius:10px;background:#09131c}.task-list strong{display:block}.task-list small{color:var(--muted)}.state{font:700 .6rem var(--mono);padding:.28rem .38rem;border-radius:6px;border:1px solid var(--line)}.state.ok{color:var(--green)}.state.action{color:var(--cyan)}.state.warn{color:var(--amber)}.state.muted{color:var(--muted)}
  .blocker-grid,.topic-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.blocker-grid article,.topic-grid article{padding:13px;border:1px solid #ffffff0c;border-radius:12px;background:#09131c}.blocker-grid h3{margin:.2rem 0}.blocker-grid p,.topic-grid p{color:#9aafbd}.blocker-grid small{display:block;color:var(--muted);margin-top:3px}.topic-head{display:flex;justify-content:space-between}.topic-grid small{color:var(--muted)}.chips{display:flex;flex-wrap:wrap;gap:5px}.chips span{font:.6rem var(--mono);padding:.25rem .35rem;border:1px solid var(--line);border-radius:5px;color:#a9bdcb}
  .change-list,.report-list{display:grid;gap:6px}.change-list article,.report-list article{display:grid;grid-template-columns:40px 1fr max-content;gap:10px;padding:9px;border-bottom:1px solid #ffffff0d}.report-list article{grid-template-columns:1fr max-content}.report-list small{display:block;color:var(--muted)}.report-list code{font: .68rem var(--mono);color:#7aa6bd}.report-list .missing{opacity:.55}.contract{margin-top:18px;padding:12px;border:1px dashed var(--line);border-radius:10px;color:#9aafbd}.contract p{margin:.35rem 0}.empty{color:var(--muted)}footer{display:flex;justify-content:space-between;gap:12px;color:#6f8799;font:.65rem var(--mono);padding:10px 2px}
  @media(max-width:900px){.hero{align-items:start;flex-direction:column}.summary{grid-template-columns:repeat(2,1fr)}.blocker-grid,.topic-grid{grid-template-columns:1fr}footer{flex-direction:column}}
</style>
