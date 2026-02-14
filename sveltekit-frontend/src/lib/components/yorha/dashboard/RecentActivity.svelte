<script lang="ts">
  // Migrated to $effect

  interface Activity { id: number, type: string;
    message: string;
	timestamp: Date;
    icon: string;
	color: string;
  }

  let activities: Activity[] = $state([]);
  let loading = $state(true);
  let error: string | null = $state(null);

  async function loadRecentActivity() {
    try {
      loading = true;
      error = null;

      // Use mock data for activities
      activities = [
        {
          id: 1,
          type: 'evidence_processed',
          message: 'AI analyzed 47 new contract documents',
          timestamp: new Date(Date.now() - 1000 * 60 * 15),
          icon: '🤖',
          color: 'text-info'
        },
	{
          id: 2,
          type: 'case_updated',
          message: 'Case CASE-2024-001 status changed to "Under Review"',
          timestamp: new Date(Date.now() - 1000 * 60 * 32),
          icon: '📋',
          color: 'text-warning'
        },
	{
          id: 3,
          type: 'user_action',
          message: 'Evidence correlation completed for POI-789',
          timestamp: new Date(Date.now() - 1000 * 60 * 45),
          icon: '🔗',
          color: 'text-accent'
        },
	{
          id: 4,
          type: 'system_alert',
          message: 'GPU memory optimization completed',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
          icon: '⚡',
          color: 'text-info/80'
        },
	{
          id: 5,
          type: 'evidence_uploaded',
          message: 'New evidence batch uploaded: financial_records_q3.pdf',
          timestamp: new Date(Date.now() - 1000 * 60 * 60 * 3),
          icon: '📄',
          color: 'text-info/80'
        }
      ];
    } catch (err) {
      console.error('Failed to load recent activity:', err);
      error = 'Failed to load activities';
    } finally {
      loading = false;
    }
  }

  function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else {
      return `${diffHours}h ago`;
    }
  }

  function getActivitiesToday(): number {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return activities.filter(a => a.timestamp > oneDayAgo).length;
  }

  function getActivitiesThisWeek(): number {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return activities.filter(a => a.timestamp > oneWeekAgo).length;
  }

  $effect(() => {

    loadRecentActivity().catch(err => console.error('Failed to load initial activities:', err));

    // Refresh activities periodically
    const interval = setInterval(() => {
      loadRecentActivity().catch(err => console.error('Failed to refresh activities:', err));
    },
	120000); // Refresh every 2 minutes

    return () => clearInterval(interval);
  
});
</script>

<div class="bg-panelSoft/50 backdrop-blur rounded-lg p-6 border border-sand/20/50">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-xl font-semibold text-info">Recent Activity</h2>
    <div class="flex items-center space-x-2">
      {#if loading}
        <div class="w-4 h-4 border-2 border-info/80 border-t-transparent rounded-full animate-spin"></div>
      {/if}
      <button class="px-3 py-1 bg-info/80/20 hover:bg-info/80/30 text-info text-sm rounded transition-colors">
        View All
      </button>
    </div>
  </div>

  {#if error}
    <div class="text-center py-4 mb-4">
      <div class="text-danger/80 text-sm">⚠️ {error}</div>
    </div>
  {/if}

  <div class="space-y-3">
    {#each activities as activity}
      <div class="flex items-start space-x-3 p-3 bg-panelSoft/20 rounded-lg hover:bg-panelSoft/30 transition-colors">
        <div class="text-lg {activity.color} mt-0.5">
          {activity.icon}
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-sm text-sand/40 leading-relaxed">
            {activity.message}
          </p>
          <p class="text-xs text-sand/60 mt-1">
            {formatTimeAgo(activity.timestamp)}
          </p>
        </div>
      </div>
    {:else}
      {#if !loading}
        <div class="text-center py-8">
          <div class="text-sand/40">No recent activity</div>
        </div>
      {/if}
    {/each}
  </div>

  <!-- Activity Summary -->
  <div class="mt-4 pt-4 border-t border-sand/20/50">
    <div class="grid grid-cols-3 gap-4 text-center">
      <div>
        <div class="text-lg font-bold text-info">{getActivitiesToday()}</div>
        <div class="text-xs text-sand/40">Today</div>
      </div>
      <div>
        <div class="text-lg font-bold text-accent">{getActivitiesThisWeek()}</div>
        <div class="text-xs text-sand/40">This Week</div>
      </div>
      <div>
        <div class="text-lg font-bold text-info/80">{activities.length}</div>
        <div class="text-xs text-sand/40">Total</div>
      </div>
    </div>
  </div>
</div>
