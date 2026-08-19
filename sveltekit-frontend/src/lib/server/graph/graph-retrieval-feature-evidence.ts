import { z } from 'zod';
import type { CandidateProjectionInput } from '$lib/server/retrieval/retrieval-candidate-feature-matrix-v1.js';

export const GraphRetrievalFeatureEvidenceV1Schema = z
	.object({
		schema: z.literal('atlas.graph-retrieval-feature-evidence.v1'),
		canonicalId: z.string().min(1),
		packetKey: z.string().min(1),
		graphRevision: z.string().min(1),
		projectionRevision: z.string().min(1),
		projectionHash: z.string().min(1),
		projectionName: z.string().min(1),
		authorityNorm: z.number().finite().min(0).max(1).optional(),
		graphDistance: z.number().int().nonnegative().optional(),
		dependencyFanout: z.number().finite().nonnegative().optional(),
		evidenceRefs: z.array(z.string().min(1)).min(1),
		producerRevision: z.string().min(1),
	})
	.strict()
	.superRefine((evidence, ctx) => {
		if (
			evidence.authorityNorm == null &&
			evidence.graphDistance == null &&
			evidence.dependencyFanout == null
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: [],
				message: 'at least one graph retrieval feature must be present',
			});
		}
	});
export type GraphRetrievalFeatureEvidenceV1 = z.infer<typeof GraphRetrievalFeatureEvidenceV1Schema>;

export interface GraphFeatureLineageExpectationV1 {
	graphRevision: string;
	projectionRevision: string;
	projectionHash: string;
	projectionName: string;
}

function assertLineage(
	evidence: GraphRetrievalFeatureEvidenceV1,
	expected: GraphFeatureLineageExpectationV1,
): void {
	for (const field of ['graphRevision', 'projectionRevision', 'projectionHash', 'projectionName'] as const) {
		if (evidence[field] !== expected[field]) {
			throw new Error(
				`graph retrieval feature ${field} mismatch for '${evidence.canonicalId}': ` +
				`expected '${expected[field]}', got '${evidence[field]}'`,
			);
		}
	}
}

/**
 * Compile already-promoted graph evidence into the existing [C,25] slots.
 * This function does not resolve identity and never invents packet_key.
 */
export function compileGraphEvidenceToCandidateFeatures(input: {
	evidence: unknown;
	expectedLineage: GraphFeatureLineageExpectationV1;
}): Pick<CandidateProjectionInput, 'packet_key' | 'authority_norm' | 'graph_distance' | 'dependency_fanout'> {
	const evidence = GraphRetrievalFeatureEvidenceV1Schema.parse(input.evidence);
	assertLineage(evidence, input.expectedLineage);
	return {
		packet_key: evidence.packetKey,
		authority_norm: evidence.authorityNorm,
		graph_distance: evidence.graphDistance,
		dependency_fanout: evidence.dependencyFanout,
	};
}

/** Merge graph evidence into an existing canonical candidate without changing identity. */
export function mergeGraphEvidenceIntoCandidate(
	candidate: CandidateProjectionInput,
	evidenceInput: unknown,
	expectedLineage: GraphFeatureLineageExpectationV1,
): CandidateProjectionInput {
	const graph = compileGraphEvidenceToCandidateFeatures({ evidence: evidenceInput, expectedLineage });
	if (candidate.packet_key !== graph.packet_key) {
		throw new Error(
			`graph evidence packet_key mismatch: candidate='${candidate.packet_key}', evidence='${graph.packet_key}'`,
		);
	}
	return {
		...candidate,
		authority_norm: graph.authority_norm ?? candidate.authority_norm,
		graph_distance: graph.graph_distance ?? candidate.graph_distance,
		dependency_fanout: graph.dependency_fanout ?? candidate.dependency_fanout,
	};
}
