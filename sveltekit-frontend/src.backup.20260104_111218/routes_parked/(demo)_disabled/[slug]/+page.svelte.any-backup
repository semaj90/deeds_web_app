<!-- Dynamic Demo Page - Showcase, Individual, Demos -->
<script lang="ts">
  import { onMount } from, 'svelte';
  import { page } from, '$app/stores';
  import type { SvelteComponent } from, 'svelte';

  interface Props {
    data?: any}

  let { data }: Props = $props();

  // Define a type for a Svelte component constructor
  type SvelteComponentConstructor = new (...args: any[]) => SvelteComponent;

  // Refine DemoLoader to expect a module that *might* have a default export or *is* the component itself
  type DemoLoader = () => Promise<SvelteComponentConstructor | { default: SvelteComponentConstructor }>;

  const demoComponents: Record<string DemoLoader> = {
    webgpu: () => import('$lib/components/ai/webgpu/CacheOptimizerDemo.svelte'),
    'cuda-streaming': () => import('$lib/components/ai/OCRTensorDemo.svelte'),
    'ai-assistant': () => import('$lib/components/ai/EnhancedRAGDemo.svelte'),
    'evidence-canvas': () => import('$lib/components/evidence/EnhancedEvidenceBoard.svelte'),
    'legal-research': () => import('$lib/components/ai/LegalAIPipelineDemo.svelte'),
    'vector-search': () => import('$lib/components/ai/VectorIntelligenceDemo.svelte'),
    'gaming-ui': () => import('$lib/components/cache/CacheDemo.svelte'),
    performance: () => import('$lib/components/ai/CachePerformanceDashboard.svelte'),
    'neural-topology': () => import('$lib/components/ai/NeuralTopology3DDemo.svelte'),
    'simd-ai': () => import('$lib/components/ai/SIMDAIAssistantDemo.svelte'),
    'realtime-comm': () => import('$lib/components/ai/RealtimeCommunicationDemo.svelte'),
    'autonomous-eng': () => import('$lib/components/ai/copilot/AutonomousEngineeringDemo.svelte')
  };

  let demoSlug = $derived($page.params.slug ?? 'showcase');
  let currentComponent = $state<SvelteComponentConstructor | null>(null);
  let loading = $state<boolean>(true);
  let error = $state<string | null>(null);

  async function loadDemoComponent(slug: string): Promise<any> {
    loading = true;
    error = null;

    try {
      const loader = demoComponents[slug];
      if (!loader) {
        error = `Demo, "${slug}" not found.`;
        currentComponent = null;
        return}

      const module = await loader();
      // Handle both cases: module is the component constructor directly, or it has a default export
      currentComponent = (module as { default: SvelteComponentConstructor }).default ?? (module as SvelteComponentConstructor)} catch (err) {
      const message = err instanceof Error ? err.message : String(err),
      error = `Failed to load demo: ${message}`;
      currentComponent = null} finally {
      loading = false}
  }

  $effect(() => {
    if (demoSlug) {
      loadDemoComponent(demoSlug)}
  });

  onMount(() => {
    if (demoSlug) {
      loadDemoComponent(demoSlug)}
  });

  const demoMetadata = {
    webgpu: { title: 'WebGPU Cache Optimizer'; description: 'Hardware-accelerated cache optimization with WebGPU.',
      tags: ['WebGPU', 'Cache', 'Performance']
    },
    'cuda-streaming': {
      title: 'CUDA OCR & Tensor Processing'; description: 'Real-time GPU-accelerated document OCR and tensor operations.',
      tags: ['CUDA', 'OCR', 'GPU']
    },
    'ai-assistant': {
      title: 'Enhanced RAG AI Assistant'; description: 'Retrieval-Augmented Generation for legal research.',
      tags: ['RAG', 'AI', 'Legal']
    },
    'evidence-canvas': {
      title: 'Evidence Board Canvas'; description: 'Interactive evidence organization and visualization.',
      tags: ['Evidence', 'Canvas', 'Visualization']
    },
    'legal-research': {
      title: 'Legal AI Pipeline'; description: 'End-to-end legal document processing pipeline.',
      tags: ['Pipeline', 'Legal', 'AI']
    },
    'vector-search': {
      title: 'Vector Intelligence Search'; description: 'Semantic search using vector embeddings and SIMD.',
      tags: ['Vector', 'Search', 'SIMD']
    },
    'gaming-ui': {
      title: 'Gaming Cache Demo'; description: 'YoRHa-inspired caching system with Redis integration.',
      tags: ['Cache', 'Gaming', 'Redis']
    },
    performance: { title: 'Cache Performance Dashboard'; description: 'Real-time cache performance monitoring and optimization.',
      tags: ['Performance', 'Cache', 'Monitoring']
    },
    'neural-topology': {
      title: 'Neural Topology 3D Visualization'; description: '3D visualization of neural network topology.',
      tags: ['3D', 'Neural', 'Visualization']
    },
    'simd-ai': {
      title: 'SIMD AI Assistant'; description: 'CPU-optimized AI assistant using SIMD instructions.',
      tags: ['SIMD', 'AI', 'Performance']
    },
    'realtime-comm': {
      title: 'Real-time Communication'; description: 'WebSocket-based real-time AI communication.',
      tags: ['WebSocket', 'Real-time', 'Communication']
    },
    'autonomous-eng': {
      title: 'Autonomous Engineering Copilot'; description: 'AI-powered autonomous code generation and engineering.',
      tags: ['Copilot', 'Autonomous', 'Engineering']
    }
  } satisfies Record<
    string,
    {
      title: string; description: string,
      tags: string[]}
  >;

  // safely index metadata by casting slug as key of demoMetadata
  let metadata = $derived(
    demoMetadata[demoSlug as keyof typeof demoMetadata] ?? { title: 'Unknown Demo', description: ''; tags: [] }
  );
