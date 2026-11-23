<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { z } from 'zod';
	import { SceneGenerationJobStatusV1 } from '$lib/reconstruction/scene-generation-job-contract-v1.js';
	import { SceneGenerationPlanV1Schema, type SceneGenerationPlanV1 } from '$lib/reconstruction/scene-generation-plan-v1.js';
	import { SceneRuntimeRecipeV1Schema, type SceneRuntimeRecipeV1 } from '$lib/reconstruction/scene-runtime-recipe-v1.js';
	import { sceneDocumentV1Schema, type SceneDocumentV1 } from '$lib/splat/scene-document-v1.js';

	let { caseId, plan, disabled, openPlanHash = null, onOpenRecipe }: {
		caseId: string; plan: SceneGenerationPlanV1 | null; disabled: boolean; openPlanHash?: string | null;
		onOpenRecipe?: (jobId: string, recipe: SceneRuntimeRecipeV1, plan: SceneGenerationPlanV1,
			revision: { manifest: SceneDocumentV1; manifestSha256: string } | null) => void;
	} = $props();
	const receiptSchema = z.object({ jobId: z.uuid(), status: z.enum(SceneGenerationJobStatusV1), replayed: z.boolean() }).strict();
	const statusSchema = receiptSchema.omit({ replayed: true }).extend({
		sceneId: z.uuid(), progress: z.number().int().min(0).max(100)
	});
	const envelopeSchema = z.object({ ok: z.boolean(), job: z.unknown(), error: z.string().nullable() });
	const digest = z.string().regex(/^[a-f0-9]{64}$/);
	const recentSchema = statusSchema.omit({ progress: true }).extend({ planHash: digest }).nullable();
	const resultSchema = z.object({ jobId: z.uuid(), recipe: SceneRuntimeRecipeV1Schema, plan: SceneGenerationPlanV1Schema,
		revision: z.object({ manifest: sceneDocumentV1Schema, manifestSha256: digest }).strict().nullable()
	}).strict();
	const labels: Record<SceneGenerationJobStatusV1, string> = {
		queued: 'Waiting for a worker', running: 'Generating scene recipe', completed: 'Scene recipe ready',
		failed: 'Scene generation failed', canceled: 'Job canceled',
		source_missing: 'Case or source unavailable', source_stale: 'Inputs changed. Prepare a fresh proposal.'
	};
	let tracked = $state.raw<{ jobId: string; sceneId: string; planHash: string; status: SceneGenerationJobStatusV1 } | null>(null);
	let pending = $state(false);
	let error = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | undefined;
	let pollsRemaining = 0;
	const endpoint = $derived(`/api/cases/${encodeURIComponent(caseId)}/scene-reconstruction/jobs`);
	const active = $derived(tracked?.status === 'queued' || tracked?.status === 'running');

	onMount(() => { void restoreRecentJob(); });
	onDestroy(() => {
		clearTimeout(timer);
		controller?.abort();
	});

	async function readJob(response: Response) {
		const result = envelopeSchema.parse(await response.json());
		if (!response.ok || !result.ok) throw new Error(result.error || 'Scene generation request failed.');
		return result.job;
	}

	async function restoreRecentJob() {
		const request = new AbortController();
		controller = request;
		pending = true;
		try {
			const job = recentSchema.parse(await readJob(await fetch(`${endpoint}?view=recent`, { signal: request.signal })));
			if (request.signal.aborted || !job) return;
			tracked = job;
			pollsRemaining = 60;
			scheduleStatusCheck();
		} catch (cause) {
			if (!request.signal.aborted) error = cause instanceof Error ? cause.message : 'Unable to restore scene generation status.';
		} finally {
			if (controller === request) { controller = undefined; pending = false; }
		}
	}

	function scheduleStatusCheck() {
		if (!active || pollsRemaining <= 0) return;
		clearTimeout(timer);
		timer = setTimeout(() => {
			pollsRemaining--;
			void refreshStatus();
		}, 5_000);
	}

	async function queueProposal() {
		if (!plan || plan.caseId !== caseId || active || pending || disabled) return;
		const submitted = plan;
		const request = new AbortController();
		controller = request;
		pending = true;
		error = '';
		try {
			const receipt = receiptSchema.parse(await readJob(await fetch(endpoint, {
				method: 'POST', headers: { 'content-type': 'application/json' },
				body: JSON.stringify(submitted), signal: request.signal
			})));
			if (request.signal.aborted) return;
			tracked = { jobId: receipt.jobId, sceneId: submitted.sceneId, planHash: submitted.planHash, status: receipt.status };
			pollsRemaining = 60;
			scheduleStatusCheck();
		} catch (cause) {
			if (!request.signal.aborted) error = cause instanceof Error ? cause.message : 'Unable to submit the proposal.';
		} finally {
			if (controller === request) { controller = undefined; pending = false; }
		}
	}

	async function refreshStatus(cancel = false) {
		if (!tracked || pending) return;
		const job = tracked;
		const request = new AbortController();
		clearTimeout(timer);
		controller = request;
		pending = true;
		error = '';
		try {
			const response = cancel
				? await fetch(endpoint, { method: 'PATCH', headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ action: 'cancel', jobId: job.jobId }), signal: request.signal })
				: await fetch(`${endpoint}?jobId=${encodeURIComponent(job.jobId)}`, { signal: request.signal });
			const status = statusSchema.parse(await readJob(response));
			if (request.signal.aborted) return;
			if (status.jobId !== job.jobId || status.sceneId !== job.sceneId) throw new Error('Job status does not match the submitted proposal.');
			tracked = { ...job, status: status.status };
			scheduleStatusCheck();
		} catch (cause) {
			if (!request.signal.aborted) error = cause instanceof Error ? cause.message : cancel ? 'Unable to cancel job.' : 'Unable to check job status.';
		} finally {
			if (controller === request) { controller = undefined; pending = false; }
		}
	}

	async function openGeneratedRecipe() {
		if (!tracked || tracked.status !== 'completed' || (openPlanHash && tracked.planHash !== openPlanHash) || pending || disabled) return;
		const job = tracked;
		const request = new AbortController();
		controller = request;
		pending = true;
		error = '';
		try {
			const result = resultSchema.parse(await readJob(await fetch(`${endpoint}?jobId=${encodeURIComponent(job.jobId)}&view=recipe`, {
				signal: request.signal
			})));
			if (request.signal.aborted) return;
			if (result.jobId !== job.jobId || result.recipe.caseId !== caseId || result.recipe.sceneId !== job.sceneId ||
				result.recipe.planHash !== job.planHash || (openPlanHash && job.planHash !== openPlanHash) ||
				result.plan.caseId !== caseId || result.plan.sceneId !== job.sceneId || result.plan.planHash !== job.planHash ||
				result.plan.expectedSceneRevision !== result.recipe.sceneRevision ||
				(result.revision && (result.revision.manifest.caseId !== caseId || result.revision.manifest.sceneId !== job.sceneId ||
					result.revision.manifest.revision !== result.recipe.sceneRevision))) {
				throw new Error('Scene recipe does not match the current proposal.');
			}
			onOpenRecipe?.(job.jobId, result.recipe, result.plan, result.revision);
		} catch (cause) {
			if (!request.signal.aborted) error = cause instanceof Error ? cause.message : 'Unable to open the scene recipe.';
		} finally {
			if (controller === request) { controller = undefined; pending = false; }
		}
	}
</script>

{#if plan || tracked || error}
	<section aria-label="Scene generation job">
		{#if plan}
			<button type="button" onclick={queueProposal} disabled={disabled || pending || active || tracked?.planHash === plan.planHash}>
				{pending && !tracked ? 'Queuing scene generation…' : 'Queue scene generation'}
			</button>
		{/if}
		{#if tracked}
			<p role="status">{labels[tracked.status]}{plan && tracked.planHash !== plan.planHash ? ' · Earlier proposal' : ''}</p>
			{#if active}
				<button type="button" onclick={() => refreshStatus()} disabled={pending}>Refresh job status</button>
				<button type="button" onclick={() => refreshStatus(true)} disabled={pending}>Cancel scene generation</button>
			{/if}
			{#if tracked.status === 'completed' && onOpenRecipe}
				<button type="button" onclick={openGeneratedRecipe} disabled={disabled || pending || (openPlanHash !== null && tracked.planHash !== openPlanHash)}>Open generated preview</button>
			{/if}
		{/if}
		{#if error}<p role="alert">{error}</p>{/if}
	</section>
{/if}

<style>
	section { margin: .6rem 0; }
	p { margin: .4rem 0; }
</style>
