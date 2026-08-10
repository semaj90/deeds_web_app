/**
 * AtlasEnvelopeV1 — unordered-execution pass-result contract.
 *
 * Scope: this wraps an async PRODUCER'S RESULT for one pass over one
 * packet_key (e.g. one MiniLM rerank call, one AST-extract call, one
 * PageRank run row) before it is joined/materialized. It answers "is this
 * result current, non-duplicate, and correctly attributed" — NOT "what does
 * a packet look like at rest" (that's `db/packet-topology-envelope.ts`'s
 * PacketTopologyEnvelope, a distinct, already-existing capability — do not
 * merge the two; this module never replaces or wraps that one).
 *
 * Principle (see openspec/changes/parent-atlas-unordered-execution-contract):
 * physical arrival order of async pass results is irrelevant. What must be
 * explicit and validated is identity + revision + idempotency. Joins are
 * keyed by packet_key, never by arrival order.
 *
 * Status: CREATED — implemented and unit-tested with an in-memory registry
 * and a shuffled-delivery replay proof. NOT yet wired into any live
 * producer (NLP sidecar, GPU sidecar, graph-analysis-runner) — that wiring
 * is out of scope for this slice per
 * openspec/changes/parent-atlas-unordered-execution-contract/tasks.md
 * Phase 10's explicit "start with one canonical producer" instruction.
 */
import { z } from 'zod';

export const AtlasEnvelopeV1Schema = z.object({
	request_id: z.string().min(1),
	packet_key: z.string().min(1),
	source_ref: z.string().min(1),
	workspace_revision: z.number().int().nonnegative(),
	source_revision: z.number().int().nonnegative().nullable(),
	representation_id: z.string().min(1).nullable().optional(),
	representation_revision: z.number().int().nonnegative(),
	graph_revision: z.string().nullable(),
	producer: z.string().min(1),
	producer_revision: z.string().min(1),
	pass_name: z.string().min(1),
	pass_revision: z.string().min(1),
	ordering_scope: z.enum(['none', 'per-packet-key', 'per-batch']),
	sequence_number: z.number().int().nonnegative().nullable(),
	input_hash: z.string().min(1),
	output_hash: z.string().min(1),
	schema_version: z.string().min(1),
	idempotency_key: z.string().min(1),
});

export type AtlasEnvelopeV1 = z.infer<typeof AtlasEnvelopeV1Schema>;

export type EnvelopeCheckId =
	| 'schema_valid'
	| 'producer_pass_known'
	| 'identity_resolvable'
	| 'revision_current'
	| 'input_hash_valid'
	| 'output_hash_valid'
	| 'idempotency_duplicate'
	| 'predecessor_sequence_valid'
	| 'representation_ids_compatible'
	| 'representation_revision_compatible'
	| 'graph_revision_compatible';

export interface EnvelopeValidationResult {
	ok: boolean;
	/** true only when the envelope is a legitimate no-op re-delivery, not an error */
	duplicate: boolean;
	failedCheck: EnvelopeCheckId | null;
	reason: string | null;
}

/** Minimal registry contract this validator needs — real callers pass a view
 *  over docs/architecture/runtime-ownership-registry.json (or equivalent
 *  pass registry) rather than this module owning registry parsing itself. */
export interface KnownProducerRegistry {
	isKnown(producer: string, passName: string): boolean;
}

export interface RevisionContext {
	/** The currently-frozen workspace_revision to validate against. */
	currentWorkspaceRevision: number;
	/** packet_key -> true if resolvable against canonical identity (atlas_packets). */
	identityResolver: (packetKey: string) => boolean;
	/** Optional frozen representation_id source (e.g. a registry snapshot). */
	representationIdResolver?: () => string | null;
	/** Optional frozen representation revision source (e.g. a lane snapshot or registry version). */
	representationRevisionResolver?: () => number | null;
	/** Optional frozen graph revision source (e.g. a topology snapshot hash). */
	graphRevisionResolver?: () => string | null;
}

/** In-memory idempotency-key + per-scope sequence tracker. Real deployment
 *  would back this with Redis; kept swappable via the same interface. */
export interface IdempotencyStore {
	has(key: string): boolean;
	remember(key: string): void;
	lastSequence(scopeKey: string): number | null;
	recordSequence(scopeKey: string, seq: number): void;
}

export function createInMemoryIdempotencyStore(): IdempotencyStore {
	const seen = new Set<string>();
	const sequences = new Map<string, number>();
	return {
		has: (key) => seen.has(key),
		remember: (key) => void seen.add(key),
		lastSequence: (scopeKey) => sequences.get(scopeKey) ?? null,
		recordSequence: (scopeKey, seq) => void sequences.set(scopeKey, seq),
	};
}

/**
 * AtlasEnvelopeValidator — the 10 checks from design.md D3, in order.
 * Short-circuits on first failure (except duplicate, which is a distinct
 * non-error outcome per the QUIC-retry-analogue in the spec).
 */
