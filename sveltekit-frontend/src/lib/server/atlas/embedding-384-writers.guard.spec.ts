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
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../../..');
const SCAN_ROOTS = ['scripts', 'sveltekit-frontend/src', 'sveltekit-frontend/scripts', 'python', 'packages'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'archive', 'dist', '.svelte-kit', '__pycache__']);

/** A statement that INSERTs into / UPDATEs one of the 384-dim vector surfaces. */
const WRITE_RE =
	/(INSERT\s+INTO|UPDATE)[^;]{0,600}?(content_embedding_384|summary_embedding_384|latent_384d|packet_vector_bundles)/is;

// Legacy write surfaces remain inventoried until their schema/consumer migrations are proven.
const KNOWN_LEGACY_WRITERS: string[] = [
	'scripts/atlas/populate-packet-vector-bundles.mjs', // VECTOR(384) bundle schema; --apply now fails closed
	'scripts/atlas/rebuild-gemma4-summaries-384.mjs',
	'scripts/atlas/restore-qdrant-384-from-postgres.mjs',
];

function walk(dir: string, out: string[]): void {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (/\.(mjs|mts|ts|js|py)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) out.push(full);
	}
}

function findWriters(): string[] {
	const files: string[] = [];
	for (const root of SCAN_ROOTS) {
		try {
			walk(join(REPO_ROOT, root), files);
		} catch {
			/* root absent in this checkout */
		}
	}
	const hits: string[] = [];
	for (const file of files) {
		try {
			if (WRITE_RE.test(readFileSync(file, 'utf8'))) {
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
	});

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
});
