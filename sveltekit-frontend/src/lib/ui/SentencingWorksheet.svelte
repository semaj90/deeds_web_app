<script lang="ts">
 import Button from './Button.svelte';
 import Panel from './Panel.svelte';
 import Tag from './Tag.svelte';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

 type AggravatingFactor = {
 id: string;
	description: string;
 points: number;
	selected: boolean;
 };

 type MitigatingFactor = {
 id: string;
	description: string;
 points: number;
	selected: boolean;
 };

 let caseId = 'CASE-002';
 let offenseLevel = $state(24);
 let criminalHistory = $state(3);

 let aggravatingFactors = $state<AggravatingFactor[]>([
 { id: 'AG-1', description: 'Multiple victims (15+)', points: 4, selected: true },
	{ id: 'AG-2', description: 'Vulnerable victims (economic distress)', points: 2, selected: true },
	{ id: 'AG-3', description: 'Extended duration (2+ years)', points: 3, selected: true },
	{ id: 'AG-4', description: 'Use of coercion and threats', points: 2, selected: true },
	{ id: 'AG-5', description: 'Leadership/management role', points: 4, selected: false }]);

 let mitigatingFactors = $state<MitigatingFactor[]>([
 { id: 'MIT-1', description: 'Acceptance of responsibility', points: -3, selected: false },
	{ id: 'MIT-2', description: 'Minimal role in offense', points: -4, selected: false },
	{ id: 'MIT-3', description: 'Mental health condition', points: -2, selected: false },
	{ id: 'MIT-4', description: 'Cooperation with authorities', points: -2, selected: false }]);

 let selectedAggravating = $derived(aggravatingFactors.filter(f => f.selected));
 let selectedMitigating = $derived(mitigatingFactors.filter(f => f.selected));
 let aggravatingPoints = $derived(selectedAggravating.reduce((sum, f) => sum + f.points, 0));
 let mitigatingPoints = $derived(selectedMitigating.reduce((sum, f) => sum + f.points, 0));
 let adjustedOffenseLevel = $derived(offenseLevel + aggravatingPoints + mitigatingPoints);
 let sentencingRange = $derived(calculateRange(adjustedOffenseLevel, criminalHistory));

 function calculateRange(level: number, history: number): {
	min: number, max: number } {
 // Simplified Federal Sentencing Guidelines calculation (months)
 const baseMin = level * 4 + history * 6;
 const baseMax = level * 5 + history * 8;
 return { min: baseMin, max: baseMax };
 }

 function toggleAggravating(id: string) {
 aggravatingFactors = aggravatingFactors.map(f =>
 f.id === id ? { ...f, selected: !f.selected } : f
 );
 }

 function toggleMitigating(id: string) {
 mitigatingFactors = mitigatingFactors.map(f =>
 f.id === id ? { ...f, selected: !f.selected } : f
 );
 }

 function generateMemo() {
 alert('Generating sentencing memo...\n(Wire to backend API)');
 }
</script>

