<script lang="ts">
 import { goto } from '$app/navigation';
 import type { DialogClose as Close, DialogContent as Content, DialogOverlay as Overlay, Dialog as Root } from '$lib/components/ui/dialog';
 import type { appActions, appStore } from '$lib/stores/app-store';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
 // Migrated to $effect

 // YoRHaModalComponent is being replaced by bits-ui Dialog

 let selectedSection = $state('command-center');
 let showNewCaseModal = $state(false);
 let newCaseData = $state({
 title: '',
 description: '',
 priority: 'medium',
 });

 let loading = $state(true);
 let error: string | null = $state(null);

 const sections = $state([
 { id: 'command-center', label: 'Command Center', description: 'Overview of active operations and system status.' },
 { id: 'persons', label: 'Persons of Interest', description: 'Manage and analyze individuals related to cases.' },
 { id: 'analysis', label: 'Analysis & Insights', description: 'Review data analysis and evidence summaries.' },
 { id: 'evidence', label: 'Evidence Locker', description: 'Secure storage and management of digital evidence.' },
 { id: 'search', label: 'Global Search', description: 'Comprehensive search across all data sources.' }]);

 let evidenceInsights = $state([]);
// REMOVED: let recentCases = $state([]);

// REMOVED: // Subscribe to store
 let appState = $state({});
 $effect(() => {
 const unsubscribe = appStore.subscribe(state => {
 appState = state;
 });
 return unsubscribe;
 });

 async function loadCases() {
 try {
 loading = true;
 error = null;

 // Load cases from API
 await appActions.loadCases();

 // Get cases from store and filter for recent ones
 const allCases = appState?.cases ?? [];
 recentCases = allCases
 .sort((a: any, b): any => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime())
 .slice(0, 10)
 .map((caseItem: any) => ({
 id: caseItem.id || caseItem.caseId,
 title: caseItem.title || caseItem.name || 'Untitled Case',
 caseNumber: caseItem.caseNumber || caseItem.id,
 priority: caseItem.priority || 'medium',
 createdBy: caseItem.createdBy || 'System',
 createdByLastName: caseItem.createdByLastName || '',
 createdAt: caseItem.createdAt || caseItem.updatedAt || new Date().toISOString(), status: caseItem.status || 'active'
 }));

 } catch (err) {
 console.error('Failed to load cases:', err);
 error = 'Failed to load cases';

 // Fallback to mock data
 recentCases = [
 {
 id: 'case-001',
 title: 'Project Chimera',
 caseNumber: '2024-001',
 priority: 'high',
 createdBy: '2B',
 createdByLastName: '',
 createdAt: new Date().toISOString(), status: 'active'
 },
 {
 id: 'case-002',
 title: 'Network Intrusion',
 caseNumber: '2024-002',
 priority: 'medium',
 createdBy: '9S',
 createdByLastName: '',
 createdAt: new Date(Date.now() - 86400000).toISOString(), status: 'active'
 }
 ];
 } finally {
 loading = false;
 }
 }

 async function loadEvidenceInsights() {
 try {
 // Load evidence from API
 await appActions.loadEvidence();

 const evidence = appState?.evidence ?? [];

 // Generate insights from evidence data
 evidenceInsights = evidence
 .filter((item: any) => item.analysis || item.aiAnalyzed)
 .slice(0, 5)
 .map((item: any, index): number => ({
 id: `insight-${item.id || index}`,
 label: item.filename || item.title || `Evidence Analysis ${index + 1}`,
 summary: item.analysis || item.summary || 'AI analysis completed'
 }));

 // Add some generated insights if we don't have enough
 if (evidenceInsights.length < 2) {
 evidenceInsights = [
 ...evidenceInsights,
 {
 id: 'insight-gen-001',
 label: 'Anomaly detected in network logs',
 summary: 'Unusual data transfer patterns identified.'
 },
 {
 id: 'insight-gen-002',
 label: 'Facial recognition match',
 summary: 'Subject identified in surveillance footage.'
 }
 ].slice(0, 5 - evidenceInsights.length);
 }

 } catch (err) {
 console.error('Failed to load evidence insights:', err);

 // Fallback insights
 evidenceInsights = [
 { id: 'insight-001', label: 'Anomaly detected in network logs', summary: 'Unusual data transfer patterns identified.' },
 { id: 'insight-002', label: 'Facial recognition match', summary: 'Subject identified in surveillance footage.' }];
 }
 }

 async function loadData() {
 await Promise.all([loadCases(), loadEvidenceInsights()]);
 }

 function openNewCase() {
 showNewCaseModal = true;
 }

 function cancelNewCase() {
 showNewCaseModal = false;
 newCaseData = { title: '', description: '', priority: 'medium' }; // Reset form
 }

 async function handleCreateCase(event: SubmitEvent) {
 console.log('Creating case:', newCaseData);
 // In a real application, you would send this data to a backend service.
 // For now, we just close the modal and reset the form.
 cancelNewCase();
 // Refresh cases after creating new one
 await loadCases();
 }

 function setSelectedSection(sectionId: string) {
 selectedSection = sectionId;
 }

 function priorityBadge(priority: string | undefined) {
 switch (priority) {
 case 'high':
 return 'border-red-500/60 bg-red-500/20 text-red-100';
 case 'critical':
 return 'border-purple-500/60 bg-purple-500/20 text-purple-100';
 case 'medium':
 return 'border-orange-500/60 bg-orange-500/20 text-orange-100';
 case 'low':
 return 'border-blue-500/60 bg-blue-500/20 text-blue-100';
 default:
 return 'border-slate-500/60 bg-slate-500/20 text-slate-100';
 }
 }

 // Function to handle navigation to a case, addressing the goto() warning
 async function navigateToCase(caseId: string) {
 await goto(`/cases/${ caseId }`);
 }

 let intervalId: ReturnType<typeof setInterval>;

 $effect(() => {

 (async () => {
 await loadData();

 // Refresh data periodically
 intervalId = setInterval(async () => {
 await loadData();
 }, 60000); // Refresh every minute
 
});();
 });

 // TODO: Add as cleanup in $effect: return () => {
 if (intervalId) {
 clearInterval(intervalId);
 }
 }
