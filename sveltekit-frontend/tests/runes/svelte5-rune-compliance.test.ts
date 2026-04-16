// @vitest-environment node
/**
 * Svelte 5 Rune Compliance — Static Analysis (G21-G25)
 *
 * Scans .svelte and .svelte.ts source files to verify no Svelte 4 patterns
 * have been introduced. Each test maps to an audit gate from CLAUDE.md.
 *
 * Baseline (2026-04-15): 0 violations on all 5 gates ✅
 * Known exception: keyboard-shortcuts.ts (G25) — orphan with 0 imports, tracked separately
 */

import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const __testDir = path.dirname(fileURLToPath(new URL(import.meta.url)));
const SRC_DIR = path.resolve(__testDir, '../../src');

// ── file collection ──────────────────────────────────────────────

async function collectFiles(dir: string, predicate: (name: string) => boolean): Promise<string[]> {
	const results: string[] = [];
	let entries: import('node:fs').Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return results;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...(await collectFiles(full, predicate)));
		} else if (predicate(entry.name)) {
			results.push(full);
		}
	}
	return results;
}

// ── comment stripping ────────────────────────────────────────────
// Removes JS/TS single-line (//), block (/* */), and HTML/Svelte (<!-- -->)
// comments before pattern matching — prevents false positives from docs and
// commented-out legacy code.

function stripComments(content: string): string {
	return content
		.replace(/<!--[\s\S]*?-->/g, '') // <!-- html/svelte comments -->
		.replace(/\/\*[\s\S]*?\*\//g, '') // /* block comments */
		.replace(/\/\/[^\n]*/g, ''); // // line comments
}

/** Extract contents of all <script> blocks from a .svelte file (after comment stripping). */
function extractScriptContent(svelte: string): string {
	const stripped = stripComments(svelte);
	const chunks: string[] = [];
	const re = /<script(?:[^>]*)>([\s\S]*?)<\/script>/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(stripped)) !== null) {
		chunks.push(m[1]);
	}
	return chunks.join('\n');
}

function relPath(abs: string): string {
	return path.relative(SRC_DIR, abs).replace(/\\/g, '/');
}

// ── gates ─────────────────────────────────────────────────────────

