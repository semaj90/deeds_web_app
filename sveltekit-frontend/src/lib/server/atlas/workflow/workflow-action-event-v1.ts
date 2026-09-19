export const WORKFLOW_LANES = [
  'planner',
  'lexical',
  'ast',
  'semantic',
  'graph',
  'gpu',
  'tool',
  'validator',
  'materializer',
  'acp',
  'a2a'
] as const;

export type WorkflowLane = (typeof WORKFLOW_LANES)[number];

export const WORKFLOW_TRANSPORTS = ['local', 'grpc', 'rabbitmq', 'acp', 'a2a'] as const;
export type WorkflowTransport = (typeof WORKFLOW_TRANSPORTS)[number];

export const WORKFLOW_EVENT_KINDS = [
  'scheduled',
  'started',
  'progress',
  'artifact',
  'blocked',
  'retrying',
  'completed',
  'failed'
] as const;
export type WorkflowEventKind = (typeof WORKFLOW_EVENT_KINDS)[number];

export const WORKFLOW_ACTION_STATES = [
  'queued',
  'running',
  'waiting',
  'blocked',
  'succeeded',
  'failed'
] as const;
export type WorkflowActionState = (typeof WORKFLOW_ACTION_STATES)[number];

export const WORKFLOW_VISUAL_STATIONS = [
  'error-bay',
  'bitfrost',
  'ontology',
  'gpu',
  'acp',
  'a2a'
] as const;

export const WORKFLOW_VISUAL_ANIMATIONS = [
  'Idle',
  'Walk',
  'Work',
  'Inspect',
  'Repair',
  'Celebrate',
  'Error'
] as const;

export interface WorkflowProgressV1 {
  completedUnits?: number;
  totalUnits?: number;
  fraction?: number;
  etaMs?: number;
  confidence?: number;
}

export interface WorkflowActionEventV1 {
  schema: 'atlas.workflow-action.v1';
  workflowId: string;
  workflowRevision: number;
  sequence: number;
  actionId: string;
  parentActionId?: string;
  dagNodeId: string;
  attempt: number;
  lane: WorkflowLane;
  transport?: WorkflowTransport;
  kind: WorkflowEventKind;
  state: WorkflowActionState;
  operation: string;
  progress?: WorkflowProgressV1;
  target?: {
    canonicalId?: string;
    resource?: string;
  };
  evidenceRefs?: string[];
  artifactRefs?: string[];
  /** Optional accounting metadata for OpenSpec/agent run receipts. */
  tokensUsed?: number;
  /** Source files changed by the run; distinct from generated artifactRefs. */
  filesEdited?: string[];
  /** OpenSpec change that owns the run receipt, when applicable. */
  openspecChange?: string;
  startedAt?: string;
  emittedAt: string;
  finishedAt?: string;
  /** Presentation hint only. Never infer durable workflow truth from this field. */
  visual?: {
    station: (typeof WORKFLOW_VISUAL_STATIONS)[number];
    animation: (typeof WORKFLOW_VISUAL_ANIMATIONS)[number];
    fx?: string;
  };
}

export type WorkflowActionEventDraftV1 = Omit<
  WorkflowActionEventV1,
  'schema' | 'workflowRevision' | 'sequence' | 'emittedAt'
> & {
  emittedAt?: string;
};

