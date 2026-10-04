// @vitest-environment node
/**
 * Guard (NAME-POLICY-01): non-spec server code must not grow NEW hard-coded Gemma chat model
 * literals. Chat/synthesis/tool runtime is Ornith 1.5 on llama-server :8090; resolve the served
 * model via `llama-server-model-resolver.ts` / `SERVER_CHAT_MODEL` (`ai/model-ids.ts`), never by
 * pasting another model-id literal.
 *
 * Flagged literals: `gemma4-rotorquant`, `gemma4-legal-iq4xs`, and a quoted `hforf`.
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
const GEMMA_CHAT_LITERAL = /gemma4-rotorquant|gemma4-legal-iq4xs|['"`]hforf['"`]/;

/** Real Gemma4 artifacts that legitimately keep the name (reason required). */
const ALLOWED_GEMMA_ARTIFACT_FILES: Record<string, string> = {
	'src/lib/server/analysis/vlm-evidence-analyzer.ts':
		'VLM lane (:8085, Gemma4 vision): the literal is the model label written into analysis metadata; Ornith 1.5 has no vision projector.',
	'src/lib/server/ocr/hybrid.ts':
		'VLM lane (:8085): VLM_MODEL env default for vision OCR; a real Gemma4 vision artifact, not the chat/synthesis model.',
	'src/routes/api/persons-of-interest/[id]/face-rerank/+server.ts':
		'VLM lane: the literal appears only in a doc comment naming the Gemma4 vision model used for face-rerank visual reasoning.',
};

/** Frozen 2026-10-03. Shrink only: migrate each file to the resolver, then delete its line. */
const KNOWN_LITERAL_FILES: readonly string[] = [
	'src/lib/server/adapters/service-integrations.ts',
	'src/lib/server/ai/ab-test.ts',
	'src/lib/server/ai/llama-tool-definitions.ts',
	'src/lib/server/ai/openai-facade.ts',
	'src/lib/server/ai/phase101-parent-atlas-packetizer.js',
	'src/lib/server/ai/prompt-packet.ts',
	'src/lib/server/ai/tiered-llm-cache.ts',
	'src/lib/server/analysis/evidence-analysis-pipeline.ts',
	'src/lib/server/atlas/phase101-parent-atlas-packetizer.mjs',
	'src/lib/server/atlas/runtime-registry.ts',
	'src/lib/server/cache/code-llm-index.ts',
	'src/lib/server/cache/semantic-cache.ts',
	'src/lib/server/cache/warm-up.ts',
	'src/lib/server/codeintel/fix-recommender.ts',
	'src/lib/server/db/archived-schemas/additional-tables.ts',
	'src/lib/server/db/schema-postgres.ts',
	'src/lib/server/db/schema/ace-web-crawl.ts',
	'src/lib/server/db/schema/nes-chrom-packets.ts',
	'src/lib/server/db/schema/search-analytics.ts',
	'src/lib/server/evaluation/model-contracts.ts',
	'src/lib/server/features/ai/ace/context-assembler.ts',
	'src/lib/server/features/ai/ace/nes-chrom-packet-service.ts',
	'src/lib/server/features/ai/agents/trace-subagent-orchestrator.ts',
	'src/lib/server/features/ai/ai/gemma4-agent.ts',
	'src/lib/server/features/ai/ai/information-gain-validator.ts',
	'src/lib/server/features/ai/ai/kv-context-controller.ts',
	'src/lib/server/features/ai/ai/token-tracker.ts',
	'src/lib/server/features/cases/deep-research.ts',
	'src/lib/server/features/cases/hypergraph-4d.ts',
	'src/lib/server/features/cases/research-graph-rl.ts',
	'src/lib/server/features/cases/web-research-crawler.ts',
	'src/lib/server/grpc/retrieval-client.ts',
	'src/lib/server/inference/inference-router.ts',
	'src/lib/server/learning/policy-trainer.ts',
	'src/lib/server/llm-router.ts',
	'src/lib/server/llm/gemma4-tool-loop.ts',
	'src/lib/server/ollama-cached.ts',
	'src/lib/server/queue/rabbitmq-manager-fixed.ts',
	'src/lib/server/reconstruction/scene-intent-extractor.ts',
	'src/lib/server/research/research-gain-validator.ts',
	'src/lib/server/research/task-runner.ts',
	'src/lib/server/retrieval/promote-results.ts',
	'src/lib/server/rg-atlas/multi-query.ts',
	'src/lib/server/services/knowledge-search/KnowledgeSearcher.ts',
	'src/lib/server/services/langextract-service.ts',
	'src/lib/server/services/report-auto-populator.ts',
	'src/lib/server/vector-cache.ts',
	'src/lib/server/wiki/wiki-card-writer.ts',
	'src/mcp/server.ts',
	'src/routes/(app)/admin/ast-topology/+page.server.ts',
	'src/routes/(app)/admin/atlas/+page.svelte',
	'src/routes/.well-known/llms.txt/+server.ts',
	'src/routes/api/ace/health/+server.ts',
	'src/routes/api/admin/inference-stats/+server.ts',
	'src/routes/api/analytics/deep-research/+server.ts',
	'src/routes/api/analytics/health/+server.ts',
	'src/routes/api/cache/warm-up/+server.ts',
	'src/routes/api/cline/chat/+server.ts',
	'src/routes/api/codebase-index/evidence-analyze/+server.ts',
	'src/routes/api/evaluation/run-test-suite/+server.ts',
	'src/routes/api/evidence/[id]/analyze/stream/+server.ts',
	'src/routes/api/pgai/analyze/+server.ts',
	'src/routes/api/reconstruction/scene-intent/+server.ts',
];

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
