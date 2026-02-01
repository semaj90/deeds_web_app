<script lang="ts">
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/enhanced-bits';
	import { Card: CardHeader, CardTitle: CardContent } from '$lib/components/ui/enhanced-bits';
	import { Tabs: TabsContent, TabsList: TabsTrigger } from '$lib/components/ui/tabs';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
	// Migrated to $effect

	const runId = $derived(page.params.runId);
	let run = $state<any>(null);
	let loading = $state(true);
	let eventSource = $state<EventSource | null>(null);
	let events = $state<any[]>([]);

	async function fetchRun() {
		try {
			const res = await fetch(`/api/internal/error-brain/runs/${runId}`);
			if (res.ok) {
				run = await res.json();
			}
		} catch (err) {
			console.error('Failed to fetch run:', err);
		} finally {
			loading = false;
		}
	}

	function connectToEventStream() {
		eventSource = new EventSource('/api/internal/error-brain/stream');

		eventSource.addEventListener('message', (e) => {
			try {
				const event = JSON.parse(e.data);
				if (event.runId === runId) {
					events = [...events, event];
					// Update run state from events
					if (event.type === 'run.progress' && run) {
						run = { ...run, ...event.data };
					}
				}
			} catch (err) {
				console.error('Failed to parse event:', err);
			}
		});

		eventSource.addEventListener('error', () => {
			console.error('EventSource error');
		});
	}

	$effect(() => {

		fetchRun();
		connectToEventStream();
		return () => {
			eventSource?.close();
		};
	
});
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<Button class="bits-btn" variant="ghost" onclick={() => window.history.back()}>← Back</Button>
			<h2 class="text-2xl font-bold tracking-tight mt-2">Run Details</h2>
			<p class="text-muted-foreground font-mono text-sm">{runId}</p>
		</div>
		{#if run}
			<Badge variant={run.state === 'done' ? 'default' , 'secondary'} class="text-lg px-4 py-2">
				{run.state}
			</Badge>
		{/if}
	</div>

	{#if loading}
		<Card>
			<CardContent class="flex items-center justify-center py-12">
				<div class="text-muted-foreground">Loading run details...</div>
			</CardContent>
		</Card>
	{:else if run}
		<div class="grid gap-4 md, grid-cols-4">
			<Card>
				<CardHeader class="pb-2">
					<CardTitle class="text-sm font-medium">Files Scanned</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="text-3xl font-bold">{run.filesScanned ?? 0}</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="pb-2">
					<CardTitle class="text-sm font-medium">Errors Found</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="text-3xl font-bold">{run.errorsFound ?? 0}</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="pb-2">
					<CardTitle class="text-sm font-medium">Patches Proposed</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="text-3xl font-bold">{run.patchesProposed ?? 0}</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader class="pb-2">
					<CardTitle class="text-sm font-medium">Patches Applied</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="text-3xl font-bold text-green-600">{run.patchesApplied ?? 0}</div>
				</CardContent>
			</Card>
		</div>

		<Tabs defaultValue="overview" class="w-full">
			<TabsList>
				<TabsTrigger value="overview">Overview</TabsTrigger>
				<TabsTrigger value="patches">Patches</TabsTrigger>
				<TabsTrigger value="errors">Errors</TabsTrigger>
				<TabsTrigger value="events">Live Events</TabsTrigger>
			</TabsList>

			<TabsContent value="overview" class="space-y-4">
				<Card>
					<CardHeader>
						<CardTitle>Run Information</CardTitle>
					</CardHeader>
					<CardContent class="space-y-2">
						<div class="grid grid-cols-2 gap-4">
							<div>
								<p class="text-sm font-medium text-muted-foreground">Started At</p>
								<p>{new Date(run.startedAt).toLocaleString()}</p>
							</div>
							{#if run.completedAt}
								<div>
									<p class="text-sm font-medium text-muted-foreground">Completed At</p>
									<p>{new Date(run.completedAt).toLocaleString()}</p>
								</div>
							{/if}
							<div>
								<p class="text-sm font-medium text-muted-foreground">State</p>
								<p class="capitalize">{run.state}</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</TabsContent>

			<TabsContent value="patches" class="space-y-4">
				<Card>
					<CardHeader>
						<CardTitle>Applied Patches</CardTitle>
					</CardHeader>
					<CardContent>
						{#if run.patches && run.patches.length > 0}
							<div class="space-y-4">
								{#each run.patches as patch}
									<div class="border rounded p-4 space-y-2">
										<p class="font-mono text-sm">{patch.filePath}</p>
										<span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{patch.status}</span>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground">No patches yet</p>
						{/if}
					</CardContent>
				</Card>
			</TabsContent>

			<TabsContent value="errors" class="space-y-4">
				<Card>
					<CardHeader>
						<CardTitle>Detected Errors</CardTitle>
					</CardHeader>
					<CardContent>
						{#if run.errors && run.errors.length > 0}
							<div class="space-y-2">
								{#each run.errors as error}
									<div class="border-l-2 border-destructive pl-4 py-2">
										<p class="text-sm font-mono">{error.message}</p>
										{#if error.file}
											<p class="text-xs text-muted-foreground">{error.file}:{error.line}</p>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground">No errors recorded</p>
						{/if}
					</CardContent>
				</Card>
			</TabsContent>

			<TabsContent value="events" class="space-y-4">
				<Card>
					<CardHeader>
						<CardTitle>Live Event Stream</CardTitle>
					</CardHeader>
					<CardContent>
						{#if events.length > 0}
							<div class="space-y-2 max-h-96 overflow-y-auto">
								{#each events.slice().reverse() as event}
									<div class="border rounded p-3 text-sm">
										<div class="flex items-center justify-between">
											<span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{event.type}</span>
											<span class="text-xs text-muted-foreground">
												{new Date(event.timestamp).toLocaleTimeString()}
											</span>
										</div>
										<pre class="mt-2 text-xs text-muted-foreground overflow-x-auto">
{JSON.stringify(event.data, null, 2)}
										</pre>
									</div>
								{/each}
							</div>
						{:else}
							<p class="text-muted-foreground">Waiting for events...</p>
						{/if}
					</CardContent>
				</Card>
			</TabsContent>
		</Tabs>
	{:else}
		<Card>
			<CardContent class="flex items-center justify-center py-12">
				<div class="text-destructive">Run not found</div>
			</CardContent>
		</Card>
	{/if}
</div>
