<script lang="ts">
  import { Tabs } from 'bits-ui';
  import type { ParentAtlasCapabilityCensusV1 } from '$lib/server/atlas/openspec-board/capability-census';

  let { census }: { census: ParentAtlasCapabilityCensusV1 } = $props();
  const groups = $derived([...new Set(census.capabilities.map((capability) => capability.group))]);
  const tone = (state: string) => state === 'PROVEN' ? 'ok' : state === 'WAITING' ? 'warn' : state === 'OPTIONAL_DEFERRED' ? 'muted' : 'neutral';
</script>

<section class="panel" aria-label="Parent Atlas capability census">
  <header>
    <div><p class="eyebrow">CAPABILITY CENSUS</p><h2>Parent Atlas substrate</h2></div>
    <code>{census.semanticChecksum.slice(0, 12)}</code>
  </header>
  <Tabs.Root value={groups[0] ?? 'DATA'}>
    <Tabs.List aria-label="Capability groups">
      {#each groups as group}<Tabs.Trigger value={group}>{group}</Tabs.Trigger>{/each}
    </Tabs.List>
    {#each groups as group}
      <Tabs.Content value={group}>
        <div class="rows">
          {#each census.capabilities.filter((capability) => capability.group === group) as capability}
            <article>
              <span class={`state ${tone(capability.state)}`}>{capability.state}</span>
              <div><strong>{capability.label}</strong><small>{capability.id} · {capability.criticality} · {capability.matchingFiles.length} files · {capability.qualifyingReports.length} reports</small></div>
            </article>
          {/each}
        </div>
      </Tabs.Content>
    {/each}
  </Tabs.Root>
</section>

<style>
  .panel{border:1px solid #8bcfff20;border-radius:14px;background:#0d1824;padding:14px}
  header{display:flex;justify-content:space-between;gap:16px;align-items:center}
  .eyebrow{font:800 .65rem ui-monospace;color:#7890a3;letter-spacing:.12em;margin:0}
  .rows{display:grid;gap:8px;margin-top:10px}
  article{display:flex;gap:10px;align-items:flex-start;border:1px solid #8bcfff18;border-radius:10px;padding:10px}
  small{display:block;color:#8399aa;margin-top:3px}
  .state{font:700 .62rem ui-monospace;padding:.25rem .4rem;border-radius:6px;background:#152434}
  .ok{color:#65ed83}.warn{color:#f2d46c}.muted{color:#8399aa}.neutral{color:#9bc4df}
</style>
