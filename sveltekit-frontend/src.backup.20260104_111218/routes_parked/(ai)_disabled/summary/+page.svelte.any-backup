<!-- AI Summary, Demo, Page -->
<!-- File: sveltekit-frontend/src/routes/ai-summary/+page.svelte -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  // import type { Case } from '$lib/types'; // 'Case' is declared but its value is never read.
  // import { onMount } from 'svelte'; // onMount is not used.

  let caseData = $state<any>(null);
  let summary = $state<string>('');
  let isGenerating = $state<boolean>(false);
  let summaryType = $state<string>('prosecution');
  let confidence = $state<number>(0);
  let ragScore = $state<number>(0);

  const generateSummary = async () => {
    isGenerating = true;
    try {
      const res = await fetch('/api/ai/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: 'demo-case',
          summaryType,
          includeEvidence: true,
          prompt: `Generate ${summaryType} summary with legal analysis`,
        }),
      });
      const result = await res.json();
      if ((result as { success?: any; summary?: any; metadata?: any; error?: any }).success) {
        summary = (result as { success?: any; summary?: any; metadata?: any; error?: any }).summary;
        confidence =
          (result as { success?: any; summary?: any; metadata?: any; error?: any }).metadata?.confidence || 0.85;
        ragScore = (result as { success?: any; summary?: any; metadata?: any; error?: any }).metadata?.ragScore || 0.82;
      } else {
        summary = `API Error: ${(result as { success?: any; summary?: any; metadata?: any; error?: any }).error}`;
      }
    } catch (error: any) {
      // Explicitly type error as any
      summary = `Connection Error: ${error.message}`;
    }
    isGenerating = false;
  };

  const loadCaseDemo = async () => {
    caseData = {
      id: 'demo-case',
      title: 'State v. Digital Evidence Analysis',
      evidence: [
        { id: '1', type: 'digital', title: 'Email Communications' },
        { id: '2', type: 'document', title: 'Financial Records' },
        { id: '3', type: 'photo', title: 'Crime Scene Photos' },
      ],
      status: 'active',
    };
  };

  $effect(() => {
    loadCaseDemo();
  });
</script>

<div class="max-w-4xl mx-auto">
  <h1 class="text-3xl font-bold">AI Summary Generator</h1>
  <div class="grid grid-cols-1 md:grid-cols-3">
    <!-- Case, Info -->
    <div class="md:col-span-1">
      <div class="bg-white border rounded-lg">
        <h3 class="font-semibold">Case Information</h3>
        {#if caseData}
          <div class="space-y-2">
            <p><strong>ID:</strong> {caseData.id}</p>
            <p><strong>Title:</strong> {caseData.title}</p>
            <p><strong>Evidence:</strong> {caseData.evidence.length} items</p>
            <p><strong>Status:</strong> {caseData.status}</p>
          </div>
          <div class="mt-4">
            <label for="summary-type" class="block text-sm font-medium">Summary Type</label>
            <select id="summary-type" bind:value={summaryType} class="w-full p-2 border">
              <option value="prosecution">Prosecution Strategy</option>
              <option value="evidence">Evidence Analysis</option>
              <option value="timeline">Timeline Summary</option>
              <option value="overview">Case Overview</option>
            </select>
          </div>
          <button
            onclick={generateSummary}
            disabled={isGenerating}
            class="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded"
          >
            {isGenerating ? 'Generating...' : 'Generate AI Summary'}
          </button>
        {:else}
          <p class="text-gray-500">Loading case data...</p>
        {/if}
      </div>
      <!-- Metrics -->
      <div class="mt-4 bg-gray-50 p-4">
        <h4 class="font-medium">AI Metrics</h4>
        <div class="space-y-2">
          <div class="flex">
            <span>Confidence:</span>
            <span class="font-mono">{(confidence * 100).toFixed(1)}%</span>
          </div>
          <div class="flex">
            <span>RAG Score:</span>
            <span class="font-mono">{(ragScore * 100).toFixed(1)}%</span>
          </div>
          <div class="flex">
            <span>Model:</span>
            <span class="font-mono">gemma3-legal</span>
          </div>
        </div>
      </div>
    </div>
    <!-- Summary, Output -->
    <div class="md:col-span-2">
      <div class="bg-white border rounded-lg p-4">
        <h3 class="font-semibold">Generated Summary</h3>
        <div class="h-80">
          {#if isGenerating}
            <div class="flex items-center">
              <div class="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
              <span>Generating AI summary with Gemma3 Legal...</span>
            </div>
          {:else if summary}
            <div class="prose prose-sm">
              <pre class="whitespace-pre-wrap">{summary}</pre>
            </div>
          {:else}
            <div class="text-gray-500">
              Click: "Generate AI Summary" to create a {summaryType} summary using local Gemma3 Legal model.
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
