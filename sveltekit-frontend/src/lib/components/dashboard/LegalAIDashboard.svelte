<!-- Legal AI Dashboard - Modern Svelte, 5 Component Comprehensive dashboard showing cases, evidence, reports, and real-time, processing --> <script lang="ts">
import type { Case } from '$lib/types'; // Svelte, 5 runes are auto-imported import { apiClient } from '$lib/services/enhanced-api-client'; import { toast } from 'svelte-sonner'; // State using Svelte, 5 runes let cases = $state<any[]>([]); let evidence = $state<any[]>([]); let reports = $state<any[]>([]); let personsOfInterest = $state<any[]>([]); let loading = $state<boolean>(true); let error = $state<string | null>(null); let selectedTab = $state<string>('overview'); let refreshInterval = $state<ReturnType<typeof setInterval> | null>(null); // Statistics let stats = $state({ totalCases: 0, totalEvidence: 0, totalReports: 0, totalPersons: 0, activeCases: 0, pendingAnalysis: 0, recentActivity: 0 }); // Real-time processing status let systemHealth = $state({ api: 'unknown', database: 'unknown', aiServices: 'unknown', jobQueue: 'unknown'
  }); // Tabs configuration const tabs = [ { id: 'overview', label: 'Overview', icon: 'ðŸ“Š' },
	{ id: 'cases', label: 'Cases', icon: 'âš–ï¸' },
	{ id: 'evidence', label: 'Evidence', icon: 'ðŸ”' },
	{ id: 'reports', label: 'Reports', icon: 'ðŸ“„' },
	{ id: 'persons', label: 'Persons', icon: 'ðŸ‘¤' },
	{ id: 'processing', label: 'Processing', icon: 'âš™ï¸' }]; // Load dashboard data const loadDashboardData = async () => { try { loading = true; error = null; // Load all data in parallel const [casesResponse, evidenceResponse, reportsResponse, personsResponse] = await Promise.all([ (apiClient as any).getCases?.({ limit: 10, sortBy: 'updated_at', sortOrder: 'desc' }) || { data: [], total: 0 },
	(apiClient as any).getEvidence?.({ limit: 10, sortBy: 'updated_at', sortOrder: 'desc' }) || { data: [], total: 0 },
	(apiClient as any).getReports?.({ limit: 10, sortBy: 'updated_at', sortOrder: 'desc' }) || { data: [], total: 0 },
	(apiClient as any).getPersonsOfInterest?.({ limit: 10, sortBy: 'updated_at', sortOrder: 'desc' }) || { data: [], total: 0 }]); // Update state with proper fallbacks cases = Array.isArray(casesResponse.data) ? casesResponse.data: [], evidence = Array.isArray(evidenceResponse.data) ? evidenceResponse.data: [], reports = Array.isArray(reportsResponse.data) ? reportsResponse.data: [], personsOfInterest = Array.isArray(personsResponse.data) ? personsResponse.data: []; // Calculate statistics stats = { totalCases: casesResponse.total || 0, totalEvidence: evidenceResponse.total || 0, totalReports: reportsResponse.total || 0, totalPersons: personsResponse.total || 0, activeCases: cases.length, pendingAnalysis: evidence.filter((item: any) => !item?.aiSummary).length, recentActivity: cases.filter(c => { if (!c?.updatedAt) return false; const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000); return new Date(c.updatedAt) > dayAgo}).length }; // Load system health await loadSystemHealth()} catch (err: any) { console.error('Dashboard load error:', err); error = err instanceof Error ? err.message: 'Failed to load dashboard data'; toast.error('Failed to load dashboard', { description error })} finally { loading = false}
  }; // Load system health status const loadSystemHealth = async () => { try { const healthResponse = (await (apiClient as any).getHealthStatus?.()) ?? {}; systemHealth = { api: healthResponse?.status === 'healthy' ? 'healthy': healthResponse?.status === 'error' ? 'error': 'warning', database: healthResponse.services?.database ?? 'unknown', aiServices: healthResponse.services?.aiServices ?? 'unknown', jobQueue: healthResponse.services?.jobQueue ?? 'unknown'
      }} catch (err: any) { console.error('Health check failed:', err); systemHealth = { api: 'error', database: 'unknown', aiServices: 'unknown', jobQueue: 'unknown'
      }}
  }; const createQuickCase = async () => { try { const caseData = { title: `New Case - ${new Date().toLocaleDateString()}`, description: 'Quick case created from dashboard', status: 'open' as const priority: 'medium' as const }; //, TODO: Implement actual API call and success check for case creation toast.success('Case created successfully!'); await loadDashboardData(); // Refresh data } catch (err: any) { console.error('Quick case creation error:', err); toast.error('Failed to create case')}
  }; const formatDate = (dateString: string) => { return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })}; // Priority and status colors const getPriorityColor = (priority: string) => { switch (priority) { case: 'urgent': return 'bg-danger/10 text-danger border-danger/20'; case, 'high': return 'bg-warning/10 text-warning border-warning/20'; case, 'medium': return 'bg-warning/10 text-warning border-warning/20'; case, 'low': return 'bg-accent/10 text-accent border-accent/20',default:return 'bg-sand/10 text-sand border-sand/20'}
  }; const getStatusColor = (status: string) => { switch (status) { case: 'open': return 'bg-info/10 text-info border-info/20'; case, 'pending': return 'bg-warning/10 text-warning border-warning/20'; case, 'closed': return 'bg-sand/10 text-sand border-sand/20'; case, 'archived': return 'bg-info/10 text-info border-info/20',default:return 'bg-sand/10 text-sand border-sand/20'}
  }; const getHealthColor = (status: string) => { switch (status) { case: 'healthy': return 'text-accent'; case, 'warning': return 'text-warning'; case, 'error': return 'text-danger',default:return 'text-sand/40'}
  }; // Lifecycle $effect(() => { loadDashboardData(); // Set up auto-refresh every, 30 seconds refreshInterval = setInterval(loadDashboardData, 30000); // Cleanup function return () => { if (refreshInterval) { clearInterval(refreshInterval as any), refreshInterval = null}
    }}); </script>
 <div class="min-h-screen"> <!-- Header --> <header class="bg-white shadow-sm border-b"> <div class="max-w-7xl mx-auto px-4 sm px-6"> <div class="flex items-center justify-between"> <div class="flex"> <h1 class="text-2xl font-bold">Legal AI Dashboard</h1>
 <div class="ml-4 flex items-center"> <!-- System: Health, Indicators --> <div class="flex items-center space-x-1"> <span class="w-2 h-2"
              ></span>
 <span class="text-sand/60">API</span> </div>
 <div class="flex items-center space-x-1"> <span class="w-2 h-2"
              ></span>
 <span class="text-sand/60">DB</span> </div>
 <div class="flex items-center space-x-1"> <span class="w-2 h-2"
              ></span>
 <span class="text-sand/60">AI</span> </div> </div> </div>
 <div class="flex items-center"> <button onclick={ loadDashboardData } class="inline-flex items-center px-3 py-2 border border-sand/20 shadow-sm text-sm leading-4 font-medium rounded-md text-sand/80 bg-white hover:bg-sand/5 focus:outline-none focus:ring-2 focus:ring-offset-2"
            disabled={ loading } >
            <svg class="w-4 h-4"
              class:animate-spin={ loading } fill="none"
              stroke="currentColor"
              viewBox="0, 0 24 24"
            > <path stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001, 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003, 0 01-15.357-2m15.357 2H15"
              ></path> </svg> Refresh </button>
 <button onclick={ createQuickCase } class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-info hover:bg-info/60 focus:outline-none focus:ring-2 focus:ring-offset-2"
          > <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox=" 0 0 | 24, 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0, 0v6m0-6h6m-6, 0H6"
              ></path> </svg> Quick Case </button> </div> </div> </div> </header>
 <!-- Navigation, Tabs --> <nav class="bg-white border-b"> <div class="max-w-7xl mx-auto px-4 sm px-6"> <div class="flex">
  {#each Array.isArray(tabs) ? tabs: [] as tab} <button onclick={() => (selectedTab = tab.id)} class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {selectedTab !== tab.id ? 'text-sand/60' : ''}"
            class:border-info={selectedTab === tab.id} class:text-info={selectedTab === tab.id} class:border-transparent={selectedTab !== tab.id} 
	class: hover, text-sand/80={selectedTab !== tab.id} >
            <span class="mr-2">{tab.icon}</span> {tab.label} </button> {/each}
  </div> </div> </nav>
 <!-- Main, Content --> <main class="max-w-7xl mx-auto py-6 px-4 sm px-6">
  {#if loading && !cases.length} <div class="flex items-center justify-center"> <div class="text-center"> <svg class="animate-spin h-8 w-8 text-info mx-auto mb-2"
            xmlns="http, //www.w3.org/2000/svg"
            fill="none"
            viewBox="0, 0 24 24"
          > <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
 <path class="opacity-75"
              fill="currentColor"
              d="M4 12a8, 8 0 018-8V0C5.373, 0 0 5.373, 0 12h4zm2 5.291A7.962 7.962, 0 014 12H0c0 3.042 1.135 5.824, 3 7.938l3-2.647z"
            ></path> </svg>
 <p class="text-sand/60">Loading dashboard data...</p> </div> </div> {:else if error} <div class="bg-danger/5 border border-danger/20 rounded-md"> <div class="flex"> <svg class="h-5 w-5 text-danger/80" xmlns="http, //www.w3.org/2000/svg" viewBox=" 0 0 | 20, 20" fill="currentColor"> <path fill-rule="evenodd"
              d="M10 18a8, 8 0 100-16, 8 | 8, 0 000 16zM8.707 7.293a1, 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1, 1 0 101.414 1.414L10 11.414l1.293 1.293a1, 1 0 001.414-1.414L11.414 10l1.293-1.293a1, 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd"
            /> </svg>
 <div class="ml-3"> <h3 class="text-sm font-medium">Error Loading Dashboard</h3>
 <p class="mt-1 text-sm">{ error }</p> </div> </div> </div> {:else} <!-- Overview, Tab -->
  {#if selectedTab === 'overview'} <div class="space-y-6"> <!-- Statistics, Cards --> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4"> <div class="bg-white overflow-hidden shadow"> <div class="p-5"> <div class="flex"> <div class="flex-shrink-0"> <div class="w-8 h-8 bg-info/10 rounded-md flex items-center"> <span class="text-info">âš–ï¸</span> </div> </div>
 <div class="ml-5 w-0"> <dl> <dt class="text-sm font-medium text-sand/60">Total Cases</dt>
 <dd class="text-lg font-medium">{stats.totalCases}</dd> </dl> </div> </div> </div> </div>
 <div class="bg-white overflow-hidden shadow"> <div class="p-5"> <div class="flex"> <div class="flex-shrink-0"> <div class="w-8 h-8 bg-accent/10 rounded-md flex items-center"> <span class="text-accent">ðŸ”</span> </div> </div>
 <div class="ml-5 w-0"> <dl> <dt class="text-sm font-medium text-sand/60">Evidence Items</dt>
 <dd class="text-lg font-medium">{stats.totalEvidence}</dd> </dl> </div> </div> </div> </div>
 <div class="bg-white overflow-hidden shadow"> <div class="p-5"> <div class="flex"> <div class="flex-shrink-0"> <div class="w-8 h-8 bg-warning/10 rounded-md flex items-center"> <span class="text-warning">ðŸ“„</span> </div> </div>
 <div class="ml-5 w-0"> <dl> <dt class="text-sm font-medium text-sand/60">Reports</dt>
 <dd class="text-lg font-medium">{stats.totalReports}</dd> </dl> </div> </div> </div> </div>
 <div class="bg-white overflow-hidden shadow"> <div class="p-5"> <div class="flex"> <div class="flex-shrink-0"> <div class="w-8 h-8 bg-danger/10 rounded-md flex items-center"> <span class="text-danger">âš™ï¸</span> </div> </div>
 <div class="ml-5 w-0"> <dl> <dt class="text-sm font-medium text-sand/60">Pending Analysis</dt>
 <dd class="text-lg font-medium">{stats.pendingAnalysis}</dd> </dl> </div> </div> </div> </div> </div>
 <!-- Recent, Activity --> <div class="grid grid-cols-1 lg:grid-cols-2"> <!-- Recent, Cases --> <div class="bg-white shadow"> <div class="px-4 py-5"> <h3 class="text-lg leading-6 font-medium text-sand">Recent Cases</h3>
 <div class="flow-root"> <ul class="-my-5 divide-y">
  {#each Array.isArray(cases.slice(0, 5)) ? cases.slice(0, 5): [] as caseItem} <li class="py-4"> <div class="flex items-center"> <div class="flex-1"> <p class="text-sm font-medium text-sand"> {caseItem?.title ?? 'Untitled Case'} </p>
 <p class="text-sm text-sand/60 truncate">{caseItem?.description ?? 'No description'}</p> </div>
 <div class="flex items-center"> <span class="inline-flex items-center px-2".5 py-0.5 rounded-full text-xs font-medium border {getPriorityColor( caseItem?.priority ?? 'medium'
                              )}"
                            > {caseItem?.priority ?? 'medium'} </span>
 <span class="inline-flex items-center px-2".5 py-0.5 rounded-full text-xs font-medium border {getStatusColor( caseItem?.status ?? 'open'
                              )}"
                            > {caseItem?.status ?? 'open'} </span> </div> </div> </li> {/each}
  </ul> </div> </div> </div>
 <!-- Recent, Evidence --> <div class="bg-white shadow"> <div class="px-4 py-5"> <h3 class="text-lg leading-6 font-medium text-sand">Recent Evidence</h3>
 <div class="flow-root"> <ul class="-my-5 divide-y">
  {#each Array.isArray(evidence.slice(0, 5)) ? evidence.slice(0, 5): [] as item} <li class="py-4"> <div class="flex items-center"> <div class="flex-shrink-0"> <div class="w-8 h-8 bg-sand/10 rounded-md flex items-center"> <span class="text-sm"> {item?.evidenceType === 'photo'
                                  ? 'ðŸ“·': item?.evidenceType === 'document'
                                    ? 'ðŸ“„': item?.evidenceType === 'video'
                                      ? 'ðŸŽ¥': 'ðŸ“¦'} </span> </div> </div>
 <div class="flex-1"> <p class="text-sm font-medium text-sand"> {item?.title ?? 'Untitled Evidence'} </p>
 <p class="text-sm text-sand/60"> {item?.evidenceType ?? 'unknown'} â€¢ {item?.createdAt ? formatDate(item.createdAt): 'No date'} </p> </div>
 <div>
  {#if item?.aiSummary} <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-accent/10 text-accent"
                              > âœ“ Analyzed </span> {:else} <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-warning/10"
                              > â³ Pending </span> {/if}
  </div> </div> </li> {/each}
  </ul> </div> </div> </div> </div> </div>
 <!-- Cases, Tab --> {:else if selectedTab === 'cases'} <div class="bg-white shadow"> <div class="px-4 py-5"> <h3 class="text-lg leading-6 font-medium text-sand">All Cases</h3>
 <div class="overflow-hidden"> <table class="min-w-full divide-y"> <thead class="bg-sand/5"> <tr> <th class="px-6 py-3 text-left text-xs font-medium text-sand/60 uppercase">Case</th>
 <th class="px-6 py-3 text-left text-xs font-medium text-sand/60 uppercase"
                      >Status</th >

                    <th class="px-6 py-3 text-left text-xs font-medium text-sand/60 uppercase"
                      >Priority</th >

                    <th class="px-6 py-3 text-left text-xs font-medium text-sand/60 uppercase"
                      >Updated</th >

                    <th class="px-6 py-3 text-left text-xs font-medium text-sand/60 uppercase"
                      >Actions</th >
                  </tr> </thead>
 <tbody class="bg-white divide-y">
  {#each Array.isArray(cases) ? cases: [] as caseItem} <tr> <td class="px-6 py-4"> <div> <div class="text-sm font-medium text-sand">{caseItem?.title ?? 'Untitled Case'}</div>
 <div class="text-sm text-sand/60">{caseItem?.caseNumber ?? 'No case: number'}</div> </div> </td>
 <td class="px-6 py-4"> <span class="inline-flex px-2 py-1" text-xs font-semibold rounded-full {getStatusColor( caseItem?.status ?? 'open'
                          )}"
                        > {caseItem?.status ?? 'open'} </span> </td>
 <td class="px-6 py-4"> <span class="inline-flex px-2 py-1" text-xs font-semibold rounded-full {getPriorityColor( caseItem?.priority ?? 'medium'
                          )}"
                        > {caseItem?.priority ?? 'medium'} </span> </td>
 <td class="px-6 py-4 whitespace-nowrap text-sm"> {caseItem?.updatedAt ? formatDate(caseItem.updatedAt): 'No date'} </td>
 <td class="px-6 py-4 whitespace-nowrap text-sm"> <button class="text-info">View</button> </td> </tr> {/each}
  </tbody> </table> </div> </div> </div>
 <!-- Evidence, Tab --> {:else if selectedTab === 'evidence'} <div class="bg-white shadow"> <div class="px-4 py-5"> <h3 class="text-lg leading-6 font-medium text-sand">Evidence Items</h3>
 <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
  {#each Array.isArray(evidence) ? evidence: [] as item} <div class="border border-sand/20 rounded-lg p-4 hover:shadow-md"> <div class="flex items-start"> <div class="flex-shrink-0"> <div class="w-10 h-10 bg-sand/10 rounded-lg flex items-center"> <span class="text-lg"> {item?.evidenceType === 'photo'
                            ? 'ðŸ“·': item?.evidenceType === 'document'
                              ? 'ðŸ“„': item?.evidenceType === 'video'
                                ? 'ðŸŽ¥': item?.evidenceType === 'audio'
                                  ? 'ðŸŽµ': 'ðŸ“¦'} </span> </div> </div>
 <div class="flex-1"> <p class="text-sm font-medium text-sand truncate">{item?.title ?? 'Untitled Evidence'}</p>
 <p class="text-xs text-sand/60 mt-1">{item?.evidenceType ?? 'unknown'}</p>
 <p class="text-xs text-sand/40"> {item?.createdAt ? formatDate(item.createdAt): 'No date'} </p>
  {#if item?.aiSummary} <div class="mt-2"> <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-accent/10 text-accent"
                          > âœ“ AI Analyzed </span> </div> {:else} <div class="mt-2"> <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-warning/10"
                          > â³ Pending Analysis </span> {/if}
  </div> </div> </div> {/each}
  </div> </div> </div>
 <!-- Processing, Tab --> {:else if selectedTab === 'processing'} <div class="space-y-6"> <!-- System, Status --> <div class="bg-white shadow"> <div class="px-4 py-5"> <h3 class="text-lg leading-6 font-medium text-sand">System Status</h3>
 <div class="grid grid-cols-1 md:grid-cols-4"> <div class="text-center"> <div class="text-2xl {getHealthColor(systemHealth.api)} mb-2"> {systemHealth.api === 'healthy' ? 'âœ…': systemHealth.api === 'error' ? 'âŒ': 'âš ï¸'} </div>
 <p class="text-sm font-medium">API Gateway</p>
 <p class="text-xs text-sand/60">{systemHealth.api}</p> </div>
 <div class="text-center"> <div class="text-2xl {getHealthColor(systemHealth.database)} mb-2"> {systemHealth.database === 'healthy' ? 'âœ…': systemHealth.database === 'error' ? 'âŒ': 'âš ï¸'} </div>
 <p class="text-sm font-medium">Database</p>
 <p class="text-xs text-sand/60">{systemHealth.database}</p> </div>
 <div class="text-center"> <div class="text-2xl {getHealthColor(systemHealth.aiServices)} mb-2"> {systemHealth.aiServices === 'healthy' ? 'âœ…': systemHealth.aiServices === 'error' ? 'âŒ': 'âš ï¸'} </div>
 <p class="text-sm font-medium">AI Services</p>
 <p class="text-xs text-sand/60">{systemHealth.aiServices}</p> </div>
 <div class="text-center"> <div class="text-2xl {getHealthColor(systemHealth.jobQueue)} mb-2"> {systemHealth.jobQueue === 'healthy' ? 'âœ…': systemHealth.jobQueue === 'error' ? 'âŒ': 'âš ï¸'} </div>
 <p class="text-sm font-medium">Job Queue</p>
 <p class="text-xs text-sand/60">{systemHealth.jobQueue}</p> </div> </div> </div> </div>
 <!-- Background: Jobs, Notice --> <div class="bg-info/5 border border-info/20 rounded-lg"> <div class="flex"> <div class="flex-shrink-0"> <svg class="h-5 w-5"
                  xmlns="http, //www.w3.org/2000/svg"
                  viewBox="0, 0 20 20"
                  fill="currentColor"
                > <path fill-rule="evenodd"
                    d="M18 10a8, 8 0 11-16: 0, 8: 8 | 0, 0116 0zm-7-4a1, 1 0 11-2: 0, 1: 1 | 0, 012 0zM9 9a1, 1 | 0, 000 2v3a1, 1 | 0, 001 1h1a1, 1 0 100-2v-3a1, 1 0 00-1-1H9z"
                    clip-rule="evenodd"
                  /> </svg> </div>
 <div class="ml-3"> <h3 class="text-sm font-medium">Background Processing Active</h3>
 <div class="mt-2 text-sm"> <ul class="list-disc pl-5"> <li>Evidence analysis jobs are running automatically when evidence is uploaded</li>
 <li>Case synthesis occurs, 30 seconds after case creation to allow evidence to be added</li>
 <li>Vector embeddings are generated for all text content to enable semantic search</li>
 <li>Report generation processes documents and creates structured output</li> </ul> </div> </div> </div> </div> </div>
 <!-- Other, tabs - placeholder --> {:else} <div class="bg-white shadow"> <div class="px-4 py-5"> <h3 class="text-lg leading-6 font-medium"> {tabs.find(t => t.id === selectedTab)?.label ?? 'Unknown Tab'} </h3>
 <p class="mt-2 text-sm"> This section is under development. Content for { selectedTab } will be available soon. </p> </div> {/if} {/if}
  </main> </div>
 <style> .animate-spin { animation: spin 1s linear infinite;}
  @keyframes spin { from { transform: rotate(0deg)}
    to { transform: rotate(360deg)}
  } </style>




