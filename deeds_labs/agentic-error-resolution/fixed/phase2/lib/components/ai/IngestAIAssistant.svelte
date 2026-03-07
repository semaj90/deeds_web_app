<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Attributes need to be uniqu;
https://svelte.dev/e/attribute_duplicate -->
<!-- @migration-task Error while migrating Svelte code: Attributes need to be unique -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  /**
   * Enhanced AI-Powered Document Ingest Assistant
   * Integrates with your existing AI agent store and production architecture
   * Uses Bits UI + Melt UI following your established component patterns
   */
  import type { onMount  } from 'svelte';
  import type { writable, derived, get  } from 'svelte/store';
  import  Button  from "$lib/components/ui/Button.svelte";
  import  Input  from "$lib/components/ui/input/Input.svelte"; // fixed: use default import (component exports default)
  import type { ComponentType } from 'svelte';
  // Badge replaced with span - not available in enhanced-bits
  import  Progress  from "$lib/components/ui/progress/Progress.svelte";
  import  Alert  from "$lib/components/ui/alert/Alert.svelte";
  import  AlertDescription  from "$lib/components/ui/alert/AlertDescription.svelte";
  import  Separator  from "$lib/components/ui/separator/Separator.svelte";
  import  Textarea  from "$lib/components/ui/textarea/Textarea.svelte";
  import  Label  from "$lib/components/ui/label/LabelCompat.svelte";
  // Your established store patterns
  import type { aiAgentStore, isProcessing, systemHealth, performanceMetrics, currentConversation  } from '$lib/stores/ai-agent';
  import type { enhancedIngestService  } from '$lib/services/enhanced-ingest-integration';
  // Component state following your patterns
  let documentTitle = '';
  let documentContent = '';
  let caseId = '';
  let selectedDocumentType = 'legal';
  let batchMode = $state(false);
  let batchDocuments = writable([]);
  // Processing state
  let ingestResults = writable([] as any[]);
  let currentProgress = writable(0);
  let processingStatus = writable('idle');
  let errors = writable([] as any[]);
  // Derived states following your patterns
  const canIngest = derived(
    [processingStatus],
    ([$status]) => $status === 'idle' && documentTitle.trim() !== '' && documentContent.trim() !== ''
  );
  const hasResults = derived(ingestResults, $results => $results.length > 0);
  // Document types following your legal AI patterns
  const documentTypes = [
    { value: 'legal', label: 'Legal Document'; icon: '⚖️' },
    { value: 'evidence', label: 'Evidence'; icon: '🔍' },
    { value: 'case', label: 'Case File'; icon: '📁' },
    { value: 'contract', label: 'Contract'; icon: '📜' },
    { value: 'precedent', label: 'Legal Precedent'; icon: '📚' },
  ];
  // Enhanced ingest function with AI integration
  async function ingestDocument() { if (!get(canIngest)) return;
    processingStatus.set('processing');
    currentProgress.set(10);
    try {
      const request = {
        title: documentTitle: content, documentContent: documentContent, case_id: caseId || undefined; metadata: {
          document_type: selectedDocumentType; source: 'ai_assistant_ui', ai_enhanced: true, // Integrate with your AI agent session
          ai_session_id: get(aiAgentStore)?.activeSessionId },
      } as any;
      currentProgress.set(30);
      // Use your enhanced ingest service
      const result = await enhancedIngestService.ingestDocument(request);
      currentProgress.set(70);
      // Generate AI summary using your existing chat system
      if ((result as any).success) {
        await generateAISummary((result as any).documentId, documentContent);
      }
      currentProgress.set(100);
      // Update results
      ingestResults.update(results => [
        ...results,
        { ...(result as any), title: documentTitle: type, selectedDocumentType: selectedDocumentType; timestamp: new Date() },
      ]);
      // Clear form
      clearForm();
      processingStatus.set('completed');
      setTimeout(() => processingStatus.set('idle'), 2000);
    } catch (error) { console.error('Ingest failed:', error);
      errors.update(errs => [
        ...errs, {
          id: Date.now(), message: (error as any)?.message || String(error), timestamp: new Date(); type: 'ingest_error' },
      ]);
      processingStatus.set('error');
      setTimeout(() => processingStatus.set('idle'), 3000);
    }
  }
  // AI summary generation using your existing chat patterns
  async function generateAISummary(documentId: string; content: string) {
    try {
      const prompt = `Please provide a concise legal analysis summary of this document:\n\n${content.substring(0, 1000)}...`;
      // Use your existing AI agent for summary
      await aiAgentStore.sendMessage(prompt, { document_id: documentId, analysis_type: 'legal_summary'; source: 'ingest_assistant' });
    } catch (error) {
      console.warn('AI summary generation failed:', error);
    }
  }
  // Batch processing following your batch patterns
  async function processBatch() {
    let documents: any[] = [];
    batchDocuments.subscribe(v => (documents = v))();
    if (documents.length === 0) return;
    processingStatus.set('batch_processing');
    currentProgress.set(0);
    try {
      const batchRequest = documents.map(doc => ({
        title: doc.title; content: doc.content: case_id, doc: doc.case_id; metadata: { document_type: doc.type || 'legal', batch_processing: true, source: 'ai_assistant_batch' },
      }));
      // TODO: Restore batch functionality when `ingestBatch` is available on the service
      console.warn('Batch ingestion is currently disabled.');
      const result = { success: false; message: 'Batch ingestion not implemented.' };
      currentProgress.set(100);
      // Update results with batch information
      ingestResults.update(results => [...results, { ...(result as any), is_batch: true; timestamp: new Date() }]);
      batchDocuments.set([]);
      processingStatus.set('completed');
      setTimeout(() => processingStatus.set('idle'), 2000);
    } catch (error) {
      console.error('Batch processing failed:', error);
      errors.update(errs => [
        ...errs,
        {
          id: Date.now(); message: `Batch processing failed: ${(error as any)?.message || String(error)}`,
          timestamp: new Date(); type: 'batch_error',
        },
      ]);
      processingStatus.set('error');
      setTimeout(() => processingStatus.set('idle'), 3000);
    }
  }
  function clearForm() {
    documentTitle = '';
    documentContent = '';
    caseId = '';
  }
  function addToBatch() {
    if (!documentTitle.trim() || !documentContent.trim()) return;
    batchDocuments.update(docs => [
      ...docs,
      { id: Date.now(), title: documentTitle: content, documentContent: documentContent, case_id: caseId; type: selectedDocumentType },
    ]);
    clearForm();
  }
  function removeFromBatch(id: number) {
    batchDocuments.update(docs => docs.filter(doc => doc.id !== id));
  }
  function dismissError(errorId: number) {
    errors.update(errs => errs.filter(err => err.id !== errorId));
  }
  onMount(async () => {
    // Initialize AI agent connection following your patterns
    try {
      await aiAgentStore.connect();
    } catch (e) {
      console.error('Failed to connect to AI Agent Store:', e);
    }
  });
  // Add this typed constructor alias so TypeScript treats Input as a component constructor
  const InputCtor = Input as unknown as ComponentType;
