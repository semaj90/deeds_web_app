<!--
  Case Management Dashboard
  Real-time legal case tracking with AI insights (fallback UI)
-->
<script lang="ts">
  import { onMount } from 'svelte';

  // Local fallback TypeScript interface (replaces external type import)
  interface RecentActivity {
    action: string;
    description: string;
    createdAt: string;
    entityType?: string;
  }

  interface CaseDashboardStats {
    totalCases: number;
    activeCases: number;
    completedThisMonth: number;
    averageProgress: number;
    highPriorityCases: number;
    overdueTodos: number;
    pendingRecommendations: number;
    totalTimeSpent: number; // minutes
    recentActivities: RecentActivity[];
  }

  // Use standard local reactive variables instead of $state / $derived
  let dashboardStats: CaseDashboardStats | null = null;
  let isLoading = true;
  let error: string | null = null;
  let refreshing = false;

  let lastUpdate = new Date();
  let updateInterval: ReturnType<typeof setInterval> | null = null;

  // Use a simple local userId fallback (no $page dependency)
  const userId = 'mock-user-id';

  onMount(() => {
    loadDashboard();

    // Set up real-time updates every 30 seconds
    updateInterval = setInterval(() => {
      loadDashboard(true);
    }, 30000);

    return () => {
      if (updateInterval) clearInterval(updateInterval);
    };
  });

  async function loadDashboard(silent = false) {
    if (!silent) isLoading = true;
    if (silent) refreshing = true;
    error = null;

    try {
      const response = await fetch('/api/case-management/dashboard', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      // Expect API to return { stats: CaseDashboardStats }
      dashboardStats = data.stats;
      lastUpdate = new Date();
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      error = err instanceof Error ? err.message : 'Failed to load dashboard';
    } finally {
      isLoading = false;
      refreshing = false;
    }
  }

  function getProgressColor(progress: number): string {
    if (progress >= 80) return 'bg-green-500';
    if (progress >= 60) return 'bg-blue-500';
    if (progress >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  function getPriorityColor(priority: string): string {
    switch (priority) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'outline';
      default: return 'secondary';
    }
  }

  function formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours === 0) return `${remainingMinutes}m`;
    if (remainingMinutes === 0) return `${hours}h`;
    return `${hours}h ${remainingMinutes}m`;
  }

  function formatRelativeTime(date: string): string {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }
</script>

<svelte:head>
  <title>Case Dashboard - Legal AI Platform</title>
</svelte:head>

