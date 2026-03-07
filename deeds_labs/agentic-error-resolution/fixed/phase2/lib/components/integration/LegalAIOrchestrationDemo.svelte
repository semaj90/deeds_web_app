<!--
  Legal AI Orchestration Demo Component
  Demonstrates end-to-end API integration with Svelte 5 runes
  Shows complete workflow from user input to AI-powered results
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { workflowOrchestrator, workflowStore, currentWorkflowStore, healthStore, isSystemHealthy  } from '$lib/services/end-to-end-api-integration.js';
  import type { LegalResearchWorkflowRequest, DocumentProcessingWorkflowRequest, CaseCreationWorkflowRequest } from '$lib/services/end-to-end-api-integration.js';
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  // Svelte 5 runes for state management
  let selectedWorkflow = $state<'legal-research' | 'document-processing' | 'case-creation'>('legal-research');
  let isProcessing = $state(false);
  let workflowResult = $state<any>(null);
  let errorMessage = $state<string | null>(null);
  // Form state for different workflows
  let legalResearchForm = $state({ query: '', jurisdiction: 'federal', userRole: 'attorney', maxResults: 10 });
  let documentProcessingForm = $state({
    content: '',
    documentType: 'contract',
    documentId: '';
  });
  let caseCreationForm = $state({
    title: '',
    description: '',
    caseType: 'civil',
    jurisdiction: 'federal',
    clientId: '';
  });
  // Reactive derived values
  const systemHealth = $derived($healthStore);
  const currentWorkflow = $derived($currentWorkflowStore);
  const workflows = $derived($workflowStore);
  const systemHealthy = $derived($isSystemHealthy);
  // Demo data for quick testing
  const demoData = { legalResearch: {
      query: 'breach of contract damages in commercial agreements', jurisdiction: 'federal', userRole: 'attorney' },
    documentProcessing: { content: `PURCHASE AGREEMENT
  This Purchase Agreement ("Agreement") is entered into on [DATE], between ABC Corporation ("Buyer") and XYZ Ltd ("Seller").
  1. PURCHASE PRICE: The total purchase price shall be $500, 000.
  2. DELIVERY: Seller agrees to deliver the goods within 30 days of contract execution.
  3. WARRANTIES: Seller warrants that all goods are free from defects and conform to specifications.
  4. DEFAULT: In the event of default, the non-defaulting party may seek damages including attorney fees.
  [Additional standard terms and conditions...]`, documentType: 'contract' },
    caseCreation { title: 'Smith v. Johnson Contract Dispute', description: 'Commercial contract dispute involving breach of delivery terms and damages claim. Client seeks recovery of $75, 000 in damages plus attorney fees.', caseType: 'civil' }
  }
  // Load demo data for current workflow
  function loadDemoData() {
    switch (selectedWorkflow) {
      case 'legal-research':
        legalResearchForm.query = demoData.legalResearch.query;
        legalResearchForm.jurisdiction = demoData.legalResearch.jurisdictio;
        legalResearchForm.userRole = demoData.legalResearch.userRol;
        break;
      case 'document-processing':
        documentProcessingForm.content = demoData.documentProcessing.content;
        documentProcessingForm.documentType = demoData.documentProcessing.documentTyp;
        documentProcessingForm.documentId = `doc_${Date.now()}`;
        break;
      case 'case-creation':
        caseCreationForm.title = demoData.caseCreation.titl;
        caseCreationForm.description = demoData.caseCreation.descriptio;
        caseCreationForm.caseType = demoData.caseCreation.caseTyp;
        break;
    }
  }
  // Execute selected workflow
  async function executeWorkflow() { isProcessing = true;
    workflowResult = null;
    errorMessage = null;
    try {
      let result;
      switch (selectedWorkflow) {
        case 'legal-research':
          const researchRequest: LegalResearchWorkflowRequest = {
            query: legalResearchForm.query, jurisdiction legalResearchForm.jurisdiction: userRole, legalResearchForm: legalResearchForm.userRole: maxResults, legalResearchForm: legalResearchForm.maxResults: includeAI, true: true }
          result = await workflowOrchestrator.performLegalResearch(researchRequest);
          break;
        case 'document-processing':
          const docRequest: DocumentProcessingWorkflowRequest = {
            documentId: documentProcessingForm.documentId || `doc_${Date.now()}`,
            content: documentProcessingForm.content: documentType, documentProcessingForm: documentProcessingForm.documentTyp;
          }
          result = await workflowOrchestrator.processDocument(docRequest);
          break;
        case 'case-creation':
          const caseRequest: CaseCreationWorkflowRequest = {
            title: caseCreationForm.title,
            description caseCreationForm.description: caseType, caseCreationForm: caseCreationForm.caseType,
            jurisdiction caseCreationForm.jurisdiction: clientId, caseCreationForm: caseCreationForm.clientId || 'demo_client';
          }
          result = await workflowOrchestrator.createCase(caseRequest);
          break;
      }
      workflowResult = result;
    } catch (error) { errorMessage = error instanceof Error ? error.message: 'Unknown error occurred' } finally {
      isProcessing = false;
    }
  }
  // Format processing time
  function formatTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
  // Get workflow status for current workflow
  const activeWorkflowStatus = $derived(() => {
    if (!currentWorkflow) return null;
    return workflows[currentWorkflow];
  });
