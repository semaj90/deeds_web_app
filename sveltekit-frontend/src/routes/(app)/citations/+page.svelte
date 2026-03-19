<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { goto } from '$app/navigation';
  import { analytics } from '$lib/stores/analytics.svelte';
  import DropdownMenu from '$lib/components/ui/DropdownMenu.svelte';
  import { citationCache } from '$lib/ai/citation-cache.js';
  import Card from '$lib/components/ui/card/Card.svelte';
  import CardContent from '$lib/components/ui/card/CardContent.svelte';
  import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
  import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import CitationManager from '$lib/components/legal/CitationManager.svelte';
  import CitationDetail from '$lib/components/legal-ai/CitationDetail.svelte';
  import StatuteActionPanel from '$lib/components/legal/StatuteActionPanel.svelte';
  import RelatedCasesPanel from '$lib/components/legal-ai/RelatedCasesPanel.svelte';
  import StatuteDetail from '$lib/components/legal-ai/StatuteDetail.svelte';
  import SearchBox from '$lib/components/SearchBox.svelte';
  import CitationLink from '$lib/components/CitationLink.svelte';
  import CitationSaveForm from '$lib/components/citations/CitationSaveForm.svelte';
  import CitationSearch from '$lib/components/legal-ai/CitationSearch.svelte';
  import CitationCollections from '$lib/components/citations/CitationCollections.svelte';
  import CitationList from '$lib/components/citations/CitationList.svelte';
  import CitationInspector from '$lib/components/source-validation/CitationInspector.svelte';
  import AttachToCaseModal from '$lib/components/legal-ai/AttachToCaseModal.svelte';
  import CollectionDetail from '$lib/components/legal-ai/CollectionDetail.svelte';
  import CitationLibraryPage from '$lib/components/legal-ai/CitationLibraryPage.svelte';
  import LinkMetadataForm from '$lib/components/legal-ai/LinkMetadataForm.svelte';
  import LegalPrecedentCard from '$lib/components/legal/LegalPrecedentCard.svelte';
  import CitationsSaveButton from '$lib/components/citations/CitationsSaveButton.svelte';
  import CitationViewModal from '$lib/components/citations/CitationViewModal.svelte';

  // Quick View modal state
  let quickViewCitation = $state<any>(null);
  let showQuickView = $state(false);

  let viewMode = $state<'list' | 'manager'>('list');
  let showGpuSearch = $state(false);
  let showSaveForm = $state(false);
  let showAdvancedSearch = $state(false);
  let showCollections = $state(false);
  let showCitationBrowser = $state(false);
  let showCitationInspector = $state(false);
  let inspectorCitation = $state<any>({ source_file: '', content: '', metadata: {}, confidence_score: 0 });
  let selectedCitation = $state<any>(null);
  let showAttachModal = $state(false);
  let attachStatuteCode = $state<string | null>(null);
  let attachCitationId = $state<string | null>(null);
  let selectedCollection = $state<any>(null);
  let showLibraryPage = $state(false);
  let showLinkEditor = $state(false);
  let editingLink = $state<any>(null);
  let showKnowledgeBase = $state(false);
  let kbQuery = $state('');
  let kbSearching = $state(false);

  async function exportCitations(format: 'json' | 'pdf') {
    try {
      const res = await fetch(`/api/citations/export/${format}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `citations-export.${format === 'pdf' ? 'txt' : format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`Failed to export citations as ${format}:`, err);
    }
  }

  // Citation tags
  let citationTagsMap = $state<Record<string, { tag: string; color: string }[]>>({});
  let addingTagFor = $state<string | null>(null);
  let newTagInput = $state('');
  const TAG_PRESETS = [
    { tag: 'key authority', color: '#eab308' },
    { tag: 'supporting', color: '#22c55e' },
    { tag: 'opposing', color: '#ef4444' },
    { tag: 'distinguished', color: '#a855f7' },
    { tag: 'overruled', color: '#dc2626' },
    { tag: 'cited', color: '#3b82f6' },
  ];

  async function loadTagsForCitation(citationId: string) {
    try {
      const res = await fetch(`/api/citations/${citationId}/tags`);
      if (res.ok) {
        const data = await res.json();
        citationTagsMap[citationId] = data.tags ?? [];
      }
    } catch { /* ignore */ }
  }

  async function addTagToCitation(citationId: string, tag: string, color: string) {
    try {
      await fetch(`/api/citations/${citationId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, color }),
      });
      await loadTagsForCitation(citationId);
    } catch { /* ignore */ }
    newTagInput = '';
    addingTagFor = null;
  }

  async function removeTagFromCitation(citationId: string, tag: string) {
    try {
      await fetch(`/api/citations/${citationId}/tags`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag }),
      });
      citationTagsMap[citationId] = (citationTagsMap[citationId] ?? []).filter(t => t.tag !== tag);
    } catch { /* ignore */ }
  }

  let kbResults = $state<{ glossary: any[]; statutes: any[]; precedents: any[] }>({ glossary: [], statutes: [], precedents: [] });
  let kbTiming = $state<Record<string, number>>({});
  let kbDebounceTimer = $state<ReturnType<typeof setTimeout> | null>(null);

  function searchKnowledgeBase(query: string) {
    if (query.length < 2) {
      kbResults = { glossary: [], statutes: [], precedents: [] };
      return;
    }
    kbSearching = true;
    const body = JSON.stringify({ query, limit: 10 });
    const headers = { 'Content-Type': 'application/json' };
    const start = performance.now();

    Promise.all([
      fetch('/api/glossary/search', { method: 'POST', headers, body }).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] })),
      fetch('/api/statutes/search', { method: 'POST', headers, body }).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] })),
      fetch('/api/precedents/search', { method: 'POST', headers, body }).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] })),
    ]).then(([g, s, p]) => {
      kbResults = {
        glossary: g.results ?? [],
        statutes: s.results ?? [],
        precedents: p.results ?? [],
      };
      kbTiming = { totalMs: Math.round(performance.now() - start) };
    }).finally(() => {
      kbSearching = false;
    });
  }

  // Collection quick-add
  let userCollections = $state<{ id: string; name: string; color: string }[]>([]);
  let collectionsLoaded = $state(false);
  let addingToCollectionFor = $state<string | null>(null);

  async function loadUserCollections() {
    if (collectionsLoaded) return;
    try {
      const res = await fetch('/api/citations/collections');
      if (res.ok) {
        userCollections = await res.json();
        collectionsLoaded = true;
      }
    } catch { /* ignore */ }
  }

  async function addToCollection(collectionId: string, citationId: string) {
    try {
      await fetch(`/api/citations/collections/${collectionId}/citations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citationId })
      });
    } catch { /* ignore */ }
    addingToCollectionFor = null;
  }

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
    // Source trust fields (from DB)
    sourceUrl?: string;
    jurisdiction?: string;
    effectiveDate?: string;
    amendedDate?: string;
    createdAt?: string;
  }

  // Corpus / jurisdiction navigation
  const CORPUS_TABS = [
    { id: 'all',             label: 'All Sources',   icon: 'layers' },
    { id: 'statute',         label: 'Statutes',      icon: 'scroll-text' },
    { id: 'case_law',        label: 'Case Law',      icon: 'gavel' },
    { id: 'regulation',      label: 'Regulations',   icon: 'shield-check' },
    { id: 'executive_order', label: 'Exec. Orders',  icon: 'stamp' },
    { id: 'treaty',          label: 'Treaties',      icon: 'globe' },
    { id: 'glossary',        label: 'Glossary', special: true, icon: 'book-open' },
  ] as const;

  function setCorpusFilter(id: string) {
    if (id === 'glossary') {
      showKnowledgeBase = true;
      citationType = 'all';
    } else {
      showKnowledgeBase = false;
      citationType = id;
    }
  }

  function inferJurisdiction(code: string): string {
    if (!code) return '';
    if (/^\d+\s+U\.?S\.?C/i.test(code))         return 'Federal';
    if (/\bCFR\b/i.test(code))                   return 'Fed. Reg.';
    if (/\bPub\.?\s*L\.?/i.test(code))          return 'Federal';
    if (/\bF\.\s*(?:2d|3d|4th|Supp)/i.test(code)) return 'Federal';
    if (/\b(?:Cal\.|CA)\b/i.test(code))          return 'CA';
    if (/\b(?:N\.?Y\.?|New York)\b/i.test(code)) return 'NY';
    if (/\b(?:Tex\.|TX)\b/i.test(code))          return 'TX';
    if (/\b(?:Fla\.|FL)\b/i.test(code))          return 'FL';
    return '';
  }

  function formatCitationDate(iso?: string): string {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return ''; }
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
    if (searchQuery && !cachedSearchActive) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.formattedCitation.toLowerCase().includes(q) ||
        c.legalPrinciple?.toLowerCase().includes(q) ||
        c.documentTitle?.toLowerCase().includes(q)
      );
    }
    return result;
  });

  // Cache-enhanced search state
  let cachedSearchActive = $state(false);
  let cachedSearchResults = $state<any[]>([]);
  let searchDebounce: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    loadCitations();
  });

  // Debounced fuzzy + RAG search via citation cache
  $effect(() => {
    const q = searchQuery;
    if (searchDebounce) clearTimeout(searchDebounce);

    if (!q || q.length < 2) {
      cachedSearchActive = false;
      cachedSearchResults = [];
      return;
    }

    searchDebounce = setTimeout(async () => {
      try {
        const results = await citationCache.searchCitations(q, { limit: 20, ragFallback: true });
        if (results.length > 0) {
          cachedSearchResults = results;
          cachedSearchActive = true;
        }
      } catch { /* fallback to server filter */ }
    }, 300);
  });

  async function loadCitations() {
    if (searchQuery) analytics.track('rag_search', { query: searchQuery.slice(0, 200), source: 'citations' });
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
        // Backfill local cache with server results
        for (const c of citations) {
          citationCache.saveCitationLocal({
            id: c.id,
            statuteCode: c.formattedCitation ?? '',
            statuteTitle: c.documentTitle ?? c.caseTitle,
            highlightedText: c.quotedText,
            notes: c.legalPrinciple,
            createdAt: new Date().toISOString()
          }).catch(() => {});
        }
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

<div class="citations-page">
  <header class="cit-header">
    <div class="cit-header-left">
      <div class="cit-header-icon">
        <Icon name="scale" />
      </div>
      <div>
        <h1 class="cit-title">Legal Corpus</h1>
        <p class="cit-subtitle">Statutes · Case Law · Regulations · Treaties · Glossary</p>
      </div>
    </div>
    <div class="cit-header-right">
      <span class="cit-meta-line">Sources: GovInfo · Cornell LII · Open States</span>
      <span class="cit-meta-line">Embeddings: pgvector + Qdrant 768-dim</span>
    </div>
  </header>

  <!-- Stats Row -->
  <div class="cit-stats-row">
    <span class="cit-stat">
      <Icon name="archive" />
      <strong>{filteredCitations.length}</strong>
      <span>Results</span>
    </span>
    <span class="cit-stat-divider"></span>
    <span class="cit-stat">
      <Icon name="layers" />
      <strong>{citations.length}</strong>
      <span>Total</span>
    </span>
    {#if cachedSearchActive}
      <span class="cit-stat-divider"></span>
      <span class="cit-stat cached">
        <Icon name="zap" />
        <strong>{cachedSearchResults.length}</strong>
        <span>Cache hits</span>
      </span>
    {/if}
  </div>

  <!-- Action Bar -->
  <div class="cit-action-bar">
    <div class="cit-actions-left">
      <button class="cit-btn" class:active={viewMode === 'list'} onclick={() => viewMode = 'list'}>
        <Icon name="list" />
        List
      </button>
      <button class="cit-btn" class:active={viewMode === 'manager'} onclick={() => viewMode = 'manager'}>
        <Icon name="columns" />
        Manager
      </button>
      <a href="/citations/law" class="cit-btn">
        <Icon name="book-open" />
        Law Pages
      </a>
    </div>
    <div class="cit-actions-right">
      <button class="cit-btn primary" onclick={() => (showSaveForm = !showSaveForm)}>
        <Icon name="plus" />
        {showSaveForm ? 'Hide Form' : 'Save Citation'}
      </button>
      <DropdownMenu
        trigger="More Tools"
        items={[
          { label: 'GPU Search', onClick: () => { showGpuSearch = !showGpuSearch; } },
          { label: 'Advanced Search', onClick: () => { showAdvancedSearch = !showAdvancedSearch; } },
          { separator: true, label: '' },
          { label: 'Law Citation Pages', onClick: () => { goto('/citations/law'); } },
          { label: 'Collections', onClick: () => { showCollections = !showCollections; } },
          { label: 'Citation Browser', onClick: () => { showCitationBrowser = !showCitationBrowser; } },
          { label: 'Citation Library', onClick: () => { showLibraryPage = !showLibraryPage; } },
          { separator: true, label: '' },
          { label: 'Knowledge Base', onClick: () => { showKnowledgeBase = !showKnowledgeBase; } },
          { separator: true, label: '' },
          { label: 'Export JSON', onClick: () => { exportCitations('json'); } },
          { label: 'Export PDF', onClick: () => { exportCitations('pdf'); } },
        ]}
      />
    </div>
  </div>

  <div class="cit-body">

  <!-- Advanced Citation Search -->
  {#if showAdvancedSearch}
    <div class="mb-6">
      <CitationSearch
        placeholder="Search by statute code, title, or keyword..."
        onselect={(c) => {
          selectedCitation = { id: c.id, statute_code: c.statute_code, statute_title: c.statute_title, jurisdiction: c.jurisdiction, severity: c.severity, source_type: c.source_type, highlighted_text: c.notes ?? '', notes: c.notes ?? '', created_at: c.created_at, updated_at: c.created_at };
          showAdvancedSearch = false;
        }}
      />
    </div>
  {/if}

  <!-- Save New Citation -->
  {#if showSaveForm}
    <div class="mb-6">
      <CitationSaveForm
        onsaved={() => { showSaveForm = false; loadCitations(); }}
      />
    </div>
  {/if}

  <!-- Citation Library Page — Full collection management -->
  {#if showLibraryPage}
    <div class="mb-6">
      <CitationLibraryPage />
    </div>
  {/if}

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

  {#if showCollections}
    <div class="mb-6">
      <CitationCollections
        onSelectCollection={(collection) => {
          selectedCollection = collection;
          showCollections = false;
        }}
      />
    </div>
  {/if}

  <!-- Knowledge Base Search (Glossary + Statutes + Precedents) -->
  {#if showKnowledgeBase}
    <div class="mb-6">
      <Card class="bg-panel border-accent/30">
        <CardHeader>
          <CardTitle class="text-sm text-accent">Knowledge Base Search</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={kbQuery}
              placeholder="Search glossary, statutes, and precedents..."
              oninput={() => {
                if (kbDebounceTimer) clearTimeout(kbDebounceTimer);
                kbDebounceTimer = setTimeout(() => searchKnowledgeBase(kbQuery), 400);
              }}
              class="flex-1 px-3 py-2 bg-black/30 border border-sand/20 rounded text-sand text-sm placeholder:text-sand/40 focus:border-accent focus:outline-none"
            />
            {#if kbSearching}
              <span class="text-xs text-accent self-center">Searching...</span>
            {:else if kbTiming.totalMs}
              <span class="text-xs text-sand/40 self-center">{kbTiming.totalMs}ms</span>
            {/if}
          </div>

          {#if kbResults.glossary.length > 0}
            <div>
              <h4 class="text-xs font-semibold text-sand/60 uppercase tracking-wider mb-2">Glossary ({kbResults.glossary.length})</h4>
              <div class="space-y-2">
                {#each kbResults.glossary as term (term.id ?? term.term)}
                  <div class="p-3 bg-black/20 rounded border border-sand/10">
                    <div class="flex items-baseline gap-2">
                      <span class="font-medium text-accent text-sm">{term.term}</span>
                      {#if term.category}
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-sand/10 text-sand/50">{term.category}</span>
                      {/if}
                      <span class="text-[10px] text-sand/30 ml-auto">{Math.round((term.similarity ?? 0) * 100)}%</span>
                    </div>
                    <p class="text-xs text-sand/70 mt-1 line-clamp-2">{term.definition}</p>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if kbResults.statutes.length > 0}
            <div>
              <h4 class="text-xs font-semibold text-sand/60 uppercase tracking-wider mb-2">Statutes ({kbResults.statutes.length})</h4>
              <div class="space-y-2">
                {#each kbResults.statutes as statute (statute.chunkId ?? statute.statuteId)}
                  <div
                    class="p-3 bg-black/20 rounded border border-sand/10 hover:border-accent/30 transition group"
                  >
                    <div class="flex items-baseline gap-2">
                      <span class="font-medium text-sand text-sm">{statute.statuteTitle}</span>
                      {#if statute.section}
                        <span class="text-[10px] font-mono text-accent/70">{statute.section}</span>
                      {/if}
                      <span class="text-[10px] text-sand/30 ml-auto">{Math.round((statute.similarity ?? 0) * 100)}%</span>
                    </div>
                    {#if statute.jurisdiction}
                      <span class="text-[10px] text-sand/40">{statute.jurisdiction}</span>
                    {/if}
                    <p class="text-xs text-sand/70 mt-1 line-clamp-2">{statute.content}</p>
                    <div class="mt-2 flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        class="text-[10px] text-accent hover:bg-accent/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        onclick={() => goto(`/library/${statute.docId}/node/${statute.statuteId}`)}
                      >
                        View Full Statute →
                      </Button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if kbResults.precedents.length > 0}
            <div>
              <h4 class="text-xs font-semibold text-sand/60 uppercase tracking-wider mb-2">Precedents ({kbResults.precedents.length})</h4>
              <div class="space-y-3">
                {#each kbResults.precedents as prec (prec.id ?? prec.title)}
                  {@const precedentData = {
                    id: prec.id ?? crypto.randomUUID(),
                    caseNumber: prec.citation ?? '',
                    caseName: prec.title ?? 'Unknown',
                    court: prec.court ?? '',
                    jurisdiction: (prec.jurisdiction === 'federal' || prec.jurisdiction === 'state' || prec.jurisdiction === 'local' || prec.jurisdiction === 'international') ? prec.jurisdiction : 'federal',
                    date: prec.decisionDate ? new Date(prec.decisionDate) : new Date(),
                    judge: prec.judge ?? '',
                    summary: prec.summary ?? '',
                    keyIssues: prec.keyIssues ?? [],
                    holding: prec.holding ?? '',
                    reasoning: prec.reasoning ?? [],
                    legalAreas: prec.legalAreas ?? [],
                    citations: prec.citationCount ?? 0,
                    relevanceScore: Math.round((prec.similarity ?? 0) * 100),
                    precedentType: 'persuasive' as const
                  }}
                  <LegalPrecedentCard
                    precedent={precedentData}
                    showRelevanceScore={true}
                    expandable={true}
                    interactive={true}
                    onViewFull={(p) => {
                      selectedCitation = {
                        id: p.id,
                        statute_code: p.caseNumber || p.caseName,
                        statute_title: p.caseName,
                        jurisdiction: p.court,
                        severity: 'case_law',
                        source_type: 'auto_extracted' as const,
                        highlighted_text: p.summary,
                        notes: '',
                        created_at: p.date.toISOString(),
                        updated_at: new Date().toISOString(),
                      };
                    }}
                  />
                {/each}
              </div>
            </div>
          {/if}

          {#if !kbSearching && kbQuery.length >= 2 && kbResults.glossary.length === 0 && kbResults.statutes.length === 0 && kbResults.precedents.length === 0}
            <p class="text-sand/40 text-sm text-center py-4">No results found for "{kbQuery}"</p>
          {/if}
        </CardContent>
      </Card>
    </div>
  {/if}

  <!-- Citation Browser (API-backed paginated list) -->
  {#if showCitationBrowser}
    <div class="mb-6">
      <CitationList
        searchQuery={searchQuery}
        sourceTypeFilter={citationType !== 'all' ? citationType : ''}
        limit={20}
      />
    </div>
  {/if}

  {#if viewMode === 'manager'}
    <CitationManager />
  {:else}

  <!-- Corpus / jurisdiction navigation strip -->
  <div class="cit-corpus-tabs">
    {#each CORPUS_TABS as tab}
      <button
        class="cit-corpus-tab"
        class:active={(tab.id === 'glossary' ? showKnowledgeBase : citationType === tab.id)}
        onclick={() => setCorpusFilter(tab.id)}
      >
        <Icon name={tab.icon} />
        {tab.label}
      </button>
    {/each}
    <span class="cit-corpus-count">{filteredCitations.length} result{filteredCitations.length === 1 ? '' : 's'}</span>
  </div>

  <Card class="mb-6 bg-panel border-black/40">
    <CardContent class="p-4">
      <div class="flex gap-3 items-center flex-wrap">
        <input
          type="text"
          placeholder="Search citations by code, principle, or keyword…"
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
      </div>
    </CardContent>
  </Card>

  {#if loading}
    <div class="grid gap-4">
      {#each Array(6) as _, i}
        <Card class="bg-panel border-sand/10">
          <CardHeader class="pb-2">
            <div class="flex items-start justify-between gap-4">
              <Skeleton variant="text" width="40%" height="1.2em" />
              <div class="flex items-center gap-2">
                <Skeleton variant="rect" width="80px" height="24px" />
                <Skeleton variant="rect" width="60px" height="24px" />
              </div>
            </div>
          </CardHeader>
          <CardContent class="pt-0">
            <Skeleton variant="text" width="90%" height="1em" className="mb-2" />
            <Skeleton variant="text" width="95%" height="0.875em" className="mb-1" />
            <Skeleton variant="text" width="85%" height="0.875em" className="mb-3" />
            <div class="flex items-center gap-4">
              <Skeleton variant="text" width="120px" height="0.75em" />
              <Skeleton variant="text" width="100px" height="0.75em" />
              <Skeleton variant="text" width="80px" height="0.75em" />
            </div>
          </CardContent>
        </Card>
      {/each}
    </div>
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
                <button
                  class="px-1.5 py-0.5 rounded text-[10px] text-sand/50 border border-sand/15 hover:border-accent/40 hover:text-accent transition"
                  onclick={(e) => { e.stopPropagation(); quickViewCitation = citation; showQuickView = true; }}
                  title="Quick view"
                >
                  <Icon name="eye" />
                </button>
                <CitationsSaveButton
                  citation={{ statute_code: citation.formattedCitation, statute_title: citation.legalPrinciple, jurisdiction: citation.documentTitle, severity: citation.citationType, highlighted_text: citation.quotedText, source_type: 'auto_extracted' }}
                  size="sm"
                />
                <div class="relative" onclick={(e) => e.stopPropagation()}>
                  <button
                    class="px-1.5 py-0.5 rounded text-[10px] text-sand/50 border border-sand/15 hover:border-accent/40 hover:text-accent transition"
                    onclick={() => { addingToCollectionFor = addingToCollectionFor === citation.id ? null : citation.id; loadUserCollections(); }}
                  >+ collection</button>
                  {#if addingToCollectionFor === citation.id && userCollections.length > 0}
                    <div class="absolute right-0 top-full mt-1 z-20 bg-panel border border-sand/20 rounded shadow-lg min-w-40 py-1">
                      {#each userCollections as col}
                        <button
                          class="w-full text-left px-3 py-1.5 text-xs text-sand hover:bg-accent/10 flex items-center gap-2"
                          onclick={() => addToCollection(col.id, citation.id)}
                        >
                          <span class="w-2 h-2 rounded-full shrink-0" style="background: {col.color}"></span>
                          {col.name}
                        </button>
                      {/each}
                    </div>
                  {:else if addingToCollectionFor === citation.id && collectionsLoaded}
                    <div class="absolute right-0 top-full mt-1 z-20 bg-panel border border-sand/20 rounded shadow-lg p-3">
                      <p class="text-xs text-sand/50">No collections yet</p>
                    </div>
                  {/if}
                </div>
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
                <CitationLink text={citation.quotedText} />
              </blockquote>
            {/if}
            <!-- Source trust metadata row -->
            <div class="flex items-center gap-2 mt-3 flex-wrap">
              {#if citation.jurisdiction || inferJurisdiction(citation.formattedCitation)}
                {@const juris = citation.jurisdiction || inferJurisdiction(citation.formattedCitation)}
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-blue-950/60 text-blue-300 border border-blue-700/30 font-mono">
                  {juris}
                </span>
              {/if}
              {#if citation.effectiveDate || citation.createdAt}
                <span class="text-[10px] text-sand/35 border-l border-sand/15 pl-2">
                  {formatCitationDate(citation.effectiveDate ?? citation.createdAt)}
                </span>
              {/if}
              {#if citation.caseTitle}
                <span class="text-[10px] text-sand/40">Case: {citation.caseTitle}</span>
              {/if}
              {#if citation.documentTitle && !citation.caseTitle}
                <span class="text-[10px] text-sand/40">{citation.documentTitle}</span>
              {/if}
              <span class="ml-auto flex items-center gap-1.5">
                {#if citation.sourceUrl}
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-950/60 text-green-400 border border-green-700/30">✓ Verified</span>
                {:else}
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-sand/5 text-sand/30 border border-sand/10">Unverified</span>
                {/if}
                <span class="text-[10px] text-sand/30">{Math.round(citation.relevanceScore * 100)}% relevance</span>
              </span>
            </div>
            <!-- Research workflow actions -->
            <div class="flex items-center gap-1.5 mt-2 flex-wrap" onclick={(e) => e.stopPropagation()}>
              {#if citation.sourceUrl}
                <a
                  href={citation.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="px-2 py-1 rounded text-[10px] text-sand/60 border border-sand/15 hover:border-green-600/50 hover:text-green-400 transition"
                >View Official Text ↗</a>
              {/if}
              <button
                class="px-2 py-1 rounded text-[10px] text-sand/60 border border-sand/15 hover:border-accent/40 hover:text-accent transition"
                onclick={() => { kbQuery = citation.formattedCitation; showKnowledgeBase = true; if (kbDebounceTimer) clearTimeout(kbDebounceTimer); kbDebounceTimer = setTimeout(() => searchKnowledgeBase(kbQuery), 100); }}
              >Show Related Cases</button>
              <button
                class="px-2 py-1 rounded text-[10px] text-sand/60 border border-sand/15 hover:border-accent/40 hover:text-accent transition"
                onclick={() => { kbQuery = citation.formattedCitation; showKnowledgeBase = true; if (kbDebounceTimer) clearTimeout(kbDebounceTimer); kbDebounceTimer = setTimeout(() => searchKnowledgeBase(kbQuery), 100); }}
              >Glossary Terms</button>
              <button
                class="px-2 py-1 rounded text-[10px] text-sand/60 border border-sand/15 hover:border-accent/40 hover:text-accent transition"
                onclick={() => { citationType = 'regulation'; loadCitations(); }}
              >Related Regulations</button>
            </div>
            <!-- Tags row -->
            <div class="flex items-center gap-1.5 mt-2 flex-wrap">
              {#each citationTagsMap[citation.id] ?? [] as t (t.tag)}
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium text-black cursor-pointer"
                  style="background-color: {t.color}"
                  onclick={(e) => { e.stopPropagation(); removeTagFromCitation(citation.id, t.tag); }}
                  title="Click to remove"
                >
                  {t.tag} ×
                </span>
              {/each}
              {#if addingTagFor === citation.id}
                <div class="flex items-center gap-1" onclick={(e) => e.stopPropagation()}>
                  {#each TAG_PRESETS as preset}
                    <button
                      class="px-1.5 py-0.5 rounded text-[9px] text-black hover:opacity-80"
                      style="background-color: {preset.color}"
                      onclick={(e) => { e.stopPropagation(); addTagToCitation(citation.id, preset.tag, preset.color); }}
                    >{preset.tag}</button>
                  {/each}
                  <input
                    type="text"
                    bind:value={newTagInput}
                    placeholder="custom..."
                    class="w-16 px-1 py-0.5 text-[10px] bg-black/30 border border-sand/20 rounded text-sand"
                    onkeydown={(e) => { if (e.key === 'Enter' && newTagInput.trim()) addTagToCitation(citation.id, newTagInput.trim(), '#6b7280'); }}
                  />
                </div>
              {:else}
                <button
                  class="px-1.5 py-0.5 rounded text-[10px] text-sand/40 border border-sand/15 hover:border-sand/30 hover:text-sand/60"
                  onclick={(e) => { e.stopPropagation(); addingTagFor = citation.id; loadTagsForCitation(citation.id); }}
                >+ tag</button>
              {/if}
            </div>
          </CardContent>
        </Card>
      {/each}
    </div>

    {#if selectedCitation}
      <div class="mt-6">
        <div class="flex items-center gap-3 mb-4">
          <h3 class="text-sm font-semibold text-sand">Selected Citation</h3>
          <CitationsSaveButton
            citation={{ statute_code: selectedCitation.statute_code, statute_title: selectedCitation.statute_title, jurisdiction: selectedCitation.jurisdiction, severity: selectedCitation.severity, highlighted_text: selectedCitation.highlighted_text, source_type: selectedCitation.source_type }}
            size="md"
          />
        </div>
        <CitationDetail
          citation={selectedCitation}
          onupdated={() => { selectedCitation = null; loadCitations(); }}
          ondelete={() => { selectedCitation = null; loadCitations(); }}
          onattachtocase={() => { attachStatuteCode = selectedCitation?.statute_code ?? null; attachCitationId = selectedCitation?.id ?? null; showAttachModal = true; }}
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
        <StatuteDetail
          statute={{ id: selectedCitation.id, code: selectedCitation.statute_code ?? '', title: selectedCitation.statute_title ?? '', full_text: selectedCitation.highlighted_text ?? '', jurisdiction: selectedCitation.jurisdiction ?? '' }}
          onattachtocase={() => { attachStatuteCode = selectedCitation?.statute_code ?? null; attachCitationId = selectedCitation?.id ?? null; showAttachModal = true; }}
          onsavecitation={() => { console.log('Save citation:', selectedCitation.id); }}
        />
        <RelatedCasesPanel
          statuteCode={selectedCitation.statute_code ?? null}
          onviewcase={(c) => { goto(`/cases/${c.id}`); }}
        />
        <div class="mt-4">
          <button onclick={() => { editingLink = { id: selectedCitation.id, case_id: '', statute_code: selectedCitation.statute_code ?? '', link_type: 'CITED_IN', notes: selectedCitation.notes ?? '', created_at: selectedCitation.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }; showLinkEditor = !showLinkEditor; }} class="text-sm text-accent hover:underline">
            {showLinkEditor ? 'Hide Link Editor' : 'Edit Link Metadata'}
          </button>
        </div>
        {#if showLinkEditor && editingLink}
          <div class="mt-2">
            <LinkMetadataForm link={editingLink} onupdated={() => { showLinkEditor = false; loadCitations(); }} />
          </div>
        {/if}
      </div>
    {/if}
  {/if}
  {/if}
  </div><!-- /cit-body -->
</div><!-- /citations-page -->

<!-- Quick View Modal -->
<CitationViewModal
  bind:open={showQuickView}
  citation={quickViewCitation}
  onClose={() => { showQuickView = false; quickViewCitation = null; }}
  onViewFull={(c) => {
    selectedCitation = { id: c.id, statute_code: c.formattedCitation, statute_title: c.legalPrinciple, jurisdiction: c.documentTitle, severity: c.citationType, source_type: 'auto_extracted' as const, highlighted_text: c.quotedText, notes: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  }}
  onAttachToCase={(c) => {
    attachStatuteCode = c.formattedCitation ?? null;
    attachCitationId = c.id ?? null;
    showAttachModal = true;
  }}
/>

<!-- Citation Source Inspector Modal -->
<CitationInspector
  citation={inspectorCitation}
  isOpen={showCitationInspector}
  onClose={() => { showCitationInspector = false; }}
/>

<!-- Attach to Case Modal -->
<AttachToCaseModal
  isOpen={showAttachModal}
  statuteCode={attachStatuteCode}
  citationId={attachCitationId}
  onattached={(data) => { console.log('Attached to case:', data); showAttachModal = false; loadCitations(); }}
/>

<!-- Collection Detail Panel -->
{#if selectedCollection}
  <div class="mt-6">
    <CollectionDetail
      collection={selectedCollection}
      onback={() => { selectedCollection = null; }}
      ondeleted={() => { selectedCollection = null; }}
    />
  </div>
{/if}

<style>
  /* ── Citations page layout ── */
  .citations-page {
    max-width: 72rem;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  /* ── Page header ── */
  .cit-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.5rem;
    margin-bottom: 1.25rem;
  }
  .cit-header-left {
    display: flex;
    align-items: flex-start;
    gap: 0.875rem;
  }
  .cit-header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 0.625rem;
    background: linear-gradient(135deg, rgba(96, 165, 250, 0.15), rgba(167, 139, 250, 0.15));
    border: 1px solid rgba(96, 165, 250, 0.25);
    color: rgba(96, 165, 250, 0.9);
    flex-shrink: 0;
    margin-top: 0.125rem;
  }
  .cit-title {
    font-size: 1.375rem;
    font-weight: 700;
    color: rgba(212, 199, 163, 0.95);
    letter-spacing: -0.01em;
    margin: 0;
    line-height: 1.3;
  }
  .cit-subtitle {
    font-size: 0.75rem;
    color: rgba(212, 199, 163, 0.4);
    margin-top: 0.125rem;
    letter-spacing: 0.04em;
  }
  .cit-header-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.125rem;
    padding-top: 0.25rem;
  }
  .cit-meta-line {
    font-size: 0.625rem;
    color: rgba(212, 199, 163, 0.22);
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    letter-spacing: 0.02em;
  }

  /* ── Stats row ── */
  .cit-stats-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.875rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(212, 199, 163, 0.08);
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }
  .cit-stat {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.6875rem;
    color: rgba(212, 199, 163, 0.5);
  }
  .cit-stat strong {
    color: rgba(212, 199, 163, 0.85);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .cit-stat.cached strong {
    color: rgba(250, 204, 21, 0.85);
  }
  .cit-stat-divider {
    width: 1px;
    height: 1rem;
    background: rgba(212, 199, 163, 0.12);
  }

  /* ── Action bar ── */
  .cit-action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }
  .cit-actions-left,
  .cit-actions-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .cit-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.4375rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: rgba(212, 199, 163, 0.6);
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(212, 199, 163, 0.12);
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s ease;
    text-decoration: none;
  }
  .cit-btn:hover {
    color: rgba(212, 199, 163, 0.85);
    border-color: rgba(96, 165, 250, 0.35);
    background: rgba(96, 165, 250, 0.08);
  }
  .cit-btn.active {
    color: rgba(96, 165, 250, 0.95);
    border-color: rgba(96, 165, 250, 0.4);
    background: rgba(96, 165, 250, 0.12);
  }
  .cit-btn.primary {
    color: rgba(96, 165, 250, 0.9);
    border-color: rgba(96, 165, 250, 0.3);
    background: rgba(96, 165, 250, 0.1);
  }
  .cit-btn.primary:hover {
    background: rgba(96, 165, 250, 0.18);
    border-color: rgba(96, 165, 250, 0.45);
  }

  /* ── Corpus tab strip ── */
  .cit-corpus-tabs {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .cit-corpus-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    font-size: 0.6875rem;
    font-weight: 500;
    color: rgba(212, 199, 163, 0.5);
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(212, 199, 163, 0.1);
    border-radius: 9999px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .cit-corpus-tab:hover {
    color: rgba(96, 165, 250, 0.85);
    border-color: rgba(96, 165, 250, 0.3);
    background: rgba(96, 165, 250, 0.06);
  }
  .cit-corpus-tab.active {
    color: #000;
    background: rgba(96, 165, 250, 0.9);
    border-color: rgba(96, 165, 250, 0.9);
    font-weight: 600;
  }
  .cit-corpus-count {
    margin-left: auto;
    font-size: 0.625rem;
    color: rgba(212, 199, 163, 0.25);
    padding-right: 0.25rem;
    font-variant-numeric: tabular-nums;
  }
</style>
