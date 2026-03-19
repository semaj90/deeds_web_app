<script lang="ts">
  import { goto, pushState } from '$app/navigation';
  
  // UI Components
  import Icon from '$lib/components/ui/Icon.svelte';
  import Kbd from '$lib/components/ui/Kbd.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ProgressSteps from '$lib/components/ui/ProgressSteps.svelte';
  import LegalDisclaimer from '$lib/components/LegalDisclaimer.svelte';
  
  // Dashboard Specific Widgets
  import RecentActivity from '$lib/components/yorha/dashboard/RecentActivity.svelte';
  import ActiveCasesWidget from '$lib/components/yorha/dashboard/ActiveCasesWidget.svelte';
  import PipelineOverview from '$lib/components/dashboard/PipelineOverview.svelte';
  import YoRHaDataViz from '$lib/components/yorha/_simulations/YoRHaDataViz.svelte';
  
  // Types
  interface KBStats { glossary: number; statutes: number; precedents: number; total: number; }
  interface DashboardStats {
    activeCases: number; totalEvidence: number; personsOfInterest: number;
    totalCitations: number; recentActivity: number; knowledgeBase: KBStats;
  }
  interface RecentCase { id: string; title: string; caseNumber: string; status: string; priority: string; updatedAt: string; }
  interface KBResult { type: 'glossary' | 'statute' | 'precedent'; title: string; snippet: string; similarity?: number; }

  // State
  let stats = $state<DashboardStats>({
    activeCases: 12, totalEvidence: 156, personsOfInterest: 4, totalCitations: 89,
    recentActivity: 24, knowledgeBase: { glossary: 450, statutes: 1200, precedents: 85, total: 1735 }
  });
  let loading = $state(false);
  let kbQuery = $state('');
  let kbResults = $state<KBResult[]>([
    { type: 'statute', title: '18 U.S.C. § 1001', snippet: 'Statements or entries generally in federal matters...', similarity: 0.98 },
    { type: 'precedent', title: 'Miranda v. Arizona', snippet: 'Fifth Amendment privilege against self-incrimination...', similarity: 0.85 }
  ]);
  let kbSearching = $state(false);

  // WWWH Generator State
  let wwwhNotes = $state('');
  let wwwhWho = $state('');
  let wwwhWhat = $state('');
  let wwwhWhy = $state('');
  let wwwhHow = $state('');
  let wwwhTitle = $state('');
  let wwwhStatus = $state('open');
  let wwwhCollapsed = $state(false);
  let wwwhSaving = $state(false);
  let wwwhSuccess = $state('');

  const wwwhSteps = [
    { label: 'Notes', description: 'Input data' },
    { label: 'Analyze', description: 'Extract fields' },
    { label: 'Commit', description: 'Save as Case' }
  ];

  let wwwhStepIndex = $derived.by(() => {
    if (wwwhSuccess) return 3;
    if (wwwhWho.trim() || wwwhWhat.trim()) return 2;
    if (wwwhNotes.trim()) return 1;
    return 0;
  });

  function handleKBSearch(query: string) {
    kbQuery = query;
    if (query.length < 2) return;
    kbSearching = true;
    setTimeout(() => kbSearching = false, 600);
  }

  function clearWWWH() {
    wwwhNotes = ''; wwwhWho = ''; wwwhWhat = ''; wwwhWhy = ''; wwwhHow = '';
    wwwhTitle = ''; wwwhStatus = 'open';
  }

  // Utility
  function cn(...args: (string | boolean | undefined | null)[]): string {
    return args.filter(Boolean).join(' ');
  }
</script>

