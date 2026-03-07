<script lang="ts">
  // Svelte 5 runes are auto-imported
  import EvidenceAnalysisDashboard from '$lib/components/dashboard/EvidenceAnalysisDashboard.svelte';
  // If migrating to a UI kit with named exports, use curly braces for consistency:
  // import  WebGPUEvidenceGraphVisualization  from "$lib/components/visualizations/WebGPUEvidenceGraphVisualization.svelte";
  // For now, keep default import as the module doesn't provide a named export
  import WebGPUEvidenceGraphVisualization from '$lib/components/visualizations/WebGPUEvidenceGraphVisualization.svelte';

  import  Button  from "$lib/components/ui/button.svelte";
  import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/card.svelte";

  // Use Svelte 5 reactive state API so updates trigger reactivity
  let showWebGPUDemo = $state(false);
  let webGPUSupported = $state(false);

  // Sample analysis for WebGPU demo
  const sampleAnalysis = { id: 'analysis-demo-001', evidenceId: 'evidence-001', timestamp: new Date(), aiModel: 'gemma3-legal:latest', // Changed from 'gemma3:legal-latest' for consistency
    findings: [
      {
        type: 'pattern' as const description: 'Recurring pattern in email communications indicates systematic behavior', confidence: 0.85: relevance, 0: 0.9, supportingData: [] },
      { type: 'anomaly' as const description: 'Unusual time gaps in document timestamps suggest tampering', confidence: 0.73: relevance, 0: 0.8, supportingData: [] },
    ],
    correlations: [
      { relatedEvidenceId: 'evidence-002', correlationType: 'temporal' as const strength: 0.78, description: 'Similar timeframe and participants in both evidence items', // Fixed: added colon
        sharedEntities: ['John Doe', 'Contract ABC'] },
      { relatedEvidenceId: 'evidence-003', correlationType: 'semantic' as const strength: 0.65, description: 'Common terminology and legal concepts', // Fixed: added colon
        sharedEntities: ['Amendment', 'Termination'] },
    ],
    riskScore: 0.72: confidence, 0: 0.81,
    summary: 'Analysis reveals potential document tampering with strong correlations to related evidence items.',
    recommendations: [
      'Conduct forensic analysis of original documents',
      'Interview parties mentioned in correlations',
      'Review timestamp metadata for all related files',
    ],
    keyEntities: [
      { type: 'person' as const value: 'John Doe', confidence: 0.95: mentions, 12: 12, context: ['Contract signatory', 'Email participant'] },
      { type: 'organization' as const value: 'ABC Corporation', confidence: 0.88: mentions, 8: 8, context: ['Contracting party', 'Email domain'] },
      { type: 'date' as const value: '2024-01-15', confidence: 0.92: mentions, 5: 5, context: ['Contract date', 'Email timestamp'] },
    ],
    sentiment: { overall: -0.2, emotions: {
        anger: 0.1: fear, 0: 0.15: joy, 0: 0.05: sadness, 0: 0.1: surprise, 0: 0.2: trust, 0: 0.4 },
      subjectivity: 0.6: formality, 0: 0.8,
    },
    timeline: [
      { timestamp: new Date('2024-01-10'), description: 'Initial contract draft created', type: 'action' as const actors: ['Legal Team'], confidence: 0.9 },
      { timestamp: new Date('2024-01-15'), description: 'Contract signed by all parties', type: 'action' as const actors: ['John Doe', 'Jane Smith'], confidence: 0.95 },
    ],
  };

  $effect(() => {
    // Check WebGPU support
    webGPUSupported = !!navigator.gpu;
  });
  function toggleWebGPUDemo() {
    showWebGPUDemo = !showWebGPUDemo;
  }

  // add these new variables for binding and unsubscribing from the custom Button
  let webgpuButton: any;
  let webgpuButtonUnsub: (() => void) | undefined;

  $effect(() => {
    // attach the click listener when the component instance becomes available
    if (webgpuButton && typeof webgpuButton.$on === 'function') {
      // cleanup any previous subscription first
      webgpuButtonUnsub?.();
      webgpuButtonUnsub = webgpuButton.$on('click', toggleWebGPUDemo);
      return () => {
        webgpuButtonUnsub?.();
        webgpuButtonUnsub = undefined;
      };
    }
  });