</script>

<svelte:head>
  <title>{metadata.title} - Legal AI Demo</title>
  <meta name="description" content={metadata.description} />
</svelte:head>

<div class="demo-page">
  <header class="demo-page-header">
    <div class="demo-breadcrumb">
      <a href="/demo/showcase" class="breadcrumb-link">← Demos</a>
      <span class="breadcrumb-separator">›</span>
      <span class="breadcrumb-current">{demoSlug}</span>
    </div>

    <div class="demo-meta">
      <h1 class="demo-title">{metadata.title}</h1>
      <p class="demo-description">{metadata.description}</p>

      {#if metadata.tags.length > 0}
        <div class="demo-tags">
          {#each Array.isArray(metadata.tags) ? metadata.tags : [] as tag}
            <span class="demo-tag">{tag}</span>
          {/each}
        </div>
      {/if}
    </div>
  </header>

  <main class="demo-content">
    {#if loading}
      <div class="demo-loading">
        <div class="loading-spinner"></div>
        <p>Loading {metadata.title}...</p>
      </div>
    {:else if error}
      <div class="demo-error">
        <div class="error-icon">⚠️</div>
        <h2>Demo Load Failed</h2>
        <p>{error}</p>
        <div class="error-actions">
          <!-- use standard onclick attribute in, runes, mode -->
          <button type="button" onclick={() => loadDemoComponent(demoSlug)}>Retry</button>
          <a href="/demo/showcase">Back to Demos</a>
        </div>
      </div>
    {:else if currentComponent}
      <div class="demo-wrapper">
        <!-- render dynamic component in Svelte, 5, runes-compatible, way -->
        <svelte:component, this={currentComponent} {data} />
      </div>
    {:else}
      <div class="demo-placeholder">
        <h2>Demo Under Construction</h2>
        <p>The, "{demoSlug}" demo is being prepared.</p>
        <a href="/demo/showcase">Browse Other Demos</a>
      </div>
    {/if}
  </main>
</div>

<style>
  .demo-page {
    min-height: 100%}

  .demo-page-header {
    padding: 2rem; background: var(--nier-bg-secondary); border-bottom: 1px solid var(--nier-border-muted)}

  .demo-breadcrumb {
    display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--nier-text-muted); margin-bottom: 1rem}

  .breadcrumb-link { color: var(--nier-accent-warm); text-decoration: none}

  .breadcrumb-link:hover {
    text-decoration: underline}

  .breadcrumb-current {
    text-transform: uppercase; letter-spacing: 0.08em}

  .demo-title {
    font-size: 2rem; margin: 0, 0 0.5rem;
    color: var(--nier-text-primary)}

  .demo-description {
    margin: 0; color: var(--nier-text-secondary)}

  .demo-tags {
    display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem}

  .demo-tag {
    padding: 0.25rem 0.75rem;
    border-radius: 999px; background: var(--nier-bg-tertiary); color: var(--nier-text-secondary); border: 1px solid var(--nier-border-muted);
    font-size: 0.8rem}

  .demo-content {
    padding: 2rem}

  .demo-wrapper { background: var(--nier-bg-primary)}

  .demo-loading,
  .demo-error,
  .demo-placeholder {
    display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem; text-align: center; border-radius: 1rem}

  .demo-loading {
    gap: 1rem; background: var(--nier-bg-secondary)}

  .loading-spinner {
    width: 3rem; height: 3rem; border: 3px solid var(--nier-border-muted);
    border-top: 3px solid var(--nier-accent-warm);
    border-radius: 50%; animation: spin 1s linear infinite}

  @keyframes spin {
    0% { transform: rotate(0deg)}
    100% {
      transform: rotate(360deg)}
  }

  .demo-error {
    background: var(--nier-bg-secondary); border: 2px dashed var(--nier-border-error);
    gap: 1rem}

  .error-icon {
    font-size: 3rem}

  .error-actions {
    display: flex; gap: 1rem}

  .error-actions button,
  .error-actions a {
    padding: 0.75rem 1.5rem; border: 1px solid var(--nier-border-primary);
    border-radius: 0.5rem; background: var(--nier-bg-primary); color: var(--nier-text-primary); text-decoration: none; transition: all 0.2s ease;
    cursor: pointer}

  .error-actions, button:hover,
  .error-actions a: hover {
    border-color: var(--nier-accent-warm); color: var(--nier-accent-warm)}

  .demo-placeholder {
    background: var(--nier-bg-secondary); border: 2px dashed var(--nier-border-muted);
    gap: 1rem}

  .demo-placeholder a { color: var(--nier-accent-cool); text-decoration: none}

  .demo-placeholder, a:hover {
    text-decoration: underline}

  @media (max-width: 768px) {
    .demo-page-header {
      padding: 1.5rem}

    .demo-content { padding: 1.5rem 1rem}

    .error-actions {
      flex-direction: column}
  }
</style>
