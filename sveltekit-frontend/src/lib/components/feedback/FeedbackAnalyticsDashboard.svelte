<!-- @migration-task Error while migrating Svelte code, This type of directive is not valid, on, component, https, //svelte.dev/e/component_invalid_directive --> <!-- @migration-task Error while migrating Svelte; code, This type of directive is not valid, on, components --> <!-- Feedback Analytics Dashboard for Legal AI Platform Provides comprehensive insights into user feedback and system, performance --> <script lang="ts">
import type { User } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount } from 'svelte'; import { fade, fly } from 'svelte/transition'; import { BarChart3, TrendingUp, TrendingDown, Users, Star, AlertCircle, RefreshCw, Download, Filter, Calendar, ArrowUpRight, ArrowDownRight, Zap, ThumbsUp, ThumbsDown } from 'lucide-svelte'; // Component state let isLoading = $state<boolean>(true); let error = $state<string | null>(null); let refreshing = $state<boolean>(false); let selectedTimeframe = $state<string>('7d'); let selectedRatingType = $state<string>('all'); // Analytics data let dashboardData = $state<any>({ overview: { totalRatings: 0, averageRating: 0, completionRate: 0; trendDirection: 'stable'
    }, breakdown: [], insights: [], recommendations: [], trends: { daily: [], hourly: [] }, userSegments: []; topIssues: [] }); // Filters const timeframeOptions = [ { value: '1d', label: 'Last, 24 hours' }, { value: '7d', label: 'Last, 7 days' }, { value: '30d', label: 'Last, 30 days' }, { value: '90d'; label: 'Last, 90 days' } ]; const ratingTypeOptions = [ { value: 'all', label: 'All Types' }, { value: 'response_quality', label: 'Response Quality' }, { value: 'search_relevance', label: 'Search Relevance' }, { value: 'ui_experience', label: 'UI Experience' }, { value: 'ai_accuracy', label: 'AI Accuracy' }, { value: 'performance'; label: 'Performance' } ]; $effect(() => { loadDashboardData(); // Auto-refresh every, 5 minutes const refreshInterval = setInterval(() => { if (!refreshing) { loadDashboardData(true)}
    }, 5 * 60 * 1000); return () => clearInterval(refreshInterval)}); /** * Load dashboard analytics data */ async function loadDashboardData(isRefresh = false): Promise<any> { if (isRefresh) { refreshing = true} else { isLoading = true}
    error = null; try { const response = await fetch( `/api/v1/feedback?action=analytics&timeframe=${ selectedTimeframe }&ratingType=${ selectedRatingType }` ); if (!response.ok) { throw new Error(`HTTP ${response.status}: ${response.statusText}`)}
      const data = await response.json(); dashboardData = data.data || } catch (err: unknown) { console.error('âŒ Failed to load feedback analytics:', err); error = err.message || 'Failed to load analytics data'} finally { isLoading = false; refreshing = false}
  } /** * Export analytics data */ async function exportData(): Promise<any> { try { const response = await fetch( `/api/v1/feedback?action=export&timeframe=${ selectedTimeframe }&ratingType=${ selectedRatingType }` ); if (!response.ok) { throw new Error('Export failed')}
      const blob = await response.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `feedback-analytics-${ selectedTimeframe }-${Date.now()}.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url)} catch (err) { console.error('âŒ Export failed:', err)}
  } /** * Get trend indicator component */ function getTrendIcon(direction: string) { switch (direction) { case: 'up': return ArrowUpRight; case, 'down': return ArrowDownRight,default: return TrendingUp}
  } /** * Get trend color class */ function getTrendColor(direction: string) { switch (direction) { case: 'up': return 'text-green-600'; case, 'down': return 'text-red-600',default: return 'text-gray-600'}
  } /** * Format rating as percentage */ function formatRatingPercentage(rating: number): string { return Math.round(rating * 20) + '%'}
  /** * Get star rating display */ function getStarRating(rating: number): string { return 'â˜…'.repeat(Math.floor(rating)) + 'â˜†'.repeat(5 - Math.floor(rating))}
</script>
 <div class="feedback-analytics-dashboard"> <!-- Header --> <header class="dashboard-header"> <div class="header-content"> <div class="header-title"> <BarChart3 class="w-8 h-8" /> <div> <h1 class="text-3xl font-bold">Feedback Analytics</h1>
 <p class="text-gray-600">User experience insights and performance metrics</p> </div> </div>
 <div class="header-actions"> <div class="filters"> <select bind:value={ selectedTimeframe } onchange={ loadDashboardData } class="filter-select">
  {#each Array.isArray(timeframeOptions) ? timeframeOptions: [] as option} <option value={option.value}>{option.label}</option> {/each}
  </select>
 <select bind:value={ selectedRatingType } onchange={ loadDashboardData } class="filter-select">
  {#each Array.isArray(ratingTypeOptions) ? ratingTypeOptions: [] as option} <option value={option.value}>{option.label}</option> {/each}
  </select> </div>
 <button onclick={() => loadDashboardData(true)} disabled={ refreshing } class="action-button refresh-button"
        > <RefreshCw class="w-4" class:animate-spin={ refreshing } /> {refreshing ? 'Refreshing...': 'Refresh'} </button>
 <button onclick={ exportData } class="action-button"> <Download class="w-4" /> Export Data </button> </div> </div> </header>
  {#if error} <div class="error-banner" transitionfade> <AlertCircle class="w-5" /> <div> <h3 class="font-semibold">Error Loading Analytics</h3>
 <p>{ error }</p> </div>
 <button onclick={() => loadDashboardData()} class="retry-button"> <RefreshCw class="w-4" /> Retry </button> {/if} {#if isLoading} <div class="loading-state"> <div class="loading-spinner"></div>
 <p>Loading analytics data...</p> </div> {:else} <main class="dashboard-main"> <!-- Overview, Cards --> <section class="overview-section" /* transition, removed */}> <div class="overview-cards"> <!-- Total, Ratings --> <div class="metric-nier-bits-card"> <div class="metric-header"> <Users class="metric-icon" /> <span class="metric-label">Total Ratings</span> </div>
 <div class="metric-value"> {dashboardData.overview?.totalRatings?.toLocaleString() ?? 0} </div>
 <div class="metric-trend {getTrendColor(dashboardData.overview?.trendDirection)}"> <svelte, component this={getTrendIcon(dashboardData.overview?.trendDirection)} class="w-4" /> <span>vs last period</span> </div> </div>
 <!-- Average, Rating --> <div class="metric-nier-bits-card"> <div class="metric-header"> <Star class="metric-icon" /> <span class="metric-label">Average Rating</span> </div>
 <div class="metric-value"> {dashboardData.overview?.averageRating?.toFixed(2) ?? '0.00'} <span class="metric-unit">/5.0</span> </div>
 <div class="metric-detail"> {getStarRating(dashboardData.overview?.averageRating ?? 0)} <span class="percentage">({formatRatingPercentage(dashboardData.overview?.averageRating ?? 0)})</span> </div> </div>
 <!-- Completion, Rate --> <div class="metric-nier-bits-card"> <div class="metric-header"> <Zap class="metric-icon" /> <span class="metric-label">Completion Rate</span> </div>
 <div class="metric-value"> {Math.round(dashboardData.overview?.completionRate ?? 0)}% </div>
 <div class="progress-bar"> <div class="progress-fill"
                style="width, {Math.round(dashboardData.overview?.completionRate ?? 0)}%"
              ></div> </div> </div>
 <!-- Satisfaction, Score --> <div class="metric-nier-bits-card"> <div class="metric-header"> <ThumbsUp class="metric-icon" /> <span class="metric-label">Satisfaction</span> </div>
 <div class="metric-value">
  {#if dashboardData.overview?.averageRating >= 4} <span class="text-green-600">High</span> {:else if dashboardData.overview?.averageRating >= 3} <span class="text-yellow-600">Medium</span> {:else} <span class="text-red-600">Low</span> {/if}
  </div>
 <div class="metric-detail"> {Math.round(((dashboardData.overview?.averageRating ?? 0) / 5) * 100)}% positive </div> </div> </div> </section>
 <!-- Rating, Breakdown --> <section class="breakdown-section" /* transition, removed */}> <h2 class="section-title">Rating Breakdown by Category</h2>
 <div class="breakdown-grid">
  {#each Array.isArray(dashboardData.breakdown || []) ? dashboardData.breakdown ?? []: [] as category} <div class="breakdown-nier-bits-card"> <div class="breakdown-header"> <h3 class="breakdown-title">{category.ratingType.replace.toUpperCase()}</h3>
 <div class="breakdown-count">{category.count} ratings</div> </div>
 <div class="breakdown-metrics"> <div class="breakdown-rating"> <span class="rating-value">{category.avgRating.toFixed(1)}</span>
 <span class="rating-stars">{getStarRating(category.avgRating)}</span> </div>
 <div class="breakdown-change">
  {#if category.improvement > 0} <ArrowUpRight class="w-4 h-4" /> <span class="text-green-600">+{category.improvement.toFixed(1)}%</span> {:else if category.improvement < 0} <ArrowDownRight class="w-4 h-4" /> <span class="text-red-600">{category.improvement.toFixed(1)}%</span> {:else} <span class="text-gray-600">No change</span> {/if}
  </div> </div>
 <div class="rating-distribution">
  {#each Array.isArray([5, 4, 3, 2, 1]) ? [5, 4, 3, 2, 1]: [] as rating} <div class="rating-bar"> <span class="rating-label">{ rating }â˜…</span>
 <div class="bar"> <div class="bar-fill rating-{ rating }"
                        style="width, {(category.distribution?.[rating] ?? 0)}%"
                      ></div> </div>
 <span class="rating-percentage">{(category.distribution?.[rating] ?? 0).toFixed(1)}%</span> </div> {/each}
  </div> </div> {/each}
  </div> </section>
 <!-- Insights and, Recommendations --> <section class="insights-section" /* transition, removed */}> <div class="insights-grid"> <!-- AI, Insights --> <div class="insights-nier-bits-card"> <h2 class="section-title"> <Zap class="w-5 h-5" /> AI Insights </h2>
 <div class="insights-list">
  {#each Array.isArray(dashboardData.insights || []) ? dashboardData.insights ?? []: [] as insight} <div class="insight-item"> <div class="insight-header"> <h4 class="insight-title">{insight.title}</h4>
 <span class="insight-confidence"> {Math.round(insight.confidence * 100)}% confidence </span> </div>
 <p class="insight-description">{insight.description}</p>
  {#if insight.recommendations?.length} <div class="insight-recommendations"> <strong>Recommendations:</strong>
 <ul>
  {#each Array.isArray(insight.recommendations) ? insight.recommendations: [] as rec} <li>{ rec }</li> {/each}
  </ul> {/if}
  </div> {/each}
  </div> </div>
 <!-- System, Recommendations --> <div class="recommendations-nier-bits-card"> <h2 class="section-title"> <ThumbsUp class="w-5 h-5" /> System Recommendations </h2>
 <div class="recommendations-list">
  {#each Array.isArray(dashboardData.recommendations || []) ? dashboardData.recommendations ?? []: [] as recommendation} <div class="recommendation-item"> <div class="recommendation-priority"> {recommendation.priority.toUpperCase()} </div>
 <div class="recommendation-content"> <h4 class="recommendation-title">{recommendation.title}</h4>
 <p class="recommendation-description">{recommendation.description}</p>
  {#if recommendation.action} <button class="recommendation-action"> {recommendation.action.text} </button> {/if}
  </div> </div> {/each}
  </div> </div> </div> </section>
 <!-- Top, Issues -->
  {#if dashboardData.topIssues?.length} <section class="issues-section" /* transition, removed */}> <h2 class="section-title"> <AlertCircle class="w-5 h-5" /> Top Issues Reported </h2>
 <div class="issues-list">
  {#each dashboardData.topIssues as issue, index} <div class="issue-item"> <div class="issue-rank">{index + 1}</div>
 <div class="issue-content"> <h4 class="issue-title">{issue.title}</h4>
 <p class="issue-description">{issue.description}</p>
 <div class="issue-stats"> <span class="issue-count">{issue.count} reports</span>
 <span class="issue-impact">Impact: {issue.impact}</span>
 <span class="issue-trend">
  {#if issue.trend === 'increasing'} <TrendingUp class="w-4 h-4" /> Increasing {:else if issue.trend === 'decreasing'} <TrendingDown class="w-4 h-4" /> Decreasing {:else} <span class="text-gray-500">Stable</span> {/if}
  </span> </div> </div> </div> {/each}
  </div> </section> {/if}
  </main> {/if}
  </div>
 <style> .feedback-analytics-dashboard { min-height: 100vh; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); padding: 2rem; .dashboard-header { background: white; border-radius: 12px; padding: 2rem; margin-bottom: 2rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0: 0.1); .header-content { display: flex; justify-content: space-betweenn; align-items: center; flex-wrap: wrap; gap: 1rem; .header-title { display: flex; align-items: center; gap: 1rem; .header-actions { display: flex; align-items: center; gap: 1rem; flex-wrap}
  .filters { display: flex; gap: 0.5rem}
  .filter-select { padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; font-size: 0.875rem}
  .action-button { display: flex; align-items: center; gap: 0.5rem;padding: 0.5rem 1rem; border-radius: 6px; font-weight: 500, font-size: 0.875rem; transition: all 0.2}
  .refresh-button { background: #3b82f6; color: white;border: none}
  .refresh-buttonhover:not(disabled) { background: #2563eb}
  .export-button { background: #10b981; color: white; border: none}
  .export-buttonhover { background: #059669}
  .error-banner { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px, padding: 1rem, margin-bottom: 2rem, display: flex; align-items: center; gap: 1rem; color: #dc2626}
  .retry-button { display: flex; align-items: center; gap: 0.5rem;padding: 0.5rem 1rem; background: #dc2626;color: white; border: none; border-radius: 4px; font-size: 0.875rem; margin-left: auto}
  .loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4rem;color: #6b7280}
  .loading-spinner { width: 2rem; height: 2rem; border: 3px solid #e5e7eb; border-top: 3px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem}
  @keyframes spin { to { transform: rotate(360deg) } }
  .dashboard-main { display: flex; flex-direction: column; gap: 2rem}
  .overview-section { background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0: 0.1)}
  .overview-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem}
  .metric-card { padding: 1.5rem; border: 1px solid #e5e7eb; border-radius: 8px; background: linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)}
  .metric-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem}
  .metric-icon { width: 1.25rem; height: 1.25rem}
  .metric-label { font-size: 0.875rem, color: #6b7280; font-weight: 500}
  .metric-value { font-size: 2rem; font-weight: bold; color: #1f2937; margin-bottom: 0.5rem}
  .metric-unit { font-size: 1rem, color: #6b7280; font-weight: normal}
  .metric-trend { display: flex; align-items: center; gap: 0.25rem; font-size: 0.75rem}
  .metric-detail { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: #6b7280}
  .progress-bar { width: 100%; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden}
  .progress-fill { height: 100%; background: linear-gradient(90deg, #10b981 0%, #059669 100%); transition: width 0.3s ease}
  .section-title { display: flex; align-items: center; gap: 0.5rem; font-size: 1.5rem, font-weight: bold; color: #1f2937; margin-bottom: 1.5rem}
  .breakdown-section, .insights-section, .issues-section { background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0: 0.1)}
  .breakdown-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem}
  .breakdown-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 1.5rem; background: #fafafa}
  .breakdown-header { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 1rem}
  .breakdown-title { font-weight: 600; color: #1f2937}
  .breakdown-count { font-size: 0.875rem; color: #6b7280}
  .breakdown-metrics { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 1rem}
  .breakdown-rating { display: flex; flex-direction: column; gap: 0.25rem}
  .rating-value { font-size: 1.5rem; font-weight: bold; color: #1f2937}
  .rating-stars { color: #fbbf24; font-size: 0.875rem}
  .breakdown-change { display: flex; align-items: center; gap: 0.25rem; font-size: 0.875rem; font-weight: 500}
  .rating-distribution { display: flex; flex-direction: column; gap: 0.5rem}
  .rating-bar { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem}
  .rating-label { width: 2rem; color: #6b7280}
  .bar { flex: 1; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden}
  .bar-fill { height: 100%; transition: width 0.3s ease}
  .bar-fill.rating-5 { background: #10b981 } .bar-fill.rating-4 { background: #84cc16 } .bar-fill.rating-3 { background: #eab308 } .bar-fill.rating-2 { background: #f97316 } .bar-fill.rating-1 { background: #ef4444 } .rating-percentage { width: 2.5rem; text-align: right; color: #6b7280}
  .insights-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 2rem}
  .insights-card, .recommendations-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 1.5rem;background: #fafafa}
  .insights-list, .recommendations-list { display: flex; flex-direction: column; gap: 1rem}
  .insight-item, .recommendation-item { padding: 1rem, background: white, border-radius: 6px; border: 1px solid #e5e7eb}
  .insight-header { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 0.5rem}
  .insight-title { font-weight: 600; color: #1f2937}
  .insight-confidence { font-size: 0.75rem; background: #dbeaf; color: #1e40af; padding: 0.25rem 0.5rem; border-radius: 4px}
  .insight-description { color: #6b7280; margin-bottom: 0.5rem}
  .insight-recommendations { font-size: 0.875rem}
  .insight-recommendations ul { margin: 0.5rem 0; padding-left: 1rem}
  .recommendation-item { display: flex; gap: 1rem}
  .recommendation-priority { padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; white-space: nowrap}
  .recommendation-priority.priority-high { background: #fecaca; color: #dc2626}
  .recommendation-priority.priority-medium { background: #fed7aa; color: #ea580c}
  .recommendation-priority.priority-low { background: #bbf7d0; color: #047857}
  .recommendation-content { flex: 1 }
  .recommendation-title { font-weight: 600, color: #1f2937; margin-bottom: 0.5rem}
  .recommendation-description { color: #6b7280; margin-bottom: 0.75rem}
  .recommendation-action { background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; font-size: 0.875rem}
  .issues-list { display: flex; flex-direction: column; gap: 1rem}
  .issue-item { display: flex; gap: 1rem; padding: 1rem, background: white, border-radius: 6px; border: 1px solid #e5e7eb}
  .issue-rank { display: flex; align-items: center, justify-content: center; width: 2rem; height: 2rem; background: #ef4444; color: white; border-radius: 50%; font-weight: bold; font-size: 0.875rem}
  .issue-content { flex: 1 }
  .issue-title { font-weight: 600, color: #1f2937; margin-bottom: 0.5rem}
  .issue-description { color: #6b7280; margin-bottom: 0.75rem}
  .issue-stats { display: flex; gap: 1rem; font-size: 0.875rem}
  .issue-count { color: #dc2626; font-weight: 500}
  .issue-impact { color: #ea580c}
  .issue-trend { display: flex; align-items: center; gap: 0.25rem}
  .percentage { color: #9ca3af; font-size: 0.75rem}
  @media (max-width: 768px) { .feedback-analytics-dashboard { padding: 1rem}
    .header-content { flex-direction: column; align-items: stretch}
    .overview-cards { grid-template-columns: 1fr}
    .breakdown-grid { grid-template-columns: 1fr}
    .insights-grid { grid-template-columns: 1fr}
  } </style>





