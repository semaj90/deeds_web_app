import { describe, expect, it } from 'vitest';
import { compileContext, type ContextCandidate } from './context-compiler.parent-atlas.js';

const candidates: ContextCandidate[] = [{
	packet_key: 'packet-1', content: 'retrieval evidence', lanes: ['dense'], score: 1,
	source_ref: 'src/retrieval.ts', token_count: 3,
}];

describe('RLM ContextManifest linkage', () => {
	it('records observable RLM metadata and keeps the manifest deterministic', () => {
		const base = { request_id: 'req-1', candidates, policy: { version: 'policy-r1', token_budget: 100 } };
		const a = compileContext({ ...base, rlm_trace_id: 'trace-1', rlm_depth: 1, rlm_subcalls: 2, rlm_cache_hits: 1, rlm_cache_misses: 0, ace_playbook_revision: 'ace-r1', now: new Date('2026-08-13T00:00:00Z') });
		const b = compileContext({ ...base, rlm_trace_id: 'trace-1', rlm_depth: 1, rlm_subcalls: 2, rlm_cache_hits: 1, rlm_cache_misses: 0, ace_playbook_revision: 'ace-r1', now: new Date('2026-08-14T00:00:00Z') });
		expect(a.manifest.rlm_trace_id).toBe('trace-1');
		expect(a.manifest.ace_playbook_revision).toBe('ace-r1');
		expect(a.manifest.manifest_id).toBe(b.manifest.manifest_id);
	});
});
