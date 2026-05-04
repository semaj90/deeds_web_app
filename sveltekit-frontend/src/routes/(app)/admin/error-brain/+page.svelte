<script lang="ts">
 import { Badge } from '$lib/components/ui/badge';
 import Card from '$lib/components/ui/card/Card.svelte';
import CardContent from '$lib/components/ui/card/CardContent.svelte';
import CardDescription from '$lib/components/ui/card/CardDescription.svelte';
import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
import Button from '$lib/components/ui/Button.svelte';
import Phase72ErrorBrain from '$lib/components/Phase72ErrorBrain.svelte';
import ErrorStreamMonitor from '$lib/components/ErrorStreamMonitor.svelte';
import ErrorModal from '$lib/components/phase78/ErrorModal.svelte';
import PhoenixEventMonitor from '$lib/components/yorha/PhoenixEventMonitor.svelte';
import AIDropdown from '$lib/components/ui/AIDropdown.svelte';
import SuggestionsList from '../../../(admin)/error-brain/components/SuggestionsList.svelte';
// Migrated to $effect

 let showErrorStream = $state(false);
 let showErrorModal = $state(false);
 let showPhoenixMonitor = $state(false);

 let status = $state<any>(null);
 let runs = $state<any[]>([]);
 let loading = $state(true);
 let error = $state<string | null>(null);
 let showErrorBrain = $state(false);
 let selectedRoute = $state<string | null>(null);

 // Diagnosis state
 let diagnosisQuery = $state('');
 let diagnosisFilePath = $state('');
 let diagnosisRunning = $state(false);
 let diagnosisResult = $state<any>(null);

 async function runDiagnosis() {
	if (!diagnosisQuery.trim()) return;
	diagnosisRunning = true;
	diagnosisResult = null;
	try {
		const res = await fetch('/api/error-brain/diagnose', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query: diagnosisQuery,
				filePath: diagnosisFilePath || undefined,
				routePath: selectedRoute || undefined,
				limit: 10,
			}),
		});
		diagnosisResult = await res.json();
	} catch (err) {
		diagnosisResult = { diagnosis: 'Request failed: ' + (err as Error).message, impactedFiles: [], fixPlan: [], riskLevel: 'high' };
	} finally {
		diagnosisRunning = false;
	}
 }

 // Auto-patch state
 let autoPatchTarget = $state('');
 let autoPatchError = $state('');
 let autoPatchRunning = $state(false);
 let autoPatchResult = $state<any>(null);

 // Phase78 suggestions state
 let suggestions = $state<any[]>([]);
 let suggestionsLoading = $state(false);
 let suggestionsRouteFilter = $state('');
 let showSuggestions = $state(false);

 async function fetchSuggestions() {
   suggestionsLoading = true;
   try {
     const params = new URLSearchParams({ limit: '50' });
     if (suggestionsRouteFilter) params.set('routePath', suggestionsRouteFilter);
     const res = await fetch(`/api/error-brain/suggestions?${params}`);
     if (res.ok) {
       const data = await res.json();
       suggestions = data.suggestions ?? [];
     }
   } catch (err) {
     console.error('Failed to fetch suggestions:', err);
   } finally {
     suggestionsLoading = false;
   }
 }

 // KAG (Knowledge-Augmented Generation) state
 let kagErrorId = $state('');
 let kagAction = $state<'root-cause' | 'similar' | 'traverse'>('root-cause');
 let kagRunning = $state(false);
 let kagResult = $state<any>(null);
 let kagAvailable = $state<boolean | null>(null);

 $effect(() => {
   fetch('/api/phase109/kag').then(r => r.json()).then(d => { kagAvailable = d.ready ?? false; }).catch(() => { kagAvailable = false; });
 });

 async function runKag() {
   if (!kagErrorId.trim()) return;
   kagRunning = true;
   kagResult = null;
   try {
     const res = await fetch('/api/phase109/kag', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ errorId: kagErrorId, action: kagAction }),
     });
     kagResult = await res.json();
   } catch (err) {
     kagResult = { error: (err as Error).message };
   } finally {
     kagRunning = false;
   }
 }

 async function runAutoPatch() {
	if (!autoPatchTarget || !autoPatchError) return;
	autoPatchRunning = true;
	autoPatchResult = null;
	try {
		const res = await fetch('/api/error-brain/auto-patch', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				filePath: autoPatchTarget,
				errorMessage: autoPatchError,
				maxAttempts: 2,
			}),
		});
		autoPatchResult = await res.json();
	} catch (err) {
		autoPatchResult = { success: false, message: (err as Error).message };
	} finally {
		autoPatchRunning = false;
	}
 }

 async function fetchStatus() {
 try {
 const res = await fetch('/api/internal/error-brain/status');
 if (res.ok) {
 status = await res.json();
 } else {
 status = { enabled: false, totalErrors: 0, fixedErrors: 0, pendingErrors: 0 };
 }
 } catch {
 status = { enabled: false, totalErrors: 0, fixedErrors: 0, pendingErrors: 0 };
 }
 }

 async function fetchRuns() {
 try {
 const res = await fetch('/api/internal/error-brain/runs');
 if (res.ok) {
 const data = await res.json();
 runs = data.runs ?? [];
 }
 } catch (err) {
 console.error('Failed to fetch runs:', err);
 }
 }

 async function createRun() {
 try {
 const res = await fetch('/api/internal/error-brain/runs', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({})
 });
 if (res.ok) {
 await fetchRuns();
 }
 } catch (err) {
 console.error('Failed to create run:', err);
 }
 }

 $effect(() => {
  (async () => {

 await fetchStatus();
 await fetchRuns();
 loading = false;

  })();
});
</script>

