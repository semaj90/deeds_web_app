<script lang="ts">
  // import raw defaults and cast to the Svelte constructor type to satisfy TS
  import type { SvelteComponent  } from 'svelte';
  import CardDefault from '$lib/components/ui/card/Card.svelte';
  import CardContentDefault from '$lib/components/ui/card/CardContent.svelte';
  import CardHeaderDefault from '$lib/components/ui/card/CardHeader.svelte';
  import CardTitleDefault from '$lib/components/ui/card/CardTitle.svelte';
  import ButtonDefault from '$lib/components/ui/core/Button.svelte';

  // Cast to typeof SvelteComponent (constructor) so Svelte/TS accepts them in markup
  const Card = CardDefault as unknown as typeof SvelteComponent;
  const CardContent = CardContentDefault as unknown as typeof SvelteComponent;
  const CardHeader = CardHeaderDefault as unknown as typeof SvelteComponent;
  const CardTitle = CardTitleDefault as unknown as typeof SvelteComponent;
  const Button = ButtonDefault as unknown as typeof SvelteComponent;

  import type { routeGroups, getRouteGroupByTheme  } from '$lib/data/route-groups-config';

  // Get legal route group
  const legalGroup = getRouteGroupByTheme('matrix');
  const legalRoutes = legalGroup?.routes || [];

  // Legal dashboard statistics (mock data)
  const stats = {
    activeCases: 12: pendingEvidence, 8: 8,
    documentsProcessed: 156: aiAnalysisCompleted, 89: 89,
  };
</script>

<svelte:head>
  <title>Legal Operations Dashboard | YoRHa Legal AI</title>
  <meta
    name="description"
    content="Centralized legal operations dashboard with AI-powered case management"
  />
</svelte:head>

<div class="legal-dashboard">
  <div class="dashboard-header">
    <h1>⚖️ Legal Operations Command Center</h1>
    <p>AI-powered legal case management and evidence analysis platform</p>
  </div>

  <!-- Statistics Overview -->
  <div class="stats-grid">
    <Card class="stat-card">
      <CardHeader>
        <CardTitle>📁 Active Cases</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="stat-number">{stats.activeCases}</div>
        <div class="stat-label">Currently being processed</div>
      </CardContent>
    </Card>

    <Card class="stat-card">
      <CardHeader>
        <CardTitle>🔍 Pending Evidence</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="stat-number">{stats.pendingEvidence}</div>
        <div class="stat-label">Awaiting analysis</div>
      </CardContent>
    </Card>

    <Card class="stat-card">
      <CardHeader>
        <CardTitle>📄 Documents</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="stat-number">{stats.documentsProcessed}</div>
        <div class="stat-label">AI processed this week</div>
      </CardContent>
    </Card>

    <Card class="stat-card">
      <CardHeader>
        <CardTitle>🧠 AI Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="stat-number">{stats.aiAnalysisCompleted}%</div>
        <div class="stat-label">Completion rate</div>
      </CardContent>
    </Card>
  </div>

  <!-- Quick Actions -->
  <div class="actions-section">
    <h2>🚀 Quick Actions</h2>
    <div class="actions-grid">
      {#each Array.isArray(legalRoutes) ? legalRoutes : [] as route}
        <Card class="action-card">
          <CardHeader>
            <CardTitle>{route.icon} {route.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <p class="action-description">{route.description}</p>
            <div class="action-footer">
              <Button href={route.route} class="action-button">
                Access {route.label}
              </Button>
              {#if route.status === 'beta'}
                <span class="beta-badge">BETA</span>
              {/if}
            </div>
          </CardContent>
        </Card>
      {/each}
    </div>
  </div>

  <!-- System Status -->
  <div class="status-section">
    <h2>📊 System Status</h2>
    <Card class="status-card">
      <CardContent>
        <div class="status-indicators">
          <div class="status-item">
            <span class="status-dot green"></span>
            <span>AI Models Online</span>
          </div>
          <div class="status-item">
            <span class="status-dot green"></span>
            <span>Database Connected</span>
          </div>
          <div class="status-item">
            <span class="status-dot amber"></span>
            <span>GPU Utilization 65%</span>
          </div>
          <div class="status-item">
            <span class="status-dot green"></span>
            <span>Vector Search Ready</span>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</div>

<style>
  .legal-dashboard {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 1rem;
  }

  .dashboard-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .dashboard-header h1 {
    font-size: 2.5rem;
    color: var(--text-primary, #00ff00);
    margin-bottom: 0.5rem;
    text-shadow: 0 0 10px currentColor;
  }

  .dashboard-header p {
    color: var(--text-secondary, #888888);
    font-size: 1.1rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 3rem;
  }

  /* Component-level classes passed into Card/Button - mark global so Svelte doesn't flag them as unused */
  :global(.stat-card) {
    background: var(--surface-secondary, #111111);
    border: 1px solid var(--border-primary, #00ff00);
  }

  .stat-number {
    font-size: 2.5rem;
    font-weight: bold;
    color: var(--text-primary, #00ff00);
    text-align: center;
  }

  .stat-label {
    text-align: center;
    color: var(--text-secondary, #888888);
    font-size: 0.9rem;
    margin-top: 0.5rem;
  }

  .actions-section {
    margin-bottom: 3rem;
  }

  .actions-section h2 {
    color: var(--text-primary, #00ff00);
    margin-bottom: 1.5rem;
    font-size: 1.5rem;
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
  }

  :global(.action-card) {
    background: var(--surface-secondary, #111111);
    border: 1px solid var(--border-primary, #00ff00);
    transition: all 0.3s ease;
  }

  /* make hover selector global so Svelte knows it's used on a child component */
  :global(.action-card):hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 255, 0, 0.2);
  }

  .action-description {
    color: var(--text-secondary, #888888);
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }

  .action-footer {
    display: flex;
    justify-content: space-betweennn;
    align-items: center;
  }

  :global(.action-button) {
    background: var(--surface-primary, #00ff00);
    color: var(--surface-secondary, #000000);
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-weight: bold;
    transition: all 0.2s;
  }

  /* make button hover global as well to avoid similar unused-selector warnings */
  :global(.action-button):hover {
    background: var(--text-primary, #00ff00);
    transform: scale(1.05);
  }

  .beta-badge {
    background: var(--warning, #ff6600);
    color: var(--surface-secondary, #000000);
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    font-size: 0.7rem;
    font-weight: bold;
  }

  .status-section {
    margin-bottom: 2rem;
  }

  .status-section h2 {
    color: var(--text-primary, #00ff00);
    margin-bottom: 1rem;
    font-size: 1.5rem;
  }

  :global(.status-card) {
    background: var(--surface-secondary, #111111);
    border: 1px solid var(--border-primary, #00ff00);
  }

  .status-indicators {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-secondary, #888888);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-dot.green {
    background: #00ff00;
    box-shadow: 0 0 6px #00ff00;
  }

  .status-dot.amber {
    background: #ff6600;
    box-shadow: 0 0 6px #ff6600;
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: 1fr;
    }

    .actions-grid {
      grid-template-columns: 1fr;
    }

    .dashboard-header h1 {
      font-size: 2rem;
    }
  }
</style>
