// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
	validateAtlasEnvelope,
	createInMemoryIdempotencyStore,
	joinIntoFeatureRows,
	type AtlasEnvelopeV1,
	type KnownProducerRegistry,
	type RevisionContext,
} from '../../src/lib/server/atlas/envelope-validator.js';

function makeEnvelope(overrides: Partial<AtlasEnvelopeV1> = {}): AtlasEnvelopeV1 {
	return {
		request_id: 'req-1',
		packet_key: 'pkt:foo',
		source_ref: 'src/foo.ts',
		workspace_revision: 5,
		source_revision: 1,
		representation_revision: 1,
		graph_revision: null,
		producer: 'nlp-sidecar',
		producer_revision: 'v1',
		pass_name: 'ast_extract',
		pass_revision: 'v1',
		ordering_scope: 'none',
		sequence_number: null,
		input_hash: 'a'.repeat(16),
		output_hash: 'b'.repeat(16),
		schema_version: '1.0.0',
		idempotency_key: 'idem-1',
		...overrides,
	};
}

const registry: KnownProducerRegistry = {
	isKnown: (producer, pass) => producer === 'nlp-sidecar' && pass === 'ast_extract',
};

const revisionCtx: RevisionContext = {
	currentWorkspaceRevision: 5,
	identityResolver: (key) => key === 'pkt:foo',
	representationIdResolver: () => 'semantic_768',
	representationRevisionResolver: () => 1,
	graphRevisionResolver: () => null,
};

describe('AtlasEnvelopeValidator', () => {
	it('accepts a well-formed, current, known envelope', () => {
		const store = createInMemoryIdempotencyStore();
		const result = validateAtlasEnvelope(makeEnvelope(), registry, revisionCtx, store);
		expect(result.ok).toBe(true);
		expect(result.duplicate).toBe(false);
	});

	it('rejects an unregistered producer/pass', () => {
		const store = createInMemoryIdempotencyStore();
		const result = validateAtlasEnvelope(
			makeEnvelope({ producer: 'unknown-producer' }),
			registry,
			revisionCtx,
			store,
		);
		expect(result.ok).toBe(false);
		expect(result.failedCheck).toBe('producer_pass_known');
	});

	it('rejects an unresolvable packet_key', () => {
		const store = createInMemoryIdempotencyStore();
		const result = validateAtlasEnvelope(
			makeEnvelope({ packet_key: 'pkt:does-not-exist' }),
			registry,
			revisionCtx,
			store,
		);
		expect(result.ok).toBe(false);
		expect(result.failedCheck).toBe('identity_resolvable');
	});

	it('rejects a stale workspace_revision', () => {
		const store = createInMemoryIdempotencyStore();
		const result = validateAtlasEnvelope(
			makeEnvelope({ workspace_revision: 3 }),
			registry,
			revisionCtx,
			store,
		);
		expect(result.ok).toBe(false);
		expect(result.failedCheck).toBe('revision_current');
	});

	it('treats a repeated idempotency_key as a no-op duplicate, not an error', () => {
		const store = createInMemoryIdempotencyStore();
		const first = validateAtlasEnvelope(makeEnvelope(), registry, revisionCtx, store);
		const second = validateAtlasEnvelope(makeEnvelope(), registry, revisionCtx, store);
		expect(first.ok).toBe(true);
		expect(first.duplicate).toBe(false);
		expect(second.ok).toBe(true);
		expect(second.duplicate).toBe(true);
	});

	it('enforces strictly-increasing sequence_number only when ordering_scope requires it', () => {
		const store = createInMemoryIdempotencyStore();
		const scoped = { ...makeEnvelope(), ordering_scope: 'per-batch' as const };

		const first = validateAtlasEnvelope(
			{ ...scoped, sequence_number: 1, idempotency_key: 'idem-seq-1' },
			registry,
			revisionCtx,
			store,
		);
		expect(first.ok).toBe(true);

		const outOfOrder = validateAtlasEnvelope(
			{ ...scoped, sequence_number: 1, idempotency_key: 'idem-seq-2' },
			registry,
			revisionCtx,
			store,
		);
		expect(outOfOrder.ok).toBe(false);
		expect(outOfOrder.failedCheck).toBe('predecessor_sequence_valid');

		const advancing = validateAtlasEnvelope(
			{ ...scoped, sequence_number: 2, idempotency_key: 'idem-seq-3' },
			registry,
			revisionCtx,
			store,
		);
		expect(advancing.ok).toBe(true);
	});

	it('rejects graph revisions when no frozen graph revision source is wired', () => {
		const store = createInMemoryIdempotencyStore();
		const result = validateAtlasEnvelope(
			makeEnvelope({ graph_revision: 'graph:2026-07-29' }),
			registry,
			{ ...revisionCtx, graphRevisionResolver: undefined },
			store,
		);
		expect(result.ok).toBe(false);
		expect(result.failedCheck).toBe('graph_revision_compatible');
	});

	it('rejects representation revisions when no frozen representation source is wired', () => {
		const store = createInMemoryIdempotencyStore();
		const result = validateAtlasEnvelope(
			makeEnvelope({ representation_revision: 7 }),
			registry,
			{ ...revisionCtx, representationRevisionResolver: undefined },
			store,
		);
		expect(result.ok).toBe(false);
		expect(result.failedCheck).toBe('representation_revision_compatible');
	});

	it('rejects representation ids when no frozen representation id source is wired', () => {
		const store = createInMemoryIdempotencyStore();
		const result = validateAtlasEnvelope(
			makeEnvelope({ representation_id: 'semantic_768' }),
			registry,
			{ ...revisionCtx, representationIdResolver: undefined },
			store,
		);
		expect(result.ok).toBe(false);
		expect(result.failedCheck).toBe('representation_ids_compatible');
	});

	it('rejects mismatched frozen representation ids', () => {
		const store = createInMemoryIdempotencyStore();
		const result = validateAtlasEnvelope(
			makeEnvelope({ representation_id: 'latent_64' }),
			registry,
			revisionCtx,
			store,
		);
		expect(result.ok).toBe(false);
		expect(result.failedCheck).toBe('representation_ids_compatible');
	});

	it('accepts a matching frozen representation id', () => {
		const store = createInMemoryIdempotencyStore();
		const result = validateAtlasEnvelope(
			makeEnvelope({ representation_id: 'semantic_768' }),
			registry,
			revisionCtx,
			store,
		);
		expect(result.ok).toBe(true);
		expect(result.duplicate).toBe(false);
	});

	it('rejects mismatched frozen representation revisions', () => {
		const store = createInMemoryIdempotencyStore();
		const result = validateAtlasEnvelope(
			makeEnvelope({ representation_revision: 7 }),
			registry,
			{ ...revisionCtx, representationRevisionResolver: () => 1 },
			store,
		);
		expect(result.ok).toBe(false);
		expect(result.failedCheck).toBe('representation_revision_compatible');
	});

	it('accepts a matching frozen representation revision', () => {
		const store = createInMemoryIdempotencyStore();
		const result = validateAtlasEnvelope(
			makeEnvelope({ representation_revision: 1 }),
			registry,
			{ ...revisionCtx, representationRevisionResolver: () => 1 },
			store,
		);
		expect(result.ok).toBe(true);
		expect(result.duplicate).toBe(false);
	});

	it('accepts and validates matching graph revisions when a frozen source exists', () => {
		const store = createInMemoryIdempotencyStore();
		const result = validateAtlasEnvelope(
			makeEnvelope({ graph_revision: 'graph:2026-07-29' }),
			registry,
			{ ...revisionCtx, graphRevisionResolver: () => 'graph:2026-07-29' },
			store,
		);
		expect(result.ok).toBe(true);
		expect(result.duplicate).toBe(false);
	});
});

