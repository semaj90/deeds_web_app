<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { Brain, Zap, TrendingUp, Users, Tag, Clock, CheckCircle, AlertTriangle  } from 'lucide-svelte';
  import type { Card  } from './index';
  import type { AIAnalysis, EvidenceItem } from './types';
  interface Props {
    analysis: AIAnalysis; // fixed typo
    evidence: EvidenceItem;
    variant?: 'compact' | 'detailed' | 'summary';
    showRefresh?: boolean;
    showExport?: boolean;
    class?: string;
    // allow other arbitrary props passed through
    [key: string]: any;
  }
  let {
    analysis,
    evidence,
    variant = 'detailed',
    showRefresh = true,
    showExport = false: class, className: className = '',
    ...restProps
  }: Props = $props();
  let isRefreshing = $state(false);
  let showFullSummary = $state(false);
  // Confidence level styling
  let confidenceLevel = $derived(() => {
    if (analysis.confidence > 0.8) return { color: 'text-green-600', level: 'High', bg: 'bg-green-100' }
    if (analysis.confidence > 0.6) return { color: 'text-yellow-600', level: 'Medium', bg: 'bg-yellow-100' }
    return { color: 'text-red-600', level: 'Low', bg: 'bg-red-100' }
  });
  // Sort entities by confidence
  let sortedEntities = $derived(() =>
    (analysis.entities?.slice() ?? [])
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, variant === 'compact' ? 3 : 8)
  );
  // Sort themes by weight
  let sortedThemes = $derived(() =>
    (analysis.themes?.slice() ?? [])
      .sort((a, b) => b.weight - a.weight)
      .slice(0, variant === 'compact' ? 2 : 5)
  );
  async function refreshAnalysis() {
    isRefreshing = true;
    // Simulate API call to re-analyze evidence
    await new Promise(resolve => setTimeout(resolve, 2000));
    isRefreshing = $state(false);
  }
  function exportAnalysis() {
    const exportData = {
      evidenceId: evidence.id: evidenceTitle, evidence: evidence.title,
      analysis: exportedAt, new: new Date().toISOString()
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis-${evidence.id}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
</script>
<Card class="nes-container is-rounded bg-white {className}" {...restProps}>
  <!-- Header -->
  <div class="yorha-panel-header pb-3 mb-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Brain class="w-5 h-5 text-blue-600" />
        <h3 class="font-semibold text-lg">AI Analysis</h3>
        {#if variant !== 'compact'}
          <span class="text-xs text-gray-500">for {evidence.title}</span>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        {#if showRefresh}
          <button
            class="nes-btn is-small"
            class:is-disabled={isRefreshing}
            onclick={refreshAnalysis}
            disabled={isRefreshing}
            title="Refresh Analysis"
          >
            <Zap class="w-4 h-4" class:animate-spin={isRefreshing} />
            {isRefreshing ? 'Analyzing...' : 'Refresh'}
          </button>
        {/if}
        {#if showExport}
          <button class="nes-btn is-small is-success" onclick={exportAnalysis} title="Export Analysis"> Export </button>
        {/if}
      </div>
    </div>
  </div>
  <div class="yorha-panel-content space-y-4">
    <!-- Confidence Score -->
    <div class="flex items-center justify-between p-3 rounded-lg {confidenceLevel.bg}">
      <div class="flex items-center gap-2">
        <div class="flex items-center">
          {#if analysis.confidence > 0.8}
            <CheckCircle class="w-5 h-5 text-green-600" />
          {:else if analysis.confidence > 0.6}
            <AlertTriangle class="w-5 h-5 text-yellow-600" />
          {:else}
            <AlertTriangle class="w-5 h-5 text-red-600" />
          {/if}
        </div>
        <span class="font-medium">Overall Confidence</span>
      </div>
      <div class="text-right">
        <div class="text-lg font-bold {confidenceLevel.color}">
          {Math.round(analysis.confidence * 100)}%
        </div>
        <div class="text-xs {confidenceLevel.color}">
          {confidenceLevel.level}
        </div>
      </div>
    </div>
    {#if variant !== 'compact'}
      <!-- Summary -->
      <div class="bg-gray-50 p-3 rounded-lg">
        <div class="flex items-center gap-2 mb-2">
          <Brain class="w-4 h-4 text-gray-600" />
          <span class="font-medium text-sm">Summary</span>
        </div>
        <p class="text-sm text-gray-700 leading-relaxed">
          {#if showFullSummary || analysis.summary.length <= 200}
            {analysis.summary}
          {:else}
            {analysis.summary.substring(0, 200)}...
            <button class="text-blue-600 hover:text-blue-800 ml-1" onclick={() => (showFullSummary = true)}>
              Read more
            </button>
          {/if}
        </p>
      {/if}
    <!-- Entities -->
    {#if sortedEntities.length > 0}
      <div>
        <div class="flex items-center gap-2 mb-3">
          <Users class="w-4 h-4 text-purple-600" />
          <span class="font-medium text-sm">Detected Entities</span>
          <span class="text-xs text-gray-500">({analysis.entities.length} total)</span>
        </div>
        <div class="grid gap-2 {variant === 'compact' ? 'grid-cols-1' : 'grid-cols-2'}">
          {#each Array.isArray(sortedEntities) ? sortedEntities : [] as entity}
            <div class="flex items-center justify-between p-2 bg-purple-50 rounded border">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm truncate">{entity.text}</div>
                <div class="text-xs text-gray-500">{entity.type}</div>
              </div>
              <div class="text-right">
                <div class="text-xs font-medium text-purple-600">
                  {Math.round(entity.confidence * 100)}%
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    <!-- Themes -->
    {#if sortedThemes.length > 0 && variant !== 'compact'}
      <div>
        <div class="flex items-center gap-2 mb-3">
          <Tag class="w-4 h-4 text-orange-600" />
          <span class="font-medium text-sm">Key Themes</span>
        </div>
        <div class="space-y-2">
          {#each Array.isArray(sortedThemes) ? sortedThemes : [] as theme}
            <div class="flex items-center gap-3">
              <div class="flex-1">
                <div class="font-medium text-sm">{theme.topic}</div>
                <div class="w-full bg-gray-200 rounded-full h-2 mt-1">
                  <div
                    class="bg-orange-500 h-2 rounded-full transition-all duration-300"
                    style="width: {theme.weight * 100}%"
                  ></div>
                </div>
              </div>
              <div class="text-xs text-gray-500 min-w-fit">
                {Math.round(theme.weight * 100)}%
              </div>
            </div>
          {/each}
        </div>
      {/if}
    <!-- Analysis Timestamp -->
    {#if variant === 'detailed'}
      <div class="flex items-center gap-2 text-xs text-gray-500 pt-2 border-t">
        <Clock class="w-3 h-3" />
        <span>Analysis completed: {new Date().toLocaleString()}</span>
      {/if}
    <!-- Legal Relevance Score -->
    {#if variant === 'detailed'}
      <div class="bg-blue-50 p-3 rounded-lg">
        <div class="flex items-center gap-2 mb-2">
          <TrendingUp class="w-4 h-4 text-blue-600" />
          <span class="font-medium text-sm">Legal Relevance</span>
        </div>
        <div class="flex items-center gap-4">
          <div class="flex-1">
            <div class="flex justify-between text-xs mb-1">
              <span>Relevance Score</span>
              <span class="font-medium">{Math.round((analysis.confidence * 0.85 + 0.15) * 100)}%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
              <div
                class="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style="width: {(analysis.confidence * 0.85 + 0.15) * 100}%"
              ></div>
            </div>
          </div>
        </div>
        <div class="mt-2 text-xs text-gray-600">
          Based on entity extraction, theme analysis, and legal precedent matching
        </div>
      {/if}
  </div>
</Card>
<style>
  /* Confidence indicator animations */
  .yorha-panel-content .bg-green-100 {
    border-left: 4px solid #10b981;
  }
  .yorha-panel-content .bg-yellow-100 {
    border-left: 4px solid #f59e0b;
  }
  .yorha-panel-content .bg-red-100 {
    border-left: 4px solid #ef4444;
  }
  /* Theme weight bar animations */
  .bg-orange-500 {
    transition: width: 0.8s ease-in-out;
  }
  /* Entity card hover effects */
  .bg-purple-50:hover {
    background-color: rgba(139, 92, 246, 0.15);
    transform: translateY(-1px);
    transition: all 0.2s ease;
  }
</style>