<div class="min-h-screen bg-premium-bg text-white/90 p-6 lg:p-10 font-sans">
  <div class="max-w-7xl mx-auto space-y-8">
    
    <div class="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-4 mb-10">
      <Icon name="info" class="text-amber-400" />
      <div class="text-sm">
        <span class="font-bold">PROTOTYPE MODE:</span> This is a premium Bento Dashboard concept using UnoCSS and Svelte 5 Runes.
      </div>
      <Button variant="outline" size="sm" class="ml-auto" onclick={() => goto('/dashboard')}>Return to System</Button>
    </div>

    <!-- Header Section -->
    <header class="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-white/5">
      <div>
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
            <Icon name="layout-dashboard" size={20} />
          </div>
          <h1 class="text-3xl font-bold tracking-tight">Intelligence Nexus</h1>
        </div>
        <p class="text-white/40 flex items-center gap-3">
          Premium Bento Layout Preview // Operational Intelligence
          <Kbd keys="Ctrl+K" size="sm" />
        </p>
      </div>

      <div class="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-xl">
        <div class="flex items-center gap-4 px-3 border-r border-white/5">
          <div class="text-[10px] uppercase tracking-widest text-white/30 font-bold">Active</div>
          <div class="text-lg font-bold tabular-nums text-blue-400">{stats.activeCases}</div>
        </div>
        <div class="flex items-center gap-4 px-3 border-r border-white/5">
          <div class="text-[10px] uppercase tracking-widest text-white/30 font-bold">Evidence</div>
          <div class="text-lg font-bold tabular-nums text-emerald-400">{stats.totalEvidence}</div>
        </div>
        <div class="flex items-center gap-4 px-3">
          <div class="text-[10px] uppercase tracking-widest text-white/30 font-bold">POI</div>
          <div class="text-lg font-bold tabular-nums text-amber-400">{stats.personsOfInterest}</div>
        </div>
      </div>
    </header>

    <!-- Bento Grid -->
    <div class="bento-grid">
      
      <!-- Search & KB -->
      <div class="bento-card md:col-span-4 lg:col-span-4 flex flex-col gap-6">
        <div class="flex items-center justify-between">
          <h2 class="font-bold text-lg flex items-center gap-3">
            <Icon name="search" class="text-blue-400" /> Neural Analytics
          </h2>
          <span class="text-[10px] font-bold text-white/20 uppercase tracking-widest">Global Index</span>
        </div>
        
        <div class="relative">
          <input 
            type="text" 
            placeholder="Search statutes, precedents, or cases..."
            class="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 pl-12 focus:ring-2 focus:ring-blue-500/40 outline-none transition-all"
            value={kbQuery}
            oninput={(e) => handleKBSearch((e.target as HTMLInputElement).value)}
          />
          <Icon name="search" class="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
          {#if kbSearching}
            <div class="absolute right-4 top-1/2 -translate-y-1/2 animate-spin">
              <Icon name="loader-circle" size={16} class="text-blue-400" />
            </div>
          {/if}
        </div>

        <div class="flex-1 overflow-y-auto custom-scrollbar min-h-[200px]">
          <div class="space-y-3">
            {#each kbResults as result}
              <button class="w-full text-left p-4 rounded-2xl bg-white/2 hover:bg-white/5 border border-white/5 transition-all group">
                <div class="flex items-center justify-between mb-2">
                  <span class={cn(
                    "text-[9px] font-black px-2 py-0.5 rounded uppercase",
                    result.type === 'statute' ? "bg-blue-500/20 text-blue-400" : "bg-emerald-500/20 text-emerald-400"
                  )}>{result.type}</span>
                  {#if result.similarity}
                    <span class="text-[10px] tabular-nums text-white/20">{(result.similarity * 100).toFixed(0)}% Match</span>
                  {/if}
                </div>
                <h4 class="font-bold text-sm mb-1">{result.title}</h4>
                <p class="text-xs text-white/40 line-clamp-2">{result.snippet}</p>
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Quick Entry -->
      <div class="bento-card md:col-span-2 lg:col-span-2 space-y-4">
        <h2 class="font-bold text-lg flex items-center gap-3 mb-4">
          <Icon name="zap" class="text-amber-400" /> Fast Tracks
        </h2>
        <button class="w-full flex items-center justify-between p-4 rounded-2xl bg-white/2 hover:bg-white/5 border border-white/5 transition-all group">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-blue-500/10 text-blue-400"><Icon name="plus" size={18} /></div>
            <span class="text-sm font-bold">New Investigation</span>
          </div>
          <Icon name="chevron-right" size={14} class="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
        </button>
        <button class="w-full flex items-center justify-between p-4 rounded-2xl bg-white/2 hover:bg-white/5 border border-white/5 transition-all group">
          <div class="flex items-center gap-3">
            <div class="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400"><Icon name="upload" size={18} /></div>
            <span class="text-sm font-bold">Ingest Evidence</span>
          </div>
          <Icon name="chevron-right" size={14} class="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
        </button>
      </div>

      <!-- Neural Pipeline -->
      <div class="bento-card md:col-span-6 lg:col-span-6">
        <PipelineOverview />
      </div>

      <!-- WWWH Generator -->
      <div class="bento-card md:col-span-6 lg:col-span-6 border-blue-500/10">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-blue-500/10 text-blue-400"><Icon name="sparkles" size={16} /></div>
            <h3 class="font-bold uppercase tracking-widest text-xs">Use Case Generator</h3>
          </div>
          <button onclick={() => wwwhCollapsed = !wwwhCollapsed} class="text-white/20 hover:text-white transition-colors">
            <Icon name={wwwhCollapsed ? "chevron-down" : "chevron-up"} size={16} />
          </button>
        </div>

        {#if !wwwhCollapsed}
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
            <div class="space-y-4">
              <textarea 
                bind:value={wwwhNotes}
                placeholder="Paste raw data for extraction..."
                class="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm min-h-[180px] focus:ring-2 focus:ring-blue-500/40 outline-none"
              ></textarea>
              <div class="flex gap-3">
                <Button variant="primary" size="sm" class="flex-1" onclick={() => wwwhSuccess = 'Extracted'} disabled={wwwhSaving}>Analyze</Button>
                <Button variant="secondary" size="sm" onclick={clearWWWH}><Icon name="eraser" size={14} /></Button>
              </div>
            </div>
            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                {#each [{id:'who', label:'Who', icon:'user', value:wwwhWho, bind:(v:string)=>wwwhWho=v}, {id:'what', label:'What', icon:'file-text', value:wwwhWhat, bind:(v:string)=>wwwhWhat=v}] as f}
                  <div class="space-y-1.5">
                    <label class="text-[10px] uppercase font-black text-white/20 tracking-tighter flex items-center gap-1.5">
                      <Icon name={f.icon} size={10} /> {f.label}
                    </label>
                    <input type="text" value={f.value} oninput={e => f.bind((e.target as HTMLInputElement).value)} class="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs outline-none focus:border-blue-500/40" />
                  </div>
                {/each}
              </div>
              <ProgressSteps steps={wwwhSteps} current={wwwhStepIndex} size="sm" />
            </div>
          </div>
        {/if}
      </div>

      <!-- Feed & Active Cases -->
      <div class="bento-card md:col-span-4 lg:col-span-3">
        <RecentActivity />
      </div>
      <div class="bento-card md:col-span-4 lg:col-span-3">
        <ActiveCasesWidget />
      </div>

      <!-- Data Viz -->
      <div class="bento-card md:col-span-8 lg:col-span-6 !p-0 overflow-hidden">
        <YoRHaDataViz 
          title="Intelligence Distribution"
          height={300}
          data={[
            { label: 'Intelligence', value: 85, status: 'active', color: '#60a5fa' },
            { label: 'Active Tasks', value: 45, status: 'pending', color: '#c8a84b' },
            { label: 'Artifacts', value: 92, status: 'completed', color: '#10b981' }
          ]}
        />
      </div>

    </div>
  </div>
</div>

<style>
  :global(.bento-grid) {
    display: grid;
    grid-template-columns: repeat(1, 1fr);
    gap: 1.5rem;
  }
  @media (min-width: 768px) {
    :global(.bento-grid) { grid-template-columns: repeat(4, 1fr); }
  }
  @media (min-width: 1024px) {
    :global(.bento-grid) { grid-template-columns: repeat(6, 1fr); }
  }

  :global(.bento-card) {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 24px;
    padding: 1.5rem;
    backdrop-filter: blur(20px);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  :global(.bento-card:hover) {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.15);
    transform: translateY(-2px);
    box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5);
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
  }
</style>
