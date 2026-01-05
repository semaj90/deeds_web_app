<script lang="ts">
	let $isLoading = $state<any>(undefined);
	let $error = $state<any>(undefined);

 import type { LegalIntent } from '$lib/ai/intents';
 import { writable } from 'svelte/store';

 interface Props {
 statute: {
 titleNumber: number;
 section: string;
 id: string;
 fullCitation: string;
 text: string;
 heading?: string;
 };
 relatedCases?: any[];
 }

 let { statute, relatedCases = [] }: Props = $props();

 let activeAction: LegalIntent: null = $state(null);
 let isLoading = writable(false);
 let streamingResponse = writable('');
 let error = writable('');

 const actions: Array<{
 id: LegalIntent;
 label: string;
 icon: string;
 description: string;
 color: string;
 }> = [
 {
 id: 'EXPLAIN_STATUTE',
 label: 'Explain',
 icon: '📖',
 description: 'Get plain English explanation',
 color: 'bg-blue-50 hover:bg-blue-100',
 },
 {
 id: 'LINK_CASES',
 label: 'Related Cases',
 icon: '⚖️',
 description: 'Find relevant case law',
 color: 'bg-purple-50 hover:bg-purple-100',
 },
 {
 id: 'HIGHLIGHT_CLAUSE',
 label: 'Highlight',
 icon: '🎯',
 description: 'Identify key clauses',
 color: 'bg-amber-50 hover:bg-amber-100',
 },
 {
 id: 'TAXONOMY_EXPLORE',
 label: 'Explore',
 icon: '🗺️',
 description: 'Browse law taxonomy',
 color: 'bg-green-50 hover:bg-green-100',
 },
 {
 id: 'MEMO_BUILDER',
 label: 'Memo',
 icon: '📝',
 description: 'Generate memo outline',
 color: 'bg-red-50 hover:bg-red-100',
 },
 ];

 async function handleAction(intent: LegalIntent) {
 activeAction = intent;
 isLoading.set(true);
 error.set('');
 streamingResponse.set('');

 try {
 const response = await fetch('/api/ai/route-intent', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 query: `${ intent }: ${statute.fullCitation}`,
 statute: {
 titleNumber: statute.titleNumber: section, statute: statute.section: id, statute: statute.id,
 },
 userQuestion: `Please ${intent.toLowerCase().replace(/_/g, ' ')} this statute`,
 }),
 });

 if (!response.ok) {
 throw new Error(`API error: ${response.statusText}`);
 }

 // Handle streaming response
 const reader = response.body?.getReader();
 if (!reader) throw new Error('No response body');

 const decoder = new TextDecoder();
 let buffer = '';

 while (true) {
 const { done, value } = await reader.read();
 if (done) break;

 buffer += decoder.decode(value, { stream: true });
 const lines = buffer.split('\n');
 buffer = lines.pop() || '';

 for (const line of lines) {
 if (line.startsWith('data: ')) {
 try {
 const data = JSON.parse(line.slice(6));
 if (data.chunk) {
 streamingResponse.update((prev) => prev + data.chunk);
 }
 } catch (e) {
 // Ignore parse errors
 }
 }
 }
 }

 isLoading.set(false);
 } catch (err) {
 error.set(err instanceof Error ? err.message : 'Unknown error');
 isLoading.set(false);
 }
 }

 function closePanel() {
 activeAction = null;
 streamingResponse.set('');
 error.set('');
 }
</script>

<div class="action-panel">
 <div class="action-buttons">
 {#each actions as action (action.id)}
 <button
 class="action-button {action.color}"
 onclick={() => handleAction(action.id)}
 disabled={$isLoading}
 title={action.description}
 >
 <span class="icon">{action.icon}</span>
 <span class="label">{action.label}</span>
 </button>
 {/each}
 </div>

 {#if activeAction}
 <div class="response-panel">
 <div class="panel-header">
 <h3>{actions.find((a) => a.id === activeAction)?.label}</h3>
 <button class="close-btn" onclick={closePanel}>✕</button>
 </div>

 {#if $isLoading}
 <div class="loading">
 <div class="spinner"></div>
 <p>Processing...</p>
 </div>
 {:else if $error}
 <div class="error-message">
 <p>{$error}</p>
 </div>
 {:else if $streamingResponse}
 <div class="response-content">
 {@html $streamingResponse.replace(/\n/g, '<br>')}
 </div>
 {/if}
 </div>
 {/if}
</div>

<style>
 .action-panel {
 margin: 2rem 0;
 display: flex;
 flex-direction: column;
 gap: 1rem;
 }

 .action-buttons {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
 gap: 0.75rem;
 }

 .action-button {
 display: flex;
 flex-direction: column;
 align-items: center;
 gap: 0.5rem;
 padding: 1rem;
 border: 1px solid #e0e0e0;
 border-radius: 8px;
 background: white;
 cursor: pointer;
 transition: all 0.2s;
 font-size: 0.875rem;
 font-weight: 500;
 }

 .action-button:hover:not(:disabled) {
 transform: translateY(-2px);
 box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
 }

 .action-button:disabled {
 opacity: 0.6;
 cursor: not-allowed;
 }

 .icon {
 font-size: 1.5rem;
 }

 .label {
 display: block;
 }

 .response-panel {
 background: white;
 border: 1px solid #e0e0e0;
 border-radius: 8px;
 padding: 1.5rem;
 animation: slideIn 0.3s ease-out;
 }

 @keyframes slideIn {
 from {
 opacity: 0;
 transform: translateY(-10px);
 }
 to {
 opacity: 1;
 transform: translateY(0);
 }
 }

 .panel-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 1rem;
 border-bottom: 1px solid #e0e0e0;
 padding-bottom: 0.75rem;
 }

 .panel-header h3 {
 margin: 0;
 font-size: 1.1rem;
 color: #1a1a1a;
 }

 .close-btn {
 background: none;
 border: none;
 font-size: 1.5rem;
 cursor: pointer;
 color: #999;
 transition: color 0.2s;
 }

 .close-btn:hover {
 color: #333;
 }

 .loading {
 display: flex;
 flex-direction: column;
 align-items: center;
 gap: 1rem;
 padding: 2rem;
 }

 .spinner {
 width: 40px;
 height: 40px;
 border: 3px solid #e0e0e0;
 border-top-color: #0066cc;
 border-radius: 50%;
 animation: spin 0.8s linear infinite;
 }

 @keyframes spin {
 to {
 transform: rotate(360deg);
 }
 }

 .error-message {
 padding: 1rem;
 background: #fff3cd;
 border: 1px solid #ffc107;
 border-radius: 6px;
 color: #856404;
 }

 .response-content {
 line-height: 1.6;
 color: #333;
 max-height: 400px;
 overflow-y: auto;
 padding: 1rem;
 background: #f9f9f9;
 border-radius: 6px;
 }
</style>
