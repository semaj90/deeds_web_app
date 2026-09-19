// @vitest-environment node
/**
 * Guard: Ollama is embeddings-only (EmbeddingGemma). Chat/generation belongs to llama-server (Ornith 1.5).
 *
 * Fails when a file raw-fetches Ollama `/api/chat` or `/api/generate` outside KNOWN_OLLAMA_CHAT_CALLERS.
 * `ollamaFetch()` callers are NOT flagged: that helper refuses to serve chat/generate from Ollama (503).
 * Remove a file from the list when it is converted to llama-server or archived.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../../..');
const SCAN_ROOTS = ['scripts', 'sveltekit-frontend/scripts', 'sveltekit-frontend/src', 'docker', 'python', 'packages'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'archive', 'dist', '.svelte-kit', '__pycache__', 'phase104-backups', 'api-cleanup']);

// raw fetch( / Python .post( with an Ollama chat or generate path on the same line
const RAW_CALL = /(?:\bfetch\(|\.post\().*\/api\/(?:chat|generate)\b/;
const OLLAMA_HINT = /11434|OLLAMA|ollama/i;

// Known offenders (found 2026-09-19). Shrinks as batches are converted.
const KNOWN_OLLAMA_CHAT_CALLERS: string[] = [
	'scripts/batch_repair_chat.py',
	'scripts/gemma3-legal-agent.mjs',
	'scripts/tests/test-ollama-direct.mjs',
	'sveltekit-frontend/scripts/generate-timeline-synthesis.mjs',
	'sveltekit-frontend/scripts/graphify-svg-architecture.mjs',
	'sveltekit-frontend/scripts/mcp/test-direct-ollama.mjs',
	'sveltekit-frontend/scripts/screenshots/caption-screenshots-gemma4.mjs',
	'sveltekit-frontend/scripts/startup/run-service-health-check.mjs',
	'sveltekit-frontend/scripts/test-ollama-docling.js',
	'sveltekit-frontend/scripts/test-ollama-inference.js',
	'sveltekit-frontend/scripts/tests/fix-cluster4.mjs',
	'sveltekit-frontend/src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte',
	'sveltekit-frontend/src/lib/server/inference/gpu-arbiter.ts', // legitimate: unloads the EMBEDDING model (keep_alive 0), not chat
];

function walk(dir: string, out: string[]): void {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('backup')) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (/\.(mjs|mts|ts|js|cjs|py|svelte)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)) out.push(full);
	}
}

function findCallers(): string[] {
	const files: string[] = [];
	for (const root of SCAN_ROOTS) {
		try {
			walk(join(REPO_ROOT, root), files);
		} catch {
			/* root absent */
		}
	}
	const hits: string[] = [];
	for (const file of files) {
		try {
			const lines = readFileSync(file, 'utf8').split(/\r?\n/);
			if (lines.some((l) => RAW_CALL.test(l) && OLLAMA_HINT.test(l))) {
				hits.push(relative(REPO_ROOT, file).replace(/\\/g, '/'));
			}
		} catch {
			/* unreadable */
		}
	}
	return hits.sort();
}

describe('Ollama chat/generate raw callers are frozen', () => {
	it('has no raw caller outside the known list', () => {
		expect(findCallers()).toEqual([...KNOWN_OLLAMA_CHAT_CALLERS].sort());
	});
});
