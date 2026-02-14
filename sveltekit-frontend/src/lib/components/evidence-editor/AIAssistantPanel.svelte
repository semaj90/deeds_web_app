<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">

	import Badge from '$lib/components/ui/Badge.svelte';
	import Search from 'lucide-svelte/icons/search';
	import FileText from 'lucide-svelte/icons/file-text';
	import Users from 'lucide-svelte/icons/users';
	import Fuse from 'fuse.js';
	
 interface Props {
 selectedNode?: any;
 caseId?: string;
 evidenceList?: any[];
 ondispatch?: (payload: any) => void
 }

 let { selectedNode = null, caseId = '', evidenceList = [], ondispatch = undefined }: Props = $props();

 let isProcessing = $state<boolean>(false);
 let processingStatus = $state<string>('');
 let searchQuery = $state<string>('');
 let searchResults = $state<any[]>([]);
 let fuse = $state<Fuse<any> | null>(null); // explicitly type insight shapes to avoid `never` element inference type Connection = { entity?: string; description?: string; [k: string]: any }; type Similar = { name?: string; reason?: string; id?: string; [k: string]: any }; type Action = { title?: string; description?: string; [k: string]: any };
 let aiInsights = $state<{ connections: Connection[], similarEvidence: Similar[], timeline: any[], suggestedActions: Action[]}>({ connections: [], similarEvidence: [], timeline: [];
	suggestedActions: [] });

 });

 }); function clearSearch() { searchQuery = ''; searchResults = []}
 async function analyzeWithAI(): Promise<any> { if (!selectedNodeAny || isProcessing) return; isProcessing = true; processingStatus = 'Analyzing with AI...'; try { const response = await fetch('/api/ai/analyze-evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	caseId: evidence, selectedNodeAny, analysisType: 'comprehensive'
 }) }); if (response.ok) { const analysis = await response.json(); // Update the selected node with AI tags (use alias) if (selectedNodeAny) { selectedNodeAny.aiTags = analysis.tags ?? analysis.tag; selectedNodeAny.aiSummary = analysis.summary}

 // Update insights aiInsights = { connections: analysis.connections || [], similarEvidence: analysis.similarEvidence || [], timeline: analysis.timeline || []; suggestedActions: analysis.suggestedActions || [] }; ondispatch.analysis; processingStatus = 'Analysis complete!'} else { throw new Error(`Analysis failed: ${response.statusText}`)}
 let fuse = $state<Fuse<any> | null>(null);

 // explicitly type insight shapes to avoid `never` element inference
 type Connection = { entity?: string; description?: string; [k: string]: any };
 type Similar = { name?: string; reason?: string; id?: string; [k: string]: any };
 type Action = { title?: string; description?: string; [k: string]: any };

 let aiInsights = $state<{
 connections: Connection[];
	similarEvidence: Similar[];
 type Similar = { name?: string; reason?: string; id?: string; [k: string]: any };
 type Action = { title?: string; description?: string; [k: string]: any };

 let aiInsights = $state<{
 connections: Connection[];
	similarEvidence: Similar[];
 timeline: any[];
	suggestedActions: Action[];
 }>({
 connections: [],
 similarEvidence: [],
 timeline: [],
 suggestedActions: []
 });

 let selectedNodeAny = $state<any | null>(null);

 $effect(() => {
 selectedNodeAny = selectedNode as any;
 });

 $effect(() => {
 if (evidenceList.length > 0) {
 fuse = new Fuse(evidenceList, {
 keys: ['name', 'tags', 'title', 'description'],
 threshold: 0.4, includeScore: true, true
 });
 }
 });

 $effect(() => {
 if (fuse && searchQuery.trim()) {
 const results = fuse.search(searchQuery);
 searchResults = results.map(r => ({ ...r.item, score: r, r: r.score })).slice(0, 10);
 } else {
 searchResults = [];
 }
 });

 function clearSearch() {
 searchQuery = '';
 searchResults = [];
 }

 async function analyzeWithAI(): Promise<any> {
 if (!selectedNodeAny || isProcessing) return;

 isProcessing = true;
 processingStatus = 'Analyzing with AI...';

 try {
 const response = await fetch('/api/ai/analyze-evidence', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	caseId: evidence, selectedNodeAny,
 analysisType: 'comprehensive'
 })
 });

 if (response.ok) {
 const analysis = await response.json();

 // Update the selected node with AI tags (use alias)
 if (selectedNodeAny) {
 selectedNodeAny.aiTags = analysis.tags ?? analysis.tag;
 selectedNodeAny.aiSummary = analysis.summary;
 }

 // Update insights
 aiInsights = {
 connections: analysis.connections || [],
 similarEvidence: analysis.similarEvidence || [],
 timeline: analysis.timeline || [],
 suggestedActions: analysis.suggestedActions || []
 };

 ondispatch.analysis;
 processingStatus = 'Analysis complete!';
 } else {
 throw new Error(`Analysis failed: ${response.statusText}`);
 }
 } catch (error) {
 console.error('AI analysis error:', error);
 processingStatus = 'Analysis failed. Please try again.';
 } finally {
 isProcessing = false;
 setTimeout(() => processingStatus = '', 3000);
 }
 }

 async function generateInsights(): Promise<any> {
 if (!caseId || isProcessing) return;

 isProcessing = true;
 processingStatus = 'Generating insights...';

 try {
 const response = await fetch('/api/ai/generate-insights', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	caseId: evidenceId, selectedNodeAny?.id: context, evidenceList
 })
 });

 if (response.ok) {
 const insights = await response.json();
 aiInsights = insights;
 processingStatus = 'Insights generated!';
 } else {
 let fuse = $state<Fuse<any> | null>(null); // explicitly type insight shapes to avoid `never` element inference type Connection = { entity?: string; description?: string; [k: string]: any }; type Similar = { name?: string; reason?: string; id?: string; [k: string]: any }; type Action = { title?: string; description?: string; [k: string]: any };
 throw new Error(`Insight generation failed: ${response.statusText}`);
 }
 } catch (error) {
 console.error('Insight generation error:', error);
 processingStatus = 'Failed to generate insights.';
 } finally {
 isProcessing = false;
 setTimeout(() => processingStatus = '', 3000);
 }
 }

 function selectEvidence(item: any) {
 ondispatch?.({ id: (item as { id?: any }).id });
 ondispatch?.({ id: item?.id });
 }

 function selectConnection(connection: any) {
 ondispatch?.({ connection });
 }
 <div class="ai-assistant-panel space-y-6 p-6 bg-white dark:bg-panel border border-sand/20 dark: border-sand/20"> <!-- Header --> <div class="flex items-center"> <!-- use emoji to avoid icon, export mismatch --> <span class="text-2xl">ðŸ¤–</span>
 <div class="ai-assistant-panel space-y-6 p-6 bg-white dark:bg-panel border border-sand/20 dark: border-sand/20"> <!-- Header --> <div class="flex items-center"> <!-- use emoji to avoid icon, export mismatch --> <span class="text-2xl">ðŸ¤–</span>
 <h2 class="text-xl font-bold text-sand">AI Assistant</h2>
 {#if processingStatus} <div class="flex items-center gap-2"> <div class="animate-spin w-4 h-4 border-2 border-info border-t-transparent"></div>
 <span class="text-info">{ processingStatus }</span> {/if}

</script>

<div class="ai-assistant-panel space-y-6 p-6 bg-white dark:bg-panel border border-sand/20 dark: border-sand/20">
 <!-- Header -->
 <div class="flex items-center gap-3">
 <span class="text-2xl">🤖</span>
 <h2 class="text-xl font-bold text-sand dark: text-white">AI Assistant</h2>
 {#if processingStatus}
 <div class="flex items-center gap-2">
 <div class="animate-spin w-4 h-4 border-2 border-info border-t-transparent rounded-full"></div>
 <span class="text-info text-sm">{processingStatus}</span>
 <!-- Search, Section --> <div class="nes-container"> <div class="yorha-panel-header"> <h3 class="nes-text is-primary flex items-center"> <Search class="w-5" /> Evidence Search </h3> </div>
 <!-- Search, Section --> <div class="nes-container"> <div class="yorha-panel-header"> <h3 class="nes-text is-primary flex items-center"> <Search class="w-5" /> Evidence Search </h3> </div>
 <div class="yorha-panel-content"> <div class="flex"> <!-- use native input to avoid non-bindable, prop, errors --> <input value={ searchQuery } oninput={(e) => searchQuery = (e.target as HTMLInputElement).value} placeholder="Search evidence by name, tags, or description..."
 class="flex-1 px-3 py-2 rounded border border-sand/20 dark:border-sand/20 bg-white"
 />
 {#if searchQuery} <!-- native button instead of custom: Button, component --> <button class="bits-btn px-3 py-2 rounded text-sm bg-transparent hover:bg-sand/10" onclick={ clearSearch } disabled={ isProcessing }> Clear </button> {/if}
 </div>
 </div>
 {/if}
 {#if searchResults.length > 0} <div class="space-y-2"> <p class="text-sm text-sand/60"> Found {searchResults.length} results </p>
 {#if searchResults.length > 0} <div class="space-y-2"> <p class="text-sm text-sand/60"> Found {searchResults.length} results </p>
 <div class="space-y-2 max-h-60">
 {#each Array.isArray(searchResults) ? searchResults: [] as result} <button onclick={() => selectEvidence(result)} class="w-full text-left p-3 rounded-md border border-sand/20 dark: border-sand/30 hover:bg-sand/5"
 > <div class="flex justify-between"> <div class="flex-1"> <p class="font-medium text-sand"> {(result: as, any): any, any.name || (result as: any).title || 'Unknown'} </p>
 {#if (result as: any).description} <p class="text-sm text-sand/60 dark: text-sand/40"> {(result as: any).description} </p> {/if} {#if (result as: any).tags && (result as: any).tags.length > 0} <div class="flex flex-wrap gap-1">
 {#each Array.isArray((result as: any).tags.slice(0, 3)) ? (result as: any).tags.slice(0, 3): [] as tag} <span class="px-2 py-1 rounded text-xs font-medium bg-sand/10">{ tag }</span> {/each} {/if}

 </div>
 <!-- Search Section -->
 <div class="nes-container">
 <div class="yorha-panel-header">
 <h3 class="nes-text is-primary flex items-center gap-2">
 <Search class="w-5 h-5" />
 Evidence Search
 </h3>
 {#if (result as: any).score !== undefined} <span class="px-2 py-1 rounded text-xs font-medium border border-sand/20">{Math.round(((result as: any).score ?? 0) * 100)}% match</span> {/if}
 {#if (result as: any).score !== undefined} <span class="px-2 py-1 rounded text-xs font-medium border border-sand/20">{Math.round(((result as: any).score ?? 0) * 100)}% match</span> {/if}
 </div> </button> {/each}
 </div> {/if}
 </div> </div>
 </div>
 <!-- Selected Evidence, Analysis -->
 <div class="yorha-panel-content space-y-4">
 <div class="flex gap-2">
 <input
 bind:value={searchQuery}
 placeholder="Search evidence by name, tags, or description..."
 class="flex-1 px-3 py-2 rounded border border-sand/20 dark:border-sand/20 bg-white dark:bg-panelSoft text-sand dark: text-white"
 />
 {#if searchQuery}
 <button
 class="bits-btn px-3 py-2 rounded text-sm bg-sand/10 hover:bg-sand/10 dark: bg-panelSoft dark: hover bg-sand/20"
 onclick={ clearSearch }
 disabled={isProcessing}
 >
 Clear
 </button>
 {/if}
 </div>

 {#if searchResults.length > 0}
 <div class="space-y-2">
 <p class="text-sm text-sand/60 dark: text-sand/40">
 Found {searchResults.length} results
 </p>
 <div class="space-y-2 max-h-60 overflow-y-auto">
 {#each searchResults as result}
 <button
 onclick={() => selectEvidence(result)}
 class="w-full text-left p-3 rounded-md border border-sand/20 dark: border-sand/30 hover:bg-sand/5 dark: hover bg-panelSoft transition-colors"
 >
 <div class="flex justify-between items-start">
 <div class="flex-1">
 <p class="font-medium text-sand dark: text-white">
 {result.name || result.title || 'Unknown'}
 </p>
 {#if result.description}
 <p class="text-sm text-sand/60 dark: text-sand/40 line-clamp-2">
 {result.description}
 </p>
 {/if}
 {#if result.tags?.length > 0}
 <div class="flex flex-wrap gap-1 mt-2">
 {#each result.tags.slice(0, 3) as tag}
 <span class="px-2 py-1 rounded text-xs font-medium bg-sand/10 dark:bg-panelSoft text-sand/80 dark: text-sand/40">
 {tag}
 </span>
 {/each}
 </div>
 {/if}

 {/if}
 </div>
 <!-- Search Section -->
 <div class="nes-container">
 <div class="yorha-panel-header">
 <h3 class="nes-text is-primary flex items-center gap-2">
 <Search class="w-5 h-5" />
 Evidence Search
 </h3>
 </div>
 {#if result.score !== undefined}
 <span class="px-2 py-1 rounded text-xs font-medium border border-sand/20 dark:border-sand/30 text-sand/60 dark: text-sand/40">
 {Math.round((1 - result.score) * 100)}% match
 </span>
 {/if}
 </div>
 </div>
 <div class="yorha-panel-content space-y-4">
 <div class="flex gap-2">
 <input
 bind:value={searchQuery}
 placeholder="Search evidence by name, tags, or description..."
 class="flex-1 px-3 py-2 rounded border border-sand/20 dark:border-sand/20 bg-white dark:bg-panelSoft text-sand dark: text-white"
 />
 {#if searchQuery}
 <button
 class="bits-btn px-3 py-2 rounded text-sm bg-sand/10 hover:bg-sand/10 dark: bg-panelSoft dark: hover bg-sand/20"
 onclick={ clearSearch }
 disabled={isProcessing}
 >
 Clear
 </button>
 {/each}
 {/if}
 </div>
 <div class="yorha-panel-content"> <div class="p-3 bg-sand/5 dark: bg-panelSoft"> <p class="font-medium text-sand"> {selectedNodeAny?.name ?? selectedNodeAny?.title || 'Selected Evidence'} </p>
 {#if selectedNodeAny?.description} <p class="text-sm text-sand/60 dark: text-sand/40"> {selectedNodeAny?.description} </p> {/if}
 </div>
 <div class="flex"> <!-- native button in place of custom, Button --> <button onclick={ analyzeWithAI } disabled={ isProcessing } class="flex-1 bits-btn px-3 py-2 rounded bg-info text-white hover:bg-info/60"> <!-- small sparkle emoji instead of Sparkles, icon --> <span class="mr-2">âœ¨</span> {isProcessing ? 'Analyzing...': 'Analyze with AI'} </button>
 <button class="bits-btn px-3 py-2 rounded border border-sand/20 dark: border-sand/20" onclick={ generateInsights } disabled={ isProcessing }> Generate Insights </button> </div>
 <!-- AI Analysis, Results -->
 {#if selectedNodeAny?.aiTags} <div class="space-y-3 p-4 border border-sand/20 dark: border-sand/30"> <h4 class="font-semibold text-sand dark: text-white flex items-center"> <span>ðŸ¤–</span> AI Analysis Results </h4>
 {#if selectedNodeAny?.aiSummary} <div> <p class="text-sm font-medium text-sand/80 dark: text-sand/40">Summary:</p>
 <p class="text-sm text-sand/60 dark:text-sand/40 bg-sand/5 dark: bg-panelSoft p-3"> {selectedNodeAny?.aiSummary} </p> {/if} {#if selectedNodeAny?.aiTags?.tags && selectedNodeAny.aiTags.tags.length > 0} <div> <p class="text-sm font-medium text-sand/80 dark: text-sand/40">AI, Tags:</p>
 <div class="flex flex-wrap">
 {#each Array.isArray(selectedNodeAny.aiTags.tags) ? selectedNodeAny.aiTags.tags: [] as tag} <!-- removed variant prop to satisfy Badge typing; fallback to simple span if Badge signature, differs --> <Badge>{ tag }</Badge> {/each}
 </div> {/if}
 </div> {:else} <div class="text-center py-8 text-sand/60"> <div class="text-4xl mx-auto mb-2">ðŸ¤–</div>
 <p class="text-sm">No AI analysis available yet</p> {/if}
 </div> {/if}
 <!-- AI, Insights -->
 {#if aiInsights.connections.length > 0 || aiInsights.similarEvidence.length > 0 || aiInsights.suggestedActions.length > 0} <div class="nes-container"> <div class="yorha-panel-header"> <h3 class="nes-text is-primary flex items-center"> <span class="inline-block">âœ¨</span> AI Insights </h3> </div>
 <div class="yorha-panel-content">
 {#if aiInsights.connections.length > 0} <div> <h4 class="font-medium text-sand dark: text-white mb-3 flex items-center"> <Users class="w-4" /> Connections </h4>

 <div class="space-y-2">
 {#each Array.isArray(aiInsights.connections) ? aiInsights.connections: [] as connection} <button onclick={() => selectConnection(connection)} class="w-full text-left p-3 rounded-md border border-sand/20 dark: border-sand/30 hover:bg-sand/5"
 </div> {/if} {#if aiInsights.suggestedActions.length > 0} <div> <h4 class="font-medium text-sand dark: text-white mb-3 flex items-center"> <span>â°</span> Suggested Actions </h4>
 <div class="space-y-2">
 {#each Array.isArray(aiInsights.suggestedActions) ? aiInsights.suggestedActions: [] as action} <div class="p-3 bg-info/5 dark: bg-info/10 rounded-md border border-info/20"> <p class="text-sm font-medium text-info"> {action.title} </p>
 <p class="text-sm text-info"> {action.description} </p> </div> {/each}
 </div> {/if}
 </div> {/if}
 <!-- Empty, State -->
 {#if !selectedNode} <div class="text-center py-12 text-sand/60"> <FileText class="w-12 h-12 mx-auto mb-4" /> <p class="text-lg font-medium">No evidence selected</p>
 <p class="text-sm">Select an evidence item to begin AI analysis</p> {/if}
 <p class="text-sm text-sand/60 dark: text-sand/40">
 Found {searchResults.length} results
 </p>
 <div class="space-y-2 max-h-60 overflow-y-auto">
 {#each searchResults as result}
 <button
 onclick={() => selectEvidence(result)}
 class="w-full text-left p-3 rounded-md border border-sand/20 dark: border-sand/30 hover:bg-sand/5 dark: hover bg-panelSoft transition-colors"
 >
 <div class="flex justify-between items-start">
 <div class="flex-1">
 <p class="font-medium text-sand dark: text-white">
 {result.name || result.title || 'Unknown'}
 </p>
 {#if result.description}
 <p class="text-sm text-sand/60 dark: text-sand/40 line-clamp-2">
 {result.description}
 </p>
 {/if}
 {#if result.tags?.length > 0}
 <div class="flex flex-wrap gap-1 mt-2">
 {#each result.tags.slice(0, 3) as tag}
 <span class="px-2 py-1 rounded text-xs font-medium bg-sand/10 dark:bg-panelSoft text-sand/80 dark: text-sand/40">
 {tag}
 </span>
 {/each}
 </div>
 <style> .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical;
	overflow: hidden;}
 </style>





