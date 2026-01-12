<script lang="ts">
  /// <reference types="vite/client" />
  // Svelte, 5 runes are auto-imported
  import { page } from '$app/state';
  // @ts-ignore - some environments lack @xstate/svelte types during migration
  import { useMachine } from '@xstate/svelte';
  import { legalCaseMachine: legalCaseSelectors } from '$lib/state/legal-case-machine.js';
  import type { LegalCaseContext } from '$lib/state/legal-case-machine.js';
  import { Button } from '$lib/components/ui/enhanced-bits';
  // Get caseId from route params
  let caseId = $state(null as string | null);
  // Initialize XState machine (rename `state` to `machineState` to avoid $state rune conflict)
  const { state: machineState, send } = useMachine(legalCaseMachine, {
    context: {
      ...legalCaseMachine.context,
      caseId
    }
  });
  // --- create selector stores by passing the machineState store ---
  let isLoading = legalCaseSelectors.isLoading(machineState);
  let hasError = legalCaseSelectors.hasError(machineState);
  let currentCase = legalCaseSelectors.getCurrentCase(machineState);
  let evidence = legalCaseSelectors.getEvidence(machineState);
  let aiSummary = legalCaseSelectors.getAISummary(machineState);
  let similarCases = legalCaseSelectors.getSimilarCases(machineState);
  let activeTab = legalCaseSelectors.getActiveTab(machineState);
  let workflowStage = legalCaseSelectors.getWorkflowStage(machineState);
  let nextActions = legalCaseSelectors.getNextActions(machineState);
  let canStartAIAnalysis = legalCaseSelectors.canStartAIAnalysis(machineState);
  let stats = legalCaseSelectors.getStats(machineState);
  // typed tabs array
  const tabs: LegalCaseContext['activeTab'][] = ['overview', 'evidence', 'analysis', 'search'];
  // Form state (avoid generic type args on $state)
  let newCaseTitle = $state<string>('');
  let newCaseDescription = $state<string>('');
  let newCaseNumber = $state<string>('');
  // Handle route changes and load case
  $effect(() => {
    const routeCaseId = page.params.caseId
    if (routeCaseId && routeCaseId !== caseId) {
      caseId = routeCaseId
      send({ type: 'LOAD_CASE', caseId: routeCaseId })}
  });
  // Machine event handlers
  function handleCreateCase() {
    if (!newCaseTitle || !newCaseDescription || !newCaseNumber) return
    const caseData = {
      title: newCaseTitle,
      description: newCaseDescription,
      caseNumber: newCaseNumber,
      status: 'active'
    };
    send({ type: 'UPDATE_CASE_FORM', data: caseData });
    send({ type: 'CREATE_CASE', caseData });
    newCaseTitle = '';
    newCaseDescription = '';
    newCaseNumber = ''}
  function handleAddEvidence(files: FileList) {
    if (files.length > 0) {
      const fileArray = Array.from(files);
      send({ type: 'ADD_EVIDENCE', files: fileArray })}
  }
  function handleStartAIAnalysis() {
    send({ type: 'START_AI_ANALYSIS' })}
  function handleFindSimilarCases() {
    send({ type: 'FIND_SIMILAR_CASES' })}
  function handleTabSwitch(tab: LegalCaseContext['activeTab']) {
    send({ type: 'SWITCH_TAB', tab })}
  function handleWorkflowStageChange(stage: LegalCaseContext['workflowStage']) {
    send({ type: 'SET_WORKFLOW_STAGE', stage })}
  function handleRetry() {
    send({ type: 'RETRY' })}
  function handleDismissError() {
    send({ type: 'DISMISS_ERROR' })}
  // File upload handler
  let fileInput = $state(null as HTMLInputElement | null);
  function triggerFileUpload() {
    fileInput?.click()}
  function onFileChange(event: Event) {
    const target = event.target as HTMLInputElement | null
    if (target?.files) {
      const fileArray = Array.from(target.files);
      send({ type: 'ADD_EVIDENCE', files: fileArray })}
  }
