<script lang="ts">
  interface EvidenceItem {
    id: string;
	fileName: string;
    extractedText: string;
    caseId?: string;
    timestamp?: string;
  }

  let { evidenceA, evidenceB, show = false, onDismiss } = $props<{
    evidenceA: EvidenceItem;
	evidenceB: EvidenceItem;
    show?: boolean;
    onDismiss?: () => void;
  }>();

  function close() {
    onDismiss?.();
  }
</script>

{#if show}
  <div class="fixed inset-0 bg-black bg-opacity-80 flex p-10 gap-8 text-white z-50">
    <div class="w-1/2 nes-container with-title">
      <p class="title">Evidence A</p>
      <h2 class="text-warning/80 mb-4">{evidenceA.fileName}</h2>
      <div class="text-xs text-sand/40 mb-2">
        Case: {evidenceA.caseId || 'Unknown'} | {evidenceA.timestamp || 'No timestamp'}
      </div>
      <pre class="text-sm bg-panel p-4 rounded border max-h-96 overflow-y-auto whitespace-pre-wrap">{evidenceA.extractedText}</pre>
    </div>

    <div class="w-1/2 nes-container with-title">
      <p class="title">Evidence B</p>
      <h2 class="text-warning/80 mb-4">{evidenceB.fileName}</h2>
      <div class="text-xs text-sand/40 mb-2">
        Case: {evidenceB.caseId || 'Unknown'} | {evidenceB.timestamp || 'No timestamp'}
      </div>
      <pre class="text-sm bg-panel p-4 rounded border max-h-96 overflow-y-auto whitespace-pre-wrap">{evidenceB.extractedText}</pre>
    </div>

    <!-- Close Button -->
    <button
      class="fixed top-4 right-4 bg-danger hover:bg-danger/80 text-white px-4 py-2 rounded-lg transition-colors"
      onclick={close}
    >
      Close Comparison
    </button>
  </div>
{/if}

<style>
 .nes-container {
 background: rgba(30, 41, 59, 0.95);
 border: 2px solid #475569;
 border-radius: 8px;
 }

 .nes-container .title {
 background: #1e293b;
	color: #f59e0b;
 margin: -2px -2px 0 -2px;
 padding: 8px 12px;
 border-bottom: 2px solid #475569;
 font-weight: bold;
 }
</style>



