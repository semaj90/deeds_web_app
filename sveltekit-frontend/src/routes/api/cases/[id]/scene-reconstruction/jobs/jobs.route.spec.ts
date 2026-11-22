import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { db } from '$lib/server/db/client.js';
import { enqueueSceneGenerationJobV1 } from '$lib/server/reconstruction/enqueue-scene-generation-job-v1.js';
import { readSceneGenerationInputStatusV1 } from '$lib/server/reconstruction/load-scene-generation-plan-v1.js';
import { readSceneGenerationRecipeV1 } from '$lib/server/reconstruction/read-scene-generation-recipe-v1.js';
import { cancelSceneGenerationJobV1 } from '$lib/server/reconstruction/scene-generation-job-lifecycle-v1.js';
import { GET, PATCH, POST } from './+server.js';

const env = vi.hoisted(() => ({ SCENE_GENERATION_JOBS_ENABLED: false }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: env }));
vi.mock('$lib/server/db/client.js', () => ({ db: { select: vi.fn() } }));
vi.mock('$lib/server/case-access.js', () => ({ getAuthorizedCase: vi.fn() }));
vi.mock('$lib/server/reconstruction/enqueue-scene-generation-job-v1.js', () => ({ enqueueSceneGenerationJobV1: vi.fn() }));
vi.mock('$lib/server/reconstruction/load-scene-generation-plan-v1.js', async (original) => ({
	...await original<typeof import('$lib/server/reconstruction/load-scene-generation-plan-v1.js')>(),
	readSceneGenerationInputStatusV1: vi.fn()
}));
vi.mock('$lib/server/reconstruction/read-scene-generation-recipe-v1.js', () => ({ readSceneGenerationRecipeV1: vi.fn() }));
vi.mock('$lib/server/reconstruction/scene-generation-job-lifecycle-v1.js', () => ({ cancelSceneGenerationJobV1: vi.fn() }));

const caseId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';
const url = new URL(`http://localhost/jobs?jobId=${jobId}`);
const event = { locals: { user: { id: '7' } }, params: { id: caseId }, url };

describe('scene generation job routes', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		env.SCENE_GENERATION_JOBS_ENABLED = false;
	});

	it('keeps the job owner unavailable by default', async () => {
		expect((await GET(event as Parameters<typeof GET>[0])).status).toBe(503);
		expect((await POST(event as Parameters<typeof POST>[0])).status).toBe(503);
		expect((await PATCH(event as Parameters<typeof PATCH>[0])).status).toBe(503);
		expect(db.select).not.toHaveBeenCalled();
		expect(enqueueSceneGenerationJobV1).not.toHaveBeenCalled();
		expect(cancelSceneGenerationJobV1).not.toHaveBeenCalled();
	});

	it('uses session identity and never accepts client-supplied actor or status fields', async () => {
		env.SCENE_GENERATION_JOBS_ENABLED = true;
		const cancel = (body: unknown) => PATCH({
			...event, request: new Request(url, { method: 'PATCH', body: JSON.stringify(body) })
		} as Parameters<typeof PATCH>[0]);
		expect((await cancel({ action: 'cancel', jobId, actorId: 999 })).status).toBe(400);
		expect(cancelSceneGenerationJobV1).not.toHaveBeenCalled();
		vi.mocked(cancelSceneGenerationJobV1).mockResolvedValue(null);
		expect((await cancel({ action: 'cancel', jobId })).status).toBe(404);
		expect(cancelSceneGenerationJobV1).toHaveBeenCalledExactlyOnceWith({ caseId, actorId: 7, jobId });
	});

	it('rejects case status lookups before selecting job rows when access is denied', async () => {
		env.SCENE_GENERATION_JOBS_ENABLED = true;
		const response = await GET(event as Parameters<typeof GET>[0]);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ ok: false, job: null, error: 'Case or job not found' });
		expect(getAuthorizedCase).toHaveBeenCalledWith(caseId, 7);
		expect(db.select).not.toHaveBeenCalled();
	});

	it('recovers only the latest job created by the session user in this case', async () => {
		env.SCENE_GENERATION_JOBS_ENABLED = true;
		vi.mocked(getAuthorizedCase).mockResolvedValue({ id: caseId } as NonNullable<Awaited<ReturnType<typeof getAuthorizedCase>>>);
		const sceneId = '33333333-3333-4333-8333-333333333333';
		const planHash = 'a'.repeat(64);
		const limit = vi.fn().mockResolvedValue([{ jobId, sceneId, status: 'completed', planHash }]);
		const where = vi.fn((_condition: SQL) => ({ orderBy: () => ({ limit }) }));
		vi.mocked(db.select).mockReturnValue({ from: () => ({ where }) } as unknown as ReturnType<typeof db.select>);
		const response = await GET({ ...event, url: new URL('http://localhost/jobs?view=recent') } as Parameters<typeof GET>[0]);
		expect(await response.json()).toEqual({ ok: true, job: { jobId, sceneId, status: 'completed', planHash }, error: null });
		expect(new PgDialect().sqlToQuery(where.mock.calls[0]![0]).params).toEqual([caseId, 7]);
		expect(limit).toHaveBeenCalledExactlyOnceWith(1);
	});

	it('rejects an incomplete plan before enqueue', async () => {
		env.SCENE_GENERATION_JOBS_ENABLED = true;
		const response = await POST({ ...event, request: new Request(url, { method: 'POST', body: '{}' }) } as Parameters<typeof POST>[0]);
		expect(response.status).toBe(400);
		expect(enqueueSceneGenerationJobV1).not.toHaveBeenCalled();
	});

	it('keeps a completed artifact private when its plan is now stale', async () => {
		env.SCENE_GENERATION_JOBS_ENABLED = true;
		vi.mocked(getAuthorizedCase).mockResolvedValue({ id: caseId } as NonNullable<Awaited<ReturnType<typeof getAuthorizedCase>>>);
		const limit = vi.fn().mockResolvedValue([{ caseId, jobId, status: 'completed' }]);
		vi.mocked(db.select).mockReturnValue({ from: () => ({ where: () => ({ limit }) }) } as unknown as ReturnType<typeof db.select>);
		vi.mocked(readSceneGenerationInputStatusV1).mockResolvedValue('source_stale');
		const response = await GET({ ...event, url: new URL(`${url.href}&view=recipe`) } as Parameters<typeof GET>[0]);
		expect(response.status).toBe(409);
		expect(readSceneGenerationInputStatusV1).toHaveBeenCalledWith(expect.objectContaining({ caseId, jobId, createdBy: 7 }));
		expect(readSceneGenerationRecipeV1).not.toHaveBeenCalled();
	});
});
