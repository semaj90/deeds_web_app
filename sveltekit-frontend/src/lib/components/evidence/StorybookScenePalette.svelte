<script lang="ts">
	import { onMount } from 'svelte';
	import { z } from 'zod';

	let { caseId, evidenceId, sourceRevision, runId, sequenceId }: {
		caseId: string; evidenceId: string; sourceRevision: string; runId: string; sequenceId: number;
	} = $props();
	const resultSchema = z.object({
		status: z.enum(['READY', 'PENDING', 'NOT_FOUND', 'FAILED', 'STALE_SOURCE', 'UNAVAILABLE']),
		sourceRevision: z.string().nullable(),
		artifact: z.object({ width: z.number(), height: z.number(), byteLength: z.number() }).nullable(),
	});
	type Result = z.infer<typeof resultSchema>;
	let status = $state<Result['status'] | 'CHECKING'>('CHECKING');
	let busy = $state(false);
	let artifact = $state<Result['artifact']>(null);
	let endpoint = $derived(`/api/cases/${encodeURIComponent(caseId)}/evidence/${encodeURIComponent(evidenceId)}/scene-palette`);
	let locator = $derived(new URLSearchParams({ runId, sequenceId: String(sequenceId) }).toString());

	async function refresh() {
		busy = true;
		try {
			const response = await fetch(`${endpoint}?${locator}`);
			const result = resultSchema.parse(await response.json());
			const stale = result.status === 'READY' && result.sourceRevision !== sourceRevision;
			status = stale ? 'STALE_SOURCE' : result.status;
			artifact = status === 'READY' ? result.artifact : null;
		} catch {
			status = 'UNAVAILABLE';
		} finally {
			busy = false;
		}
	}

	async function requestPalette() {
		busy = true;
		try {
			const response = await fetch(endpoint, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ runId, sequenceId, sourceRevision }),
			});
			if (!response.ok) {
				const failure = z.object({ status: z.string() }).parse(await response.json());
				status = failure.status === 'STALE_SOURCE' ? 'STALE_SOURCE' : 'UNAVAILABLE';
				return;
			}
			await refresh();
		} catch {
			status = 'UNAVAILABLE';
		} finally {
			busy = false;
		}
	}

	onMount(() => { void refresh(); });
</script>

<section aria-label="Scene texture">
	<h4>4-bit scene texture</h4>
	{#if status === 'READY' && artifact}
		<p>{artifact.width} × {artifact.height} · {artifact.byteLength} bytes</p>
		<a href={`${endpoint}?${locator}&download=1`}>Download palette indices</a>
	{:else if status === 'CHECKING'}
		<p role="status">Checking texture status…</p>
	{:else if status === 'NOT_FOUND'}
		<button type="button" onclick={requestPalette} disabled={busy}>Build texture</button>
	{:else if status === 'PENDING'}
		<p role="status">Texture build queued or processing.</p>
		<button type="button" onclick={refresh} disabled={busy}>Check progress</button>
	{:else if status === 'STALE_SOURCE'}
		<p role="status">The source has changed. Open the current chapter to build its texture.</p>
	{:else if status === 'FAILED'}
		<p role="status">The texture build failed.</p>
	{:else}
		<p role="status">Texture status is unavailable.</p>
		<button type="button" onclick={refresh} disabled={busy}>Check status</button>
	{/if}
</section>
