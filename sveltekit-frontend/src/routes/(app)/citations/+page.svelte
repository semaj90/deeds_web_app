<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { goto } from '$app/navigation';
  import { analytics } from '$lib/stores/analytics.svelte';
  import DropdownMenu from '$lib/components/ui/DropdownMenu.svelte';
  import { citationCache } from '$lib/ai/citation-cache.js';
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
        citations = Array.isArray(data.citations) ? data.citations : [];
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
    <div class="cit-section">
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
    <div class="cit-section">
      <CitationSaveForm
        onsaved={() => { showSaveForm = false; loadCitations(); }}
      />
    </div>
  {/if}

  <!-- Citation Library Page — Full collection management -->
  {#if showLibraryPage}
    <div class="cit-section">
      <CitationLibraryPage />
    </div>
  {/if}

  {#if showGpuSearch}
    <div class="cit-section">
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
    <div class="cit-section">
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
    <div class="cit-section">
      <div class="kb-panel">
        <div class="kb-header">
          <h3 class="kb-title">Knowledge Base Search</h3>
        </div>
        <div class="kb-content">
          <div class="kb-search-row">
            <input
              type="text"
              bind:value={kbQuery}
              placeholder="Search glossary, statutes, and precedents..."
              oninput={() => {
                if (kbDebounceTimer) clearTimeout(kbDebounceTimer);
                kbDebounceTimer = setTimeout(() => searchKnowledgeBase(kbQuery), 400);
              }}
              class="kb-input"
            />
            {#if kbSearching}
              <span class="kb-status searching">Searching...</span>
            {:else if kbTiming.totalMs}
              <span class="kb-status">{kbTiming.totalMs}ms</span>
            {/if}
          </div>

          {#if kbResults.glossary.length > 0}
            <div>
              <h4 class="kb-section-label">Glossary ({kbResults.glossary.length})</h4>
              <div class="kb-results-list">
                {#each kbResults.glossary as term (term.id ?? term.term)}
                  <div class="kb-result-card">
                    <div class="kb-result-head">
                      <span class="kb-term-name">{term.term}</span>
                      {#if term.category}
                        <span class="kb-tag">{term.category}</span>
                      {/if}
                      <span class="kb-score">{Math.round((term.similarity ?? 0) * 100)}%</span>
                    </div>
                    <p class="kb-result-text">{term.definition}</p>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if kbResults.statutes.length > 0}
            <div>
              <h4 class="kb-section-label">Statutes ({kbResults.statutes.length})</h4>
              <div class="kb-results-list">
                {#each kbResults.statutes as statute (statute.chunkId ?? statute.statuteId)}
                  <div class="kb-result-card kb-hoverable">
                    <div class="kb-result-head">
                      <span class="kb-statute-name">{statute.statuteTitle}</span>
                      {#if statute.section}
                        <span class="kb-mono-tag">{statute.section}</span>
                      {/if}
                      <span class="kb-score">{Math.round((statute.similarity ?? 0) * 100)}%</span>
                    </div>
                    {#if statute.jurisdiction}
                      <span class="kb-jurisdiction">{statute.jurisdiction}</span>
                    {/if}
                    <p class="kb-result-text">{statute.content}</p>
                    <div class="kb-result-action">
                      <Button
                        size="sm"
                        variant="ghost"
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
              <h4 class="kb-section-label">Precedents ({kbResults.precedents.length})</h4>
              <div class="kb-results-list prec">
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
            <p class="kb-empty">No results found for "{kbQuery}"</p>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Citation Browser (API-backed paginated list) -->
  {#if showCitationBrowser}
    <div class="cit-section">
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

  <!-- Search / Filter -->
  <div class="cit-search-panel">
    <div class="cit-search-row">
      <input
        type="text"
        placeholder="Search citations by code, principle, or keyword…"
        bind:value={searchQuery}
        oninput={() => loadCitations()}
        class="cit-search-input"
      />
      <select
        bind:value={citationType}
        onchange={() => loadCitations()}
        class="cit-search-select"
      >
        {#each citationTypes as type}
          <option value={type}>{type === 'all' ? 'All Types' : type.replace('_', ' ')}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if loading}
    <div class="cit-list">
      {#each Array(6) as _, i}
        <div class="cit-skel-card">
          <div class="cit-skel-top">
            <Skeleton variant="text" width="40%" height="1.2em" />
            <div class="cit-skel-badges">
              <Skeleton variant="rect" width="80px" height="24px" />
              <Skeleton variant="rect" width="60px" height="24px" />
            </div>
          </div>
          <div class="cit-skel-body">
            <Skeleton variant="text" width="90%" height="1em" />
            <Skeleton variant="text" width="95%" height="0.875em" />
            <Skeleton variant="text" width="85%" height="0.875em" />
          </div>
          <div class="cit-skel-footer">
            <Skeleton variant="text" width="120px" height="0.75em" />
            <Skeleton variant="text" width="100px" height="0.75em" />
            <Skeleton variant="text" width="80px" height="0.75em" />
          </div>
        </div>
      {/each}
    </div>
  {:else if error}
    <div class="cit-error-panel">
      <p class="cit-error-text">{error}</p>
      <Button onclick={() => loadCitations()}>Retry</Button>
    </div>
  {:else if filteredCitations.length === 0}
    <div class="cit-empty-panel">
      <p class="cit-empty-title">No citations found</p>
      <p class="cit-empty-desc">Try adjusting your search or filter criteria</p>
    </div>
  {:else}
    <div class="cit-list">
      {#each filteredCitations as citation (citation.id)}
        <div
          class="cit-card"
          onclick={() => (selectedCitation = selectedCitation?.id === citation.id ? null : { id: citation.id, statute_code: citation.formattedCitation, statute_title: citation.legalPrinciple, jurisdiction: citation.documentTitle, severity: citation.citationType, source_type: 'auto_extracted' as const, highlighted_text: citation.quotedText, notes: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })}
          role="button"
          tabindex="0"
        >
          <div class="cit-card-top">
            <span class="cit-card-code">{citation.formattedCitation}</span>
            <div class="cit-card-actions">
              <button
                class="cit-mini-btn"
                onclick={(e) => { e.stopPropagation(); quickViewCitation = citation; showQuickView = true; }}
                title="Quick view"
              >
                <Icon name="eye" />
              </button>
              <CitationsSaveButton
                citation={{ statute_code: citation.formattedCitation, statute_title: citation.legalPrinciple, jurisdiction: citation.documentTitle, severity: citation.citationType, highlighted_text: citation.quotedText, source_type: 'auto_extracted' }}
                size="sm"
              />
              <div class="cit-collection-wrap" onclick={(e) => e.stopPropagation()}>
                <button
                  class="cit-mini-btn"
                  onclick={() => { addingToCollectionFor = addingToCollectionFor === citation.id ? null : citation.id; loadUserCollections(); }}
                >+ collection</button>
                {#if addingToCollectionFor === citation.id && userCollections.length > 0}
                  <div class="cit-collection-dropdown">
                    {#each userCollections as col}
                      <button
                        class="cit-collection-item"
                        onclick={() => addToCollection(col.id, citation.id)}
                      >
                        <span class="cit-collection-dot" style="background: {col.color}"></span>
                        {col.name}
                      </button>
                    {/each}
                  </div>
                {:else if addingToCollectionFor === citation.id && collectionsLoaded}
                  <div class="cit-collection-dropdown">
                    <p class="cit-collection-empty">No collections yet</p>
                  </div>
                {/if}
              </div>
              <span class="cit-type-badge">
                {citation.citationType.replace('_', ' ')}
              </span>
              {#if citation.isKeyAuthority}
                <span class="cit-key-badge">
                  Key Authority
                </span>
              {/if}
            </div>
          </div>

          {#if citation.legalPrinciple}
            <p class="cit-card-principle">{citation.legalPrinciple}</p>
          {/if}
          {#if citation.quotedText}
            <blockquote class="cit-card-quote">
              <CitationLink text={citation.quotedText} />
            </blockquote>
          {/if}

          <!-- Source trust metadata row -->
          <div class="cit-card-meta">
            {#if citation.jurisdiction || inferJurisdiction(citation.formattedCitation)}
              {@const juris = citation.jurisdiction || inferJurisdiction(citation.formattedCitation)}
              <span class="cit-juris-badge">{juris}</span>
            {/if}
            {#if citation.effectiveDate || citation.createdAt}
              <span class="cit-date-text">
                {formatCitationDate(citation.effectiveDate ?? citation.createdAt)}
              </span>
            {/if}
            {#if citation.caseTitle}
              <span class="cit-meta-text">Case: {citation.caseTitle}</span>
            {/if}
            {#if citation.documentTitle && !citation.caseTitle}
              <span class="cit-meta-text">{citation.documentTitle}</span>
            {/if}
            <span class="cit-meta-right">
              {#if citation.sourceUrl}
                <span class="cit-verified-badge">✓ Verified</span>
              {:else}
                <span class="cit-unverified-badge">Unverified</span>
              {/if}
              <span class="cit-relevance">{Math.round(citation.relevanceScore * 100)}% relevance</span>
            </span>
          </div>

          <!-- Research workflow actions -->
          <div class="cit-card-workflow" onclick={(e) => e.stopPropagation()}>
            {#if citation.sourceUrl}
              <a
                href={citation.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="cit-workflow-btn"
              >View Official Text ↗</a>
            {/if}
            <button
              class="cit-workflow-btn"
              onclick={() => { kbQuery = citation.formattedCitation; showKnowledgeBase = true; if (kbDebounceTimer) clearTimeout(kbDebounceTimer); kbDebounceTimer = setTimeout(() => searchKnowledgeBase(kbQuery), 100); }}
            >Show Related Cases</button>
            <button
              class="cit-workflow-btn"
              onclick={() => { kbQuery = citation.formattedCitation; showKnowledgeBase = true; if (kbDebounceTimer) clearTimeout(kbDebounceTimer); kbDebounceTimer = setTimeout(() => searchKnowledgeBase(kbQuery), 100); }}
            >Glossary Terms</button>
            <button
              class="cit-workflow-btn"
              onclick={() => { citationType = 'regulation'; loadCitations(); }}
            >Related Regulations</button>
          </div>

          <!-- Tags row -->
          <div class="cit-card-tags">
            {#each citationTagsMap[citation.id] ?? [] as t (t.tag)}
              <span
                class="cit-tag-pill"
                style="background-color: {t.color}"
                onclick={(e) => { e.stopPropagation(); removeTagFromCitation(citation.id, t.tag); }}
                title="Click to remove"
                role="button"
                tabindex="0"
              >
                {t.tag} ×
              </span>
            {/each}
            {#if addingTagFor === citation.id}
              <div class="cit-tag-adder" onclick={(e) => e.stopPropagation()}>
                {#each TAG_PRESETS as preset}
                  <button
                    class="cit-tag-preset"
                    style="background-color: {preset.color}"
                    onclick={(e) => { e.stopPropagation(); addTagToCitation(citation.id, preset.tag, preset.color); }}
                  >{preset.tag}</button>
                {/each}
                <input
                  type="text"
                  bind:value={newTagInput}
                  placeholder="custom..."
                  class="cit-tag-input"
                  onkeydown={(e) => { if (e.key === 'Enter' && newTagInput.trim()) addTagToCitation(citation.id, newTagInput.trim(), '#6b7280'); }}
                />
              </div>
            {:else}
              <button
                class="cit-mini-btn"
                onclick={(e) => { e.stopPropagation(); addingTagFor = citation.id; loadTagsForCitation(citation.id); }}
              >+ tag</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    {#if selectedCitation}
      <div class="cit-selected-section">
        <div class="cit-selected-header">
          <h3 class="cit-selected-title">Selected Citation</h3>
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
        <div class="cit-link-toggle">
          <button onclick={() => { editingLink = { id: selectedCitation.id, case_id: '', statute_code: selectedCitation.statute_code ?? '', link_type: 'CITED_IN', notes: selectedCitation.notes ?? '', created_at: selectedCitation.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() }; showLinkEditor = !showLinkEditor; }} class="cit-link-btn">
            {showLinkEditor ? 'Hide Link Editor' : 'Edit Link Metadata'}
          </button>
        </div>
        {#if showLinkEditor && editingLink}
          <div class="cit-link-editor">
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
  <div class="cit-selected-section">
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
    min-height: 100vh;
    background: #0e0d0b;
    margin: -2.5rem;
    padding: 2rem max(1.5rem, calc(50% - 36rem));
  }

  .citations-page :global(h1), .citations-page :global(h2), .citations-page :global(h3), .citations-page :global(p) { color: inherit; text-transform: none; letter-spacing: normal; margin: 0; }
  .citations-page :global(a) { color: inherit; border-bottom: none; }
  .citations-page :global(button) { text-transform: none; letter-spacing: normal; background: none; border: none; box-shadow: none; padding: 0; color: inherit; }
  .citations-page :global(input), .citations-page :global(select) { background: transparent; border: none; box-shadow: none; color: inherit; }
  .citations-page :global([class*="panel"]), .citations-page :global(.card) { background: transparent; border: none; box-shadow: none; color: inherit; padding: 0; }

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

  /* ── Body + Section Spacing ── */
  .cit-section { margin-bottom: 1.5rem; }

  /* ── Search / Filter Panel ── */
  .cit-search-panel {
    border-radius: 0.5rem;
    border: 1px solid rgba(212, 199, 163, 0.08);
    background: rgba(0, 0, 0, 0.25);
    padding: 1rem;
    margin-bottom: 1.5rem;
  }
  .cit-search-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .cit-search-input {
    flex: 1;
    min-width: 12rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid rgba(212, 199, 163, 0.12);
    background: rgba(0, 0, 0, 0.3);
    color: rgba(212, 199, 163, 0.9);
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.15s;
  }
  .cit-search-input::placeholder { color: rgba(212, 199, 163, 0.3); }
  .cit-search-input:focus { border-color: rgba(96, 165, 250, 0.5); }
  .cit-search-select {
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid rgba(212, 199, 163, 0.12);
    background: rgba(0, 0, 0, 0.3);
    color: rgba(212, 199, 163, 0.9);
    font-size: 0.875rem;
  }

  /* ── Skeleton Cards ── */
  .cit-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .cit-skel-card {
    border-radius: 0.5rem;
    border: 1px solid rgba(212, 199, 163, 0.06);
    background: rgba(0, 0, 0, 0.2);
    padding: 1rem 1.25rem;
  }
  .cit-skel-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }
  .cit-skel-badges {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .cit-skel-body {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-top: 0.75rem;
  }
  .cit-skel-footer {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 0.75rem;
  }

  /* ── Error / Empty ── */
  .cit-error-panel {
    border-radius: 0.5rem;
    border: 1px solid rgba(248, 113, 113, 0.2);
    background: rgba(0, 0, 0, 0.25);
    padding: 1.5rem;
    text-align: center;
  }
  .cit-error-text {
    color: rgba(248, 113, 113, 0.9);
    margin-bottom: 1rem;
  }
  .cit-empty-panel {
    border-radius: 0.5rem;
    border: 1px solid rgba(212, 199, 163, 0.1);
    background: rgba(0, 0, 0, 0.2);
    padding: 3rem 1.5rem;
    text-align: center;
  }
  .cit-empty-title {
    font-size: 1.125rem;
    color: rgba(212, 199, 163, 0.5);
    margin-bottom: 0.5rem;
  }
  .cit-empty-desc {
    font-size: 0.875rem;
    color: rgba(212, 199, 163, 0.3);
  }

  /* ── Citation Card ── */
  .cit-card {
    border-radius: 0.5rem;
    border: 1px solid rgba(212, 199, 163, 0.08);
    background: rgba(0, 0, 0, 0.2);
    padding: 1rem 1.25rem;
    cursor: pointer;
    transition: border-color 0.2s;
  }
  .cit-card:hover {
    border-color: rgba(96, 165, 250, 0.3);
  }
  .cit-card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }
  .cit-card-code {
    font-size: 0.875rem;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-weight: 500;
    color: rgba(96, 165, 250, 0.9);
  }
  .cit-card-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .cit-mini-btn {
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.625rem;
    color: rgba(212, 199, 163, 0.45);
    border: 1px solid rgba(212, 199, 163, 0.1);
    background: transparent;
    cursor: pointer;
    transition: all 0.15s;
  }
  .cit-mini-btn:hover {
    border-color: rgba(96, 165, 250, 0.4);
    color: rgba(96, 165, 250, 0.9);
  }
  .cit-type-badge {
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    background: rgba(212, 199, 163, 0.06);
    color: rgba(212, 199, 163, 0.6);
  }
  .cit-key-badge {
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    background: rgba(96, 165, 250, 0.12);
    color: rgba(96, 165, 250, 0.9);
  }

  /* ── Card Body ── */
  .cit-card-principle {
    font-size: 0.875rem;
    color: rgba(212, 199, 163, 0.75);
    margin-bottom: 0.5rem;
  }
  .cit-card-quote {
    border-left: 2px solid rgba(96, 165, 250, 0.25);
    padding-left: 0.75rem;
    color: rgba(212, 199, 163, 0.5);
    font-size: 0.75rem;
    font-style: italic;
    margin: 0 0 0.75rem;
  }

  /* ── Card Metadata Row ── */
  .cit-card-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.75rem;
  }
  .cit-juris-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.625rem;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    background: rgba(96, 165, 250, 0.08);
    color: rgba(96, 165, 250, 0.7);
    border: 1px solid rgba(96, 165, 250, 0.15);
  }
  .cit-date-text {
    font-size: 0.625rem;
    color: rgba(212, 199, 163, 0.3);
    border-left: 1px solid rgba(212, 199, 163, 0.1);
    padding-left: 0.5rem;
  }
  .cit-meta-text {
    font-size: 0.625rem;
    color: rgba(212, 199, 163, 0.35);
  }
  .cit-meta-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .cit-verified-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.625rem;
    background: rgba(52, 211, 153, 0.08);
    color: rgba(52, 211, 153, 0.8);
    border: 1px solid rgba(52, 211, 153, 0.15);
  }
  .cit-unverified-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.625rem;
    background: rgba(212, 199, 163, 0.04);
    color: rgba(212, 199, 163, 0.25);
    border: 1px solid rgba(212, 199, 163, 0.08);
  }
  .cit-relevance {
    font-size: 0.625rem;
    color: rgba(212, 199, 163, 0.25);
  }

  /* ── Workflow Buttons ── */
  .cit-card-workflow {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }
  .cit-workflow-btn {
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.625rem;
    color: rgba(212, 199, 163, 0.5);
    border: 1px solid rgba(212, 199, 163, 0.1);
    background: transparent;
    cursor: pointer;
    transition: all 0.15s;
    text-decoration: none;
  }
  .cit-workflow-btn:hover {
    border-color: rgba(96, 165, 250, 0.4);
    color: rgba(96, 165, 250, 0.9);
  }

  /* ── Tags ── */
  .cit-card-tags {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }
  .cit-tag-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.625rem;
    font-weight: 500;
    color: #000;
    cursor: pointer;
  }
  .cit-tag-adder {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .cit-tag-preset {
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.5625rem;
    color: #000;
    border: none;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .cit-tag-preset:hover { opacity: 0.8; }
  .cit-tag-input {
    width: 4rem;
    padding: 0.125rem 0.25rem;
    font-size: 0.625rem;
    border-radius: 0.25rem;
    border: 1px solid rgba(212, 199, 163, 0.12);
    background: rgba(0, 0, 0, 0.3);
    color: rgba(212, 199, 163, 0.9);
  }

  /* ── Collection Dropdown ── */
  .cit-collection-wrap {
    position: relative;
  }
  .cit-collection-dropdown {
    position: absolute;
    right: 0;
    top: 100%;
    margin-top: 0.25rem;
    z-index: 20;
    background: rgba(19, 21, 25, 0.98);
    border: 1px solid rgba(212, 199, 163, 0.12);
    border-radius: 0.375rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    min-width: 10rem;
    padding: 0.25rem 0;
  }
  .cit-collection-item {
    width: 100%;
    text-align: left;
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    color: rgba(212, 199, 163, 0.8);
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: background 0.15s;
  }
  .cit-collection-item:hover { background: rgba(96, 165, 250, 0.08); }
  .cit-collection-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .cit-collection-empty {
    padding: 0.75rem;
    font-size: 0.75rem;
    color: rgba(212, 199, 163, 0.4);
  }

  /* ── Selected Citation Section ── */
  .cit-selected-section {
    margin-top: 1.5rem;
  }
  .cit-selected-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .cit-selected-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: rgba(212, 199, 163, 0.85);
    margin: 0;
  }
  .cit-link-toggle {
    margin-top: 1rem;
  }
  .cit-link-btn {
    font-size: 0.875rem;
    color: rgba(96, 165, 250, 0.8);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: none;
    transition: color 0.15s;
  }
  .cit-link-btn:hover { color: rgba(96, 165, 250, 1); text-decoration: underline; }
  .cit-link-editor {
    margin-top: 0.5rem;
  }

  /* ── Knowledge Base Panel ── */
  .kb-panel {
    border-radius: 0.5rem;
    border: 1px solid rgba(96, 165, 250, 0.2);
    background: rgba(0, 0, 0, 0.25);
    overflow: hidden;
  }
  .kb-header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(212, 199, 163, 0.08);
  }
  .kb-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: rgba(96, 165, 250, 0.9);
    margin: 0;
  }
  .kb-content {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .kb-search-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .kb-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid rgba(212, 199, 163, 0.12);
    background: rgba(0, 0, 0, 0.3);
    color: rgba(212, 199, 163, 0.9);
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.15s;
  }
  .kb-input::placeholder { color: rgba(212, 199, 163, 0.3); }
  .kb-input:focus { border-color: rgba(96, 165, 250, 0.5); }
  .kb-status {
    font-size: 0.75rem;
    color: rgba(212, 199, 163, 0.3);
    white-space: nowrap;
  }
  .kb-status.searching {
    color: rgba(96, 165, 250, 0.8);
  }
  .kb-section-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(212, 199, 163, 0.45);
    margin: 0 0 0.5rem;
  }
  .kb-results-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .kb-results-list.prec {
    gap: 0.75rem;
  }
  .kb-result-card {
    padding: 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid rgba(212, 199, 163, 0.06);
    background: rgba(0, 0, 0, 0.15);
  }
  .kb-hoverable {
    transition: border-color 0.15s;
  }
  .kb-hoverable:hover {
    border-color: rgba(96, 165, 250, 0.25);
  }
  .kb-result-head {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .kb-term-name {
    font-weight: 500;
    font-size: 0.875rem;
    color: rgba(96, 165, 250, 0.9);
  }
  .kb-statute-name {
    font-weight: 500;
    font-size: 0.875rem;
    color: rgba(212, 199, 163, 0.85);
  }
  .kb-tag {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    background: rgba(212, 199, 163, 0.06);
    color: rgba(212, 199, 163, 0.45);
  }
  .kb-mono-tag {
    font-size: 0.625rem;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    color: rgba(96, 165, 250, 0.6);
  }
  .kb-score {
    font-size: 0.625rem;
    color: rgba(212, 199, 163, 0.25);
    margin-left: auto;
  }
  .kb-jurisdiction {
    font-size: 0.625rem;
    color: rgba(212, 199, 163, 0.3);
  }
  .kb-result-text {
    font-size: 0.75rem;
    color: rgba(212, 199, 163, 0.55);
    margin-top: 0.25rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .kb-result-action {
    margin-top: 0.5rem;
    display: flex;
    justify-content: flex-end;
  }
  .kb-empty {
    color: rgba(212, 199, 163, 0.35);
    font-size: 0.875rem;
    text-align: center;
    padding: 1rem 0;
  }
</style>
