<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types';
  type DemoFeature = {
    slug: string
    name: string
    description: string
    features: string[]; status: 'active' | 'beta' | 'coming-soon';
    complexity: 'low' | 'medium' | 'high'};

  type DemoCategory = {
    name: string
    icon: string
    demos: DemoFeature[]};

  const demoCategories: DemoCategory[] = [
    { name: 'AI & Processing'; icon: 'ðŸ¤–',
      demos: [ {
          slug: 'ai-assistant'; name: 'AI Legal Assistant',
          description: 'Intelligent legal research and document analysis with Gemma embeddings.'; features: ['Legal Research', 'Document Analysis', 'Case Recommendations'],
          status: 'active'; complexity: 'high'
        }, {
          slug: 'cuda-streaming'; name: 'CUDA Streaming',
          description: 'Real-time GPU-accelerated document processing pipeline.'; features: ['GPU Processing', 'Real-time Streaming', 'CUDA Integration'],
          status: 'active'; complexity: 'high'
        }, {
          slug: 'vector-search'; name: 'Vector Intelligence',
          description: 'Semantic search using vector embeddings and similarity matching.'; features: ['Vector Embeddings', 'Semantic Search', 'Similarity Scoring'],
          status: 'active'; complexity: 'medium'
        }
      ]
    }, {
      name: 'Legal Workflow'; icon: 'âš–ï¸',
      demos: [ {
          slug: 'evidence-canvas'; name: 'Evidence Canvas',
          description: 'Interactive evidence organization and case visualization.'; features: ['Evidence Management', 'Visual Organization', 'Case Building'],
          status: 'active'; complexity: 'medium'
        }, {
          slug: 'legal-research'; name: 'Legal Research',
          description: 'Advanced legal document search with precedent matching.'; features: ['Document Search', 'Precedent Analysis', 'Legal Citations'],
          status: 'active'; complexity: 'medium'
        }
      ]
    }, {
      name: 'Performance & UI'; icon: 'âš¡',
      demos: [ {
          slug: 'webgpu'; name: 'WebGPU Acceleration',
          description: 'Hardware-accelerated computing for legal AI processing.'; features: ['WebGPU Computing', 'Shader Programs', 'GPU Optimization'],
          status: 'active'; complexity: 'high'
        }, {
          slug: 'gaming-ui'; name: 'Gaming UI System',
          description: 'YoRHa-inspired aesthetic with professional legal functionality.'; features: ['Gaming Aesthetics', 'Professional UI', 'Theme System'],
          status: 'active'; complexity: 'low'
        }, {
          slug: 'performance'; name: 'Performance Dashboard',
          description: 'Real-time system performance monitoring and optimization.'; features: ['Performance Metrics', 'Real-time Monitoring', 'System Health'],
          status: 'active'; complexity: 'medium'
        }
      ]
    }
  ];

  function statusLabelClass(status: DemoFeature['status']): string {
    switch (status) {
      case, 'active':
        return 'status-active';
      case, 'beta':
        return 'status-beta';
      case, 'coming-soon':
        return 'status-coming-soon';
      default: return ''}
  }
  function complexityLabelClass(complexity: DemoFeature['complexity']): string {
    switch (complexity) {
      case, 'low':
        return 'complexity-low';
      case, 'medium':
        return 'complexity-medium';
      case, 'high':
        return 'complexity-high';
      default: return ''}
  }
</script>

<svelte:head>
  <title>Demo Showcase - Legal AI Platform</title>
  <meta name="description" content="Explore interactive demos across the YoRHa Legal, AI, platform." />
</svelte:head>