<div class="container mx-auto p-6 space-y-6">
 <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Error-Brain System</h1>
		<p class="text-gray-500 text-sm mt-1">Automated TypeScript error analysis and correction system</p>
	</div>
	<div class="flex flex-wrap gap-2 items-center">
		<AIDropdown
			onReportGenerate={() => { autoPatchTarget = selectedRoute ?? ''; showErrorBrain = true; }}
			onSummarize={() => { showErrorBrain = true; }}
			onAnalyze={() => { showPhoenixMonitor = true; }}
			hasContent={!!selectedRoute || runs.length > 0}
		/>
		<Button onclick={createRun}>Create New Run</Button>
		<Button onclick={() => (showErrorBrain = true)}>Phase 72 Error Brain</Button>
		<Button onclick={() => (showErrorStream = !showErrorStream)}>{showErrorStream ? 'Hide Stream' : 'Error Stream'}</Button>
		<Button onclick={() => (showPhoenixMonitor = !showPhoenixMonitor)}>{showPhoenixMonitor ? 'Hide Phoenix' : 'Phoenix Events'}</Button>
		<Button onclick={() => { if (selectedRoute) showErrorModal = true; }}>Error Modal</Button>
	</div>
 </div>

 {#if showErrorBrain}
	<Phase72ErrorBrain routePath={selectedRoute} onClose={() => (showErrorBrain = false)} />
 {/if}

 <ErrorModal bind:open={showErrorModal} routePath={selectedRoute ?? ''} onClose={() => (showErrorModal = false)} />

 {#if showErrorStream}
	<Card class="mb-4">
		<CardHeader>
			<CardTitle>Real-Time Error Stream</CardTitle>
		</CardHeader>
		<CardContent>
			<ErrorStreamMonitor />
		</CardContent>
	</Card>
 {/if}

 {#if showPhoenixMonitor}
	<Card class="mb-4">
		<CardHeader>
			<CardTitle>Phoenix AI Event Monitor</CardTitle>
			<CardDescription>SSE-based real-time event stream from /agentic/events</CardDescription>
		</CardHeader>
		<CardContent>
			<PhoenixEventMonitor show={showPhoenixMonitor} />
		</CardContent>
	</Card>
 {/if}

 {#if error}
 <Card class="border border-red-400">
 <CardHeader>
 <CardTitle class="text-red-600">System Error</CardTitle>
 </CardHeader>
 <CardContent>
 <p class="text-sm text-gray-500">{error}</p>
 </CardContent>
 </Card>
 {/if}

 {#if loading}
 <Card>
 <CardContent class="flex items-center justify-center py-12">
 <div class="text-gray-400">Loading...</div>
 </CardContent>
 </Card>
 {:else if status}
 <div class="grid gap-4 md:grid-cols-4">
 <Card>
 <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
 <CardTitle class="text-sm font-medium">System Status</CardTitle>
 <Badge variant={status.status === 'operational' ? 'default' : 'secondary'}>
 {status.status ?? 'unknown'}
 </Badge>
 </CardHeader>
 <CardContent>
 <div class="text-2xl font-bold">{status.totalErrors ?? 0}</div>
 <p class="text-xs text-muted-foreground">Total errors tracked</p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
 <CardTitle class="text-sm font-medium">Fixed</CardTitle>
 </CardHeader>
 <CardContent>
 <div class="text-2xl font-bold">{status.fixedCount ?? 0}</div>
 <p class="text-xs text-muted-foreground">{status.fixRate ?? 0}% fix rate</p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
 <CardTitle class="text-sm font-medium">Recent (24h)</CardTitle>
 </CardHeader>
 <CardContent>
 <div class="text-2xl font-bold">{status.recentErrors ?? 0}</div>
 <p class="text-xs text-muted-foreground">Errors in last 24 hours</p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
 <CardTitle class="text-sm font-medium">Affected Files</CardTitle>
 </CardHeader>
 <CardContent>
 <div class="text-2xl font-bold">{status.affectedFiles ?? 0}</div>
 <p class="text-xs text-muted-foreground">Unique files with errors</p>
 </CardContent>
 </Card>
 </div>

 <!-- Route Filter for Error Brain -->
 <Card>
	<CardContent>
		<div class="flex gap-3 items-center pt-4">
			<label for="route-filter" class="text-sm font-semibold whitespace-nowrap">Route Filter:</label>
			<input id="route-filter" type="text" placeholder="e.g. /dashboard, /cases/[id]" bind:value={selectedRoute} class="flex-1 px-2 py-1.5 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
			<Button onclick={() => { if (selectedRoute) showErrorBrain = true; }}>Inspect Route</Button>
		</div>
	</CardContent>
 </Card>

 <!-- AST Diagnosis Section -->
 <Card>
	<CardHeader>
		<CardTitle>AST-Powered Diagnosis</CardTitle>
		<CardDescription>Ask about errors — retrieves AST subgraph, searches similar failures, reranks, and generates a fix plan</CardDescription>
	</CardHeader>
	<CardContent>
		<div class="flex flex-col gap-3">
			<div class="flex gap-3 items-start">
				<label for="diag-query" class="text-sm font-semibold min-w-20 pt-2">Query:</label>
				<textarea id="diag-query" placeholder="Why is this route failing? / Paste an error message..." bind:value={diagnosisQuery} rows="2" class="flex-1 px-2 py-1.5 border border-gray-300 rounded font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-400"></textarea>
			</div>
			<div class="flex gap-3 items-center">
				<label for="diag-file" class="text-sm font-semibold min-w-20">File (opt):</label>
				<input id="diag-file" type="text" placeholder="src/routes/api/evidence/..." bind:value={diagnosisFilePath} class="flex-1 px-2 py-1.5 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
			</div>
			<div class="flex gap-3 items-center">
				<Button onclick={runDiagnosis} disabled={diagnosisRunning || !diagnosisQuery.trim()}>
					{diagnosisRunning ? 'Diagnosing...' : 'Diagnose'}
				</Button>
				{#if diagnosisRunning}
					<span class="text-sm text-gray-400">AST → Search → Rerank → LLM...</span>
				{/if}
				{#if diagnosisResult?.timing}
					<span class="text-xs text-gray-400 font-mono">{diagnosisResult.timing.totalMs}ms (AST:{diagnosisResult.timing.astMs}ms Search:{diagnosisResult.timing.searchMs}ms LLM:{diagnosisResult.timing.llmMs}ms)</span>
				{/if}
			</div>
			{#if diagnosisResult}
				<div class="diagnosis-result">
					<div class="flex items-center gap-2 mb-2">
						<strong class="text-base">Diagnosis</strong>
						{#if diagnosisResult.riskLevel}
							<Badge variant={diagnosisResult.riskLevel === 'low' ? 'default' : diagnosisResult.riskLevel === 'high' ? 'destructive' : 'secondary'}>
								{diagnosisResult.riskLevel} risk
							</Badge>
						{/if}
						{#if diagnosisResult.cached}
							<Badge variant="outline">cached</Badge>
						{/if}
					</div>
					<p class="text-sm mb-3">{diagnosisResult.diagnosis}</p>

					{#if diagnosisResult.impactedFiles?.length > 0}
						<div class="mb-3">
							<strong class="text-sm">Impacted Files:</strong>
							<div class="mt-1 space-y-1">
								{#each diagnosisResult.impactedFiles as file}
									<div class="text-xs font-mono flex items-center gap-2 p-1 rounded bg-gray-50 dark:bg-gray-900">
										<span class="font-semibold">{file.path}</span>
										<span class="text-gray-400">— {file.reason}</span>
										<span class="text-gray-300">({(file.confidence * 100).toFixed(0)}%)</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if diagnosisResult.fixPlan?.length > 0}
						<div class="mb-3">
							<strong class="text-sm">Fix Plan:</strong>
							<div class="mt-1 space-y-1">
								{#each diagnosisResult.fixPlan as step}
									<div class="text-xs font-mono p-1.5 rounded bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
										<span class="font-bold">Step {step.step}:</span> {step.action}
										{#if step.file}
											<span class="text-gray-400 ml-1">({step.file})</span>
										{/if}
										{#if step.code}
											<pre class="mt-1 text-xs bg-gray-100 dark:bg-gray-800 rounded p-1 overflow-x-auto">{step.code}</pre>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if diagnosisResult.similarPastErrors?.length > 0}
						<div class="mb-3">
							<strong class="text-sm">Similar Past Errors:</strong>
							<div class="mt-1 space-y-1">
								{#each diagnosisResult.similarPastErrors as err}
									<div class="text-xs font-mono p-1 rounded bg-yellow-50 dark:bg-yellow-950">
										<div>{err.message}</div>
										{#if err.resolution}
											<div class="text-green-700 dark:text-green-400 mt-0.5">→ {err.resolution}</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					{#if diagnosisResult.rankedFiles?.length > 0}
						<details class="text-xs">
							<summary class="cursor-pointer text-gray-500 hover:text-gray-700">Reranking Details ({diagnosisResult.rankedFiles.length} candidates)</summary>
							<div class="mt-1 space-y-1 font-mono">
								{#each diagnosisResult.rankedFiles as rf}
									<div class="p-1 rounded bg-gray-50 dark:bg-gray-900">
										<span class="font-semibold">{rf.filePath}</span>
										<span class="ml-2 text-gray-400">score:{rf.finalScore.toFixed(3)}</span>
										<span class="ml-1 text-gray-300">sem:{rf.signals.semantic.toFixed(2)} graph:{rf.signals.graphProximity.toFixed(2)} err:{rf.signals.errorFrequency.toFixed(2)}</span>
									</div>
								{/each}
							</div>
						</details>
					{/if}

					{#if diagnosisResult.sources}
						<div class="text-xs text-gray-400 mt-2 font-mono">
							Sources: AST({diagnosisResult.sources.astSubgraph?.nodeCount ?? 0} nodes, {diagnosisResult.sources.astSubgraph?.edgeCount ?? 0} edges) Semantic({diagnosisResult.sources.semanticMatches ?? 0}) Errors({diagnosisResult.sources.errorHistoryMatches ?? 0}) Graph({diagnosisResult.sources.graphNeighborMatches ?? 0})
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</CardContent>
 </Card>

 <!-- Auto-Patch Section -->
 <Card>
	<CardHeader>
		<CardTitle>Auto-Patch</CardTitle>
		<CardDescription>Generate, apply, and verify fixes automatically (with rollback on failure)</CardDescription>
	</CardHeader>
	<CardContent>
		<div class="flex flex-col gap-3">
			<div class="flex gap-3 items-center">
				<label for="patch-file" class="text-sm font-semibold min-w-20">File Path:</label>
				<input id="patch-file" type="text" placeholder="src/routes/..." bind:value={autoPatchTarget} class="flex-1 px-2 py-1.5 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
			</div>
			<div class="flex gap-3 items-start">
				<label for="patch-error" class="text-sm font-semibold min-w-20 pt-2">Error:</label>
				<textarea id="patch-error" placeholder="Paste the error message..." bind:value={autoPatchError} rows="3" class="flex-1 px-2 py-1.5 border border-gray-300 rounded font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-400"></textarea>
			</div>
			<div class="flex gap-3 items-center">
				<Button onclick={runAutoPatch} disabled={autoPatchRunning || !autoPatchTarget || !autoPatchError}>
					{autoPatchRunning ? 'Patching...' : 'Auto-Fix'}
				</Button>
				{#if autoPatchRunning}
					<span class="text-sm text-gray-400">Generating → Applying → Verifying...</span>
				{/if}
			</div>
			{#if autoPatchResult}
				<div class="patch-result" class:patch-success={autoPatchResult.success} class:patch-fail={!autoPatchResult.success}>
					<strong>{autoPatchResult.success ? '✓ Fix Verified' : '✗ Fix Failed'}</strong>
					{#if autoPatchResult.message}
						<div class="patch-message">{autoPatchResult.message}</div>
					{/if}
					{#if autoPatchResult.attempts}
						<div class="patch-attempts">
							{#each autoPatchResult.attempts as attempt}
								<div>Attempt {attempt.attempt}: gen={attempt.fixGenerated ? 'ok' : 'fail'} apply={attempt.fixApplied ? 'ok' : 'fail'} verify={attempt.verified ? 'ok' : 'fail'}{attempt.error ? ` (${attempt.error})` : ''}</div>
							{/each}
						</div>
					{/if}
					{#if autoPatchResult.rollback}
						<div class="patch-rollback">Original file restored (rollback)</div>
					{/if}
				</div>
			{/if}
		</div>
	</CardContent>
 </Card>

 <!-- KAG Analysis (Phase 109) -->
 <Card>
	<CardHeader>
		<CardTitle>KAG Analysis <span class="text-xs font-normal text-gray-400 ml-2">(Knowledge-Augmented Generation)</span>
			{#if kagAvailable === true}
				<span class="ml-2 inline-block px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-700">Neo4j ✓</span>
			{:else if kagAvailable === false}
				<span class="ml-2 inline-block px-1.5 py-0.5 text-xs rounded bg-yellow-100 text-yellow-700">Neo4j offline (degraded)</span>
			{/if}
		</CardTitle>
		<CardDescription>Traverse the error knowledge graph to identify root causes, related fixes, and cascading paths</CardDescription>
	</CardHeader>
	<CardContent>
		<div class="flex flex-col gap-3">
			<div class="flex gap-3 items-center">
				<label for="kag-error-id" class="text-sm font-semibold min-w-20">Error ID:</label>
				<input id="kag-error-id" type="text" placeholder="e.g. error-uuid or synthetic-error-id" bind:value={kagErrorId} class="flex-1 px-2 py-1.5 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
			</div>
			<div class="flex gap-3 items-center">
				<label class="text-sm font-semibold min-w-20">Action:</label>
				<div class="flex gap-2">
					{#each (['root-cause', 'similar', 'traverse'] as const) as act}
						<button
							onclick={() => { kagAction = act; }}
							class="px-2 py-1 text-xs rounded border font-mono transition-colors {kagAction === act ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:border-blue-400'}"
						>{act}</button>
					{/each}
				</div>
				<Button onclick={runKag} disabled={kagRunning || !kagErrorId.trim()}>
					{kagRunning ? 'Traversing...' : 'Run KAG'}
				</Button>
			</div>
			{#if kagResult}
				<div class="kag-result">
					{#if kagResult.degraded}
						<div class="text-yellow-700 text-sm mb-2">⚠ {kagResult.message}</div>
					{:else if kagResult.error}
						<div class="text-red-600 text-sm">{kagResult.error}: {kagResult.message ?? ''}</div>
					{:else}
						<div class="text-sm font-semibold mb-2">
							{kagAction === 'root-cause' ? '🎯 Root Cause Analysis' : kagAction === 'similar' ? '🔎 Similar Errors' : '🗺 Graph Traversal'}
						</div>
						{#if kagResult.result?.rootCause}
							<div class="mb-2 p-2 rounded bg-red-50 border border-red-200">
								<strong class="text-xs text-red-700">Root Cause:</strong>
								<p class="text-sm mt-1">{kagResult.result.rootCause}</p>
							</div>
						{/if}
						{#if kagResult.result?.cascadingErrors?.length > 0}
							<div class="mb-2">
								<strong class="text-xs text-gray-600">Cascading Errors ({kagResult.result.cascadingErrors.length}):</strong>
								<div class="mt-1 space-y-0.5">
									{#each kagResult.result.cascadingErrors as ce}
										<div class="text-xs font-mono text-gray-500 pl-2 border-l-2 border-red-200">{ce}</div>
									{/each}
								</div>
							</div>
						{/if}
						{#if kagResult.result?.relatedFixes?.length > 0}
							<div class="mb-2">
								<strong class="text-xs text-gray-600">Related Fixes:</strong>
								<div class="mt-1 space-y-1">
									{#each kagResult.result.relatedFixes as fix}
										<div class="text-xs p-1.5 rounded bg-green-50 border border-green-200">
											<span class="font-semibold">{fix.fixId}</span>
											<span class="ml-2 text-gray-500">{fix.description}</span>
											<span class="ml-2 text-green-700 font-mono">{(fix.successRate * 100).toFixed(0)}% success</span>
										</div>
									{/each}
								</div>
							</div>
						{/if}
						{#if Array.isArray(kagResult.result) && kagResult.result.length > 0}
							<div class="space-y-1">
								{#each kagResult.result as item}
									<div class="text-xs p-1.5 rounded bg-gray-50 border border-gray-200 font-mono">
										{JSON.stringify(item).slice(0, 200)}
									</div>
								{/each}
							</div>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	</CardContent>
 </Card>

 <!-- Phase78 Fix Suggestions -->
 <Card>
	<CardHeader>
		<CardTitle class="flex items-center justify-between">
			<span>Phase78 Fix Suggestions</span>
			<button
				onclick={() => { showSuggestions = !showSuggestions; if (showSuggestions && suggestions.length === 0) fetchSuggestions(); }}
				class="text-sm font-normal text-blue-600 hover:underline"
			>{showSuggestions ? 'Hide' : 'Show'}</button>
		</CardTitle>
		<CardDescription>LLM-generated fix suggestions from phase78 error clustering pipeline</CardDescription>
	</CardHeader>
	{#if showSuggestions}
		<CardContent>
			<div class="flex gap-3 items-center mb-4">
				<input
					type="text"
					placeholder="Filter by route path..."
					bind:value={suggestionsRouteFilter}
					class="flex-1 px-2 py-1.5 border border-gray-300 rounded font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
				/>
				<Button onclick={fetchSuggestions} disabled={suggestionsLoading}>
					{suggestionsLoading ? 'Loading...' : 'Refresh'}
				</Button>
			</div>
			<SuggestionsList {suggestions} isLoading={suggestionsLoading} />
		</CardContent>
	{/if}
 </Card>

 <!-- Runs List -->
 <Card>
 <CardHeader>
 <CardTitle>Recent Runs</CardTitle>
 <CardDescription>History of error analysis runs</CardDescription>
 </CardHeader>
 <CardContent>
 {#if runs.length === 0}
 <div class="text-center py-8 text-gray-400">No runs yet. Create one to get started.</div>
 {:else}
 <div class="space-y-4">
 {#each runs as run}
 <div class="flex items-center justify-between p-4 border rounded-lg">
 <div class="space-y-1">
 <p class="text-sm font-medium font-mono">{run.file_path ?? run.filePath ?? 'Unknown'}</p>
 <div class="flex gap-2 text-xs text-gray-400">
 <span>Status: {run.status ?? 'pending'}</span>
 {#if run.error_code}
 <span>• Code: {run.error_code}</span>
 {/if}
 {#if run.message}
 <span>• {run.message.slice(0, 80)}</span>
 {/if}
 </div>
 </div>
 <Badge variant={run.status === 'fixed' ? 'default' : 'secondary'}>{run.status ?? 'pending'}</Badge>
 </div>
 {/each}
 </div>
 {/if}
 </CardContent>
 </Card>
 {/if}
</div>

<style>
  .patch-result {
    padding: 0.75rem;
    border-radius: 0.375rem;
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    line-height: 1.5;
    border: 1px solid;
  }
  .patch-success {
    background-color: #f0fdf4;
    border-color: #86efac;
    color: #166534;
  }
  .patch-fail {
    background-color: #fefce8;
    border-color: #fcd34d;
    color: #92400e;
  }
  .patch-message {
    margin-top: 0.25rem;
  }
  .patch-attempts {
    margin-top: 0.5rem;
    opacity: 0.85;
  }
  .patch-rollback {
    margin-top: 0.25rem;
    color: #b45309;
    font-weight: 600;
  }
  .diagnosis-result {
    padding: 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid var(--t-border, #e5e7eb);
    background: var(--t-surface, #fafafa);
  }
  .kag-result {
    padding: 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    font-size: 0.75rem;
  }
</style>

