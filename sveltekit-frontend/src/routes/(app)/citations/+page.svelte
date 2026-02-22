<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/card/Card.svelte';
  import CardContent from '$lib/components/ui/card/CardContent.svelte';
  import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
  import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
  import CitationManager from '$lib/components/legal/CitationManager.svelte';
  import CitationDetail from '$lib/components/legal-ai/CitationDetail.svelte';
  import StatuteActionPanel from '$lib/components/legal/StatuteActionPanel.svelte';
  import SearchBox from '$lib/components/SearchBox.svelte';

  let viewMode = $state<'list' | 'manager'>('list');
  let showGpuSearch = $state(false);
  let selectedCitation = $state<any>(null);

  interface Citation {
    id: string;
    citationType: string;
    formattedCitation: string;
    quotedText: string;
    legalPrinciple: string;
    relevanceScore: number;
    isKeyAuthority: boolean;
    documentTitle?: string;
    caseTitle?: string;
  }

  let citations = $state<Citation[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let citationType = $state('all');

  const citationTypes = ['all', 'statute', 'case_law', 'regulation', 'rule', 'executive_order', 'treaty'];

  let filteredCitations = $derived.by(() => {
    let result = citations;
    if (citationType !== 'all') {
      result = result.filter(c => c.citationType === citationType);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.formattedCitation.toLowerCase().includes(q) ||
        c.legalPrinciple?.toLowerCase().includes(q) ||
        c.documentTitle?.toLowerCase().includes(q)
      );
    }
    return result;
  });

  $effect(() => {
    loadCitations();
  });

  async function loadCitations() {
    try {
      loading = true;
      error = null;
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      if (citationType !== 'all') params.set('citationType', citationType);
      const response = await fetch(`/api/citations?${params}`);
      if (response.ok) {
        const data = await response.json();
        citations = data.citations ?? [];
      } else {
        error = 'Failed to load citations';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load citations';
    } finally {
      loading = false;
    }
  }
</script>

<div class="max-w-6xl mx-auto px-4 py-8">
  <header class="mb-8 text-center">
    <h1 class="text-3xl font-bold text-sand mb-2">Citation Library</h1>
    <p class="text-sand/60 text-sm">Browse and search legal citations across all cases</p>
    <div class="flex justify-center gap-2 mt-4">
      <Button onclick={() => viewMode = 'list'}>List View</Button>
      <Button onclick={() => viewMode = 'manager'}>Citation Manager</Button>
      <Button onclick={() => (showGpuSearch = !showGpuSearch)}>{showGpuSearch ? 'Hide GPU Search' : 'GPU Search'}</Button>
    </div>
  </header>

  {#if showGpuSearch}
    <div class="mb-6">
      <SearchBox
        placeholder="GPU-powered legal citation search..."
        limit={10}
        onResults={(data) => {
          const mapped = (data.results ?? []).map((r: any) => ({
            id: r.id ?? r.task_id ?? crypto.randomUUID(),
            citationType: r.metadata?.type ?? 'case_law',
            formattedCitation: r.payload?.slice(0, 120) ?? r.id ?? '',
            quotedText: r.payload ?? '',
            legalPrinciple: r.metadata?.principle ?? '',
            relevanceScore: typeof r.score === 'number' ? 1 - r.score : 0,
            isKeyAuthority: false,
            documentTitle: r.metadata?.document ?? '',
            caseTitle: r.metadata?.case ?? ''
          }));
          if (mapped.length > 0) {
            citations = mapped;
          }
        }}
      />
    </div>
  {/if}

  {#if viewMode === 'manager'}
    <CitationManager />
  {:else}

  <Card class="mb-6 bg-panel border-black/40">
    <CardContent class="p-4">
      <div class="flex gap-3 items-center flex-wrap">
        <input
          type="text"
          placeholder="Search citations..."
          bind:value={searchQuery}
          oninput={() => loadCitations()}
          class="flex-1 min-w-48 px-3 py-2 bg-black/30 border border-sand/20 rounded text-sand text-sm placeholder:text-sand/40 focus:border-accent focus:outline-none"
        />
        <select
          bind:value={citationType}
          onchange={() => loadCitations()}
          class="px-3 py-2 bg-black/30 border border-sand/20 rounded text-sand text-sm"
        >
          {#each citationTypes as type}
            <option value={type}>{type === 'all' ? 'All Types' : type.replace('_', ' ')}</option>
          {/each}
        </select>
        <span class="text-sand/50 text-xs">{filteredCitations.length} results</span>
      </div>
    </CardContent>
  </Card>

  {#if loading}
    <div class="text-center py-16 text-sand/50">Loading citations...</div>
  {:else if error}
    <Card class="bg-panel border-danger/40">
      <CardContent class="p-6 text-center">
        <p class="text-danger mb-4">{error}</p>
        <Button onclick={() => loadCitations()}>Retry</Button>
      </CardContent>
    </Card>
  {:else if filteredCitations.length === 0}
    <Card class="bg-panel border-sand/20">
      <CardContent class="p-12 text-center">
        <p class="text-sand/50 text-lg mb-2">No citations found</p>
        <p class="text-sand/30 text-sm">Try adjusting your search or filter criteria</p>
      </CardContent>
    </Card>
  {:else}
    <div class="grid gap-4">
      {#each filteredCitations as citation (citation.id)}
        <Card class="bg-panel border-sand/10 hover:border-accent/30 transition-colors cursor-pointer" onclick={() => (selectedCitation = selectedCitation?.id === citation.id ? null : { id: citation.id, statute_code: citation.formattedCitation, statute_title: citation.legalPrinciple, jurisdiction: citation.documentTitle, severity: citation.citationType, source_type: 'auto_extracted' as const, highlighted_text: citation.quotedText, notes: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })}>
          <CardHeader class="pb-2">
            <div class="flex items-start justify-between gap-4">
              <CardTitle class="text-sm font-mono text-accent">{citation.formattedCitation}</CardTitle>
              <div class="flex items-center gap-2 shrink-0">
                <span class="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-mono bg-sand/10 text-sand/70">
                  {citation.citationType.replace('_', ' ')}
                </span>
                {#if citation.isKeyAuthority}
                  <span class="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-mono bg-accent/20 text-accent">
                    Key Authority
                  </span>
                {/if}
              </div>
            </div>
          </CardHeader>
          <CardContent class="pt-0">
            {#if citation.legalPrinciple}
              <p class="text-sand/80 text-sm mb-2">{citation.legalPrinciple}</p>
            {/if}
            {#if citation.quotedText}
              <blockquote class="border-l-2 border-accent/30 pl-3 text-sand/60 text-xs italic">
                "{citation.quotedText}"
              </blockquote>
            {/if}
            <div class="flex items-center gap-4 mt-3 text-xs text-sand/40">
              {#if citation.caseTitle}
                <span>Case: {citation.caseTitle}</span>
              {/if}
              {#if citation.documentTitle}
                <span>Doc: {citation.documentTitle}</span>
              {/if}
              <span>Relevance: {Math.round(citation.relevanceScore * 100)}%</span>
            </div>
          </CardContent>
        </Card>
      {/each}
    </div>

    {#if selectedCitation}
      <div class="mt-6">
        <CitationDetail
          citation={selectedCitation}
          onupdated={() => { selectedCitation = null; loadCitations(); }}
          ondelete={() => { selectedCitation = null; loadCitations(); }}
          onattachtocase={(c) => { console.log('Attach to case:', c); }}
        />
        <StatuteActionPanel
          statute={{
            titleNumber: 0,
            section: selectedCitation.statute_code ?? '',
            id: selectedCitation.id,
            fullCitation: selectedCitation.statute_code ?? '',
            text: selectedCitation.highlighted_text ?? '',
            heading: selectedCitation.statute_title ?? ''
          }}
        />
      </div>
    {/if}
  {/if}
  {/if}
</div>