<div class="grid grid-cols-[1.5fr_1fr] gap-4">
 <!-- Left, Factors -->
 <div class="flex flex-col gap-4">
 <Panel>
 <div class="heading-sub mb-3">Case Information</div>

 <div class="grid grid-cols-3 gap-3 text-xs">
 <div class="panel-soft p-2">
 <div class="text-black/60 text-[10px] uppercase tracking-wider mb-1">Case ID</div>
 <div class="font-mono">{caseId}</div>
 </div>
 <div class="panel-soft p-2">
 <div class="text-black/60 text-[10px] uppercase tracking-wider mb-1">Base Offense Level</div>
 <input
 type="number"
 bind:value={offenseLevel}
 class="w-full bg-sandDark text-black px-2 py-1 rounded border border-black/40 font-mono"
 />
 </div>
 <div class="panel-soft p-2">
 <div class="text-black/60 text-[10px] uppercase tracking-wider mb-1">Criminal History</div>
 <input
 type="number"
 bind:value={criminalHistory}
 class="w-full bg-sandDark text-black px-2 py-1 rounded border border-black/40 font-mono"
 />
 </div>
 </div>
 </Panel>

 <Panel>
 <div class="flex items-center justify-between mb-3">
 <div class="heading-sub">Aggravating Factors</div>
 <Tag color="red">+{aggravatingPoints} levels</Tag>
 </div>

 <div class="flex flex-col gap-2">
 {#each aggravatingFactors as factor}
 <button
 class="text-left panel-soft px-3 py-2 flex items-center gap-3 cursor-pointer
 hover:bg-panel {factor.selected ? 'ring-2 ring-danger/50' : ''}"
 onclick={() => toggleAggravating(factor.id)}
 >
 <div class="w-4 h-4 rounded border border-black/60 flex items-center justify-center
 {factor.selected ? 'bg-danger' : 'bg-sandDark'}">
 {#if factor.selected}
 <span class="i-heroicons-check text-white text-xs" ></span>
 {/if}
 </div>
 <div class="flex-1">
 <div class="text-xs">{factor.description}</div>
 </div>
 <div class="font-mono text-xs text-danger">+{factor.points}</div>
 </button>
 {/each}
 </div>
 </Panel>

 <Panel>
 <div class="flex items-center justify-between mb-3">
 <div class="heading-sub">Mitigating Factors</div>
 <Tag color="green">{mitigatingPoints} levels</Tag>
 </div>

 <div class="flex flex-col gap-2">
 {#each mitigatingFactors as factor}
 <button
 class="text-left panel-soft px-3 py-2 flex items-center gap-3 cursor-pointer
 hover:bg-panel {factor.selected ? 'ring-2 ring-accent/50' : ''}"
 onclick={() => toggleMitigating(factor.id)}
 >
 <div class="w-4 h-4 rounded border border-black/60 flex items-center justify-center
 {factor.selected ? 'bg-accent' : 'bg-sandDark'}">
 {#if factor.selected}
 <span class="i-heroicons-check text-black text-xs" ></span>
 {/if}
 </div>
 <div class="flex-1">
 <div class="text-xs">{factor.description}</div>
 </div>
 <div class="font-mono text-xs text-accent">{factor.points}</div>
 </button>
 {/each}
 </div>
 </Panel>
 </div>

 <!-- Right, Calculation -->
 <div class="flex flex-col gap-4">
 <Panel>
 <div class="heading-sub mb-3">Sentencing Calculation</div>

 <div class="panel-soft p-3 font-mono text-sm space-y-2">
 <div class="flex justify-between">
 <span class="text-black/70">Base Offense Level:</span>
 <span>{offenseLevel}</span>
 </div>
 <div class="flex justify-between text-danger">
 <span>Aggravating Factors:</span>
 <span>+{aggravatingPoints}</span>
 </div>
 <div class="flex justify-between text-accent">
 <span>Mitigating Factors:</span>
 <span>{mitigatingPoints}</span>
 </div>
 <div class="border-t border-black/30 pt-2 mt-2"></div>
 <div class="flex justify-between font-bold">
 <span>Adjusted Offense Level:</span>
 <span class="text-lg">{adjustedOffenseLevel}</span>
 </div>
 <div class="flex justify-between">
 <span class="text-black/70">Criminal History Cat:</span>
 <span>{criminalHistory}</span>
 </div>
 </div>
 </Panel>

 <Panel>
 <div class="heading-sub mb-3">Recommended Range</div>

 <div class="panel bg-panelSoft p-4 text-center">
 <div class="text-[10px] font-mono uppercase tracking-wider text-black/60 mb-2">
 Federal Sentencing Guidelines
 </div>
 <div class="font-mono text-3xl mb-1">
 {sentencingRange.min}–{sentencingRange.max}
 </div>
 <div class="text-xs text-black/70">months imprisonment</div>

 <div class="mt-3 pt-3 border-t border-black/30">
 <div class="text-xs text-black/70">
 ({Math.floor(sentencingRange.min / 12)}–{Math.floor(sentencingRange.max / 12)} years)
 </div>
 </div>
 </div>

 <div class="mt-3 flex flex-col gap-2">
 <Button class="bits-btn" variant="primary" onclick={generateMemo}>
 <span class="i-heroicons-document-text mr-1" ></span>
 Generate Sentencing Memo
 </Button>
 <Button class="bits-btn" variant="secondary">
 <span class="i-heroicons-calculator mr-1" ></span>
 Compare Alternatives
 </Button>
 </div>
 </Panel>

 <Panel>
 <div class="heading-sub mb-3">Guideline Notes</div>
 <div class="text-xs leading-relaxed text-black/80 space-y-2">
 <p>
 • This calculation uses simplified Federal Sentencing Guidelines (§2L2.1)
 </p>
 <p>
 • Actual sentences may vary based on departures and judicial discretion
 </p>
 <p>
 • Consult USSC guidelines manual for precise calculations
 </p>
 </div>
 </Panel>
 </div>
</div>




