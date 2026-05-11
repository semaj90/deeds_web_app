/**
 * Loader 7 — tsconfig.json `compilerOptions.paths` → Map<alias, target>.
 *
 * Phase A1.7 of `docs/design/2026-05-11_agents-regen-loaders.md`.
 *
 * Stripped down on purpose: section builders only need to resolve `$lib/...`
 * style import strings to actual directory paths. We don't expand glob patterns
 * here — that's the builder's job when it walks an `imports[]` array.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { LoadPathAliasesResult } from './types.js';

const DEFAULT_TSCONFIG_REL = 'tsconfig.json';

/** Minimum safe default if no tsconfig is reachable. Mirrors the SvelteKit convention. */
const FALLBACK_ALIASES: ReadonlyArray<readonly [string, string]> = [
	['$lib',   'src/lib'],
	['$lib/*', 'src/lib/*'],
];

export interface LoadPathAliasesOptions {
	tsconfigPath?: string;
	/** Repo root used to resolve a relative path. Default: process.cwd(). */
	repoRoot?: string;
}

export async function loadPathAliases(opts: LoadPathAliasesOptions = {}): Promise<LoadPathAliasesResult> {
	const repoRoot  = opts.repoRoot ?? process.cwd();
	const relPath   = opts.tsconfigPath ?? DEFAULT_TSCONFIG_REL;
	const absPath   = path.isAbsolute(relPath) ? relPath : path.join(repoRoot, relPath);
	const loadedAt  = new Date().toISOString();

	let raw: string;
	try {
		raw = await readFile(absPath, 'utf-8');
	} catch {
		return {
			aliases:  new Map(FALLBACK_ALIASES),
			loadedAt,
			source:   `${absPath} (missing — using fallback)`,
		};
	}

	let parsed: unknown;
	try {
		// tsconfig supports comments + trailing commas; strip them defensively.
		parsed = JSON.parse(stripJsonc(raw));
	} catch {
		return {
			aliases:  new Map(FALLBACK_ALIASES),
			loadedAt,
			source:   `${absPath} (malformed — using fallback)`,
		};
	}

	const aliases = extractAliases(parsed);
	if (aliases.size === 0) {
		// Empty paths block — keep the fallback so callers always have $lib resolved.
		for (const [k, v] of FALLBACK_ALIASES) aliases.set(k, v);
	}

	return { aliases, loadedAt, source: absPath };
}

// ── Internals ────────────────────────────────────────────────────────────────

function extractAliases(parsed: unknown): Map<string, string> {
	const out = new Map<string, string>();
	if (!parsed || typeof parsed !== 'object') return out;
	const root = parsed as Record<string, unknown>;
	const compilerOptions = root.compilerOptions as Record<string, unknown> | undefined;
	if (!compilerOptions || typeof compilerOptions !== 'object') return out;
	const paths = compilerOptions.paths as Record<string, unknown> | undefined;
	if (!paths || typeof paths !== 'object') return out;

	for (const [alias, target] of Object.entries(paths)) {
		if (!Array.isArray(target) || target.length === 0) continue;
		const first = target[0];
		if (typeof first !== 'string') continue;
		// Strip leading './' for consistency — section builders concatenate against repoRoot.
		const normalised = first.startsWith('./') ? first.slice(2) : first;
		out.set(alias, normalised);
	}
	return out;
}

/** Strip line + block comments from JSONC. Conservative — leaves string contents alone. */
function stripJsonc(input: string): string {
	let out = '';
	let i = 0;
	const n = input.length;
	while (i < n) {
		const c = input[i];
		if (c === '"') {
			// copy string literal verbatim, honour escapes
			out += c;
			i++;
			while (i < n) {
				const s = input[i];
				out += s;
				i++;
				if (s === '\\' && i < n) { out += input[i]; i++; continue; }
				if (s === '"') break;
			}
			continue;
		}
		if (c === '/' && i + 1 < n && input[i + 1] === '/') {
			while (i < n && input[i] !== '\n') i++;
			continue;
		}
		if (c === '/' && i + 1 < n && input[i + 1] === '*') {
			i += 2;
			while (i + 1 < n && !(input[i] === '*' && input[i + 1] === '/')) i++;
			i += 2;
			continue;
		}
		out += c;
		i++;
	}
	return out;
}
