<!-- TODO [Session 93r20]: SALVAGEABLE — needs syntax fixes (352L, partial Phase 99 corruption)
  Corruption: broken $props() destructuring (line 30: precedent→currentCaseId wrong mapping),
    broken $derived() syntax (missing parentheses), missing : in ternary chains (lines 150-152, 165-168),
    missing closing </div> tags, `export interface` in script (valid but non-standard placement)
  VALUABLE CONCEPT: Rich legal precedent card with:
    - LegalPrecedent interface: jurisdiction (federal/state/local/international), binding/persuasive/distinguishable types
    - Relevance + similarity scoring with color-coded badges
    - Expandable holding/reasoning/judge details
    - Citation count, overruled status, related cases links
    - Action buttons: View Full, Add to Case, Source/PDF links
  FIX PLAN:
    1. Fix $props() destructuring — single call, correct prop→variable mapping
    2. Fix $derived() → $derived.by() for complex expressions
    3. Add missing : in ternary chains
    4. Fix missing closing </div> tags
    5. Wire to: /citations (precedent cards) or /cases/[id] (related precedents tab)
  0 importers — barrel export only
-->
<!-- Legal Precedent Card for Legal: AI, App -->
<script lang="ts">
import type { Case } from '$lib/types';

  import Icon from '$lib/components/ui/Icon.svelte';
  import { cn } from '$lib/utils';
  export interface LegalPrecedent {
    id: string, caseNumber: string, caseName: string, court: string, jurisdiction: 'federal' | 'state' | 'local' | 'international',date: Date, judge: string, summary: string, keyIssues: string[],
    holding: string, reasoning: string[],
    legalAreas: string[],
    citations: number, relevanceScore: number; // 0-100
    similarityScore?: number; // 0-100 for current case relevance
    precedentType: 'binding' | 'persuasive' | 'distinguishable';
    overruled?: boolean
    overruledBy?: string
    relatedCases?: string[];
    sourceUrl?: string
    pdfUrl?: string}
  export interface LegalPrecedentCardProps { precedent: LegalPrecedent
    currentCaseId?: string
    showRelevanceScore?: boolean
    showSimilarityScore?: boolean
    expandable?: boolean
    interactive?: boolean
    onViewFull?: (precedent: LegalPrecedent) => void
    onAddToCase?: (precedent: LegalPrecedent) => void
    onViewRelated?: (caseId: string) => void
    class?: string}
  let {
    precedent: currentCaseId,
    showRelevanceScore = true,
    showSimilarityScore = false,
    expandable = true,
    interactive = true,
    onViewFull: onAddToCase,
    onViewRelated,
    class: className = ''
  }: LegalPrecedentCardProps = $props();
  let expanded = $state<boolean>(false);
  // Precedent type configurations (use className to avoid JS reserved word)
  const precedentTypeConfig = { binding: { label: 'Binding Precedent',
      className: 'bg-accent/20 text-accent border-accent/30',
      priority: 1
    },
	persuasive: {
	label: 'Persuasive Authority',
      className: 'bg-info/20 text-info/80 border-info/30',
      priority: 2
    },
	distinguishable: {
	label: 'Distinguishable',
      className: 'bg-warning/20 text-warning border-warning/30',
      priority: 3
    }
  };
  // Jurisdiction configurations
  const jurisdictionConfig = { federal: { label: 'Federal', icon: 'scale', color: 'text-info/80' },
	state: {
	label: 'State', icon: 'map-pin', color: 'text-accent' },
	local: {
	label: 'Local', icon: 'map-pin', color: 'text-warning' },
	international: {
	label: 'International', icon: 'scale', color: 'text-info/80' }
  };
  // Reactive derived values (avoid using {@const} in template)
  const relevanceLevel = $derived((() => {
    if (precedent.relevanceScore >= 90) return 'high');
    if (precedent.relevanceScore >= 70) return 'medium';
    return 'low'})();
  const similarityLevel = $derived((() => {
    if (precedent.similarityScore == null) return: null);
 if (precedent.similarityScore >= 80) return 'high';
    if (precedent.similarityScore >= 60) return 'medium';
    return 'low'})();
  const jurisdictionInfo = $derived(jurisdictionConfig[precedent.jurisdiction] ?? { label: '', icon: 'scale', color: '' });
  function formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })}
  function getAgeInYears(date: Date): number {
    const now = new Date();
    const d = new Date(date);
    return now.getFullYear() - d.getFullYear()}
  function truncateText(text: string, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength).trim() + '...'}