export interface WorkflowEventValidationResult {
  ok: boolean;
  errors: string[];
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function validateWorkflowActionEvent(event: WorkflowActionEventV1): WorkflowEventValidationResult {
  const errors: string[] = [];

  if (event.schema !== 'atlas.workflow-action.v1') errors.push('schema must be atlas.workflow-action.v1');
  if (!event.workflowId.trim()) errors.push('workflowId is required');
  if (!Number.isInteger(event.workflowRevision) || event.workflowRevision < 1) {
    errors.push('workflowRevision must be a positive integer');
  }
  if (!Number.isInteger(event.sequence) || event.sequence < 1) errors.push('sequence must be a positive integer');
  if (!event.actionId.trim()) errors.push('actionId is required');
  if (!event.dagNodeId.trim()) errors.push('dagNodeId is required');
  if (!Number.isInteger(event.attempt) || event.attempt < 0) errors.push('attempt must be a non-negative integer');
  if (!event.operation.trim()) errors.push('operation is required');
  if (event.tokensUsed !== undefined && (!Number.isInteger(event.tokensUsed) || event.tokensUsed < 0)) {
    errors.push('tokensUsed must be a non-negative integer');
  }
  if (event.filesEdited !== undefined) {
    if (!Array.isArray(event.filesEdited) || event.filesEdited.some((value) => typeof value !== 'string' || !value.trim())) {
      errors.push('filesEdited entries must be non-empty strings');
    }
  }
  if (event.openspecChange !== undefined && (!event.openspecChange.trim() || event.openspecChange.includes('..'))) {
    errors.push('openspecChange must be a non-empty safe change name');
  }

  const progress = event.progress;
  if (progress) {
    if (progress.completedUnits !== undefined && !isFiniteNonNegative(progress.completedUnits)) {
      errors.push('progress.completedUnits must be finite and non-negative');
    }
    if (progress.totalUnits !== undefined && !isFiniteNonNegative(progress.totalUnits)) {
      errors.push('progress.totalUnits must be finite and non-negative');
    }
    if (
      progress.completedUnits !== undefined &&
      progress.totalUnits !== undefined &&
      progress.completedUnits > progress.totalUnits
    ) {
      errors.push('progress.completedUnits must not exceed progress.totalUnits');
    }
    if (progress.fraction !== undefined && (!Number.isFinite(progress.fraction) || progress.fraction < 0 || progress.fraction > 1)) {
      errors.push('progress.fraction must be between 0 and 1');
    }
    if (progress.etaMs !== undefined && !isFiniteNonNegative(progress.etaMs)) {
      errors.push('progress.etaMs must be finite and non-negative');
    }
    if (
      progress.confidence !== undefined &&
      (!Number.isFinite(progress.confidence) || progress.confidence < 0 || progress.confidence > 1)
    ) {
      errors.push('progress.confidence must be between 0 and 1');
    }
  }

  return { ok: errors.length === 0, errors };
}

// ── WORKFLOW-ACTION-SCHEMA-OWNER-01: canonical adapter ─────────────────────────
//
// This local WorkflowActionEventV1 stays the UI/Kanban-facing type (state, operation,
// progress, target, visual). It no longer independently claims the
// 'atlas.workflow-action.v1' schema identity as its own contract -- that identity is owned
// by `workflowActionEventSchema` in `@deeds/parent-atlas/core/workflow-action-event`. These
// two functions are the explicit adapter boundary between this local shape and the canonical
// one, per design.md Decision 2.
//
// `WORKFLOW_EVENT_KINDS` here intentionally does NOT include every canonical `kind` value
// (it lacks 'cancelled', 'suspended', 'resumed', 'validated', 'materialized') -- rather than
// silently coerce an unrepresentable canonical kind to a wrong local one, conversion throws.
// Widening this local enum is a separate decision for whoever wires a real UI/Kanban
// consumer of those kinds, not assumed here.

import type {
  WorkflowActionEventV1 as CanonicalWorkflowActionEventV1,
} from '@deeds/parent-atlas/core/workflow-action-event';

export interface ToCanonicalExtrasV1 {
  producerRevision: string;
}

export interface FromCanonicalExtrasV1 {
  emittedAt: string;
}

export function toCanonicalWorkflowActionEvent(
  local: WorkflowActionEventV1,
  extras: ToCanonicalExtrasV1,
): CanonicalWorkflowActionEventV1 {
  return {
    schema: 'atlas.workflow-action.v1',
    workflowId: local.workflowId,
    workflowRevision: local.workflowRevision,
    sequence: local.sequence,
    actionId: local.actionId,
    parentActionId: local.parentActionId,
    dagNodeId: local.dagNodeId,
    attempt: local.attempt,
    lane: local.lane,
    transport: local.transport,
    kind: local.kind,
    resourceRefs: [],
    evidenceRefs: local.evidenceRefs ?? [],
    artifactRefs: local.artifactRefs ?? [],
    startedAt: local.startedAt,
    completedAt: local.finishedAt,
    metadata: {
      ...(local.tokensUsed === undefined ? {} : { tokensUsed: local.tokensUsed }),
      ...(local.filesEdited === undefined ? {} : { filesEdited: local.filesEdited }),
      ...(local.openspecChange === undefined ? {} : { openspecChange: local.openspecChange }),
    },
    producerRevision: extras.producerRevision,
    inputRefs: [],
    outputRefs: [],
    state: local.state,
    operation: local.operation,
    progress: local.progress,
    target: local.target,
    visual: local.visual,
    canonicalIds: local.target?.canonicalId ? [local.target.canonicalId] : [],
  } as CanonicalWorkflowActionEventV1;
}

export function fromCanonicalWorkflowActionEvent(
  canonical: CanonicalWorkflowActionEventV1,
  extras: FromCanonicalExtrasV1,
): WorkflowActionEventV1 {
  if (!(WORKFLOW_EVENT_KINDS as readonly string[]).includes(canonical.kind)) {
    throw new Error(
      `WORKFLOW_ACTION_EVENT_KIND_NOT_REPRESENTABLE_IN_UI_SHAPE: '${canonical.kind}' has no equivalent in this local WorkflowActionEventV1's WORKFLOW_EVENT_KINDS`,
    );
  }
  if (canonical.transport && !(WORKFLOW_TRANSPORTS as readonly string[]).includes(canonical.transport)) {
    throw new Error(
      `WORKFLOW_ACTION_EVENT_TRANSPORT_NOT_REPRESENTABLE_IN_UI_SHAPE: '${canonical.transport}' has no equivalent in this local WorkflowActionEventV1's WORKFLOW_TRANSPORTS (e.g. 'mcp' is canonical-only)`,
    );
  }
  return {
    schema: 'atlas.workflow-action.v1',
    workflowId: canonical.workflowId,
    workflowRevision: canonical.workflowRevision,
    sequence: canonical.sequence,
    actionId: canonical.actionId,
    parentActionId: canonical.parentActionId,
    dagNodeId: canonical.dagNodeId,
    attempt: canonical.attempt,
    lane: canonical.lane,
    transport: canonical.transport as WorkflowTransport | undefined,
    kind: canonical.kind as WorkflowEventKind,
    state: canonical.state ?? 'running',
    operation: canonical.operation ?? '',
    progress: canonical.progress,
    target: canonical.target,
    evidenceRefs: canonical.evidenceRefs,
    artifactRefs: canonical.artifactRefs,
    tokensUsed: typeof canonical.metadata?.tokensUsed === 'number' ? canonical.metadata.tokensUsed : undefined,
    filesEdited: Array.isArray(canonical.metadata?.filesEdited) ? canonical.metadata.filesEdited as string[] : undefined,
    openspecChange: typeof canonical.metadata?.openspecChange === 'string' ? canonical.metadata.openspecChange : undefined,
    startedAt: canonical.startedAt,
    emittedAt: extras.emittedAt,
    finishedAt: canonical.completedAt,
    visual: canonical.visual,
  };
}

export function workflowProgressFraction(event: Pick<WorkflowActionEventV1, 'progress' | 'state'>): number | null {
  if (event.progress?.fraction !== undefined) return event.progress.fraction;
  if (
    event.progress?.completedUnits !== undefined &&
    event.progress.totalUnits !== undefined &&
    event.progress.totalUnits > 0
  ) {
    return event.progress.completedUnits / event.progress.totalUnits;
  }
  if (event.state === 'succeeded') return 1;
  return null;
}
