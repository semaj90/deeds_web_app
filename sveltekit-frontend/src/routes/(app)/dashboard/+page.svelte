<script lang="ts">
  import { goto } from '$app/navigation';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/card/Card.svelte';
  import CardContent from '$lib/components/ui/card/CardContent.svelte';
  import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
  import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
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

  let showCommandPalette = $state(false);

  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      showCommandPalette = !showCommandPalette;
    }
  }

  interface DashboardStats {
    activeCases: number;
    pendingEvidence: number;
    approvedEvidence: number;
    personsOfInterest: number;
    totalCitations: number;
    recentActivity: number;
  }

  interface RecentCase {
    id: string;
    title: string;
    caseNumber: string;
    status: string;
    priority: string;
    updatedAt: string;
  }

  let stats = $state<DashboardStats>({
    activeCases: 0,
    pendingEvidence: 0,
    approvedEvidence: 0,
    personsOfInterest: 0,
    totalCitations: 0,
    recentActivity: 0,
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
    <div class="text-center py-16 text-sand/50">Loading dashboard...</div>
  {:else}
    <!-- Stats Grid -->
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
      {#each [
        { label: 'Active Cases', value: stats.activeCases, color: 'text-accent' },
        { label: 'Pending Evidence', value: stats.pendingEvidence, color: 'text-warning' },
        { label: 'Approved Evidence', value: stats.approvedEvidence, color: 'text-info' },
        { label: 'Persons of Interest', value: stats.personsOfInterest, color: 'text-sand' },
        { label: 'Citations', value: stats.totalCitations, color: 'text-accent' },
        { label: 'Recent Activity', value: stats.recentActivity, color: 'text-info' },
      ] as stat}
        <Card class="bg-panel border-sand/10">
          <CardContent class="p-4 text-center">
            <p class="text-2xl font-bold {stat.color}">{stat.value}</p>
            <p class="text-xs text-sand/50 mt-1">{stat.label}</p>
          </CardContent>
        </Card>
      {/each}
    </div>

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
