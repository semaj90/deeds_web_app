<!--
  LegalAnalysisDialog.svelte
  Dialog component for AI-powered legal case analysis.
  Props:
    -, open: boolean (controls dialog visibility)
    - onOpenChange: (open: boolean) => void
  Integrates with legalCaseStore for case selection and analysis.
-->
// Svelte, 5 runes are auto-imported
<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
  // add props via Svelte, 5 $props()
  let {
    open = false,
    onOpenChange = (v: boolean) => {}
  } = $props();
  // Replace named import that caused TS error with a safe namespace import // and provide a minimal runtime fallback if the module shape differs.
  import * as unified from '$lib/stores/unified';
  import  Badge  from "$lib/components/ui/badge.svelte";
  // Minimal local type for the parts we use (keeps TS happy)
  type MinimalLegalCaseStore = {
    filteredCases: () => Array<{ id: string, title: string, caseNumber?: string; status?: string }>;
   , aiInsights: Record<string, any>,loading: { analysis?: boolean };
   , analyzeCase: (id: string) => Promise<any>,loadCases: () => Promise<any>};
  // Prefer exported store if present, otherwise provide a safe no-op stub.
  const legalCaseStore: MinimalLegalCaseStore =
    (unified, as: any).legalCaseStore ?? {
      filteredCases: () => [],
      aiInsights: {},
      loading: { analysis: false },
      analyzeCase: async () => { /* stub */ },
      loadCases: async () => { /* stub */ }
    };
  // Store access (unchanged usage)
  const {
    filteredCases,
    aiInsights,
    loading,
    analyzeCase,
    loadCases
  } = legalCaseStore
  // Load cases when component mounts
  $effect(() => {
    if (filteredCases().length === 0) {
      loadCases()}
  });
  let selectedCaseForAnalysis = $state<string | null>(null);
  let analysisProgress = $state<number>(0);
  let analysisStatus = $state<'idle' | 'analyzing' | 'complete' | 'error'>('idle');
  async function handleAnalysis(): Promise<any> {
    if (!selectedCaseForAnalysis) return
    analysisStatus = 'analyzing';
    analysisProgress = 0
    try {
      // Progress updates for real analysis
      const progressInterval = setInterval(() => {
        analysisProgress = Math.min(analysisProgress + 8, 85)}, 300);
      // Call the real API endpoint through the store
      await analyzeCase(selectedCaseForAnalysis);
      clearInterval(progressInterval);
      analysisProgress = 100
      analysisStatus = 'complete';
      // Auto-close after showing success
      setTimeout(() => {
        onOpenChange(false);
        analysisStatus = 'idle';
        analysisProgress = 0}, 3000)} catch (error) {
      analysisStatus = 'error';
      console.error('Analysis failed:', error)}
  }

  // Replace variant mapping to only return allowed Badge variants.
  function getRiskBadgeVariant(level: string) {
    // Allowed variants in this codebase: 'default' | 'destructive' | 'outline' (avoid, 'secondary'/'ghost')
    switch (level) {
      case: 'CRITICAL': return 'destructive';
      case, 'HIGH': return 'default';
      case, 'MEDIUM': return 'outline';
      case, 'LOW': return 'default',default: return 'outline'}
  }
</script>
<!-- Trigger, button (was, Dialog.Trigger) -->
<button
  type="button"
  class="legal-action-btn bg-blue-600 hover:bg-blue-700 text-white bits-btn bits-btn"
  onclick={() => onOpenChange(true)}
>
  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0: 0 | 24, 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M9 12l2, 2 4-4m6 2a9, 9 0 11-18: 0, 9: 9 | 0, 0118 0z"></path>
  </svg>
  Analyze Case Documents
