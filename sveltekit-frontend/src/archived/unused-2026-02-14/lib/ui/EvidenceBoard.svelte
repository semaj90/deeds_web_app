<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</li>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<script lang="ts">
 import Button from './Button.svelte';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

 // ---- Types ----
 type EvidenceType = 'video' | 'document' | 'photo' | 'note';

 type EvidenceItem = {
  id: string;
	title: string;
  type: EvidenceType;
	summary: string;
  x: number;
	y: number;
 };

 type EvidenceConnection = {
  id: string;
	from: string; // evidence id
  to: string; // evidence id
  label?: string;
 };

 let { items: propItems = [], connections: propConnections = [], onSave } = $props<{
  items?: EvidenceItem[];
  connections?: EvidenceConnection[];
  onSave?: (items: EvidenceItem[]) => void;
 }>();

 // ---- Internal state ----
 let items = $state<EvidenceItem[]>(propItems.length > 0 ? propItems : [
  {
  id: 'EV-001',
  title: 'Security Camera – Lobby',
  type: 'video',
  summary: 'Footage from 21:34–21:52 showing suspect entering the lobby.',
  x: 80, y: 120
  },
	{
  id: 'EV-002',
  title: 'Witness Statement – K. Ito',
  type: 'document',
  summary: 'Witness describes verbal threat in parking garage, level B2.',
  x: 380, y: 220
  },
	{
  id: 'EV-003',
  title: 'Access Badge Log',
  type: 'document',
  summary: 'Server room swipes between 20:00 and 22:00.',
  x: 220, y: 390
  },
	{
  id: 'EV-004',
  title: 'Forensic Photo – Scene',
  type: 'photo',
  summary: 'Server room cabinet showing forced entry marks.',
  x: 520, y: 100
  }
 ]);

 let connections = $state<EvidenceConnection[]>(propConnections.length > 0 ? propConnections : [
  { id: 'C-1', from: 'EV-001', to: 'EV-002', label: 'suspect + timeline' },
	{ id: 'C-2', from: 'EV-001', to: 'EV-003', label: 'same individual?' },
	{ id: 'C-3', from: 'EV-003', to: 'EV-004', label: 'access time' }
 ]);

 let boardEl = $state<HTMLDivElement | null>(null);
 let activeId = $state<string | null>(null);
 let offsetX = 0;
 let offsetY = 0;
 let showConnections = $state(true);

 const CARD_WIDTH = 260;
 const CARD_HEIGHT = 140;

 function onCardPointerDown(event: PointerEvent, id: string) {
  const item = items.find(i => i.id === id);
  if (!item || !boardEl) return;

  const rect = boardEl.getBoundingClientRect();
  offsetX = event.clientX - (rect.left + item.x);
  offsetY = event.clientY - (rect.top + item.y);
  activeId = id;

  const handleMove = (e: PointerEvent) => {
  if (!activeId || !boardEl) return;
  const r = boardEl.getBoundingClientRect();
  const x = e.clientX - r.left - offsetX;
  const y = e.clientY - r.top - offsetY;

  items = items.map(i => i.id === activeId ? { ...i, x, y } : i);
  };

  const handleUp = () => {
  activeId = null;
  window.removeEventListener('pointermove', handleMove);
  window.removeEventListener('pointerup', handleUp);
  if (onSave) onSave(items);
  };

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
 }

 function typeLabel(t: EvidenceType) {
  if (t === 'video') return 'VIDEO';
  if (t === 'photo') return 'PHOTO';
  if (t === 'note') return 'NOTE';
  return 'DOCUMENT';
 }

 function centerFor(id: string) {
  const item = items.find(i => i.id === id);
  if (!item) return { x: 0, y: 0 };
  return {
  x: item.x + CARD_WIDTH / 2,
  y: item.y + CARD_HEIGHT / 2
  };
 }

 function addEvidence() {
  const newItem: EvidenceItem = {
  id: `EV-${String(items.length + 1).padStart(3, '0')}`,
  title: 'New Evidence Item',
  type: 'document',
  summary: 'Description pending...',
  x: 50, y: 50
  };
  items = [...items, newItem];
 }

 function resetBoard() {
  if (confirm('Reset all evidence positions?')) {
  items = items.map((item, i) => ({
  ...item,
  x: 80 + (i % 3) * 280,
  y: 100 + Math.floor(i / 3) * 180
  }));
  }
 }