export function validateAtlasEnvelope(
	raw: unknown,
	registry: KnownProducerRegistry,
	revisionCtx: RevisionContext,
	idempotency: IdempotencyStore,
): EnvelopeValidationResult {
	// 1. schema valid
	const parsed = AtlasEnvelopeV1Schema.safeParse(raw);
	if (!parsed.success) {
		return { ok: false, duplicate: false, failedCheck: 'schema_valid', reason: parsed.error.message };
	}
	const env = parsed.data;

	// 2. producer/pass known
	if (!registry.isKnown(env.producer, env.pass_name)) {
		return {
			ok: false,
			duplicate: false,
			failedCheck: 'producer_pass_known',
			reason: `unregistered producer/pass: ${env.producer}/${env.pass_name}`,
		};
	}

	// 3. canonical identity resolvable
	if (!revisionCtx.identityResolver(env.packet_key)) {
		return {
			ok: false,
			duplicate: false,
			failedCheck: 'identity_resolvable',
			reason: `packet_key not resolvable: ${env.packet_key}`,
		};
	}

	// 4. revision current
	if (env.workspace_revision < revisionCtx.currentWorkspaceRevision) {
		return {
			ok: false,
			duplicate: false,
			failedCheck: 'revision_current',
			reason: `stale workspace_revision ${env.workspace_revision} < ${revisionCtx.currentWorkspaceRevision}`,
		};
	}

	// 5. input hash valid (well-formed, non-empty — deeper content check is a
	//    caller concern since only the caller knows the expected input)
	if (env.input_hash.length < 8) {
		return { ok: false, duplicate: false, failedCheck: 'input_hash_valid', reason: 'input_hash too short' };
	}

	// 6. output hash valid
	if (env.output_hash.length < 8) {
		return { ok: false, duplicate: false, failedCheck: 'output_hash_valid', reason: 'output_hash too short' };
	}

	// 7. duplicate idempotency key -> no-op, not an error
	if (idempotency.has(env.idempotency_key)) {
		return { ok: true, duplicate: true, failedCheck: null, reason: 'idempotency_key already materialized' };
	}

	// 8. predecessor sequence valid — only when ordering_scope requires it
	if (env.ordering_scope !== 'none') {
		if (env.sequence_number === null) {
			return {
				ok: false,
				duplicate: false,
				failedCheck: 'predecessor_sequence_valid',
				reason: 'ordering_scope requires sequence_number',
			};
		}
		const scopeKey = `${env.ordering_scope}:${env.packet_key}`;
		const last = idempotency.lastSequence(scopeKey);
		if (last !== null && env.sequence_number <= last) {
			return {
				ok: false,
				duplicate: false,
				failedCheck: 'predecessor_sequence_valid',
				reason: `sequence_number ${env.sequence_number} not greater than last seen ${last}`,
			};
		}
		idempotency.recordSequence(scopeKey, env.sequence_number);
	}

	// 9. representation IDs compatible — fail-closed until a frozen source is wired.
	if (env.representation_id !== undefined && env.representation_id !== null) {
		const currentRepresentationId = revisionCtx.representationIdResolver?.() ?? null;
		if (currentRepresentationId === null) {
			return {
				ok: false,
				duplicate: false,
				failedCheck: 'representation_ids_compatible',
				reason: 'representation_id provided but no frozen representation id source is wired',
			};
		}
		if (env.representation_id !== currentRepresentationId) {
			return {
				ok: false,
				duplicate: false,
				failedCheck: 'representation_ids_compatible',
				reason: `representation_id ${env.representation_id} does not match frozen ${currentRepresentationId}`,
			};
		}
	}

	// 9b. representation revisions compatible — fail-closed until a frozen source is wired.
	if (env.representation_revision !== null) {
		const currentRepresentationRevision = revisionCtx.representationRevisionResolver?.() ?? null;
		if (currentRepresentationRevision === null) {
			return {
				ok: false,
				duplicate: false,
				failedCheck: 'representation_revision_compatible',
				reason: 'representation_revision provided but no frozen representation revision source is wired',
			};
		}
		if (env.representation_revision !== currentRepresentationRevision) {
			return {
				ok: false,
				duplicate: false,
				failedCheck: 'representation_revision_compatible',
				reason: `representation_revision ${env.representation_revision} does not match frozen ${currentRepresentationRevision}`,
			};
		}
	}

	// 10. graph revision compatible — only checked when the pass consumed
	//     graph topology (graph_revision non-null).
	if (env.graph_revision !== null) {
		const currentGraphRevision = revisionCtx.graphRevisionResolver?.() ?? null;
		if (!currentGraphRevision) {
			return {
				ok: false,
				duplicate: false,
				failedCheck: 'graph_revision_compatible',
				reason: 'graph_revision provided but no frozen graph revision source is wired',
			};
		}
		if (env.graph_revision !== currentGraphRevision) {
			return {
				ok: false,
				duplicate: false,
				failedCheck: 'graph_revision_compatible',
				reason: `graph_revision ${env.graph_revision} does not match frozen ${currentGraphRevision}`,
			};
		}
	}

	idempotency.remember(env.idempotency_key);
	return { ok: true, duplicate: false, failedCheck: null, reason: null };
}

export interface FeatureRowLike {
	packet_key: string;
	features: Record<string, unknown>;
	missingMask: Record<string, true>;
}

/**
 * Joins validated envelope+payload pairs into per-packet_key rows,
 * regardless of arrival order. A feature absent at join time is flagged in
 * missingMask, never blocks materialization of the row.
 */
export function joinIntoFeatureRows(
	results: Array<{ envelope: AtlasEnvelopeV1; payload: Record<string, unknown> }>,
	requiredFeatures: string[],
): FeatureRowLike[] {
	const byKey = new Map<string, FeatureRowLike>();
	for (const { envelope, payload } of results) {
		let row = byKey.get(envelope.packet_key);
		if (!row) {
			row = { packet_key: envelope.packet_key, features: {}, missingMask: {} };
			byKey.set(envelope.packet_key, row);
		}
		row.features[envelope.pass_name] = payload;
	}
	for (const row of byKey.values()) {
		for (const feature of requiredFeatures) {
			if (!(feature in row.features)) row.missingMask[feature] = true;
		}
	}
	return [...byKey.values()].sort((a, b) => (a.packet_key < b.packet_key ? -1 : a.packet_key > b.packet_key ? 1 : 0));
}
