import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SceneGenerationPlanV1 } from '$lib/reconstruction/scene-generation-plan-v1.js';
import { compileSceneRuntimeRecipeV1 } from '$lib/reconstruction/scene-runtime-recipe-v1.js';
import SceneGenerationJobPanel from './SceneGenerationJobPanel.svelte';

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const jobId = '33333333-3333-4333-8333-333333333333';
const otherScene = '44444444-4444-4444-8444-444444444444';
const plan = { caseId, sceneId, planHash: 'a'.repeat(64) } as SceneGenerationPlanV1;
const endpoint = `/api/cases/${caseId}/scene-reconstruction/jobs`;
const response = (job: unknown) => new Response(JSON.stringify({ ok: true, job, error: null }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Scene Builder generation jobs', () => {
	it('cancels the tracked job and displays the server outcome', async () => {
		const fetchJob = vi.fn()
			.mockResolvedValueOnce(response(null))
			.mockResolvedValueOnce(response({ jobId, status: 'running', replayed: false }))
			.mockResolvedValueOnce(response({ jobId, sceneId, status: 'canceled', progress: 0 }));
		vi.stubGlobal('fetch', fetchJob);
		const view = render(SceneGenerationJobPanel, { caseId, plan, disabled: false });
		await waitFor(() => expect(view.getByRole('button', { name: 'Queue scene generation' })).toBeEnabled());
		await fireEvent.click(view.getByRole('button', { name: 'Queue scene generation' }));
		await fireEvent.click(await view.findByRole('button', { name: 'Cancel scene generation' }));
		await waitFor(() => expect(view.getByRole('status')).toHaveTextContent('Job canceled'));
		expect(fetchJob).toHaveBeenLastCalledWith(endpoint, expect.objectContaining({ method: 'PATCH',
			body: JSON.stringify({ action: 'cancel', jobId }) }));
		expect(view.queryByRole('button', { name: 'Refresh job status' })).toBeNull();
	});

	it('only submits after an explicit click and tracks that proposal through local preview', async () => {
		const fetchJob = vi.fn()
			.mockResolvedValueOnce(response(null))
			.mockResolvedValueOnce(response({ jobId, status: 'queued', replayed: false }))
			.mockResolvedValueOnce(response({ jobId, sceneId, status: 'completed', progress: 100 }));
		vi.stubGlobal('fetch', fetchJob);
		const view = render(SceneGenerationJobPanel, { caseId, plan, disabled: false });
		await waitFor(() => expect(view.getByRole('button', { name: 'Queue scene generation' })).toBeEnabled());
		expect(fetchJob).toHaveBeenCalledExactlyOnceWith(`${endpoint}?view=recent`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
		await fireEvent.click(view.getByRole('button', { name: 'Queue scene generation' }));
		await waitFor(() => expect(view.getByRole('status')).toHaveTextContent('Waiting for a worker'));
		expect(fetchJob).toHaveBeenCalledWith(endpoint, expect.objectContaining({ method: 'POST', body: JSON.stringify(plan) }));
		await view.rerender({ caseId, plan: null, disabled: false });
		await fireEvent.click(view.getByRole('button', { name: 'Refresh job status' }));
		await waitFor(() => expect(view.getByRole('status')).toHaveTextContent('Scene recipe ready'));
		expect(fetchJob).toHaveBeenCalledWith(`${endpoint}?jobId=${jobId}`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
	});

	it('rejects status for another scene and aborts in-flight requests when leaving the case', async () => {
		const fetchJob = vi.fn()
			.mockResolvedValueOnce(response(null))
			.mockResolvedValueOnce(response({ jobId, status: 'queued', replayed: false }))
			.mockResolvedValueOnce(response({ jobId, sceneId: otherScene, status: 'completed', progress: 100 }))
			.mockImplementationOnce(() => new Promise(() => {}));
		vi.stubGlobal('fetch', fetchJob);
		const view = render(SceneGenerationJobPanel, { caseId, plan, disabled: false });
		await waitFor(() => expect(view.getByRole('button', { name: 'Queue scene generation' })).toBeEnabled());
		await fireEvent.click(view.getByRole('button', { name: 'Queue scene generation' }));
		const refresh = await view.findByRole('button', { name: 'Refresh job status' });
		await fireEvent.click(refresh);
		await waitFor(() => expect(view.getByRole('alert')).toHaveTextContent('Job status does not match the submitted proposal.'));
		expect(view.getByRole('status')).toHaveTextContent('Waiting for a worker');
		await fireEvent.click(refresh);
		const signal = fetchJob.mock.calls[3]?.[1]?.signal as AbortSignal;
		view.unmount();
		expect(signal.aborted).toBe(true);
	});

	it('recovers the last case job without a local proposal and resumes its status controls', async () => {
		const recoveredPlan = {
			...plan, schema: 'parent-atlas.scene-generation-plan/v1', expectedSceneRevision: 0,
			generator: 'procedural-three-scene-v1', caseIntake: null,
			narrative: { why: { status: 'unknown' }, how: { status: 'unknown' } },
			sources: [], actors: [], primitives: [], placements: [], events: [],
			environment: { kind: 'indoor', seed: 7, cellSizeMeters: 32, extentMeters: { x: 32, z: 32 }, coordinateStatus: 'illustrative_uncalibrated' },
			quality: { profile: 'retro', maxTextureDimension: 128, maxTriangles: 50_000, maxInstances: 10_000, activeSceneMemoryMiB: 8 },
			provenance: { intakeStatus: 'USER_INTAKE_UNVERIFIED', clockPolicy: 'source_local_unaligned', identityPolicy: 'pseudonymous_visual_handles', motivePolicy: 'unknown_or_cited_hypothesis' }
		};
		const recipe = compileSceneRuntimeRecipeV1(recoveredPlan);
		const fetchJob = vi.fn()
			.mockResolvedValueOnce(response({ jobId, sceneId, planHash: plan.planHash, status: 'queued' }))
			.mockResolvedValueOnce(response({ jobId, sceneId, status: 'completed', progress: 100 }))
			.mockResolvedValueOnce(response({ jobId, recipe, plan: recoveredPlan, revision: null }));
		vi.stubGlobal('fetch', fetchJob);
		const onOpenRecipe = vi.fn();
		const view = render(SceneGenerationJobPanel, { caseId, plan: null, disabled: false, onOpenRecipe });
		await fireEvent.click(await view.findByRole('button', { name: 'Refresh job status' }));
		await waitFor(() => expect(view.getByRole('button', { name: 'Open generated preview' })).toBeEnabled());
		expect(fetchJob).toHaveBeenLastCalledWith(`${endpoint}?jobId=${jobId}`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
		await fireEvent.click(view.getByRole('button', { name: 'Open generated preview' }));
		await waitFor(() => expect(onOpenRecipe).toHaveBeenCalledWith(jobId, recipe, expect.objectContaining({ sceneId, planHash: plan.planHash }), null));
	});
});
