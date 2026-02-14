<script lang="ts">


 interface Props { summaryId: string, holding: string;
 reasoning: string;
	citations: Array<{ text: string; caseId?: string }>;
 keywords: string[];
	confidence: number;
 onApprove: (data: { holding: string, reasoning: string;
citations: Array<{ text: string; caseId?: string }>;
 keywords: string[],
 }) => void;
 onReject: () => void;
 isApproving?: boolean;
 }

 let { summaryId, holding, reasoning, citations, keywords, confidence, onApprove, onReject, isApproving = false }: Props = $props();

 let editedHolding = $state('');
 let editedReasoning = $state('');
 let editedCitations = $state<Array<{ text: string; caseId?: string }>>([]);
 let editedKeywords = $state<string[]>([]);
 let showEditMode = $state(false);

 $effect(() => {
   editedHolding = holding;
   editedReasoning = reasoning;
   editedCitations = [...citations];
   editedKeywords = [...keywords];
 });

 const handleApprove = () => {
 onApprove({
 holding: editedHolding, reasoning: editedReasoning,
 citations: editedCitations, keywords: editedKeywords,
 });
 };

 const removeCitation = (index: number) => {
 editedCitations = editedCitations.filter((_, i) => i !== index);
 };

 const removeKeyword = (index: number) => {
 editedKeywords = editedKeywords.filter((_, i) => i !== index);
 };

 const addKeyword = (keyword: string) => {
 if (keyword && !editedKeywords.includes(keyword)) {
 editedKeywords = [...editedKeywords, keyword];
 }
 };
</script>

<div class="border rounded-lg p-6 bg-white shadow-sm">
 <!-- Header -->
 <div class="flex items-center justify-between mb-6">
 <div>
 <h3 class="text-lg font-semibold text-sand">AI Suggested Summary</h3>
 <p class="text-sm text-sand/60 mt-1">
 Review and approve before adding to legal search
 </p>
 </div>
 <div class="text-right">
 <div class="text-sm font-medium text-sand/80">AI Confidence</div>
 <div class="text-lg font-semibold text-info">
 {(confidence * 100).toFixed(0)}%
 </div>
 </div>
 </div>

 <!-- Holding Section -->
 <div class="mb-6">
 <label for="holding-textarea" class="block text-sm font-semibold text-sand/80 mb-2">
 Legal Holding
 </label>
 {#if showEditMode}
 <textarea id="holding-textarea"
 bind:value={editedHolding}
 class="w-full px-3 py-2 border border-sand/20 rounded-lg focus:ring-2 focus:ring-info focus:border-transparent"
 rows="3"
 ></textarea>
 {:else}
 <div class="bg-sand/5 rounded p-4 border border-sand/20">
 <p class="text-sm text-sand/80">{editedHolding}</p>
 </div>
 {/if}
 </div>

 <!-- Reasoning Section -->
 <div class="mb-6">
 <label for="reasoning-textarea" class="block text-sm font-semibold text-sand/80 mb-2">
 Reasoning
 </label>
 {#if showEditMode}
 <textarea id="reasoning-textarea"
 bind:value={editedReasoning}
 class="w-full px-3 py-2 border border-sand/20 rounded-lg focus:ring-2 focus:ring-info focus:border-transparent"
 rows="4"
 ></textarea>
 {:else}
 <div class="bg-sand/5 rounded p-4 border border-sand/20">
 <p class="text-sm text-sand/80 whitespace-pre-wrap">{editedReasoning}</p>
 </div>
 {/if}
 </div>

 <!-- Citations Section -->
 <div class="mb-6">
 <span class="block text-sm font-semibold text-sand/80 mb-2">
 Citations
 </span>
 <div class="space-y-2">
 {#each editedCitations as citation, index (index)}
 <div class="flex items-center justify-between bg-info/5 p-3 rounded border border-info/20">
 <div class="flex-1">
 <p class="text-sm font-medium text-info">{citation.text}</p>
 {#if citation.caseId}
 <p class="text-xs text-info">Case ID: {citation.caseId}</p>
 {/if}
 </div>
 {#if showEditMode}
 <button
 onclick={() => removeCitation(index)}
 class="ml-2 text-danger hover:text-danger text-sm font-medium"
 >
 Remove
 </button>
 {/if}
 </div>
 {/each}
 </div>
 </div>

 <!-- Keywords Section -->
 <div class="mb-6">
 <span class="block text-sm font-semibold text-sand/80 mb-2">
 Keywords
 </span>
 <div class="flex flex-wrap gap-2">
 {#each editedKeywords as keyword, index (index)}
 <div class="flex items-center gap-2 bg-sand/10 px-3 py-1 rounded-full">
 <span class="text-sm text-sand/80">{keyword}</span>
 {#if showEditMode}
 <button
 onclick={() => removeKeyword(index)}
 class="text-sand/60 hover:text-sand font-bold"
 >
 ×
 </button>
 {/if}
 </div>
 {/each}
 </div>
 </div>

 <!-- Edit Mode Toggle -->
 <div class="mb-6">
 <button
 onclick={() => (showEditMode = !showEditMode)}
 class="text-sm text-info hover:text-info font-medium"
 >
 {showEditMode ? 'Done Editing' : 'Edit Summary'}
 </button>
 </div>

 <!-- Actions -->
 <div class="flex gap-3">
 <button
 onclick={handleApprove}
 disabled={isApproving}
 class="flex-1 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/60 disabled bg-sand/20 font-medium transition"
 >
 {isApproving ? 'Approving...' : 'Approve & Save'}
 </button>
 <button
 onclick={ onReject }
 class="px-4 py-2 border border-danger/30 text-danger rounded-lg hover:bg-danger/5 font-medium transition"
 >
 Reject
 </button>
 </div>
</div>

<style>
 /* Additional styles if needed */
</style>




