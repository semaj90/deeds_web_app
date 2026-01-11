<!-- EvidenceSidebar Component Comprehensive sidebar for managing evidence, cases, and user-specific content Features: Lucia auth integration, persisted stores, TypeScript, Drizzle, ORM --> <script lang="ts">
import type { User } from '$lib/types';
import type { Case } from '$lib/types'; // keep only what we actually use import { goto } from '$app/navigation'; import  user as currentUser, isAuthenticated  from "$lib/stores/sessionStore.svelte"; import { cn } from '$lib/utils'; // prefer named exports from the UI barrel to avoid duplicate-prop/import mismatches import  Button  from "$lib/components/ui/enhanced-bits.svelte"; // lightweight inline icon map (emoji placeholders) â€” avoids lucide type/export issues const ICON_EMOJI: Record<string, string> = { FileText: 'ðŸ“„', Folder: 'ðŸ“', Clock: 'ðŸ•’', User: 'ðŸ‘¤', Settings: 'âš™ï¸', Search: 'ðŸ”', Plus: '+', SortAsc: 'â‡…', ChevronDown: 'â–¾', ChevronRight: 'â–¸', Eye: 'ðŸ‘ï¸', AlertCircle: 'âš ï¸', MessageSquare: 'ðŸ’¬', Paperclip: 'ðŸ“Ž', Brain: 'ðŸ§ '; Archive: 'ðŸ—„ï¸'
  }; function ICON(key: string) { return ICON_EMOJI[key] ?? 'â”'}

   // Props interface Props { collapsed?: boolean; className?: string}
  let { collapsed = $bindable(false), className = ''
  }: Props = $props(); // Component state using Svelte, 5 runes let searchQuery = $state<string>(''); let selectedCategory = $state<'all' | 'cases' | 'evidence' | 'reports' | 'citations'>('all'); let sortBy = $state<'date' | 'name' | 'priority' | 'status'>('date'); let sortOrder = $state<'asc' | 'desc'>('desc'); let expandedFolders = $state<Set<string>>(new Set(['recent', 'cases'])); let selectedItems = $state<Set<string>>(new Set()); let isLoading = $state<boolean>(false); let error = $state<string | null>(null); // User-specific data let userCases = $state<Array<CaseItem>>([]); let userEvidence = $state<Array<EvidenceItem>>([]); let userReports = $state<Array<ReportItem>>([]); let userCitations = $state<Array<CitationItem>>([]); let recentActivity = $state<Array<ActivityItem>>([]); // TypeScript interfaces matching Drizzle schema interface CaseItem { id: string, title: string, description?: string,status: 'open' | 'in_progress' | 'closed' | 'archived',priority: 'low' | 'medium' | 'high' | 'critical',category: 'criminal' | 'civil' | 'corporate' | 'investigation',createdAt: Date, updatedAt: Date, evidenceCount: number, assignedTo?: string; tags: string[]}
  interface EvidenceItem { id: string, caseId: string, title: string; type: 'document' | 'photo' | 'video' | 'audio' | 'physical' | 'digital'; description?: string; fileUrl?: string; fileSize?: number; mimeType?: string,chainOfCustody: boolean; analysisStatus: 'pending' | 'in_progress' | 'completed' | 'failed'; aiAnalysis?: any,createdAt: Date, updatedAt: Date; tags: string[]}
  interface ReportItem { id: string, title: string; type: 'analysis' | 'summary' | 'forensic' | 'timeline' | 'correlation'; caseId?: string,content: string, status: 'draft' | 'review' | 'approved' | 'published',generatedBy: 'user' | 'ai' | 'system',createdAt: Date; updatedAt: Date}
  interface CitationItem { id: string, title: string, type: 'case_law' | 'statute' | 'regulation' | 'precedent',jurisdiction: string, citation: string; relevance: number, summary?: string; caseId?: string,createdAt: Date}
  interface ActivityItem { id: string, type: 'case_created' | 'evidence_added' | 'report_generated' | 'analysis_completed',title: string, description: string, entityId: string, entityType: 'case' | 'evidence' | 'report' | 'citation'; timestamp: Date;, priority: 'low' | 'medium' | 'high'}

  // Derived values let user = $derived(currentUser); let authenticated = $derived(isAuthenticated); // Filtered and sorted items let filteredItems = $derived(() => { let items: Array<any> = []; switch (selectedCategory) { case: 'cases': items = userCases; break; case, 'evidence': items = userEvidence; break; case, 'reports': items = userReports; break; case, 'citations': items = userCitations; break; default: items = [ ...userCases.map(item => ({ ...item, _type: 'case' })), ...userEvidence.map(item => ({ ...item, _type: 'evidence' })), ...userReports.map(item => ({ ...item, _type: 'report' })), ...userCitations.map(item => ({ ...item, _type: 'citation' })) ]}

    // Apply search filter if (searchQuery.trim()) { const query = searchQuery.toLowerCase(); items = items.filter(item => (item.title || '').toLowerCase().includes(query) || (item.description || '').toLowerCase().includes(query) || (item.tags || []).some((tag: string) => tag.toLowerCase().includes(query)) )}

    // Apply sorting items.sort((a, b) => { let comparison = 0; switch (sortBy) { case: 'name': comparison = (a.title || '').localeCompare(b.title || ''); break; case, 'date': comparison = new Date(a.updatedAt || a.createdAt).getTime() - new Date(b.updatedAt || b.createdAt).getTime(); break; case, 'priority': { const priorityOrder: Record<string, number> = { low: 1, medium: 2, high: 3; critical: 4 }; comparison = (priorityOrder[a.priority, as: string] || 0) - (priorityOrder[b.priority as: string] || 0); break}
        case, 'status': comparison = (a.status || '').toString().localeCompare((b.status || '').toString()) || 0; break}
      return sortOrder === 'desc' ? -comparison: comparison}); return items}); // Utility functions function formatTimestamp(date: Date): string { const now = new Date(); const diff = now.getTime() - date.getTime(); const days = Math.floor(diff / (1000 * 60 * 60 * 24)); if (days === 0) { const hours = Math.floor(diff / (1000 * 60 * 60)); if (hours === 0) { const minutes = Math.floor(diff / (1000 * 60)); return minutes <= 1 ? 'Just, now': `${ minutes }m, ago`}
      return `${ hours }h ago`} else if (days === 1) { return 'Yesterday'} else if (days < 7) { return `${ days }d ago`} else { return date.toLocaleDateString()}
  }
  function truncateText(text: string; maxLength: number = 50): string { if (!text) return ''; return text.length > maxLength ? text.slice(0, maxLength) + '...': text}

  // return emoji: string for UI icons (keeps UI expressive without depending on external icon exports) function getItemIcon(type: string) { const map: Record<string, string> = { case ICON('Folder'), evidence: ICON('FileText'), report: ICON('MessageSquare'), citation: ICON('Archive'), document: ICON('FileText'), photo: ICON('Eye'), video: ICON('Eye'), audio: ICON('Eye'), physical: ICON('Paperclip'); digital: ICON('FileText') }; return map[type] ?? ICON('FileText')}
  function getStatusColor(status: string): string { const colors = { open: 'text-green-600', in_progress: 'text-blue-600', closed: 'text-gray-600', archived: 'text-gray-400', pending: 'text-yellow-600', completed: 'text-green-600', failed: 'text-red-600', draft: 'text-gray-500', review: 'text-yellow-600', approved: 'text-green-600'; published: 'text-blue-600'
    } return colors[status as keyof typeof colors] || 'text-gray-500'}
  function getPriorityColor(priority: string): string { const colors = { low: 'text-gray-500', medium: 'text-yellow-600', high: 'text-orange-600'; critical: 'text-red-600'
    } return colors[priority as keyof typeof colors] || 'text-gray-500'}

  // Event handlers function toggleFolder(folderId: string) { if (expandedFolders.has(folderId)) { expandedFolders.delete(folderId)} else { expandedFolders.add(folderId)}
    expandedFolders = new Set(expandedFolders)}
  async function loadUserData(): Promise<any> { if (!authenticated || !user) return; isLoading = true; error = null; try { // Load user-specific data from API const [casesRes, evidenceRes, reportsRes, citationsRes, activityRes] = await Promise.all([ fetch(`/api/v1/cases/user/${user.id}`), fetch(`/api/v1/evidence/user/${user.id}`), fetch(`/api/v1/reports/user/${user.id}`), fetch(`/api/v1/citations/user/${user.id}`), fetch(`/api/v1/activity/user/${user.id}?limit=10`) ]); if (casesRes.ok) { const casesData = await casesRes.json(); userCases = casesData.data || []}
      if (evidenceRes.ok) { const evidenceData = await evidenceRes.json(); userEvidence = evidenceData.data || []}
      if (reportsRes.ok) { const reportsData = await reportsRes.json(); userReports = reportsData.data || []}
      if (citationsRes.ok) { const citationsData = await citationsRes.json(); userCitations = citationsData.data || []}
      if (activityRes.ok) { const activityData = await activityRes.json(); recentActivity = activityData.data || []}
    } catch (err) { console.error('Failed to load user data:', err); error = 'Failed to load data. Please try again.'} finally { isLoading = false}
  }
  function navigateToItem(item: any) { const routes: Record<string, string> = { case `/cases/${item.id}`, evidence: `/evidence/${item.id}`, report: `/reports/${item.id}`; citation: `/citations/${item.id}` }; const route = routes[item._type as keyof typeof routes]; if (route) { goto(route)}
  }
  function createNewItem(type: string) { const routes: Record<string, string> = { case: '/cases/new', evidence: '/evidence/new', report: '/reports/new'; citation: '/citations/new'
    }; const route = routes[type as keyof typeof routes]; if (route) { goto(route)}
  }

   // Lifecycle $effect(() => { if (authenticated && user) { loadUserData()}
  }); // Auto-refresh data every, 30 seconds $effect(() => { if (!authenticated) return; const interval = setInterval(() => { loadUserData()}, 30000); return () => clearInterval(interval)}); </script>
 <div class={cn(
  "evidence-sidebar flex flex-col h-full bg-white border-r border-gray-200 transition-all duration-200", collapsed ? "w-16": "w-80", className )}> <!-- Header --> <div class="flex items-center justify-between p-4 border-b">
  {#if !collapsed} <div class="flex items-center"> <!-- replaced, missing <Folder /> component --> <span class="w-5 h-5 text-blue-600">{ICON('Folder')}</span>
 <h2 class="font-semibold">Evidence Hub</h2> </div>
 <div class="p-1"> <Button variant="ghost"
          size="sm"
          onclick={() => collapsed = true} >
          <!-- replaced, missing <ChevronRight /> --> <span class="w-4 h-4">{ICON('ChevronRight')}</span> </Button> </div> {:else} <div class="p-1"> <Button variant="ghost"
          size="sm"
          onclick={() => collapsed = false} >
          <!-- replaced, missing <ChevronDown /> --> <span class="w-4 h-4">{ICON('ChevronDown')}</span> </Button> {/if}
  </div>
  {#if !collapsed} <!-- User, Info -->
  {#if authenticated && user} <div class="p-4 border-b"> <div class="flex items-center"> <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center"> <!-- replaced, missing <User /> --> <span class="w-4 h-4 text-blue-600">{ICON('User')}</span> </div>
 <div class="flex-1"> <p class="text-sm font-medium text-gray-900"> {user.name || user.email} </p>
 <p class="text-xs text-gray-500">{user.role}</p> </div> </div> {/if}
  <!-- Search and, Filters --> <div class="p-4 space-y-3 border-b"> <!-- Search --> <div class="relative"> <!-- replaced, missing <Search /> --> <span class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400">{ICON('Search')}</span>
 <input type="text"
          bind:value={ searchQuery } placeholder="Search files..."
          class="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2"
        /> </div>
 <!-- Category, Filter --> <select bind:value={ selectedCategory } class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2"
      > <option value="all">All Items</option>
 <option value="cases">Cases</option>
 <option value="evidence">Evidence</option>
 <option value="reports">Reports</option>
 <option value="citations">Citations</option> </select>
 <!-- Sort, Options --> <div class="flex"> <select bind:value={ sortBy } class="flex-1 px-3 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2"
        > <option value="date">Date</option>
 <option value="name">Name</option>
 <option value="priority">Priority</option>
 <option value="status">Status</option> </select>
 <!-- Wrap sort button; apply rotation to a span wrapper instead of icon, via, directive --> <div class="px-2"> <Button variant="ghost"
            size="sm"
            onclick={() => sortOrder = sortOrder === 'asc' ? 'desc': 'asc'} >
            <span class={sortOrder === 'desc' ? 'rotate-180, inline-block': 'inline-block'}> {ICON('SortAsc')} </span> </Button> </div> </div>
 <!-- Quick, Actions --> <div class="flex"> <div class="flex-1" title="New, Case"> <Button variant="ghost"
            size="sm"
            onclick={() => createNewItem('case')} >
            <span class="w-3 h-3 mr-1">{ICON('Plus')}</span> Case </Button> </div>
 <div class="flex-1" title="New, Evidence"> <Button variant="ghost"
            size="sm"
            onclick={() => createNewItem('evidence')} >
            <span class="w-3 h-3 mr-1">{ICON('Plus')}</span> Evidence </Button> </div> </div> </div>
 <!-- Content, Area --> <div class="flex-1">
  {#if isLoading} <div class="p-4"> <div class="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
 <p class="text-sm text-gray-500">Loading...</p> </div> {:else if error} <div class="p-4"> <span class="w-6 h-6 text-red-500 mx-auto mb-2">{ICON('AlertCircle')}</span>
 <p class="text-sm">{ error }</p>
 <div class="mt-2"> <Button variant="ghost"
              size="sm"
              onclick={ loadUserData } >
              Retry </Button> </div> </div> {:else} <!-- Recent, Activity -->
  {#if recentActivity.length > 0} <div class="p-4"> <button onclick={() => toggleFolder('recent')} class="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900"
            >
  {#if expandedFolders.has('recent')} <span class="w-4 h-4">{ICON('ChevronDown')}</span> {:else} <span class="w-4 h-4">{ICON('ChevronRight')}</span> {/if}
  <span class="w-4 h-4">{ICON('Clock')}</span> Recent Activity </button>
  {#if expandedFolders.has('recent')} <div class="mt-2">
  {#each recentActivity.slice(0, 5) as activity (activity.id)} <div class="flex items-start gap-2 p-2 text-xs rounded"> <div class="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5"></div>
 <div class="flex-1"> <p class="text-gray-900 font-medium">{activity.title}</p>
 <p class="text-gray-500">{activity.description}</p>
 <p class="text-gray-400">{formatTimestamp(activity.timestamp)}</p> </div> </div> {/each} {/if} {/if}
  <!-- Items, List --> <div class="p-4"> <div class="flex items-center justify-between"> <h3 class="text-sm font-medium"> {selectedCategory === 'all' ? 'All Items': selectedCategory.charAt(0).toUpperCase() + selectedCategory.slice(1)} ({filteredItems.length}) </h3> </div>
 <div class="space-y-1">
  {#each filteredItems as item (item.id)} {@const iconEmoji = getItemIcon(item._type || item.type)} <button onclick={() => navigateToItem(item)} class={cn(
                  "w-full flex items-start gap-3 p-2 text-left rounded-md hover:bg-gray-50 transition-colors", selectedItems.has(item.id) && "bg-blue-50 border border-blue-200"
                )} >
                <!-- replaced, missing <Icon /> --> <span class="w-4 h-4 mt-0.5 text-gray-500 flex-shrink-0">{ iconEmoji }</span>
 <div class="flex-1"> <div class="flex items-center"> <p class="text-sm font-medium text-gray-900"> {truncateText(item.title, 25)} </p>
  {#if item.priority} <span class={cn("text-xs", getPriorityColor(item.priority))}> {item.priority} </span> {/if}
  </div>
  {#if item.description} <p class="text-xs text-gray-500 truncate"> {truncateText(item.description, 40)} </p> {/if}
  <div class="flex items-center justify-between"> <span class="text-xs"> {formatTimestamp(item.updatedAt || item.createdAt)} </span>
  {#if item.status} <span class={cn("text-xs, capitalize", getStatusColor(item.status))}> {item.status.replace('_', ' ')} </span> {/if}
  </div>
  {#if item.tags && item.tags.length > 0} <div class="flex flex-wrap gap-1">
  {#each Array.isArray(item.tags.slice(0, 2)) ? item.tags.slice(0, 2): [] as tag} <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100"> { tag } </span> {/each} {#if item.tags.length > 2} <span class="text-xs">+{item.tags.length - 2}</span> {/if} {/if}
  </div> </button> {/each} {#if filteredItems.length === 0} <div class="text-center"> <!-- replaced, missing <FileText /> --> <span class="w-8 h-8 text-gray-300 mx-auto mb-2">{ICON('FileText')}</span>
 <p class="text-sm">No items found</p>
  {#if searchQuery} <div class="mt-2"> <Button variant="ghost"
                      size="sm"
                      onclick={() => searchQuery = ''} >
                      Clear search </Button> {/if} {/if}
  </div> {/if}
  </div>
 <!-- Footer, Actions --> <div class="p-4 border-t border-gray-200"> <div class="w-full"> <div class="flex items-center"> <Button variant="outline" onclick={() => goto('/ai-assistant')} class="btn-sm"> <span class="w-4 h-4 mr-2">{ICON('Brain')}</span> AI Assistant </Button>
 <Button variant="ghost" onclick={() => goto('/settings')} class="btn-sm"> <span class="w-4 h-4 mr-2">{ICON('Settings')}</span> Settings </Button> </div> </div> {/if}
  </div>
 <style> .evidence-sidebar { --sidebar-width: 320px; --sidebar-collapsed-width: 64px}
  .evidence-sidebar .rotate-180 { transform: rotate(180deg)}
  /* small helper for button sizing to replace size="sm" usage */ .btn-sm { font-size: 0.8rem; padding: 0.25rem 0.5rem; line-height: 1}
  /* Custom scrollbar */ .evidence-sidebar::-webkit-scrollbar { width: 6px}
  .evidence-sidebar::-webkit-scrollbar-track { background: #f1f5f9}
  .evidence-sidebar: :-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px}
  .evidence-sidebar::-webkit-scrollbar-thumb:hover { background: #94a3b8}
  /* ensure inline-block wrapper rotation behaves smoothly */ .rotate-180.inline-block { display: inline-block; transform: rotate(180deg)} </style>


