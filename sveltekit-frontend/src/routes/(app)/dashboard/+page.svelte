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
  import Card from '$lib/components/ui/card/Card.svelte';
  import CardContent from '$lib/components/ui/card/CardContent.svelte';
  import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
  import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
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
  import CommandPalette from '$lib/components/ui/CommandPalette.svelte';
  import ActiveCasesWidget from '$lib/components/yorha/dashboard/ActiveCasesWidget.svelte';
  import YoRHaDataViz from '$lib/components/yorha/_simulations/YoRHaDataViz.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  let showCommandPalette = $state(false);

  function handleGlobalKeydown(e: KeyboardEvent) {
    // Ctrl/Cmd + K: Toggle command palette (global search)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      showCommandPalette = !showCommandPalette;
    }

    // Ctrl/Cmd + N: Create new case
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

  // KB search state
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

      // Sort by similarity if available
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
    open: 'text-accent',
    in_progress: 'text-info',
    pending_review: 'text-warning',
    closed: 'text-sand/40',
    archived: 'text-sand/30',
  };

  const priorityColors: Record<string, string> = {
    critical: 'text-danger',
    high: 'text-warning',
    medium: 'text-info',
    low: 'text-sand/60',
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

<LegalDisclaimer />

<div class="max-w-6xl mx-auto px-4 py-8">
  <header class="mb-8 text-center">
    <h1 class="text-3xl font-bold text-sand mb-2">Dashboard</h1>
    <p class="text-sand/60 text-sm">Case management overview and recent activity</p>
  </header>

  <FallbackAlert />

  {#if documentProgressStore.isProcessing}
    <div class="mb-6">
      <ProgressCard />
      {#if documentProgressStore.pageStatusesArray.length > 0}
        <div class="mt-3">
          <DocumentThumbnailTray />
        </div>
      {/if}
    </div>
  {/if}

  {#if loading}
    <!-- Stats Grid Skeletons -->
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
      {#each Array(6) as _, i}
        <Card class="bg-panel border-sand/10">
          <CardContent class="p-4 text-center">
            <Skeleton variant="text" width="60%" height="2rem" className="mb-2 mx-auto" />
            <Skeleton variant="text" width="80%" height="0.75rem" className="mx-auto" />
          </CardContent>
        </Card>
      {/each}
    </div>

    <!-- Knowledge Base Skeleton -->
    <Card class="bg-panel border-sand/10 mb-8">
      <CardHeader>
        <div class="flex items-center justify-between">
          <Skeleton variant="text" width="120px" height="1em" />
          <div class="flex items-center gap-3">
            <Skeleton variant="text" width="60px" height="0.75em" />
            <Skeleton variant="text" width="70px" height="0.75em" />
            <Skeleton variant="text" width="80px" height="0.75em" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton variant="rect" height="42px" className="mb-4" />
      </CardContent>
    </Card>

    <!-- Recent Cases Skeleton -->
    <Card class="bg-panel border-sand/10 mb-8">
      <CardHeader>
        <CardTitle class="text-sm text-sand/80">
          <Skeleton variant="text" width="100px" height="1em" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-3">
          {#each Array(5) as _, i}
            <div class="flex items-center gap-3">
              <Skeleton variant="text" width="80px" height="0.875em" />
              <Skeleton variant="text" width="40%" height="0.875em" className="flex-1" />
              <Skeleton variant="text" width="60px" height="0.75em" />
              <Skeleton variant="text" width="50px" height="0.75em" />
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>
  {:else}
    {#if error}
      <Card class="mb-4 bg-panel border-danger/40">
        <CardContent class="p-4 text-center">
          <p class="text-danger text-sm">{error}</p>
          <Button onclick={() => loadDashboard()} class="mt-2">Retry</Button>
        </CardContent>
      </Card>
    {/if}

    <!-- Stats Grid -->
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 2rem;">
      {#each [
        { label: 'Active Cases', value: stats.activeCases, icon: 'briefcase', color: '#c8a84b' },
        { label: 'Total Evidence', value: stats.totalEvidence, icon: 'file-text', color: '#60a5fa' },
        { label: 'Persons of Interest', value: stats.personsOfInterest, icon: 'users', color: '#f87171' },
        { label: 'Citations', value: stats.totalCitations, icon: 'bookmark', color: '#a78bfa' },
        { label: 'Knowledge Base', value: stats.knowledgeBase.total, icon: 'database', color: '#34d399' },
        { label: 'Total Cases', value: stats.recentActivity, icon: 'folder', color: '#38bdf8' },
      ] as stat}
        <div style="background: rgba(0,0,0,0.35); border: 1px solid rgba(212,199,163,0.12); border-radius: 8px; padding: 1.25rem 1rem; text-align: center; transition: border-color 0.2s;">
          <div style="display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; background: rgba(212,199,163,0.08); margin-bottom: 0.5rem;">
            <span class="i-lucide-{stat.icon} inline-block" style="width:18px;height:18px;color:{stat.color}"></span>
          </div>
          <p style="font-size: 2rem; font-weight: 800; color: #d4c7a3; line-height: 1.1; margin: 0;">{stat.value}</p>
          <p style="font-size: 0.7rem; font-weight: 600; color: rgba(212,199,163,0.5); text-transform: uppercase; letter-spacing: 0.08em; margin: 0.35rem 0 0 0;">{stat.label}</p>
        </div>
      {/each}
    </div>

    <!-- Knowledge Base -->
    <Card class="bg-panel border-sand/10 mb-8">
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle class="text-sm text-sand/80">Knowledge Base</CardTitle>
          <div class="flex items-center gap-3 text-xs text-sand/50">
            <span>{stats.knowledgeBase.glossary} terms</span>
            <span>{stats.knowledgeBase.statutes} statutes</span>
            <span>{stats.knowledgeBase.precedents} precedents</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div class="relative mb-4">
          <Icon name="search" size={16} class="absolute left-3 top-1/2 -translate-y-1/2 text-sand/40" />
          <input
            type="text"
            placeholder="Search glossary, statutes, precedents..."
            value={kbQuery}
            oninput={(e) => handleKBSearch((e.target as HTMLInputElement).value)}
            class="w-full pl-10 pr-4 py-2.5 bg-black/30 border border-sand/10 rounded text-sm text-sand placeholder:text-sand/30 focus:outline-none focus:border-accent/40"
          />
          {#if kbSearching}
            <Icon name="loader-2" size={14} class="absolute right-3 top-1/2 -translate-y-1/2 text-sand/40 animate-spin" />
          {/if}
        </div>

        {#if kbResults.length > 0}
          <div class="grid gap-2 max-h-80 overflow-y-auto">
            {#each kbResults as result}
              <button
                class="flex items-start gap-3 w-full px-3 py-2.5 bg-black/20 rounded text-left hover:bg-black/30 transition-colors"
                onclick={() => goto(result.type === 'glossary' ? '/citations' : result.type === 'statute' ? '/citations' : '/citations')}
              >
                <span class="shrink-0 mt-0.5 px-1.5 py-px rounded text-[10px] font-mono uppercase {
                  result.type === 'glossary' ? 'bg-accent/10 text-accent' :
                  result.type === 'statute' ? 'bg-info/10 text-info' :
                  'bg-warning/10 text-warning'
                }">
                  {result.type === 'glossary' ? 'GLO' : result.type === 'statute' ? 'STT' : 'PRE'}
                </span>
                <div class="min-w-0">
                  <p class="text-sm text-sand font-medium truncate">{result.title}</p>
                  <p class="text-xs text-sand/40 line-clamp-2">{result.snippet}...</p>
                </div>
                {#if result.similarity}
                  <span class="shrink-0 text-[10px] text-sand/30 font-mono">{(result.similarity * 100).toFixed(0)}%</span>
                {/if}
              </button>
            {/each}
          </div>
        {:else if kbQuery.length >= 2 && !kbSearching}
          <p class="text-sand/30 text-xs text-center py-4">No results for "{kbQuery}"</p>
        {:else}
          <div class="grid grid-cols-3 gap-3">
            <button onclick={() => goto('/citations')} class="px-3 py-2 bg-black/20 rounded text-left hover:bg-black/30 transition-colors">
              <p class="text-lg font-bold text-accent">{stats.knowledgeBase.glossary}</p>
              <p class="text-xs text-sand/40">Glossary Terms</p>
            </button>
            <button onclick={() => goto('/citations')} class="px-3 py-2 bg-black/20 rounded text-left hover:bg-black/30 transition-colors">
              <p class="text-lg font-bold text-info">{stats.knowledgeBase.statutes}</p>
              <p class="text-xs text-sand/40">Statutes</p>
            </button>
            <button onclick={() => goto('/citations')} class="px-3 py-2 bg-black/20 rounded text-left hover:bg-black/30 transition-colors">
              <p class="text-lg font-bold text-warning">{stats.knowledgeBase.precedents}</p>
              <p class="text-xs text-sand/40">Precedents</p>
            </button>
          </div>
        {/if}
      </CardContent>
    </Card>

    <!-- Recent Cases -->
    <Card class="bg-panel border-sand/10">
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle class="text-sm text-sand/80">Recent Cases</CardTitle>
          <Button onclick={() => goto('/cases')} class="text-xs">View All</Button>
        </div>
      </CardHeader>
      <CardContent>
        {#if recentCases.length === 0}
          <p class="text-sand/40 text-center py-8">No cases found</p>
        {:else}
          <div class="grid gap-2">
            {#each recentCases as caseItem}
              <button
                class="flex items-center justify-between w-full px-3 py-2.5 bg-black/20 rounded text-sm hover:bg-black/30 transition-colors text-left"
                onclick={(e) => openCaseModal(e, caseItem.id)}
              >
                <div class="flex items-center gap-3">
                  <span class="font-mono text-xs text-sand/40">{caseItem.caseNumber}</span>
                  <span class="text-sand">{caseItem.title}</span>
                </div>
                <div class="flex items-center gap-3 text-xs">
                  <span class={priorityColors[caseItem.priority] ?? 'text-sand/40'}>
                    {caseItem.priority}
                  </span>
                  <span class={statusColors[caseItem.status] ?? 'text-sand/40'}>
                    {caseItem.status.replace('_', ' ')}
                  </span>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </CardContent>
    </Card>

    <!-- Data Visualization (YoRHa-themed charts) -->
    <div class="mt-8">
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

    <!-- Active Cases Widget -->
    <div class="mt-8">
      <ActiveCasesWidget />
    </div>

    <!-- Recent Activity Feed -->
    <div class="mt-8">
      <RecentActivity />
    </div>

    <!-- Component Demos -->
    <div class="mt-8">
      <Card class="bg-panel border-sand/10">
        <CardHeader>
          <CardTitle class="text-sm text-sand/80">Component Demos</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-sand/40 text-xs mb-4">Access the 20 largest components wired across the app</p>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {#each [
              { href: '/evidence', label: 'Evidence Hub', desc: 'CustodyFlow, Summarizer, FileUpload, Connections', count: 4 },
              { href: '/ai-dashboard', label: 'AI Dashboard', desc: 'ContextualChat, EnhancedAIChat, Gemma, Streaming', count: 4 },
              { href: '/all-routes', label: 'Route Inspector', desc: 'Inspector, Detective, Working, Graph, OpsLog', count: 5 },
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
              <a href={demo.href} class="block px-3 py-2.5 bg-black/20 rounded text-left hover:bg-black/30 transition-colors">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-sand text-sm font-medium">{demo.label}</span>
                  <span class="text-xs text-accent font-mono">{demo.count}</span>
                </div>
                <p class="text-sand/40 text-xs">{demo.desc}</p>
              </a>
            {/each}
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- NES Route Navigator -->
    <div class="mt-8 nes-route-nav">
      <div class="nes-nav-header">
        <span class="nes-nav-title">ROUTE NAVIGATOR</span>
        <a href="/admin/all-routes" class="nes-nav-link">VIEW ALL →</a>
      </div>
      <div class="nes-nav-grid">
        {#each [
          { href: '/cases', label: '/cases', kind: 'page', icon: 'doc' },
          { href: '/evidence', label: '/evidence', kind: 'page', icon: 'doc' },
          { href: '/citations', label: '/citations', kind: 'page', icon: 'doc' },
          { href: '/persons-of-interest', label: '/poi', kind: 'page', icon: 'doc' },
          { href: '/ai-dashboard', label: '/ai', kind: 'page', icon: 'ai' },
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

    <!-- Workspace -->
    <div class="mt-8">
      <WorkspacePanel workspaceId="dashboard" />
    </div>

    <!-- System Status -->
    <div class="mt-8">
      <SystemStatusPanel />
    </div>

  {/if}
</div>

<!-- Floating AI Assistant Button -->
<AIAssistantButton variant="floating" position="bottom-right" />

<!-- Command Palette (Ctrl+K) -->
<svelte:window onkeydown={handleGlobalKeydown} />
<CommandPalette bind:open={showCommandPalette} />

<style>
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

</style>
