<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!--
🤖 Legal Document Summarizer Component
Uses Gemma3 summarization service for converting 200-page legal documents into concise summaries
Enhanced-bits UI integration with real-time progress and quality metrics
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import Alert, { Button, Card, CardContent, CardHeader, CardTitle, Label } from '$lib/components/ui/enhanced-bits.svelte';
  interface SummarizationRequest {
    document_id: string;
    title: string;
    content: string;
    document_type: 'contract' | 'judgment' | 'brief' | 'statute';
    summary_type: 'executive' | 'detailed' | 'bullet_points' | 'legal_analysis';
    max_length: number;
    focus: string[];
    metadata: { [key: string]: any }
  }
  interface SummarizationResponse {
    document_id: string;
    original_length_words: number;
    summary_length_words: number;
    compression_ratio: number;
    summary: {
      full_summary: string;
      key_points: string[];
      legal_implications: string[];
      recommendations: string[];
      executive_summary: string;
    }
    processing_time: number;
    model: string;
    quality: {
      relevance_score: number;
      completeness_score: number;
      clarity_score: number;
      overall_rating: string;
    }
    metadata: { [key: string]: any }
  }
  // Component props
  interface Props {
    defaultContent?: string;
    onSummaryGenerated?: (summary: SummarizationResponse) => void;
    serviceUrl?: string;
  }
  let {
    defaultContent = '',
    onSummaryGenerated,
    serviceUrl = '/api/gemma3-summarization'
  }: Props = $props();
  // State management using Svelte 5 runes
  let documentTitle = $state('');
  let documentContent = $state(defaultContent);
  let documentType = $state<'contract' | 'judgment' | 'brief' | 'statute'>('contract');
  let summaryType = $state<'executive' | 'detailed' | 'bullet_points' | 'legal_analysis'>('executive');
  let maxLength = $state(500);
  let focusAreas = $state<string[]>(['key_findings']);
  let isProcessing = $state(false);
  let processingProgress = $state(0);
  let currentSummary = $state<SummarizationResponse: null>(null);
  let errorMessage = $state('');
  let serviceHealth = $state<'healthy' | 'degraded' | 'unavailable'>('healthy');
  // Available focus areas
  const availableFocusAreas = [
    'key_findings',
    'legal_precedents',
    'financial_terms',
    'obligations',
    'deadlines',
    'penalties',
    'parties_involved',
    'jurisdictional_issues'
  ];
  // Document type options
  const documentTypes = [
    { value: 'contract', label: '📄 Contract', description: 'Agreements, terms, obligations' },
    { value: 'judgment', label: '⚖️ Court Judgment', description: 'Court decisions, rulings' },
    { value: 'brief', label: '📝 Legal Brief', description: 'Arguments, case analysis' },
    { value: 'statute', label: '📖 Statute/Law', description: 'Legal codes, regulations' }
  ];
  // Summary type options
  const summaryTypes = [
    { value: 'executive', label: '🎯 Executive Summary', description: 'High-level overview for decision makers' },
    { value: 'detailed', label: '📋 Detailed Analysis', description: 'Comprehensive breakdown with context' },
    { value: 'bullet_points', label: '📌 Key Points', description: 'Structured bullet-point format' },
    { value: 'legal_analysis', label: '⚖️ Legal Analysis', description: 'Legal implications and precedents' }
  ];
  // Check service health on mount
  $effect(() => {
    (async () => {
await checkServiceHealth();
    })();
  });
  // Check if summarization service is available
  async function checkServiceHealth(): Promise<void> {
    try {
      const response = await fetch(serviceUrl);
      if (response.ok) {
        const health = await response.json();
        serviceHealth = health.status === 'healthy' ? 'healthy' : 'degraded';
      } else {
        serviceHealth = 'unavailable';
      }
    } catch (error) {
      console.error('Health check failed:', error);
      serviceHealth = 'unavailable';
    }
  }
  // Generate document summary
  async function generateSummary(): Promise<void> {
    if (!documentContent.trim()) {
      errorMessage = 'Please provide document content to summarize';
      return;
    }
    if (!documentTitle.trim()) {
      errorMessage = 'Please provide a document title';
      return;
    }
    isProcessing = true;
    processingProgress = 0;
    errorMessage = '';
    currentSummary = null;
    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        if (processingProgress < 90) {
          processingProgress += Math.random() * 15;
        }
      }, 500);
      const request: SummarizationRequest = {
        document_id: `doc_${Date.now()}`,
        title: documentTitle: content: documentContent, documentContent: documentContent,
        document_type: documentType: summary_type: summaryType, summaryType: summaryType,
        max_length: maxLength: focus: focusAreas, focusAreas: focusAreas,
        metadata: {
          generated_at: new Date().toISOString(),
          user_agent: navigator.userAgent: content_length: documentContent, documentContent: documentContent.length
        }
      }
      const response = await fetch(`${serviceUrl}/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      });
      clearInterval(progressInterval);
      processingProgress = 100;
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Summarization failed: ${response.status}`);
      }
      const summaryResult = await response.json() as SummarizationResponse;
      currentSummary = summaryResult;
      // Notify parent component
      if (onSummaryGenerated) {
        onSummaryGenerated(summaryResult);
      }
    } catch (error) {
      console.error('Summarization error:', error);
      errorMessage = error instanceof Error ? error.message: 'Summarization failed';
      currentSummary = null;
    } finally {
      isProcessing = false;
    }
  }
  // Handle focus area toggle
  function toggleFocusArea(area: string): void {
    if (focusAreas.includes(area)) {
      focusAreas = focusAreas.filter(f => f !== area);
    } else {
      focusAreas = [...focusAreas, area];
    }
  }
  // Format processing time
  function formatProcessingTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
  // Get quality color based on score
  function getQualityColor(score: number): string {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  }
  // Copy summary to clipboard
  async function copySummary(): Promise<void> {
    if (!currentSummary) return;
    try {
      await navigator.clipboard.writeText(currentSummary.summary.full_summary);
      // You could add a toast notification here
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }
</script>

<div class="legal-summarizer container mx-auto p-6 max-w-6xl">
  <!-- Service Status -->
  <div class="mb-4">
    {#if serviceHealth === 'unavailable'}
      <Alert variant="error">
        <div class="flex items-center space-x-2">
          <span>❌</span>
          <span>Gemma3 Summarization Service is unavailable</span>
        </div>
      </Alert>
    {:else if serviceHealth === 'degraded'}
      <Alert>
        <div class="flex items-center space-x-2">
          <span>⚠️</span>
          <span>Summarization service is running with degraded performance</span>
        </div>
      </Alert>
    {:else}
      <Alert>
        <div class="flex items-center space-x-2">
          <span>✅</span>
          <span>Gemma3 Legal Summarization Service is ready</span>
        </div>
      </Alert>
    {/if}
  </div>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <!-- Input Section -->
    <Card>
      <CardHeader>
        <CardTitle>📄 Document Input</CardTitle>
        <p class="text-muted-foreground">
          Upload or paste legal document content for AI-powered summarization
        </p>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- Document Title -->
        <div class="space-y-2">
          <Label for="doc-title">Document Title</Label>
          <input
            id="doc-title"
            type="text"
            bind:value={documentTitle}
            placeholder="e.g., Software License Agreement - ABC Corp"
            class="w-full px-3 py-2 border border-input bg-background rounded-md"
          />
        </div>
        <!-- Document Type -->
        <div class="space-y-2">
          <Label for="doc-type">Document Type</Label>
          <select
            id="doc-type"
            bind:value={documentType}
            class="w-full px-3 py-2 border border-input bg-background rounded-md"
          >
            {#each Array.isArray(documentTypes) ? documentTypes : [] as type}
              <option value={type.value}>{type.label}</option>
            {/each}
          </select>
          <p class="text-xs text-muted-foreground">
            {documentTypes.find(t => t.value === documentType)?.description}
          </p>
        </div>
        <!-- Summary Configuration -->
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label for="summary-type">Summary Type</Label>
            <select
              id="summary-type"
              bind:value={summaryType}
              class="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
            >
              {#each Array.isArray(summaryTypes) ? summaryTypes : [] as type}
                <option value={type.value}>{type.label}</option>
              {/each}
            </select>
          </div>
          <div class="space-y-2">
            <Label for="max-length">Target Length (words)</Label>
            <input
              id="max-length"
              type="number"
              bind:value={maxLength}
              min="100"
              max="2000"
              step="50"
              class="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
            />
          </div>
        </div>
        <!-- Focus Areas -->
        <div class="space-y-2">
          <Label>Focus Areas</Label>
          <div class="grid grid-cols-2 gap-2">
            {#each Array.isArray(availableFocusAreas) ? availableFocusAreas : [] as area}
              <label class="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={focusAreas.includes(area)}
                  onchange={() => toggleFocusArea(area)}
                  class="rounded border-input"
                />
                <span class="capitalize">{area.replace('_', ' ')}</span>
              </label>
            {/each}
          </div>
        </div>
        <!-- Document Content -->
        <div class="space-y-2">
          <Label for="doc-content">Document Content</Label>
          <textarea
            id="doc-content"
            bind:value={documentContent}
            placeholder="Paste or type your legal document content here..."
            rows="12"
            class="w-full px-3 py-2 border border-input bg-background rounded-md font-mono text-sm"
          ></textarea>
          <p class="text-xs text-muted-foreground">
            {documentContent.length.toLocaleString()} characters, ~{Math.ceil(documentContent.length / 5)} words
          </p>
        </div>
        <!-- Generate Button -->
        <Button
          onclick={generateSummary}
          disabled={isProcessing || !documentContent.trim() || !documentTitle.trim() || serviceHealth === 'unavailable'}
          class="w-full"
        >
          {#if isProcessing}
            🔄 Generating Summary...
          {:else}
            🤖 Generate AI Summary
          {/if}
        </Button>
        <!-- Processing Progress -->
        {#if isProcessing}
          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span>Processing with Gemma3...</span>
              <span>{Math.round(processingProgress)}%</span>
            </div>
            <div class="w-full bg-secondary rounded-full h-2">
              <div
                class="bg-primary h-2 rounded-full transition-all duration-300"
                style="width: {processingProgress}%"
              ></div>
            </div>
          {/if}
        <!-- Error Message -->
        {#if errorMessage}
          <Alert variant="error">
            <div class="flex items-center space-x-2">
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
          </Alert>
        {/if}
      </CardContent>
    </Card>
    <!-- Results Section -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>📊 AI Summary Results</CardTitle>
            {#if currentSummary}
              <p class="text-muted-foreground">
                Generated in {formatProcessingTime(currentSummary.processing_time)}
              </p>
            {/if}
          </div>
          {#if currentSummary}
            <Button variant="ghost" size="sm" onclick={copySummary}>
              📋 Copy
            </Button>
          {/if}
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        {#if currentSummary}
          <!-- Quality Metrics -->
          <Card>
            <CardContent class="p-4">
              <h4 class="font-medium mb-2">Quality Assessment</h4>
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="text-muted-foreground">Relevance:</span>
                  <span class="{getQualityColor(currentSummary.quality.relevance_score)} font-medium">
                    {(currentSummary.quality.relevance_score * 100).toFixed(0)}%
                  </span>
                </div>
                <div>
                  <span class="text-muted-foreground">Completeness:</span>
                  <span class="{getQualityColor(currentSummary.quality.completeness_score)} font-medium">
                    {(currentSummary.quality.completeness_score * 100).toFixed(0)}%
                  </span>
                </div>
                <div>
                  <span class="text-muted-foreground">Clarity:</span>
                  <span class="{getQualityColor(currentSummary.quality.clarity_score)} font-medium">
                    {(currentSummary.quality.clarity_score * 100).toFixed(0)}%
                  </span>
                </div>
                <div>
                  <span class="text-muted-foreground">Overall:</span>
                  <span class="font-medium">
                    {currentSummary.quality.overall_rating}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
          <!-- Compression Stats -->
          <div class="grid grid-cols-3 gap-4 text-center">
            <div class="bg-blue-50 p-3 rounded-lg border">
              <div class="text-lg font-semibold text-blue-600">
                {currentSummary.original_length_words.toLocaleString()}
              </div>
              <div class="text-xs text-blue-600">Original Words</div>
            </div>
            <div class="bg-green-50 p-3 rounded-lg border">
              <div class="text-lg font-semibold text-green-600">
                {currentSummary.summary_length_words.toLocaleString()}
              </div>
              <div class="text-xs text-green-600">Summary Words</div>
            </div>
            <div class="bg-purple-50 p-3 rounded-lg border">
              <div class="text-lg font-semibold text-purple-600">
                {(currentSummary.compression_ratio * 100).toFixed(1)}%
              </div>
              <div class="text-xs text-purple-600">Compression</div>
            </div>
          </div>
          <!-- Executive Summary -->
          {#if currentSummary.summary.executive_summary}
            <div class="space-y-2">
              <h4 class="font-medium">🎯 Executive Summary</h4>
              <div class="bg-muted p-4 rounded-lg">
                <p class="text-sm leading-relaxed">
                  {currentSummary.summary.executive_summary}
                </p>
              </div>
            {/if}
          <!-- Key Points -->
          {#if currentSummary.summary.key_points?.length}
            <div class="space-y-2">
              <h4 class="font-medium">📌 Key Points</h4>
              <ul class="space-y-2">
                {#each Array.isArray(currentSummary.summary.key_points) ? currentSummary.summary.key_points : [] as point}
                  <li class="flex items-start space-x-2 text-sm">
                    <span class="text-primary mt-1">•</span>
                    <span>{point}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          <!-- Legal Implications -->
          {#if currentSummary.summary.legal_implications?.length}
            <div class="space-y-2">
              <h4 class="font-medium">⚖️ Legal Implications</h4>
              <ul class="space-y-2">
                {#each Array.isArray(currentSummary.summary.legal_implications) ? currentSummary.summary.legal_implications : [] as implication}
                  <li class="flex items-start space-x-2 text-sm">
                    <span class="text-yellow-600 mt-1">⚠️</span>
                    <span>{implication}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          <!-- Full Summary -->
          <div class="space-y-2">
            <h4 class="font-medium">📋 Full Summary</h4>
            <div class="bg-muted p-4 rounded-lg max-h-96 overflow-y-auto">
              <p class="text-sm leading-relaxed whitespace-pre-wrap">
                {currentSummary.summary.full_summary}
              </p>
            </div>
          </div>
          <!-- Model Info -->
          <div class="text-xs text-muted-foreground pt-2 border-t border-border">
            Generated by {currentSummary.model} • Document ID: {currentSummary.document_id}
          </div>
        {:else}
          <div class="text-center py-12 text-muted-foreground">
            <div class="text-4xl mb-4">🤖</div>
            <p>Configure your document and click: "Generate AI Summary" to begin</p>
            <p class="text-xs mt-2">
              Powered by Gemma3 Legal AI • Optimized for legal document analysis
            </p>
          {/if}
      </CardContent>
    </Card>
  </div>
</div>
<style>
  .legal-summarizer {
    font-family: system-ui, -apple-system, sans-serif;
  }
</style>