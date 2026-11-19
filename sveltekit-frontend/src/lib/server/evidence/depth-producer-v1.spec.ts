// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	DEPTH_MODEL_ID_V1,
	DEPTH_MODEL_REVISION_V1,
	produceDepthAttachmentPlanV1,
	type DepthWorkerRunner
} from './depth-producer-v1';

const sha = (b: Buffer) => `sha256:${createHash('sha256').update(b).digest('hex')}`;

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'depth-producer-'));
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

async function pngOf(width: number, height: number): Promise<Buffer> {
	return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 60, b: 30 } } })
		.png()
		.toBuffer();
}

/** Fake worker: writes the receipt and PNG the Python producer would, then applies `mutate`. */
function fakeWorker(opts: {
	source: Buffer;
	depthPng: Buffer;
	exitCode?: number;
	mutate?: (r: Record<string, any>) => void;
	receiptWidth?: number;
	receiptHeight?: number;
}): DepthWorkerRunner {
	return async ({ args }) => {
		const outDir = args[args.indexOf('--out-dir') + 1];
		if ((opts.exitCode ?? 0) !== 0) return { exitCode: opts.exitCode ?? 1, stderr: 'boom' };
		await writeFile(join(outDir, 'depth_u8.png'), opts.depthPng);
		const receipt: Record<string, any> = {
			schema: 'atlas-depth-anything-receipt.v1',
			model: { id: DEPTH_MODEL_ID_V1, revision: DEPTH_MODEL_REVISION_V1 },
			depthType: 'relative_monocular',
			input: {
				sha256: sha(opts.source),
				width: opts.receiptWidth ?? 4,
				height: opts.receiptHeight ?? 3
			},
			output: {
				npy: join(outDir, 'depth.npy'),
				pngSha256: sha(opts.depthPng),
				width: 4,
				height: 3
			}
		};
		opts.mutate?.(receipt);
		await writeFile(join(outDir, 'receipt.json'), JSON.stringify(receipt));
		return { exitCode: 0, stderr: '' };
	};
}

async function run(runner: DepthWorkerRunner, source: Buffer) {
	return produceDepthAttachmentPlanV1(
		{
			evidenceId: '11111111-1111-4111-8111-111111111111',
			caseId: '22222222-2222-4222-8222-222222222222',
			bucket: 'legal-artifacts',
			imagePath: join(dir, 'src.png'),
			sourceBytes: source,
			currentSourceRevision: sha(source),
			outDir: dir
		},
		{ python: 'python', script: 'worker.py', runner }
	);
}

describe('produceDepthAttachmentPlanV1', () => {
	it('returns a planOnly result with the depth hash and relative-depth semantics, and writes nothing', async () => {
		const source = await pngOf(4, 3);
		const depthPng = await pngOf(4, 3);
		const { plan } = await run(fakeWorker({ source, depthPng }), source);
		expect(plan.planOnly).toBe(true);
		expect(plan.writesPerformed).toBe(false);
		expect(plan.depthSha256).toBe(sha(depthPng).slice('sha256:'.length));
		const depth = plan.proposedAiAnalysis.depthAnalysis as Record<string, unknown>;
		expect(depth.depthType).toBe('relative_monocular');
		expect(depth.is3DReconstruction).toBe(false);
		expect(depth.modelLicense).toBe('UNVERIFIED');
		expect(depth.modelRevision).toBe(DEPTH_MODEL_REVISION_V1);
	});

	it('refuses when the source bytes do not match the expected revision', async () => {
		const source = await pngOf(4, 3);
		await expect(
			produceDepthAttachmentPlanV1(
				{
					evidenceId: '11111111-1111-4111-8111-111111111111',
					caseId: null,
					bucket: 'b',
					imagePath: join(dir, 'x.png'),
					sourceBytes: source,
					currentSourceRevision: 'sha256:' + '0'.repeat(64),
					outDir: dir
				},
				{ python: 'python', script: 'worker.py', runner: fakeWorker({ source, depthPng: source }) }
			)
		).rejects.toThrow('SOURCE_REVISION_MISMATCH');
	});

	it('fails when the worker exits non-zero', async () => {
		const source = await pngOf(4, 3);
		await expect(run(fakeWorker({ source, depthPng: source, exitCode: 1 }), source)).rejects.toThrow(
			'DEPTH_WORKER_FAILED_EXIT_1'
		);
	});

	it('rejects a receipt bound to a different source', async () => {
		const source = await pngOf(4, 3);
		const runner = fakeWorker({ source, depthPng: source, mutate: (r) => (r.input.sha256 = 'sha256:' + 'f'.repeat(64)) });
		await expect(run(runner, source)).rejects.toThrow('DEPTH_RECEIPT_SOURCE_MISMATCH');
	});

	it('rejects a PNG whose bytes differ from the receipt hash', async () => {
		const source = await pngOf(4, 3);
		const depthPng = await pngOf(4, 3);
		const runner: DepthWorkerRunner = async ({ args }) => {
			const outDir = args[args.indexOf('--out-dir') + 1];
			await writeFile(join(outDir, 'depth_u8.png'), depthPng);
			await writeFile(
				join(outDir, 'receipt.json'),
				JSON.stringify({
					schema: 'atlas-depth-anything-receipt.v1',
					model: { id: DEPTH_MODEL_ID_V1, revision: DEPTH_MODEL_REVISION_V1 },
					depthType: 'relative_monocular',
					input: { sha256: sha(source), width: 4, height: 3 },
					output: { npy: 'x', pngSha256: 'sha256:' + 'e'.repeat(64), width: 4, height: 3 }
				})
			);
			return { exitCode: 0, stderr: '' };
		};
		await expect(run(runner, source)).rejects.toThrow('DEPTH_ARTIFACT_HASH_MISMATCH');
	});

	it('rejects a depth raster whose size differs from the oriented source (alignment guard)', async () => {
		const source = await pngOf(4, 3);
		const runner = fakeWorker({ source, depthPng: source, receiptWidth: 5, receiptHeight: 3 });
		await expect(run(runner, source)).rejects.toThrow('DEPTH_SOURCE_DIMENSION_MISMATCH');
	});

	it('rejects a wrong model identity or revision', async () => {
		const source = await pngOf(4, 3);
		const runner = fakeWorker({
			source,
			depthPng: source,
			mutate: (r) => (r.model.revision = 'a'.repeat(40))
		});
		await expect(run(runner, source)).rejects.toThrow('DEPTH_MODEL_IDENTITY_MISMATCH');
	});
});
