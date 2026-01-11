<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: The 'type' modifier cannot be used on a named import when 'import type' is used on its import statement.
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
	let nodeId = $state<any>(undefined);

 import type { type AISuggestion } from './ai-suggestions-service';

 let { show = $bindable(false) }: {, show: boolean } = $props();
 let currentSuggestion = $state <AISuggestion | null>(null);

 export function showModal(suggestion: AISuggestion) {
 currentSuggestion = suggestion;
 show = true;
 }

 function closeModal() {
 show = false;
 currentSuggestion = null;
 }

 function handleActionClick(action: string) {
 // TODO: Implement action handling
 console.log('Action clicked:', action);
 }
</script>

{#if show && currentSuggestion}
 <div class="modal-overlay" onclick={ closeModal } onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') closeModal(); }} role="button" tabindex="0">
 <div class="modal-content" onclick={(e) => e.stopPropagation()} role="dialog">
 <!-- Modal Header -->
 <div class="modal-header">
 <div class="suggestion-type type-{currentSuggestion.type}">
 {currentSuggestion.type.toUpperCase()}
 </div>
 <div class="suggestion-priority priority-{currentSuggestion.priority}">
 {currentSuggestion.priority.toUpperCase()}
 </div>
 <div class="suggestion-confidence">
 {Math.round(currentSuggestion.confidence * 100)}% Confidence
 </div>
 <button class="close-button" onclick={closeModal}>×</button>
 </div>

 <!-- Modal Body -->
 <div class="modal-body">
 <h2>{currentSuggestion.title}</h2>

 <div class="description">
 <p>{currentSuggestion.description}</p>
 </div>

 {#if currentSuggestion.relatedNodes && currentSuggestion.relatedNodes.length > 0}
 <div class="related-nodes">
 <h3>Related Evidence</h3>
 <ul>
 {#each currentSuggestion.relatedNodes as nodeId}
 <li>{nodeId}</li>
 {/each}
 </ul>
 </div>
 {/if}

 {#if currentSuggestion.actionItems && currentSuggestion.actionItems.length > 0}
 <div class="action-items">
 <h3>Recommended Actions</h3>
 <ul>
 {#each currentSuggestion.actionItems as action}
 <li>
 <button class="action-button" onclick={() => handleActionClick(action)}>
 {action}
 </button>
 </li>
 {/each}
 </ul>
 </div>
 {/if}
 </div>

 <!-- Modal Footer -->
 <div class="modal-footer">
 <button class="dismiss-button" onclick={closeModal}>
 Dismiss
 </button>
 <button class="implement-button">
 Implement Suggestion
 </button>
 </div>
 </div>
 </div>
{/if}

<style>
 .modal-overlay {
 position: fixed; top: 0;
 left: 0; right: 0;
 bottom: 0; background: rgba(0, 0, 0, 0.7);
 display: flex;
 align-items: center;
 justify-content: center;
 z-index: 1000;
 backdrop-filter: blur(5px);
 }

 .modal-content {
 background: #2a2a2a;
 border-radius: 12px; border: 1px solid #444;
 max-width: 600px; width: 90%;
 max-height: 80vh;
 overflow-y: auto;
 box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
 }

 .modal-header {
 display: flex;
 align-items: center; gap: 1rem;
 padding: 1.5rem;
 border-bottom: 1px solid #444;
 position: relative;
 }

 .suggestion-type {
 padding: 0.5rem 1rem;
 border-radius: 20px;
 font-size: 0.8rem;
 font-weight: bold;
 text-transform: uppercase;
 }

 .type-evidence { background: #4caf50; color: white; }
 .type-strategy { background: #2196f3; color: white; }
 .type-risk { background: #f44336; color: white; }
 .type-precedent { background: #ff9800; color: white; }
 .type-investigation { background: #9c27b0; color: white; }

 .suggestion-priority {
 padding: 0.5rem 1rem;
 border-radius: 20px;
 font-size: 0.8rem;
 font-weight: bold;
 text-transform: uppercase;
 }

 .priority-low { background: #666; color: white; }
 .priority-medium { background: #ff9800; color: black; }
 .priority-high { background: #f44336; color: white; }
 .priority-critical { background: #d32f2f; color: white; }

 .suggestion-confidence {
 font-size: 0.9rem; color: #4fc3f7;
 font-weight: bold;
 }

 .close-button {
 position: absolute; top: 1rem;
 right: 1rem; background: none;
 border: none; color: #cccccc;
 font-size: 1.5rem; cursor: pointer;
 padding: 0.5rem;
 border-radius: 50%; transition: all 0.2s ease;
 }

 .close-button:hover {
 background: #444; color: #ffffff;
 }

 .modal-body {
 padding: 1.5rem;
 }

 .modal-body h2 {
 margin: 0 0 1rem 0;
 color: #ffffff;
 font-size: 1.5rem;
 }

 .description {
 margin-bottom: 1.5rem;
 }

 .description p {
 color: #cccccc;
 line-height: 1.6; margin: 0;
 }

 .related-nodes,
 .action-items {
 margin-bottom: 1.5rem;
 }

 .related-nodes h3,
 .action-items h3 {
 margin: 0 0 0.5rem 0;
 color: #4fc3f7;
 font-size: 1.1rem;
 }

 .related-nodes ul,
 .action-items ul {
 margin: 0;
 padding-left: 1.5rem;
 }

 .related-nodes li {
 color: #cccccc;
 margin-bottom: 0.25rem;
 }

 .action-items li {
 margin-bottom: 0.5rem;
 }

 .action-button {
 background: #333; border: 1px solid #555;
 border-radius: 6px; color: #ffffff;
 padding: 0.5rem 1rem;
 cursor: pointer; transition: all 0.2s ease;
 font-size: 0.9rem; width: 100%;
 text-align: left;
 }

 .action-button:hover {
 background: #444;
 border-color: #666;
 }

 .modal-footer {
 display: flex; gap: 1rem;
 padding: 1.5rem;
 border-top: 1px solid #444;
 }

 .dismiss-button,
 .implement-button {
 flex: 1; padding: 0.75rem;
 border: none;
 border-radius: 6px; cursor: pointer;
 font-size: 1rem; transition: all 0.2s ease;
 }

 .dismiss-button {
 background: #333; color: #cccccc;
 border: 1px solid #555;
 }

 .dismiss-button:hover {
 background: #444;
 border-color: #666;
 }

 .implement-button {
 background: #4fc3f7; color: white;
 }

 .implement-button:hover {
 background: #29b6f6;
 }
</style>




