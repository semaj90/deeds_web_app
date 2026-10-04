// @vitest-environment node
/**
 * Guard: Ollama is embeddings-only (EmbeddingGemma). Chat/generation belongs to llama-server (Ornith 1.5).
 *
 * Fails when a file raw-fetches Ollama `/api/chat` or `/api/generate` outside
 * KNOWN_OLLAMA_CHAT_CALLERS. Embedding endpoints and embedding-model lifecycle
 * calls are allowed; chat/generation ownership remains llama-server/Ornith.
 * Remove a file from the list when it is converted to llama-server or archived.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../../..');
const SCAN_ROOTS = ['scripts', 'sveltekit-frontend/scripts', 'sveltekit-frontend/src', 'docker', 'python', 'packages'];

// raw fetch( / Python .post( with an Ollama chat or generate path on the same line
const RAW_CALL = /(?:\bfetch\(|\.post\().*\/api\/(?:chat|generate)\b/;
const OLLAMA_HINT = /11434|OLLAMA|ollama/i;
const EMBEDDING_LIFECYCLE = /embeddinggemma|OLLAMA_EMBED|keep_alive\s*:\s*0/i;

// Known offenders (found 2026-09-19). Shrinks as batches are converted.
// 2026-10-04: 8 entries were already llama-server callers (stale) and were pruned. Remaining: batch_repair_chat.py
// (TypeScript saved under a .py name), caption-screenshots-gemma4.mjs (vision -> VLM lane) and the Svelte chat component.
const KNOWN_OLLAMA_CHAT_CALLERS: string[] = [
	'scripts/batch_repair_chat.py',
	'sveltekit-frontend/scripts/screenshots/caption-screenshots-gemma4.mjs',
	'sveltekit-frontend/src/lib/components/ai/EnhancedLegalAIChatWithSynthesis.svelte',
];

function findCallers(): string[] {
	let files: string[] = [];
	try {
		files = execFileSync('rg', [
			'--files', '--hidden',
			'-g', '!**/node_modules/**', '-g', '!**/.svelte-kit/**',
			'-g', '!**/static/**', '-g', '!**/archive/**', '-g', '!**/api-cleanup/**',
			'-g', '!**/phase104-backups/**',
			...SCAN_ROOTS,
		], { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
			.split(/\r?\n/).filter(Boolean)
			.filter((file) => /\.(mjs|mts|ts|js|cjs|py|svelte)$/.test(file) && !/\.(test|spec)\./.test(file))
			.map((file) => resolve(REPO_ROOT, file))
			.filter((file) => !file.toLowerCase().includes('phase104-backups'));
	} catch {
		return [];
	}
	const hits: string[] = [];
	for (const file of files) {
		try {
			const lines = readFileSync(file, 'utf8').split(/\r?\n/);
			const text = lines.join('\n');
			if (lines.some((l) => RAW_CALL.test(l) && OLLAMA_HINT.test(l)) && !EMBEDDING_LIFECYCLE.test(text)) {
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
		const callers = findCallers();
		expect(callers).toEqual([...KNOWN_OLLAMA_CHAT_CALLERS].filter((caller) => callers.includes(caller)).sort());
	});
});
