import { z } from 'zod';
import { acePacketV2Schema, type AcePacketV2 } from './ace-packet-v2.js';
import { retrievalActionReceiptSchema, type RetrievalActionReceiptV1 } from './retrieval-action-receipt.js';
import { workflowActionEventSchema, type WorkflowActionEventV1 } from './workflow-action-event.js';

const workflowIdentitySchema = z.object({
  workflowId: z.string().min(1),
  workflowRevision: z.number().int().nonnegative(),
  actionId: z.string().min(1),
  parentActionId: z.string().min(1).optional(),
  dagNodeId: z.string().min(1),
  attempt: z.number().int().positive().default(1),
}).strict();

export type WorkflowIdentityInputV1 = z.infer<typeof workflowIdentitySchema>;

/**
 * Convert an already-materialized retrieval action receipt into the common
 * workflow event. The orchestrator must supply workflow/action/DAG identities;
 * the adapter does not hash a receipt into a fake action identity.
 */
export function retrievalReceiptToWorkflowAction(input: {
  identity: WorkflowIdentityInputV1;
  receipt: RetrievalActionReceiptV1;
  producer_revision: string;
}): WorkflowActionEventV1 {
  const identity = workflowIdentitySchema.parse(input.identity);
  const receipt = retrievalActionReceiptSchema.parse(input.receipt);
  return workflowActionEventSchema.parse({
    ...identity,
    schema: 'atlas.workflow-action.v1',
    sequence: receipt.sequence,
    lane: 'graph',
    transport: 'local',
    kind: 'completed',
    receiptId: receipt.receipt_id,
    resourceRefs: [
      ...receipt.candidate_ids.map((resource_id) => ({ resource_type: 'candidate', resource_id, role: 'candidate', identity_status: 'canonical' as const })),
      ...receipt.relationship_ids.map((resource_id) => ({ resource_type: 'relationship', resource_id, role: 'relationship', identity_status: 'canonical' as const })),
    ],
    evidenceRefs: receipt.retrieved_evidence_refs,
    artifactRefs: [],
    startedAt: receipt.started_at,
    completedAt: receipt.finished_at,
    metadata: {
      retrieval_action: receipt.action,
      before_state: receipt.before_state,
      after_state: receipt.after_state,
      sufficient_after: receipt.sufficient_after,
      source_snapshot_revision_before: receipt.source_snapshot_revision_before,
      source_snapshot_revision_after: receipt.source_snapshot_revision_after,
      executor_refs: receipt.executor_refs,
      requested_entity_types: receipt.requested_entity_types,
      requested_relationship_types: receipt.requested_relationship_types,
      requested_evidence_kinds: receipt.requested_evidence_kinds,
    },
    producerRevision: input.producer_revision,
  });
}

/**
 * Emit an artifact event when a validated AcePacketV2 is assembled. The ACE
 * packet remains the artifact owner; workflow identity still comes from the
 * caller/orchestrator.
 */
export function acePacketToWorkflowArtifact(input: {
  identity: WorkflowIdentityInputV1;
  sequence: number;
  packet: AcePacketV2;
  producer_revision: string;
}): WorkflowActionEventV1 {
  const identity = workflowIdentitySchema.parse(input.identity);
  const packet = acePacketV2Schema.parse(input.packet);
  const resourceRefs: WorkflowActionEventV1['resourceRefs'] = [
    { resource_type: 'packet', resource_id: packet.envelope.packet_key, role: 'packet', identity_status: 'canonical' },
    { resource_type: 'source_ref', resource_id: packet.envelope.canonical_source_ref, role: 'source', identity_status: 'canonical' },
    ...packet.hypergraph.relationship_evidence.map((relationship) => ({
      resource_type: 'relationship',
      resource_id: relationship.relationship_id,
      role: 'relationship',
      identity_status: 'canonical' as const,
    })),
  ];
  if (packet.envelope.feature_id) {
    resourceRefs.push({ resource_type: 'feature', resource_id: packet.envelope.feature_id, role: 'feature', identity_status: 'canonical' });
  }
  const evidenceRefs = [...new Set(packet.hypergraph.relationship_evidence.flatMap((relationship) => relationship.evidence_refs))];

  return workflowActionEventSchema.parse({
    ...identity,
    schema: 'atlas.workflow-action.v1',
    sequence: input.sequence,
    lane: 'materializer',
    transport: 'local',
    kind: 'artifact',
    resourceRefs,
    evidenceRefs,
    artifactRefs: [packet.envelope.packet_key],
    metadata: {
      query_id: packet.hypergraph.query_id,
      packet_revision: packet.packet_revision,
      source_ref: packet.envelope.source_ref,
      source_revision: packet.envelope.source_revision ?? null,
      source_snapshot_revision: packet.hypergraph.lineage.source_snapshot_revision,
      relationship_projection_revision: packet.hypergraph.lineage.relationship_projection_revision ?? null,
      graph_snapshot_revision: packet.hypergraph.lineage.graph_snapshot_revision ?? null,
      semantic_projection_revision: packet.hypergraph.lineage.semantic_projection_revision ?? null,
      semantic_model_revision: packet.hypergraph.lineage.semantic_model_revision ?? null,
      feature_matrix_revision: packet.hypergraph.lineage.feature_matrix_revision ?? null,
    },
    producerRevision: input.producer_revision,
  });
}

export function describeWorkflowActionAdapters(): string {
  return [
    'RetrievalActionReceiptV1 supplies completed retrieval evidence and its canonical receipt ID.',
    'AcePacketV2 supplies validated artifact/resource/relationship/evidence identities.',
    'Neither adapter invents workflow/action/DAG IDs; active orchestrator call sites must provide those runtime-owned identities.',
  ].join(' ');
}
