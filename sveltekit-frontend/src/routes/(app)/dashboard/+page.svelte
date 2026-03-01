<script lang="ts">
  import { goto } from '$app/navigation';
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      showCommandPalette = !showCommandPalette;
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
    loadDashboard();
  });

  async function loadDashboard() {
    loading = true;
    error = null;
    try {
      const [casesRes, statsRes] = await Promise.all([
        fetch('/api/cases?limit=10'),
        fetch('/api/dashboard/stats').catch(() => null),
      ]);

      if (casesRes.status === 401) {
        await goto('/login');
        return;
      }

      if (casesRes.ok) {
        const data = await casesRes.json();
        recentCases = (data.cases ?? data.data ?? []).slice(0, 10);
        stats.activeCases = recentCases.filter(c => c.status === 'open' || c.status === 'in_progress').length;
      }

      if (statsRes?.ok) {
        const data = await statsRes.json();
        stats = { ...stats, ...data };
      }
    } catch (err) {
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
    <!-- Stats Grid -->
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
      {#each [
        { label: 'Active Cases', value: stats.activeCases, color: 'text-accent' },
        { label: 'Total Evidence', value: stats.totalEvidence, color: 'text-warning' },
        { label: 'Persons of Interest', value: stats.personsOfInterest, color: 'text-sand' },
        { label: 'Citations', value: stats.totalCitations, color: 'text-accent' },
        { label: 'Knowledge Base', value: stats.knowledgeBase.total, color: 'text-info' },
        { label: 'Total Cases', value: stats.recentActivity, color: 'text-sand/60' },
      ] as stat}
        <Card class="bg-panel border-sand/10">
          <CardContent class="p-4 text-center">
            <p class="text-2xl font-bold {stat.color}">{stat.value}</p>
            <p class="text-xs text-sand/50 mt-1">{stat.label}</p>
          </CardContent>
        </Card>
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
                onclick={() => goto(`/cases/${caseItem.id}`)}
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
              { href: '/evidence-canvas-demo', label: 'Evidence Canvas', desc: '6 visualization engines + architecture panel', count: 1 },
              { href: '/nier-showcase', label: 'NieR Showcase', desc: 'YoRHa Command Center, Terminal, Dialogs', count: 4 },
              { href: '/system-status', label: 'System Status', desc: 'Health dashboard with 6 StatusCards', count: 3 },
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

    <!-- Workspace -->
    <div class="mt-8">
      <WorkspacePanel workspaceId="dashboard" />
    </div>

    <!-- System Status -->
    <div class="mt-8">
      <SystemStatusPanel />
    </div>

    {#if error}
      <Card class="mt-4 bg-panel border-danger/40">
        <CardContent class="p-4 text-center">
          <p class="text-danger text-sm">{error}</p>
          <Button onclick={() => loadDashboard()} class="mt-2">Retry</Button>
        </CardContent>
      </Card>
    {/if}
  {/if}
</div>

<!-- Floating AI Assistant Button -->
<AIAssistantButton variant="floating" position="bottom-right" />

<!-- Command Palette (Ctrl+K) -->
<svelte:window onkeydown={handleGlobalKeydown} />
<CommandPalette bind:open={showCommandPalette} />
