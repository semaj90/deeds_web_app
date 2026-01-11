<script lang="ts">
 interface Props {
 summaryId: string;
 holding: string;
 reasoning: string;
 citations: Array<{ text: string; caseId?: string }>;
 keywords: string[];
 confidence: number;
 onApprove: (data: {
 holding: string;
 reasoning: string;
 citations: Array<{ text: string; caseId?: string }>;
 keywords: string[];
 }) => void;
 onReject: () => void;
 isApproving?: boolean;
 }

 let { summaryId, holding, reasoning, citations, keywords, confidence, onApprove, onReject, isApproving = false }: Props = $props();

 let editedHolding = $state(holding);
 let editedReasoning = $state(reasoning);
 let editedCitations = $state(citations);
 let editedKeywords = $state(keywords);
 let showEditMode = $state(false);

 const handleApprove = () => {
 onApprove({
 holding: editedHolding,
 reasoning: editedReasoning,
 citations: editedCitations,
 keywords: editedKeywords,
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
 <h3 class="text-lg font-semibold text-gray-900">AI Suggested Summary</h3>
 <p class="text-sm text-gray-500 mt-1">
 Review and approve before adding to legal search
 </p>
 </div>
 <div class="text-right">
 <div class="text-sm font-medium text-gray-700">AI Confidence</div>
 <div class="text-lg font-semibold text-blue-600">
 {(confidence * 100).toFixed(0)}%
 </div>
 </div>
 </div>

 <!-- Holding Section -->
 <div class="mb-6">
 <label class="block text-sm font-semibold text-gray-700 mb-2">
 Legal Holding
 </label>
 {#if showEditMode}
 <textarea
 bind:value={editedHolding}
 class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
 rows="3"
 ></textarea>
 {:else}
 <div class="bg-gray-50 rounded p-4 border border-gray-200">
 <p class="text-sm text-gray-700">{editedHolding}</p>
 </div>
 {/if}
 </div>

 <!-- Reasoning Section -->
 <div class="mb-6">
 <label class="block text-sm font-semibold text-gray-700 mb-2">
 Reasoning
 </label>
 {#if showEditMode}
 <textarea
 bind:value={editedReasoning}
 class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
 rows="4"
 ></textarea>
 {:else}
 <div class="bg-gray-50 rounded p-4 border border-gray-200">
 <p class="text-sm text-gray-700 whitespace-pre-wrap">{editedReasoning}</p>
 </div>
 {/if}
 </div>

 <!-- Citations Section -->
 <div class="mb-6">
 <label class="block text-sm font-semibold text-gray-700 mb-2">
 Citations
 </label>
 <div class="space-y-2">
 {#each editedCitations as citation, index (index)}
 <div class="flex items-center justify-between bg-blue-50 p-3 rounded border border-blue-200">
 <div class="flex-1">
 <p class="text-sm font-medium text-blue-900">{citation.text}</p>
 {#if citation.caseId}
 <p class="text-xs text-blue-700">Case ID: {citation.caseId}</p>
 {/if}
 </div>
 {#if showEditMode}
 <button
 onclick={() => removeCitation(index)}
 class="ml-2 text-red-600 hover:text-red-700 text-sm font-medium"
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
 <label class="block text-sm font-semibold text-gray-700 mb-2">
 Keywords
 </label>
 <div class="flex flex-wrap gap-2">
 {#each editedKeywords as keyword, index (index)}
 <div class="flex items-center gap-2 bg-gray-200 px-3 py-1 rounded-full">
 <span class="text-sm text-gray-700">{keyword}</span>
 {#if showEditMode}
 <button
 onclick={() => removeKeyword(index)}
 class="text-gray-600 hover:text-gray-800 font-bold"
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
 class="text-sm text-blue-600 hover:text-blue-700 font-medium"
 >
 {showEditMode ? 'Done Editing' : 'Edit Summary'}
 </button>
 </div>

 <!-- Actions -->
 <div class="flex gap-3">
 <button
 onclick={handleApprove}
 disabled={isApproving}
 class="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-medium transition"
 >
 {isApproving ? 'Approving...' : 'Approve & Save'}
 </button>
 <button
 onclick={onReject}
 class="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 font-medium transition"
 >
 Reject
 </button>
 </div>
</div>

<style>
 /* Additional styles if needed */
</style>
