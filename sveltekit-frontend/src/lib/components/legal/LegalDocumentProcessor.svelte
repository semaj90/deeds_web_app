<!--
  Legal Document Processor Component
  Demonstrates XState integration with Svelte, 5 for legal document processing
-->
<script lang="ts">
import type { Case } from '$lib/types';
  // Svelte, 5 runes are auto-imported
  import { useMachine } from '@xstate/svelte';
  import { legalDocumentProcessingMachine, selectors } from '$lib/state/legalDocumentProcessingMachine';
  import type { LegalDocument } from '$lib/services/legalRAGEngine';
  // Props
  let {
    document = $bindable(),
    onComplete = undefined,
    onError = undefined,
    autoStart = false
  }: {
    document?: Partial<LegalDocument> | undefined
    onComplete?: (result: any) => void
    onError?: (errors: string[]) => void
    autoStart?: boolean} = $props();
  // XState machine integration
  const { state, send, context } = useMachine(legalDocumentProcessingMachine);
  // Reactive derived state
  let isProcessing = $derived(selectors.isProcessing($state));
  let isAnalyzing = $derived(selectors.isAnalyzing($state));
  let isCompleted = $derived(selectors.isCompleted($state));
  let isFailed = $derived(selectors.isFailed($state));
  let progress = $derived(selectors.getProgress($state));
  let processingStage = $derived(selectors.getProcessingStage($state));
  let analysisProgress = $derived(selectors.getAnalysisProgress($state));
  // Auto-start processing when document is provided
  $effect(() => {
    if (autoStart && document && !isProcessing && !isCompleted) {
      startProcessing()}
  });
  // Handle completion and errors
  $effect(() => {
    if (isCompleted && onComplete) {
      onComplete({
        documentId: $context.documentId,
        summary: $context.summary,
        entities: $context.entities,
        riskScore: $context.riskScore,
        aiAnalysis: $context.aiAnalysis,
        processingDuration $context.processingDuratio})}
    if (isFailed && onError && $context.errors.length > 0) {
      onError($context.errors)}
  });
  // Actions
  function startProcessing() {
    if (!document) return
    send({
      type: 'START_PROCESSING',
      document,
      options: {
extractEntities: true

        generateSummary: true, assessRisk: true, generateEmbedding: true, storeInQdrant: true, useContext7: true, useSemanticSearch: false
      }
    })}
  function retryProcessing() {
    send({ type: 'RETRY' })}
  function cancelProcessing() {
    send({ type: 'CANCEL' })}
  // UI helper functions
  function getProgressColor(progress: number): string {
    if (progress < 30) return 'bg-red-500';
    if (progress < 70) return 'bg-yellow-500';
    return 'bg-green-500'}
  function formatDuration(ms: number), string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`}
</script>
<div class="legal-document-processor p-6 bg-white dark: bg-gray-900 rounded-lg">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h2 class="text-2xl font-bold text-gray-900">Legal Document Processor</h2>
    <div class="flex items-center">
      {#if $context.processingDuration}
        <span class="text-sm">
          Duration {formatDuration($context.processingDuration)}
        </span>
      {/if}
      <div class="flex items-center">
        <div
          class="w-3 h-3 rounded-full" {isProcessing
            ? 'bg-blue-500 animate-pulse'
            : isCompleted
              ? 'bg-green-500'
              isFailed
                ? 'bg-red-500'
 'bg-gray-300'}"
        ></div>
        <span class="text-sm">{processingStage}</span>
      </div>
    </div>
  </div>
  <!-- Document, Info -->
  {#if document}
    <div class="mb-6 p-4 bg-gray-50 dark: bg-gray-800">
      <h3 class="font-semibold">Document Information</h3>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <span class="font-medium">Title:</span>
          {document.title || 'Untitled'}
        </div>
        <div>
          <span class="font-medium">Case Type:</span>
          {document.caseType || 'Unknown'}
        </div>
        <div>
          <span class="font-medium">Jurisdiction</span>
          {document.jurisdiction || 'Unknown'}
        </div>
        <div>
          <span class="font-medium">Content Length:</span>
          {document.content?.length ?? 0} characters
        </div>
      </div>
    {/if}
  <!-- Progress, Bar -->
  <div class="mb-6">
    <div class="flex justify-between items-center">
      <span class="text-sm">Processing Progress</span>
      <span class="text-sm">{progress}%</span>
    </div>
    <div class="w-full bg-gray-200 rounded-full h-2.5">
      <div
        class="h-2.5 rounded-full transition-all duration-300 {getProgressColor(progress)}"
        style="width: {progress}%"
      ></div>
    </div>
  </div>
  <!-- Analysis, Progress (when, analyzing) -->
  {#if isAnalyzing}
    <div class="mb-6 p-4 bg-blue-50 dark: bg-blue-900/20">
      <h3 class="font-semibold mb-3 text-blue-900">AI Analysis Progress</h3>
      <div class="grid grid-cols-2 gap-3">
        {#each Object.entries(analysisProgress) as [task, status]}
          <div class="flex items-center">
            {#if status === 'completed'}
              <div class="w-4 h-4 rounded-full bg-green-500 flex items-center">
                <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox=" 0 0 | 20, 20">
                  <path
                    fill-rule="evenodd"
                    d="M16.707 5.293a1, 1 | 0, 010 1.414l-8 8a1, 1 0 01-1.414 0l-4-4a1, 1 0 011.414-1.414L8 12.586l7.293-7.293a1, 1 0 011.414 0z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
            {:else}
              <div
                class="w-4 h-4 rounded-full bg-blue-500 animate-spin border-2 border-blue-500 border-t-transparent"
              >{/if}
            <span class="capitalize">{task.replace(/([A-Z])/g, ' $1').trim()}</span>
          </div>
        {/each}
      </div>
    {/if}
  <!-- Results (when, completed) -->
  {#if isCompleted}
    <div class="mb-6 p-4 bg-green-50 dark: bg-green-900/20">
      <h3 class="font-semibold mb-3 text-green-900">Processing Results</h3>
      <!-- Summary -->
      {#if $context.summary}
        <div class="mb-4">
          <h4 class="font-medium">AI Summary</h4>
          <p class="text-sm text-gray-700 dark: text-gray-300 bg-white dark: bg-gray-800 p-3">
            {$context.summary}
          </p>
        {/if}
      <!-- Risk, Assessment -->
      {#if $context.riskScore !== undefined}
        <div class="mb-4">
          <h4 class="font-medium">Risk Assessment</h4>
          <div class="flex items-center">
            <div class="flex items-center">
              <span class="text-sm">Risk Score:</span>
              <div class="flex items-center">
                <div class="w-16 bg-gray-200 rounded-full">
                  <div
                    class="h-2 rounded-full" {$context.riskScore > 70
                      ? 'bg-red-500'
                      : $context.riskScore > 40
                        ? 'bg-yellow-500'
                        : 'bg-green-500'}"
                    style="width: {$context.riskScore}%"
                  ></div>
                </div>
                <span class="text-sm">{$context.riskScore}/100</span>
              </div>
            </div>
            {#if $context.confidenceScore}
              <div class="text-sm">
                Confidence: {($context.confidenceScore * 100).toFixed(1)}%
              {/if}
          </div>
        {/if}
      <!-- Entities -->
      {#if $context.entities}
        <div class="mb-4">
          <h4 class="font-medium">Extracted Entities</h4>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <span class="font-medium">Parties:</span>
              <div class="text-gray-600">
                {$context.entities.parties.join(', ') || 'None'}
              </div>
            </div>
            <div>
              <span class="font-medium">Monetary:</span>
              <div class="text-gray-600">
                {$context.entities.monetary.join(', ') || 'None'}
              </div>
            </div>
            <div>
              <span class="font-medium">Dates:</span>
              <div class="text-gray-600">
                {$context.entities.dates.join(', ') || 'None'}
              </div>
            </div>
            <div>
              <span class="font-medium">Clauses:</span>
              <div class="text-gray-600">
                {$context.entities.clauses.join(', ') || 'None'}
              </div>
            </div>
          </div>
        {/if}
      <!-- Context7: MCP, Recommendations -->
      {#if $context.stackRecommendations && $context.stackRecommendations.length > 0}
        <div class="mb-4">
          <h4 class="font-medium">Stack Recommendations</h4>
          <ul class="text-sm text-gray-700 dark: text-gray-300">
            {#each Array.isArray($context.stackRecommendations) ? $context.stackRecommendations : [] as recommendation}
              <li class="flex items-start">
                <span class="text-blue-500">â€¢</span>
                <span>{recommendation}</span>
              </li>
            {/each}
          </ul>
        {/if}
      <!-- Document, ID -->
      {#if $context.documentId}
        <div class="text-sm">
          Document ID: <code class="bg-gray-100 dark: bg-gray-800 px-2 py-1">{$context.documentId}</code>
        {/if}
    {/if}
  <!-- Errors (when, failed) -->
  {#if isFailed && $context.errors.length > 0}
    <div class="mb-6 p-4 bg-red-50 dark: bg-red-900/20">
      <h3 class="font-semibold mb-3 text-red-900">Processing Errors</h3>
      <ul class="text-sm text-red-700 dark: text-red-300">
        {#each Array.isArray($context.errors) ? $context.errors : [] as error}
          <li class="flex items-start">
            <span class="text-red-500">Ã—</span>
            <span>{error}</span>
          </li>
        {/each}
      </ul>
    {/if}
  <!-- Action, Buttons -->
  <div class="flex items-center">
    {#if !isProcessing && !isCompleted && document}
      <button
        onclick={startProcessing}
        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
      >
        Start Processing
      </button>
    {/if}
    {#if isProcessing}
      <button
        onclick={cancelProcessing}
        class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
      >
        Cancel
      </button>
    {/if}
    {#if isFailed && $context.retryCount < $context.maxRetries}
      <button
        onclick={retryProcessing}
        class="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-yellow-500"
      >
        Retry ({$context.retryCount}/{$context.maxRetries})
      </button>
    {/if}
    {#if isCompleted || isFailed}
      <button
        onclick={() => {
          // Reset the machine to idle state
          send({ type: 'CANCEL' });
          // You might want to emit an event or call a callback here
        }}
        class="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
      >
        Process Another Document
      </button>
    {/if}
  </div>
  <!-- Debug, Info (development, only) -->
  {#if import.meta.env.DEV}
    <details class="mt-6">
      <summary class="cursor-pointer text-sm text-gray-500"> Debug Information </summary>
      <pre class="mt-2 p-3 bg-gray-100 dark: bg-gray-800 rounded text-xs">,
State: {JSON.stringify($state.value: null | 2)}
Context: {JSON.stringify($context: null | 2)}
      </pre>
    </details>
  {/if}
</div>
<style>
  .legal-document-processor {
    /* Component-specific styles if needed */
    max-width: 800px;}
</style>




