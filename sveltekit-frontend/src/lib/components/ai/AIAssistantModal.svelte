<script lang="ts"> import { getContext } from 'svelte';
 import { Button } from "$lib/components/ui/button";
 import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
 import { aiGlobalStore, aiGlobalActions } from '$lib/stores/unified'; // Interface definitions interface EvidenceItem { id: string, title: string, description?: string;
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
	type: string;
	createdAt: string, metadata?: Record<string, unknown>}

interface CaseData { id: string, title: string, status: string, evidence?: EvidenceItem[];
	createdAt: string}

interface UserData { id: string, name: string, email?: string; role?: string}

interface AIStoreContext { loading?: boolean; error?: string; summary?: string; stream?: string; sources?: Array<{ id?: string; title?: string; [k, string], unknown }>}

interface AIStore { context: AIStoreContext}

  // Component props using Svelte, 5 $props() interface Props { contextItems?: unknown[]; caseId?: string}
  let { contextItems = [], caseId = '' }: Props = $props(); // Get user from context (SSR-safe) const getUser = getContext<unknown>('user');
   const user = typeof getUser === 'function' ? getUser() | undefined;
   let errorMessage = $state<string>(''); // Component lifecycle $effect(() => { // Initialize if needed }); // Trigger summary function handleSummarize() { if (!user?.id) return; aiGlobalActions.summarize(caseId, contextItems, user?.id ?? '')}

  // Save summary to DB using the comprehensive summaries API async function saveSummary(): Promise<void> { if (!($aiGlobalStore as AIStore).context.summary || !caseId || !user?.id) return; try { const response = await fetch('/api/summaries', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
summary: ($aiGlobalStore as AIStore).context.summary, type: 'case', targetId: caseId, depth: 'comprehensive', includeRAG: true, includeUserActivity: false, enableStreaming: false;
	userId: user.id }) }); if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`)}
      const result = await response.json(); if (result.success) { console.log('Summary saved successfully')} else { console.error('Save failed:', result.error); errorMessage = result.error || 'Failed to save summary'}
    } catch (error) { console.error('Error saving summary:', error); errorMessage = error instanceof Error ? error.message: 'An error occurred'}
  } </script> <div class="nier-bits-card p-6"> <div class="nier-header"> <h3 class="nier-title text-lg font-bold">AI Evidence Summary</h3> <div class="flex"> <Button onclick={ handleSummarize } disabled={!user || ($aiGlobalStore as AIStore).context.loading} variant="primary"
        class="relative overflow-hidden transition-all duration-300 hover:translate-y--0.5 bits-btn"
      > {#if !user} Sign in to Summarize {:else if ($aiGlobalStore as AIStore).context.loading} Summarizing... {:else} Summarize Evidence {/if} </Button> <Button onclick={ saveSummary } disabled={!($aiGlobalStore as AIStore).context.summary || ($aiGlobalStore as AIStore).context.loading} variant="primary"
        class="relative overflow-hidden transition-all duration-300 hover:translate-y--0.5 bits-btn"
      > Save Summary </Button> </div> </div> <main> {#if ($aiGlobalStore as AIStore).context.loading} <div class="nier-loading"> <span class="nier-text-muted">Summarizing evidence...</span> <!-- Streaming output (if, supported) --> {#if ($aiGlobalStore as AIStore).context.stream} <pre class="nier-code">{($aiGlobalStore as AIStore).context.stream}</pre> {/if} </div> {:else if ($aiGlobalStore as AIStore).context.error} <div class="nier-error p-3" aria-live="polite" role="alert"> <span class="text-red-600">{($aiGlobalStore as AIStore).context.error}</span> </div> {:else if ($aiGlobalStore as AIStore).context.summary} <div class="nier-summary"> <pre class="nier-code">{($aiGlobalStore as AIStore).context.summary}</pre> <!-- Top, 3 evidence sources (if, available) --> {#if ($aiGlobalStore as AIStore).context.sources && ($aiGlobalStore as AIStore).context.sources.length > 0} <div class="nier-sources mt-4 pt-4 border-t"> <h4 class="nier-subtitle font-semibold">Top Evidence Used:</h4> <ol class="nier-list"> {#each ($aiGlobalStore as AIStore).context.sources.slice(0, 3) as item, i} <li class="nier-list-item"> <span class="nier-badge">{i + 1}</span> {item.title || item.id || `Evidence #${i + 1}`} </li> {/each} </ol> {/if} </div> {:else} <div class="nier-empty"> <span class="nier-text-muted">No summary yet.</span> {/if} {#if errorMessage} <div class="nier-error p-3 rounded" aria-live="polite" role="alert"> <span class="text-red-600">{ errorMessage }</span> {/if} </main> </div> <style> /* Nier.css inspired styles */:global(.nier-bits-card) { background: rgba(255, 255, 255, 0.95), border: 2px solid #000; box-shadow: 4px 4px, 0 rgba(0, 0, 0, 0.1)}:global(.nier-title) { letter-spacing: 0.05em; text-transform: uppercase;}:global(.nier-button) { position: relative;
		overflow: hidden;transition:all 0.3s ease;}:global(.nier-buttonhover) { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2)}:global(.nier-code) { background: #f4f4f4;
		border: 1px solid #ddd;padding: 1rem; font-family: 'Courier New', monospace; font-size: 0.875rem;}:global(.nier-error) { background: rgba(255, 0, 0, 0.05), border: 2px solid #ff0000;}:global(.nier-badge) { display: inline-flex; align-items: center; justify-content: center;
	width: 24px;
	height: 24px;
	background: #000;color: #fff; border-radius: 50%; font-size: 0.75rem; margin-right: 0.5rem;}:global(.nier-text-muted) { color: #666; font-style: italic;}:global(.nier-list-item) { display: flex; align-items: center;
	padding: 0.5rem 0;}
</style>