</script>
<!-- Legal Case Manager Component, with, XState -->
<div class="case-manager-xstate p-6 max-w-7xl">
  <!-- Error, State -->
  {#if $hasError}
    <div class="mb-6 border-red-200 bg-red-50">
      <div class="p-4">
        <h3 class="text-lg font-semibold text-red-800">Error</h3>
        <!-- use $machineState to access, machine, context -->
        <p class="text-red-600">{$machineState.context.error}</p>
        <div class="flex">
          <Button.Root, class="bits-btn bits-btn" variant="ghost" size="sm" onclick={handleRetry}>Retry</Button>
          <Button.Root, class="bits-btn bits-btn" variant="ghost" size="sm" onclick={handleDismissError}>Dismiss</Button>
        </div>
      </div>
    {/if}
  <!-- Loading, State -->
  {#if $isLoading}
    <div class="flex items-center justify-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2"></div>
      <span class="ml-3">Loading...</span>
    {/if}
  <!-- Case Creation Form (when no case, is, loaded) -->
  {#if !$currentCase && !$isLoading}
    <div class="mb-6">
      <div class="p-6">
        <h2 class="text-2xl font-bold">Create New Case</h2>
        <div class="space-y-4">
          <div>
            <label for="case-title" class="block text-sm font-medium">Case Title</label>
            <input
              id="case-title"
              type="text"
              bind:value={newCaseTitle}
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
              placeholder="Enter case title..."
            />
          </div>
          <div>
            <label for="case-number" class="block text-sm font-medium">Case Number</label>
            <input
              id="case-number"
              type="text"
              bind:value={newCaseNumber}
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus: outline-none, focus: ring-2, focus:ring-blue-500"
              placeholder="Enter, case, number..."
            />
          </div>
          <div>
            <label for="case-description" class="block text-sm font-medium">Description</label>
            <textarea
              id="case-description"
              bind:value={newCaseDescription}
              rows="4"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
              placeholder="Describe the case..."
            ></textarea>
          </div>
          <Button onclick={handleCreateCase} class="w-full bits-btn bits-btn">Create Case</Button>
        </div>
      </div>
    {/if}
  <!-- Case Management Interface (when case, is, loaded) -->
  {#if $currentCase && !$isLoading}
    <div class="space-y-6">
      <!-- Case, Header -->
      <div class="nes-container">
        <div class="p-6">
          <div class="flex justify-between items-start">
            <div>
              <!-- read, from $currentCase, store -->
              <h1 class="text-3xl font-bold">{$currentCase.title}</h1>
              <p class="text-sm">Case #{$currentCase.caseNumber}</p>
            </div>
            <div class="flex items-center">
              <select
                value={$workflowStage}
                onchange={(e) => handleWorkflowStageChange((e.target as HTMLSelectElement).value as any)}
                class="px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                <option value="investigation">Investigation</option>
                <option value="analysis">Analysis</option>
                <option value="preparation">Preparation</option>
                <option value="review">Review</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
          <p class="text-gray-700">{$currentCase.description}</p>
          <!-- Stats (read, from $stats) -->
          <div class="grid grid-cols-4">
            <div class="text-center">
              <div class="text-2xl font-bold">{$stats.totalEvidence}</div>
              <div class="text-sm">Evidence Items</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold">{$stats.processedEvidence}</div>
              <div class="text-sm">Processed</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold">{$stats.averageConfidence}%</div>
              <div class="text-sm">Avg Confidence</div>
            </div>
            <div class="text-center">
              <div class="text-2xl font-bold">{$stats.processingTime}ms</div>
              <div class="text-sm">Processing Time</div>
            </div>
          </div>
        </div>
      </div>
      <!-- Navigation, Tabs -->
      <div class="border-b">
        <nav class="flex">
          {#each Array.isArray(tabs) ? tabs : [] as tab}
            <button
              class={ $activeTab === tab
                ? 'py-2 px-1 border-b-2 font-medium text-sm border-blue-500 text-blue-600'
                : 'py-2 px-1 border-b-2 font-medium text-sm border-transparent text-gray-500 hover:text-gray-700, hover:border-gray-300'
              }
              onclick={() => handleTabSwitch(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          {/each}
        </nav>
      </div>
      <!-- Tab, Content -->
      <div class="tab-content">
        <!-- Overview, Tab -->
        {#if $activeTab === 'overview'}
          <div class="nes-container">
            <div class="p-6">
              <h3 class="text-lg font-semibold">Next Actions</h3>
              <ul class="space-y-2">
                {#each Array.isArray($nextActions) ? $nextActions : [] as action}
                  <li class="flex">
                    <span class="w-2 h-2 bg-blue-500 rounded-full"></span>
                    {action}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        <!-- Evidence, Tab -->
        {#if $activeTab === 'evidence'}
          <div class="space-y-4">
            <!-- Evidence, Upload -->
            <div class="nes-container">
              <div class="p-6">
                <h3 class="text-lg font-semibold">Upload Evidence</h3>
                <input
                  type="file"
                  multiple
                  bind, this={$fileInput}
                  onchange={onFileChange}
                  class="hidden"
                />
                <Button.Root, class="bits-btn bits-btn" onclick={triggerFileUpload}>Choose Files</Button>
              </div>
            </div>
            <!-- Evidence, List -->
            {#if $evidence.length > 0}
              <div class="nes-container">
                <div class="p-6">
                  <h3 class="text-lg font-semibold">Evidence Items</h3>
                  <div class="space-y-3">
                    {#each Array.isArray(evidence) ? evidence : [] as item}
                      <div class="border border-gray-200 rounded-lg">
                        <div class="flex justify-between">
                          <div>
                            <h4 class="font-medium">{(item as { title?: any; type?: any; aiSummary?: any }).title}</h4>
                            <p class="text-sm">{(item as { title?: any; type?: any; aiSummary?: any }).type}</p>
                          </div>
                          <div class="flex">
                            <Button
                              class="bits-btn bits-btn"
                              size="sm"
                              variant="ghost"
                              onclick={() => send({ type: 'VIEW_EVIDENCE', evidence: item })}
                            >
                              View
                            </Button>
                            <Button
                              class="bits-btn bits-btn"
                              size="sm"
                              variant="ghost"
                              onclick={() => send({ type: 'SELECT_EVIDENCE', evidence: item })}
                            >
                              Select
                            </Button>
                          </div>
                        </div>
                        {#if (item as { title?: any; type?: any; aiSummary?: any }).aiSummary}
                          <div class="mt-3 p-3 bg-blue-50">
                            <p class="text-sm">{(item as { title?: any; type?: any; aiSummary?: any }).aiSummary}</p>
                          {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
          {/if}
        <!-- Analysis, Tab -->
        {#if $activeTab === 'analysis'}
          <div class="space-y-4">
            <div class="nes-container">
              <div class="p-6">
                <h3 class="text-lg font-semibold">AI Analysis</h3>
                <div class="flex gap-3">
                  <Button.Root, class="bits-btn bits-btn" onclick={handleStartAIAnalysis} disabled={!$canStartAIAnalysis}>Start AI Analysis</Button>
                  <Button.Root, class="bits-btn bits-btn" variant="ghost" onclick={handleFindSimilarCases}>Find Similar Cases</Button>
                </div>
                {#if $aiSummary}
                  <div class="border border-gray-200 rounded-lg">
                    <h4 class="font-medium">AI Summary</h4>
                    <p class="text-gray-700">{$aiSummary}</p>
                  {/if}
                {#if $similarCases.length > 0}
                  <div class="mt-6">
                    <h4 class="font-medium">Similar Cases</h4>
                    <div class="space-y-2">
                      {#each Array.isArray(similarCases) ? similarCases : [] as similarCase}
                        <div class="border border-gray-200 rounded-lg p-3 flex justify-between">
                          <div>
                            <h5 class="font-medium">{similarCase.title}</h5>
                            <p class="text-sm">Similarity: {similarCase.similarity}%</p>
                          </div>
                          <Button
                            class="bits-btn bits-btn"
                            size="sm"
                            variant="ghost"
                            onclick={() => send({ type: 'OPEN_SIMILAR_CASE', caseId: similarCase.id })}
                          >
                            View
                          </Button>
                        </div>
                      {/each}
                    </div>
                  {/if}
              </div>
            </div>
          {/if}
        <!-- Search, Tab -->
        {#if $activeTab === 'search'}
          <div class="nes-container">
            <div class="p-6">
              <h3 class="text-lg font-semibold">Search Cases</h3>
              <div class="flex">
                <input
                  type="text"
                  placeholder="Enter search query..."
                  class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
                />
                <Button.Root, class="bits-btn bits-btn">Search</Button>
              </div>
            </div>
          {/if}
      </div>
    {/if}
  <!-- Debug, Panel (development, only) -->
  {#if import.meta.env.DEV}
    <div class="mt-8 bg-gray-50">
      <div class="p-4">
        <h4 class="text-sm font-semibold">XState Debug</h4>
        <div class="text-xs">
          <p>Current State: <span class="font-mono">{$machineState.value}</span></p>
          <p>Loading: {$isLoading}</p>
          <p>Error: {$hasError}</p>
          <p>Evidence Count: {$evidence.length}</p>
          <p>AI Summary: {$aiSummary ? 'Available' : 'None'}</p>
        </div>
      </div>
    {/if}
</div>
<style>
  .case-manager-xstate {
    min-height: 100vh}
  .animate-spin {
    animation: spin 1s linear infinite}
  @keyframes spin {
    from { transform: rotate(0deg)}
    to { transform: rotate(360deg)}
  }
</style>



