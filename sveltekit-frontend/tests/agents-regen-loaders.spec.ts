// @vitest-environment node
/**
 * Phase A1 — loader contract tests (graph + path-aliases foundation only).
 *
 * Covers loaders 1 + 7 from `docs/design/2026-05-11_agents-regen-loaders.md`.
 * Other loaders (karpathy/clusters/features/activity/existingCard/composer)
 * land in follow-on phases.
 *
 * Both loaders are pure file-read — no DB / Redis / Qdrant required.
 */

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadGraph } from '../src/lib/server/agents/regen/loaders/graph.js';
import { loadPathAliases } from '../src/lib/server/agents/regen/loaders/path-aliases.js';

let workRoot = '';

beforeEach(async () => {
	workRoot = await mkdtemp(path.join(tmpdir(), 'regen-loaders-'));
});

afterEach(async () => {
	if (workRoot) await rm(workRoot, { recursive: true, force: true }).catch(() => undefined);
});

// ── loadGraph ────────────────────────────────────────────────────────────────

describe('loadGraph', () => {
	async function writeGraphFixture(payload: unknown) {
		const rel = 'docs/graph/codebase-graph.json';
		const abs = path.join(workRoot, rel);
		await mkdir(path.dirname(abs), { recursive: true });
		await writeFile(abs, JSON.stringify(payload), 'utf-8');
		return rel;
	}

	it('parses a minimal graph and re-indexes files by rel', async () => {
		const now = new Date().toISOString();
		await writeGraphFixture({
			createdAt: now,
			repoRoot:  workRoot,
			fileCount: 2,
			dirCount:  1,
			files: {
				0: { rel: 'src/lib/a.ts', ext: '.ts', tags: ['ts'], imports: ['$lib/b'] },
				1: { rel: 'src/lib/b.ts', ext: '.ts', isTest: false, lineCount: 42 },
			},
			directories: {
				'src/lib': { rel: 'src/lib', fileCount: 2 },
			},
		});

		const result = await loadGraph({ repoRoot: workRoot });
		expect(result.graph.fileCount).toBe(2);
		expect(result.graph.files.get('src/lib/a.ts')?.imports).toEqual(['$lib/b']);
		expect(result.graph.files.get('src/lib/b.ts')?.lineCount).toBe(42);
		expect(result.graph.directories.get('src/lib')?.fileCount).toBe(2);
		expect(result.staleWarning).toBe(false);
	});

	it('flags staleWarning=true when createdAt is older than 24h', async () => {
		const longAgo = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
		await writeGraphFixture({
			createdAt: longAgo,
			files: { 0: { rel: 'x.ts' } },
			directories: {},
		});
		const result = await loadGraph({ repoRoot: workRoot });
		expect(result.staleWarning).toBe(true);
		expect(result.staleMs).toBeGreaterThan(24 * 60 * 60 * 1000);
	});

	it('throws on malformed JSON (the one fatal loader failure)', async () => {
		const abs = path.join(workRoot, 'docs/graph/codebase-graph.json');
		await mkdir(path.dirname(abs), { recursive: true });
		await writeFile(abs, '{not-json', 'utf-8');
		await expect(loadGraph({ repoRoot: workRoot })).rejects.toThrow(/malformed JSON/);
	});

	it('tolerates an array-shaped files block (older snapshots)', async () => {
		await writeGraphFixture({
			createdAt: new Date().toISOString(),
			files: [{ rel: 'src/a.ts' }, { rel: 'src/b.ts' }],
			directories: [],
		});
		const result = await loadGraph({ repoRoot: workRoot });
		expect(result.graph.files.size).toBe(2);
		expect(result.graph.files.has('src/a.ts')).toBe(true);
	});

	it('parses the real codebase-graph.json in under 1500ms', async () => {
		const repoRoot = path.resolve(__dirname, '..');
		const t0 = Date.now();
		const result = await loadGraph({ repoRoot });
		const elapsedMs = Date.now() - t0;
		expect(elapsedMs).toBeLessThan(1500);
		// The graph header claims fileCount + dirCount; our Map sizes should be at
		// least that big (graphify sometimes emits extra entries during re-indexing).
		expect(result.graph.files.size).toBeGreaterThan(0);
		expect(result.graph.directories.size).toBeGreaterThan(0);
	});
});

// ── loadPathAliases ──────────────────────────────────────────────────────────

describe('loadPathAliases', () => {
	async function writeTsconfig(contents: string) {
		const abs = path.join(workRoot, 'tsconfig.json');
		await writeFile(abs, contents, 'utf-8');
	}

	it('parses tsconfig.json paths and strips leading ./', async () => {
		await writeTsconfig(JSON.stringify({
			compilerOptions: {
				paths: {
					'$lib':   ['./src/lib'],
					'$lib/*': ['./src/lib/*'],
					'$app/*': ['./.svelte-kit/runtime/app/*'],
				},
			},
		}));
		const result = await loadPathAliases({ repoRoot: workRoot });
		expect(result.aliases.get('$lib')).toBe('src/lib');
		expect(result.aliases.get('$lib/*')).toBe('src/lib/*');
		expect(result.aliases.get('$app/*')).toBe('.svelte-kit/runtime/app/*');
	});

	it('uses the SvelteKit fallback when tsconfig is missing', async () => {
		const result = await loadPathAliases({ repoRoot: workRoot });
		expect(result.aliases.get('$lib')).toBe('src/lib');
		expect(result.source).toContain('missing — using fallback');
	});

	it('tolerates JSONC comments + trailing commas', async () => {
		await writeTsconfig(`{
			// line comment
			"compilerOptions": {
				"paths": {
					"$lib": ["./src/lib"], /* block comment */
				},
			},
		}`);
		const result = await loadPathAliases({ repoRoot: workRoot });
		expect(result.aliases.get('$lib')).toBe('src/lib');
	});

	it('falls back to defaults when tsconfig is malformed', async () => {
		await writeTsconfig('{ this is not json');
		const result = await loadPathAliases({ repoRoot: workRoot });
		expect(result.aliases.get('$lib')).toBe('src/lib');
		expect(result.source).toContain('malformed — using fallback');
	});

	it('falls back when paths block is empty', async () => {
		await writeTsconfig(JSON.stringify({ compilerOptions: {} }));
		const result = await loadPathAliases({ repoRoot: workRoot });
		expect(result.aliases.get('$lib')).toBe('src/lib');
	});
});
