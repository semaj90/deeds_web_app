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

// Writers that exist today (found 2026-09-19). Migrate to semantic_768 or archive, then delete here.
const KNOWN_LEGACY_WRITERS: string[] = [
	'scripts/atlas/populate-packet-vector-bundles.mjs', // packet_vector_bundles: first-384-dims slice of 768 vectors
	'scripts/atlas/rebuild-gemma4-summaries-384.mjs',
	'scripts/atlas/restore-qdrant-384-from-postgres.mjs',
	'sveltekit-frontend/scripts/atlas/backfill-content-embedding-384.mjs',
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
});