describe('Svelte 5 rune compliance (G21-G25)', () => {
	it('G21 — no Svelte 4 "export let" props in .svelte files', async () => {
		const files = await collectFiles(SRC_DIR, (n) => n.endsWith('.svelte'));
		const violations: string[] = [];

		for (const file of files) {
			const content = await readFile(file, 'utf-8');
			const script = extractScriptContent(content);
			if (/export\s+let\s+\w+/.test(script)) {
				violations.push(relPath(file));
			}
		}

		expect(violations).toEqual([]);
	});

	it('G22 — no Svelte 4 reactive declarations ($:) in .svelte script blocks', async () => {
		const files = await collectFiles(SRC_DIR, (n) => n.endsWith('.svelte'));
		const violations: string[] = [];

		for (const file of files) {
			const content = await readFile(file, 'utf-8');
			const script = extractScriptContent(content);
			if (/^\s*\$:[^:]/m.test(script)) {
				violations.push(relPath(file));
			}
		}

		expect(violations).toEqual([]);
	});

	it('G23 — no Svelte 4 event directives (on:event=) in .svelte templates', async () => {
		const files = await collectFiles(SRC_DIR, (n) => n.endsWith('.svelte'));
		const violations: string[] = [];

		for (const file of files) {
			const raw = await readFile(file, 'utf-8');
			// Strip comments first so commented-out on:click= doesn't trip this
			const content = stripComments(raw);
			if (/\bon:[a-z][a-z]+=/.test(content)) {
				violations.push(relPath(file));
			}
		}

		expect(violations).toEqual([]);
	});

	it('G24 — no createEventDispatcher() in .svelte files (excluding comments)', async () => {
		const files = await collectFiles(SRC_DIR, (n) => n.endsWith('.svelte'));
		const violations: string[] = [];

		for (const file of files) {
			const raw = await readFile(file, 'utf-8');
			const content = stripComments(raw);
			if (/createEventDispatcher\s*\(\s*\)/.test(content)) {
				violations.push(relPath(file));
			}
		}

		expect(violations).toEqual([]);
	});

	it('G25 — no rune calls in plain .ts files (only allowed in .svelte.ts)', async () => {
		const libDir = path.join(SRC_DIR, 'lib');
		const files = await collectFiles(
			libDir,
			(n) => n.endsWith('.ts') && !n.endsWith('.svelte.ts') && !n.endsWith('.d.ts')
		);
		const violations: string[] = [];

		for (const file of files) {
			const raw = await readFile(file, 'utf-8');
			const content = stripComments(raw);
			if (/\$(?:state|derived|effect|props)\s*[(<]/.test(content)) {
				violations.push(relPath(file));
			}
		}

		// Known exceptions — rune names appear in string literals, not actual rune calls:
		//   keyboard-shortcuts.ts     — orphan with 0 imports, stray $state (tracked in MEMORY.md)
		//   web-search-searxng.ts     — contains mock snippet string "export let → $props()"
		//   web-search.ts             — contains mock snippet string "export let → $props()"
		const KNOWN_EXCEPTIONS = ['keyboard-shortcuts.ts', 'web-search-searxng.ts', 'web-search.ts'];
		const unexpected = violations.filter((v) => !KNOWN_EXCEPTIONS.some((exc) => v.includes(exc)));
		expect(unexpected, 'rune calls found in plain .ts files').toEqual([]);
	});
});

// ── rune usage quality ────────────────────────────────────────────

describe('Svelte 5 rune usage quality', () => {
	it('$derived(() => {...}) — no plain $derived with block body (use $derived.by)', async () => {
		const files = await collectFiles(
			SRC_DIR,
			(n) => n.endsWith('.svelte') || n.endsWith('.svelte.ts')
		);
		const violations: string[] = [];

		for (const file of files) {
			const raw = await readFile(file, 'utf-8');
			const content = stripComments(raw);
			// Matches $derived(() => { — block body returns a getter, not a value
			if (/\$derived\s*\(\s*\(\s*\)\s*=>[\s\n]*\{/.test(content)) {
				violations.push(relPath(file));
			}
		}

		expect(violations).toEqual([]);
	});

	it('no writable() store usage in .svelte.ts class stores', async () => {
		const files = await collectFiles(SRC_DIR, (n) => n.endsWith('.svelte.ts'));
		const violations: string[] = [];

		for (const file of files) {
			const raw = await readFile(file, 'utf-8');
			const content = stripComments(raw);
			if (/\bwritable\s*\(/.test(content)) {
				violations.push(relPath(file));
			}
		}

		expect(violations).toEqual([]);
	});
});

// ── SvelteKit layer contract (informational) ──────────────────────
// These tests report violations but do not fail CI — they document
// known tech-debt items that require dedicated refactor sessions.

describe('SvelteKit layer contract audit (G8 — informational)', () => {
	it('reports any SvelteKit error() imports in $lib/server service files', async () => {
		const serverDir = path.join(SRC_DIR, 'lib', 'server');
		const files = await collectFiles(
			serverDir,
			(n) => n.endsWith('.ts') && !n.endsWith('.d.ts')
		);
		const violations: string[] = [];

		for (const file of files) {
			const raw = await readFile(file, 'utf-8');
			const content = stripComments(raw);
			if (/import\s+[^;]*\berror\b[^;]*from\s+['"]@sveltejs\/kit['"]/.test(content)) {
				violations.push(relPath(file));
			}
		}

		if (violations.length > 0) {
			console.warn(
				`[G8] ${violations.length} service file(s) import error() from @sveltejs/kit ` +
					`(should use HttpServiceError subclasses):\n  ${violations.join('\n  ')}`
			);
		}

		// Informational — known violations tracked as tech debt.
		// Update this count if intentionally resolved.
		expect(violations.length).toBeLessThanOrEqual(5);
	});
});
