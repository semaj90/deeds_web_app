<!--
Vector Recommendations Widget
Compact AI recommendations component for sidebar/dashboard use
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import  Badge  from "$lib/components/ui/badge/Badge.svelte";
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  import type { Lightbulb,
    Target,
    AlertTriangle,
    TrendingUp,
    RefreshCw,
    ChevronRight,
    Clock,
    Star,
    Users,
    FileText,
    Zap
   } from 'lucide-svelte';
  import type { vectorIntelligenceService  } from '$lib/services/vector-intelligence-service.js';
  import type { IntelligenceRecommendation } from '$lib/services/vector-intelligence-service.js';
  interface Props {
    context?: string;
    userRole?: 'prosecutor' | 'detective' | 'admin' | 'user';
    currentCaseId?: string;
    maxRecommendations?: number;
    autoRefresh?: boolean;
    refreshInterval?: number; // minutes
    compact?: boolean;
    onRecommendationClick?: (recommendation: IntelligenceRecommendation) => void;
  }
  let {
    context = 'General legal assistance and case management',
    userRole = 'user',
    currentCaseId = undefined,
    maxRecommendations = 3,
    autoRefresh = false,
    refreshInterval = 30,
    compact = false,
    onRecommendationClick = () => {}
  }: Props = $props();
  let recommendations = $state<IntelligenceRecommendation[]>([]);
  let isLoading = $state(false);
  let lastUpdated = $state<Date | null>(null);
  let refreshTimer = $state<number | null>(null);

  $effect(() => {
    loadRecommendations();
    if (autoRefresh) {
      refreshTimer = setInterval(loadRecommendations, refreshInterval * 60 * 1000);
    }
    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    };
  });

  async function loadRecommendations() {
    if (isLoading) return;
    isLoading = true;
    try {
      const result = await vectorIntelligenceService.generateRecommendations({
        context,
        userProfile: {
          role: userRole,
          experience: 'senior',
          specialization: ['legal-analysis', 'case-management']
        },
        currentCase: currentCaseId
          ? {
              id: currentCaseId,
              type: 'general',
              priority: 'medium',
              status: 'active'
            }
          : undefined,
        preferences: {
          preferredActions: ['research', 'analysis', 'documentation'],
          workflowStyle: 'systematic'
        }
      });

      // Safely handle result that may be an array or wrapped object
      if (Array.isArray(result)) {
        recommendations = result.slice(0, maxRecommendations);
      } else if (result && Array.isArray((result as any).items)) {
        recommendations = (result as any).items.slice(0, maxRecommendations);
      } else if ((result as any).slice) {
        recommendations = (result as any).slice(0, maxRecommendations);
      } else {
        recommendations = [];
      }

      lastUpdated = new Date();
    } catch (error) {
      console.error('Failed to load recommendations:', error);
      recommendations = [];
    } finally {
      isLoading = false;
    }
  }

  function getRecommendationIcon(type: string) {
    switch (type) {
      case 'action':
        return Target;
      case 'insight':
        return Lightbulb;
      case 'warning':
        return AlertTriangle;
      case 'opportunity':
        return TrendingUp;
      default: return FileText;
    }
  }

  function getRecommendationColor(type: string) {
    switch (type) {
      case 'action':
        return 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/10';
      case 'insight':
        return 'border-l-green-500 bg-green-50/50 dark:bg-green-900/10';
      case 'warning':
        return 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10';
      case 'opportunity':
        return 'border-l-purple-500 bg-purple-50/50 dark:bg-purple-900/10';
      default: return 'border-l-gray-500 bg-gray-50/50 dark:bg-gray-900/10';
    }
  }

  function getPriorityIcon(priority: string) {
    switch (priority) {
      case 'critical':
        return AlertTriangle;
      case 'high':
        return Zap;
      case 'medium':
        return Clock;
      case 'low':
        return FileText;
      default: return FileText;
    }
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'critical':
        return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      case 'high':
        return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400';
      case 'medium':
        return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'low':
        return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/30 dark:text-gray-400';
    }
  }

  function getConfidenceColor(confidence: number) {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  }

  function formatTimeAgo(date: Date) {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
</script>

<div class="bits-nier-bits-card nes-container">
  <div class="yorha-panel-header bits-nier-bits-yorha-panel-header {compact ? 'p-3' : 'p-4'}" variant="default" legal={true}>
    <h3 class="nes-text is-primary flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Lightbulb class="h-4 w-4 text-yellow-600" />
        <span class="{compact ? 'text-sm' : 'text-base'}">AI Recommendations</span>
        {#if recommendations.length > 0}
          <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{recommendations.length}</span>
        {/if}
      </div>
      <div>
        <Button
          variant="ghost"
          size="sm"
          onclick={loadRecommendations}
          disabled={isLoading}
          class="h-7 w-7 p-0 bits-btn bits-btn"
        >
          <RefreshCw class="h-3 w-3 {isLoading ? 'animate-spin' : ''}" />
        </Button>
      </div>
    </h3>
    {#if lastUpdated && !compact}
      <p class="text-xs nes-text is-disabled">
        Updated {formatTimeAgo(lastUpdated)}
      </p>
    {/if}
  </div>
  <div class="yorha-panel-content bits-nier-bits-yorha-panel-content {compact ? 'p-3' : 'p-4'} pt-0" variant="default" legal={true}>
    {#if isLoading}
      <div class="space-y-3">
        {#each Array.isArray(Array(maxRecommendations)) ? Array(maxRecommendations) : [] as _}
          <div class="animate-pulse">
            <div class="h-4 bg-muted rounded w-3/4 mb-2"></div>
            <div class="h-3 bg-muted rounded w-full mb-1"></div>
            <div class="h-3 bg-muted rounded w-2/3"></div>
          </div>
        {/each}
      </div>
    {:else if recommendations.length === 0}
      <div class="text-center py-6">
        <Lightbulb class="h-8 w-8 nes-text is-disabled mx-auto mb-2" />
        <p class="text-sm nes-text is-disabled">No recommendations available</p>
        <p class="text-xs nes-text is-disabled mt-1">Check back later for AI insights</p>
      </div>
    {:else}
      <div class="space-y-3">
        {#each Array.isArray(recommendations) ? recommendations : [] as rec}
          {@const SvelteComponent = getRecommendationIcon(rec.type)}
          <button
            type="button"
            class="w-full text-left p-3 rounded-lg border-l-4 {getRecommendationColor(rec.type)} hover:shadow-md transition-all duration-200"
            onclick={() => onRecommendationClick(rec)}
          >
            <div class="flex items-start justify-between mb-2">
              <div class="flex items-center gap-2">
                <div class="h-4 w-4">
  <SvelteComponent />
                <span class="font-medium text-sm leading-tight">{rec.title}</span>
              </div>
              <ChevronRight class="h-3 w-3 nes-text is-disabled flex-shrink-0 mt-0.5" />
            </div>
            <p class="text-xs nes-text is-disabled mb-2 line-clamp-2">
              {rec.description}
            </p>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Badge class={`text-xs ${getPriorityColor(rec.priority)}`}>
                  {@const SvelteComponent_1 = getPriorityIcon(rec.priority)}
                  <div class="h-2 w-2 mr-1">
  <SvelteComponent _1  />
                  {rec.priority}
                </Badge>
                <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{rec.category}</span>
              </div>
              <div class="flex items-center gap-1">
                <Star class="h-3 w-3 {getConfidenceColor(rec.confidence)}" />
                <span class="text-xs {getConfidenceColor(rec.confidence)}">
                  {Math.round(rec.confidence * 100)}%
                </span>
              </div>
            </div>
            {#if rec.estimatedImpact && !compact}
              <div class="flex items-center gap-3 mt-2 text-xs nes-text is-disabled">
                <span>Time: {rec.estimatedImpact.timeToComplete}min</span>
                <span>•</span>
                <span>Success: {rec.estimatedImpact.successProbability}%</span>
              {/if}
          </button>
        {/each}
      </div>
      {#if !compact}
        <div class="mt-4 pt-3 border-t border-border">
          <div class="flex items-center justify-between text-xs nes-text is-disabled">
            <span>Based on your role: {userRole}</span>
            {#if autoRefresh}
              <span>Auto-refresh: {refreshInterval}min</span>
            {/if}
          </div>
        {/if}
    {/if}
  </div>
</div>

<style>
  /* @unocss-include */
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2; /* added standard property for compatibility */
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>