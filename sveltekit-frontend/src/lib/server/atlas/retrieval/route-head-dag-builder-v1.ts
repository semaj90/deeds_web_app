import {
	validateContextToolDag,
	type ContextToolDagNodeKind,
	type ContextToolDagV1,
} from '../workflow/context-tool-dag-contracts.js';
import {
	admitRouteHeadDecisionV1,
	type RouteHeadExecutionContextV1,
	type RouteHeadExecutionRejectionReasonV1,
	type RouteHeadActionV1,
} from './route-head-decision-v1.js';

type ExecutableRouteHeadActionV1 = Exclude<RouteHeadActionV1, 'STOP'>;

const ROUTE_HEAD_EXECUTOR_V1: Record<ExecutableRouteHeadActionV1, {
	kind: ContextToolDagNodeKind;
	toolName: string;
}> = {
	AST_EXPAND: { kind: 'CONTEXT_FANOUT', toolName: 'atlas.ast.expand' },
	CALL_GRAPH_EXPAND: { kind: 'CONTEXT_FANOUT', toolName: 'atlas.graph.calls' },
	ONTOLOGY_EXPAND: { kind: 'CONTEXT_FANOUT', toolName: 'atlas.ontology.expand' },
	HYPEREDGE_EXPAND: { kind: 'CONTEXT_FANOUT', toolName: 'atlas.hypergraph.expand' },
	SEMANTIC_EXPAND: { kind: 'RETRIEVAL', toolName: 'atlas.semantic.expand' },
	LANGEXTRACT: { kind: 'MCP_TOOL_CALL', toolName: 'atlas.langextract' },
	MXBAI_ESCALATE: { kind: 'RERANK', toolName: 'atlas.mxbai.rerank' },
	ORNITH_ESCALATE: { kind: 'MCP_TOOL_CALL', toolName: 'atlas.ornith.escalate' },
};

export interface RouteHeadDagBuildContextV1 extends RouteHeadExecutionContextV1 {
	workflowId: string;
	workflowRevision: number;
	workspaceRevision: string;
	graphRevision: string;
	producerRevision: string;
	/** CandidateOrdinal is not identity; this map must resolve it to canonical IDs. */
	canonicalIdsByOrdinal: ReadonlyMap<number, string>;
}

export type RouteHeadDagBuildResultV1 =
	| {
			status: 'BUILT';
			action: ExecutableRouteHeadActionV1;
			decisionChecksum: string;
			dag: ContextToolDagV1;
			executor: 'DETERMINISTIC_DAG_BUILDER';
			canonicalWritesAllowed: false;
	  }
	| {
			status: 'STOP';
			action: 'STOP';
			decisionChecksum: string;
			dag: null;
			executor: 'DETERMINISTIC_DAG_BUILDER';
			canonicalWritesAllowed: false;
	  }
	| {
			status: 'REJECTED';
			reason:
				| RouteHeadExecutionRejectionReasonV1
				| 'INVALID_DAG_CONTEXT'
				| 'CANDIDATE_ORDINAL_UNRESOLVED'
				| 'CANONICAL_ID_COLLISION';
			executor: 'DETERMINISTIC_DAG_BUILDER';
			canonicalWritesAllowed: false;
	  };

type RouteHeadDagRejectionReasonV1 = Extract<RouteHeadDagBuildResultV1, { status: 'REJECTED' }>['reason'];

function rejected(reason: RouteHeadDagRejectionReasonV1): RouteHeadDagBuildResultV1 {
	return { status: 'REJECTED', reason, executor: 'DETERMINISTIC_DAG_BUILDER', canonicalWritesAllowed: false };
}

function canonicalIdsForOrdinals(
	ordinals: readonly number[],
	map: ReadonlyMap<number, string>,
): string[] | RouteHeadDagBuildResultV1 {
	const canonicalIds: string[] = [];
	for (const ordinal of ordinals) {
		const canonicalId = map.get(ordinal);
		if (!canonicalId?.trim()) return rejected('CANDIDATE_ORDINAL_UNRESOLVED');
		canonicalIds.push(canonicalId);
	}
	if (new Set(canonicalIds).size !== canonicalIds.length) return rejected('CANONICAL_ID_COLLISION');
	return canonicalIds;
}

/**
 * Convert an admitted RouteHead proposal into the existing ContextToolDagV1
 * shape. Candidate ordinals are resolved through the supplied ordinal map and
 * are never stringified into identity. The returned DAG is read-only and is
 * not executed by this adapter.
 */
export function buildRouteHeadDagV1(
	value: unknown,
	context: RouteHeadDagBuildContextV1,
): RouteHeadDagBuildResultV1 {
	if (!context.workflowId.trim() || !context.workspaceRevision.trim() || !context.graphRevision.trim() || !context.producerRevision.trim() || !Number.isInteger(context.workflowRevision) || context.workflowRevision < 0) {
		return rejected('INVALID_DAG_CONTEXT');
	}
	const admission = admitRouteHeadDecisionV1(value, context);
	if (admission.status === 'REJECTED') return rejected(admission.reason);
	if (admission.action === 'STOP') {
		return {
			status: 'STOP',
			action: 'STOP',
			decisionChecksum: admission.decisionChecksum,
			dag: null,
			executor: 'DETERMINISTIC_DAG_BUILDER',
			canonicalWritesAllowed: false,
		};
	}
	const canonicalIds = canonicalIdsForOrdinals(admission.candidateOrdinals, context.canonicalIdsByOrdinal);
	if (!Array.isArray(canonicalIds)) return canonicalIds;
	const executor = ROUTE_HEAD_EXECUTOR_V1[admission.action];
	const node = {
		nodeId: `route-head:${admission.action.toLowerCase()}:${admission.decisionChecksum.slice(0, 16)}`,
		kind: executor.kind,
		dependsOn: [],
		canonicalIds,
		toolName: executor.toolName,
		readOnly: true,
		requiresExactPromotion: false,
		requiresValidation: false,
		maxAttempts: 1,
	} as const;
	const dag = validateContextToolDag({
		schema: 'atlas.context-tool-dag.v1',
		workflowId: context.workflowId,
		workflowRevision: context.workflowRevision,
		requestId: context.requestId,
		workspaceRevision: context.workspaceRevision,
		graphRevision: context.graphRevision,
		nodes: [node],
		canonicalWritesAllowed: false,
		producerRevision: context.producerRevision,
	});
	return {
		status: 'BUILT',
		action: admission.action,
		decisionChecksum: admission.decisionChecksum,
		dag,
		executor: 'DETERMINISTIC_DAG_BUILDER',
		canonicalWritesAllowed: false,
	};
}
