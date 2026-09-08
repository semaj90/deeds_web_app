import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';

export const ROUTE_HEAD_DECISION_V1_SCHEMA = 'parent-atlas.route-head-decision.v1' as const;

export const ROUTE_HEAD_ACTIONS_V1 = [
	'STOP',
	'AST_EXPAND',
	'CALL_GRAPH_EXPAND',
	'ONTOLOGY_EXPAND',
	'HYPEREDGE_EXPAND',
	'SEMANTIC_EXPAND',
	'LANGEXTRACT',
	'MXBAI_ESCALATE',
	'ORNITH_ESCALATE',
] as const;

export const RouteHeadActionV1Schema = z.enum(ROUTE_HEAD_ACTIONS_V1);
export type RouteHeadActionV1 = z.infer<typeof RouteHeadActionV1Schema>;

const routeHeadDecisionBodySchema = z
	.object({
		schema: z.literal(ROUTE_HEAD_DECISION_V1_SCHEMA),
		requestId: z.string().trim().min(1),
		candidateSnapshotRevision: z.string().trim().min(1),
		ordinalMapChecksum: sha256HexSchema,
		featureSnapshotRevision: z.string().trim().min(1),
		modelRevision: z.string().trim().min(1),
		routeRevision: z.string().trim().min(1),
		action: RouteHeadActionV1Schema,
		confidence: z.number().finite().min(0).max(1),
		evidenceRefs: z.array(z.string().trim().min(1)).min(1).max(64),
		candidateOrdinals: z.array(z.number().int().nonnegative()).max(128),
		/** The model proposes; deterministic code owns execution and validation. */
		canonicalAuthority: z.literal(false),
		executionDelegated: z.literal(true),
	})
	.strict()
	.superRefine((value, ctx) => {
		if (new Set(value.candidateOrdinals).size !== value.candidateOrdinals.length) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['candidateOrdinals'],
				message: 'ROUTE_HEAD_DUPLICATE_CANDIDATE_ORDINAL',
			});
		}
		if (value.action !== 'STOP' && value.candidateOrdinals.length === 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['candidateOrdinals'],
				message: 'ROUTE_HEAD_ACTION_REQUIRES_CANDIDATE_ORDINAL',
			});
		}
	});

const routeHeadDecisionSchema = routeHeadDecisionBodySchema.extend({ checksum: sha256HexSchema });
export const RouteHeadDecisionV1Schema = routeHeadDecisionSchema;
export type RouteHeadDecisionV1 = z.infer<typeof RouteHeadDecisionV1Schema>;
export type RouteHeadDecisionInputV1 = z.input<typeof routeHeadDecisionBodySchema>;

export interface RouteHeadExecutionContextV1 {
	requestId: string;
	candidateSnapshotRevision: string;
	ordinalMapChecksum: string;
	featureSnapshotRevision: string;
}

export type RouteHeadExecutionAdmissionV1 =
	| {
			status: 'ADMITTED';
			action: RouteHeadActionV1;
			candidateOrdinals: readonly number[];
			decisionChecksum: string;
			executor: 'DETERMINISTIC_DAG_BUILDER';
			canonicalWritesAllowed: false;
	  }
	| {
			status: 'REJECTED';
			reason:
				| 'INVALID_DECISION'
				| 'REQUEST_REVISION_MISMATCH'
				| 'CANDIDATE_SNAPSHOT_REVISION_MISMATCH'
				| 'ORDINAL_MAP_CHECKSUM_MISMATCH'
				| 'FEATURE_SNAPSHOT_REVISION_MISMATCH';
			executor: 'DETERMINISTIC_DAG_BUILDER';
			canonicalWritesAllowed: false;
	  };

export type RouteHeadExecutionRejectionReasonV1 = Extract<
	RouteHeadExecutionAdmissionV1,
	{ status: 'REJECTED' }
>['reason'];

export function buildRouteHeadDecisionV1(input: RouteHeadDecisionInputV1): RouteHeadDecisionV1 {
	const body = routeHeadDecisionBodySchema.parse(input);
	return RouteHeadDecisionV1Schema.parse({ ...body, checksum: canonicalSha256V1(body) });
}

export function verifyRouteHeadDecisionV1(value: unknown): RouteHeadDecisionV1 {
	const parsed = RouteHeadDecisionV1Schema.parse(value);
	const { checksum, ...body } = parsed;
	if (checksum !== canonicalSha256V1(body)) throw new Error('ROUTE_HEAD_DECISION_CHECKSUM_MISMATCH');
	return parsed;
}

/**
 * Validate a model proposal against the exact execution snapshot before a
 * future DAG builder can dispatch a helper. This only admits or rejects; it
 * never executes an action or mutates a store.
 */
export function admitRouteHeadDecisionV1(
	value: unknown,
	context: RouteHeadExecutionContextV1,
): RouteHeadExecutionAdmissionV1 {
	let decision: RouteHeadDecisionV1;
	try {
		decision = verifyRouteHeadDecisionV1(value);
	} catch {
		return { status: 'REJECTED', reason: 'INVALID_DECISION', executor: 'DETERMINISTIC_DAG_BUILDER', canonicalWritesAllowed: false };
	}
	if (decision.requestId !== context.requestId) {
		return { status: 'REJECTED', reason: 'REQUEST_REVISION_MISMATCH', executor: 'DETERMINISTIC_DAG_BUILDER', canonicalWritesAllowed: false };
	}
	if (decision.candidateSnapshotRevision !== context.candidateSnapshotRevision) {
		return { status: 'REJECTED', reason: 'CANDIDATE_SNAPSHOT_REVISION_MISMATCH', executor: 'DETERMINISTIC_DAG_BUILDER', canonicalWritesAllowed: false };
	}
	if (decision.ordinalMapChecksum !== context.ordinalMapChecksum) {
		return { status: 'REJECTED', reason: 'ORDINAL_MAP_CHECKSUM_MISMATCH', executor: 'DETERMINISTIC_DAG_BUILDER', canonicalWritesAllowed: false };
	}
	if (decision.featureSnapshotRevision !== context.featureSnapshotRevision) {
		return { status: 'REJECTED', reason: 'FEATURE_SNAPSHOT_REVISION_MISMATCH', executor: 'DETERMINISTIC_DAG_BUILDER', canonicalWritesAllowed: false };
	}
	return {
		status: 'ADMITTED',
		action: decision.action,
		candidateOrdinals: decision.candidateOrdinals,
		decisionChecksum: decision.checksum,
		executor: 'DETERMINISTIC_DAG_BUILDER',
		canonicalWritesAllowed: false,
	};
}