describe('joinIntoFeatureRows — shuffled-delivery replay proof', () => {
	function shuffled<T>(arr: T[], seed: number): T[] {
		// deterministic pseudo-shuffle (no Math.random — reproducible across runs)
		const out = [...arr];
		let s = seed;
		for (let i = out.length - 1; i > 0; i--) {
			s = (s * 1103515245 + 12345) & 0x7fffffff;
			const j = s % (i + 1);
			[out[i], out[j]] = [out[j], out[i]];
		}
		return out;
	}

	it('produces an identical materialized FeatureRow set regardless of arrival order', () => {
		const results = [
			{ envelope: makeEnvelope({ packet_key: 'pkt:a', pass_name: 'ast_extract', idempotency_key: 'a-1' }), payload: { ast: true } },
			{ envelope: makeEnvelope({ packet_key: 'pkt:a', pass_name: 'minilm_rerank', idempotency_key: 'a-2' }), payload: { score: 0.9 } },
			{ envelope: makeEnvelope({ packet_key: 'pkt:b', pass_name: 'ast_extract', idempotency_key: 'b-1' }), payload: { ast: true } },
			{ envelope: makeEnvelope({ packet_key: 'pkt:b', pass_name: 'pagerank', idempotency_key: 'b-2' }), payload: { score: 0.5 } },
		];
		const required = ['ast_extract', 'minilm_rerank', 'pagerank'];

		const baseline = joinIntoFeatureRows(results, required);

		for (let seed = 1; seed <= 5; seed++) {
			const permuted = joinIntoFeatureRows(shuffled(results, seed), required);
			expect(permuted).toEqual(baseline);
		}

		// pkt:a is missing pagerank, pkt:b is missing minilm_rerank — both flagged, not blocking
		const a = baseline.find((r) => r.packet_key === 'pkt:a')!;
		const b = baseline.find((r) => r.packet_key === 'pkt:b')!;
		expect(a.missingMask).toEqual({ pagerank: true });
		expect(b.missingMask).toEqual({ minilm_rerank: true });
	});
});
