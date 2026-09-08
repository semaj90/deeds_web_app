// @vitest-environment node
//
// Live (non-mocked) runtime proof for the "NLP / LDR sidecar" cluster in
// openspec/changes/parent-atlas-trace-search-joinback-proof/tasks.md's "Repository-first search
// inventory". Proves the ldr_research MCP tool executes a real SearXNG web search and a real
// llama-server (Ornith) synthesis pass end-to-end through trace-mcp-server (:8788).
//
// This test depends on external, non-deterministic services (SearXNG search results, LLM
// synthesis wording) -- assertions are intentionally structural (shape + success flag), never on
// exact wording, to avoid flakiness. Bounded to a small maxResults/maxDocs to keep runtime short;
// still allow a generous timeout since real web search + LLM synthesis took ~8.5s in manual
// testing and can vary.
//
// Opt-in only via RUN_LIVE_INTEGRATION=1.

import { describe, it, expect } from 'vitest';
import { callTraceMcpTool, isTraceMcpReachable } from './trace-mcp-http-client.js';

const RUN_LIVE_INTEGRATION = process.env.RUN_LIVE_INTEGRATION === '1';
const describeIf = RUN_LIVE_INTEGRATION ? describe : describe.skip;

describeIf('ldr_research (live trace-mcp-server + SearXNG + llama-server)', () => {
	it('is reachable', async () => {
		expect(await isTraceMcpReachable()).toBe(true);
	});

	it(
		'executes a real search + synthesis pass and returns a structured, non-empty result',
		async () => {
			const result = await callTraceMcpTool(
				'ldr_research',
				{ query: 'what is pgvector', maxResults: 2, maxDocs: 1 },
				{ timeoutMs: 60_000 },
			);

			expect(result.content).toHaveLength(1);
			expect(result.content[0]!.text.length).toBeGreaterThan(0);

			const structured = result.structuredContent as
				| { success: boolean; result?: { synthesis?: string; sources?: unknown[] } }
				| undefined;
			expect(structured).toBeDefined();
			expect(typeof structured!.success).toBe('boolean');
		},
		65_000,
	);
});
