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

 // Auto-patch state
 let autoPatchTarget = $state('');
 let autoPatchError = $state('');
 let autoPatchRunning = $state(false);
 let autoPatchResult = $state<any>(null);

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
 <div class="flex items-center justify-between">
 <div>
 <h1 class="text-3xl font-bold tracking-tight">Error-Brain System</h1>
 <p class="text-muted-foreground">
 Automated TypeScript error analysis and correction system
 </p>
 </div>
 <AIDropdown
		onReportGenerate={(type) => { autoPatchTarget = selectedRoute ?? ''; showErrorBrain = true; }}
		onSummarize={() => { showErrorBrain = true; }}
		onAnalyze={() => { showPhoenixMonitor = true; }}
		hasContent={!!selectedRoute || runs.length > 0}
	/>
	<Button class="bits-btn" onclick={createRun}>Create New Run</Button>
	<Button class="bits-btn" onclick={() => (showErrorBrain = true)}>Phase 72 Error Brain</Button>
	<Button class="bits-btn" onclick={() => (showErrorStream = !showErrorStream)}>{showErrorStream ? 'Hide Stream' : 'Error Stream'}</Button>
	<Button class="bits-btn" onclick={() => (showPhoenixMonitor = !showPhoenixMonitor)}>{showPhoenixMonitor ? 'Hide Phoenix' : 'Phoenix Events'}</Button>
	<Button class="bits-btn" onclick={() => { if (selectedRoute) showErrorModal = true; }}>Error Modal</Button>
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
 <Card class="border-destructive">
 <CardHeader>
 <CardTitle class="text-destructive">System Error</CardTitle>
 </CardHeader>
 <CardContent>
 <p class="text-sm text-muted-foreground">{error}</p>
 </CardContent>
 </Card>
 {/if}

 {#if loading}
 <Card>
 <CardContent class="flex items-center justify-center py-12">
 <div class="text-muted-foreground">Loading...</div>
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
		<div style="display: flex; gap: 0.75rem; align-items: center; padding-top: 1rem;">
			<label for="route-filter" style="font-size: 0.875rem; font-weight: 600;">Route Filter:</label>
			<input id="route-filter" type="text" placeholder="e.g. /dashboard, /cases/[id]" bind:value={selectedRoute} style="flex: 1; padding: 0.5rem; border: 1px solid #ccc; border-radius: 0.25rem; font-family: monospace;" />
			<Button class="bits-btn" onclick={() => { if (selectedRoute) showErrorBrain = true; }}>Inspect Route</Button>
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
		<div style="display: flex; flex-direction: column; gap: 0.75rem;">
			<div style="display: flex; gap: 0.75rem; align-items: center;">
				<label for="patch-file" style="font-size: 0.875rem; font-weight: 600; min-width: 80px;">File Path:</label>
				<input id="patch-file" type="text" placeholder="src/routes/..." bind:value={autoPatchTarget} style="flex: 1; padding: 0.5rem; border: 1px solid #ccc; border-radius: 0.25rem; font-family: monospace;" />
			</div>
			<div style="display: flex; gap: 0.75rem; align-items: flex-start;">
				<label for="patch-error" style="font-size: 0.875rem; font-weight: 600; min-width: 80px; padding-top: 0.5rem;">Error:</label>
				<textarea id="patch-error" placeholder="Paste the error message..." bind:value={autoPatchError} rows="3" style="flex: 1; padding: 0.5rem; border: 1px solid #ccc; border-radius: 0.25rem; font-family: monospace; resize: vertical;"></textarea>
			</div>
			<div style="display: flex; gap: 0.75rem; align-items: center;">
				<Button class="bits-btn" onclick={runAutoPatch} disabled={autoPatchRunning || !autoPatchTarget || !autoPatchError}>
					{autoPatchRunning ? 'Patching...' : 'Auto-Fix'}
				</Button>
				{#if autoPatchRunning}
					<span style="font-size: 0.875rem; color: #888;">Generating → Applying → Verifying...</span>
				{/if}
			</div>
			{#if autoPatchResult}
				<div style="padding: 0.75rem; border-radius: 0.25rem; font-family: monospace; font-size: 0.8rem; background: {autoPatchResult.success ? '#e8f5e9' : '#fff3cd'}; border: 1px solid {autoPatchResult.success ? '#a5d6a7' : '#ffc107'};">
					<strong>{autoPatchResult.success ? 'Fix Verified' : 'Fix Failed'}</strong>
					{#if autoPatchResult.message}
						<div>{autoPatchResult.message}</div>
					{/if}
					{#if autoPatchResult.attempts}
						<div style="margin-top: 0.5rem;">
							{#each autoPatchResult.attempts as attempt}
								<div>Attempt {attempt.attempt}: gen={attempt.fixGenerated ? 'ok' : 'fail'} apply={attempt.fixApplied ? 'ok' : 'fail'} verify={attempt.verified ? 'ok' : 'fail'}{attempt.error ? ` (${attempt.error})` : ''}</div>
							{/each}
						</div>
					{/if}
					{#if autoPatchResult.rollback}
						<div style="color: #856404; margin-top: 0.25rem;">Original file restored (rollback)</div>
					{/if}
				</div>
			{/if}
		</div>
	</CardContent>
 </Card>

 <!-- Runs List -->
 <Card>
 <CardHeader>
 <CardTitle>Recent Runs</CardTitle>
 <CardDescription>History of error analysis runs</CardDescription>
 </CardHeader>
 <CardContent>
 {#if runs.length === 0}
 <div class="text-center py-8 text-muted-foreground">No runs yet. Create one to get started.</div>
 {:else}
 <div class="space-y-4">
 {#each runs as run}
 <div class="flex items-center justify-between p-4 border rounded-lg">
 <div class="space-y-1">
 <p class="text-sm font-medium font-mono">{run.file_path ?? run.filePath ?? 'Unknown'}</p>
 <div class="flex gap-2 text-xs text-muted-foreground">
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