<div class="case-dashboard">
  <!-- Header -->
  <div class="dashboard-header">
    <div class="header-content">
      <h1 class="dashboard-title">📊 Case Management Dashboard</h1>
      <p class="dashboard-subtitle">
        Real-time overview of your legal cases and tasks
      </p>
    </div>

    <div class="header-actions">
      <div class="last-update">
        <span class="update-text">Last updated: {lastUpdate.toLocaleTimeString()}</span>
        {#if refreshing}
          <div class="refresh-indicator">🔄</div>
        {/if}
      </div>

      <!-- Replaced ButtonBits with native button -->
      <button
        on:click={($event: any) => ($event: any) => () => loadDashboard()}
        disabled={isLoading || refreshing}
        class="btn-outline btn-sm"
        aria-busy={isLoading || refreshing}
      >
        {#if isLoading || refreshing}
          <span class="icon">🔄</span>
          Refreshing...
        {:else}
          <span class="icon">🔄</span>
          Refresh
        {/if}
      </button>
    </div>
  </div>

  {#if error}
    <!-- Replaced AlertBits with native markup -->
    <div class="alert-destructive mb-6" role="alert">
      <div class="alert-icon">⚠️</div>
      <div class="alert-body">
        <h3 class="font-semibold">Failed to load dashboard</h3>
        <p class="text-sm mt-1">{error}</p>
        <button on:click={($event: any) => ($event: any) => () => loadDashboard()} class="btn-outline btn-sm mt-2">
          🔄 Try Again
        </button>
      </div>
    </div>
  {:else if isLoading}
    <div class="loading-state">
      <div class="space-y-6">
        <!-- Loading skeletons for metrics (simple placeholders) -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {#each Array(8) as _}
            <section class="card p-4">
              <div class="skeleton h-4 w-20 mb-2"></div>
              <div class="skeleton h-8 w-16 mb-1"></div>
              <div class="skeleton h-3 w-24"></div>
            </section>
          {/each}
        </div>

        <!-- Loading skeleton for activity -->
        <section class="card p-4">
          <div class="skeleton h-6 w-32 mb-4"></div>
          <div class="space-y-3">
            {#each Array(5) as _}
              <div class="flex items-center space-x-3">
                <div class="skeleton h-4 w-4 rounded"></div>
                <div class="skeleton h-4 flex-1"></div>
                <div class="skeleton h-4 w-16"></div>
              </div>
            {/each}
          </div>
        </section>
      </div>
    </div>
  {:else if dashboardStats}
    <!-- Key Metrics Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <!-- Total Cases -->
      <section class="card p-6 hover:shadow-lg transition-all duration-200">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <span class="icon">📁</span>
            <h3 class="font-semibold text-gray-700">Total Cases</h3>
          </div>
        </div>
        <div class="space-y-1">
          <div class="text-3xl font-bold text-gray-900">{dashboardStats.totalCases}</div>
          <p class="text-sm text-gray-500">Active & Closed</p>
        </div>
      </section>

      <!-- Active Cases -->
      <section class="card p-6 hover:shadow-lg transition-all duration-200" style="border-left:4px solid #10b981;">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <span class="icon">⚡</span>
            <h3 class="font-semibold text-gray-700">Active Cases</h3>
          </div>
        </div>
        <div class="space-y-1">
          <div class="text-3xl font-bold text-green-600">{dashboardStats.activeCases}</div>
          <p class="text-sm text-gray-500">Currently working</p>
        </div>
      </section>

      <!-- Completed This Month -->
      <section class="card p-6 hover:shadow-lg transition-all duration-200">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <span class="icon">✅</span>
            <h3 class="font-semibold text-gray-700">Completed (Month)</h3>
          </div>
        </div>
        <div class="space-y-1">
          <div class="text-3xl font-bold text-emerald-600">{dashboardStats.completedThisMonth}</div>
          <p class="text-sm text-gray-500">Cases closed</p>
        </div>
      </section>

      <!-- Average Progress -->
      <section class="card p-6 hover:shadow-lg transition-all duration-200">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <span class="icon">📊</span>
            <h3 class="font-semibold text-gray-700">Avg Progress</h3>
          </div>
        </div>
        <div class="space-y-3">
          <div class="text-3xl font-bold text-blue-600">{dashboardStats.averageProgress}%</div>
          <progress value={dashboardStats.averageProgress} max="100" class="w-full"></progress>
        </div>
      </section>

      <!-- High Priority Cases -->
      <section class="card p-6 hover:shadow-lg transition-all duration-200" style="border-left:4px solid #ef4444;">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <span class="icon">🚨</span>
            <h3 class="font-semibold text-gray-700">High Priority</h3>
          </div>
          {#if dashboardStats.highPriorityCases > 0}
            <span class="badge badge-destructive animate-pulse">Urgent</span>
          {/if}
        </div>
        <div class="space-y-1">
          <div class="text-3xl font-bold text-red-600">{dashboardStats.highPriorityCases}</div>
          <p class="text-sm text-gray-500">Require attention</p>
        </div>
      </section>

      <!-- Overdue Todos -->
      <section class="card p-6 hover:shadow-lg transition-all duration-200" style="border-left:4px solid #fb923c;">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <span class="icon">⏰</span>
            <h3 class="font-semibold text-gray-700">Overdue Tasks</h3>
          </div>
          {#if dashboardStats.overdueTodos > 0}
            <span class="badge badge-warning">Overdue</span>
          {/if}
        </div>
        <div class="space-y-1">
          <div class="text-3xl font-bold text-orange-600">{dashboardStats.overdueTodos}</div>
          <p class="text-sm text-gray-500">Past due date</p>
        </div>
      </section>

      <!-- Pending Recommendations -->
      <section class="card p-6 hover:shadow-lg transition-all duration-200">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <span class="icon">🧠</span>
            <h3 class="font-semibold text-gray-700">AI Recommendations</h3>
          </div>
          {#if dashboardStats.pendingRecommendations > 0}
            <span class="badge badge-info">New</span>
          {/if}
        </div>
        <div class="space-y-1">
          <div class="text-3xl font-bold text-purple-600">{dashboardStats.pendingRecommendations}</div>
          <p class="text-sm text-gray-500">Pending review</p>
        </div>
      </section>

      <!-- Total Time Spent -->
      <section class="card p-6 hover:shadow-lg transition-all duration-200">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <span class="icon">⏱️</span>
            <h3 class="font-semibold text-gray-700">Time Spent</h3>
          </div>
        </div>
        <div class="space-y-1">
          <div class="text-3xl font-bold text-indigo-600">{formatTime(dashboardStats.totalTimeSpent)}</div>
          <p class="text-sm text-gray-500">Across all cases</p>
        </div>
      </section>
    </div>

    <!-- Recent Activity -->
    <section class="card mb-8 p-6">
      <div class="flex items-center space-x-2 mb-6">
        <span class="icon">📈</span>
        <h2 class="text-xl font-semibold text-gray-900">Recent Activity</h2>
      </div>

      {#if dashboardStats.recentActivities.length === 0}
        <div class="text-center py-12">
          <div class="text-6xl mb-4">📭</div>
          <p class="text-gray-500">No recent activity</p>
        </div>
      {:else}
        <div class="space-y-4">
          {#each dashboardStats.recentActivities as activity}
            <div class="flex items-start space-x-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                {#if activity.action === 'created'}
                  <span>➕</span>
                {:else if activity.action === 'updated'}
                  <span>🔁</span>
                {:else if activity.action === 'status_changed'}
                  <span>🔄</span>
                {:else if activity.action === 'todo_added'}
                  <span>📝</span>
                {:else if activity.action === 'todo_completed'}
                  <span>✅</span>
                {:else if activity.action === 'recommendation_generated'}
                  <span>🧠</span>
                {:else}
                  <span>ℹ️</span>
                {/if}
              </div>

              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900">
                  {activity.description}
                </p>
                <div class="flex items-center space-x-2 mt-1">
                  <span class="text-xs text-gray-500">
                    {formatRelativeTime(activity.createdAt)}
                  </span>
                  {#if activity.entityType}
                    <span class="separator" aria-hidden="true">|</span>
                    <span class="badge badge-outline text-xs">
                      {activity.entityType}
                    </span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Quick Actions -->
    <section class="card p-6">
      <div class="flex items-center space-x-2 mb-6">
        <span class="icon">⚡</span>
        <h2 class="text-xl font-semibold text-gray-900">Quick Actions</h2>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button on:click={($event: any) => ($event: any) => () => window.location.href = '/cases/new'} class="btn h-12 w-full justify-start">
          <span class="mr-2">➕</span>
          New Case
        </button>

        <button on:click={($event: any) => ($event: any) => () => window.location.href = '/cases'} class="btn-outline h-12 w-full justify-start">
          <span class="mr-2">📁</span>
          View All Cases
        </button>

        <button on:click={($event: any) => ($event: any) => () => window.location.href = '/todos'} class="btn-outline h-12 w-full justify-start">
          <span class="mr-2">📝</span>
          My Tasks
        </button>

        <button on:click={($event: any) => ($event: any) => () => window.location.href = '/recommendations'} class="btn-outline h-12 w-full justify-start">
          <span class="mr-2">🧠</span>
          AI Insights
        </button>
      </div>
    </section>
  {/if}
</div>

<style>
  .case-dashboard {
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
    min-height: 100vh;
    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    gap: 2rem;
  }

  .header-content {
    flex: 1;
  }

  .dashboard-title {
    font-size: 2rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0 0 0.5rem 0;
  }

  .dashboard-subtitle {
    font-size: 1.1rem;
    color: #64748b;
    margin: 0;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .last-update {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: #64748b;
  }

  .update-text {
    white-space: nowrap;
  }

  .refresh-indicator {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .loading-state {
    padding: 2rem 0;
  }

  /* Responsive Design */
  @media (max-width: 768px) {
    .case-dashboard {
      padding: 1rem;
    }

    .dashboard-header {
      flex-direction: column;
      gap: 1rem;
    }

    .header-actions {
      align-self: stretch;
      justify-content: space-between;
    }

    .dashboard-title {
      font-size: 1.5rem;
    }

    .last-update {
      font-size: 0.8rem;
    }
  }
</style>


