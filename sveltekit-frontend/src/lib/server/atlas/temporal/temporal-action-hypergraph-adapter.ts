import {
  agentActionEventSchema,
  type AgentActionEventV1,
} from '@deeds/parent-atlas';

import {
  buildAtlasEvent,
  type AtlasEvent,
  type AtlasEventType,
} from '$lib/server/analysis/event-hypergraph-contract.js';

export const TEMPORAL_ACTION_HYPERGRAPH_ADAPTER_REVISION =
  'temporal-action-hypergraph-adapter-v1' as const;

function eventTypeForAction(event: AgentActionEventV1): AtlasEventType {
  const opcode = event.descriptor.opcode;
  if (opcode === 'RUN_TEST' || opcode === 'TYPECHECK') return 'test_execution';
  if (opcode === 'GRAPH_EXPAND') return 'graph_traversal';
  if (opcode === 'RERANK') return 'rerank_decision';
  if (opcode === 'QDRANT_SEARCH' || opcode === 'RG_SEARCH' || opcode === 'QUERY_DOCS') {
    return 'packet_retrieval';
  }
  if (opcode === 'PREFETCH') return 'packet_prefetch';
  return 'tool_call';
}

function requireProvenRevision(
  event: AgentActionEventV1,
  dimension: 'workspace' | 'source',
): string {
  const applicability = event.descriptor.applicability;
  if (!applicability.relevant_dimensions.includes(dimension)) {
    throw new Error(
      `TEMPORAL_HYPERGRAPH_${dimension.toUpperCase()}_REVISION_NOT_RELEVANT:${event.event_id}`,
    );
  }
  const coordinate =
    dimension === 'workspace'
      ? applicability.workspace_revision
      : applicability.source_revision;
  if (coordinate.authority !== 'PROVEN' || coordinate.value === null) {
    throw new Error(
      `TEMPORAL_HYPERGRAPH_${dimension.toUpperCase()}_REVISION_UNPROVEN:${event.event_id}`,
    );
  }
  return coordinate.value;
}

function sourceRefForAction(event: AgentActionEventV1): string {
  const target = event.descriptor.target;
  if (target.resource) return target.resource;
  if (target.canonical_id) return target.canonical_id;
  throw new Error(`TEMPORAL_HYPERGRAPH_SOURCE_REF_MISSING:${event.event_id}`);
}

/**
 * Downstream projection only.
 *
 * `atlas.event.hypergraph.v1` remains the event/hypergraph schema owner and
 * `WorkflowActionEventV1` remains workflow/action identity owner. This adapter
 * does not mint either identity family. It projects only FINALIZED temporal
 * observations with PROVEN workspace/source revisions because the hypergraph
 * contract requires both coordinates and must never receive invented lineage.
 * Representation revision is supplied by the caller from its canonical owner;
 * parameter_revision is intentionally not reused as a representation revision.
 */
export function adaptFinalizedTemporalActionToAtlasEvent(input: {
  event: AgentActionEventV1;
  representationRevision: string;
  canonicalizerRevision: string;
  compilerRevision: string;
}): AtlasEvent {
  const event = agentActionEventSchema.parse(input.event);
  if (event.state !== 'FINALIZED') {
    throw new Error(`TEMPORAL_HYPERGRAPH_EVENT_NOT_FINALIZED:${event.event_id}:${event.state}`);
  }
  if (event.outcome === null) {
    throw new Error(`TEMPORAL_HYPERGRAPH_OUTCOME_MISSING:${event.event_id}`);
  }
  if (!input.representationRevision.trim()) {
    throw new Error(`TEMPORAL_HYPERGRAPH_REPRESENTATION_REVISION_MISSING:${event.event_id}`);
  }

  const workspaceRevision = requireProvenRevision(event, 'workspace');
  const sourceRevision = requireProvenRevision(event, 'source');
  const sourceRef = sourceRefForAction(event);
  const targetId = event.descriptor.target.canonical_id ?? event.descriptor.target.resource!;

  return buildAtlasEvent({
    schemaVersion: 'atlas.event.hypergraph.v1',
    eventType: eventTypeForAction(event),
    sourceRef,
    packetKey: null,
    treeNodeId: null,
    workspaceRevision,
    sourceRevision,
    representationRevision: input.representationRevision,
    producerId: 'parent-atlas-temporal-action-ledger',
    producerRevision: event.producer_revision,
    canonicalizerRevision: input.canonicalizerRevision,
    compilerRevision: input.compilerRevision,
    observedAt: event.observed_at,
    evidenceRefs: [...new Set([
      ...event.evidence_refs,
      ...event.artifact_refs,
      ...(event.result_ref ? [event.result_ref] : []),
    ])],
    participants: [
      {
        entityId: event.workflow_action.workflow_id,
        entityKind: 'workflow',
        role: 'workflow',
      },
      {
        entityId: event.workflow_action.action_id,
        entityKind: 'agent_action',
        role: 'task',
      },
      {
        entityId: targetId,
        entityKind: event.descriptor.target.target_class,
        role: 'target',
      },
      ...(event.result_ref
        ? [{ entityId: event.result_ref, entityKind: 'artifact', role: 'result' as const }]
        : []),
    ],
    metadata: {
      projectionKind: 'temporal_action_history',
      canonicalAuthority: false,
      adapterRevision: TEMPORAL_ACTION_HYPERGRAPH_ADAPTER_REVISION,
      temporalEventId: event.event_id,
      executionKey: event.execution_key,
      ledgerSequence: event.ledger_sequence,
      actionState: event.state,
      actionOutcome: event.outcome,
      opcode: event.descriptor.opcode,
      queryClass: event.descriptor.query_class,
      workflowRevision: event.workflow_action.workflow_revision,
      actionSequence: event.workflow_action.sequence,
      eventChecksum: event.event_checksum,
      revisionAuthority: {
        workspace: event.descriptor.applicability.workspace_revision.authority,
        source: event.descriptor.applicability.source_revision.authority,
        graph: event.descriptor.applicability.graph_revision.authority,
      },
    },
  });
}
