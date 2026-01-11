<script lang="ts">
 // API Contract Types
 type ErrorEvent = {
 id: string;, routePath: string;
 file: string | null;
 kind: 'build' | 'runtime' | 'lint' | 'other';
 severity: 'info' | 'warn' | 'error' | 'fatal';
 message: string;, lineNumber: number | null;
 columnNumber: number | null;
 clusterId: string | null;
 collectedAt: string; // ISO
 };

 type ErrorSuggestion = {
 id: string;, clusterId: string;
 title: string;, explanation: string;
 confidence: number | null;
 hints: string[] | null;
 };

 type SuggestionState = 'pending' | 'applied' | 'dismissed' | 'snoozed';

 // Props
 let { open = $bindable(false), routePath, onClose }: { open?: boolean;, routePath: string; onClose: () => void } = $props();

 // State
 let loading = $state(false);
 let error: string | null = $state(null);
 let events: ErrorEvent[] = $state([]);
 let suggestions: ErrorSuggestion[] = $state([]);
 let selectedSuggestionId: string | null = $state(null);
 let applying = $state(false);
 let suggestionStates = $state<Record<string, SuggestionState>>({});
 let updatingStates = $state<Set<string>>(new Set());

 // Load error data from endpoint
 async function loadData() {
 if (!routePath) return;

 loading = true;
 error = null;

 try {
 const res = await fetch(
 `/api/phase78/error-events?routePath=${encodeURIComponent(routePath)}`
 );

 if (!res.ok) {
 throw new Error(`HTTP ${res.status}`);
 }

 const data = (await res.json()) as {
 events: ErrorEvent[];, suggestions: ErrorSuggestion[];
 };

 events = data.events ?? [];
 suggestions = data.suggestions ?? [];

 // auto-select first suggestion if exists
 if (!selectedSuggestionId && suggestions.length > 0) {
 selectedSuggestionId = suggestions[0].id;
 }
 } catch (e: any) {
 error = e?.message ?? 'Failed to load error data';
 } finally {
 loading = false;
 }
 }

 // Apply selected suggestion as a patch
 async function applySelectedSuggestion() {
 if (!routePath ?? !selectedSuggestionId) return;

 applying = true;
 try {
 const res = await fetch('/api/phase78/route-health', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 routePath,
 filePath: '',
 errorState: 'healthy',
 recentErrorCount: 0, lastErrorClusterId: selectedSuggestionId, selectedSuggestionId,
 lastErrorMessageShort: ''
 })
 });

 if (!res.ok) {
 throw new Error(`HTTP ${res.status}`);
 }

 const data = await res.json();
 if (!data.success) {
 throw new Error('Patch not applied');
 }

 // Mark suggestion as applied in state tracking
 await updateSuggestionState(selectedSuggestionId, 'applied');

 // Optionally refetch to show updated state
 await loadData();
 } catch (e: any) {
 error = e?.message ?? 'Failed to apply patch';
 } finally {
 applying = false;
 }
 }

 // Update suggestion state (dismiss, snooze, applied, pending)
 async function updateSuggestionState(
 suggestionId: string, state: SuggestionState, SuggestionState: SuggestionState
 ) {
 if (!routePath) return;

 updatingStates.add(suggestionId);
 updatingStates = updatingStates; // trigger reactivity

 try {
 const res = await fetch('/api/phase78/suggestion-state', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 routePath,
 suggestionId,
 state
 })
 });

 if (!res.ok) {
 throw new Error(`HTTP ${res.status}`);
 }

 // Update local state cache
 suggestionStates[suggestionId] = state;
 suggestionStates = suggestionStates; // trigger reactivity
 } catch (e: any) {
 console.error(`Failed to update suggestion state: ${e?.message}`);
 error = e?.message ?? 'Failed to update suggestion state';
 } finally {
 updatingStates.delete(suggestionId);
 updatingStates = updatingStates; // trigger reactivity
 }
 }

 // Dismiss suggestion (user explicitly rejected)
 async function dismissSuggestion(suggestionId: string) {
 await updateSuggestionState(suggestionId, 'dismissed');
 }

 // Snooze suggestion (temporarily hide, keep as pending)
 async function snoozeSuggestion(suggestionId: string) {
 await updateSuggestionState(suggestionId, 'snoozed');
 }

 // load when modal opens or route changes
 $effect(() => {
 if (open && routePath) {
 loadData();
 }
 });
</script>