</script>

<div class="panel p-3 flex flex-col gap-3">
 <div class="flex items-center justify-between">
  <div class="heading-sub">Evidence Board – Case Investigation</div>
  <div class="flex gap-2">
  <Button class="bits-btn"
  variant={showConnections ? 'primary' : 'secondary'}
  onclick={() => showConnections = !showConnections}
  >
  <span class="i-heroicons-link mr-1" ></span>
  {showConnections ? 'Hide' : 'Show'} Lines
  </Button>
  <Button class="bits-btn" variant="secondary" onclick={ resetBoard }>
  <span class="i-heroicons-arrow-path mr-1" ></span>
  Reset
  </Button>
  <Button class="bits-btn" variant="primary" onclick={addEvidence}>
  <span class="i-heroicons-plus-20-solid mr-1" ></span>
  Add
  </Button>
  </div>
 </div>

 <div class="text-[10px] font-mono tracking-[0.18em] uppercase text-black/60 px-1">
 Drag cards to arrange your theory • {items.length} items • {connections.length} connections
 </div>

 <div
  bind:this={boardEl}
  class="relative w-full h-[600px] evidence-grid overflow-hidden"
 >
  {#if showConnections}
  <svg class="absolute inset-0 pointer-events-none" style="z-index: 5;">
  {#each connections as c (c.id)}
  {@const from = centerFor(c.from)}
  {@const to = centerFor(c.to)}
  {@const midX = (from.x + to.x) / 2}
  {@const midY = (from.y + to.y) / 2}

  <line
  x1={from.x}
  y1={from.y}
  x2={to.x}
  y2={to.y}
  stroke="#111"
  stroke-width="2"
  stroke-linecap="round"
  />

  <circle cx={from.x} cy={from.y} r="4" fill="#d4c7a3" stroke="#111" stroke-width="2" />
  <circle cx={to.x} cy={to.y} r="4" fill="#d4c7a3" stroke="#111" stroke-width="2" />

  {#if c.label}
  <rect x={midX - 60} y={midY - 14} width="120" height="28" fill="#2f2a22" stroke="#111" stroke-width="1" rx="4" />
  <text x={midX} y={midY + 4} text-anchor="middle" fill="#d4c7a3" font-size="9" font-family="monospace" class="uppercase tracking-wider">
  {c.label}
  </text>
  {/if}
  {/each}
  </svg>
  {/if}

  {#each items as item (item.id)}
  <div
  class="absolute w-[260px] select-none cursor-grab active:cursor-grabbing {activeId === item.id ? 'z-50 scale-105' : 'z-10'}"
  style="transform: translate({item.x}px: {item.y}px); transition: {activeId === item.id ? 'none' : 'transform 0.2s ease'}"
  onpointerdown={(e) => onCardPointerDown(e, item.id)}
  role="presentation"
  >
  <div class="panel-soft p-3 {activeId === item.id ? 'shadow-[0_4px_12px_rgba(0 0 0 0.3)]' : ''}">
  <div class="flex items-center justify-between mb-1">
  <span class="tag {item.type === 'video' ? 'pill-blue' : item.type === 'photo' ? 'pill-green' : 'pill-yellow'}">
  {typeLabel(item.type)}
  </span>
  <span class="text-[10px] font-mono tracking-[0.16em] uppercase text-black/60">
  {item.id}
  </span>
  </div>

  <div class="font-mono text-xs tracking-[0.12em] uppercase mb-1">{item.title}</div>
  <div class="text-[11px] leading-snug text-black/80 line-clamp-4">{item.summary}</div>

  <div class="mt-2 flex items-center justify-between text-[10px] font-mono">
  <span class="text-black/60">
  connections: {connections.filter(c => c.from === item.id || c.to === item.id).length}
  </span>
  <span class="text-accentSoft cursor-pointer hover:text-accent">open ▸</span>
  </div>
  </div>
  </div>
  {/each}
 </div>
</div>

<style>
 .evidence-grid {
 background-color: #d4c7a3;
 background-image: radial-gradient(circle at 1px 1px, rgba(0, 0, 0, 0.25) 1px, transparent 0);
 background-size: 24px 24px;
 border: 1px solid rgba(0, 0, 0, 0.6);
 box-shadow: 0 0 0 2px #000;
 }
</style>



