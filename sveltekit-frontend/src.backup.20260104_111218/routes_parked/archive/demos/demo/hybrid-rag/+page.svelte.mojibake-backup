<script lang="ts">
import type { Document } from '$lib/types';
  /**
   * ðŸ§ª Hybrid RAG + SIMD Pipeline Demo
   *
   * Test the complete RAG pipeline:
   * - Upload documents â†’ Embed â†’ Summarize â†’ Index â†’ Rank
   * - Search with Gemma function calling
   * - View synthesis ranking scores
   */

  import Button from '$lib/components/ui/Button.svelte';
  import { Upload } from "lucide-svelte";
import { Search } from "lucide-svelte";
import { Zap } from "lucide-svelte";
import { Database } from "lucide-svelte";;

  // State management using Svelte, 5 runes
  let query = $state <string>('');
  let documents = $state <any[]>([]);
  let results = $state <any[]>([]);
  let isProcessing = $state <boolean>(false);
  let processingStage = $state <string>('');
  let timing = $state <any>(null);
  let error = $state <string>('');

  // Sample documents for testing
  const sampleDocuments = $state([ {
      id: 'doc1',
      title: 'Employment Contract - Software Engineer',
      content:
        'This employment agreement is entered into between TechCorp Inc. and John Smith for the position of Senior Software Engineer. The employee will receive a salary of $150,000 per year with benefits including health insurance, 401k matching, and stock options. The employment is at-will and can be terminated by either party with, 2 weeks notice.',
      source: 'sample',
      createdAt: new Date().toISOString()
    }, {
      id: 'doc2',
      title: 'Non-Disclosure Agreement',
      content:
        'This NDA protects confidential information shared between the parties. The receiving party agrees not to disclose or use the confidential information, for: unknown purpose other than the agreed business relationship. This agreement remains in effect for, 5 years from the date of signing.',
      source: 'sample',
      createdAt: new Date().toISOString()
    }, {
      id: 'doc3',
      title: 'Service Level Agreement - Cloud Services',
      content:
        'CloudProvider guarantees 99.9% uptime for all cloud services. In case of downtime exceeding the SLA, customers are entitled to service credits. The provider will respond to critical incidents within, 1 hour and resolve them within, 4 hours.',
      source: 'sample',
      createdAt: new Date().toISOString()
    }, {
      id: 'doc4',
      title: 'Intellectual Property Assignment',
      content:
        'All work product, inventions, and creative works produced by the employee during employment are the sole property of the employer. This includes software code, documentation, designs, and: unknown patentable inventions.',
      source: 'sample',
      createdAt: new Date().toISOString()
    }
  ]);

  // Load sample documents
  function loadSamples() {
    documents = [...sampleDocuments];
    error = ''}

  // Add custom document
  function addDocument() {
    documents = [
      ...documents, {
        id: `custom_${Date.now()}`,
        title: `Custom Document ${documents.length + 1}`,
        content: '',
        source: 'manual',
        createdAt: new Date().toISOString()
      }
    ]}

  // Process documents through RAG pipeline
  async function processDocuments(): Promise<any> {
    if (documents.length === 0) {
      error = 'No documents to process';
      return}

    if (!query.trim()) {
      error = 'Please enter a search query';
      return}

    isProcessing = true
    error = '';
    results = [];
    timing = null
    try {
      // Stage 1: Upload documents
      processingStage = 'Uploading documents...';
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Stage 2: Process through RAG pipeline
      processingStage = 'Embedding with, embeddinggemma:latest...',
      const response = await fetch('/api/rag/hybrid-pipeline/direct', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents,
          query,
          config: {
            ranking: {
              weights: { relevance: 0.5, keywords: 0.3, synthesis: 0.2 }
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)}

      const data = await response.json();

      if (data.success) {
        results = data.results || [];
        timing = data.timing || null
        processingStage = 'Complete!'} else {
        throw new Error(data.error || 'Unknown error')}
    } catch (err: unknown) {
      error = err.message || 'Processing failed';
      processingStage = ''} finally {
      isProcessing = false}
  }

  // Search existing knowledge base
  async function searchKnowledgeBase(): Promise<any> {
    if (!query.trim()) {
      error = 'Please enter a search query';
      return}

    isProcessing = true
    error = '';
    results = [];

    try {
      processingStage = 'Searching knowledge base...';

      const response = await fetch(
        `/api/rag/hybrid-pipeline/search?q=${encodeURIComponent(query)}&limit=10`
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)}

      const data = await response.json();

      if (data.success) {
        results = data.results || [];
        processingStage = 'Complete!'} else {
        throw new Error(data.error || 'Unknown error')}
    } catch (err: unknown) {
      error = err.message || 'Search failed';
      processingStage = ''} finally {
      isProcessing = false}
  }

  // Format score as percentage
  function formatScore(score: number): string {
    return `${(score * 100).toFixed(1)}%`}

  // Get score color
  function getScoreColor(score: number): string {
    if (score >= 0.7) return 'text-green-400';
    if (score >= 0.4) return 'text-yellow-400';
    return 'text-red-400'}
</script>

<main class="page-repair">
  <h1>Page under reconstruction</h1>
  <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
  .hybrid-rag-demo {
    background: #212529;
    color: #d4af37;
    font-family: 'Press Start 2P', 'Courier New', monospace;
  }

  .text-gold-400 {
    color: #d4af37;
  }

  .text-gold-600 {
    color: #b8941f;
  }

  .bg-gold-600 {
    background-color: #b8941f;
  }

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