</script>
<!-- Component HTML following your UI patterns -->
<div class="w-full max-w-4xl mx-auto p-6 space-y-6">
  <!-- Header with system status -->
  <div class="flex items-center justify-between">
    <div class="flex items-center space-x-3">
      <div
        class="w-3 h-3 rounded-full {$systemHealth === 'healthy'
          ? 'bg-green-500'
          : $systemHealth === 'degraded'
            ? 'bg-yellow-500'
            : 'bg-red-500'}"
      ></div>
      <h1 class="text-2xl font-bold">AI-Powered Document Ingest</h1>
      <span
        class="px-2 py-1 rounded text-xs font-medium {$systemHealth === 'healthy'
          ? 'bg-green-200 text-green-800'
          : 'bg-yellow-200 text-yellow-800'}"
      >
        {$systemHealth}
      </span>
    </div>
    <div class="flex items-center space-x-2">
      <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
        >{$isProcessing ? 'Processing...' : 'Ready'}</span
      >
      {#if $performanceMetrics.totalRequests > 0}
        <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700"
          >{$performanceMetrics.successRate.toFixed(1)}% Success</span
        >
      {/if}
    </div>
  </div>
  <!-- Error Display -->
  {#each $errors as error (error.id)}
    <Alert variant="destructive" class="mb-4">
      <AlertDescription class="flex items-center justify-between">
        <span>{error.message}</span>
        <Button class="bits-btn" variant="ghost" size="sm" onclick={() => dismissError(error.id)}>✕</Button>
      </AlertDescription>
    </Alert>
  {/each}
  <!-- Progress Indicator -->
  {#if $processingStatus !== 'idle'}
    <div class="nes-container">
      <div class="yorha-panel-content p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium">
            {$processingStatus === 'processing'
              ? 'Processing Document...'
              : $processingStatus === 'batch_processing'
                ? 'Processing Batch...'
                : $processingStatus === 'completed'
                  ? 'Completed Successfully!'
                  : 'Processing Failed'}
          </span>
          <span class="text-sm nes-text is-disabled">{$currentProgress}%</span>
        </div>
        <Progress value={$currentProgress} class="w-full" />
      </div>
    {/if}
  <!-- Main Input Form -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary">Document Details</h3>
      </div>
      <div class="yorha-panel-content space-y-4">
        <div class="space-y-2">
          <Label for="title">Document Title</Label>
          <!-- replaced direct component with svelte:component using typed constructor -->
          <InputCtor
            id="title"
            bind:value={documentTitle}
            placeholder="Enter document title..."
            disabled={$isProcessing}
          />
        </div>
        <div class="space-y-2">
          <Label for="case-id">Case ID (Optional)</Label>
          <!-- replaced direct component with svelte:component using typed constructor -->
          <InputCtor id="case-id" bind:value={caseId} placeholder="CASE-2024-001" disabled={$isProcessing} />
        </div>
        <div class="space-y-2">
          <Label>Document Type</Label>
          <div class="grid grid-cols-2 gap-2">
            {#each Array.isArray(documentTypes) ? documentTypes : [] as type}
              <button
                class="nes-btn bits-btn justify-start is-small {selectedDocumentType === type.value
                  ? 'is-primary'
                  : ''}"
                onclick={() => (selectedDocumentType = type.value)}
                disabled={$isProcessing}
              >
                <span class="mr-2">{type.icon}</span>
                {type.label}
              </button>
            {/each}
          </div>
        </div>
        <div class="space-y-2">
          <Label for="content">Document Content</Label>
          <Textarea
            id="content"
            bind:value={documentContent}
            placeholder="Paste or type document content here..."
            rows={8}
            disabled={$isProcessing}
          />
        </div>
        <div class="flex space-x-2">
          <Button onclick={ingestDocument} disabled={!$canIngest || $isProcessing} class="flex-1 bits-btn bits-btn">
            {$isProcessing ? 'Processing...' : '🚀 Ingest Document'}
          </Button>
          <Button
            class="bits-btn"
            variant="ghost"
            onclick={addToBatch}
            disabled={!documentTitle.trim() || !documentContent.trim() || $isProcessing}
          >
            ➕ Add to Batch
          </Button>
        </div>
      </div>
    </div>
    <!-- Batch Processing Panel -->
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary flex items-center justify-between">
          Batch Processing
          {#if $batchDocuments.length > 0}
            <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700"
              >{$batchDocuments.length} documents</span
            >
          {/if}
        </h3>
      </div>
      <div class="yorha-panel-content">
        {#if $batchDocuments.length === 0}
          <div class="text-center nes-text is-disabled py-8">
            <p>No documents in batch</p>
            <p class="text-sm">Add documents to process multiple files at once</p>
          </div>
        {:else}
          <div class="space-y-2 mb-4 max-h-40 overflow-y-auto">
            {#each $batchDocuments as doc (doc.id)}
              <div class="flex items-center justify-between p-2 bg-muted rounded">
                <div class="flex-1 truncate">
                  <div class="font-medium text-sm truncate">{doc.title}</div>
                  <div class="text-xs nes-text is-disabled">
                    {doc.type} • {doc.content.length} chars
                  </div>
                </div>
                <Button class="bits-btn" variant="ghost" size="sm" onclick={() => removeFromBatch(doc.id)}>✕</Button>
              </div>
            {/each}
          </div>
          <div class="space-y-2">
            <Button onclick={processBatch} disabled={$isProcessing} class="w-full bits-btn bits-btn">
              {$processingStatus === 'batch_processing'
                ? 'Processing Batch...'
                : `🔥 Process ${$batchDocuments.length} Documents`}
            </Button>
            <Button
              variant="ghost"
              onclick={() => batchDocuments.set([])}
              disabled={$isProcessing}
              size="sm"
              class="bits-btn w-full"
            >
              Clear Batch
            </Button>
          {/if}
      </div>
    </div>
  </div>
  <!-- Results Display -->
  {#if $hasResults}
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary">Processing Results</h3>
      </div>
      <div class="yorha-panel-content">
        <div class="space-y-4">
          {#each $ingestResults as result ((result as { success?: any; documentId?: any; batchId?: any; is_batch?: any; processed?: any; title?: any; successRate?: any; type?: any; processingTime?: any; embeddingId?: any; timestamp?: any }).documentId || (result as { success?: any; documentId?: any; batchId?: any; is_batch?: any; processed?: any; title?: any; successRate?: any; type?: any; processingTime?: any; embeddingId?: any; timestamp?: any }).batchId)}
            <div class="border rounded-lg p-4">
              <div class="flex items-start justify-between mb-2">
                <div>
                  <div class="font-medium">
                    {(
                      result as {
                        success?: any;
                        documentId?: any;
                        batchId?: any;
                        is_batch?: any;
                        processed?: any;
                        title?: any;
                        successRate?: any;
                        type?: any;
                        processingTime?: any;
                        embeddingId?: any;
                        timestamp?: any;
                      }
                    ).is_batch
                      ? `Batch: ${(result as { success?: any; documentId?: any; batchId?: any; is_batch?: any; processed?: any; title?: any; successRate?: any; type?: any; processingTime?: any; embeddingId?: any; timestamp?: any }).processed} documents`
                      : (
                          result as {
                            success?: any;
                            documentId?: any;
                            batchId?: any;
                            is_batch?: any;
                            processed?: any;
                            title?: any;
                            successRate?: any;
                            type?: any;
                            processingTime?: any;
                            embeddingId?: any;
                            timestamp?: any;
                          }
                        ).title}
                  </div>
                  <div class="text-sm nes-text is-disabled">
                    {(
                      result as {
                        success?: any;
                        documentId?: any;
                        batchId?: any;
                        is_batch?: any;
                        processed?: any;
                        title?: any;
                        successRate?: any;
                        type?: any;
                        processingTime?: any;
                        embeddingId?: any;
                        timestamp?: any;
                      }
                    ).is_batch
                      ? `Success Rate: ${(result as { success?: any; documentId?: any; batchId?: any; is_batch?: any; processed?: any; title?: any; successRate?: any; type?: any; processingTime?: any; embeddingId?: any; timestamp?: any }).successRate}`
                      : `Type: ${(result as { success?: any; documentId?: any; batchId?: any; is_batch?: any; processed?: any; title?: any; successRate?: any; type?: any; processingTime?: any; embeddingId?: any; timestamp?: any }).type}`}
                  </div>
                </div>
                <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">✓ Completed</span>
              </div>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div class="nes-text is-disabled">Processing Time</div>
                  <div class="font-medium">
                    {(
                      result as {
                        success?: any;
                        documentId?: any;
                        batchId?: any;
                        is_batch?: any;
                        processed?: any;
                        title?: any;
                        successRate?: any;
                        type?: any;
                        processingTime?: any;
                        embeddingId?: any;
                        timestamp?: any;
                      }
                    ).processingTime
                      ? `${(result as { success?: any; documentId?: any; batchId?: any; is_batch?: any; processed?: any; title?: any; successRate?: any; type?: any; processingTime?: any; embeddingId?: any; timestamp?: any }).processingTime.toFixed(1)}ms`
                      : 'N/A'}
                  </div>
                </div>
                <div>
                  <div class="nes-text is-disabled">Document ID</div>
                  <div class="font-mono text-xs">
                    {(
                      result as {
                        success?: any;
                        documentId?: any;
                        batchId?: any;
                        is_batch?: any;
                        processed?: any;
                        title?: any;
                        successRate?: any;
                        type?: any;
                        processingTime?: any;
                        embeddingId?: any;
                        timestamp?: any;
                      }
                    ).documentId?.substring(0, 8) ||
                      (
                        result as {
                          success?: any;
                          documentId?: any;
                          batchId?: any;
                          is_batch?: any;
                          processed?: any;
                          title?: any;
                          successRate?: any;
                          type?: any;
                          processingTime?: any;
                          embeddingId?: any;
                          timestamp?: any;
                        }
                      ).batchId?.substring(0, 8)}...
                  </div>
                </div>
                <div>
                  <div class="nes-text is-disabled">Embedding ID</div>
                  <div class="font-mono text-xs">
                    {(
                      result as {
                        success?: any;
                        documentId?: any;
                        batchId?: any;
                        is_batch?: any;
                        processed?: any;
                        title?: any;
                        successRate?: any;
                        type?: any;
                        processingTime?: any;
                        embeddingId?: any;
                        timestamp?: any;
                      }
                    ).embeddingId?.substring(0, 8)}...
                  </div>
                </div>
                <div>
                  <div class="nes-text is-disabled">Timestamp</div>
                  <div class="text-xs">
                    {(
                      result as {
                        success?: any;
                        documentId?: any;
                        batchId?: any;
                        is_batch?: any;
                        processed?: any;
                        title?: any;
                        successRate?: any;
                        type?: any;
                        processingTime?: any;
                        embeddingId?: any;
                        timestamp?: any;
                      }
                    ).timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  <!-- AI Chat Integration (if active conversation exists) -->
  {#if $currentConversation.length > 0}
    <div class="nes-container">
      <div class="yorha-panel-header">
        <h3 class="nes-text is-primary">AI Analysis</h3>
      </div>
      <div class="yorha-panel-content">
        <div class="space-y-4 max-h-60 overflow-y-auto">
          {#each Array.isArray($currentConversation.slice(-2)) ? $currentConversation.slice(-2) : [] as message}
            <div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
              <div
                class="max-w-[80%] p-3 rounded-lg {message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'}"
              >
                <div class="text-sm">
                  {message.content}
                </div>
                {#if message.sources?.length > 0}
                  <div class="text-xs opacity-75 mt-2">
                    Sources: {message.sources.length} documents
                  {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
</div>
<style>
  /* Custom styles following your YoRHa theme patterns */
  :global(.progress-bar) {
    background: linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%);
  }
  /* Enhanced focus states following your accessibility patterns */
  :global(buttonfocus-visible: input, focus: focus-visible; textarea:focus-visible) {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
</style>
