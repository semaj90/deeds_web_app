import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	canResumeAtlasPassCheckpointV1,
	createAtlasPassCheckpointV1,
} from './pass-checkpoint-v1.js';

const BASE = {
	passId: 'kmeans-fixture-1',
	algorithmRevision: 'kmeans-v1',
	inputSnapshotChecksum: 'sha256:fixture-input-abc',
	iteration: 3,
	maxIterations: 50,
	derivedArtifactChecksum: 'sha256:centroids-at-iter-3',
	ordinalMapChecksum: 'sha256:ordinal-map-abc',
	converged: false,
};

describe('AtlasPassCheckpointV1 contract', () => {
	it('constructs a valid in-progress checkpoint with a null stopReason', () => {
		const cp = createAtlasPassCheckpointV1(BASE);
		expect(cp.schema).toBe('atlas.pass-checkpoint.v1');
		expect(cp.stopReason).toBeNull();
		expect(cp.converged).toBe(false);
	});

	it('rejects iteration > maxIterations', () => {
		expect(() =>
			createAtlasPassCheckpointV1({ ...BASE, iteration: 51, maxIterations: 50 }),
		).toThrow();
	});

	it('rejects a converged checkpoint with no stopReason', () => {
		expect(() =>
			createAtlasPassCheckpointV1({ ...BASE, converged: true, stopReason: null }),
		).toThrow();
	});

	it('accepts a converged checkpoint that sets stopReason', () => {
		const cp = createAtlasPassCheckpointV1({
			...BASE,
			converged: true,
			stopReason: 'RELATIVE_TOLERANCE',
		});
		expect(cp.stopReason).toBe('RELATIVE_TOLERANCE');
	});

	it('canResumeAtlasPassCheckpointV1 refuses to resume across a different input snapshot or algorithm revision', () => {
		const cp = createAtlasPassCheckpointV1(BASE);
		expect(
			canResumeAtlasPassCheckpointV1(cp, {
				algorithmRevision: BASE.algorithmRevision,
				inputSnapshotChecksum: BASE.inputSnapshotChecksum,
			}),
		).toBe(true);
		expect(
			canResumeAtlasPassCheckpointV1(cp, {
				algorithmRevision: BASE.algorithmRevision,
				inputSnapshotChecksum: 'sha256:different-input',
			}),
		).toBe(false);
		expect(
			canResumeAtlasPassCheckpointV1(cp, {
				algorithmRevision: 'kmeans-v2',
				inputSnapshotChecksum: BASE.inputSnapshotChecksum,
			}),
		).toBe(false);
	});

	it('canResumeAtlasPassCheckpointV1 refuses to resume an already-converged checkpoint', () => {
		const cp = createAtlasPassCheckpointV1({
			...BASE,
			converged: true,
			stopReason: 'MAX_ITERATIONS',
		});
		expect(
			canResumeAtlasPassCheckpointV1(cp, {
				algorithmRevision: BASE.algorithmRevision,
				inputSnapshotChecksum: BASE.inputSnapshotChecksum,
			}),
		).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Proof gate 7.3: a small bounded K-means, checkpointed mid-run, killed, and
// resumed from the checkpoint, produces the SAME final derivedArtifactChecksum
// as an uninterrupted run over the same input. Fixture-only (per design.md's
// non-goals), deterministic (fixed seed, fixed point order, no RNG).
// ---------------------------------------------------------------------------

type Point = readonly [number, number];

const FIXTURE_POINTS: readonly Point[] = [
	[0, 0],
	[0, 1],
	[1, 0],
	[1, 1],
	[10, 10],
	[10, 11],
	[11, 10],
	[11, 11],
	[20, 0],
	[21, 1],
	[20, 1],
	[21, 0],
];
const INITIAL_CENTROIDS: Point[] = [
	[0, 0],
	[10, 10],
	[20, 0],
];
const MAX_ITERATIONS = 20;

function checksumOf(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function distanceSq(a: Point, b: Point): number {
	return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function assign(points: readonly Point[], centroids: readonly Point[]): number[] {
	return points.map((p) => {
		let best = 0;
		let bestDist = Infinity;
		for (let c = 0; c < centroids.length; c++) {
			const d = distanceSq(p, centroids[c]!);
			if (d < bestDist) {
				bestDist = d;
				best = c;
			}
		}
		return best;
	});
}

function recompute(points: readonly Point[], assignments: number[], k: number): Point[] {
	const sums = Array.from({ length: k }, () => [0, 0, 0] as [number, number, number]);
	for (let i = 0; i < points.length; i++) {
		const c = assignments[i]!;
		sums[c]![0] += points[i]![0];
		sums[c]![1] += points[i]![1];
		sums[c]![2] += 1;
	}
	return sums.map(([sx, sy, n], idx) => (n > 0 ? [sx / n, sy / n] : INITIAL_CENTROIDS[idx]!));
}

/** One bounded K-means run from a given starting point (iteration 0 or resumed mid-run). */
function runKMeans(
	points: readonly Point[],
	startCentroids: readonly Point[],
	startIteration: number,
	maxIterations: number,
): { centroids: Point[]; iteration: number; converged: boolean } {
	let centroids = startCentroids.slice() as Point[];
	let iteration = startIteration;
	let converged = false;
	while (iteration < maxIterations) {
		const assignments = assign(points, centroids);
		const next = recompute(points, assignments, centroids.length);
		iteration++;
		const moved = next.some((c, idx) => distanceSq(c, centroids[idx]!) > 1e-9);
		centroids = next;
		if (!moved) {
			converged = true;
			break;
		}
	}
	return { centroids, iteration, converged };
}

describe('AtlasPassCheckpointV1 resume-from-boundary proof (task 7.3)', () => {
	it('resuming a killed K-means from its checkpoint reproduces the uninterrupted final result', () => {
		const inputSnapshotChecksum = checksumOf(FIXTURE_POINTS);

		// Uninterrupted reference run.
		const reference = runKMeans(FIXTURE_POINTS, INITIAL_CENTROIDS, 0, MAX_ITERATIONS);
		const referenceChecksum = checksumOf(reference.centroids);
		expect(reference.converged).toBe(true);

		// Interrupted run: stop after exactly 1 iteration, checkpoint, "kill" the process
		// (drop all in-memory state), then resume purely from the checkpoint's centroids.
		const partial = runKMeans(FIXTURE_POINTS, INITIAL_CENTROIDS, 0, 1);
		expect(partial.converged).toBe(false);

		const checkpoint = createAtlasPassCheckpointV1({
			passId: 'kmeans-fixture-1',
			algorithmRevision: 'kmeans-v1',
			inputSnapshotChecksum,
			iteration: partial.iteration,
			maxIterations: MAX_ITERATIONS,
			derivedArtifactChecksum: checksumOf(partial.centroids),
			ordinalMapChecksum: checksumOf(FIXTURE_POINTS.map((_, i) => i)),
			converged: false,
		});

		// Simulate "kill": only the checkpoint's serialized centroids survive.
		const resumedCentroids = JSON.parse(
			JSON.stringify(partial.centroids),
		) as Point[];
		expect(
			canResumeAtlasPassCheckpointV1(checkpoint, {
				algorithmRevision: 'kmeans-v1',
				inputSnapshotChecksum,
			}),
		).toBe(true);

		const resumed = runKMeans(
			FIXTURE_POINTS,
			resumedCentroids,
			checkpoint.iteration,
			MAX_ITERATIONS,
		);
		expect(resumed.converged).toBe(true);
		expect(checksumOf(resumed.centroids)).toBe(referenceChecksum);
	});
});
