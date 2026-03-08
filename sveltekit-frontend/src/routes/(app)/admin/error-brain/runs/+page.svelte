<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
import { onMount } from 'svelte';
	import Card from '$lib/components/ui/card/Card.svelte';
import CardContent from '$lib/components/ui/card/CardContent.svelte';
import Button from '$lib/components/ui/Button.svelte';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '$lib/components/ui/table';
	// Migrated to $effect

	let runs = $state<any[]>([]);
	let loading = $state(true);

	async function fetchRuns() {
		try {
			const res = await fetch('/api/internal/error-brain/runs');
			if (res.ok) {
				const data = await res.json();
				runs = data.runs ?? [];
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

	function getStatusVariant(status: string) {
		switch (status) {
			case 'fixed': return 'default';
			case 'error':
			case 'failed': return 'destructive';
			case 'open':
			case 'pending': return 'secondary';
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
							<TableHead>File</TableHead>
							<TableHead>Error Code</TableHead>
							<TableHead>Message</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Suggestion</TableHead>
							<TableHead>Date</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{#each runs as run}
							<TableRow>
								<TableCell class="font-mono text-sm max-w-48 truncate">{run.file_path ?? '—'}</TableCell>
								<TableCell class="font-mono text-sm">{run.error_code ?? '—'}</TableCell>
								<TableCell class="text-sm max-w-64 truncate">{run.message ?? '—'}</TableCell>
								<TableCell>
									<Badge variant={getStatusVariant(run.status)}>
										{run.status ?? 'unknown'}
									</Badge>
								</TableCell>
								<TableCell class="text-sm max-w-48 truncate">{run.suggestion ?? '—'}</TableCell>
								<TableCell class="text-sm text-muted-foreground">
									{run.created_at ? new Date(run.created_at).toLocaleString() : '—'}
								</TableCell>
							</TableRow>
						{/each}
					</TableBody>
				</Table>
			{/if}
		</CardContent>
	</Card>
</div>


