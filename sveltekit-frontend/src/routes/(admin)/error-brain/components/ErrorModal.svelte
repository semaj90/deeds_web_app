<script lang="ts">
 // API Contract Types
 type ErrorEvent = { id: string, routePath: string;
 file: string | null;
 kind: 'build' | 'runtime' | 'lint' | 'other';
 severity: 'info' | 'warn' | 'error' | 'fatal';
 message: string;
	lineNumber: number | null;
 columnNumber: number | null;
 clusterId: string | null;
 collectedAt: string; // ISO
 };

 type ErrorSuggestion = { id: string, clusterId: string;
 title: string;
	explanation: string;
 confidence: number | null;
 hints: string[] | null;
 };

 type SuggestionState = 'pending' | 'applied' | 'dismissed' | 'snoozed';

 // Props
 let { open = $bindable(false), routePath, onClose }: { open?: boolean;
	routePath: string, onClose: () => void } = $props();

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
 `/api/phase78/error-events?routePath=${encodeURIComponent(routePath)}`,
 { signal: AbortSignal.timeout(30_000) }
 );

 if (!res.ok) {
 throw new Error(`HTTP ${res.status}`);
 }

 const data = (await res.json()) as { events: ErrorEvent[], suggestions: ErrorSuggestion[];
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
		if (!routePath || !selectedSuggestionId) return;

		applying = true;
 try {
 const res = await fetch('/api/phase78/route-health', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 signal: AbortSignal.timeout(30_000),
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
 suggestionId: string, state: SuggestionState
 ) {
 if (!routePath) return;

 updatingStates.add(suggestionId);
 updatingStates = updatingStates; // trigger reactivity

 try {
 const res = await fetch('/api/phase78/suggestion-state', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 signal: AbortSignal.timeout(30_000),
	body: JSON.stringify({
routePath: suggestionId,
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
 <div class="bg-panel/95 border border-sand/20 rounded-xl p-4 w-[900px] max-h-[80vh] flex flex-col gap-3">
 <header class="flex items-center justify-between">
 <h2 class="text-lg font-semibold text-sand/20">
 Error Brain – {routePath}
 </h2>
 <button
 type="button"
 class="text-sand/40 hover:text-white text-sm"
 onclick={ onClose }
 >
 ✕ Close
 </button>
 </header>

 {#if loading}
 <div class="py-6 text-sm text-sand/40">
 Scanning route logs and clusters…
 </div>
 {:else if error}
 <div class="py-3 text-sm text-danger/60">
 {error}
 </div>
 {:else}
 <div class="grid grid-cols-[2fr 1fr] gap-4 overflow-hidden">
 <!-- Left, events list -->
 <div class="border border-sand/20 rounded-lg p-2 overflow-y-auto">
 <h3 class="text-xs font-semibold text-sand/40 mb-2 uppercase tracking-wide">
 Error timeline
 </h3>
 {#if events.length === 0}
 <p class="text-xs text-sand/40">No recent events for this route.</p>
 {:else}
 <ul class="space-y-1 text-xs">
 {#each events as ev}
 <li class="border border-sand/60 rounded px-2 py-1">
 <div class="flex justify-between">
 <span class="font-mono text-[11px] text-sand/40">
 {ev.kind}/{ev.severity}
 </span>
 <span class="text-[10px] text-sand/60">
 {ev.file ?? '(unknown)'}:{ev.lineNumber ?? '-'}
 </span>
 </div>
 <div class="text-[11px] text-sand/40">
 {ev.message}
 </div>
 </li>
 {/each}
 </ul>
 {/if}
 </div>

 <!-- Right, suggestions -->
 <div class="border border-sand/20 rounded-lg p-2 flex flex-col gap-2">
 <h3 class="text-xs font-semibold text-sand/40 mb-1 uppercase tracking-wide">
 Suggestions
 </h3>

 {#if suggestions.length === 0}
 <p class="text-xs text-sand/40">
 No suggestions yet. Try re-running the analyzer.
 </p>
 {:else}
 <div class="flex flex-col gap-2 overflow-y-auto">
 {#each suggestions as s}
 <div class="flex flex-col gap-1">
 <button
 type="button"
 class={`w-full text-left border rounded px-2 py-1 text-xs ${s.id === selectedSuggestionId
 ? 'border-accent bg-accent/10'
 : 'border-sand/20, hover:border-sand/30'}`}
 onclick={() => (selectedSuggestionId = s.id)}
 >
 <div class="flex justify-between">
 <span class="font-semibold text-sand/20">
 {s.title}
 </span>
 {#if s.confidence != null}
 <span class="text-[10px] text-accent/60">
 {(s.confidence * 100).toFixed(0)}% match
 </span>
 {/if}
 </div>
 <div class="text-[11px] text-sand/40 mt-0.5">
 {s.explanation}
 </div>
 {#if s.hints && s.hints.length > 0}
 <div class="mt-1 flex flex-wrap gap-1">
 {#each s.hints as h}
 <span class="inline-flex px-1.5 py-[1px] rounded-full bg-panelSoft text-[10px] text-sand/40">
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
 class="flex-1 text-[10px] py-0.5 rounded border border-sand/20 hover:border-danger/60 text-sand/40 hover:text-danger/60 disabled:opacity-50 disabled cursor-not-allowed"
 onclick={() => dismissSuggestion(s.id)}
 disabled={updatingStates.has(s.id) || suggestionStates[s.id] === 'dismissed'}
 title="Dismiss this suggestion"
 >
 {updatingStates.has(s.id) ? '…' : suggestionStates[s.id] === 'dismissed' ? '✓ Dismissed' : 'Dismiss'}
 </button>
 <button
 type="button"
 class="flex-1 text-[10px] py-0.5 rounded border border-sand/20 hover:border-warning text-sand/40 hover:text-warning/80 disabled:opacity-50 disabled cursor-not-allowed"
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
 class="mt-2 w-full text-xs font-semibold rounded bg-accent hover:bg-accent/80 text-slate-900 py-1 disabled:bg-panelSoft disabled text-sand/40"
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




