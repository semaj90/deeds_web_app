import { createHash, randomUUID } from 'node:crypto';
import type { HmmErrorClass } from './workflow-loop.js';

export const ERROR_AGENT_REPAIR_REQUEST_SCHEMA = 'atlas.error-agent-repair-request.v1' as const;
const VALID_SMOKE_PROFILES = new Set(['controller-report', 'openspec-strict', 'nlp-classification-readiness']);
const VALID_HMM_ERROR_CLASSES = new Set([
  'meta_hygiene',
  'stale_migration',
  'schema_mismatch',
  'vector_infra_missing',
  'env_url_mismatch',
  'route_contract_mismatch',
  'api_validation_gap',
  'ssr_safety_violation',
  'unknown',
]);

export interface ErrorAgentRepairRequestV1 {
  schema: typeof ERROR_AGENT_REPAIR_REQUEST_SCHEMA;
  requestId: string;
  taskKey: string;
  change: string;
  completionEnvelopeRevision: string;
  controllerReportChecksum: string;
  blockerKey: string | null;
  requiredReceipts: string[];
  smokeProfile: string;
  mode: 'PLAN_ONLY';
  canonicalWritesAllowed: false;
  promotionAuthorized: false;
  workflowInput?: RepairWorkflowInputV1;
  checksum: string;
}

export interface RepairWorkflowInputV1 {
  query: string;
  hmmErrorClass: HmmErrorClass;
  caseId?: string;
  targetPath?: string;
  workspaceRevision?: string;
  modelRevision?: string;
  sourceRefs?: string[];
  threadId?: string;
}

export interface RepairRequestSelectionV1 {
  taskKey: string;
  change: string;
  completionEnvelopeRevision: string;
  controllerReportChecksum: string;
  blockerKey: string | null;
  requiredReceipts: string[];
  smokeProfile: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function checksum(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex')}`;
}

function unsignedRequest(request: Omit<ErrorAgentRepairRequestV1, 'checksum'>): Omit<ErrorAgentRepairRequestV1, 'checksum'> {
  return request;
}

export function buildErrorAgentRepairRequestV1(
  selection: RepairRequestSelectionV1,
  options: { requestId?: string; workflowInput?: RepairWorkflowInputV1 } = {},
): ErrorAgentRepairRequestV1 {
  const request = unsignedRequest({
    schema: ERROR_AGENT_REPAIR_REQUEST_SCHEMA,
    requestId: options.requestId ?? `repair:${randomUUID()}`,
    taskKey: selection.taskKey,
    change: selection.change,
    completionEnvelopeRevision: selection.completionEnvelopeRevision,
    controllerReportChecksum: selection.controllerReportChecksum,
    blockerKey: selection.blockerKey,
    requiredReceipts: [...selection.requiredReceipts],
    smokeProfile: selection.smokeProfile,
    mode: 'PLAN_ONLY',
    canonicalWritesAllowed: false,
    promotionAuthorized: false,
    ...(options.workflowInput ? { workflowInput: options.workflowInput } : {}),
  });
  return { ...request, checksum: checksum(request) };
}

export function verifyErrorAgentRepairRequestV1(request: ErrorAgentRepairRequestV1): boolean {
  if (request.schema !== ERROR_AGENT_REPAIR_REQUEST_SCHEMA) return false;
  if (!request.requestId || !request.taskKey || !request.change || !request.completionEnvelopeRevision) return false;
  if (!request.controllerReportChecksum || request.mode !== 'PLAN_ONLY') return false;
  if (!VALID_SMOKE_PROFILES.has(request.smokeProfile)) return false;
  if (!Array.isArray(request.requiredReceipts) || request.requiredReceipts.some((value) => typeof value !== 'string')) return false;
  if (request.canonicalWritesAllowed !== false || request.promotionAuthorized !== false) return false;
  if (request.workflowInput) {
    if (!request.workflowInput.query || !VALID_HMM_ERROR_CLASSES.has(request.workflowInput.hmmErrorClass)) return false;
    if (request.workflowInput.sourceRefs?.some((value) => typeof value !== 'string')) return false;
  }
  const { checksum: provided, ...unsigned } = request;
  return Boolean(provided) && provided === checksum(unsigned);
}
