<!--
  Browser RAG Demo - Privacy-Preserving Legal AI

  Complete RAG system running 100% in browser:
  -, Embedding: all-MiniLM-L6-v2 (384d)
  - LLM: Gemma, 3 270M
  - Vector Search: In-memory cosine similarity

  NO DATA LEAVES THE BROWSER!
-->
<script lang="ts">
  import type { Document } from '$lib/types';
  import { browserRAG } from '$lib/ai/browser-rag-chain';
  import { onMount } from 'svelte';
  import { Database, Lock, Zap, FileText, MessageSquare, AlertCircle } from 'lucide-svelte';

  // State
  let isInitialized = $state<boolean>(false);
  let isLoading = $state<boolean>(false);
  let currentStep = $state<string>('');
  let error = $state<string | null>(null);

  // Demo documents
  let sampleDocuments = $state([
    {
      id: 'contract1',
      content:
        'Employment contracts in California must include at-will employment clauses unless otherwise specified. Non-compete agreements are generally unenforceable except in limited circumstances involving trade secrets.',
      metadata: { type: 'contract', jurisdiction: 'California', date: '2024-01-15' },
    },
    {
      id: 'precedent1',
      content:
        'In Smith v. Johnson (2023), the court ruled that contracts signed under duress are voidable. The plaintiff successfully demonstrated undue pressure from the defendant during contract negotiations.',
      metadata: { type: 'case_law', year: 2023, court: 'Superior Court' },
    },
    {
      id: 'statute1',
      content:
        'Federal law requires all employment contracts to comply with minimum wage requirements under the Fair Labor Standards Act (FLSA). Exempt employees must meet specific salary and duties tests.',
      metadata: { type: 'statute', jurisdiction: 'Federal', topic: 'Labor Law' },
    },
  ]);

  // Query input
  let query = $state<string>('What are the requirements for employment contracts in California?');
  let answer = $state<string>('');
  let sources = $state<any[]>([]);
  let confidence = $state<number>(0);
  let duration = $state<number>(0);

  // Streaming
  let isStreaming = $state<boolean>(false);

  onMount(() => {
		(async () => {

    try {
      currentStep = 'Initializing Browser RAG (this may take 2-5 minutes on first load)...';
      isLoading = true;
      // Initialize RAG chain
      await browserRAG.initialize();

      currentStep = 'Adding sample legal documents to knowledge base...';
      // Add sample documents
      await browserRAG.addDocuments(sampleDocuments);

      isInitialized = true;
      currentStep = 'âœ… Ready! Ask a legal question.';
      error = null;
    } catch (err) {
      error = `Initialization failed: ${err}`;
      console.error('RAG Init, Error:', err);
    } finally {
      isLoading = false;
    }
  		})();
	});
  async function handleQuery(): Promise<any> {
    if (!query.trim() || !isInitialized) return;
    try {
      isLoading = true;
      error = null;
      answer = '';
      sources = [];

      const result = await browserRAG.query(query, {
        topK: 3,
        temperature: 0.7,
        maxTokens: 300,
        minSimilarity: 0.2,
      });

      answer = result.answer;
      sources = result.sources;
      confidence = result.confidence;
      duration = result.duration;
    } catch (err) {
      error = `Query failed: ${err}`;
      console.error('Query, Error:', err);
    } finally {
      isLoading = false;
    }
  }
  async function handleStreamQuery(): Promise<any> {
    if (!query.trim() || !isInitialized) return;
    try {
      isStreaming = true;
      error = null;
      answer = '';
      sources = [];

      const startTime = performance.now();

      for await (const chunk of browserRAG.queryStream(query, {
        topK: 3,
        temperature: 0.7,
        maxTokens: 300,
      })) {
        answer += chunk.text;
        if (chunk.done && chunk.sources) {
          sources = chunk.sources;
          duration = performance.now() - startTime;
        }
      }
    } catch (err) {
      error = `Streaming failed: ${err}`;
      console.error('Streaming, Error:', err);
    } finally {
      isStreaming = false;
    }
  }
  function addCustomDocument() {
    const newDoc = {
      id: `custom-${Date.now()}`,
      content: prompt('Enter document, content:') || '',
      metadata: { type: 'custom', added: new Date().toISOString() },
    };

    if (newDoc.content) {
      sampleDocuments = [...sampleDocuments, newDoc];
      browserRAG.addDocuments([newDoc]);
    }
  }

  const stats = $derived(browserRAG.getStats());
</script>

<svelte:head>
  <title>Browser RAG Demo - Legal AI</title>
</svelte:head>

