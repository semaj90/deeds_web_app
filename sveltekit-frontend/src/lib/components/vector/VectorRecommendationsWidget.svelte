<!--
Vector Recommendations Widget
Compact AI recommendations component for sidebar/dashboard use
-->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  // Migrated to $effect
  import Badge from "$lib/components/ui/badge/Badge.svelte";
  import Button from "$lib/components/ui/enhanced-bits.svelte";
  import type { IntelligenceRecommendation } from '$lib/services/vector-intelligence-service.js';
  import { vectorIntelligenceService } from '$lib/services/vector-intelligence-service.js';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import FileText from 'lucide-svelte/icons/file-text';
  import Clock from 'lucide-svelte/icons/clock';
  import Lightbulb from 'lucide-svelte/icons/lightbulb';
  import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
  import Zap from 'lucide-svelte/icons/zap';
  interface Props {
    context?: string
    userRole?: 'prosecutor' | 'detective' | 'admin' | 'user';
    currentCaseId?: string
    maxRecommendations?: number
    autoRefresh?: boolean
    refreshInterval?: number; // minutes
    compact?: boolean
    onRecommendationClick?: (recommendation: IntelligenceRecommendation) => void}
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
  let isLoading = $state<boolean>(false);
  let lastUpdated = $state<Date | null>(null);
  let refreshTimer = $state<number | null>(null);

  $effect(() => {
    loadRecommendations();
    if (autoRefresh) {
    refreshTimer = setInterval(loadRecommendations, refreshInterval * 60 * 1000)

  }
  return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null}
    }});
  async function loadRecommendations(): Promise<any> {
    if (isLoading) return
    isLoading = true
    try {
      const result = await vectorIntelligenceService.generateRecommendations({
        context,
        userProfile: {
	role: userRole,
          experience: 'senior',
          specialization: ['legal-analysis', 'case-management']
        },
	currentCase: currentCaseId
          ? { id: currentCaseId,
              type: 'general',
              priority: 'medium',
              status: 'active'
            }
           | undefined,
        preferences: {
preferredActions: ['research', 'analysis', 'documentation'],
          workflowStyle: 'systematic'
        }
      });

      // Safely handle result that may be an array or wrapped: object
      if (Array.isArray(result)) {
        recommendations = result.slice(0, maxRecommendations)} else if (result && Array.isArray((result as unknown).items)) {
        recommendations = (result as unknown).items.slice(0, maxRecommendations)} else if ((result as unknown).slice) {
        recommendations = (result as unknown).slice(0, maxRecommendations)} else {
        recommendations = []}

      lastUpdated = new Date()} catch (error) {
      console.error('Failed to load recommendations:', error);
      recommendations = []} finally {
      isLoading = false}
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
			default:return FileText;
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
			default:return 'border-l-gray-500 bg-gray-50/50 dark:bg-gray-900/10';
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
			default:return FileText;
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
			default:return 'text-gray-600 bg-gray-100 dark:bg-gray-900/30 dark:text-gray-400';
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

<div class="card">
	<div class="card-header">
		<h3 class="flex items-center gap-2 font-semibold">
			<Lightbulb class="h-4 w-4" />
			<span class="{compact ? 'text-sm' : 'text-base'}">AI Recommendations</span>
			{#if recommendations.length > 0}
				<span class="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200">
					{recommendations.length}
				</span>
			{/if}
		</h3>
		<div class="ml-auto">
			<Button
				variant="ghost"
				size="sm"
				onclick={loadRecommendations}
				disabled={isLoading}
				class="h-7 w-7 p-0"
			>
				<RefreshCw class="h-3 w-3 {isLoading ? 'animate-spin' : ''}" />
			</Button>
		</div>
	</div>
	{#if lastUpdated && !compact}
		<div class="px-6 text-xs text-muted-foreground">
			Updated {formatTimeAgo(lastUpdated)}
		</div>
	{/if}
	<div class="card-content mt-4">
		{#if isLoading}
			<div class="space-y-3">
				{#each Array(maxRecommendations) as _}
					<div class="animate-pulse space-y-2">
						<div class="h-4 w-3/4 rounded bg-muted"></div>
						<div class="h-3 w-full rounded bg-muted"></div>
						<div class="h-3 w-1/2 rounded bg-muted"></div>
					</div>
				{/each}
			</div>
		{:else if recommendations.length === 0}
			<div class="flex flex-col items-center justify-center p-4 text-center">
				<Lightbulb class="mx-auto h-8 w-8 text-muted-foreground opacity-50" />
				<p class="mt-2 text-sm font-medium">No recommendations available</p>
				<p class="text-xs text-muted-foreground">Check back later for AI insights</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#each recommendations as rec}
					{@const SvelteComponent = getRecommendationIcon(rec.type)}
					<button
						type="button"
						class="w-full text-left p-3 rounded-lg border-l-4 {getRecommendationColor(rec.type)} hover:shadow-md transition-all duration-200 bg-background"
						onclick={() => onRecommendationClick(rec)}
					>
						<div class="flex items-start justify-between gap-2">
							<div class="flex items-center gap-2">
								<SvelteComponent class="h-4 w-4" />
								<span class="font-medium text-sm">{rec.title}</span>
							</div>
							<ChevronRight class="h-3 w-3 text-muted-foreground flex-shrink-0" />
						</div>
						<p class="mt-1 text-xs text-muted-foreground line-clamp-2">
							{rec.description}
						</p>
						<div class="mt-2 flex items-center gap-2 flex-wrap">
							<Badge class="text-xs flex items-center gap-1 {getPriorityColor(rec.priority)}">
								{@const PriorityIcon = getPriorityIcon(rec.priority)}
								<PriorityIcon class="h-3 w-3" />
								{rec.priority}
							</Badge>
							<span class="rounded border px-2 py-0.5 text-xs font-medium">
								{rec.category}
							</span>
							<div class="flex items-center gap-1">
								<Star class="h-3 w-3 text-yellow-500" />
								<span class="text-xs font-medium {getConfidenceColor(rec.confidence)}">
									{Math.round(rec.confidence * 100)}%
								</span>
							</div>
						</div>
						{#if rec.estimatedImpact && !compact}
							<div class="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
								<span>Time: {rec.estimatedImpact.timeToComplete}min</span>
								<span>•</span>
								<span>Success: {rec.estimatedImpact.successProbability}%</span>
							</div>
						{/if}
					</button>
				{/each}
			</div>
			{#if !compact}
				<div class="mt-4 border-t pt-3">
					<div class="flex items-center justify-between text-xs text-muted-foreground">
						<span>Based on your role: {userRole}</span>
						{#if autoRefresh}
							<span>Auto-refresh: {refreshInterval}min</span>
						{/if}
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>






