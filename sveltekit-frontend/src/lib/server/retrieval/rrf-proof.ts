import { createHash } from 'node:crypto';
import { z } from 'zod';
import { combineViaRRF, type ContextHit } from './rrf-combiner.js';
import { normalizeCanonicalIdentity } from './rrf-integration.js';

export interface RetrievalOneVotePerLaneProofReceipt {
	receipt_id: string;
	proof_gate: 'RRF_ONE_VOTE_PER_LANE_WIRED';
	canonical_identity_field: 'packet_key';
	lane_count: number;
	candidate_count: number;
	breakdown_count: number;
	sources: string[];
	test_command: string;
	evidence_refs: string[];
	created_at: string;
}

export interface RetrievalRrfProofSnapshot {
	generated_at: string;
	summary: {
		total: number;
		oneVotePerLane: boolean;
	};
	receipts: RetrievalOneVotePerLaneProofReceipt[];
}

const ReceiptSchema = z
	.object({
		receipt_id: z.string().min(1),
		proof_gate: z.literal('RRF_ONE_VOTE_PER_LANE_WIRED'),
		canonical_identity_field: z.literal('packet_key'),
		lane_count: z.number().int().positive(),
		candidate_count: z.number().int().positive(),
		breakdown_count: z.number().int().positive(),
		sources: z.array(z.string().min(1)).min(1),
		test_command: z.string().min(1),
		evidence_refs: z.array(z.string().min(1)),
		created_at: z.string().datetime(),
	})
	.strict();

export const RetrievalRrfProofSnapshotSchema = z
	.object({
		generated_at: z.string().datetime(),
		summary: z
			.object({
				total: z.number().int().nonnegative(),
				oneVotePerLane: z.boolean(),
			})
			.strict(),
		receipts: z.array(ReceiptSchema),
	})
	.strict();

function buildProofReceipt(): RetrievalOneVotePerLaneProofReceipt {
	const qdrantLane: ContextHit[] = [
		{ id: 'qdrant-point-1', source: 'qdrant_vector', score: 0.95, metadata: { packet_key: 'pkt:shared' } },
		{ id: 'qdrant-point-2', source: 'qdrant_vector', score: 0.80, metadata: { packet_key: 'pkt:shared' } },
	];
	const turbovecLane: ContextHit[] = [
		{ id: 'turbovec-candidate-9', source: 'turbovec_ann', score: 0.70, metadata: { packet_key: 'pkt:shared' } },
	];
	const laneNames = ['qdrant_vector', 'turbovec_ann'] as const;
	const normalized = [qdrantLane, turbovecLane].map(normalizeCanonicalIdentity);
	const result = combineViaRRF(normalized, [...laneNames], { deduplicateBy: 'id' });
	const top = result[0];
	if (!top) {
		throw new Error('Unable to build retrieval proof receipt: no fused candidate produced');
	}
	if (top.id !== 'pkt:shared' || top.sources.length !== 2 || top.breakdown.length !== 2) {
		throw new Error('Unable to build retrieval proof receipt: one-vote-per-lane invariant not satisfied');
	}

	const seed = {
		proof_gate: 'RRF_ONE_VOTE_PER_LANE_WIRED' as const,
		canonical_identity_field: 'packet_key' as const,
		lane_count: top.sources.length,
		candidate_count: result.length,
		breakdown_count: top.breakdown.length,
		sources: top.sources,
		test_command:
			'npm exec -- vitest run sveltekit-frontend/src/lib/server/retrieval/__tests__/rrf-canonical-identity.test.ts',
		evidence_refs: [
			'sveltekit-frontend/src/lib/server/retrieval/rrf-combiner.ts',
			'sveltekit-frontend/src/lib/server/retrieval/__tests__/rrf-canonical-identity.test.ts',
		],
	};

	return ReceiptSchema.parse({
		...seed,
		receipt_id: `rrf-one-vote-${createHash('sha256').update(JSON.stringify(seed)).digest('hex').slice(0, 16)}`,
		created_at: new Date(0).toISOString(),
	});
}

export function getRetrievalRrfProofSnapshot(): RetrievalRrfProofSnapshot {
	const receipts = [buildProofReceipt()];
	return RetrievalRrfProofSnapshotSchema.parse({
		generated_at: new Date(0).toISOString(),
		summary: {
			total: receipts.length,
			oneVotePerLane: true,
		},
		receipts,
	});
}