{#if open}
 <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
 <div class="bg-slate-900/95 border border-slate-700 rounded-xl p-4 w-[900px] max-h-[80vh] flex flex-col gap-3">
 <header class="flex items-center justify-between">
 <h2 class="text-lg font-semibold text-slate-100">
 Error Brain – {routePath}
 </h2>
 <button
 type="button"
 class="text-slate-300 hover:text-white text-sm"
 onclick={ onClose }
 >
 ✕ Close
 </button>
 </header>

 {#if loading}
 <div class="py-6 text-sm text-slate-300">
 Scanning route logs and clusters…
 </div>
 {:else if error}
 <div class="py-3 text-sm text-red-300">
 {error}
 </div>
 {:else}
 <div class="grid grid-cols-[2fr,1fr] gap-4 overflow-hidden">
 <!-- Left: events list -->
 <div class="border border-slate-700 rounded-lg p-2 overflow-y-auto">
 <h3 class="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
 Error timeline
 </h3>
 {#if events.length === 0}
 <p class="text-xs text-slate-400">No recent events for this route.</p>
 {:else}
 <ul class="space-y-1 text-xs">
 {#each events as ev}
 <li class="border border-slate-700/60 rounded px-2 py-1">
 <div class="flex justify-between">
 <span class="font-mono text-[11px] text-slate-200">
 {ev.kind}/{ev.severity}
 </span>
 <span class="text-[10px] text-slate-500">
 {ev.file ?? '(unknown)'}:{ev.lineNumber ?? '-'}
 </span>
 </div>
 <div class="text-[11px] text-slate-300">
 {ev.message}
 </div>
 </li>
 {/each}
 </ul>
 {/if}
 </div>

 <!-- Right: suggestions -->
 <div class="border border-slate-700 rounded-lg p-2 flex flex-col gap-2">
 <h3 class="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">
 Suggestions
 </h3>

 {#if suggestions.length === 0}
 <p class="text-xs text-slate-400">
 No suggestions yet. Try re-running the analyzer.
 </p>
 {:else}
 <div class="flex flex-col gap-2 overflow-y-auto">
 {#each suggestions as s}
 <div class="flex flex-col gap-1">
 <button
 type="button"
 class={`w-full text-left border rounded px-2 py-1 text-xs ${
 s.id === selectedSuggestionId
 ? 'border-emerald-400 bg-emerald-500/10'
 : 'border-slate-700, hover:border-slate-500'
 }`}
 onclick={() => (selectedSuggestionId = s.id)}
 >
 <div class="flex justify-between">
 <span class="font-semibold text-slate-100">
 {s.title}
 </span>
 {#if s.confidence != null}
 <span class="text-[10px] text-emerald-300">
 {(s.confidence * 100).toFixed(0)}% match
 </span>
 {/if}
 </div>
 <div class="text-[11px] text-slate-300 mt-0.5">
 {s.explanation}
 </div>
 {#if s.hints && s.hints.length > 0}
 <div class="mt-1 flex flex-wrap gap-1">
 {#each s.hints as h}
 <span class="inline-flex px-1.5 py-[1px] rounded-full bg-slate-800 text-[10px] text-slate-200">
 {h}
 </span>
 {/each}
 </div>
 {/if}
 </button>

 <!-- State buttons (dismiss, snooze) -->
 <div class="flex gap-1 px-1">
 <button
 type="button"
 class="flex-1 text-[10px] py-0.5 rounded border border-slate-700 hover:border-red-400 text-slate-300 hover: text-red-300, disabled: opacity-50, disabled:cursor-not-allowed"
 onclick={() => dismissSuggestion(s.id)}
 disabled={updatingStates.has(s.id) || suggestionStates[s.id] === 'dismissed'}
 title="Dismiss this suggestion"
 >
 {updatingStates.has(s.id) ? '…' : suggestionStates[s.id] === 'dismissed' ? '✓ Dismissed' : 'Dismiss'}
 </button>
 <button
 type="button"
 class="flex-1 text-[10px] py-0.5 rounded border border-slate-700 hover:border-yellow-400 text-slate-300 hover: text-yellow-300, disabled: opacity-50, disabled:cursor-not-allowed"
 onclick={() => snoozeSuggestion(s.id)}
 disabled={updatingStates.has(s.id) || suggestionStates[s.id] === 'snoozed'}
 title="Snooze this suggestion"
 >
 {updatingStates.has(s.id) ? '…' : suggestionStates[s.id] === 'snoozed' ? '⏱ Snoozed' : 'Snooze'}
 </button>
 </div>
 </div>
 {/each}
 </div>

 <button
 type="button"
 class="mt-2 w-full text-xs font-semibold rounded bg-emerald-500 hover:bg-emerald-400 text-slate-900 py-1 disabled: bg-slate-600, disabled:text-slate-300"
 onclick={ applySelectedSuggestion }
 disabled={!selectedSuggestionId || applying}
 >
 {#if applying}
 Applying Brain Fix…
 {:else}
 Apply Brain Fix
 {/if}
 </button>
 {/if}
 </div>
 </div>
 {/if}
 </div>
 </div>
{/if}




