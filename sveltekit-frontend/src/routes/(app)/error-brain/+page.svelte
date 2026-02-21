<script lang="ts">
 import { Badge } from '$lib/components/ui/badge';
 import Card from '$lib/components/ui/card/Card.svelte';
import CardContent from '$lib/components/ui/card/CardContent.svelte';
import CardDescription from '$lib/components/ui/card/CardDescription.svelte';
import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
import Button from '$lib/components/ui/Button.svelte';
import Phase72ErrorBrain from '$lib/components/Phase72ErrorBrain.svelte';
// Migrated to $effect

 let status = $state<any>(null);
 let runs = $state<any[]>([]);
 let loading = $state(true);
 let error = $state<string | null>(null);
 let showErrorBrain = $state(false);
 let selectedRoute = $state<string | null>(null);

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
 runs = await res.json();
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
 <Button class="bits-btn" onclick={createRun}>Create New Run</Button>
	<Button class="bits-btn" onclick={() => (showErrorBrain = true)}>Phase 72 Error Brain</Button>
 </div>

 {#if showErrorBrain}
	<Phase72ErrorBrain routePath={selectedRoute} onClose={() => (showErrorBrain = false)} />
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
 <div class="grid gap-4 md:grid-cols-3">
 <Card>
 <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
 <CardTitle class="text-sm font-medium">System Status</CardTitle>
 <Badge variant={status.enabled ? 'default' : 'secondary'}>
 {status.enabled ? 'Enabled' : 'Disabled'}
 </Badge>
 </CardHeader>
 <CardContent>
 <div class="text-2xl font-bold">{status.enabled ? 'Active' : 'Inactive'}</div>
 <p class="text-xs text-muted-foreground">
 {status.enabled ? 'System is operational' : 'System is disabled'}
 </p>
 </CardContent>
 </Card>

 {#if status.config}
 <Card>
 <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
 <CardTitle class="text-sm font-medium">Transport</CardTitle>
 </CardHeader>
 <CardContent>
 <div class="text-2xl font-bold capitalize">{status.config.transport}</div>
 <p class="text-xs text-muted-foreground">Event delivery method</p>
 </CardContent>
 </Card>

 <Card>
 <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
 <CardTitle class="text-sm font-medium">Apply Mode</CardTitle>
 </CardHeader>
 <CardContent>
 <div class="text-2xl font-bold capitalize">{status.config.applyMode}</div>
 <p class="text-xs text-muted-foreground">Patch application mode</p>
 </CardContent>
 </Card>
 {/if}
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
 <p class="text-sm font-medium">Run {run.runId}</p>
 <div class="flex gap-2 text-xs text-muted-foreground">
 <span>State: {run.state}</span>
 {#if run.filesScanned}
 <span>• Files: {run.filesScanned}</span>
 {/if}
 {#if run.errorsFound}
 <span>• Errors: {run.errorsFound}</span>
 {/if}
 </div>
 </div>
 <Button class="bits-btn" variant="outline" size="sm">View Details</Button>
 </div>
 {/each}
 </div>
 {/if}
 </CardContent>
 </Card>
 {/if}
</div>


