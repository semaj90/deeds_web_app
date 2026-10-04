// @vitest-environment node
/**
 * Guard (CLUSTER-CENTROID-OWNER-01): `gpu_cluster_centroids` is a LEGACY read surface.
 * Its primary key is `cluster_id` alone and it has no representation/workspace/clustering
 * revision, so every writer can silently overwrite another's rows (see the writer audit in
 * openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md). New centroid sets
 * must be revision-qualified `CentroidArtifactV1` / `CentroidManifestV1` artifacts
 * (atlas/cache/centroid-artifact-v1.ts), not new rows in this table.
 *
 * Two-way ratchet over the 4 writers known on 2026-10-03:
 *  - a file NOT in KNOWN_WRITERS that writes the table (INSERT / UPDATE / DELETE / TRUNCATE,
 *    or Drizzle `.insert|update|delete(gpuClusterCentroids)`) fails (new writer);
 *  - a file IN the list that no longer writes it fails (stale entry: remove it).
 * The list may only shrink.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync, type Stats } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../../../..');
const SCAN_ROOTS = ['scripts', 'python', 'packages', 'sveltekit-frontend/scripts', 'sveltekit-frontend/src'];
const SCANNED_EXTENSION = /\.(ts|mts|cts|js|mjs|cjs|py)$/;
const SKIPPED_FILE = /\.(spec|test)\.[a-z]+$/;
const SKIPPED_DIR = new Set(['node_modules', '.git', '.svelte-kit', 'dist', 'build', '.tmp', '__pycache__']);
const WRITER_PATTERN =
	/(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:public\.)?gpu_cluster_centroids\b|\.(?:insert|update|delete)\(\s*gpuClusterCentroids\b/i;

/** Frozen 2026-10-03. Shrink only. Labels: see the writer audit table in tasks.md. */
const KNOWN_WRITERS: Readonly<Record<string, string>> = {
	'scripts/atlas/persist-kmeans-centroids.mjs': 'COMPATIBILITY: legacy JS-KMeans writer; TRUNCATEs the table (produced the live 2026-07-14 rows)',
	'sveltekit-frontend/scripts/sync-centroids-to-postgres.ts': 'EXPERIMENT: writes summary-space centroids with ON CONFLICT (cluster_id)',
	'sveltekit-frontend/src/lib/server/retrieval/centroid-cache.ts': 'BACKEND: Redis-to-Postgres persist step overwrites by cluster_id',
	'scripts/atlas/dir-pipeline.mjs': 'DEAD: inserts into columns that do not exist; errors are swallowed',
};

function walk(dir: string, out: string[]): void {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return;
	}
	for (const name of entries) {
		if (SKIPPED_DIR.has(name)) continue;
		const full = join(dir, name);
		let stat: Stats;
		try {
			stat = statSync(full);
		} catch {
			continue;
		}
		if (stat.isDirectory()) walk(full, out);
		else if (SCANNED_EXTENSION.test(name) && !SKIPPED_FILE.test(name)) out.push(full);
	}
}

function findWriters(): string[] {
	const files: string[] = [];
	for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), files);
	return files
		.filter((file) => WRITER_PATTERN.test(readFileSync(file, 'utf8')))
		.map((file) => relative(REPO_ROOT, file).replace(/\\/g, '/'))
		.sort();
}

describe('gpu_cluster_centroids writer guard (CLUSTER-CENTROID-OWNER-01)', () => {
	const found = findWriters();

	it('does not gain a new writer (use revision-qualified CentroidArtifactV1 artifacts instead)', () => {
		const unexpected = found.filter((file) => !(file in KNOWN_WRITERS));
		expect(
			unexpected,
			`New writer(s) of the legacy gpu_cluster_centroids table. Produce a CentroidArtifactV1/CentroidManifestV1 artifact instead:\n${unexpected.join('\n')}`,
		).toEqual([]);
	});

	it('has no stale entries (a listed file that no longer writes the table must be removed)', () => {
		const stale = Object.keys(KNOWN_WRITERS).filter((file) => !found.includes(file));
		expect(stale, `Remove from KNOWN_WRITERS:\n${stale.join('\n')}`).toEqual([]);
	});

	it('records a reason for every known writer', () => {
		for (const [file, reason] of Object.entries(KNOWN_WRITERS)) {
			expect(reason.trim().length, `${file} needs a reason`).toBeGreaterThan(10);
		}
	});
});
