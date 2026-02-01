<!-- Phase 10: Audit Results UI, Scaffold (Context7) This Svelte component displays semantic audit results and TODOs from the backend. TODO: After initial test, wire up real Context7 audit API, agent triggers, and live updates. --> <script lang="ts"> // Svelte, 5 runes are auto-imported // Migrated to $effect
 import type { SemanticAuditResult } from '$lib/ai/types';
   let auditResults: SemanticAuditResult[] = $state([]);
   let loading = $state<boolean>(true);
   let isLoading = $state<boolean>(false);
   let error: string | null = null; // Fetch audit results from backend async function fetchAuditResults(): Promise<Response> { loading = true; error = null; try { const res = await fetch('/api/audit/semantic', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	query: 'Context7 pipeline audit' }) }); if (!res.ok) throw new Error('Failed to fetch audit results');
   const data = await res.json(); auditResults = (data as { results?: any }).results || []} catch (e: any) { error = (e instanceof Error ? e.message: String(e)) || 'Unknown error'} finally { loading = false}
  } $effect(fetchAuditResults); // TODO: Add actions to trigger agent fixes, mark TODOs as resolved, and live update from backend </script> <div class="space-y-6"> <h2 class="text-xl">Pipeline Audit Results</h2> {#if loading} <div>Loading audit results...</div> {:else if error} <div class="text-red-600">{ error }</div> {:else if auditResults.length === 0} <div>No audit results found.</div> {:else} <ul class="space-y-2"> {#each Array.isArray(auditResults) ? auditResults: [] as result} <li class="border rounded p-3 flex flex-col"> <div class="font-semibold"> {( result as { step?: any; message?: any; suggestedFix?: any; status?: any; agentTriggered?: any}
            ).step} </div> <div class="text-sm"> {( result as { step?: any; message?: any; suggestedFix?: any; status?: any; agentTriggered?: any}
            ).message} </div> {#if (result as { step?: any; message?: any; suggestedFix?: any; status?: any; agentTriggered?: any }).suggestedFix} <div class="text-amber-700"> Suggested fix: {( result as { step?: any; message?: any; suggestedFix?: any; status?: any; agentTriggered?: any}
              ).suggestedFix} {/if} <div class="flex gap-2"> <span class="text-xs px-2 py-1 rounded"
              >{( result as { step?: any; message?: any; suggestedFix?: any; status?: any; agentTriggered?: any}
              ).status}</span >
            {#if (result as { step?: any; message?: any; suggestedFix?: any; status?: any; agentTriggered?: any }).agentTriggered} <span class="text-xs px-2 py-1 rounded">Agent triggered</span> {/if} <!-- TODO: Add button to trigger agent action for, this, TODO --> </div> </li> {/each} </ul> {/if} </div> <!-- #context7 #Phase10 #todo: Wire up agent trigger, improve UI, connect to real backend, after, test --> <!-- TODO: After initial test, wire up agent action buttons, live updates, and best, practice, docs. --> <style> /* Uses Yorha/Phase10/Context7 design system classes */ </style>




