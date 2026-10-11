import { z } from 'zod';
import { acePacketV2Schema, type AcePacketV2 } from './ace-packet-v2.js';
import { instructionCardV1Schema, type InstructionCardV1 } from './instruction-card-v1.js';
import { retrievalActionReceiptSchema, type RetrievalActionReceiptV1 } from './retrieval-action-receipt.js';
import {
  WORKFLOW_ACTION_LANES,
  WORKFLOW_ACTION_TRANSPORTS,
  workflowActionEventSchema,
  type WorkflowActionEventV1,
} from './workflow-action-event.js';

const workflowIdentitySchema = z.object({
  runId: z.string().min(1),
  workflowId: z.string().min(1),
  workflowRevision: z.number().int().nonnegative(),
  actionId: z.string().min(1),
  parentActionId: z.string().min(1).optional(),
  dagNodeId: z.string().min(1),
  attempt: z.number().int().positive().default(1),
}).strict();

const retrievalWorkflowContextSchema = z.object({
  workflowSequence: z.number().int().nonnegative(),
  lane: z.enum(WORKFLOW_ACTION_LANES),
  transport: z.enum(WORKFLOW_ACTION_TRANSPORTS).optional(),
  toolId: z.string().min(1).optional(),
}).strict();

export type WorkflowIdentityInputV1 = z.infer<typeof workflowIdentitySchema>;
export type RetrievalWorkflowContextV1 = z.infer<typeof retrievalWorkflowContextSchema>;

/**
 * Convert an already-materialized retrieval action receipt into the common
 * workflow event. The orchestrator owns global event ordering and the actual
 * execution lane/transport/tool identity. RetrievalActionReceipt.sequence is a
 * retrieval-loop sequence only and is retained in metadata instead of being
 * conflated with WorkflowActionEvent.sequence.
 */
export function retrievalReceiptToWorkflowAction(input: {
  identity: WorkflowIdentityInputV1;
  workflow: RetrievalWorkflowContextV1;
  receipt: RetrievalActionReceiptV1;
  producer_revision: string;
}): WorkflowActionEventV1 {
  const identity = workflowIdentitySchema.parse(input.identity);
  const workflow = retrievalWorkflowContextSchema.parse(input.workflow);
  const receipt = retrievalActionReceiptSchema.parse(input.receipt);

  // candidate_ids are revision-scoped derived retrieval objects. Do not expose
  // them as canonical runtime resources or atlas_evidence_entities join keys.
  const resourceRefs: WorkflowActionEventV1['resourceRefs'] = [
    ...receipt.relationship_ids.map((resource_id) => ({
      resource_type: 'relationship',
      resource_id,
      role: 'relationship',
      identity_status: 'canonical' as const,
    })),
  ];

  return workflowActionEventSchema.parse({
    ...identity,
    schema: 'atlas.workflow-action.v1',
    sequence: workflow.workflowSequence,
    lane: workflow.lane,
    transport: workflow.transport,
    kind: 'completed',
    toolId: workflow.toolId,
    receiptId: receipt.receipt_id,
    resourceRefs,
    evidenceRefs: receipt.retrieved_evidence_refs,
    artifactRefs: [],
    startedAt: receipt.started_at,
    completedAt: receipt.finished_at,
    metadata: {
      retrieval_sequence: receipt.sequence,
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
      candidate_ids: receipt.candidate_ids,
    },
    producerRevision: input.producer_revision,
  });
}

/**
 * Emit an artifact event when a validated AcePacketV2 is assembled. The ACE
 * packet remains the artifact owner; workflow identity and sequence still come
 * from the caller/orchestrator.
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
      // Keep the complete, schema-validated n-ary evidence when crossing into
      // the workflow event. Relationship participants/revisions are evidence
      // payload, not new workflow or packet identities.
      hyperedge_evidence: packet.hypergraph.relationship_evidence.map((relationship) => ({ ...relationship })),
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

/**
 * Read-only: announce an InstructionCardV1 as a `scheduled` workflow event.
 * The card is a NOT_ADMITTED reference descriptor, so this never implies
 * admission or execution; the orchestrator still owns identity and sequence.
 */
