<script lang="ts">
 import Panel from '$lib/ui/Panel.svelte';
 import Card from '$lib/ui/Card.svelte';
 import Button from '$lib/ui/Button.svelte';
 import StatusPill from '$lib/ui/StatusPill.svelte';

 const cases = [
 {
 id: 'CASE-001',
 title: 'Corporate Espionage Investigation',
 items: 8,
 updated: '2 hours ago',
 risk: 'high' as const,
 status: 'active' as const,
 },
 {
 id: 'CASE-002',
 title: 'Human Trafficking / Forced Labor',
 items: 15,
 updated: '4 hours ago',
 risk: 'high' as const,
 status: 'active' as const,
 },
 {
 id: 'CASE-003',
 title: 'Financial Fraud Analysis',
 items: 4,
 updated: '1 day ago',
 risk: 'medium' as const,
 status: 'pending' as const,
 },
 ] as const;

 const systemStatus = [
 {
 type: 'ok',
 message: 'Evidence queue processed successfully',
 time: '10 min ago',
 },
 {
 type: 'warn',
 message: 'OCR pipeline experiencing mild backlog',
 time: '1 hour ago',
 },
 {
 type: 'info',
 message: 'New facial recognition matches found',
 time: '2 hours ago',
 },
 ];
</script>

<div class="grid grid-cols-[2fr_1fr] gap-4">
 <!-- Left: stats + active cases -->
 <div class="flex flex-col gap-4">
 <Panel>
 <div class="grid grid-cols-3 gap-4 text-xs font-mono tracking-[0.18em] uppercase">
 <div class="panel-soft p-3">
 <div class="text-black/60">Active Cases</div>
 <div class="mt-2 text-2xl">{cases.length}</div>
 </div>
 <div class="panel-soft p-3">
 <div class="text-black/60">Evidence Items</div>
 <div class="mt-2 text-2xl">27</div>
 </div>
 <div class="panel-soft p-3">
 <div class="text-black/60">Persons of Interest</div>
 <div class="mt-2 text-2xl">8</div>
 </div>
 </div>
 </Panel>

 <Panel>
 <div class="flex items-center justify-between mb-3">
 <div class="heading-sub">Active Cases</div>
 <Button class="bits-btn" variant="secondary">View All</Button>
 </div>

 <div class="flex flex-col gap-3">
 {#each cases as c}
 <Card clickable>
 <div class="flex items-center justify-between">
 <div>
 <div class="font-mono text-xs tracking-[0.16em] uppercase text-black/60">
 {c.id}
 </div>
 <div class="mt-1 text-sm font-semibold tracking-[0.06em]">
 {c.title}
 </div>
 <div class="mt-1 text-[11px] text-black/70">
 {c.items} evidence items • updated {c.updated}
 </div>
 </div>
 <div class="flex flex-col items-end gap-2">
 <StatusPill risk={c.risk} status={c.status} />
 <Button class="bits-btn" variant="primary">Open Case</Button>
 </div>
 </div>
 </Card>
 {/each}
 </div>
 </Panel>
 </div>

 <!-- Right column: system status + quick actions -->
 <div class="flex flex-col gap-4">
 <Panel>
 <div class="heading-sub mb-3">System Status</div>
 <div class="flex flex-col gap-2 text-xs">
 {#each systemStatus as s}
 <div class="panel-soft px-3 py-2 flex items-center gap-2">
 {#if s.type === 'ok'}
 <span class="i-heroicons-check-circle text-green-400" ></span>
 {:else if s.type === 'warn'}
 <span class="i-heroicons-exclamation-triangle text-yellow-300" ></span>
 {:else}
 <span class="i-heroicons-information-circle text-blue-300" ></span>
 {/if}
 <div class="flex-1">
 <div>{s.message}</div>
 <div class="text-[10px] text-black/60 mt-0.5">{s.time}</div>
 </div>
 </div>
 {/each}
 </div>
 </Panel>

 <Panel>
 <div class="heading-sub mb-3">Quick Actions</div>
 <div class="flex flex-col gap-2">
 <Button class="bits-btn" variant="secondary">Open Evidence Board</Button>
 <Button class="bits-btn" variant="secondary">Timeline Analysis</Button>
 <Button class="bits-btn" variant="secondary">
 <span class="i-heroicons-chat-bubble-left-right mr-2" ></span>
 AI Sentencing Assistant
 </Button>
 </div>
 </Panel>
 </div>
</div>

