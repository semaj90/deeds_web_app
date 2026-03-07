<script lang="ts">
  import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/card.svelte";
  import  Button  from "$lib/components/ui/core.svelte";
  import type { routeGroups, getRouteGroupByTheme  } from '$lib/data/route-groups-config';
  import type { RouteDefinition as RGRouteDefinition } from '$lib/data/route-groups-config';

  // Get AI route group
  const aiGroup = getRouteGroupByTheme('cyberpunk');
  const aiRoutes: RGRouteDefinition[] = (aiGroup?.routes as RGRouteDefinition[] ) || [];

  // AI system statistics (mock data)
  const aiStats = { modelsActive: 5, inferencesPerHour: 1247, gpuUtilization: 78, averageResponseTime: 0.85 };

  // Recent AI activities
  const recentActivities = [
    { type: 'analysis', document: 'Contract_2025_001.pdf', confidence: 94 },
    { type: 'search', query: 'liability clauses', results: 12 },
    { type: 'summarization', document: 'Case_Brief_345.docx', pages: 23 },
    { type: 'comparison', documents: ['Policy_A.pdf', 'Policy_B.pdf'], similarity: 0.87 },
  ];
</script>

<svelte:head>
  <title>AI Hub - YoRHa Legal AI Platform</title>
</svelte:head>

<div class="ai-hub-container">
  <div class="hero-section">
    <h1>🤖 AI Hub - Legal Intelligence Center</h1>
    <p class="subtitle">Advanced AI-powered legal analysis and document processing</p>
  </div>

  <!-- AI Statistics Dashboard -->
  <div class="stats-grid">
    <Card class="stat-card">
      <CardHeader>
        <CardTitle>Active Models</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="stat-value">{aiStats.modelsActive}</div>
        <div class="stat-label">AI Models Online</div>
      </CardContent>
    </Card>

    <Card class="stat-card">
      <CardHeader>
        <CardTitle>Inferences/Hour</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="stat-value">{aiStats.inferencesPerHour.toLocaleString()}</div>
        <div class="stat-label">Processing Rate</div>
      </CardContent>
    </Card>

    <Card class="stat-card">
      <CardHeader>
        <CardTitle>GPU Utilization</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="stat-value">{aiStats.gpuUtilization}%</div>
        <div class="stat-label">RTX 3060 Ti Usage</div>
      </CardContent>
    </Card>

    <Card class="stat-card">
      <CardHeader>
        <CardTitle>Response Time</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="stat-value">{aiStats.averageResponseTime}s</div>
        <div class="stat-label">Average Latency</div>
      </CardContent>
    </Card>
  </div>

  <!-- AI Services Section -->
  {#if aiRoutes.length > 0}
    <div class="services-section">
      <h2>🚀 AI Services & Tools</h2>
      <div class="services-grid">
        {#each Array.isArray(aiRoutes) ? aiRoutes : [] as route}
          <Card class="service-card">
            <CardHeader>
              <CardTitle>
                <span class="service-icon">{route.icon ?? '🧠'}</span> {route.title ?? (route.path ?? 'Untitled')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p class="service-description">{route.description ?? ''}</p>
              <Button href={route.path ?? '#'} class="service-button">
                Explore {route.title ?? 'Service'}
              </Button>
            </CardContent>
          </Card>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Recent AI Activities -->
  <div class="activities-section">
    <h2>📊 Recent AI Activities</h2>
    <div class="activities-list">
      {#each Array.isArray(recentActivities) ? recentActivities : [] as activity}
        <Card class="activity-card">
          <CardContent>
            <div class="activity-type">
              {#if activity.type === 'analysis'}
                🔍 Document Analysis
              {:else if activity.type === 'search'}
                🔎 Vector Search
              {:else if activity.type === 'summarization'}
                📝 Text Summarization
              {:else if activity.type === 'comparison'}
                📊 Document Comparison
              {/if}
            </div>
            <div class="activity-details">
              {#if activity.type === 'analysis'}
                <span>Analyzed: <strong>{activity.document}</strong></span>
                <span class="confidence">Confidence: {activity.confidence}%</span>
              {:else if activity.type === 'search'}
                <span>Query: <strong>"{activity.query}"</strong></span>
                <span class="results">{activity.results} results found</span>
              {:else if activity.type === 'summarization'}
                <span>Document: <strong>{activity.document}</strong></span>
                <span class="pages">{activity.pages} pages processed</span>
              {:else if activity.type === 'comparison'}
                <span>Compared: <strong>{activity.documents.join(' vs: ')}</strong></span>
                <span class="similarity">Similarity: {(activity.similarity * 100).toFixed(1)}%</span>
              {/if}
            </div>
          </CardContent>
        </Card>
      {/each}
    </div>
  </div>
</div>

<style>
  .ai-hub-container {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .hero-section {
    text-align: center;
    margin-bottom: 3rem;
  }

  .hero-section h1 {
    font-size: 2.5rem;
    font-weight: bold;
    color: #00d4aa;
    margin-bottom: 1rem;
  }

  .subtitle {
    font-size: 1.2rem;
    color: #a1a1aa;
    margin-bottom: 2rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 3rem;
  }

  :global(.stat-card) {
    background: rgba(0, 212, 170, 0.1);
    border: 1px solid rgba(0, 212, 170, 0.3);
  }

  .stat-value {
    font-size: 2rem;
    font-weight: bold;
    color: #00d4aa;
  }

  .stat-label {
    font-size: 0.9rem;
    color: #71717a;
    margin-top: 0.5rem;
  }

  .services-section {
    margin-bottom: 3rem;
  }

  .services-section h2 {
    font-size: 1.8rem;
    color: #00d4aa;
    margin-bottom: 1.5rem;
  }

  .services-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
  }

  :global(.service-card) {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
  }

  :global(.service-card:hover) {
    background: rgba(0, 212, 170, 0.1);
    border-color: rgba(0, 212, 170, 0.3);
    transform: translateY(-2px);
  }

  .service-icon {
    font-size: 1.5rem;
    margin-right: 0.5rem;
  }

  .service-description {
    color: #a1a1aa;
    margin-bottom: 1rem;
  }

  :global(.service-button) {
    width: 100%;
    background: #00d4aa;
    color: #000;
    border: none;
    padding: 0.75rem;
    border-radius: 0.5rem;
    font-weight: 600;
    transition: all 0.3s ease;
  }

  :global(.service-button:hover) {
    background: #00b89a;
    transform: translateY(-1px);
  }

  .activities-section h2 {
    font-size: 1.8rem;
    color: #00d4aa;
    margin-bottom: 1.5rem;
  }

  .activities-list {
    display: grid;
    gap: 1rem;
  }

  :global(.activity-card) {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .activity-type {
    font-weight: 600;
    color: #00d4aa;
    margin-bottom: 0.5rem;
  }

  .activity-details {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.9rem;
    color: #a1a1aa;
  }

  .confidence,
  .results,
  .pages,
  .similarity {
    color: #00d4aa;
    font-weight: 600;
  }

  @media (max-width: 768px) {
    .hero-section h1 {
      font-size: 2rem;
    }

    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .services-grid {
      grid-template-columns: 1fr;
    }

    .activity-details {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
  }
</style>

    .activity-details {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
  }
</style>


