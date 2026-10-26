// @vitest-environment node
/**
 * Guard: the 384-dim vector lane is retired (semantic_768 is canonical; EmbeddingGemma's MRL
 * truncations are 512/256/128 only, so 384 is not a valid derived size).
 *
 * This test freezes the set of files that still WRITE to a 384-dim column. It fails when a NEW
 * writer appears, so the lane cannot quietly grow again. It does not fix or drop anything; when a
 * legacy writer is migrated to 768 or archived, remove it from KNOWN_LEGACY_WRITERS.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../../..');
const SCAN_ROOTS = ['scripts', 'sveltekit-frontend/src', 'sveltekit-frontend/scripts', 'python', 'packages'];
/** A statement that INSERTs into / UPDATEs one of the 384-dim vector surfaces. */
const WRITE_RE =
	/(INSERT\s+INTO|UPDATE)[^;]{0,600}?(content_embedding_384|summary_embedding_384|latent_384d|packet_vector_bundles)/is;

// Legacy write surfaces remain inventoried until their schema/consumer migrations are proven.
const KNOWN_LEGACY_WRITERS: string[] = [
	'scripts/atlas/populate-packet-vector-bundles.mjs', // VECTOR(384) bundle schema; --apply now fails closed
	'scripts/atlas/rebuild-gemma4-summaries-384.mjs',
	'scripts/atlas/restore-qdrant-384-from-postgres.mjs',
];