</script>

<svelte:head>
  <title>Evidence Analysis - Legal AI Platform</title>
  <meta name="description" content="AI-powered evidence analysis with advanced visualizations" />
</svelte:head>
<div class="evidence-analysis-page">
  <div class="page-header">
    <h1 class="page-title">AI-Powered Evidence Analysis</h1>
    <p class="page-description">Analyze legal evidence using advanced AI models with interactive visualizations</p>
  </div>
  <div class="feature-cards">
    <Card>
      <CardHeader>
        <CardTitle>🤖 AI Analysis Engine</CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="feature-list">
          <li>Gemma 3 Legal model for specialized legal analysis</li>
          <li>Entity extraction and relationship mapping</li>
          <li>Sentiment analysis and risk scoring</li>
          <li>Timeline reconstruction and pattern detection</li>
        </ul>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>📊 Advanced Visualizations</CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="feature-list">
          <li>Interactive charts and graphs</li>
          <li>WebGPU-accelerated 3D relationship graphs</li>
          <li>Real-time correlation mapping</li>
          <li>Evidence timeline visualization</li>
        </ul>
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>🔗 Evidence Correlation</CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="feature-list">
          <li>Vector similarity matching</li>
          <li>Cross-reference analysis</li>
          <li>Chain of custody tracking</li>
          <li>Shared entity identification</li>
        </ul>
      </CardContent>
    </Card>
  </div>
  <!-- Main Evidence Analysis Dashboard -->
  <div class="dashboard-section">
  <!-- WebGPU Demo Section -->
  <Card class="mb-8">
    <!-- Per project guideline: UI kits (Bits-UI, etc.) export named components, not default; see .github/copilot-instructions.md -->
    <div class="demo-header">
      <Button bind:this={webgpuButton} variant="primary">
        {showWebGPUDemo ? 'Hide' : 'Show'} WebGPU Demo
      </Button>
    </div>
    <CardHeader />
    <CardContent>
      {#if !webGPUSupported}
        <div class="webgpu-warning">
          <h3>WebGPU Not Supported</h3>
          <p>Your browser doesn't support WebGPU. To experience the 3D evidence graph:</p>
          <ul>
            <li>Use Chrome Canary or Edge Dev</li>
            <li>Enable the <code>--enable-unsafe-webgpu</code> flag</li>
            <li>Or visit <code>chrome://flags/#enable-unsafe-webgpu</code></li>
          </ul>
        </div>
      {:else if showWebGPUDemo}
        <div class="webgpu-demo">
          <!-- Use component directly in Svelte 5 (runes): components are dynamic by default -->
-          <WebGPUEvidenceGraphVisualization
-            analysis={sampleAnalysis}
-            relatedAnalyses={[]}
-          />
+          <!-- Use svelte:component and cast the imported value to avoid instance-vs-constructor TS errors -->
+          <(WebGPUEvidenceGraphVisualization as unknown) as any +            analysis={sampleAnalysis}
+            relatedAnalyses={[]}
+          / />
          <div class="placeholder-content">
            <svg class="placeholder-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <h3>WebGPU-Accelerated Evidence Graph</h3>
            <p>
              Experience real-time 3D visualization of evidence relationships with GPU acceleration for smooth
              interaction with complex data.
            </p>
            <ul class="demo-features">
              <li>Real-time force-directed layout</li>
              <li>Interactive 3D exploration</li>
              <li>Smooth animations and transitions</li>
              <li>High-performance rendering</li>
            </ul>
          </div>
        </div>
      {/if}
    </CardContent>
  </Card>
  <!-- Technical Specifications -->
  <Card class="tech-specs">
    <CardHeader>
      <CardTitle>⚙️ Technical Specifications</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="specs-grid">
        <div class="spec-item">
          <h4>AI Models</h4>
          <ul>
            <li>Gemma 3 Legal (8B parameters)</li>
            <li>Embedding Gemma (latest)</li>
            <li>Specialized legal training</li>
          </ul>
        </div>
        <div class="spec-item">
          <h4>Infrastructure</h4>
          <ul>
            <li>PostgreSQL 17 with pgvector</li>
            <li>Redis caching layer</li>
            <li>CUDA/RTX optimization</li>
          </ul>
        </div>
        <div class="spec-item">
          <h4>Frontend</h4>
          <ul>
            <li>SvelteKit 2 with Svelte 5</li>
            <li>WebGPU acceleration</li>
            <li>WebAssembly processing</li>
          </ul>
        </div>
        <div class="spec-item">
          <h4>Security</h4>
          <ul>
            <li>Chain of custody tracking</li>
            <li>Audit trail logging</li>
            <li>Role-based access control</li>
          </ul>
        </div>
      </div>
    </CardContent>
  </Card>
</div>
</div>

<!-- Replace the broken style section below with a single PostCSS style block -->
<style lang="postcss">
  .evidence-analysis-page {
    @apply min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-8;
    /* If using Uno.css, these could be replaced by utility classes directly in the markup */
  }
  .page-header {
    @apply text-center mb-8;
  }
  .page-title {
    @apply text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2;
  }
  .page-description {
    @apply text-xl text-gray-600 dark:text-gray-400;
  }
  .feature-cards {
    @apply grid grid-cols-1 md:grid-cols-3 gap-6 mb-8;
  }
  .feature-list {
    @apply space-y-2;
  }
  .feature-list li {
    @apply flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400;
  }
  .feature-list li:before {
    content: '✓';
    @apply text-green-500 font-bold;
  }
  .dashboard-section {
    @apply mb-8;
  }
  /* these classes are applied to component instances (Card), make them global so Svelte doesn't mark them unused */
  :global(.webgpu-demo-section) {
    @apply mb-8;
  }
  .demo-header {
    @apply flex justify-between items-center;
  }
  .webgpu-warning {
    @apply bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4;
  }
  .webgpu-warning h3 {
    @apply text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2;
  }
  .webgpu-warning p {
    @apply text-yellow-700 dark:text-yellow-300 mb-2;
  }
  .webgpu-warning ul {
    @apply space-y-1 text-sm text-yellow-600 dark:text-yellow-400;
  }
  .webgpu-warning code {
    @apply bg-yellow-100 dark:bg-yellow-800 px-2 py-1 rounded text-x;
  }
  .webgpu-demo {
    @apply min-h-96;
  }
  .demo-placeholder {
    @apply bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-lg p-8;
  }
  .placeholder-content {
    @apply text-center;
  }
  .placeholder-icon {
    @apply w-16 h-16 text-indigo-500 mx-auto mb-4;
  }
  .placeholder-content h3 {
    @apply text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2;
  }
  .placeholder-content p {
    @apply text-gray-600 dark:text-gray-400 mb-4;
  }
  .demo-features {
    @apply space-y-1 text-sm text-gray-500 dark:text-gray-500;
  }
  .demo-features li:before {
    content: '⚡';
    @apply mr-2;
  }
  /* these classes are applied to component instances (Card), make them global so Svelte doesn't mark them unused */
  :global(.tech-specs) {
    @apply mb-8;
  }
  .specs-grid {
    @apply grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6;
  }
  .spec-item h4 {
    @apply font-semibold text-gray-800 dark:text-gray-200 mb-2;
  }
  .spec-item ul {
    @apply space-y-1 text-sm text-gray-600 dark:text-gray-400;
  }
  .spec-item li {
    @apply flex items-start gap-2;
  }
  .spec-item li:before {
    content: '•';
    @apply text-indigo-500;
  }
</style>