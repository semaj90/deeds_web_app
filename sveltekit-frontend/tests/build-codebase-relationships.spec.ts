// @vitest-environment node
/**
 * Regression tests for build-codebase-relationships.mjs
 * Covers normalizeRepoPath() and ACE relation matching.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Lazy-load the ESM helper (normalizeRepoPath is an export)
let normalizeRepoPath: (p: string) => string;

beforeAll(async () => {
	const mod = await import(
		'../scripts/graph/build-codebase-relationships.mjs'
	) as { normalizeRepoPath: (p: string) => string };
	normalizeRepoPath = mod.normalizeRepoPath;
});

describe('normalizeRepoPath', () => {
	it('handles Unix absolute path', () => {
		expect(normalizeRepoPath('/home/user/deeds-web-app/sveltekit-frontend/src/lib/server/ace/context-assembler.ts'))
			.toBe('src/lib/server/ace/context-assembler.ts');
	});

	it('handles Windows absolute path', () => {
		expect(normalizeRepoPath('C:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\src\\lib\\server\\ai\\gemma4-agent.ts'))
			.toBe('src/lib/server/ai/gemma4-agent.ts');
	});

	it('handles path with sveltekit-frontend/src prefix', () => {
		expect(normalizeRepoPath('sveltekit-frontend/src/routes/api/ace/+server.ts'))
			.toBe('src/routes/api/ace/+server.ts');
	});

	it('handles already-normalized path', () => {
		expect(normalizeRepoPath('src/lib/server/graph/som-topology-pipeline.ts'))
			.toBe('src/lib/server/graph/som-topology-pipeline.ts');
	});

	it('handles relative ./src path', () => {
		expect(normalizeRepoPath('./src/lib/server/cache/redis-exact-match.ts'))
			.toBe('src/lib/server/cache/redis-exact-match.ts');
	});

	it('handles lib/ path without src prefix', () => {
		// lib/ paths from the extractor are already relative from src/
		expect(normalizeRepoPath('lib/server/ace/context-assembler.ts'))
			.toBe('lib/server/ace/context-assembler.ts');
	});

	it('returns empty string for null/undefined', () => {
		expect(normalizeRepoPath('')).toBe('');
		expect(normalizeRepoPath(null as unknown as string)).toBe('');
	});
});

describe('ACE relation matching via normalizeRepoPath', () => {
	it('matches context-assembler.ts from Windows absolute path', () => {
		const norm = normalizeRepoPath(
			'C:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\src\\lib\\server\\ace\\context-assembler.ts'
		);
		expect(norm.endsWith('/context-assembler.ts') || norm === 'src/lib/server/ace/context-assembler.ts').toBe(true);
	});

	it('matches context-assembler.ts from extractor relative path', () => {
		// extract-code-relations outputs paths like "lib/server/ace/context-assembler.ts"
		const norm = normalizeRepoPath('lib/server/ace/context-assembler.ts');
		const fname = 'context-assembler.ts';
		const matches = norm.endsWith('/' + fname) || norm === fname;
		expect(matches).toBe(true);
	});

	it('matches multi-lane-retrieval.ts from relative path', () => {
		const norm = normalizeRepoPath('lib/server/ace/multi-lane-retrieval.ts');
		expect(norm.endsWith('/multi-lane-retrieval.ts') || norm === 'multi-lane-retrieval.ts').toBe(true);
	});

	it('does not false-match a different file', () => {
		const norm = normalizeRepoPath('lib/server/ace/context-assembler.ts');
		expect(norm.endsWith('/qdrant-manager.ts')).toBe(false);
	});

	it('stratified sample contains READS_REDIS_KEY and QUERIES_TABLE', () => {
		// Verify stratified sample structure — builds on the live artifact
		const { readFileSync } = require('node:fs');
		const artifactPath = resolve(ROOT, 'logs/task-output/code-relations-latest.json');
		let artifact: { sample?: unknown[] };
		try {
			artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
		} catch {
			// Artifact may not exist in CI — skip gracefully
			return;
		}
		const sample = artifact.sample ?? [];
		const types = new Set((sample as Array<{ relationType: string }>).map(e => e.relationType));
		expect(types.has('READS_REDIS_KEY')).toBe(true);
		expect(types.has('QUERIES_TABLE')).toBe(true);
		expect(types.has('HAS_AGENTS_SCOPE')).toBe(false); // excluded by stratifiedSample
	});

	it('aceEdges field covers all 12 canonical ACE files', () => {
		// Regression: aceEdges is written without sampling cap so all ACE files appear
		const { readFileSync } = require('node:fs');
		const artifactPath = resolve(ROOT, 'logs/task-output/code-relations-latest.json');
		let artifact: { aceEdges?: Array<{ sourceFile: string }> };
		try {
			artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));
		} catch {
			return; // artifact may not exist in CI — skip gracefully
		}
		if (!artifact.aceEdges) return; // older artifact without the field — skip
		const ACE_FILES = [
			'context-assembler.ts', 'multi-lane-retrieval.ts', 'retrieval-lanes.ts',
			'cache-keys.ts', 'ngram-retrieval.ts', 'error-fingerprint.ts',
			'graph-expander.ts', 'qdrant-manager.ts', 'gemma4-agent.ts',
			'trace-subagent-orchestrator.ts', 'synthesis-memory-archiver.ts', 'dual-embedder.ts',
		];
		const basenames = new Set(
			artifact.aceEdges.map(e => (e.sourceFile ?? '').replace(/\\/g, '/').split('/').pop())
		);
		const matched = ACE_FILES.filter(f => basenames.has(f));
		expect(matched.length).toBe(12);
	});
});