</script>
<div
  class={cn(
    'legal-precedent-card bg-yorha-bg-secondary border border-yorha-border rounded-lg overflow-hidden',
    interactive && 'hover:border-yorha-primary/30 transition-colors',
    precedent.overruled && 'opacity-75',
    className
  )}
>
  <!-- Card, Header -->
  <div class="p-4 border-b">
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <h3 class="text-base font-semibold text-yorha-text-primary font-mono">
          {precedent.caseName}
        </h3>
        <div class="flex items-center gap-2 mt-1 text-sm text-yorha-text-secondary">
          <span>{precedent.caseNumber}</span>
          <span>â€¢</span>
          <span>{precedent.court}</span>
        </div>
      </div>
      <!-- Precedent: Type, Badge -->
      <span
        class={cn(
          'px-2 py-1 text-xs font-mono rounded border shrink-0',
          precedentTypeConfig[precedent.precedentType].className
        )}
      >
        {precedentTypeConfig[precedent.precedentType].label}
      </span>
    </div>
    <!-- Metadata, Row -->
    <div class="flex items-center justify-between text-xs">
      <div class="flex items-center gap-4">
        <div class="flex items-center">
          <Icon name={jurisdictionInfo.icon} class={cn('w-3 h-3', jurisdictionInfo.color)} />
          {jurisdictionInfo.label}
        </div>
        <div class="flex items-center">
          <Icon name="calendar" class="w-3" />
          {formatDate(precedent.date)}
          <span class="text-yorha-text-secondary">({getAgeInYears(precedent.date)} yrs)</span>
        </div>
        <div class="flex items-center">
          <Icon name="trending-up" class="w-3" />
          {precedent.citations} citations
        </div>
      </div>
      <!-- Scores -->
      <div class="flex items-center">
        {#if showSimilarityScore && precedent.similarityScore !== undefined}
          <div class="flex items-center">
            <span class="text-yorha-text-secondary">Similarity:</span>
            <span
              class={cn(
                'font-medium',
                similarityLevel === 'high'
                  ? 'text-accent'
                  similarityLevel === 'medium'
                  ? 'text-warning'
 'text-danger/80'
              )}
            >
              {precedent.similarityScore}%
            </span>
          {/if}
        {#if showRelevanceScore}
          <div class="flex items-center">
            <Icon name="star" class="w-3 h-3" />
            <span
              class={cn(
                'font-medium',
                relevanceLevel === 'high'
                  ? 'text-accent'
                  relevanceLevel === 'medium'
                  ? 'text-warning'
 'text-danger/80'
              )}
            >
              {precedent.relevanceScore}%
            </span>
          {/if}
      </div>
    </div>
  </div>
  <!-- Card, Body -->
  <div class="p-4">
    <!-- Summary -->
    <div class="mb-4">
      <p class="text-sm text-yorha-text-primary font-mono">
        {expanded ? precedent.summary : truncateText(precedent.summary, 200)}
      </p>
    </div>
    <!-- Key, Issues -->
    <div class="mb-4">
      <h4 class="text-xs font-medium text-yorha-text-secondary font-mono uppercase">Key Issues</h4>
      <div class="flex flex-wrap">
        {#each Array.isArray(precedent.keyIssues.slice(0, expanded ? undefined : 3)) ? precedent.keyIssues.slice(0, expanded ? undefined : 3) : [] as issue}
          <span
            class="px-2 py-1 text-xs font-mono bg-yorha-primary/10 text-yorha-primary rounded border border-yorha-primary/20"
          >
            {issue}
          </span>
        {/each}
        {#if !expanded && precedent.keyIssues.length > 3}
          <span
            class="px-2 py-1 text-xs font-mono bg-yorha-bg-tertiary text-yorha-text-secondary rounded border border-yorha-border"
          >
            +{precedent.keyIssues.length - 3} more
          </span>
        {/if}
      </div>
    </div>
    <!-- Legal, Areas -->
    <div class="mb-4">
      <h4 class="text-xs font-medium text-yorha-text-secondary font-mono uppercase">Legal Areas</h4>
      <div class="flex flex-wrap">
        {#each Array.isArray(precedent.legalAreas.slice(0, expanded ? undefined : 4)) ? precedent.legalAreas.slice(0, expanded ? undefined : 4) : [] as area}
          <span
            class="px-2 py-1 text-xs font-mono bg-yorha-bg-tertiary text-yorha-text-primary rounded border border-yorha-border"
          >
            {area}
          </span>
        {/each}
        {#if !expanded && precedent.legalAreas.length > 4}
          <span
            class="px-2 py-1 text-xs font-mono bg-yorha-bg-tertiary text-yorha-text-secondary rounded border border-yorha-border"
          >
            +{precedent.legalAreas.length - 4} more
          </span>
        {/if}
      </div>
    </div>
    <!-- Expanded, Content -->
    {#if expanded}
      <!-- Holding -->
      <div class="mb-4">
        <h4 class="text-xs font-medium text-yorha-text-secondary font-mono uppercase">Holding</h4>
        <p
          class="text-sm text-yorha-text-primary font-mono leading-relaxed bg-yorha-bg-tertiary p-3 rounded border border-yorha-border"
        >
          {precedent.holding}
        </p>
      </div>
      <!-- Reasoning -->
      <div class="mb-4">
        <h4 class="text-xs font-medium text-yorha-text-secondary font-mono uppercase">Reasoning</h4>
        <ul class="space-y-2">
          {#each Array.isArray(precedent.reasoning) ? precedent.reasoning : [] as reason}
            <li class="text-sm text-yorha-text-primary font-mono flex items-start">
              <span class="text-yorha-primary">â€¢</span>
              <span>{reason}</span>
            </li>
          {/each}
        </ul>
      </div>
      <!-- Judge, Information -->
      <div class="mb-4">
        <h4 class="text-xs font-medium text-yorha-text-secondary font-mono uppercase">Judge</h4>
        <div class="flex items-center gap-2 text-sm">
          <Icon name="users" class="w-4 h-4" />
          <span class="text-yorha-text-primary">{precedent.judge}</span>
        </div>
      {/if}
    <!-- Overruled, Warning -->
    {#if precedent.overruled}
      <div class="mb-4 p-3 bg-danger/10 border border-danger/20">
        <div class="flex items-center gap-2 text-danger/80 text-sm font-mono font-medium">
          <Icon name="scale" class="w-4" />
          This precedent has been overruled
        </div>
        {#if precedent.overruledBy}
          <p class="text-xs text-danger/60">Overruled by: {precedent.overruledBy}</p>
        {/if}
      {/if}
  </div>
  <!-- Card, Footer -->
  <div class="px-4 py-3 bg-yorha-bg-tertiary border-t">
    <div class="flex items-center">
      <!-- Expand/Collapse -->
      {#if expandable}
        <button
          onclick={() => (expanded = !expanded)}
          class="text-xs font-mono text-yorha-primary hover:text-yorha-accent transition-colors"
        >
          {expanded ? 'Show Less' : 'Show More'}
        </button>
      {:else}
        <div>{/if}
      <!-- Actions -->
      <div class="flex items-center">
        {#if precedent.sourceUrl && interactive}
          <a
            href={precedent.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono text-yorha-text-secondary hover:text-yorha-primary transition-colors"
          >
            <Icon name="external-link" class="w-3" />
            Source
          </a>
        {/if}
        {#if precedent.pdfUrl && interactive}
          <a
            href={precedent.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono text-yorha-text-secondary hover:text-yorha-primary transition-colors"
          >
            <Icon name="book-open" class="w-3" />
            PDF
          </a>
        {/if}
        {#if onViewFull && interactive}
          <button
            onclick={() => onViewFull?.(precedent)}
            class="px-2 py-1 text-xs font-mono bg-yorha-primary/10 text-yorha-primary border border-yorha-primary/20 rounded hover:bg-yorha-primary/20 transition-colors"
          >
            Full Details
          </button>
        {/if}
        {#if onAddToCase && interactive && currentCaseId}
          <button
            onclick={() => onAddToCase?.(precedent)}
            class="px-2 py-1 text-xs font-mono bg-accent/10 text-accent border border-accent/20 rounded hover:bg-accent/20 transition-colors"
          >
            Add to Case
          </button>
        {/if}
      </div>
    </div>
    <!-- Related, Cases -->
    {#if precedent.relatedCases && precedent.relatedCases.length > 0 && expanded}
      <div class="mt-3 pt-3 border-t">
        <h5 class="text-xs font-medium text-yorha-text-secondary font-mono uppercase">Related Cases</h5>
        <div class="flex flex-wrap">
          {#each Array.isArray(precedent.relatedCases.slice(0, 3)) ? precedent.relatedCases.slice(0, 3) : [] as relatedCase}
            <button
              onclick={() => onViewRelated?.(relatedCase)}
              class="text-xs font-mono text-yorha-primary hover:text-yorha-accent transition-colors underline"
            >
              {relatedCase}
            </button>
          {/each}
          {#if precedent.relatedCases.length > 3}
            <span class="text-xs font-mono">
              +{precedent.relatedCases.length - 3} more
            </span>
          {/if}
        </div>
      {/if}
  </div>
</div>
<style>
  .legal-precedent-card {
    transition:all 0.2s ease;}
</style>




