<script lang="ts">
  import { Tabs } from 'bits-ui';
  import type { ParentAtlasCapabilityCensusV1 } from '$lib/server/atlas/openspec-board/capability-census';
  let { census }: { census: ParentAtlasCapabilityCensusV1 } = $props();
  const groups = $derived([...new Set(census.capabilities.map((c) => c.group))]);
  function tone(s:string){return s==='PROVEN'?'ok':s==='WAITING'?'warn':s==='OPTIONAL_DEFERRED'?'muted':'neutral'}
</script>
<section class="panel">
  <header><div><p class="eyebrow">CAPABILITY CENSUS</p><h2>Parent Atlas substrate</h2></div><code>{census.semanticChecksum.slice(0,12)}</code></header>
  <Tabs.Root value={groups[0] ?? 'DATA'}>
    <Tabs.List aria-label="Capability groups">{#each groups as g}<Tabs.Trigger value={g}>{g}</Tabs.Trigger>{/each}</Tabs.List>
    {#each groups as g}
      <Tabs.Content value={g}>
        <div class="rows">{#each census.capabilities.filter(c=>c.group===g) as c}<article><span class={`state ${tone(c.state)}`}>{c.state}</span><div><strong>{c.label}</strong><small>{c.id} · {c.criticality} · {c.matchingFiles.length} file hints · {c.qualifyingReports.length} proof reports</small></div></article>{/each}</div>
      </Tabs.Content>
    {/each}
  </Tabs.Root>
</section>
<style>
.panel{border:1px solid #8bcfff20;border-radius:14px;background:#0d1824;padding:14px}header{display:flex;justify-content:space-between;gap:16px;align-items:center}.eyebrow{font:800 .65rem ui-monospace;color:#7890a3;letter-spacing:.12em;margin:0}.rows{display:grid;gap:8px;margin-top:10px}article{display:flex;gap:10px;align-items:flex-start;border:1px solid #8bcfff18;border-radius:10px;padding:10px}small{display:block;color:#8399aa;margin-top:3px}.state{font:700 .62rem ui-monospace;padding:.25rem .4rem;border-radius:6px;background:#152434}.ok{color:#65ed83}.warn{color:#f2d46c}.muted{color:#8399aa}.neutral{color:#9bc4df}
</style>
