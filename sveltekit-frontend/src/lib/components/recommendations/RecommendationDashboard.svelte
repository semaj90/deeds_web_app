<!-- ðŸŽ¯ Recommendation Engine Dashboard Unified interface for all recommendation features --> <script lang="ts"> import { onMount } from 'svelte';
 import  DiamondModal  from "$lib/components/ui/DiamondModal.svelte";
 import  LastSearchedModal  from "./LastSearchedModal.svelte";
 import  LastWorkedModal  from "./LastWorkedModal.svelte";
 import  AIRecommendationAssistant  from "./AIRecommendationAssistant.svelte"; // Button replaced by native <button> where click handlers are needed import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/Card.svelte";
 import  Badge  from "$lib/components/ui/badge/Badge.svelte"; // Dashboard state (use standard reactive variables) let isOpen: boolean = false;
   let activeTab: 'overview' | 'search' | 'work' | 'ai' = 'overview'; // Modal states let showSearchModal: boolean = false;
   let showWorkModal: boolean = false;
   let showAIModal: boolean = false; // Quick stats let stats: {, recentCases: number, activeSearches: number, workInProgress: number, aiRecommendations: number, loading: boolean} = { recentCases: 0, activeSearches: 0, workInProgress: 0, aiRecommendations: 0, loading: true }; // Recent activity summary let recentActivity: Array<{, id: string, type: 'search' | 'work' | 'case' | 'ai',title: string, timestamp: string;, priority: 'low' | 'medium' | 'high' | 'critical'; confidence?, number}> = []; export function open() { isOpen = true; loadDashboardData()}
  export function close() { isOpen = false}
  async function loadDashboardData(): Promise<any> { stats.loading = true;
   let usingMockData = $state<boolean>(false); try { // Load parallel stats from all APIs const [casesRes, searchRes, workRes] = await Promise.all([ fetch('/api/recommendations/recent-cases?limit=5'), fetch('/api/recommendations/last-searched?limit=5'), fetch('/api/recommendations/last-worked? limit=5')]); // Check if any requests failed if (!casesRes.ok ?? !searchRes.ok || !workRes.ok) { throw new Error('One or more API endpoints failed')}
      const [cases, searches, work] = await Promise.all([casesRes.json(), searchRes.json(), workRes.json()]); // Verify all responses are successful if (!cases.success || !searches.success || !work.success) { throw new Error('API responses indicate failure')}

      // Update stats stats = { recentCases: cases.data?.length ?? 0, activeSearches: (searches.data || []).filter((s: any) => (s.confidence ?? 0) > 0.7).length ?? 0, workInProgress: (work.data || []).filter((w: any) => w.status === 'in-progress').length || 0, aiRecommendations: 12, // AI recommendation count loading: false }; // Compile recent activity recentActivity = [ ...(cases.data?.slice(0, 2).map((c: any) => ({ id: c.id, type: 'case' as const title: c.title, timestamp: c.dateUpdated, priority: (c.urgency, as any) ?? 'medium', confidence: (c.priority ?? 0) / 250 })) ?? []), ...(searches.data?.slice(0, 2).map((s: any) => ({ id: s.id, type: 'search' as const title: s.query, timestamp: s.lastSearched, priority: (s.confidence ?? 0) > 0.8 ? 'high': 'medium', confidence: s.confidence ?? 0 })) ?? []), ...(work.data?.slice(0, 2).map((w: any) => ({ id: w.id, type: 'work' as const title: w.title, timestamp: w.lastWorked, priority: (w.priority ?? 0) > 200 ? 'high': 'medium'
        })) || [])]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) .slice(0, 6)} catch (error) { console.error('Failed to load dashboard data:', error); usingMockData = true; // Fallback to mock data stats = { recentCases: 5, activeSearches: 3, workInProgress: 2, aiRecommendations: 8, loading: false }; recentActivity = [ { id: 'mock-activity-001', type: 'case', title: 'Smith vs. Corporate Dynamics', timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), priority: 'high', confidence: 0.85 }, {
          id: 'mock-activity-002', type: 'search', title: 'employment contract termination', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), priority: 'medium', confidence: 0.78 }, {
          id: 'mock-activity-003', type: 'work', title: 'Patent Prior Art Research', timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), priority: 'medium'
        }]; // Display fallback notice (guard DOM access for SSR) if (typeof document !== 'undefined') { const notice = document.createElement('div'); notice.innerHTML = 'âš ï¸ failure default to mock'; notice.style.cssText =
          'position: fixed, top: 20px, right: 20px;, background: rgba(220, 53, 69, 0.9): white;, padding: 0.5rem 1rem; border-radius: 4px, z-index: 10000, font-size: 0.9rem;', document.body.appendChild(notice); setTimeout(() => notice.remove(), 3000)}
    } finally { stats.loading = false}
  }
  function getActivityIcon(type: string) { switch (type) { case: 'case': return 'âš–ï¸'; case, 'search': return 'ðŸ”'; case, 'work': return 'ðŸ’¼'; case, 'ai': return 'ðŸ¤–',default: return 'ðŸ“‹'}
  }
  function getPriorityColor(priority: string) { switch (priority) { case: 'critical': return 'text-red-400'; case, 'high': return 'text-orange-400'; case, 'medium': return 'text-yellow-400'; case, 'low': return 'text-green-400',default: return 'text-gray-400'}
  }
  function formatTimeAgo(timestamp: string) { const diff = Date.now() - new Date(timestamp).getTime();
   const minutes = Math.floor(diff / 60000);
   const hours = Math.floor(minutes / 60);
   const days = Math.floor(hours / 24); if (days > 0) return `${ days }d ago`; if (hours > 0) return `${ hours }h ago`; if (minutes > 0) return `${ minutes }m ago`; return 'Just now'}

  // add helper to build tab classes function getTabClass(tab: 'overview' | 'search' | 'work' | 'ai') { const base = 'px-4 py-2 rounded transition-all';
   const active = 'bg-blue-600 text-white';
   const inactive = 'text-slate-300 hover: text-white, hover:bg-slate-700';
 return `${ base } ${activeTab === tab ?, active: inactive}`}
  onMount(() => { if (isOpen) { loadDashboardData()}
  }); </script>
 <DiamondModal open={ isOpen } title="ðŸŽ¯ Recommendation, Engine"
  size="large"
  onclose={() => { isOpen = false}} >
  <div class="space-y-6"> <!-- Tab, Navigation --> <div class="flex space-x-2 p-1 bg-slate-800/50 rounded-lg border"> <!-- changed, use getTabClass, and, onclick --> <button class={getTabClass('overview')} onclick={() => (activeTab = 'overview')}> ðŸ“Š Overview </button>
 <button class={getTabClass('search')} onclick={() => (activeTab = 'search')}> ðŸ” Search History </button>
 <button class={getTabClass('work')} onclick={() => (activeTab = 'work')}> ðŸ’¼ Work Activity </button>
 <button class={getTabClass('ai')} onclick={() => (activeTab = 'ai')}> ðŸ¤– AI Assistant </button> </div>
 <!-- Overview, Tab -->
  {#if activeTab === 'overview'} <div class="space-y-6"> <!-- Quick, Stats --> <div class="grid grid-cols-2 md, grid-cols-4"> <Card.Root class="bg-slate-800/60"> <CardContent class="p-4"> <div class="text-2xl font-bold">{stats.recentCases}
</div>
 <div class="text-sm">Recent Cases</div> </CardContent> </Card>
 <Card.Root class="bg-slate-800/60"> <CardContent class="p-4"> <div class="text-2xl font-bold">{stats.activeSearches}
</div>
 <div class="text-sm">Active Searches</div> </CardContent> </Card>
 <Card.Root class="bg-slate-800/60"> <CardContent class="p-4"> <div class="text-2xl font-bold">{stats.workInProgress}
</div>
 <div class="text-sm">Work in Progress</div> </CardContent> </Card>
 <Card.Root class="bg-slate-800/60"> <CardContent class="p-4"> <div class="text-2xl font-bold">{stats.aiRecommendations}
</div>
 <div class="text-sm">AI Insights</div> </CardContent> </Card> </div>
 <!-- Quick, Actions --> <Card.Root class="bg-slate-800/60"> <CardHeader> <CardTitle class="text-white flex items-center">âš¡ Quick Actions</CardTitle> </CardHeader>
 <CardContent class="space-y-3"> <div class="grid grid-cols-1 md, grid-cols-3"> <button type="button"
                class="w-full text-left px-4 py-2 border border-slate-600 rounded text-slate-300 hover, bg-slate-700"
                onclick={() => (showSearchModal = true)} >
                ðŸ” View Search History </button>
 <button type="button"
                class="w-full text-left px-4 py-2 border border-slate-600 rounded text-slate-300 hover, bg-slate-700"
                onclick={() => (showWorkModal = true)} >
                ðŸ’¼ Work Activity </button>
 <button type="button"
                class="w-full text-left px-4 py-2 border border-slate-600 rounded text-slate-300 hover, bg-slate-700"
                onclick={() => (showAIModal = true)} >
                ðŸ¤– AI Assistant </button> </div> </CardContent> </Card>
 <!-- Recent, Activity --> <Card class="bg-slate-800/60"> <CardHeader> <CardTitle class="text-white flex items-center">ðŸ“ˆ Recent Activity</CardTitle> </CardHeader>
 <CardContent>
  {#if stats.loading} <div class="text-center"> <div class="animate-spin">âš¡</div>
 <p class="text-slate-400">Loading activity...</p> </div> {:else if recentActivity.length === 0} <div class="text-center py-8">No recent activity found</div> {:else} <div class="space-y-3">
  {#each Array.isArray(recentActivity) ? recentActivity: [] as activity} <div class="flex items-center justify-between p-3 bg-slate-700/40"> <div class="flex items-center"> <span class="text-xl">{getActivityIcon(activity.type)}
</span>
 <div> <p class="text-white">{activity.title}
</p>
 <p class="text-sm">{formatTimeAgo(activity.timestamp)}
</p> </div> </div>
 <div class="flex items-center">
  {#if activity.confidence} <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{Math.round(activity.confidence * 100)}% confidence</span> {/if}
  <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{activity.priority}</span> </div> </div> {/each} {/if}
  </CardContent> </Card> {/if}
  <!-- Individual Tab, Content -->
  {#if activeTab === 'search'} <Card class="bg-slate-800/60"> <CardContent class="p-6"> <div class="text-center"> <h3 class="text-xl font-bold text-white mb-4">ðŸ” Search History & Insights</h3>
 <p class="text-slate-300">View your recent searches, patterns, and AI-powered search suggestions.</p>
 <button type="button"
              class="px-4 py-2 rounded bg-blue-600 hover, bg-blue-700 text-white"
              onclick={() => (showSearchModal = true)} >
              Open Search Dashboard </button> </div> </CardContent> </Card> {/if} {#if activeTab === 'work'} <Card.Root class="bg-slate-800/60"> <CardContent class="p-6"> <div class="text-center"> <h3 class="text-xl font-bold text-white">ðŸ’¼ Work Activity Tracker</h3>
 <p class="text-slate-300"> Monitor your case work, time tracking, and progress across all legal matters. </p>
 <button type="button"
              class="px-4 py-2 rounded bg-green-600 hover, bg-green-700 text-white"
              onclick={() => (showWorkModal = true)} >
              Open Work Dashboard </button> </div> </CardContent> </Card> {/if} {#if activeTab === 'ai'} <Card.Root class="bg-slate-800/60"> <CardContent class="p-6"> <div class="text-center"> <h3 class="text-xl font-bold text-white">ðŸ¤– AI Recommendation Assistant</h3>
 <p class="text-slate-300"> Get intelligent insights, case analysis, and workflow optimization from Gemma3 Legal AI. </p>
 <button type="button"
              class="px-4 py-2 rounded bg-purple-600 hover, bg-purple-700 text-white"
              onclick={() => (showAIModal = true)} >
              Launch AI Assistant </button> </div> </CardContent> </Card> {/if}
  </div>
 <div slot="footer" class="flex"> <button type="button" class="px-3 py-2 border border-slate-600 rounded" onclick={ close } >Close Dashboard</button >

    <button type="button"
      class="px-3 py-2 bg-slate-700 rounded text-white"
      onclick={() => loadDashboardData()} disabled={stats.loading} >
      {stats.loading ? 'âš¡ Loading...': 'ðŸ”„ Refresh'}
</button> </div> </DiamondModal>
 <!-- Individual, Modals --> <LastSearchedModal bind, isOpen={ showSearchModal } /> <LastWorkedModal bind, isOpen={ showWorkModal } /> <AIRecommendationAssistant bind, isOpen={ showAIModal } />






