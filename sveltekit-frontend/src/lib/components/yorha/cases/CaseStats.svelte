<script lang="ts">
  // Migrated to $effect

  let stats = $state({
    totalCases: 47,
    activeCases: 23,
    reviewCases: 12,
    closedCases: 12,
    highPriority: 8,
    mediumPriority: 15,
    lowPriority: 24,
    avgCompletionTime: 14,
    successRate: 87
  });

  const trends = {
    casesThisWeek: 5,
    casesLastWeek: 7,
    completionRate: 68,
    avgEvidencePerCase: 1247
  };

  $effect(() => {

    const interval = setInterval(() => {
      stats.activeCases += Math.floor(Math.random() * 3) - 1;
      stats.activeCases = Math.max(0, Math.min(stats.totalCases, stats.activeCases));
    },
	30000);

    return () => clearInterval(interval);
  
});

  function getTrendColor(value: number): string {
    if (value > 0) return 'text-green-400';
    if (value < 0) return 'text-red-400';
    return 'text-slate-400';
  }

  function getTrendIcon(value: number): string {
    if (value > 0) return '↗️';
    if (value < 0) return '↘️';
    return '→';
  }
</script>

<div class="grid grid-cols-1 md: grid-cols-2, lg:grid-cols-4 gap-6">
  <!-- Total Cases -->
  <div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm font-medium text-slate-400">Total Cases</p>
        <p class="text-3xl font-bold text-white">{stats.totalCases}</p>
      </div>
      <div class="p-3 bg-cyan-400/20 rounded-lg">
        <span class="text-2xl">📋</span>
      </div>
    </div>
    <div class="mt-4">
      <div class="flex items-center text-sm">
        <span class="{getTrendColor(trends.casesThisWeek - trends.casesLastWeek)} flex items-center">
          {getTrendIcon(trends.casesThisWeek - trends.casesLastWeek)}
          {Math.abs(trends.casesThisWeek - trends.casesLastWeek)} this week
        </span>
      </div>
    </div>
  </div>

  <!-- Active Cases -->
  <div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm font-medium text-slate-400">Active Cases</p>
        <p class="text-3xl font-bold text-green-400">{stats.activeCases}</p>
      </div>
      <div class="p-3 bg-green-400/20 rounded-lg">
        <span class="text-2xl">🔍</span>
      </div>
    </div>
    <div class="mt-4">
      <div class="w-full bg-slate-700 rounded-full h-2">
        <div
          class="h-2 rounded-full bg-green-400 transition-all duration-300"
          style="width: {(stats.activeCases / stats.totalCases) * 100}%"
        ></div>
      </div>
      <p class="text-xs text-slate-400 mt-1">{Math.round((stats.activeCases / stats.totalCases) * 100)}% of total</p>
    </div>
  </div>

  <!-- Under Review -->
  <div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm font-medium text-slate-400">Under Review</p>
        <p class="text-3xl font-bold text-yellow-400">{stats.reviewCases}</p>
      </div>
      <div class="p-3 bg-yellow-400/20 rounded-lg">
        <span class="text-2xl">⏳</span>
      </div>
    </div>
    <div class="mt-4">
      <div class="w-full bg-slate-700 rounded-full h-2">
        <div
          class="h-2 rounded-full bg-yellow-400 transition-all duration-300"
          style="width: {(stats.reviewCases / stats.totalCases) * 100}%"
        ></div>
      </div>
      <p class="text-xs text-slate-400 mt-1">{Math.round((stats.reviewCases / stats.totalCases) * 100)}% of total</p>
    </div>
  </div>

  <!-- Success Rate -->
  <div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm font-medium text-slate-400">Success Rate</p>
        <p class="text-3xl font-bold text-cyan-400">{stats.successRate}%</p>
      </div>
      <div class="p-3 bg-cyan-400/20 rounded-lg">
        <span class="text-2xl">✨</span>
      </div>
    </div>
    <div class="mt-4">
      <p class="text-xs text-slate-400">Avg. {stats.avgCompletionTime} days per case</p>
    </div>
  </div>
</div>

<!-- Priority Breakdown -->
<div class="mt-6 bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
  <h3 class="text-lg font-semibold text-cyan-400 mb-4">Priority Breakdown</h3>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div class="text-center">
      <div class="text-2xl font-bold text-red-400">{stats.highPriority}</div>
      <div class="text-sm text-slate-400">High Priority</div>
      <div class="mt-2 w-full bg-slate-600 rounded-full h-2">
        <div
          class="h-2 rounded-full bg-red-400 transition-all duration-300"
          style="width: {(stats.highPriority / stats.totalCases) * 100}%"
        ></div>
      </div>
    </div>

    <div class="text-center">
      <div class="text-2xl font-bold text-yellow-400">{stats.mediumPriority}</div>
      <div class="text-sm text-slate-400">Medium Priority</div>
      <div class="mt-2 w-full bg-slate-600 rounded-full h-2">
        <div
          class="h-2 rounded-full bg-yellow-400 transition-all duration-300"
          style="width: {(stats.mediumPriority / stats.totalCases) * 100}%"
        ></div>
      </div>
    </div>

    <div class="text-center">
      <div class="text-2xl font-bold text-green-400">{stats.lowPriority}</div>
      <div class="text-sm text-slate-400">Low Priority</div>
      <div class="mt-2 w-full bg-slate-600 rounded-full h-2">
        <div
          class="h-2 rounded-full bg-green-400 transition-all duration-300"
          style="width: {(stats.lowPriority / stats.totalCases) * 100}%"
        ></div>
      </div>
    </div>
  </div>
</div>


