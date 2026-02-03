<script lang="ts">
 import { Badge } from '$lib/components/ui/badge';
 import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/enhanced-bits';
 // Migrated to $effect

 let status = $state<any>(null);
 let runs = $state<any[]>([]);
 let loading = $state(true);
 let error = $state<string | null>(null);

 async function fetchStatus() {
 try {
 const res = await fetch('/api/internal/error-brain/status');
 if (res.ok) {
 status = await res.json();
 } else {
 error = `Status check failed: ${res.status}`;
 }
 } catch (err) {
 error = `Failed to fetch status: ${err}`;
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
 </div>

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
 <div class="grid gap-4 md, grid-cols-3">
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


