// @vitest-environment node
/**
 * Guard (NAME-POLICY-01): non-spec server code must not grow NEW hard-coded Gemma chat model
 * literals. Chat/synthesis/tool runtime is Ornith 1.5 on llama-server :8090; resolve the served
 * model via `llama-server-model-resolver.ts` / `SERVER_CHAT_MODEL` (`ai/model-ids.ts`), never by
 * pasting another model-id literal.
 *
* Flagged literals: `gemma4-rotorquant`, `gemma4-legal*`, `gemma4:e4b`. The bare alias `hforf` is not flagged here; the Python judge gate (python/tests/test_atlas_summary_claim_judge_v1.py) rejects it as a negative case.
 *
 * Two-way ratchet:
 *  - a file NOT in KNOWN_LITERAL_FILES that contains a literal fails (new offender);
 *  - a file IN the list that no longer contains a literal fails (stale entry — remove it).
 * So the list can only shrink. VLM-lane (:8085) and other real Gemma4 artifacts legitimately keep
 * the name; when a listed file is reclassified as such, move it to ALLOWED_GEMMA_ARTIFACT_FILES
 * with a reason instead of leaving it as an "offender".
 *
 * Scope: sveltekit-frontend/src/{lib/server,routes,mcp}; ts/mts/js/mjs/svelte; excludes
 * *.spec.* / *.test.*; excludes json (schema snapshots) — a DB column default is a schema change,
 * handled separately (see schema-postgres.ts entry below).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const FRONTEND_ROOT = resolve(__dirname, '../../../..');
const SCAN_ROOTS = ['src/lib/server', 'src/routes', 'src/mcp'];
const SCANNED_EXTENSION = /\.(ts|mts|js|mjs|svelte)$/;
const SKIPPED_FILE = /\.(spec|test)\.[a-z]+$/;
const GEMMA_CHAT_LITERAL = /gemma4-rotorquant|gemma4-legal|gemma4:e4b/;

/** Real Gemma4 artifacts that legitimately keep the name (reason required). */
const ALLOWED_GEMMA_ARTIFACT_FILES: Record<string, string> = {};

/** Frozen 2026-10-03. Shrink only: migrate each file to the resolver, then delete its line. */
const KNOWN_LITERAL_FILES: readonly string[] = [];

function findFilesWithGemmaChatLiterals(): string[] {
	const found: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name === 'node_modules' || entry.name === '.svelte-kit') continue;
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (SCANNED_EXTENSION.test(entry.name) && !SKIPPED_FILE.test(entry.name)) {
				if (GEMMA_CHAT_LITERAL.test(readFileSync(full, 'utf8'))) {
					found.push(relative(FRONTEND_ROOT, full).replace(/\\/g, '/'));
				}
			}
		}
	};
	for (const root of SCAN_ROOTS) walk(join(FRONTEND_ROOT, root));
	return found.sort();
}

describe('Gemma chat model literal guard (NAME-POLICY-01)', () => {
	const found = findFilesWithGemmaChatLiterals();
	const known = new Set([...KNOWN_LITERAL_FILES, ...Object.keys(ALLOWED_GEMMA_ARTIFACT_FILES)]);

	it('does not add new hard-coded Gemma chat model literals (use the resolver / SERVER_CHAT_MODEL)', () => {
		const unexpected = found.filter((file) => !known.has(file));
		expect(
			unexpected,
			`New Gemma chat model literal(s). Resolve the model via llama-server-model-resolver.ts or SERVER_CHAT_MODEL (ai/model-ids.ts) instead:\n${unexpected.join('\n')}`,
		).toEqual([]);
	});

	it('shrinks: every listed file still contains a literal (remove migrated files from the list)', () => {
		const foundSet = new Set(found);
		const stale = KNOWN_LITERAL_FILES.filter((file) => !foundSet.has(file));
		expect(
			stale,
			`These files no longer contain a Gemma chat literal — delete them from KNOWN_LITERAL_FILES:\n${stale.join('\n')}`,
		).toEqual([]);
	});

	it('requires a reason for every allowed Gemma artifact file', () => {
		for (const [file, reason] of Object.entries(ALLOWED_GEMMA_ARTIFACT_FILES)) {
			expect(reason.trim().length, `${file} needs a reason`).toBeGreaterThan(10);
		}
	});
});