export function instructionCardToWorkflowAction(input: {
  identity: WorkflowIdentityInputV1;
  sequence: number;
  card: InstructionCardV1;
  producer_revision: string;
}): WorkflowActionEventV1 {
  const identity = workflowIdentitySchema.parse(input.identity);
  const card = instructionCardV1Schema.parse(input.card);
  if (identity.actionId !== card.actionId) {
    throw new Error(`INSTRUCTION_CARD_WORKFLOW_ACTION_MISMATCH:${card.actionId}`);
  }
  return workflowActionEventSchema.parse({
    ...identity,
    schema: 'atlas.workflow-action.v1',
    sequence: input.sequence,
    lane: 'planner',
    transport: 'local',
    kind: 'scheduled',
    resourceRefs: [{ resource_type: 'packet', resource_id: card.packetKey, role: 'packet', identity_status: 'canonical' }],
    evidenceRefs: [],
    artifactRefs: [card.instructionCardId],
    revisions: { workspace: card.workspaceRevision, source: card.sourceRevision },
    metadata: {
      instruction_card_id: card.instructionCardId,
      descriptor_revision: card.descriptorRevision,
      execution_binding_checksum: card.executionBindingChecksum,
      algorithm_manifest_checksum: card.algorithmExecutionManifestChecksum,
      required_capability_ids: card.requiredCapabilityIds,
      device_class: card.deviceClass,
      admission_status: card.admissionStatus,
    },
    producerRevision: input.producer_revision,
  });
}

export const RESIDENCY_STATES = [
  'QUEUED', 'DEQUEUED', 'EVIDENCE_CHECK', 'PREFETCHING', 'RESIDENT',
  'EXECUTING', 'READBACK', 'RELEASED', 'BLOCKED', 'FAILED',
] as const;
export const RESIDENCY_EXECUTORS = ['CPU', 'CUDA', 'LLAMA_SERVER'] as const;

const RESIDENCY_STATE_TO_KIND = {
  QUEUED: 'scheduled',
  DEQUEUED: 'started',
  EVIDENCE_CHECK: 'progress',
  PREFETCHING: 'progress',
  RESIDENT: 'progress',
  EXECUTING: 'progress',
  READBACK: 'progress',
  RELEASED: 'completed',
  BLOCKED: 'blocked',
  FAILED: 'failed',
} as const satisfies Record<(typeof RESIDENCY_STATES)[number], WorkflowActionEventV1['kind']>;

const residencyTransitionSchema = z.object({
  sequence: z.number().int().nonnegative(),
  state: z.enum(RESIDENCY_STATES),
  executor: z.enum(RESIDENCY_EXECUTORS),
  materializationId: z.string().min(1),
  generation: z.number().int().nonnegative(),
  packetKey: z.string().min(1).optional(),
  featureId: z.string().min(1).optional(),
  instructionRevision: z.string().min(1).optional(),
  receiptId: z.string().min(1).optional(),
  reasonCode: z.string().min(1).optional(),
}).strict();

export type ResidencyTransitionV1 = z.infer<typeof residencyTransitionSchema>;

/**
 * Map a tensor-residency/execution state transition onto the common workflow
 * event. Residency state is lossless in metadata; materializationId and
 * generation are derived-cache descriptors, never canonical resourceRefs.
 * RELEASED requires a receiptId and FAILED a reasonCode (schema enforced).
 */
export function residencyTransitionToWorkflowAction(input: {
  identity: WorkflowIdentityInputV1;
  transition: ResidencyTransitionV1;
  producer_revision: string;
}): WorkflowActionEventV1 {
  const identity = workflowIdentitySchema.parse(input.identity);
  const t = residencyTransitionSchema.parse(input.transition);
  const resourceRefs: WorkflowActionEventV1['resourceRefs'] = [];
  if (t.packetKey) resourceRefs.push({ resource_type: 'packet', resource_id: t.packetKey, role: 'packet', identity_status: 'canonical' });
  if (t.featureId) resourceRefs.push({ resource_type: 'feature', resource_id: t.featureId, role: 'feature', identity_status: 'canonical' });

  return workflowActionEventSchema.parse({
    ...identity,
    schema: 'atlas.workflow-action.v1',
    sequence: t.sequence,
    lane: t.executor === 'CUDA' ? 'gpu' : 'tool',
    transport: 'local',
    kind: RESIDENCY_STATE_TO_KIND[t.state],
    receiptId: t.receiptId,
    errorCode: t.state === 'FAILED' ? t.reasonCode : undefined,
    resourceRefs,
    evidenceRefs: [],
    artifactRefs: [],
    metadata: {
      residency_state: t.state,
      executor: t.executor,
      materialization_id: t.materializationId,
      generation: t.generation,
      instruction_revision: t.instructionRevision ?? null,
      reason_code: t.reasonCode ?? null,
    },
    producerRevision: input.producer_revision,
  });
}

export function describeWorkflowActionAdapters(): string {
  return [
    'RetrievalActionReceiptV1 supplies completed retrieval evidence and its canonical receipt ID.',
    'The active orchestrator supplies WorkflowActionEvent sequence, lane, transport, tool and DAG/action identities.',
    'Retrieval-loop sequence remains metadata and revision-scoped candidate IDs never enter canonical runtime resourceRefs.',
    'AcePacketV2 supplies validated artifact/resource/relationship/evidence identities without transferring packet identity ownership to the workflow adapter.',
  ].join(' ');
}
