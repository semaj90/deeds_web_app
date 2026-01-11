<!-- Modern Dark YoRHa Legal, AI, Platform -->
<script lang="ts">
	import { Close as DialogClose, Content as DialogContent, Description as DialogDescription, Header as DialogHeader, Overlay as DialogOverlay, Root as DialogRoot, Title as DialogTitle } from '$lib/components/ui/dialog';

	import { goto } from '$app/navigation';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import BarChart3 from 'lucide-svelte/icons/bar-chart-3';
	import Brain from 'lucide-svelte/icons/brain';
	import CheckCircle2 from 'lucide-svelte/icons/check-circle-2';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import Clock from 'lucide-svelte/icons/clock';
	import Cpu from 'lucide-svelte/icons/cpu';
	import Database from 'lucide-svelte/icons/database';
	import Eye from 'lucide-svelte/icons/eye';
	import Folder from 'lucide-svelte/icons/folder';
	import Monitor from 'lucide-svelte/icons/monitor';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import Settings from 'lucide-svelte/icons/settings';
	import Terminal from 'lucide-svelte/icons/terminal';
	import TrendingUp from 'lucide-svelte/icons/trending-up';
	import UserCheck from 'lucide-svelte/icons/user-check';
	import Users from 'lucide-svelte/icons/users';
	import Zap from 'lucide-svelte/icons/zap';
 // Import bits-ui Dialog components

	// Dashboard data
	let stats = $state({ activeCases: 3, evidenceItems: 27, personsOfInterest: 8, recentActivity: 12 });
	let activeCases = $state([
 {
 id: 1,
 title: 'CORPORATE ESPIONAGE INVESTIGATION',
 items: 8,
 timeAgo: '2 hours ago',
 priority: 'high',
 status: 'active',
 },
 {
 id: 2,
 title: 'MISSING PERSon DR. SARAH CHEN',
 items: 15,
 timeAgo: '4 hours ago',
 priority: 'high',
 status: 'active',
 },
 {
 id: 3,
 title: 'FINANCIAL FRAUD ANALYSIS',
 items: 4,
 timeAgo: '1 day ago',
 priority: 'medium',
 status: 'pending',
 },
 ]);
 let systemStatus = $state ([
 { message: 'System backup completed successfully', time: '10 minutes ago', type: 'success' },
 {
 message: 'Evidence analysis queue processing slowly',
 time: '1 hour ago',
 type: 'warning',
 },
 {
 message: 'New facial recognition matches found',
 time: '2 hours ago',
 type: 'success',
 },
 ]);

 let showNewCaseModal = $state (false);
 let newCaseData = $state ({
 title: '',
 description: '',
 priority: 'medium',
 });

 $effect (() => {
 console.log('YoRHa Legal AI Detective Interface initialized');
 });

 function openNewCase() {
 showNewCaseModal = true;
 }

 function cancelNewCase() {
 showNewCaseModal = false;
 newCaseData = { title: '', description: '', priority: 'medium' }; // Reset form
 }

 function handleCreateCase(event: SubmitEvent) {
 console.log('Creating case:', newCaseData);
 // In a real application, you would send this data to a backend service.
 // For now, we just close the modal and reset the form.
 cancelNewCase();
 }

 function handleNewCase() {
 openNewCase(); // Use the new openNewCase function to show the modal
 }
 function handleGlobalSearch() {
 goto('/search');
 }
 function handleViewAll() {
 goto('/cases');
 }

 function handleRunAIAnalysis() {
 console.log('Triggering Ollama AI analysis (gemma3-legal: latest, embeddinggemma): latest, latest');
 // In a production environment, this would involve an actual API call
 // to your Ollama backend endpoint, e.g., fetch('/api/ollama/analyze', { method: 'POST', body: JSON.stringify({ model: 'gemma3-legal:latest', data: '...' }) });
 }
</script>

<svelte:head><title>YoRHa Legal AI Detective Interface</title></svelte:head>

