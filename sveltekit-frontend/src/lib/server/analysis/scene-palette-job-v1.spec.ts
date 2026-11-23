import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueScenePaletteJobV1, executeScenePaletteJobV1, reopenScenePaletteJobV1, scenePaletteJobIdV1 } from './scene-palette-job-v1.js';

const ports = vi.hoisted(() => ({
	select: vi.fn(), scene: vi.fn(), enqueue: vi.fn(), get: vi.fn(), put: vi.fn(),
}));
vi.mock('$lib/server/db/client.js', () => ({ db: { select: ports.select } }));
vi.mock('$lib/server/scene-document-revisions-v1.js', () => ({ readSavedImageStorybookChapterV1: ports.scene }));
vi.mock('$lib/server/storage/seaweed.js', () => ({ getFileFromSeaweed: ports.get, putFileToSeaweed: ports.put }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SEAWEED_ARTIFACTS_BUCKET: 'fixture' } }));
vi.mock('./analysis-jobs.js', () => ({ enqueueJob: ports.enqueue }));

const source = {
	actorId: 7, caseId: '10000000-0000-4000-8000-000000000001', evidenceId: '20000000-0000-4000-8000-000000000002',
};
const request = {
	runId: '30000000-0000-4000-8000-000000000003', sequenceId: 1, sourceRevision: `sha256:${'a'.repeat(64)}`,
};
const jobId = scenePaletteJobIdV1({ ...source, ...request });
const job = { ...source, ...request, procedureId: 'scene.palette.pack.v1', sceneManifestSha256: 'b'.repeat(64) };
const saved = {
	chapter: { evidenceId: source.evidenceId, sourceRevision: request.sourceRevision },
	sourceState: 'CURRENT', manifestSha256: job.sceneManifestSha256,
};
const hash = { hash: request.sourceRevision, mime: 'image/png' };

function returnDbRows(...rows: Array<Record<string, unknown>>) {
	for (const row of rows) {
		const query = {
			from: () => query, innerJoin: () => query, where: () => query, limit: async () => [row],
		};
		ports.select.mockReturnValueOnce(query);
	}
}

describe('scene palette saved revision admission', () => {
	beforeEach(() => vi.resetAllMocks());

	it('rejects a nonexistent or differently bound saved scene before enqueue', async () => {
		returnDbRows(hash, hash);
		ports.scene.mockResolvedValueOnce(null).mockResolvedValueOnce({
			...saved, chapter: { ...saved.chapter, evidenceId: request.runId },
		});
		await expect(enqueueScenePaletteJobV1(source, request)).resolves.toEqual({ status: 'NOT_FOUND' });
		await expect(enqueueScenePaletteJobV1(source, request)).resolves.toEqual({ status: 'NOT_FOUND' });
		expect(ports.enqueue).not.toHaveBeenCalled();
	});

	it('pins the verified scene digest before enqueue', async () => {
		returnDbRows(hash, { status: 'queued', result: job });
		ports.scene.mockResolvedValue(saved);
		await expect(enqueueScenePaletteJobV1(source, request)).resolves.toMatchObject({ status: 'ACCEPTED', jobId });
		expect(ports.scene).toHaveBeenCalledWith({ caseId: source.caseId, sceneId: request.runId, revision: 1 });
		expect(ports.enqueue).toHaveBeenCalledWith(expect.objectContaining({ reuseId: jobId, result: job }));
	});

	it('reports missing analysis separately from a changed chapter', async () => {
		returnDbRows(hash);
		ports.scene.mockResolvedValue({ ...saved, sourceState: 'UNAVAILABLE' });
		await expect(enqueueScenePaletteJobV1(source, request)).resolves.toEqual({ status: 'UNAVAILABLE' });
		expect(ports.enqueue).not.toHaveBeenCalled();
	});

	it('blocks a claimed job whose saved chapter review has changed before reading storage', async () => {
		returnDbRows({ status: 'running', result: job }, hash);
		ports.scene.mockResolvedValue({ ...saved, sourceState: 'CHANGED' });
		await expect(executeScenePaletteJobV1(source.evidenceId, job, jobId)).rejects.toThrow('SCENE_PALETTE_SCENE_REVISION_UNAVAILABLE');
		expect(ports.get).not.toHaveBeenCalled();
		expect(ports.put).not.toHaveBeenCalled();
	});

	it('blocks a download if the saved revision changes during storage readback', async () => {
		const bytes = new Uint8Array([0x55]);
		const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
		const artifact = { schema: 'atlas-indexed-palette16-v1', width: 2, height: 1, byteLength: 1, sha256 };
		returnDbRows(hash, { status: 'completed', result: { ...job, artifact } }, hash);
		ports.scene.mockResolvedValueOnce(saved).mockResolvedValueOnce({ ...saved, manifestSha256: 'c'.repeat(64) });
		ports.get.mockResolvedValueOnce(bytes);
		await expect(reopenScenePaletteJobV1(source, jobId, true)).resolves.toEqual({ status: 'STALE_SOURCE' });
		expect(ports.get).toHaveBeenCalledOnce();
	});
});