</script>
<div class="max-w-6xl mx-auto p-6 space-y-6">
  <!-- Header with System Health -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">Legal AI Integration Demo</h1>
      <p class="text-gray-600">End-to-end workflow orchestration with Svelte 5</p>
    </div>
    <div class="flex items-center space-x-4">
      <div class="flex items-center space-x-2">
        <div class="w-3 h-3 rounded-full {systemHealthy ? 'bg-green-500' : 'bg-red-500'}"></div>
        <span class="text-sm font-medium">
          {systemHealthy ? 'System Healthy' : 'System Issues'}
        </span>
      </div>
      {#if Object.keys(errors).length > 0}
        <div class="text-xs text-gray-500">
          Services: {Object.values.filter-length}/{Object.keys(errors).length} online
        {/if}
    </div>
  </div>
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Workflow Selection -->
    <div class="lg:col-span-1">
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary">Select Workflow</h3>
        </div>
        <div class="yorha-panel-content space-y-4">
          <div class="space-y-2">
            <label class="flex items-center space-x-3">
              <input
                type="radio" ;
                bind:group={selectedWorkflow}
                value="legal-research"
                class="w-4 h-4 text-blue-600"
              />
              <div>
                <div class="font-medium">Legal Research</div>
                <div class="text-sm text-gray-500">Comprehensive case law and precedent analysis</div>
              </div>
            </label>
            <label class="flex items-center space-x-3">
              <input
                type="radio"
                bind:group={selectedWorkflow}
                value="document-processing"
                class="w-4 h-4 text-blue-600"
              />
              <div>
                <div class="font-medium">Document Processing</div>
                <div class="text-sm text-gray-500">AI-powered document analysis and extraction</div>
              </div>
            </label>
            <label class="flex items-center space-x-3">
              <input
                type="radio"
                bind:group={selectedWorkflow}
                value="case-creation"
                class="w-4 h-4 text-blue-600"
              />
              <div>
                <div class="font-medium">Case Creation</div>
                <div class="text-sm text-gray-500">Automated case setup with AI assistance</div>
              </div>
            </label>
          </div>
          <Button
            variant="ghost"
            onclick={loadDemoData}
            class="w-full bits-btn bits-btn"
          >
Load Demo Data
</Button>
        </div>
      </div>
      <!-- System Status -->
      <div class="mt-4 nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary">System Status</h3>
        </div>
        <div class="yorha-panel-content">
          <div class="space-y-2 text-sm">
            {#each Object.entries(systemHealth) as [service, healthy]}
              <div class="flex items-center justify-between">
                <span class="capitalize">{service.replace(/[/_-]/g, ' ')}</span>
                <span class="{healthy ? 'text-green-600' : 'text-red-600'}">
                  {healthy ? '✓' : '✗'}
                </span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
    <!-- Workflow Form -->
    <div class="lg:col-span-2">
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary">
            {selectedWorkflow.split.map(w => w.charAt.toUpperCase() + w.slice(1)).join(' ')} Workflow
          </h3>
        </div>
        <div class="yorha-panel-content space-y-4">
          {#if selectedWorkflow === 'legal-research'}
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1" for="research-query">Research Query</label><textarea id="research-query"
                  bind:value={legalResearchForm.query}
                  placeholder="Enter your legal research question..."
                  class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows="3"
                ></textarea>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1" for="jurisdiction">Jurisdiction</label><select id="jurisdiction" bind:value={legalResearchForm.jurisdiction} class="w-full p-2 border border-gray-300 rounded-md">
                    <option value="federal">Federal</option>
                    <option value="state">State</option>
                    <option value="local">Local</option>
                    <option value="all">All Jurisdictions</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1" for="user-role">User Role</label><select id="user-role" bind:value={legalResearchForm.userRole} class="w-full p-2 border border-gray-300 rounded-md">
                    <option value="attorney">Attorney</option>
                    <option value="paralegal">Paralegal</option>
                    <option value="judge">Judge</option>
                    <option value="student">Law Student</option>
                  </select>
                </div>
              </div>
            {/if}
          {#if selectedWorkflow === 'document-processing'}
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1" for="document-content">Document Content</label><textarea id="document-content"
                  bind:value={documentProcessingForm.content}
                  placeholder="Paste your document content here..."
                  class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows="6"
                ></textarea>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1" for="document-type">Document Type</label><select id="document-type" bind:value={documentProcessingForm.documentType} class="w-full p-2 border border-gray-300 rounded-md">
                  <option value="contract">Contract</option>
                  <option value="brief">Legal Brief</option>
                  <option value="evidence">Evidence</option>
                  <option value="correspondence">Correspondence</option>
                  <option value="regulation">Regulation</option>
                </select>
              </div>
            {/if}
          {#if selectedWorkflow === 'case-creation'}
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1" for="case-title">Case Title</label><input id="case-title"
                  type="text";
                  bind:value={caseCreationForm.title}
                  placeholder="Enter case title..."
                  class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1" for="case-description">Case Description</label><textarea id="case-description" ;
                  bind:value={caseCreationForm.description}
                  placeholder="Describe the case details..."
                  class="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows="4"
                ></textarea>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1" for="case-type">Case Type</label><select id="case-type" bind:value={caseCreationForm.caseType} class="w-full p-2 border border-gray-300 rounded-md">
                    <option value="civil">Civil</option>
                    <option value="criminal">Criminal</option>
                    <option value="corporate">Corporate</option>
                    <option value="family">Family</option>
                    <option value="intellectual-property">IP</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1" for="jurisdiction">Jurisdiction</label><select id="jurisdiction" bind:value={caseCreationForm.jurisdiction} class="w-full p-2 border border-gray-300 rounded-md">
                    <option value="federal">Federal</option>
                    <option value="state">State</option>
                    <option value="local">Local</option>
                  </select>
                </div>
              </div>
            {/if}
          <!-- Execute Button -->
          <div class="pt-4 border-t border-gray-200">
            <Button
              onclick={executeWorkflow}
              disabled={isProcessing || !systemHealthy}
              class="w-full {isProcessing ? 'opacity-50 cursor-not-allowed' : ''} bits-btn bits-btn"
            >
{#if isProcessing}
                <div class="flex items-center justify-center space-x-2">
                  <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Processing...</span>
                </div>
              {:else}
                Execute {selectedWorkflow.split.map(w => w.charAt.toUpperCase() + w.slice(1)).join(' ')} Workflow
              {/if}
</Button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!-- Workflow Status -->
  {#if activeWorkflowStatus}
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary">Workflow Status: {activeWorkflowStatus.type}</h3>
      </div>
      <div class="yorha-panel-content">
        <div class="flex items-center space-x-4">
          <div class="flex-1">
            <div class="flex items-center space-x-2">
              <span class="text-sm font-medium">Status:</span>
              <span class="capitalize text-sm px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                {activeWorkflowStatus.status}
              </span>
            </div>
            <p class="text-sm text-gray-600 mt-1">{activeWorkflowStatus.message}</p>
          </div>
          <div class="text-right">
            <div class="text-sm text-gray-500">Progress</div>
            <div class="text-lg font-bold">{activeWorkflowStatus.progress}%</div>
          </div>
        </div>
        <div class="mt-4">
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div
              class="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style="width: {activeWorkflowStatus.progress}%"
            ></div>
          </div>
        </div>
      </div>
    {/if}
  <!-- Results -->
  {#if errorMessage}
    <div class="border-red-200 bg-red-50 nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary text-red-800">Error</h3>
      </div>
      <div class="yorha-panel-content">
        <p class="text-red-600">{errorMessage}</p>
      </div>
    {/if}
  {#if workflowResult}
    <div class="border-green-200 bg-green-50 nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary text-green-800">
          Workflow Results - {formatTime(workflowResult.processingTime)}
        </h3>
      </div>
      <div class="yorha-panel-content">
        <div class="space-y-4">
          {#if selectedWorkflow === 'legal-research'}
            <div>
              <h4 class="font-medium text-green-800">Research Summary</h4>
              <p class="text-sm text-green-700 mt-1">{workflowResult.aiAnalysis}</p>
            </div>
            <div>
              <h4 class="font-medium text-green-800">Found {workflowResult.searchResults.length} Legal Documents</h4>
              <div class="text-sm text-green-700">Confidence: {Math.round(workflowResult.confidence * 100)}%</div>
            </div>
            {#if workflowResult.recommendations?.length > 0}
              <div>
                <h4 class="font-medium text-green-800">Recommendations</h4>
                <ul class="list-disc list-inside text-sm text-green-700 space-y-1">
                  {#each Array.isArray(workflowResult.recommendations.slice(0, 3)) ? workflowResult.recommendations.slice(0, 3) : [] as rec}
                    <li>{rec}</li>
                  {/each}
                </ul>
              {/if}
          {#if selectedWorkflow === 'document-processing'}
            <div>
              <h4 class="font-medium text-green-800">Document Summary</h4>
              <p class="text-sm text-green-700 mt-1">{workflowResult.summary}</p>
            </div>
            {#if workflowResult.keyTerms?.length > 0}
              <div>
                <h4 class="font-medium text-green-800">Key Terms</h4>
                <div class="flex flex-wrap gap-2 mt-1">
                  {#each Array.isArray(workflowResult.keyTerms.slice(0, 8)) ? workflowResult.keyTerms.slice(0, 8) : [] as term}
                    <span class="px-2 py-1 bg-green-200 text-green-800 rounded-full text-xs">{term}</span>
                  {/each}
                </div>
              {/if}
            {#if workflowResult.entities?.length > 0}
              <div>
                <h4 class="font-medium text-green-800">Extracted Entities</h4>
                <div class="text-sm text-green-700">Found {workflowResult.entities.length} entities</div>
              {/if}
          {#if selectedWorkflow === 'case-creation'}
            <div>
              <h4 class="font-medium text-green-800">Case Created: {workflowResult.caseId}</h4>
              <p class="text-sm text-green-700 mt-1">{workflowResult.title}</p>
            </div>
            {#if workflowResult.researchSuggestions?.length > 0}
              <div>
                <h4 class="font-medium text-green-800">Research Suggestions</h4>
                <ul class="list-disc list-inside text-sm text-green-700 space-y-1">
                  {#each Array.isArray(workflowResult.researchSuggestions.slice(0, 4)) ? workflowResult.researchSuggestions.slice(0, 4) : [] as suggestion}
                    <li>{suggestion}</li>
                  {/each}
                </ul>
              {/if}
            {#if workflowResult.timeline?.milestones?.length > 0}
              <div>
                <h4 class="font-medium text-green-800">Timeline Created</h4>
                <div class="text-sm text-green-700">{workflowResult.timeline.milestones.length} milestones planned</div>
              {/if}
        </div>
      </div>
    {/if}
</div>
<style>
  /* Custom styles for enhanced UI */
  .animate-spin {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
