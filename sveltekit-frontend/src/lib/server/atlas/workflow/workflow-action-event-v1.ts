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
  /** Aggregate execution telemetry only; never hidden reasoning or KV-cache contents. */
  tokensUsed?: number;
  /** Source/worktree files changed by this action. Distinct from build/data artifactRefs. */
  filesEdited?: string[];
  /** OpenSpec change slug this action is accountable to, when known. */
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

function isNonEmptyTrimmedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

export function validateWorkflowActionEvent(event: WorkflowActionEventV1): WorkflowEventValidationResult {
  const errors: string[] = [];

  if (event.schema !== 'atlas.workflow-action.v1') errors.push('schema must be atlas.workflow-action.v1');
  if (!isNonEmptyTrimmedString(event.workflowId)) errors.push('workflowId is required');
  if (!Number.isInteger(event.workflowRevision) || event.workflowRevision < 1) {
    errors.push('workflowRevision must be a positive integer');
  }
  if (!Number.isInteger(event.sequence) || event.sequence < 1) errors.push('sequence must be a positive integer');
  if (!isNonEmptyTrimmedString(event.actionId)) errors.push('actionId is required');
  if (!isNonEmptyTrimmedString(event.dagNodeId)) errors.push('dagNodeId is required');
  if (!Number.isInteger(event.attempt) || event.attempt < 0) errors.push('attempt must be a non-negative integer');
  if (!isNonEmptyTrimmedString(event.operation)) errors.push('operation is required');

  if (event.tokensUsed !== undefined && (!Number.isInteger(event.tokensUsed) || event.tokensUsed < 0)) {
    errors.push('tokensUsed must be a non-negative integer');
  }
  if (event.openspecChange !== undefined && !isNonEmptyTrimmedString(event.openspecChange)) {
    errors.push('openspecChange must be a non-empty trimmed string');
  }
  if (event.filesEdited !== undefined) {
    if (!Array.isArray(event.filesEdited)) {
      errors.push('filesEdited must be an array');
    } else if (event.filesEdited.some((file) => !isNonEmptyTrimmedString(file))) {
      errors.push('filesEdited entries must be non-empty trimmed strings');
    }
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
