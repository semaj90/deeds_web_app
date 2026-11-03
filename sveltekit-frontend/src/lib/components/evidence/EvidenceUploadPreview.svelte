<script lang="ts">


 // Migrated to $effect

 interface Props {
 evidenceId: string;
	fileName: string;
 documentType: string;
	confidence?: number | null;
	metadata?: Record<string, unknown> | null;
 onGenerateSummary: () => void;
 onReject: () => void;
 isGenerating?: boolean;
 }

	let { evidenceId, fileName, documentType, confidence = null, metadata = null, onGenerateSummary, onReject, isGenerating = false }: Props = $props();

 let extractedText = $state('');
 let showFullText = $state(false);
	let validConfidence = $derived(typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : null);
	let fileSizeMb = $derived.by(() => {
		const rawSize = metadata?.fileSize ?? metadata?.sizeBytes ?? metadata?.size;
		const bytes = typeof rawSize === 'number' ? rawSize : typeof rawSize === 'string' && rawSize.trim() ? Number(rawSize) : Number.NaN;
		return Number.isFinite(bytes) && bytes >= 0 ? (bytes / 1024 / 1024).toFixed(2) : null;
	});
	let pageCount = $derived.by(() => {
		const rawCount = metadata?.pageCount;
		const count = typeof rawCount === 'number' ? rawCount : typeof rawCount === 'string' && rawCount.trim() ? Number(rawCount) : Number.NaN;
		return Number.isFinite(count) && count > 0 ? Math.trunc(count) : null;
	});

 $effect(() => {

 (async () => {
 // Extract preview from metadata
		if (typeof metadata?.extractedText === 'string') {
			extractedText = metadata.extractedText;
 }

})();
 });

	const confidenceColor = (conf: number | null) => {
		if (conf === null) return 'text-[#66564b]';
		if (conf >= 0.9) return 'text-[#17634a]';
		if (conf >= 0.7) return 'text-[#805a0a]';
		return 'text-[#a32929]';
 };

 const truncateText = (text: string, length = 300) => {
 return text.length > length ? text.substring(0, length) + '...' : text;
 };
</script>

<div class="border rounded-lg p-6 bg-white shadow-sm text-[#332a25]">
 <!-- Header -->
 <div class="flex items-start justify-between mb-4">
 <div>
 <h3 class="text-lg font-semibold text-[#332a25]">{fileName}</h3>
 <p class="text-sm text-[#6b5b50] mt-1">
 Uploaded • Pending Review
 </p>
 </div>
 <div class="text-right">
 <div class="text-sm font-medium text-[#514239]">Classification</div>
 <div class="text-lg font-semibold text-[#155e75]">{documentType}</div>
 <div class={`text-sm font-medium ${confidenceColor(validConfidence)}`}>
 {validConfidence === null ? 'Not scored' : `${Math.round(validConfidence * 100)}% confidence`}
 </div>
 </div>
 </div>

 <!-- Extracted Text Preview -->
 <div class="mb-6">
 <h4 class="text-sm font-semibold text-[#514239] mb-2">Extracted Text Preview</h4>
 <div class="bg-sand/5 rounded p-4 max-h-48 overflow-y-auto border border-sand/20">
 <p class="text-sm text-[#493d35] whitespace-pre-wrap font-mono">
 {extractedText ? (showFullText ? extractedText : truncateText(extractedText)) : 'No extracted text is available yet.'}
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
 <span class="text-[#6b5b50]">File Size:</span>
 <span class="font-medium text-[#332a25] ml-2">
 {fileSizeMb === null ? 'Unknown' : `${fileSizeMb} MB`}
 </span>
 </div>
 <div>
 <span class="text-[#6b5b50]">Pages:</span>
 <span class="font-medium text-[#332a25] ml-2">
 {pageCount ?? 'Not available'}
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



