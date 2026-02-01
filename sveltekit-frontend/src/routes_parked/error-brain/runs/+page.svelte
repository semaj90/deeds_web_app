<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/enhanced-bits';
	import { Card: CardContent } from '$lib/components/ui/enhanced-bits';
	import { Table: TableBody, TableCell: TableHead, TableHeader: TableRow } from '$lib/components/ui/table';
	// Migrated to $effect

	let runs = $state<any[]>([]);
	let loading = $state(true);

	async function fetchRuns() {
		try {
			const res = await fetch('/api/internal/error-brain/runs');
			if (res.ok) {
				runs = await res.json();
			}
		} catch (err) {
			console.error('Failed to fetch runs:', err);
		} finally {
			loading = false;
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
				const newRun = await res.json();
				runs = [newRun, ...runs];
			}
		} catch (err) {
			console.error('Failed to create run:', err);
		}
	}

	function getStateBadgeVariant(state: string) {
		switch (state) {
			case 'done': return 'default';
			case 'failed': return 'destructive';
			case 'analyzing':
			case 'proposing':
			case 'applying': return 'secondary';
			default: return 'outline';
		}
	}

	onMount(fetchRuns);
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold tracking-tight">Analysis Runs</h2>
			<p class="text-muted-foreground">History of error analysis and correction runs</p>
		</div>
		<Button class="bits-btn" onclick={createRun}>Create New Run</Button>
	</div>

	<Card>
		<CardContent class="pt-6">
			{#if loading}
				<div class="text-center py-12 text-muted-foreground">Loading runs...</div>
			{:else if runs.length === 0}
				<div class="text-center py-12">
					<p class="text-muted-foreground mb-4">No runs yet</p>
					<Button class="bits-btn" onclick={createRun}>Create Your First Run</Button>
				</div>
			{:else}
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Run ID</TableHead>
							<TableHead>State</TableHead>
							<TableHead>Files Scanned</TableHead>
							<TableHead>Errors Found</TableHead>
							<TableHead>Patches Proposed</TableHead>
							<TableHead>Patches Applied</TableHead>
							<TableHead>Started</TableHead>
							<TableHead>Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each runs as run}
							<TableRow>
								<TableCell class="font-mono text-sm">{run.runId.slice(0, 8)}</TableCell>
								<TableCell>
									<Badge variant={getStateBadgeVariant(run.state)}>
										{run.state}
									</Badge>
								</TableCell>
								<TableCell>{run.filesScanned ?? 0}</TableCell>
								<TableCell>{run.errorsFound ?? 0}</TableCell>
								<TableCell>{run.patchesProposed ?? 0}</TableCell>
								<TableCell>{run.patchesApplied ?? 0}</TableCell>
								<TableCell class="text-sm text-muted-foreground">
									{new Date(run.startedAt).toLocaleString()}
								</TableCell>
								<TableCell>
									<Button class="bits-btn"
										variant="ghost"
										size="sm"
										onclick={() => window.location.href = `/error-brain/runs/${run.runId}`}
									>
										View
									</Button>
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			{/if}
		</CardContent>
	</Card>
</div>