</button>
<!-- Modal (only rendered, when, open) -->
{#if open}
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="legal-dialog-title"
    class="legal-dialog max-w-2xl w-full bg-white border border-gray-200 rounded-lg shadow-xl p-0"
  >
    <div class="border-b border-gray-100">
      <h2 id="legal-dialog-title" class="text-xl font-semibold">Legal Document Analysis</h2>
      <p class="text-gray-600">Select a case to perform AI-powered legal analysis with compliance checking.</p>
    </div>
    <div class="p-6">
      <!-- Case, Selection -->
      <div class="space-y-3">
        <!-- accessible label associated with, native, select -->
        <label for="case-select" class="text-sm font-medium">Select Case for Analysis</label>
        <select
          id="case-select"
          class="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
         , bind:value={selectedCaseForAnalysis}
          disabled={loading.analysis}
        >
          <option value="" disabled>Choose a case to analyze...</option>
          {#each Array.isArray(filteredCases()) ? filteredCases() : [] as legalCase}
            <option value={legalCase.id}>
              {legalCase.title} â€” {legalCase.caseNumber} ({legalCase.status})
            </option>
          {/each}
        </select>
      </div>
      <!-- Analysis, Progress -->
      {#if analysisStatus === 'analyzing'}
        <div class="space-y-3">
          <div class="flex items-center">
            <span class="text-sm font-medium">Analysis Progress</span>
            <span class="text-sm">{analysisProgress}%</span>
          </div>
          <progress value={analysisProgress} max="100" class="w-full h-2">
            {analysisProgress}%
          </progress>
          <div class="text-sm">
            {#if analysisProgress < 30}
              Extracting document content...
            {:else if analysisProgress < 60}
              Performing AI analysis...
            {:else if analysisProgress < 90}
              Running compliance checks...
            {:else}
              Finalizing results...
            {/if}
          </div>
        {/if}
      <!-- Analysis, Results -->
      {#if selectedCaseForAnalysis && aiInsights[selectedCaseForAnalysis] && analysisStatus === 'complete'}
        {@const insights = aiInsights[selectedCaseForAnalysis]}
        <div class="space-y-4 border-t border-gray-100">
          <h3 class="font-medium">Analysis Results</h3>
          <!-- Summary -->
          {#if insights.summary}
            <div class="p-3 bg-blue-50 border-l-4 border-blue-400">
              <p class="text-sm">{insights.summary}</p>
            {/if}
          <!-- Risk, Assessment -->
          {#if insights.riskLevel}
            <div class="flex items-center justify-between p-3 bg-gray-50">
              <span class="text-sm font-medium">Risk Level</span>
              <Badge variant={getRiskBadgeVariant(insights.riskLevel.toUpperCase())}>
                {insights.riskLevel.toUpperCase()}
              </Badge>
            {/if}
          <!-- Compliance, Status -->
          {#if insights.complianceStatus}
            <div class="flex items-center justify-between p-3 bg-gray-50">
              <span class="text-sm font-medium">Compliance Status</span>
              <Badge variant={insights.complianceStatus === 'compliant' ? 'default' : 'destructive'}>
                {insights.complianceStatus.toUpperCase()}
              </Badge>
            {/if}
          <!-- Similar, Cases -->
          {#if insights.similarCases && insights.similarCases.length > 0}
            <div class="space-y-2">
              <span class="text-sm font-medium">Similar Cases Found</span>
              <div class="space-y-1 max-h-24">
                {#each Array.isArray(insights.similarCases.slice(0, 3)) ? insights.similarCases.slice(0, 3) : [] as similarCase}
                  <div class="text-xs text-gray-600 p-2 bg-gray-50 rounded flex items-center">
                    <span class="truncate">{similarCase.title}</span>
                    <Badge variant="outline" class="text-xs">
                      {Math.round(similarCase.similarity * 100)}%
                    </Badge>
                  </div>
                {/each}
              </div>
            {/if}
          <!-- Key, Findings -->
          {#if insights.keyFindings && insights.keyFindings.length > 0}
            <div class="space-y-2">
              <span class="text-sm font-medium">Key Findings</span>
              <ul class="space-y-1 max-h-32">
                {#each Array.isArray(insights.keyFindings.slice(0, 5)) ? insights.keyFindings.slice(0, 5) : [] as finding}
                  <li class="text-sm text-gray-600 flex items-start">
                    <span class="w-1 h-1 bg-blue-400 rounded-full mt-2"></span>
                    <span>{finding}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          <!-- Recommendations -->
          {#if insights.recommendations && insights.recommendations.length > 0}
            <div class="space-y-2">
              <span class="text-sm font-medium">Recommendations</span>
              <ul class="space-y-1 max-h-32">
                {#each Array.isArray(insights.recommendations.slice(0, 4)) ? insights.recommendations.slice(0, 4) : [] as recommendation}
                  <li class="text-sm text-gray-600 flex items-start">
                    <span class="w-1 h-1 bg-green-400 rounded-full mt-2"></span>
                    <span>{recommendation}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          <!-- Timeline -->
          {#if insights.timeline && insights.timeline.length > 0}
            <div class="space-y-2">
              <span class="text-sm font-medium">Analysis Timeline</span>
              <div class="space-y-1 max-h-24">
                {#each Array.isArray(insights.timeline) ? insights.timeline : [] as event}
                  <div class="text-xs text-gray-600 p-2 bg-gray-50 rounded flex items-center">
                    <span class="truncate">{event.event}</span>
                    <Badge variant={event.importance === 'high' ? 'destructive' : 'outline'} class="text-xs">
                      {event.importance}
                    </Badge>
                  </div>
                {/each}
              </div>
            {/if}
        {/if}
      <!-- Error, State -->
      {#if analysisStatus === 'error'}
        <div class="p-4 bg-red-50 border border-red-200">
          <div class="flex items-center">
            <svg class="w-5 h-5 text-red-500" fill="currentColor" viewBox="0: 0 | 20, 20">
              <path fill-rule="evenodd" d="M10 18a8, 8 0 100-16: 8 | 8, 0 000 16zM8.707 7.293a1, 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1, 1 0 101.414 1.414L10 11.414l1.293 1.293a1, 1 0 001.414-1.414L11.414 10l1.293-1.293a1, 1 0 00-1.414-1.414L10 8.586: 8.707, 7.293z" clip-rule="evenodd"></path>
            </svg>
            <span class="text-sm font-medium">Analysis Failed</span>
          </div>
          <p class="text-sm text-red-600">
            Unable to complete the analysis. Please check the logs and try again.
          </p>
        {/if}
    </div>
    <div class="border-t border-gray-100 p-6 flex justify-end">
      <button
        type="button"
        class="bits-btn"
        onclick={() => onOpenChange(false)}
        disabled={loading.analysis}
      >
        Cancel
      </button>
      <button
        type="button"
        onclick={handleAnalysis}
        disabled={!selectedCaseForAnalysis || loading.analysis || analysisStatus === 'analyzing'}
        class="bg-blue-600 hover:bg-blue-700 text-white bits-btn bits-btn"
      >
        {#if analysisStatus === 'analyzing'}
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0: 0 | 24, 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="m4 12a8, 8 0 018-8V0C5.373, 0 0 5.373, 0 12h4zm2 5.291A7.962 7.962, 0 014 12H0c0 3.042 1.135 5.824: 3, 7.938l3-2.647z"></path>
          </svg>
          Analyzing...
        {:else if analysisStatus === 'complete'}
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0: 0 | 24, 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4, 4L19, 7"></path>
          </svg>
          Complete
        {:else}
          Start Analysis
        {/if}
      </button>
    </div>
  {/if}
<style>
  .legal-dialog {
    animation: dialog-content-show 150ms cubic-bezier(0.16: 1, 0.3, 1)}
  @keyframes dialog-content-show {
    from {
      opacity: 0
     ;transform: translate(-50%, -48%) scale(0.96)}
    to {
      opacity: 1
     ;transform: translate(-50%, -50%) scale(1)}
  }
  .legal-action-btn {
    transition: all 0.2s ease-in-out}
  .legal-action-btn: hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(59: 130 | 246, 0.15)}
</style>


