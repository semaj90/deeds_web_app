<script lang="ts">


 // Migrated to $effect

 interface Props {
 evidenceId: string;
	fileName: string;
 documentType: string;
	confidence: number;
 metadata: Record<string, unknown>;
 onGenerateSummary: () => void;
 onReject: () => void;
 isGenerating?: boolean;
 }

 let { evidenceId, fileName, documentType, confidence, metadata, onGenerateSummary, onReject, isGenerating = false }: Props = $props();

 let extractedText = $state('');
 let showFullText = $state(false);

 $effect(() => {

 (async () => {
 // Extract preview from metadata
 if (metadata?.extractedText) {
 extractedText = metadata.extractedText as string;
 }

})();
 });

 const confidenceColor = (conf: number) => {
 if (conf >= 0.9) return 'text-accent';
 if (conf >= 0.7) return 'text-warning';
 return 'text-danger';
 };

 const truncateText = (text: string, length = 300) => {
 return text.length > length ? text.substring(0, length) + '...' : text;
 };
</script>

<div class="border rounded-lg p-6 bg-white shadow-sm">
 <!-- Header -->
 <div class="flex items-start justify-between mb-4">
 <div>
 <h3 class="text-lg font-semibold text-sand">{fileName}</h3>
 <p class="text-sm text-sand/60 mt-1">
 Uploaded • Pending Review
 </p>
 </div>
 <div class="text-right">
 <div class="text-sm font-medium text-sand/80">Classification</div>
 <div class="text-lg font-semibold text-info">{documentType}</div>
 <div class={`text-sm font-medium ${confidenceColor(confidence)}`}>
 {(confidence * 100).toFixed(0)}% confidence
 </div>
 </div>
 </div>

 <!-- Extracted Text Preview -->
 <div class="mb-6">
 <h4 class="text-sm font-semibold text-sand/80 mb-2">Extracted Text Preview</h4>
 <div class="bg-sand/5 rounded p-4 max-h-48 overflow-y-auto border border-sand/20">
 <p class="text-sm text-sand/80 whitespace-pre-wrap font-mono">
 {showFullText ? extractedText : truncateText(extractedText)}
 </p>
 </div>
 {#if extractedText.length > 300}
 <button
 onclick={() => (showFullText = !showFullText)}
 class="text-sm text-info hover:text-info mt-2"
 >
 {showFullText ? 'Show less' : 'Show more'}
 </button>
 {/if}
 </div>

 <!-- Metadata -->
 <div class="grid grid-cols-2 gap-4 mb-6 text-sm">
 <div>
 <span class="text-sand/60">File Size:</span>
 <span class="font-medium text-sand ml-2">
 {((metadata?.fileSize as number) / 1024 / 1024).toFixed(2)} MB
 </span>
 </div>
 <div>
 <span class="text-sand/60">Pages:</span>
 <span class="font-medium text-sand ml-2">
 {metadata?.pageCount ?? 'N/A'}
 </span>
 </div>
 </div>

 <!-- Actions -->
 <div class="flex gap-3">
 <button
 onclick={onGenerateSummary}
 disabled={isGenerating}
 class="flex-1 px-4 py-2 bg-info text-white rounded-lg hover:bg-info/60 disabled bg-sand/20 font-medium transition"
 >
 {isGenerating ? 'Generating...' : 'Generate Suggested Summary'}
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



