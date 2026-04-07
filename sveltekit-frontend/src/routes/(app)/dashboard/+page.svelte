<script lang="ts">
  import { goto, pushState } from '$app/navigation';

  function openCaseModal(e: MouseEvent, id: string) {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    pushState(`/cases/${id}/overview`, {
      showCaseModal: true,
      caseId: id
    });
  }
  import Button from '$lib/components/ui/Button.svelte';
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
  import WorkspacePanel from '$lib/components/legal/WorkspacePanel.svelte';
  import SystemStatusPanel from '$lib/components/dashboard/SystemStatusPanel.svelte';
  import FallbackAlert from '$lib/components/dashboard/FallbackAlert.svelte';
  import ProgressCard from '$lib/components/dashboard/ProgressCard.svelte';
  import DocumentThumbnailTray from '$lib/components/dashboard/DocumentThumbnailTray.svelte';
  import { documentProgressStore } from '$lib/stores/dashboard/DocumentProgressStore.svelte';
  import RecentActivity from '$lib/components/yorha/dashboard/RecentActivity.svelte';
  import LegalDisclaimer from '$lib/components/LegalDisclaimer.svelte';
  import AIAssistantButton from '$lib/components/ai/AIAssistantButton.svelte';
  import ActiveCasesWidget from '$lib/components/yorha/dashboard/ActiveCasesWidget.svelte';
  import YoRHaDataViz from '$lib/components/yorha/_simulations/YoRHaDataViz.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { analytics } from '$lib/stores/analytics.svelte';
  import PipelineOverview from '$lib/components/dashboard/PipelineOverview.svelte';
  import GamificationWidget from '$lib/components/dashboard/GamificationWidget.svelte';
  import StatsCard from '$lib/components/dashboard/StatsCard.svelte';

  // ═══ WWWH Use Case Generator ═══
  let wwwhNotes = $state('');
  let wwwhWho = $state('');
  let wwwhWhat = $state('');
  let wwwhWhy = $state('');
  let wwwhHow = $state('');
  let wwwhTitle = $state('');
  let wwwhStatus = $state('open');
  let wwwhLocation = $state('');
  let wwwhDate = $state('');
  let wwwhCollapsed = $state(true);

  let wwwhSummary = $derived.by(() => {
    const parts: string[] = [];
    if (wwwhWho.trim()) parts.push(wwwhWho.trim());
    if (wwwhWhat.trim()) parts.push(wwwhWhat.trim());
    if (wwwhWhy.trim()) parts.push(`because ${wwwhWhy.trim()}`);
    if (wwwhHow.trim()) parts.push(`by ${wwwhHow.trim()}`);
    if (wwwhLocation.trim()) parts.push(`at ${wwwhLocation.trim()}`);
    if (wwwhDate.trim()) parts.push(`on ${wwwhDate.trim()}`);
    if (parts.length === 0) return '';
    let s = parts.join(' ');
    return s.charAt(0).toUpperCase() + s.slice(1) + (s.endsWith('.') ? '' : '.');
  });

  function parseWWWHNotes() {
    const text = wwwhNotes.trim();
    if (!text) return;

    // Try tagged format: "Who: ... What: ... Why: ... How: ..."
    const tagPattern = /\b(who|what|why|how|title|status|location|date)\s*[:—–-]\s*/gi;
    const tags: { key: string; start: number; end: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = tagPattern.exec(text)) !== null) {
      tags.push({ key: m[1].toLowerCase(), start: m.index, end: m.index + m[0].length });
    }

    if (tags.length > 0) {
      for (let i = 0; i < tags.length; i++) {
        const valueStart = tags[i].end;
        const valueEnd = i + 1 < tags.length ? tags[i + 1].start : text.length;
        const value = text.slice(valueStart, valueEnd).replace(/[\n\r]+/g, ' ').trim();
        switch (tags[i].key) {
          case 'who': wwwhWho = value; break;
          case 'what': wwwhWhat = value; break;
          case 'why': wwwhWhy = value; break;
          case 'how': wwwhHow = value; break;
          case 'title': wwwhTitle = value; break;
          case 'status': wwwhStatus = value; break;
          case 'location': wwwhLocation = value; break;
          case 'date': wwwhDate = value; break;
        }
      }
    } else {
      // No tags found — put everything in "What"
      wwwhWhat = text;
    }

    // Auto-generate title if empty
    if (!wwwhTitle.trim() && wwwhWhat.trim()) {
      wwwhTitle = wwwhWhat.split(/[.!?\n]/)[0].trim().slice(0, 80);
    }
  }

  let wwwhSaving = $state(false);
  let wwwhAnalyzing = $state(false);
  let wwwhError = $state('');
  let wwwhSuccess = $state('');

  async function createCaseFromWWWH() {
    if (!wwwhTitle.trim() && !wwwhWhat.trim()) {
      wwwhError = 'Provide at least a title or describe what happened.';
      return;
    }
    wwwhSaving = true;
    wwwhError = '';
    wwwhSuccess = '';
    try {
      // Build description from WWWH fields
      const wFields = [
        wwwhWho && `WHO: ${wwwhWho}`,
        wwwhWhat && `WHAT: ${wwwhWhat}`,
        wwwhDate && `WHEN: ${wwwhDate}`,
        wwwhLocation && `WHERE: ${wwwhLocation}`,
        wwwhWhy && `WHY: ${wwwhWhy}`,
        wwwhHow && `HOW: ${wwwhHow}`,
      ].filter(Boolean).join('\n');
      const description = [wwwhNotes.trim(), wFields].filter(Boolean).join('\n\n');
      const title = wwwhTitle.trim() || wwwhWhat.split(/[.!?\n]/)[0].trim().slice(0, 80) || 'New Case';

      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          status: wwwhStatus || 'open',
          priority: 'medium',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? data.error ?? `Failed (${res.status})`);
      }

      const data = await res.json();
      const newCaseId = data.case?.id ?? data.data?.case?.id;
      wwwhSuccess = `Case created successfully!`;
      analytics.track('case_created', { source: 'dashboard_wwwh', caseId: newCaseId });

      // Refresh dashboard case list
      loadDashboard();

      // Navigate to the new case after a moment so user sees the success message
      if (newCaseId) {
        setTimeout(() => goto(`/cases/${newCaseId}/overview`), 1200);
      }
    } catch (err) {
      wwwhError = err instanceof Error ? err.message : 'Failed to create case';
    } finally {
      wwwhSaving = false;
    }
  }

  async function aiAnalyzeWWWH() {
    if (!wwwhWhat.trim() && !wwwhNotes.trim()) {
      wwwhError = 'Provide notes or describe what happened before running AI analysis.';
      return;
    }
    wwwhAnalyzing = true;
    wwwhError = '';
    wwwhSuccess = '';
    try {
      const formData = new FormData();
      formData.append('narrative', wwwhNotes.trim());
      formData.append('who', wwwhWho);
      formData.append('what', wwwhWhat);
      formData.append('when', wwwhDate);
      formData.append('where', wwwhLocation);
      formData.append('why', wwwhWhy);
      formData.append('how', wwwhHow);

      const res = await fetch('/cases/new?/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('AI analysis unavailable — Ollama may be offline.');
      }

      const result = await res.json();
      // Superforms returns data in a specific structure
      const extraction = result?.data?.extraction ?? result?.extraction;
      if (extraction) {
        // Map IntakeExtractionResult → WWWH fields
        if (extraction.suggestedTitle && !wwwhTitle.trim()) wwwhTitle = extraction.suggestedTitle;
        if (extraction.title && !wwwhTitle.trim()) wwwhTitle = extraction.title;
        // Derive WHO from extracted persons list
        if (extraction.persons?.length && !wwwhWho.trim()) {
          wwwhWho = extraction.persons
            .map((p: { fullName: string; role: string }) => `${p.fullName} (${p.role})`)
            .join(', ');
        }
        if (extraction.who) wwwhWho = extraction.who;
        if (extraction.what) wwwhWhat = extraction.what;
        if (extraction.why) wwwhWhy = extraction.why;
        if (extraction.how) wwwhHow = extraction.how;
        if (extraction.when) wwwhDate = extraction.when;
        if (extraction.where) wwwhLocation = extraction.where;
        // Populate statute if available
        if (extraction.primaryStatute && !wwwhWhat.trim()) {
          wwwhWhat = `Potential violation: ${extraction.primaryStatute}`;
        }
        wwwhSuccess = 'AI analysis complete — fields updated.';
      } else {
        wwwhSuccess = 'AI analysis returned no extractions.';
      }
    } catch (err) {
      wwwhError = err instanceof Error ? err.message : 'AI analysis failed';
    } finally {
      wwwhAnalyzing = false;
    }
  }

  function clearWWWH() {
    wwwhNotes = '';
    wwwhWho = ''; wwwhWhat = ''; wwwhWhy = ''; wwwhHow = '';
    wwwhTitle = ''; wwwhStatus = 'open'; wwwhLocation = ''; wwwhDate = '';
    wwwhError = ''; wwwhSuccess = '';
  }

  // Collapsible section states
  let coreCollapsed = $state(false);
  let toolsCollapsed = $state(false);
  let devCollapsed = $state(true);

  // localStorage persistence for collapse state
  if (typeof window !== 'undefined') {
    try {
      const saved = JSON.parse(localStorage.getItem('dashboard-collapse') ?? '{}');
      if (saved.core !== undefined) coreCollapsed = saved.core;
      if (saved.tools !== undefined) toolsCollapsed = saved.tools;
      if (saved.dev !== undefined) devCollapsed = saved.dev;
    } catch { /* ignore */ }
  }

  function saveCollapseState() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('dashboard-collapse', JSON.stringify({
        core: coreCollapsed, tools: toolsCollapsed, dev: devCollapsed,
      }));
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    // Ctrl+K is handled by GlobalCommandPalette in root layout
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      goto('/cases/new');
    }
  }

  interface KBStats {
    glossary: number;
    statutes: number;
    precedents: number;
    total: number;
  }

  interface DashboardStats {
    activeCases: number;
    totalEvidence: number;
    personsOfInterest: number;
    totalCitations: number;
    recentActivity: number;
    knowledgeBase: KBStats;
  }

  interface RecentCase {
    id: string;
    title: string;
    caseNumber: string;
    status: string;
    priority: string;
    updatedAt: string;
  }

  interface KBResult {
    type: 'glossary' | 'statute' | 'precedent';
    title: string;
    snippet: string;
    similarity?: number;
  }

  let kbQuery = $state('');
  let kbResults = $state<KBResult[]>([]);
  let kbSearching = $state(false);
  let kbSearchTimer: ReturnType<typeof setTimeout> | undefined;

  function handleKBSearch(query: string) {
    kbQuery = query;
    if (kbSearchTimer) clearTimeout(kbSearchTimer);
    if (query.length < 2) { kbResults = []; return; }
    kbSearchTimer = setTimeout(() => runKBSearch(query), 400);
  }

  async function runKBSearch(query: string) {
    kbSearching = true;
    try {
      const [glossaryRes, statutesRes, precedentsRes] = await Promise.all([
        fetch('/api/glossary/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, limit: 3 }),
        }).catch(() => null),
        fetch('/api/statutes/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, limit: 3 }),
        }).catch(() => null),
        fetch('/api/precedents/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, limit: 3 }),
        }).catch(() => null),
      ]);

      const results: KBResult[] = [];

      if (glossaryRes?.ok) {
        const data = await glossaryRes.json();
        for (const item of (data.results ?? data ?? []).slice(0, 3)) {
          results.push({
            type: 'glossary',
            title: item.term ?? item.title ?? '',
            snippet: (item.definition ?? item.content ?? '').slice(0, 120),
            similarity: item.similarity,
          });
        }
      }

      if (statutesRes?.ok) {
        const data = await statutesRes.json();
        for (const item of (data.results ?? data ?? []).slice(0, 3)) {
          results.push({
            type: 'statute',
            title: item.section ? `${item.jurisdiction ?? ''} ${item.section}` : (item.title ?? ''),
            snippet: (item.content ?? item.chunk_content ?? '').slice(0, 120),
            similarity: item.similarity,
          });
        }
      }

      if (precedentsRes?.ok) {
        const data = await precedentsRes.json();
        for (const item of (data.results ?? data ?? []).slice(0, 3)) {
          results.push({
            type: 'precedent',
            title: item.title ?? item.case_title ?? '',
            snippet: (item.summary ?? item.content ?? '').slice(0, 120),
            similarity: item.similarity,
          });
        }
      }

      results.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
      kbResults = results;
    } catch {
      kbResults = [];
    } finally {
      kbSearching = false;
    }
  }

  let stats = $state<DashboardStats>({
    activeCases: 0,
    totalEvidence: 0,
    personsOfInterest: 0,
    totalCitations: 0,
    recentActivity: 0,
    knowledgeBase: { glossary: 0, statutes: 0, precedents: 0, total: 0 },
  });
  let recentCases = $state<RecentCase[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  const statusColors: Record<string, string> = {
    open: 'status-open',
    in_progress: 'status-progress',
    pending_review: 'status-pending',
    closed: 'status-closed',
    archived: 'status-archived',
  };

  const priorityColors: Record<string, string> = {
    critical: 'priority-critical',
    high: 'priority-high',
    medium: 'priority-medium',
    low: 'priority-low',
  };

  $effect(() => {
    const controller = new AbortController();
    loadDashboard(controller.signal);
    return () => controller.abort();
  });

  async function loadDashboard(signal?: AbortSignal) {
    loading = true;
    error = null;
    try {
      const [casesRes, statsRes] = await Promise.all([
        fetch('/api/cases?limit=10', { signal }),
        fetch('/api/dashboard/stats', { signal }).catch(() => null),
      ]);

      if (casesRes.status === 401) {
        await goto('/login');
        return;
      }

      if (casesRes.ok) {
        try {
          const data = await casesRes.json();
          const arr = data.cases ?? data.data?.cases ?? (Array.isArray(data.data) ? data.data : []);
          recentCases = arr.slice(0, 10);
          stats.activeCases = recentCases.filter((c: RecentCase) => c.status === 'open' || c.status === 'in_progress').length;
        } catch { /* cases parse failed — continue to stats */ }
      }

      if (statsRes?.ok) {
        const data = await statsRes.json();
        stats = { ...stats, ...data };
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      error = err instanceof Error ? err.message : 'Failed to load dashboard';
    } finally {
      loading = false;
    }
  }
</script>

<div class="dashboard-dark">
<LegalDisclaimer />

<div class="dashboard-page">
  <header class="dashboard-header">
    <div class="dash-header-left">
      <div class="dash-icon-badge">
        <Icon name="layout-dashboard" />
      </div>
      <div>
        <h1 class="dashboard-title">Dashboard</h1>
        <p class="dashboard-subtitle">Case management overview and recent activity</p>
      </div>
    </div>
    {#if stats}
      <div class="dash-stats-row">
        <span class="dash-stat">
          <Icon name="briefcase" />
          <strong>{stats.activeCases}</strong>
          <span>Active</span>
        </span>
        <span class="dash-divider"></span>
        <span class="dash-stat">
          <Icon name="file-search" />
          <strong>{stats.totalEvidence}</strong>
          <span>Evidence</span>
        </span>
        <span class="dash-divider"></span>
        <span class="dash-stat">
          <Icon name="scale" />
          <strong>{stats.totalCitations}</strong>
          <span>Citations</span>
        </span>
        <span class="dash-divider"></span>
        <span class="dash-stat">
          <Icon name="users" />
          <strong>{stats.personsOfInterest}</strong>
          <span>POI</span>
        </span>
      </div>
    {/if}
  </header>

  <FallbackAlert />

  <!-- ═══ WWWH USE CASE GENERATOR ═══ -->
  <div class="wwwh-section">
    <button class="wwwh-toggle" onclick={() => (wwwhCollapsed = !wwwhCollapsed)}>
      <span class="section-chevron" class:open={!wwwhCollapsed}>
        <Icon name="chevron-right" size={14} />
      </span>
      <div class="wwwh-toggle-left">
        <div class="wwwh-badge">
          <Icon name="file-plus" />
        </div>
        <div>
          <span class="wwwh-toggle-title">Use Case Generator</span>
          <span class="wwwh-toggle-sub">Who · What · Why · How</span>
        </div>
      </div>
    </button>

    {#if !wwwhCollapsed}
      <div class="wwwh-body">
        <!-- Notes Input -->
        <div class="wwwh-notes-area">
          <label class="wwwh-label" for="wwwh-notes">
            <Icon name="notebook-pen" size={14} />
            Raw Notes
          </label>
          <textarea
            id="wwwh-notes"
            class="wwwh-textarea"
            bind:value={wwwhNotes}
            placeholder="Paste your notes here...&#10;&#10;Supports tagged format:&#10;Who: John Smith&#10;What: Filed motion to suppress evidence&#10;Why: Illegal search and seizure&#10;How: Fourth Amendment violation&#10;Title: Motion to Suppress&#10;Location: District Court&#10;Date: 2026-03-18&#10;&#10;Or just paste plain text — it will go into the What field."
            rows="8"
          ></textarea>
          <div class="wwwh-btn-row">
            <button class="wwwh-btn primary" onclick={parseWWWHNotes}>
              <Icon name="sparkles" size={14} />
              Auto Fill From Notes
            </button>
            <button class="wwwh-btn ai" onclick={aiAnalyzeWWWH} disabled={wwwhAnalyzing}>
              <Icon name="brain" size={14} />
              {wwwhAnalyzing ? 'Analyzing...' : 'AI Extract'}
            </button>
            <button class="wwwh-btn" onclick={clearWWWH}>
              <Icon name="eraser" size={14} />
              Clear All
            </button>
          </div>
        </div>

        <!-- Parsed Fields Grid -->
        <div class="wwwh-grid">
          <div class="wwwh-field full">
            <label class="wwwh-label" for="wwwh-title"><Icon name="heading" size={14} /> Title</label>
            <input id="wwwh-title" class="wwwh-input" bind:value={wwwhTitle} placeholder="Auto-generated or enter manually" />
          </div>
          <div class="wwwh-field">
            <label class="wwwh-label" for="wwwh-who"><Icon name="user" size={14} /> Who</label>
            <input id="wwwh-who" class="wwwh-input" bind:value={wwwhWho} placeholder="Person, entity, or party" />
          </div>
          <div class="wwwh-field">
            <label class="wwwh-label" for="wwwh-what"><Icon name="file-text" size={14} /> What</label>
            <input id="wwwh-what" class="wwwh-input" bind:value={wwwhWhat} placeholder="Action, event, or filing" />
          </div>
          <div class="wwwh-field">
            <label class="wwwh-label" for="wwwh-why"><Icon name="help-circle" size={14} /> Why</label>
            <input id="wwwh-why" class="wwwh-input" bind:value={wwwhWhy} placeholder="Reason, cause, or basis" />
          </div>
          <div class="wwwh-field">
            <label class="wwwh-label" for="wwwh-how"><Icon name="wrench" size={14} /> How</label>
            <input id="wwwh-how" class="wwwh-input" bind:value={wwwhHow} placeholder="Method, mechanism, or procedure" />
          </div>
          <div class="wwwh-field">
            <label class="wwwh-label" for="wwwh-status"><Icon name="circle-dot" size={14} /> Status</label>
            <select id="wwwh-status" class="wwwh-input" bind:value={wwwhStatus}>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="pending_review">Pending Review</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div class="wwwh-field">
            <label class="wwwh-label" for="wwwh-loc"><Icon name="map-pin" size={14} /> Location</label>
            <input id="wwwh-loc" class="wwwh-input" bind:value={wwwhLocation} placeholder="Court, jurisdiction, venue" />
          </div>
          <div class="wwwh-field">
            <label class="wwwh-label" for="wwwh-date"><Icon name="calendar" size={14} /> Date</label>
            <input id="wwwh-date" class="wwwh-input" type="date" bind:value={wwwhDate} />
          </div>
        </div>

        <!-- Status Messages -->
        {#if wwwhError}
          <div class="wwwh-alert error">
            <Icon name="alert-circle" size={14} />
            <span>{wwwhError}</span>
            <button class="wwwh-alert-close" onclick={() => (wwwhError = '')}>&times;</button>
          </div>
        {/if}
        {#if wwwhSuccess}
          <div class="wwwh-alert success">
            <Icon name="check-circle" size={14} />
            <span>{wwwhSuccess}</span>
            <button class="wwwh-alert-close" onclick={() => (wwwhSuccess = '')}>&times;</button>
          </div>
        {/if}

        <!-- Summary -->
        {#if wwwhSummary}
          <div class="wwwh-summary">
            <span class="wwwh-summary-label"><Icon name="scroll-text" size={14} /> Generated Summary</span>
            <p class="wwwh-summary-text">{wwwhSummary}</p>
          </div>
        {/if}

        <!-- Create Case Action -->
        <div class="wwwh-action-row">
          <button
            class="wwwh-create-btn"
            onclick={createCaseFromWWWH}
            disabled={wwwhSaving || (!wwwhTitle.trim() && !wwwhWhat.trim())}
          >
            {#if wwwhSaving}
              <Icon name="loader" size={16} />
              Creating Case...
            {:else}
              <Icon name="plus-circle" size={16} />
              Create Case & Save to DB
            {/if}
          </button>
          <a class="wwwh-link-btn" href="/cases/new">
            <Icon name="external-link" size={14} />
            Open Full Intake Form
          </a>
        </div>
      </div>
    {/if}
  </div>

  {#if documentProgressStore.isProcessing}
    <div class="progress-section">
      <ProgressCard />
      {#if documentProgressStore.pageStatusesArray.length > 0}
        <div class="progress-thumbs">
          <DocumentThumbnailTray />
        </div>
      {/if}
    </div>
  {/if}

  {#if loading}
    <!-- Stats Grid Skeletons -->
    <div class="skeleton-stats-grid">
      {#each Array(6) as _, i}
        <div class="skeleton-stat-card">
          <Skeleton variant="text" width="60%" height="2rem" className="mb-2 mx-auto" />
          <Skeleton variant="text" width="80%" height="0.75rem" className="mx-auto" />
        </div>
      {/each}
    </div>

    <!-- Knowledge Base Skeleton -->
    <div class="skeleton-card">
      <div class="card-header-row">
        <Skeleton variant="text" width="120px" height="1em" />
        <div class="skeleton-pills">
          <Skeleton variant="text" width="60px" height="0.75em" />
          <Skeleton variant="text" width="70px" height="0.75em" />
          <Skeleton variant="text" width="80px" height="0.75em" />
        </div>
      </div>
      <Skeleton variant="rect" height="42px" />
    </div>

    <!-- Recent Cases Skeleton -->
    <div class="skeleton-card">
      <Skeleton variant="text" width="100px" height="1em" />
      <div class="skeleton-case-list">
        {#each Array(5) as _, i}
          <div class="skeleton-case-row">
            <Skeleton variant="text" width="80px" height="0.875em" />
            <Skeleton variant="text" width="40%" height="0.875em" />
            <Skeleton variant="text" width="60px" height="0.75em" />
            <Skeleton variant="text" width="50px" height="0.75em" />
          </div>
        {/each}
      </div>
    </div>
  {:else}
    {#if error}
      <div class="error-card">
        <p class="error-text">{error}</p>
        <Button onclick={() => loadDashboard()}>Retry</Button>
      </div>
    {/if}

    <!-- ═══ CORE ═══ -->
    <button class="section-header" onclick={() => { coreCollapsed = !coreCollapsed; saveCollapseState(); }}>
      <span class="section-chevron" class:open={!coreCollapsed}>
        <Icon name="chevron-right" size={14} />
      </span>
      <span class="section-label">Core</span>
    </button>

    {#if !coreCollapsed}
      <!-- Stats Grid -->
      <div class="dash-stats-grid">
        {#each [
          { label: 'Active Cases', value: stats.activeCases, icon: 'briefcase', variant: 'warning' as const },
          { label: 'Total Evidence', value: stats.totalEvidence, icon: 'file-text', variant: 'default' as const },
          { label: 'Persons of Interest', value: stats.personsOfInterest, icon: 'users', variant: 'error' as const },
          { label: 'Citations', value: stats.totalCitations, icon: 'bookmark', variant: 'default' as const },
          { label: 'Knowledge Base', value: stats.knowledgeBase.total, icon: 'database', variant: 'success' as const },
          { label: 'Total Cases', value: stats.recentActivity, icon: 'folder', variant: 'default' as const },
        ] as stat}
          <StatsCard icon={stat.icon} label={stat.label} value={stat.value} variant={stat.variant} />
        {/each}
      </div>

      <!-- Investigation Progress (Gamification) -->
      <div class="section-gap">
        <GamificationWidget {stats} {recentCases} />
      </div>

      <!-- Pipeline Overview -->
      <div class="section-gap">
        <PipelineOverview />
      </div>

      <!-- Recent Cases -->
      <div class="dashboard-card section-gap">
        <div class="card-inner">
          <div class="card-header-row">
            <span class="card-title">Recent Cases</span>
            <Button onclick={() => goto('/cases')} class="text-xs">View All</Button>
          </div>

          {#if recentCases.length === 0}
            <p class="empty-cases">No cases found</p>
          {:else}
            <div class="case-list">
              {#each recentCases as caseItem}
                <button
                  class="case-item"
                  onclick={(e) => openCaseModal(e, caseItem.id)}
                >
                  <div class="case-item-left">
                    <span class="case-number">{caseItem.caseNumber}</span>
                    <span class="case-title-text">{caseItem.title}</span>
                  </div>
                  <div class="case-item-right">
                    <span class={priorityColors[caseItem.priority] ?? 'priority-low'}>
                      {caseItem.priority}
                    </span>
                    <span class={statusColors[caseItem.status] ?? 'status-closed'}>
                      {caseItem.status.replace('_', ' ')}
                    </span>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Active Cases Widget -->
      <div class="section-gap">
        <ActiveCasesWidget />
      </div>

      <!-- Recent Activity Feed -->
      <div class="section-gap">
        <RecentActivity />
      </div>
    {/if}

    <!-- ═══ TOOLS ═══ -->
    <button class="section-header" onclick={() => { toolsCollapsed = !toolsCollapsed; saveCollapseState(); }}>
      <span class="section-chevron" class:open={!toolsCollapsed}>
        <Icon name="chevron-right" size={14} />
      </span>
      <span class="section-label">Tools</span>
    </button>

    {#if !toolsCollapsed}
      <!-- Knowledge Base -->
      <div class="dashboard-card">
        <div class="card-inner">
          <div class="card-header-row">
            <span class="card-title">Knowledge Base</span>
            <div class="kb-pills">
              <span>{stats.knowledgeBase.glossary} terms</span>
              <span>{stats.knowledgeBase.statutes} statutes</span>
              <span>{stats.knowledgeBase.precedents} precedents</span>
            </div>
          </div>

          <div class="kb-search-wrap">
            <Icon name="search" size={16} class="kb-search-icon" />
            <input
              type="text"
              placeholder="Search glossary, statutes, precedents..."
              value={kbQuery}
              oninput={(e) => handleKBSearch((e.target as HTMLInputElement).value)}
              class="kb-search-input"
            />
            {#if kbSearching}
              <Icon name="loader-circle" size={14} class="kb-search-spinner" />
            {/if}
          </div>

          {#if kbResults.length > 0}
            <div class="kb-results">
              {#each kbResults as result}
                <button
                  class="kb-result-item"
                  onclick={() => goto('/citations')}
                >
                  <span class="kb-type-badge kb-type-{result.type}">
                    {result.type === 'glossary' ? 'GLO' : result.type === 'statute' ? 'STT' : 'PRE'}
                  </span>
                  <div class="kb-result-text">
                    <p class="kb-result-title">{result.title}</p>
                    <p class="kb-result-snippet">{result.snippet}...</p>
                  </div>
                  {#if result.similarity}
                    <span class="kb-similarity">{(result.similarity * 100).toFixed(0)}%</span>
                  {/if}
                </button>
              {/each}
            </div>
          {:else if kbQuery.length >= 2 && !kbSearching}
            <p class="kb-no-results">No results for "{kbQuery}"</p>
          {:else}
            <div class="kb-summary-grid">
              <button onclick={() => goto('/citations')} class="kb-summary-btn">
                <p class="kb-summary-value" style="color: var(--accent, #c8a84b);">{stats.knowledgeBase.glossary}</p>
                <p class="kb-summary-label">Glossary Terms</p>
              </button>
              <button onclick={() => goto('/citations')} class="kb-summary-btn">
                <p class="kb-summary-value" style="color: #60a5fa;">{stats.knowledgeBase.statutes}</p>
                <p class="kb-summary-label">Statutes</p>
              </button>
              <button onclick={() => goto('/citations')} class="kb-summary-btn">
                <p class="kb-summary-value" style="color: #f59e0b;">{stats.knowledgeBase.precedents}</p>
                <p class="kb-summary-label">Precedents</p>
              </button>
            </div>
          {/if}
        </div>
      </div>

      <!-- Workspace -->
      <div class="section-gap">
        <WorkspacePanel workspaceId="dashboard" />
      </div>

      <!-- System Status -->
      <div class="section-gap">
        <SystemStatusPanel />
      </div>
    {/if}

    <!-- ═══ DEV ═══ -->
    <button class="section-header" onclick={() => { devCollapsed = !devCollapsed; saveCollapseState(); }}>
      <span class="section-chevron" class:open={!devCollapsed}>
        <Icon name="chevron-right" size={14} />
      </span>
      <span class="section-label">Dev</span>
    </button>

    {#if !devCollapsed}
      <!-- Data Visualization -->
      <div class="section-gap">
        <YoRHaDataViz
          title="Case Activity Overview"
          data={[
            { label: 'Active Cases', value: stats.activeCases, status: 'active', color: '#c8a84b' },
            { label: 'Evidence', value: stats.totalEvidence, status: 'pending', color: '#ecc94b' },
            { label: 'POIs', value: stats.personsOfInterest, status: 'active', color: '#60a5fa' },
            { label: 'Citations', value: stats.totalCitations, status: 'completed', color: '#d4c7a3' },
            { label: 'KB', value: stats.knowledgeBase.total, status: 'completed', color: '#a78bfa' },
            { label: 'Total Cases', value: stats.recentActivity, status: 'active', color: '#38bdf8' },
          ]}
          type="bar"
          height={250}
          animated={true}
        />
      </div>

      <!-- Component Demos -->
      <div class="section-gap">
        <div class="dashboard-card">
          <div class="card-inner">
            <span class="card-title">Component Demos</span>
            <p class="demos-desc">Access the 20 largest components wired across the app</p>
            <div class="demos-grid">
              {#each [
                { href: '/evidence', label: 'Evidence Hub', desc: 'CustodyFlow, Summarizer, FileUpload, Connections', count: 4 },
                { href: '/admin/ai-dashboard', label: 'AI Dashboard', desc: 'ContextualChat, EnhancedAIChat, Gemma, Streaming', count: 4 },
                { href: '/admin/all-routes', label: 'Route Inspector', desc: 'Inspector, Detective, Working, Graph, OpsLog', count: 5 },
                { href: '/cases/new', label: 'New Case Form', desc: 'CaseForm with WHO/WHAT/WHY auto-populator', count: 1 },
                { href: '/active-cases', label: 'Active Cases', desc: 'CaseScoringDashboard with AI risk analysis', count: 1 },
                { href: '/analysis-center', label: 'Analysis Center', desc: 'ContractAnalyzer, HybridBoard whiteboard', count: 2 },
                { href: '/global-search', label: 'Global Search', desc: 'VectorIntelligenceDemo semantic search', count: 1 },
                { href: '/persons-of-interest', label: 'Persons of Interest', desc: 'POI DetailView with threat scoring', count: 1 },
                { href: '/demos/evidence-canvas', label: 'Evidence Canvas', desc: '6 visualization engines + architecture panel', count: 1 },
                { href: '/demos/nier-showcase', label: 'NieR Showcase', desc: 'YoRHa Command Center, Terminal, Dialogs', count: 4 },
                { href: '/system-configuration', label: 'System Status', desc: 'Health dashboard with 6 StatusCards', count: 3 },
                { href: '/demos/ace-pipeline', label: 'ACE Pipeline', desc: 'Context bubbles, RAG chart, cache tiers', count: 3 },
                { href: '/demos', label: 'All Demos', desc: 'Cache, Bits UI, NES, GPU, Icons, ACE', count: 6 },
              ] as demo}
                <a href={demo.href} class="demo-card">
                  <div class="demo-card-header">
                    <span class="demo-label">{demo.label}</span>
                    <span class="demo-count">{demo.count}</span>
                  </div>
                  <p class="demo-desc">{demo.desc}</p>
                </a>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <!-- NES Route Navigator -->
      <div class="section-gap nes-route-nav">
        <div class="nes-nav-header">
          <span class="nes-nav-title">ROUTE NAVIGATOR</span>
          <a href="/admin/all-routes" class="nes-nav-link">VIEW ALL &rarr;</a>
        </div>
        <div class="nes-nav-grid">
          {#each [
            { href: '/cases', label: '/cases', kind: 'page', icon: 'doc' },
            { href: '/evidence', label: '/evidence', kind: 'page', icon: 'doc' },
            { href: '/citations', label: '/citations', kind: 'page', icon: 'doc' },
            { href: '/persons-of-interest', label: '/poi', kind: 'page', icon: 'doc' },
            { href: '/admin/ai-dashboard', label: '/ai', kind: 'page', icon: 'ai' },
            { href: '/global-search', label: '/search', kind: 'page', icon: 'doc' },
            { href: '/admin/all-routes', label: '/all-routes', kind: 'endpoint', icon: 'endpoint' },
            { href: '/terminal', label: '/terminal', kind: 'page', icon: 'endpoint' },
            { href: '/analysis-center', label: '/analysis', kind: 'page', icon: 'ai' },
            { href: '/system-configuration', label: '/config', kind: 'endpoint', icon: 'layout' },
            { href: '/demos', label: '/demos', kind: 'layout', icon: 'layout' },
            { href: '/command-center', label: '/cmd', kind: 'page', icon: 'endpoint' },
          ] as route}
            <a href={route.href} class="nes-nav-card">
              <div class="nes-nav-icon">
                {#if route.icon === 'endpoint'}
                  <svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="10" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="5" y="6" width="2" height="2" fill="currentColor"/><rect x="9" y="6" width="2" height="2" fill="currentColor"/><line x1="4" y1="10" x2="12" y2="10" stroke="currentColor" stroke-width="1"/></svg>
                {:else if route.icon === 'layout'}
                  <svg viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="12" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="1" y1="5" x2="15" y2="5" stroke="currentColor" stroke-width="1"/><line x1="6" y1="5" x2="6" y2="14" stroke="currentColor" stroke-width="1"/></svg>
                {:else if route.icon === 'ai'}
                  <svg viewBox="0 0 16 16"><circle cx="8" cy="6" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M4 12c0-2.2 1.8-4 4-4s4 1.8 4 4" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="6" y="1" width="4" height="2" fill="currentColor"/></svg>
                {:else}
                  <svg viewBox="0 0 16 16"><rect x="3" y="1" width="10" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="5" y1="4" x2="11" y2="4" stroke="currentColor" stroke-width="1"/><line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" stroke-width="1"/><line x1="5" y1="10" x2="9" y2="10" stroke="currentColor" stroke-width="1"/></svg>
                {/if}
              </div>
              <span class="nes-nav-label">{route.label}</span>
            </a>
          {/each}
        </div>
      </div>
    {/if}

  {/if}
</div>
</div>

<!-- Floating AI Assistant Button -->
<AIAssistantButton variant="floating" position="bottom-right" />

<!-- Ctrl+N shortcut -->
<svelte:window onkeydown={handleGlobalKeydown} />

<style>
  /* Full-bleed dark wrapper -- fills parent flex container */
  .dashboard-dark {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--t-bg, #0e0d0b);
    margin: -2.5rem;
    padding: 2.5rem;
    color: var(--t-text, rgb(212 199 163));
  }

  /* Neutralize root layout light-theme globals */
  .dashboard-dark :global(h1),
  .dashboard-dark :global(h2),
  .dashboard-dark :global(h3),
  .dashboard-dark :global(h4),
  .dashboard-dark :global(p) {
    color: inherit;
    text-transform: none;
    letter-spacing: normal;
    margin: 0;
  }

  .dashboard-dark :global(a) {
    color: inherit;
    border-bottom: none;
  }

  .dashboard-dark :global(button) {
    text-transform: none;
    letter-spacing: normal;
    background: none;
    border: none;
    box-shadow: none;
    padding: 0;
    color: inherit;
  }

  .dashboard-dark :global(input),
  .dashboard-dark :global(select) {
    background: transparent;
    border: none;
    box-shadow: none;
    color: inherit;
  }

  .dashboard-dark :global(.panel),
  .dashboard-dark :global(.card),
  .dashboard-dark :global([class*="panel"]) {
    background: transparent;
    border: none;
    box-shadow: none;
    color: inherit;
    padding: 0;
  }

  /* Page container */
  .dashboard-page {
    flex: 1;
    max-width: 72rem;
    width: 100%;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  /* Header */
  .dashboard-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.5rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }

  .dash-header-left {
    display: flex;
    align-items: flex-start;
    gap: 0.875rem;
  }

  .dash-icon-badge {
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

  .dashboard-title {
    font-size: 1.375rem;
    font-weight: 700;
    color: rgb(212 199 163 / 0.95);
    margin: 0;
    line-height: 1.3;
  }

  .dashboard-subtitle {
    color: rgb(212 199 163 / 0.4);
    font-size: 0.75rem;
    margin-top: 0.125rem;
  }

  .dash-stats-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(212, 199, 163, 0.08);
    border-radius: 0.5rem;
  }

  .dash-stat {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.6875rem;
    color: rgba(212, 199, 163, 0.5);
  }

  .dash-stat strong {
    color: rgba(212, 199, 163, 0.85);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .dash-divider {
    width: 1px;
    height: 1rem;
    background: rgba(212, 199, 163, 0.12);
  }

  /* Section headers (collapsible groups) */
  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.625rem 0;
    margin-top: 2rem;
    margin-bottom: 1rem;
    background: none;
    border: none;
    border-bottom: 1px solid rgba(212, 199, 163, 0.1);
    cursor: pointer;
    color: rgb(212 199 163 / 0.6);
    transition: color 0.15s;
  }

  .section-header:first-of-type {
    margin-top: 0;
  }

  .section-header:hover {
    color: rgb(212 199 163);
  }

  .section-chevron {
    display: inline-flex;
    transition: transform 0.2s ease;
  }

  .section-chevron.open {
    transform: rotate(90deg);
  }

  .section-label {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  /* Section spacing */
  .section-gap {
    margin-top: 2rem;
  }

  .progress-section {
    margin-bottom: 1.5rem;
  }

  .progress-thumbs {
    margin-top: 0.75rem;
  }

  /* Stats Grid */
  .dash-stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }

  @media (max-width: 640px) {
    .dash-stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .dash-stat-card {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(212, 199, 163, 0.12);
    border-radius: 10px;
    padding: 1.25rem 1rem;
    text-align: center;
    transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  }

  .dash-stat-card:hover {
    border-color: rgba(212, 199, 163, 0.25);
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  }

  .dash-stat-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    margin-bottom: 0.625rem;
  }

  .dash-stat-num {
    font-size: 2rem;
    font-weight: 800;
    color: #d4c7a3;
    line-height: 1.1;
    margin: 0;
  }

  .dash-stat-label {
    font-size: 0.7rem;
    font-weight: 600;
    color: rgba(212, 199, 163, 0.5);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: 0.35rem;
  }

  /* Skeleton loading */
  .skeleton-stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }

  @media (min-width: 768px) {
    .skeleton-stats-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .skeleton-stat-card {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(212, 199, 163, 0.1);
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
  }

  .skeleton-card {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(212, 199, 163, 0.1);
    border-radius: 8px;
    padding: 1.25rem;
    margin-bottom: 2rem;
  }

  .skeleton-pills {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .skeleton-case-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .skeleton-case-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  /* Error */
  .error-card {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
    margin-bottom: 1rem;
  }

  .error-text {
    color: #ef4444;
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
  }

  /* Dashboard card (shared) */
  .dashboard-card {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(212, 199, 163, 0.1);
    border-radius: 8px;
    overflow: hidden;
  }

  .card-inner {
    padding: 1.25rem;
  }

  .card-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .card-title {
    font-size: 0.875rem;
    color: rgb(212 199 163 / 0.8);
    font-weight: 600;
  }

  /* Knowledge Base */
  .kb-pills {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.75rem;
    color: rgb(212 199 163 / 0.5);
  }

  .kb-search-wrap {
    position: relative;
    margin-bottom: 1rem;
  }

  .kb-search-wrap :global(.kb-search-icon) {
    position: absolute;
    left: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: rgb(212 199 163 / 0.4);
  }

  .kb-search-input {
    width: 100%;
    padding: 0.625rem 1rem 0.625rem 2.5rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(212, 199, 163, 0.1);
    border-radius: 0.25rem;
    font-size: 0.875rem;
    color: rgb(212 199 163);
  }

  .kb-search-input::placeholder {
    color: rgb(212 199 163 / 0.3);
  }

  .kb-search-input:focus {
    outline: none;
    border-color: rgba(200, 168, 75, 0.4);
  }

  .kb-search-wrap :global(.kb-search-spinner) {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: rgb(212 199 163 / 0.4);
  }

  .kb-results {
    display: grid;
    gap: 0.5rem;
    max-height: 20rem;
    overflow-y: auto;
  }

  .kb-result-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 0.25rem;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 150ms;
  }

  .kb-result-item:hover {
    background: rgba(0, 0, 0, 0.3);
  }

  .kb-type-badge {
    flex-shrink: 0;
    margin-top: 0.125rem;
    padding: 0.0625rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 10px;
    font-family: monospace;
    text-transform: uppercase;
  }

  .kb-type-glossary {
    background: rgba(200, 168, 75, 0.1);
    color: var(--accent, #c8a84b);
  }

  .kb-type-statute {
    background: rgba(96, 165, 250, 0.1);
    color: #60a5fa;
  }

  .kb-type-precedent {
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
  }

  .kb-result-text {
    min-width: 0;
  }

  .kb-result-title {
    font-size: 0.875rem;
    color: rgb(212 199 163);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kb-result-snippet {
    font-size: 0.75rem;
    color: rgb(212 199 163 / 0.4);
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .kb-similarity {
    flex-shrink: 0;
    font-size: 10px;
    color: rgb(212 199 163 / 0.3);
    font-family: monospace;
  }

  .kb-no-results {
    color: rgb(212 199 163 / 0.3);
    font-size: 0.75rem;
    text-align: center;
    padding: 1rem 0;
  }

  .kb-summary-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
  }

  .kb-summary-btn {
    padding: 0.5rem 0.75rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 0.25rem;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 150ms;
  }

  .kb-summary-btn:hover {
    background: rgba(0, 0, 0, 0.3);
  }

  .kb-summary-value {
    font-size: 1.125rem;
    font-weight: 700;
    margin: 0;
  }

  .kb-summary-label {
    font-size: 0.75rem;
    color: rgb(212 199 163 / 0.4);
    margin: 0;
  }

  /* Recent Cases */
  .empty-cases {
    color: rgb(212 199 163 / 0.4);
    text-align: center;
    padding: 2rem 0;
  }

  .case-list {
    display: grid;
    gap: 0.5rem;
  }

  .case-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 0.25rem;
    font-size: 0.875rem;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background-color 150ms;
  }

  .case-item:hover {
    background: rgba(0, 0, 0, 0.3);
  }

  .case-item-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .case-number {
    font-family: monospace;
    font-size: 0.75rem;
    color: rgb(212 199 163 / 0.4);
  }

  .case-title-text {
    color: rgb(212 199 163);
  }

  .case-item-right {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.75rem;
  }

  /* Status colors */
  .status-open { color: var(--accent, #c8a84b); }
  .status-progress { color: #60a5fa; }
  .status-pending { color: #f59e0b; }
  .status-closed { color: rgb(212 199 163 / 0.4); }
  .status-archived { color: rgb(212 199 163 / 0.3); }

  /* Priority colors */
  .priority-critical { color: #ef4444; }
  .priority-high { color: #f59e0b; }
  .priority-medium { color: #60a5fa; }
  .priority-low { color: rgb(212 199 163 / 0.6); }

  /* Component Demos */
  .demos-desc {
    color: rgb(212 199 163 / 0.4);
    font-size: 0.75rem;
    margin-bottom: 1rem;
  }

  .demos-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  @media (min-width: 768px) {
    .demos-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (min-width: 1024px) {
    .demos-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .demo-card {
    display: block;
    padding: 0.625rem 0.75rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 0.25rem;
    text-decoration: none;
    transition: background-color 150ms;
  }

  .demo-card:hover {
    background: rgba(0, 0, 0, 0.3);
  }

  .demo-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.25rem;
  }

  .demo-label {
    color: rgb(212 199 163);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .demo-count {
    font-size: 0.75rem;
    color: var(--accent, #c8a84b);
    font-family: monospace;
  }

  .demo-desc {
    color: rgb(212 199 163 / 0.4);
    font-size: 0.75rem;
    margin: 0;
  }

  /* NES Route Navigator */
  .nes-route-nav {
    background: #0d0d2a;
    border: 1px solid #2a2a5a;
    border-radius: 6px;
    overflow: hidden;
    font-family: 'Press Start 2P', 'Courier New', monospace;
  }

  .nes-nav-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 0.8rem;
    border-bottom: 1px solid #2a2a5a;
    background: #10102a;
  }

  .nes-nav-title {
    font-size: 0.65rem;
    color: #c0c0ff;
    letter-spacing: 0.15em;
    font-weight: bold;
  }

  .nes-nav-link {
    font-size: 0.55rem;
    color: #4040c0;
    text-decoration: none;
    letter-spacing: 0.1em;
    transition: color 0.15s;
  }

  .nes-nav-link:hover {
    color: #c0c0ff;
  }

  .nes-nav-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .nes-nav-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 0.6rem 0.4rem;
    background: #10102a;
    border: 1px solid #2a2a5a;
    color: #c0c0ff;
    text-decoration: none;
    font-size: 0.5rem;
    text-align: center;
    transition: all 0.15s;
    cursor: pointer;
  }

  .nes-nav-card:hover {
    border-color: #4040c0;
    background: #15153a;
    box-shadow: 0 0 6px rgba(64, 64, 192, 0.2);
  }

  .nes-nav-icon {
    width: 20px;
    height: 20px;
    color: #6060a0;
  }

  .nes-nav-icon svg {
    width: 100%;
    height: 100%;
  }

  .nes-nav-label {
    font-size: 0.5rem;
    color: #c0c0ff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  /* ═══ WWWH Use Case Generator ═══ */
  .wwwh-section {
    margin-bottom: 1.5rem;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(212, 199, 163, 0.12);
    border-radius: 10px;
    overflow: hidden;
  }

  .wwwh-toggle {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.875rem 1rem;
    background: none;
    border: none;
    cursor: pointer;
    color: rgba(212, 199, 163, 0.8);
    transition: background 0.15s;
  }

  .wwwh-toggle:hover {
    background: rgba(212, 199, 163, 0.04);
  }

  .wwwh-toggle-left {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }

  .wwwh-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.5rem;
    background: linear-gradient(135deg, rgba(52, 211, 153, 0.12), rgba(96, 165, 250, 0.12));
    border: 1px solid rgba(52, 211, 153, 0.25);
    color: rgba(52, 211, 153, 0.9);
    flex-shrink: 0;
  }

  .wwwh-toggle-title {
    display: block;
    font-size: 0.875rem;
    font-weight: 600;
    color: rgba(212, 199, 163, 0.9);
  }

  .wwwh-toggle-sub {
    display: block;
    font-size: 0.625rem;
    color: rgba(212, 199, 163, 0.35);
    letter-spacing: 0.05em;
  }

  .wwwh-body {
    padding: 0 1rem 1rem;
  }

  .wwwh-notes-area {
    margin-bottom: 1rem;
  }

  .wwwh-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.6875rem;
    font-weight: 600;
    color: rgba(212, 199, 163, 0.55);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.375rem;
  }

  .wwwh-textarea {
    width: 100%;
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(212, 199, 163, 0.1);
    border-radius: 0.375rem;
    color: rgba(212, 199, 163, 0.9);
    font-size: 0.875rem;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    line-height: 1.6;
    resize: vertical;
    min-height: 10rem;
  }

  .wwwh-textarea::placeholder {
    color: rgba(212, 199, 163, 0.2);
  }

  .wwwh-textarea:focus {
    outline: none;
    border-color: rgba(52, 211, 153, 0.4);
    box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.08);
  }

  .wwwh-btn-row {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.625rem;
  }

  .wwwh-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.875rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    border: 1px solid rgba(212, 199, 163, 0.15);
    background: rgba(212, 199, 163, 0.06);
    color: rgba(212, 199, 163, 0.7);
    cursor: pointer;
    transition: all 0.15s;
  }

  .wwwh-btn:hover {
    background: rgba(212, 199, 163, 0.1);
    color: rgba(212, 199, 163, 0.9);
  }

  .wwwh-btn.primary {
    background: rgba(52, 211, 153, 0.12);
    border-color: rgba(52, 211, 153, 0.3);
    color: rgba(52, 211, 153, 0.95);
  }

  .wwwh-btn.primary:hover {
    background: rgba(52, 211, 153, 0.2);
  }

  /* Fields Grid */
  .wwwh-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .wwwh-field.full {
    grid-column: 1 / -1;
  }

  .wwwh-input {
    width: 100%;
    padding: 0.5rem 0.625rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(212, 199, 163, 0.1);
    border-radius: 0.375rem;
    color: rgba(212, 199, 163, 0.9);
    font-size: 0.8125rem;
  }

  .wwwh-input::placeholder {
    color: rgba(212, 199, 163, 0.2);
  }

  .wwwh-input:focus {
    outline: none;
    border-color: rgba(96, 165, 250, 0.4);
  }

  select.wwwh-input {
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='%23d4c7a366' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m2 4 4 4 4-4'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.5rem center;
    padding-right: 1.75rem;
  }

  /* Summary */
  .wwwh-summary {
    background: rgba(96, 165, 250, 0.05);
    border: 1px solid rgba(96, 165, 250, 0.15);
    border-radius: 0.5rem;
    padding: 0.75rem;
  }

  .wwwh-summary-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.625rem;
    font-weight: 600;
    color: rgba(96, 165, 250, 0.7);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.375rem;
  }

  .wwwh-summary-text {
    font-size: 1rem;
    line-height: 1.6;
    color: rgba(212, 199, 163, 0.9);
    margin: 0;
  }

  /* AI button */
  .wwwh-btn.ai {
    background: rgba(167, 139, 250, 0.15);
    color: #c4b5fd;
    border-color: rgba(167, 139, 250, 0.3);
  }
  .wwwh-btn.ai:hover:not(:disabled) {
    background: rgba(167, 139, 250, 0.25);
    border-color: rgba(167, 139, 250, 0.5);
  }
  .wwwh-btn.ai:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  /* Alert banners */
  .wwwh-alert {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.875rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    line-height: 1.4;
  }
  .wwwh-alert.error {
    background: rgba(248, 113, 113, 0.1);
    border: 1px solid rgba(248, 113, 113, 0.3);
    color: #fca5a5;
  }
  .wwwh-alert.success {
    background: rgba(52, 211, 153, 0.1);
    border: 1px solid rgba(52, 211, 153, 0.3);
    color: #6ee7b7;
  }
  .wwwh-alert-close {
    margin-left: auto;
    background: none;
    border: none;
    color: inherit;
    font-size: 1.125rem;
    cursor: pointer;
    opacity: 0.7;
    padding: 0 0.25rem;
  }
  .wwwh-alert-close:hover {
    opacity: 1;
  }

  /* Create Case action row */
  .wwwh-action-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(212, 199, 163, 0.08);
  }
  .wwwh-create-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
    background: linear-gradient(135deg, rgba(52, 211, 153, 0.2), rgba(96, 165, 250, 0.2));
    color: #6ee7b7;
    border: 1px solid rgba(52, 211, 153, 0.35);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .wwwh-create-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(52, 211, 153, 0.3), rgba(96, 165, 250, 0.3));
    border-color: rgba(52, 211, 153, 0.55);
    box-shadow: 0 0 12px rgba(52, 211, 153, 0.15);
  }
  .wwwh-create-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .wwwh-link-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    color: rgba(212, 199, 163, 0.6);
    font-size: 0.75rem;
    text-decoration: none;
    border-radius: 0.375rem;
    transition: all 0.2s;
  }
  .wwwh-link-btn:hover {
    color: rgba(212, 199, 163, 0.9);
    background: rgba(212, 199, 163, 0.06);
  }

  @media (max-width: 640px) {
    .wwwh-grid {
      grid-template-columns: 1fr;
    }
    .wwwh-action-row {
      flex-direction: column;
      align-items: stretch;
    }
    .wwwh-create-btn {
      justify-content: center;
    }
  }
</style>