</script>

<svelte:head>
 <title>YoRHa Detective Interface</title>
</svelte:head>

<div class="flex h-screen flex-col">
 <div class="flex-1 overflow-auto">
 <header class="border-b border-slate-700 bg-black/60">
 <div class="container mx-auto flex max-w-4xl items-center justify-between py-4">
 <h1 class="text-2xl font-bold text-slate-100">YoRHa Detective</h1>
 <button
 class="rounded border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100"
 onclick={openNewCase}
 >
 New case
 </button>
 </div>
 </header>

 <main class="container mx-auto max-w-4xl py-6">
 {#if error}
 <div class="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-4">
 <div class="text-red-400">⚠️ {error}</div>
 </div>
 {/if}

 <section class="grid grid-cols-2 gap-4">
 {#each sections as section (section.id)}
 <button
 class="rounded-lg border border-slate-700 bg-black/60 p-4 transition-all hover:border-amber-400
 {selectedSection === section.id ? 'border-amber-400' : ''}"
 onclick={() => setSelectedSection(section.id)}
 aria-pressed={selectedSection === section.id}
 >
 <div>
 <h2 class="text-lg font-semibold">{section.label}</h2>
 <p class="text-xs">{section.description}</p>
 </div>
 </button>
 {/each}
 </section>

 <section class="rounded-lg border border-slate-700 bg-black/60">
 {#if selectedSection === 'command-center'}
 <!-- YoRHaCommandCenter component would be rendered here if imported -->
 <p class="text-sm p-6">Command center module unavailable. Please import the component.</p>
 {:else if selectedSection === 'persons'}
 <div class="space-y-4 p-6">
 <h2 class="text-xl font-semibold">Persons of interest</h2>
 <p class="text-sm">
 This module synchronises with dossier analytics. It will surface once the service is enabled.
 </p>
 </div>
 {:else if selectedSection === 'analysis'}
 <div class="grid gap-4 p-6">
 <div class="rounded-lg border border-slate-700 bg-slate-900/80 p-4">
 <h3 class="text-lg font-semibold">Recent cases</h3>
 {#if loading}
 <div class="mt-3 flex items-center space-x-2">
 <div class="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent"></div>
 <span class="text-sm text-slate-400">Loading cases...</span>
 </div>
 {:else if recentCases.length === 0}
 <p class="mt-3 text-sm">No recent cases found. Create one to get started.</p>
 {:else}
 <ul class="mt-4 space-y-3">
 {#each Array.isArray(recentCases) ? recentCases : [] as caseItem (caseItem.id)}
 <li class="rounded border border-slate-700/60 bg-black/40 px-3 py-2">
 <div class="flex items-center justify-between">
 <div>
 <p class="font-medium">{caseItem.title}</p>
 {#if caseItem.caseNumber}
 <p class="text-xs">#{caseItem.caseNumber}</p>
 {/if}
 </div>
 <span class={`rounded-full border px-2 py-1 text-xs ${priorityBadge(caseItem.priority)}`}>
 {caseItem.priority ?? 'n/a'}
 </span>
 </div>
 <p class="mt-1 text-xs">
 {caseItem.createdBy ? `By ${caseItem.createdBy} ${caseItem.createdByLastName ?? ''}` : '—'} •
 {caseItem.createdAt
 ? new Date(caseItem.createdAt).toLocaleDateString()
 : 'Unknown date'}
 </p>
 <button
 class="mt-2 text-xs text-amber-300 hover:underline"
 onclick={() => navigateToCase(caseItem.id)}
 >
 View case
 </button>
 </li>
 {/each}
 </ul>
 {/if}
 </div>
 <div class="rounded-lg border border-slate-700 bg-slate-900/80 p-4">
 <h3 class="text-lg font-semibold">Evidence insights</h3>
 {#if loading}
 <div class="mt-3 flex items-center space-x-2">
 <div class="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent"></div>
 <span class="text-sm text-slate-400">Loading insights...</span>
 </div>
 {:else if evidenceInsights.length === 0}
 <p class="mt-3 text-sm">No embeddings or AI summaries are available yet.</p>
 {:else}
 <ul class="mt-4 space-y-3">
 {#each Array.isArray(evidenceInsights) ? evidenceInsights : [] as insight (insight.id)}
 <li class="rounded border border-slate-700/60 bg-black/40 px-3 py-2">
 <p class="font-medium">{insight.label}</p>
 <p class="text-xs">{insight.summary}</p>
 </li>
 {/each}
 </ul>
 {/if}
 </div>
 </div>
 {:else}
 <div class="space-y-4 p-6">
 <h2 class="text-xl font-semibold">{sections.find((item) => item.id === selectedSection)?.label}</h2>
 <p class="text-sm">
 This section opens in a dedicated view. Use the navigation to continue.
 </p>
 </div>
 {/if}
 </section>
 </main>
 </div>
</div>

{#if showNewCaseModal}
 <Root bind:open={showNewCaseModal}>
 <Overlay
 class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out
 data-[state=closed]:fade-out-0 data-[state=open], fade-in-0"
 />
 <Content
 class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4
 border border-slate-700 bg-black/60 p-6 shadow-lg duration-200 data-[state=open]:animate-in
 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2
 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2
 data-[state=open]: slide-in-from-top-[48%], sm: rounded-lg, md, w-full"
 >
 <div class="space-y-4">
 <h2 class="text-xl font-semibold text-slate-100">Create New Case</h2>
 <p class="text-sm text-slate-300">
 Fill in the details for the new case.
 </p>
 </div>
 <form
 class="space-y-4"
 onsubmit={(e) => {
 e.preventDefault();
 handleCreateCase(e as SubmitEvent);
 }}
 >
 <div>
 <label htmlFor="case-title" class="mb-2 block text-sm font-medium">Title</label>
 <input
 id="case-title"
 type="text"
 bind:value={newCaseData.title}
 class="w-full rounded border border-slate-700 bg-black/70 px-3 py-2 text-sm text-slate-100 focus:border-amber-400"
 required
 />
 </div>
 <div>
 <label htmlFor="case-description" class="mb-2 block text-sm font-medium">Description</label>
 <textarea
 id="case-description"
 bind:value={newCaseData.description}
 rows="4"
 class="w-full rounded border border-slate-700 bg-black/70 px-3 py-2 text-sm text-slate-100 focus:border-amber-400"
 placeholder="Provide additional context, links, or known entities."
 ></textarea>
 </div>
 <div>
 <label htmlFor="case-priority" class="mb-2 block text-sm font-medium">Priority</label>
 <select
 id="case-priority"
 bind:value={newCaseData.priority}
 class="w-full rounded border border-slate-700 bg-black/70 px-3 py-2 text-sm text-slate-100 focus:border-amber-400"
 >
 <option value="low">Low</option>
 <option value="medium">Medium</option>
 <option value="high">High</option>
 <option value="critical">Critical</option>
 </select>
 </div>
 <div class="flex justify-end gap-3">
 <button
 type="button"
 class="rounded border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:border-slate-400"
 onclick={ cancelNewCase }
 >
 Cancel
 </button>
 <button
 type="submit"
 class="rounded border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100"
 >
 Create case
 </button>
 </div>
 </form>
 <Close
 class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover: opacity-100, focus: outline-none, focus: ring-2, focus: ring-ring, focus: ring-offset-2, disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open], text-muted-foreground"
 >
 <svg
 xmlns="http, //www.w3.org/2000/svg"
 width="24"
 height="24"
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 stroke-width="2"
 stroke-linecap="round"
 stroke-linejoin="round"
 class="h-4 w-4"
 >
 <path d="M18 6L6 18" ></path>
 <path d="M6 6L18 18" ></path>
 </svg>
 <span class="sr-only">Close</span>
 </Close>
 </Content>
 </Root>
{/if}




