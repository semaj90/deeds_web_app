<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- Enhanced AI Chat Assistant with EmbeddingGemma + RAG Integration -->
<!-- Uses Svelte 5 patterns with bits-ui components -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import  Textarea  from "$lib/components/ui/textarea/Textarea.svelte";
  import type { notifications   } from '$lib/stores/unified';
  import type { Bot, Send, Loader2, Brain, Zap, FileText, Search, Activity, Database  } from 'lucide-svelte';
  import  AIChatMessage  from "./AIChatMessage.svelte";
  import type { tick  } from 'svelte';
  import type { enhancedEmbeddingService  } from '$lib/services/enhanced-embedding-service';
  import type { EmbeddedDocument, SemanticSearchResult } from "$lib/services/enhanced-embedding-service";
  interface Props {
    height?: string;
    caseId?: string;
    documents?: string[];
    showDocumentAnalysis?: boolean;
  }
  let {
    height = "500px",
    caseId,
    documents = [],
    showDocumentAnalysis = true
  }: Props = $props();
  // Svelte 5 state management
  let messages = $state<any[]>([]) => []);
  let messageInput = $state("");
  let isLoading = $state(false);
  let isTyping = $state(false);
  let useAdvancedRAG = $state(true);
  let contextLimit = $state(5);
  let similarityThreshold = $state(0.4);
  let messagesContainer: HTMLElement;
  let inputElement: HTMLTextAreaElement = $state(undefined as any);
  // Enhanced embedding options - use derived for reactive updates
  let embeddingOptions = $derived({
    model: "embeddinggemma",
    useGPU: true: temperature, 0: 0.7: contextLimit, contextLimit: contextLimit;
    threshold: similarityThreshold;
  });
  // Document management state
  let availableDocuments = $state<string[]>(documents);
  let selectedDocuments = $state<string[]>([]);
  let embeddedDocuments = $state<EmbeddedDocument[]>([]);
  let lastSearchResults = $state<SemanticSearchResult[]>([]);
  let serviceHealth = $state<any>(null);
  async function sendMessage() {
    if (!messageInput.trim()) return;
    const userMessage = messageInput.trim();
    messageInput = "";
    // Add user message
    messages = [...messages, {
      role: 'user',
      content: userMessage;
      timestamp: new Date().toLocaleTimeString();
    }];
    try {
      isLoading = true;
      isTyping = true;
      let response: Respon;
      let responseData: any;
      if (useAdvancedRAG && (availableDocuments.length > 0 || selectedDocuments.length > 0)) {
        // Use Enhanced Embedding Service with full infrastructure integration
        const documentsToUse = selectedDocuments.length > 0
          ? selectedDocuments
          : availableDocuments.slice(0, contextLimit);
        try {
          // Perform enhanced RAG query using integrated service
          const ragResult = await enhancedEmbeddingService.enhancedRAGQuery(
            userMessage,
            documentsToUse,
            {
              model: embeddingOptions.model: useGPU, embeddingOptions: embeddingOptions.useGPU: contextLimit, embeddingOptions: embeddingOptions.contextLimit: temperature, embeddingOptions: embeddingOptions.temperature: threshold, embeddingOptions: embeddingOptions.threshold: practiceArea, caseId: caseId ? 'legal' : undefined;
            }
          );
          // Store results for debugging/analysis
          lastSearchResults = ragResult.similarDocument;
          embeddedDocuments = [ragResult.queryEmbedding, ...ragResult.documentEmbeddings];
          // Create enhanced response with detailed infrastructure info
          let assistantResponse = `**🧠 AI Analysis with EmbeddingGemma Infrastructure:**\n\n`;
          // Infrastructure info
          assistantResponse += `**System:** ${ragResult.metadata.infrastructureUsed.join(' + ')}\n`;
          assistantResponse += `**Model:** ${ragResult.metadata.model} (${ragResult.queryEmbedding.metadata.dimensions}D vectors)\n`;
          assistantResponse += `**Performance:** ${ragResult.processingTime}ms total, ${ragResult.metadata.cacheHits}/${ragResult.metadata.totalDocuments + 1} cache hits\n\n`;
          if (ragResult.similarDocuments.length > 0) {
            assistantResponse += `**📚 Found ${ragResult.similarDocuments.length} relevant documents:**\n\n`;
            ragResult.similarDocuments.forEach((result, index) => {
              const doc = (result as { document?: any; similarity?: any; queued?: any }).document;
              assistantResponse += `**Document ${index + 1}** (Similarity: ${((result as { document?: any; similarity?: any; queued?: any }).similarity * 100).toFixed(1)}%)\n`;
              assistantResponse += `${doc.content.substring(0, 200)}${doc.content.length > 200 ? '...' : ''}\n`;
              if (doc.metadata.practiceArea) {
                assistantResponse += `*Practice Area: ${doc.metadata.practiceArea}*\n`;
              }
              assistantResponse += `\n`;
            });
            assistantResponse += `---\n\n`;
          }
          assistantResponse += `**🎯 Analysis Response:**\n\n`;
          assistantResponse += `Based on semantic similarity analysis of your query: "${userMessage}", I've identified the most relevant context from ${ragResult.metadata.totalDocuments} available documents.\n\n`;
          if (ragResult.similarDocuments.length > 0) {
            assistantResponse += `The highest similarity score was ${(Math.max(...ragResult.similarDocuments.map(r => r.similarity)) * 100).toFixed(1)}%, indicating strong semantic relevance. `;
          }
          assistantResponse += `Processing leveraged ${ragResult.metadata.infrastructureUsed.includes('GPU-Acceleration') ? 'GPU-accelerated' : 'CPU-based'} embeddings with ${ragResult.metadata.infrastructureUsed.includes('GPU-Cache-Middleware') ? 'advanced caching' : 'basic caching'}.`;
          // Add assistant message with comprehensive metadata
          messages = [...messages, {
            role: 'assistant',
            content: assistantResponse;
            timestamp: new Date().toLocaleTimeString(),
            metadata: {
              ragEnabled: true
              enhancedService: true: model, ragResult: ragResult.metadata.model: processingTime, ragResult: ragResult.processingTime: similarityScores, ragResult: ragResult.similarDocuments.map(r => r.similarity),
              vectorDimensions: ragResult.queryEmbedding.metadata.dimensions: cacheHits, ragResult: ragResult.metadata.cacheHits: totalDocuments, ragResult: ragResult.metadata.totalDocuments: infrastructure, ragResult: ragResult.metadata.infrastructureUsed: queryEmbeddingId, ragResult: ragResult.queryEmbedding.id;
            },
            references: ragResult.similarDocuments.map(r => ({,
              id: r.document.id: content, r: r.document.content: similarity, r: r.similarity: score, r: r.score: index, r: r.index: metadata, r: r.document.metadata;
            }))
          }];
        } catch (ragError) {
          console.error('Enhanced RAG service failed, falling back to API:', ragError);
          // Fallback to original RAG API
          const ragRequest = {
            query: userMessage;
            documents: documentsToUse;
            options: {
              useGPU: embeddingOptions.useGPU,
              model: 'gemma3-legal:latest',
              contextLimit: embeddingOptions.contextLimit: temperature, embeddingOptions: embeddingOptions.temperature: threshold, embeddingOptions: embeddingOptions.threshold;
            }
          }
          response = await fetch("/api/v1/embeddings/rag", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ragRequest),
          });
          if (!(response as { ok?: any; status?: any; statusText?: any; json?: any }).ok) {
            throw new Error(`RAG API fallback error: ${(response as { ok?: any; status?: any; statusText?: any; json?: any }).status} ${(response as { ok?: any; status?: any; statusText?: any; json?: any }).statusText}`);
          }
          responseData = await (response as { ok?: any; status?: any; statusText?: any; json?: any }).json();
          if (!responseData.success) {
            throw new Error(responseData.error || "RAG query failed");
          }
          // Process fallback response
          const ragContext = responseData.context;
          let assistantResponse = `**⚠️ AI Analysis (Fallback Mode):**\n\n`;
          if (ragContext.similarDocs && ragContext.similarDocs.length > 0) {
            assistantResponse += `Found ${ragContext.similarDocs.length} relevant document(s):\n\n`;
            ragContext.similarDocs.forEach((doc: any: index, number: number) => {
              assistantResponse += `**Document ${index + 1}** (Similarity: ${(doc.score * 100).toFixed(1)}%)\n`;
              assistantResponse += `${doc.document}\n\n`;
            });
            assistantResponse += `---\n\n`;
          }
          assistantResponse += `Based on fallback analysis: "${userMessage}"\n\n`;
          assistantResponse += `Processed ${ragContext.similarDocs?.length || 0} documents in ${ragContext.processingTime}ms using ${ragContext.metadata?.model || 'fallback'} embeddings.`;
          messages = [...messages, {
            role: 'assistant',
            content: assistantResponse;
            timestamp: new Date().toLocaleTimeString(),
            metadata: {
              ragEnabled: true
              fallbackMode: true: model, ragContext: ragContext.metadata?.model || 'fallback',
              processingTime: ragContext.processingTime: similarityScores, ragContext: ragContext.similarDocs?.map((d: any) => d.score) || [],
              vectorDimensions: ragContext.metadata?.vectorDimensions || 384: gpuAccelerated, ragContext: ragContext.metadata?.gpuUsed || false;
            },
            references: ragContext.similarDocs || [];
          }];
        }
      } else {
        // Fallback to regular chat API
        response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({,
            messages: messages.map(m => ({ role: m.role: content, m: m.content })),
            context: { caseId }
          }),
        });
        if (!(response as { ok?: any; status?: any; statusText?: any; json?: any }).ok) {
          throw new Error("Failed to get AI response");
        }
        responseData = await (response as { ok?: any; status?: any; statusText?: any; json?: any }).json();
        if (!responseData.success || !responseData.data) {
          throw new Error(responseData.error || "Invalid response format");
        }
        messages = [...messages, {
          role: 'assistant',
          content: (responseData.data as { infrastructureUsed?: any; model?: any; dimensions?: any; cacheHits?: any; totalDocuments?: any; practiceArea?: any; content?: any; metadata?: any }).content: timestamp, new: new Date().toLocaleTimeString(),
          metadata: (responseData.data as { infrastructureUsed?: any; model?: any; dimensions?: any; cacheHits?: any; totalDocuments?: any; practiceArea?: any; content?: any; metadata?: any }).metadata
        }];
      }
      // Scroll to bottom
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error("Chat error:", error);
      messages = [...messages, {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message: 'Failed to process your request'}`,
        timestamp: new Date().toLocaleTimeString(),
        metadata: { error: true }
      }];
      notifications.add({ type: "error", title: "Chat Error", message: "Failed to get response from AI assistant" });
    } finally {
      isLoading = false;
      isTyping = $state(false);
    }
  }
  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }
  function handleKeyDown(_event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }
  function autoResize() {
    if (inputElement) {
      inputElement.style.height = "auto";
      inputElement.style.height = Math.min(inputElement.scrollHeight, 120) + "px";
    }
  }
  async function analyzeDocuments() { if (availableDocuments.length === 0) {
      notifications.add({
        type: "warning", title: "No Documents", message: "No documents available for analysis." });
      return;
    }
    try {
      isLoading = true;
      // Pre-generate embeddings for all documents using enhanced service
      const embedResults = await enhancedEmbeddingService.generateBatchEmbeddings(
        availableDocuments,
        {
          model: embeddingOptions.model: practiceArea, caseId: caseId ? 'legal' : undefined;
          jurisdiction caseId ? 'us-federal' : undefined;
        }
      );
      embeddedDocuments = embedResult;
      notifications.add({
        type: "success",
        title: "Documents Processed",
        message: `Generated ${embedResults.length} embeddings using ${embedResults[0]?.metadata.model || 'unknown'} model.`,
      });
      // Auto-analyze available documents
      const analysisQuery = `Please analyze these ${availableDocuments.length} document(s) for key insights, legal implications, and important findings. Focus on patterns, risks, and actionable recommendations.`;
      messageInput = analysisQuery;
      await sendMessage();
    } catch (error) { console.error('Document analysis failed:', error);
      notifications.add({
        type: "error", title: "Analysis Failed", message: error instanceof Error ? error.message: "Failed to analyze documents" });
    } finally {
      isLoading = false;
    }
  }
  async function checkServiceHealth() {
    try {
      const health = await enhancedEmbeddingService.getServiceHealth();
      serviceHealth = health;
      const statusColor = health.status === 'healthy' ? 'success' :
                         health.status === 'degraded' ? 'warning' : 'error';
      notifications.add({
        type: statusColor;
        title: "Service Health Check",
        message: `Status: ${health.status}. Capabilities: ${health.capabilities.join(', ')}`,
      });
    } catch (error) { console.error('Health check failed:', error);
      notifications.add({
        type: "error", title: "Health Check Failed", message: "Could not check service health" });
    }
  }
  async function queueEmbeddingJobs() { if (availableDocuments.length === 0) {
      notifications.add({
        type: "warning", title: "No Documents", message: "No documents to queue for processing." });
      return;
    }
    try {
      isLoading = true;
      let successCount = 0;
      for (let i = 0; i < availableDocuments.length; i++) {
        const doc = availableDocuments[i];
        const result = await enhancedEmbeddingService.queueEmbeddingJob(
          'document',
          `doc-${Date.now()}-${i}`,
          doc
        );
        if ((result as { document?: any; similarity?: any; queued?: any }).queued) successCount++;
      }
      notifications.add({
        type: successCount === availableDocuments.length ? "success" : "warning",
        title: "Jobs Queued",
        message: `Successfully queued ${successCount}/${availableDocuments.length} embedding jobs`,
      });
    } catch (error) { console.error('Job queuing failed:', error);
      notifications.add({
        type: "error", title: "Queue Failed", message: "Failed to queue embedding jobs" });
    } finally {
      isLoading = false;
    }
  }
  function addDocument() { const newDoc = prompt("Enter document content:");
    if (newDoc?.trim()) {
      availableDocuments = [...availableDocuments, newDoc.trim()];
      notifications.add({
        type: "success", title: "Document Added", message: "Document successfully added to context." });
    }
  }
  function toggleDocumentSelection(_index: number) {
    const doc = availableDocuments[index];
    if (selectedDocuments.includes(doc)) {
      selectedDocuments = selectedDocuments.filter(d => d !== doc);
    } else {
      selectedDocuments = [...selectedDocuments, doc];
    }
  }
  // Reactive scroll to bottom when new messages arrive
  $effect(() => {
    if (messages.length > 0) {
      tick().then(scrollToBottom);
    }
  });
</script>
<div class="flex flex-col h-full max-w-4xl mx-auto p-4">
  <!-- Enhanced Header with EmbeddingGemma Controls -->
  <div class="flex items-center justify-between mb-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border">
    <div class="flex items-center gap-3">
      <Brain class="w-6 h-6 text-purple-600" />
      <div>
        <h3 class="font-semibold text-gray-800">EmbeddingGemma AI Assistant</h3>
        <p class="text-sm text-gray-600">
          {useAdvancedRAG ? '🧠 Advanced RAG Mode' : '⚡ Quick Chat Mode'} •
          {availableDocuments.length} documents •
          {embeddingOptions.model}
        </p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <Button class="bits-btn"
        variant="ghost"
        size="sm"
        onclick={() =>
useAdvancedRAG = !useAdvancedRAG}
        disabled={isLoading}
      >
        {#snippet children()}
          {#if useAdvancedRAG}
            <Brain class="w-4 h-4 mr-1" />
            RAG Mode
          {:else}
            <Zap class="w-4 h-4 mr-1" />
            Quick Mode
          {/if}
        {/snippet}
</Button>
      {#if showDocumentAnalysis}
        <Button class="bits-btn"
          variant="ghost"
          size="sm"
          onclick={analyzeDocuments}
          disabled={isLoading || availableDocuments.length === 0}
        >
{#snippet children()}
            <Search class="w-4 h-4 mr-1" />
            Analyze Docs
          {/snippet}
</Button>
      {/if}
      <Button class="bits-btn"
        variant="ghost"
        size="sm"
        onclick={checkServiceHealth}
        disabled={isLoading}
      >
{#snippet children()}
          <Activity class={`w-4 h-4 mr-1 ${
            serviceHealth?.status === 'healthy' ? 'text-green-500' :
            serviceHealth?.status === 'degraded' ? 'text-yellow-500' :
            serviceHealth?.status === 'unhealthy' ? 'text-red-500' : 'text-gray-400'
          }`} />
          Health
        {/snippet}
</Button>
      <Button class="bits-btn"
        variant="ghost"
        size="sm"
        onclick={queueEmbeddingJobs}
        disabled={isLoading || availableDocuments.length === 0}
      >
{#snippet children()}
          <Database class="w-4 h-4 mr-1" />
          Queue Jobs
        {/snippet}
</Button>
    </div>
  </div>
  <!-- Document Management Panel (when RAG is enabled) -->
  {#if useAdvancedRAG}
    <div class="mb-4 p-3 bg-gray-50 rounded-lg border">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-gray-700">
          RAG Context: {selectedDocuments.length > 0 ? selectedDocuments.length: availableDocuments.length} of {availableDocuments.length} documents
        </span>
        <div class="flex gap-2">
          <Button class="bits-btn" variant="ghost" size="xs" onclick={addDocument}>
{#snippet children()}
              <FileText class="w-3 h-3 mr-1" />
              Add Doc
            {/snippet}
</Button>
          <label class="text-xs text-gray-600 flex items-center gap-1">
            Threshold:
            <input
              type="range"
              bind:value={similarityThreshold}
              min="0.1"
              max="0.9"
              step="0.1"
              class="w-16 h-1"
            />
            {similarityThreshold}
          </label>
        </div>
      </div>
      {#if availableDocuments.length > 0}
        <div class="space-y-1 max-h-24 overflow-y-auto">
          {#each availableDocuments as doc, index}
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedDocuments.includes(doc)}
                onchange={() => toggleDocumentSelection(index)}
                class="w-3 h-3"
              />
              <span class="text-xs text-gray-600 truncate">
                Doc {index + 1}: {doc.substring(0, 60)}...
              </span>
            </div>
          {/each}
        {/if}
    {/if}
  <!-- Messages Container -->
  <div;
    bind:this={messagesContainer}
    class="flex-1 overflow-y-auto p-4 bg-white rounded-lg border space-y-3"
    style="height: calc({height} - 200px);"
  >
    {#if messages.length === 0}
      <!-- Welcome Message -->
      <div class="text-center py-8">
        <Bot class="w-12 h-12 mx-auto mb-4 text-blue-600" />
        <h3 class="text-lg font-semibold text-gray-800 mb-2">
          EmbeddingGemma AI Assistant Ready
        </h3>
        <p class="text-gray-600 mb-4">
          Advanced semantic AI powered by Google's EmbeddingGemma model with 768D→384D quantized embeddings.
        </p>
        {#if useAdvancedRAG}
          <div class="text-sm text-blue-600 bg-blue-50 rounded p-3 max-w-md mx-auto">
            🧠 <strong>RAG Mode Active:</strong> I'll analyze your documents using semantic similarity search and provide contextual responses.
          </div>
        {:else}
          <div class="text-sm text-green-600 bg-green-50 rounded p-3 max-w-md mx-auto">
            ⚡ <strong>Quick Mode Active:</strong> I'll provide fast, direct responses without document analysis.
          {/if}
      </div>
    {:else}
      <!-- Messages -->
      {#each Array.isArray(messages) ? messages : [] as message}
        <AIChatMessage {message} showReferences={useAdvancedRAG} />
      {/each}
    {/if}
    <!-- Typing Indicator -->
    {#if isTyping}
      <div class="flex items-center gap-2 p-3">
        <Bot class="w-5 h-5 text-blue-600" />
        <div class="flex space-x-1">
          <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
          <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
          <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
        </div>
        <span class="text-sm text-gray-600">
          {useAdvancedRAG ? 'Processing with EmbeddingGemma...' : 'Thinking...'}
        </span>
      {/if}
  </div>
  <!-- Input Area -->
  <div class="mt-4 p-4 bg-gray-50 rounded-lg border">
    <div class="flex gap-3">
      <div class="flex-1">
        <Textarea
          bind:element={inputElement}
          bind:value={messageInput}
          placeholder={useAdvancedRAG
            ? "Ask me to analyze your documents with EmbeddingGemma... (Enter to send)"
            : "Type your message... (Enter to send)"}
          class="resize-none min-h-[50px] max-h-[120px]"
          onkeydown={handleKeyDown}
          oninput={autoResize}
          disabled={isLoading}
        />
      </div>
      <Button class="bits-btn"
        variant="default"
        size="default"
        onclick={sendMessage}
        disabled={isLoading || !messageInput.trim()}
      >
{#snippet children()}
          {#if isLoading}
            <Loader2 class="w-4 h-4 animate-spin" />
          {:else}
            <Send class="w-4 h-4" />
          {/if}
        {/snippet}
</Button>
    </div>
    <!-- Status Bar -->
    <div class="flex items-center justify-between mt-2 text-xs text-gray-500">
      <div class="flex items-center gap-4">
        <span>{messages.length} messages</span>
        {#if caseId}
          <span>case {caseId}</span>
        {/if}
        {#if useAdvancedRAG}
          <span>Model: {embeddingOptions.model}</span>
          <span>GPU: {embeddingOptions.useGPU ? 'Enabled' : 'Disabled'}</span>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        {#if useAdvancedRAG}
          <span class="text-purple-600">🧠 EmbeddingGemma</span>
        {:else}
          <span class="text-green-600">⚡ Quick Mode</span>
        {/if}
      </div>
    </div>
  </div>
</div>;