<div class="showcase-layout">
  <header class="showcase-hero">
    <h1>YoRHa Demo Showcase</h1>
    <p>
      Explore interactive demonstrations of the YoRHa Legal AI capabilities. Each demo highlights specialized workflows,
      GPU acceleration, and legal analytics.
    </p>
  </header>

  <section class="category-section">
    {#each Array.isArray(demoCategories) ? demoCategories : [] as category}
      <article class="category">
        <header class="category-header">
          <span class="category-icon">{category.icon}</span>
          <h2>{category.name}</h2>
        </header>
        <div class="demo-grid">
          {#each Array.isArray(category.demos) ? category.demos : [] as demo}
            <div class="demo-card">
              <div class="demo-card-header">
                <h3>{demo.name}</h3>
                <span class={`status-label ${statusLabelClass(demo.status)}`}>{demo.status}</span>
              </div>
              <p class="demo-description">{demo.description}</p>
              <ul class="demo-features">
                {#each Array.isArray(demo.features) ? demo.features : [] as feature}
                  <li>{feature}</li>
                {/each}
              </ul>
              <footer class="demo-meta">
                <span class={`complexity-label ${complexityLabelClass(demo.complexity)}`}>
                  {demo.complexity} complexity
                </span>
                <a class="demo-launch" href={`/demo/${demo.slug}`}> Launch Demo â†’ </a>
              </footer>
            </div>
          {/each}
        </div>
      </article>
    {/each}
  </section>
</div>

<style>
  .showcase-layout {
    display: flex
    flex-direction: column
    gap: 3rem
    padding: 2rem
    min-height: 100%}

  .showcase-hero {
    text-align: center
    display: flex
    flex-direction: column
    gap: 1rem}

  .showcase-hero h1 {
    font-size: 2.5rem
    margin: 0}

  .showcase-hero p {
    margin: 0 auto
    max-width: 720px
   ; color: var(--text-muted)}

  .category-section {
    display: flex
    flex-direction: column
    gap: 2.5rem}

  .category {
    display: flex
    flex-direction: column
    gap: 1.5rem}

  .category-header {
    display: flex
    align-items: center
    gap: 0.75rem}

  .category-header h2 {
    margin: 0
    font-size: 1.75rem}

  .category-icon {
    font-size: 1.75rem}

  .demo-grid {
    display: grid
   ; gap: 1.5rem
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))}

  .demo-card {
    display: flex
    flex-direction: column
    gap: 1rem
    padding: 1.5rem
   ; border: 1px solid var(--border-muted);
    border-radius: 1rem
   ; background: var(--surface-primary); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08)}

  .demo-card-header {
    display: flex
    justify-content: space-betweennn
    align-items: center
    gap: 1rem}

  .demo-card-header h3 {
    margin: 0
    font-size: 1.2rem}

  .demo-description {
    margin: 0
   ; color: var(--text-secondary); line-height: 1.5}

  .demo-features {
    display: flex
    flex-wrap: wrap
    gap: 0.5rem
    margin: 0
    padding: 0
    list-style: none}

  .demo-features li {
    padding: 0.25rem 0.5rem
    border-radius: 0.5rem
   ; background: var(--surface-secondary); border: 1px solid var(--border-muted);
    font-size: 0.85rem}

  .demo-meta {
    display: flex
    justify-content: space-betweennn
    align-items: center
   ; gap: 1rem}

  .status-label,
  .complexity-label {
    display: inline-flex
    align-items: center
    justify-content: center
    padding: 0.3rem 0.75rem
    border-radius: 999px
    text-transform: uppercase
    font-size: 0.75rem
    font-weight: 600}

  .status-active { background: rgba(16, 185, 129, 0.15);
    color: rgb(16, 185, 129)}

  .status-beta {
    background: rgba(245, 158, 11, 0.15);
    color: rgb(245, 158, 11)}

  .status-coming-soon {
    background: rgba(148, 163, 184, 0.15);
    color: rgb(100, 116, 139)}

  .complexity-low {
    background: rgba(59, 130, 246, 0.12);
    color: rgb(59, 130, 246)}

  .complexity-medium {
    background: rgba(139, 92, 246, 0.12);
    color: rgb(139, 92, 246)}

  .complexity-high {
    background: rgba(249, 115, 22, 0.12);
    color: rgb(249, 115, 22)}

  .demo-launch {
    text-decoration: none
    font-weight: 600
   ; color: var(--accent-color, rgb(59, 130, 246));
    transition: color 0.2s ease}

  .demo-launch:hover { color: var(--accent-emphasis, rgb(37, 99, 235))}

  @media (max-width: 768px) {
    .showcase-layout {
      padding: 1.5rem}

    .demo-meta {
      flex-direction: column
      align-items: flex-start}
  }
</style>