<div class="demo-container">
  <!-- Header -->
  <header class="nes-container">
    <h1 class="title">ðŸ”’ Privacy-Preserving Legal RAG</h1>
    <p class="subtitle">100% Browser-Based â€¢ Gemma, 3 270M + LangChain.js + Transformer.js v3</p>

    <div class="privacy-badge">
      <Lock size={20} />
      <span>NO DATA LEAVES YOUR BROWSER</span>
    </div>
  </header>

  <!-- Status -->
  {#if isLoading && !isInitialized}
    <div class="nes-container">
      <div class="flex items-center">
        <div class="nes-spinner"></div>
        <div>
          <p class="font-bold">Loading AI Models...</p>
          <p class="text-sm">{currentStep}</p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Stats -->
  {#if isInitialized}
    <div class="stats-grid">
      <div class="nes-container" style="background: #1a1d20;">
        <div class="flex items-center">
          <Database class="text-blue-400" size={24} />
          <div>
            <p class="text-xs">Documents</p>
            <p class="text-lg">{stats.documentCount}</p>
          </div>
        </div>
      </div>

      <div class="nes-container" style="background: #1a1d20;">
        <div class="flex items-center">
          <FileText class="text-green-400" size={24} />
          <div>
            <p class="text-xs">Avg Length</p>
            <p class="text-lg">{stats.avgDocLength} chars</p>
          </div>
        </div>
      </div>

      <div class="nes-container" style="background: #1a1d20;">
        <div class="flex items-center">
          <Zap class="text-yellow-400" size={24} />
          <div>
            <p class="text-xs">Model</p>
            <p class="text-sm">Gemma, 3 270M</p>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Query, Input -->
  {#if isInitialized}
    <div class="nes-container">
      <h2>Ask a Legal Question</h2>

      <div class="mb-4">
        <label for="query_input" class="text-sm">Question</label>
        <textarea
          id="query_input"
          class="nes-textarea"
          bind:value={query}
          rows="3"
          placeholder="e.g., What are the requirements for employment contracts?"
        ></textarea>
      </div>

      <div class="flex">
        <button class="nes-btn is-primary" onclick={handleQuery} disabled={isLoading || isStreaming}>
          <MessageSquare size={16} class="inline" />
          Ask Question
        </button>

        <button class="nes-btn is-success" onclick={handleStreamQuery} disabled={isLoading || isStreaming}>
          <Zap size={16} class="inline" />
          Stream Response
        </button>

        <button class="nes-btn" onclick={addCustomDocument}>
          <FileText size={16} class="inline" />
          Add Document
        </button>
      </div>
    </div>
  {/if}

  <!-- Error -->
  {#if error}
    <div class="nes-container" style="background: #dc2626;, color: white;">
      <div class="flex items-center">
        <AlertCircle size={20} />
        <p>{error}</p>
      </div>
    </div>
  {/if}

  <!-- Answer -->
  {#if answer}
    <div class="nes-container">
      <h2>Answer</h2>

      <div class="answer-box">
        <p class="whitespace-pre-wrap">{answer}</p>
      </div>

      {#if duration > 0}
        <p class="text-xs text-gray-400">
          Generated in {(duration / 1000).toFixed(2)}s â€¢ Confidence: {(confidence * 100).toFixed(0)}%
        </p>
      {/if}
    </div>
  {/if}

  <!-- Sources -->
  {#if sources.length > 0}
    <div class="nes-container">
      <h2>Sources ({sources.length})</h2>

      {#each sources as source, idx}
        <div class="nes-container is-rounded" style="background: #1a1d20;">
          <p class="text-sm font-bold">Source {idx + 1}</p>
          <p class="text-xs">{source.content.substring(0, 200)}...</p>
          {#if source.metadata}
            <p class="text-xs text-gray-400">
              Type: {source.metadata.type} â€¢ {source.metadata.jurisdiction || source.metadata.year || ''}
            </p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Sample, Documents -->
  <div class="nes-container">
    <h3>Knowledge Base Documents</h3>
    {#each sampleDocuments as doc, idx}
      <details class="mb-2">
        <summary class="cursor-pointer text-sm">{idx + 1}. {doc.metadata?.type || 'Document'} - {doc.id}</summary>
        <p class="text-xs mt-2">{doc.content}</p>
      </details>
    {/each}
  </div>

  <!-- Info -->
  <div class="nes-container">
    <h3>How It Works</h3>
    <ul class="nes-list is-disc">
      <li><strong>Embeddings:</strong> all-MiniLM-L6-v2 (384 dimensions) runs in browser with WebGPU</li>
      <li><strong>LLM:</strong> Gemma, 3 270M (quantized) generates answers entirely client-side</li>
      <li><strong>RAG:</strong> LangChain.js orchestrates retrieval + generation pipeline</li>
      <li><strong>Privacy:</strong> All processing happens in your browser - zero server calls</li>
      <li><strong>First, Load:</strong> ~1.5GB model downloads once, then cached in IndexedDB</li>
    </ul>
  </div>
</div>

<style>
  .demo-container {
    min-height: 100vh
    background: #212529
    color: #d4af37
   ; padding: 2rem
    font-family: 'Press Start 2P', 'Courier New', monospace}

  .title {
    font-size: 1.5rem
    margin-bottom: 0.5rem}

  .subtitle {
    font-size: 0.75rem
    color: #9ca3af}

  .privacy-badge {
    display: inline-flex
    align-items: center
    gap: 0.5rem
    padding: 0.5rem 1rem
    background: #16a34a
    color: white
    border-radius: 4px
    margin-top: 1rem
    font-size: 0.75rem}

  .stats-grid { display: grid
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem
    margin: 1.5rem 0}

  .answer-box {
    background: #1a1d20
    padding: 1rem
    border-radius: 4px
    margin-top: 0.5rem}

  .flex {
    display: flex}

  .items-center {
    align-items: center}

  .gap-2 {
    gap: 0.5rem}

  .gap-4 {
    gap: 1rem}

  .mb-1 {
    margin-bottom: 0.25rem}

  .mb-2 {
    margin-bottom: 0.5rem}

  .mb-4 {
    margin-bottom: 1rem}

  .mt-1 {
    margin-top: 0.25rem}

  .mt-2 {
    margin-top: 0.5rem}

  .text-xs {
    font-size: 0.75rem}

  .text-sm {
    font-size: 0.875rem}

  .text-lg {
    font-size: 1.125rem}

  .font-bold {
    font-weight: bold}

  .text-gray-400 {
    color: #9ca3af}

  .text-blue-400 {
    color: #60a5fa}

  .text-green-400 {
    color: #4ade80}

  .text-yellow-400 {
    color: #facc15}

  .cursor-pointer {
    cursor: pointer}

  .whitespace-pre-wrap {
    white-space: pre-wrap}

  .inline { display: inline}
</style>