function findWriters(): string[] {
	const trackedSearch = spawnSync(
		'git',
		[
			'grep',
			'-z',
			'-l',
			'-I',
			'-E',
			'content_embedding_384|summary_embedding_384|latent_384d|packet_vector_bundles',
			'--',
			...SCAN_ROOTS,
		],
		{ cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
	);
	if (trackedSearch.error) throw trackedSearch.error;
	if (trackedSearch.status !== 0 && trackedSearch.status !== 1) {
		throw new Error(`git grep writer scan failed (${trackedSearch.status}): ${trackedSearch.stderr}`);
	}
	const untrackedSearch = spawnSync(
		'git',
		['ls-files', '-z', '--others', '--exclude-standard', '--', ...SCAN_ROOTS],
		{ cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
	);
	if (untrackedSearch.error) throw untrackedSearch.error;
	if (untrackedSearch.status !== 0) {
		throw new Error(`git untracked-file scan failed (${untrackedSearch.status}): ${untrackedSearch.stderr}`);
	}
	const codeFile = /\.(mjs|mts|ts|js|py)$/;
	const files = [
		...trackedSearch.stdout.split('\0').filter((file) => codeFile.test(file)),
		...untrackedSearch.stdout.split('\0').filter((file) => codeFile.test(file)),
	].map((file) => resolve(REPO_ROOT, file));
	const hits: string[] = [];
	for (const file of files) {
		try {
			if (!/\.(test|spec)\./.test(file) && WRITE_RE.test(readFileSync(file, 'utf8'))) {
				hits.push(relative(REPO_ROOT, file).replace(/\\/g, '/'));
			}
		} catch {
			/* unreadable file: skip */
		}
	}
	return hits.sort();
}

describe('384-dim embedding writers are frozen', () => {
	it('has no writer outside the known legacy list', () => {
		expect(findWriters()).toEqual([...KNOWN_LEGACY_WRITERS].sort());
	}, 90_000);

	it('blocks legacy bundle and summary writes before environment or database setup', () => {
		const bundle = readFileSync(resolve(REPO_ROOT, 'scripts/atlas/populate-packet-vector-bundles.mjs'), 'utf8');
		expect(bundle).toContain('EMBEDDINGGEMMA_384_BUNDLE_WRITE_DISABLED');
		expect(bundle.indexOf('EMBEDDINGGEMMA_384_BUNDLE_WRITE_DISABLED')).toBeLessThan(bundle.indexOf("config({ path: resolve('.', '.env')"));

		const source = readFileSync(resolve(REPO_ROOT, 'scripts/atlas/rebuild-gemma4-summaries-384.mjs'), 'utf8');
		expect(source).toContain('EMBEDDINGGEMMA_384_SUMMARY_WRITE_DISABLED');
		expect(source.indexOf('EMBEDDINGGEMMA_384_SUMMARY_WRITE_DISABLED')).toBeLessThan(source.indexOf('const env = loadRepoEnv()'));
	});

	it('retires the full backfill before filesystem, database, or Qdrant work', () => {
		const source = readFileSync(resolve(REPO_ROOT, 'scripts/atlas/phase108d-embeddings-backfill-full.mts'), 'utf8');
		expect(source).toContain('LEGACY_384_QDRANT_BACKFILL_DISABLED');
		expect(source.indexOf('LEGACY_384_QDRANT_BACKFILL_DISABLED')).toBeLessThan(source.indexOf('mkdirSync(LOG_DIR'));
		expect(source.indexOf('LEGACY_384_QDRANT_BACKFILL_DISABLED')).toBeLessThan(source.indexOf('function queryPostgres'));
		expect(source.indexOf('LEGACY_384_QDRANT_BACKFILL_DISABLED')).toBeLessThan(source.indexOf('await fetch('));
	});

	it('keeps the SOM writer on strict 768-D input and gates unqualified writes', () => {
		const source = readFileSync(resolve(REPO_ROOT, 'scripts/atlas/run-som-on-chunks.mjs'), 'utf8');
		expect(source).toContain('const DIM        = 768');
		expect(source).toContain('vector.length !== DIM');
		expect(source).toContain('provenance unverified');
		expect(source).toContain('--allow-unqualified-experimental-write');
	});

	it('blocks legacy 384 collection writers and the synthetic evaluator before setup', () => {
		const disabledEntrypoints: Array<[string, string, string]> = [
			['sveltekit-frontend/scripts/atlas/backfill-hybrid-collection.mjs', 'LEGACY_384_HYBRID_BACKFILL_DISABLED', 'const PG_CONFIG'],
			['sveltekit-frontend/scripts/atlas/backfill-qdrant-kmeans-payload.mjs', 'LEGACY_384_KMEANS_PAYLOAD_DISABLED', 'const pool ='],
			['sveltekit-frontend/scripts/atlas/backfill-qdrant-som-payload.mjs', 'LEGACY_384_SOM_PAYLOAD_DISABLED', 'const pool ='],
			['sveltekit-frontend/scripts/atlas/backfill-qdrant-packet-key.mjs', 'LEGACY_384_PACKET_KEY_BACKFILL_DISABLED', 'const pool ='],
			['sveltekit-frontend/scripts/atlas/ensure-qdrant-payload-indexes.mjs', 'LEGACY_384_PAYLOAD_INDEX_DISABLED', 'fetch('],
			['scripts/atlas/build-qdrant-384-hnsw.mts', 'LEGACY_384_HNSW_BUILD_DISABLED', 'const __dirname'],
			['scripts/atlas/qdrant-provision-384v2.mjs', 'LEGACY_384_COLLECTION_PROVISION_DISABLED', 'const APPLY'],
			['scripts/atlas/populate-karpathy-scores.mjs', 'LEGACY_384_KARPATHY_SOURCE_DISABLED', 'dotenv.config'],
			['sveltekit-frontend/scripts/phase2f/phase2f-evaluation-runner.mts', 'LEGACY_PHASE2F_384_STUB_DISABLED', 'const sql = postgres'],
		];

		for (const [relativePath, guard, setup] of disabledEntrypoints) {
			const source = readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
			expect(source).toContain(guard);
			expect(source.indexOf(guard)).toBeLessThan(source.indexOf(setup));
		}
	});

	it('uses the 768 packet embedding for envelope presence diagnostics', () => {
		const source = readFileSync(resolve(REPO_ROOT, 'scripts/atlas/task-2-materialize-envelope-fields.mjs'), 'utf8');
		expect(source).toContain('SELECT packet_key, feature_id, source_ref, embedding');
		expect(source).toContain('has_embedding=${row.embedding !== null}');
		expect(source).not.toContain('content_embedding_384');
	});
});