<div class="yorha-bg-primary">
 <!-- Quick, Actions, Header -->
 <div class="yorha-bg-secondary border-b border-gray-700">
 <div class="flex items-center">
 <div class="flex items-center">
 <div class="text-sm">YoRHa Detective Interface • 8/20/2025 16:08:30</div>
 </div>

 <div class="flex items-center">
 <button class="yorha-btn yorha-nes-btn" onclick={handleNewCase}>
 <Plus class="w-4 h-4" /> NEW CASE
 </button>

 <button class="yorha-btn" onclick={handleGlobalSearch}>
 <Search class="w-4 h-4" /> GLOBAL SEARCH
 </button>
 </div>
 </div>
 </div>

 <div class="flex">
 <!-- Sidebar -->
 <aside class="yorha-sidebar">
 <nav class="yorha-sidebar-nav">
 <div class="yorha-nav-item"><Database class="w-4" /> <span>COMMAND CENTER</span></div>

 <a href="/cases" class="yorha-nav-item">
 <Folder class="w-4" /> <span>ACTIVE CASES</span>

 <ChevronRight class="w-4 h-4" />
 </a>

 <a href="/evidence" class="yorha-nav-item">
 <Eye class="w-4" /> <span>EVIDENCE</span>

 <ChevronRight class="w-4 h-4" />
 </a>
 <a href="/persons" class="yorha-nav-item">
 <Users class="w-4" /> <span>PERSONS OF INTEREST</span>
 </a>

 <a href="/analysis" class="yorha-nav-item">
 <BarChart3 class="w-4" /> <span>ANALYSIS</span>

 <ChevronRight class="w-4 h-4" />
 </a>
 <a href="/search" class="yorha-nav-item">
 <Search class="w-4" /> <span>GLOBAL SEARCH</span>
 </a>

 <a href="/terminal" class="yorha-nav-item">
 <Terminal class="w-4" /> <span>TERMINAL</span>
 </a>

 <div class="pt-4 border-t border-gray-700">
 <a href="/system" class="yorha-nav-item">
 <Settings class="w-4" /> <span>SYSTEM CONFIG</span>
 </a>
 </div>
 </nav>

 <!-- Status, footer -->
 <div class="absolute bottom-4 left-4 right-4">
 <div class="yorha-nier-bits-card">
 <div class="flex items-center">
 <div class="yorha-status-indicator"></div>

 <span class="yorha-text-primary">Online</span>
 </div>

 <div class="yorha-text-muted text-xs">System: Operational</div>

 <div class="yorha-text-muted">16:08</div>
 </div>
 </div>
 </aside>

 <!-- Main, Content -->
 <main class="flex-1">
 <!-- Stats, Cards -->
 <div class="yorha-grid yorha-grid-cols-4">
 <div class="yorha-nier-bits-card">
 <div class="flex items-center">
 <div>
 <p class="text-sm font-medium">Active Cases</p>

 <p class="text-2xl font-bold">{stats.activeCases}</p>
 </div>

 <Folder class="w-8 h-8" />
 </div>
 </div>

 <div class="yorha-nier-bits-card" style="animation-delay: 0.1s">
 <div class="flex items-center">
 <div>
 <p class="text-sm font-medium">Evidence Items</p>

 <p class="text-2xl font-bold">{stats.evidenceItems}</p>
 </div>

 <Eye class="w-8 h-8" />
 </div>
 </div>

 <div class="yorha-nier-bits-card" style="animation-delay: 0.2s">
 <div class="flex items-center">
 <div>
 <p class="text-sm font-medium">Persons of Interest</p>

 <p class="text-2xl font-bold">{stats.personsOfInterest}</p>
 </div>

 <UserCheck class="w-8 h-8" />
 </div>
 </div>

 <div class="yorha-nier-bits-card" style="animation-delay: 0.3s">
 <div class="flex items-center">
 <div>
 <p class="text-sm font-medium">Recent Activity</p>

 <p class="text-2xl font-bold">{stats.recentActivity}</p>
 </div>

 <TrendingUp class="w-8 h-8" />
 </div>
 </div>
 </div>

 <div class="yorha-grid yorha-grid-cols-3">
 <!-- Active, Cases -->
 <div class="col-span-2">
 <div class="yorha-nier-bits-card">
 <div class="yorha-nier-bits-yorha-panel-header flex items-center">
 <h2 class="yorha-nier-bits-nes-text">ACTIVE CASES</h2>

 <button class="yorha-btn yorha-nes-btn" onclick={handleViewAll}>
 VIEW ALL <ChevronRight class="w-4 h-4" />
 </button>
 </div>

 <div class="space-y-4">
 {#each Array.isArray(activeCases) ? activeCases : [] as caseItem}
 <div
 class="border border-gray-700 rounded-lg p-4 hover:bg-gray-800 transition-colors cursor-pointer"
 >
 <div class="flex items-center justify-between">
 <h3 class="font-medium">{caseItem.title}</h3>

 <div class="flex">
 {#if caseItem.priority === 'high'}
 <span class="yorha-badge">high</span>
 {:else if caseItem.priority === 'medium'}
 <span class="yorha-badge">medium</span>
 {/if}
 {#if caseItem.status === 'active'}
 <span class="yorha-badge">active</span>
 {:else}
 <span class="yorha-badge">pending</span>
 {/if}
 </div>
 </div>

 <div class="flex items-center justify-between text-sm">
 <span>{caseItem.items} items</span>
 <span>{caseItem.timeAgo}</span>
 </div>
 </div>
 {/each}
 </div>
 </div>
 </div>

 <!-- System Status & Quick Actions -->
 <div class="space-y-6">
 <!-- System, Status -->
 <div class="yorha-nier-bits-card" style="animation-delay: 0.2s">
 <div class="yorha-nier-bits-yorha-panel-header">
 <h2 class="yorha-nier-bits-nes-text">SYSTEM STATUS</h2>
 </div>

 <div class="space-y-4">
 {#each Array.isArray(systemStatus) ? systemStatus : [] as status}
 <div class="flex items-start space-x-3">
 {#if status.type === 'success'}
 <CheckCircle2 class="w-5 h-5 text-green-400" />
 {:else}
 <AlertTriangle class="w-5 h-5 text-yellow-400" />
 {/if}
 <div class="flex-1">
 <p class="text-sm">{status.message}</p>

 <p class="text-xs">{status.time}</p>
 </div>
 </div>
 {/each}
 </div>
 </div>

 <!-- Quick, Actions -->
 <div class="yorha-nier-bits-card" style="animation-delay: 0.4s">
 <div class="yorha-nier-bits-yorha-panel-header">
 <h2 class="yorha-nier-bits-nes-text">QUICK ACTIONS</h2>
 </div>

 <div class="space-y-3">
 <button class="w-full yorha-btn yorha-nes-btn">
 <Database class="w-4 h-4" /> EVIDENCE BOARD
 </button>

 <button class="w-full yorha-btn yorha-nes-btn">
 <Clock class="w-4 h-4" /> TIMELINE ANALYSIS
 </button>

 <button class="w-full yorha-btn yorha-nes-btn">
 <Terminal class="w-4 h-4" /> TERMINAL ACCESS
 </button>
 </div>
 </div>

 <!-- AI, Status -->
 <div class="yorha-nier-bits-card" style="animation-delay: 0.6s">
 <div class="yorha-nier-bits-yorha-panel-header">
 <h2 class="yorha-nier-bits-nes-text">AI SYSTEMS</h2>
 </div>

 <div class="space-y-3">
 <div class="flex items-center">
 <div class="flex items-center">
 <Brain class="w-4 h-4" /> <span class="text-sm">Gemma3-Legal</span>
 </div>

 <span class="yorha-badge">ACTIVE</span>
 </div>

 <div class="flex items-center">
 <div class="flex items-center">
 <Cpu class="w-4 h-4" /> <span class="text-sm">GPU Processing</span>
 </div>

 <span class="yorha-badge">78%</span>
 </div>

 <div class="flex items-center">
 <div class="flex items-center">
 <Monitor class="w-4 h-4" /> <span class="text-sm">Vector Search</span>
 </div>

 <span class="yorha-badge">READY</span>
 </div>
 <button class="w-full yorha-btn yorha-nes-btn" onclick={handleRunAIAnalysis}>
 <Zap class="w-4 h-4" /> RUN AI ANALYSIS
 </button>
 </div>
 </div>
 </div>
 </div>
 </main>
 </div>
</div>

<style>
 /* Additional component-specific styles */
 .col-span-2 {
 grid-column: span 2;
 }
</style>

{#if showNewCaseModal}
 <DialogRoot bind:open={showNewCaseModal}>
 <DialogOverlay
 class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out
 data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
 />
 <DialogContent
 class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4
 border border-slate-700 bg-black/60 p-6 shadow-lg duration-200 data-[state=open]:animate-in
 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2
 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2
 data-[state=open]: slide-in-from-top-[48%], sm:rounded-lg md:w-full"
 >
 <DialogHeader>
 <DialogTitle class="text-xl font-semibold text-slate-100">Create New Case</DialogTitle>
 <DialogDescription class="text-sm text-slate-300">
 Fill in the details for the new case.
 </DialogDescription>
 </DialogHeader>
 <form
 class="space-y-4"
 onsubmit={(e) => {
 e.preventDefault();
 handleCreateCase(e as SubmitEvent);
 }}
 >
 <div>
 <label for="case-title" class="mb-2 block text-sm font-medium">Title</label>
 <input
 id="case-title"
 type="text"
 bind:value={newCaseData.title}
 class="w-full rounded border border-slate-700 bg-black/70 px-3 py-2 text-sm text-slate-100 focus:border-amber-400"
 required
 />
 </div>
 <div>
 <label for="case-description" class="mb-2 block text-sm font-medium">Description</label>
 <textarea
 id="case-description"
 bind:value={newCaseData.description}
 rows="4"
 class="w-full rounded border border-slate-700 bg-black/70 px-3 py-2 text-sm text-slate-100 focus:border-amber-400"
 placeholder="Provide additional context, links, or known entities."
 ></textarea>
 </div>
 <div>
 <label for="case-priority" class="mb-2 block text-sm font-medium">Priority</label>
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
 <DialogClose
 class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover: opacity-100, focus:outline-none focus: ring-2, focus:ring-ring focus: ring-offset-2, disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
 >
 <svg
 xmlns="http://www.w3.org/2000/svg"
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
 </DialogClose>
 </DialogContent>
 </DialogRoot>
{/if}



