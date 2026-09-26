import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { buildErrorAgentRepairRequestV1, type ErrorAgentRepairRequestV1 } from './repair-request.js';

const execFileAsync = promisify(execFile);

export type OpenSpecControllerState =
  | 'ACTIONABLE'
  | 'WAITING_ON_DEPENDENCY'
  | 'WAITING_ON_AUTHORITY'
  | 'DEFERRED'
  | 'SUPERSEDED'
  | 'PROVEN'
  | 'INVARIANT'
  | 'UNKNOWN';

export type SmokeProfileId = 'controller-report' | 'openspec-strict' | 'nlp-classification-readiness';
export type ReconciliationStatus =
  | 'PROVEN_CURRENT'
  | 'WAITING_ON_DEPENDENCY'
  | 'WAITING_ON_AUTHORITY'
  | 'SMOKE_FAILED'
  | 'REVIEW_REQUIRED';
export type FailureClass = 'B0' | 'B1' | 'B2' | 'B3';

export interface OpenSpecControllerTask {
  taskKey: string;
  change: string;
  line?: number;
  text: string;
  priority: number;
  controller?: {
    state?: string;
    blockerKey?: string | null;
    retryWhen?: string[];
    requiredReceipts?: string[];
    evidenceHash?: string;
    [key: string]: unknown;
  };
  executionState?: string;
  blockerKey?: string | null;
  requiredReceipts?: string[];
  requiresReceipts?: string[];
  [key: string]: unknown;
}

export interface CompletionGate {
  gateId: string;
  status: string;
  receipt?: string;
}

export interface CompletionEnvelope {
  goalId: string;
  revision: string;
  requiredGates: CompletionGate[];
  explicitlyNotRequired: string[];
  allowedChanges: string[];
  allowedFallbacks: Array<{ gateId: string; alternatives: string[] }>;
  scopeBudget: {
    maxNewBlockersPerAttempt: number;
    maxNewOwners: number;
    architectureExpansionAllowed: boolean;
  };
  checksum?: string;
}

export interface OpenSpecControllerSnapshot {
  schema?: string;
  generatedAt?: string;
  policy?: string | { revision?: string; [key: string]: unknown };
  completionEnvelopes: CompletionEnvelope[];
  summary?: Record<string, unknown>;
  allTasks: OpenSpecControllerTask[];
  checksum: string;
  reportPath: string;
  writesPerformed: boolean;
}

export interface OpenSpecTaskSelection {
  taskKey: string;
  change: string;
  line?: number;
  text: string;
  priority: number;
  controllerState: OpenSpecControllerState;
  blockerKey: string | null;
  requiredReceipts: string[];
  smokeProfile: SmokeProfileId;
  completionEnvelopeRevision: string;
  controllerReportChecksum: string;
  selectionReason: string;
  evidenceHash: string;
  repairRequest?: ErrorAgentRepairRequestV1;
}

export interface SmokeProfileResult {
  profile: SmokeProfileId;
  passed: boolean;
  command: string;
  outputSummary: string;
  exitCode?: number;
  writesPerformed: false;
}

export function classifyFailure(input: {
  requiredByEnvelope: boolean;
  dependencyOwner?: boolean;
  admittedFallback?: boolean;
}): FailureClass {
  if (!input.requiredByEnvelope) return 'B3';
  if (input.dependencyOwner) return 'B1';
  if (input.admittedFallback) return 'B2';
  return 'B0';
}

const AUTHORITY_REVIEW_PATTERN = /\b(?:apply|backfill|canonical\s+write|promot(?:e|ion)|\bddl\b|production\s+(?:write|promotion)|live\s+readback|canonical\s+(?:identity|source|packet)[^.!?]{0,80}\b(?:live|readback|postgres|revision)|admitted\s+(?:source|workspace|execution)|source[-\s]?revision|packet\s+writer|current\s+source|workspace\s+revision)\b/i;
const VALID_CHANGE = /^[a-z0-9][a-z0-9-]*$/;

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function stableChecksum(value: unknown): string {
  return sha256(JSON.stringify(canonicalize(value)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function parseFallbacks(value: unknown): CompletionEnvelope['allowedFallbacks'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    return typeof record.gateId === 'string'
      ? [{ gateId: record.gateId, alternatives: asStringArray(record.alternatives) }]
      : [];
  });
}

function parseCompletionEnvelope(value: unknown): CompletionEnvelope {
  const record = asRecord(value);
  const budget = asRecord(record.scopeBudget);
  const requiredGates = Array.isArray(record.requiredGates)
    ? record.requiredGates.flatMap((gate) => {
      const item = asRecord(gate);
      return typeof item.gateId === 'string' && typeof item.status === 'string'
        ? [{ gateId: item.gateId, status: item.status, receipt: typeof item.receipt === 'string' ? item.receipt : undefined }]
        : [];
    })
    : [];
  const envelope = {
    goalId: typeof record.goalId === 'string' ? record.goalId : '',
    revision: typeof record.revision === 'string' ? record.revision : '',
    requiredGates,
    explicitlyNotRequired: asStringArray(record.explicitlyNotRequired),
    allowedChanges: asStringArray(record.allowedChanges),
    allowedFallbacks: parseFallbacks(record.allowedFallbacks),
    scopeBudget: {
      maxNewBlockersPerAttempt: typeof budget.maxNewBlockersPerAttempt === 'number' ? budget.maxNewBlockersPerAttempt : -1,
      maxNewOwners: typeof budget.maxNewOwners === 'number' ? budget.maxNewOwners : -1,
      architectureExpansionAllowed: budget.architectureExpansionAllowed === true,
    },
    checksum: typeof record.checksum === 'string' ? record.checksum : undefined,
  } satisfies CompletionEnvelope;
  const expectedChecksum = stableChecksum({
    goalId: envelope.goalId,
    revision: envelope.revision,
    requiredGates: envelope.requiredGates,
    explicitlyNotRequired: envelope.explicitlyNotRequired,
    allowedChanges: envelope.allowedChanges,
    allowedFallbacks: envelope.allowedFallbacks,
    scopeBudget: envelope.scopeBudget,
  });
  if (!envelope.goalId || !envelope.revision || envelope.requiredGates.length === 0 || envelope.allowedChanges.length === 0 || envelope.scopeBudget.maxNewBlockersPerAttempt < 0 || envelope.scopeBudget.maxNewOwners < 0 || !envelope.checksum || envelope.checksum !== expectedChecksum) {
    throw new Error('OPENSPEC_COMPLETION_ENVELOPE_INVALID');
  }
  return envelope;
}

function envelopeIsCurrent(envelope: CompletionEnvelope): boolean {
  return envelope.requiredGates.every((gate) => gate.status === 'PROVEN_CURRENT');
}

function defaultReportPath(repoRoot = process.env.ATLAS_REPO_ROOT ?? path.resolve(process.cwd(), '..')): string {
  const primary = path.resolve(repoRoot, 'docs/reports/openspec-execution-controller-v1.json');
  const staging = path.resolve(repoRoot, 'docs/reports/staging/openspec-execution-controller-v1.json');
  try {
    if (fs.existsSync(staging) && (!fs.existsSync(primary) || fs.statSync(staging).mtimeMs > fs.statSync(primary).mtimeMs)) return staging;
  } catch {
    // Fall back to the stable report path when report freshness cannot be inspected.
  }
  return primary;
}

export function readOpenSpecControllerReport(reportPath = defaultReportPath()): OpenSpecControllerSnapshot {
  const raw = fs.readFileSync(reportPath, 'utf8');
  const parsed = asRecord(JSON.parse(raw));
  const allTasks = Array.isArray(parsed.allTasks) ? parsed.allTasks.map((task) => asRecord(task) as OpenSpecControllerTask) : [];
  const completionEnvelopes = Array.isArray(parsed.completionEnvelopes) ? parsed.completionEnvelopes.map(parseCompletionEnvelope) : [];
  if (allTasks.length === 0) throw new Error('OPENSPEC_CONTROLLER_ALL_TASKS_MISSING');
  if (completionEnvelopes.length === 0) throw new Error('OPENSPEC_COMPLETION_ENVELOPE_MISSING');
  if (parsed.writesPerformed === true) throw new Error('OPENSPEC_CONTROLLER_WRITES_REPORTED');
  return {
    schema: typeof parsed.schema === 'string' ? parsed.schema : undefined,
    generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : undefined,
    policy: typeof parsed.policy === 'string' ? parsed.policy : asRecord(parsed.policy) as OpenSpecControllerSnapshot['policy'],
    completionEnvelopes,
    summary: asRecord(parsed.summary),
    allTasks,
    checksum: sha256(raw),
    reportPath,
    writesPerformed: false,
  };
}

function controllerState(task: OpenSpecControllerTask): OpenSpecControllerState {
  const value = String(task.controller?.state ?? task.executionState ?? 'UNKNOWN').toUpperCase();
  return ['ACTIONABLE', 'WAITING_ON_DEPENDENCY', 'WAITING_ON_AUTHORITY', 'DEFERRED', 'SUPERSEDED', 'PROVEN', 'INVARIANT'].includes(value)
    ? value as OpenSpecControllerState
    : 'UNKNOWN';
}

function isAuthorityReviewRequired(task: OpenSpecControllerTask): boolean {
  return AUTHORITY_REVIEW_PATTERN.test(task.text ?? '');
}

function smokeProfileFor(task: OpenSpecControllerTask): SmokeProfileId {
  if (task.change === 'parent-atlas-nlp-sidecar-feature-compiler' || task.change === 'parent-atlas-workstation-domain-classifier') {
    return 'nlp-classification-readiness';
  }
  return task.change === 'parent-atlas-retrieval-executor-compatibility-convergence'
    ? 'openspec-strict'
    : 'controller-report';
}

function requiredReceiptsFor(task: OpenSpecControllerTask): string[] {
  const controller = task.controller ?? {};
  return [...new Set([
    ...asStringArray(task.requiredReceipts),
    ...asStringArray(task.requiresReceipts),
    ...asStringArray(controller.requiredReceipts),
    ...asStringArray(controller.retryWhen),
  ])];
}

function evidenceHashFor(task: OpenSpecControllerTask): string {
  return typeof task.controller?.evidenceHash === 'string'
    ? task.controller.evidenceHash
    : sha256(JSON.stringify({ taskKey: task.taskKey, text: task.text, change: task.change, line: task.line ?? null }));
}

export function selectOpenSpecTask(
  snapshot: OpenSpecControllerSnapshot,
  options: { taskKey?: string; controllerReportChecksum?: string; completionEnvelopeRevision?: string } = {},
): OpenSpecTaskSelection {
  if (options.controllerReportChecksum && options.controllerReportChecksum !== snapshot.checksum) {
    throw new Error('OPENSPEC_CONTROLLER_REPORT_STALE');
  }

  const envelope = options.completionEnvelopeRevision
    ? snapshot.completionEnvelopes.find((item) => item.revision === options.completionEnvelopeRevision)
    : snapshot.completionEnvelopes[0];
  if (!envelope) throw new Error('OPENSPEC_COMPLETION_ENVELOPE_STALE');
  if (!envelopeIsCurrent(envelope)) throw new Error('OPENSPEC_COMPLETION_ENVELOPE_BLOCKED');
  if (envelope.scopeBudget.architectureExpansionAllowed || envelope.scopeBudget.maxNewBlockersPerAttempt !== 0 || envelope.scopeBudget.maxNewOwners !== 0) {
    throw new Error('OPENSPEC_COMPLETION_SCOPE_UNSAFE');
  }

  const candidates = snapshot.allTasks
    .filter((task) => controllerState(task) === 'ACTIONABLE')
    .filter((task) => envelope.allowedChanges.includes(task.change))
    .filter((task) => !task.blockerKey && !task.controller?.blockerKey)
    .filter((task) => !isAuthorityReviewRequired(task));

  const selected = options.taskKey
    ? candidates.find((task) => task.taskKey === options.taskKey)
    : [...candidates].sort((a, b) => a.priority - b.priority || a.change.localeCompare(b.change) || (a.line ?? 0) - (b.line ?? 0) || a.taskKey.localeCompare(b.taskKey))[0];

  if (!selected) {
    if (options.taskKey) throw new Error('OPENSPEC_TASK_NOT_ACTIONABLE');
    throw new Error('OPENSPEC_NO_ACTIONABLE_TASK');
  }

  const envelopeRevision = envelope.revision;
  const blockerKey = selected.blockerKey ?? selected.controller?.blockerKey ?? null;
  const selection: OpenSpecTaskSelection = {
    taskKey: selected.taskKey,
    change: selected.change,
    line: selected.line,
    text: selected.text,
    priority: selected.priority,
    controllerState: controllerState(selected),
    blockerKey,
    requiredReceipts: requiredReceiptsFor(selected),
    smokeProfile: smokeProfileFor(selected),
    completionEnvelopeRevision: envelopeRevision,
    controllerReportChecksum: snapshot.checksum,
    selectionReason: options.taskKey ? 'explicit_actionable_task_revalidated' : 'lowest_priority_actionable_task_revalidated',
    evidenceHash: evidenceHashFor(selected),
  };
  return {
    ...selection,
    repairRequest: buildErrorAgentRepairRequestV1(selection, {
      requestId: `repair:${selection.taskKey}:${selection.controllerReportChecksum}`,
    }),
  };
}

export function failureFingerprint(input: {
  taskKey: string;
  gate: string;
  blocker: string;
  controllerReportChecksum: string;
  workspaceRevision?: string;
  sourceRevision?: string;
  evidenceChecksum?: string;
}): string {
  return sha256(JSON.stringify({
    taskKey: input.taskKey,
    gate: input.gate,
    blocker: input.blocker,
    controllerReportChecksum: input.controllerReportChecksum,
    workspaceRevision: input.workspaceRevision ?? null,
    sourceRevision: input.sourceRevision ?? null,
    evidenceChecksum: input.evidenceChecksum ?? null,
  }));
}

export function retrySuppressed(previousFingerprint: string | undefined, currentFingerprint: string): boolean {
  return Boolean(previousFingerprint && previousFingerprint === currentFingerprint);
}

export function reconcileOpenSpecSelection(
  selection: OpenSpecTaskSelection,
  snapshot: OpenSpecControllerSnapshot,
  smokePassed: boolean,
): ReconciliationStatus {
  const current = snapshot.allTasks.find((task) => task.taskKey === selection.taskKey);
  const state = current ? controllerState(current) : 'UNKNOWN';
  if (state === 'PROVEN' || state === 'INVARIANT') return 'PROVEN_CURRENT';
  if (state === 'WAITING_ON_DEPENDENCY' || state === 'DEFERRED') return 'WAITING_ON_DEPENDENCY';
  if (state === 'WAITING_ON_AUTHORITY') return 'WAITING_ON_AUTHORITY';
  if (!smokePassed) return 'SMOKE_FAILED';
  return 'REVIEW_REQUIRED';
}

/**
 * Reconcile a worker request against a freshly read controller report when a
 * full task selection was intentionally not possible (for example, the
 * current completion envelope is still waiting on lineage). This is a
 * read-only status calculation; it never promotes a request or changes task
 * state.
 */
export function reconcileRepairRequestAgainstCurrentController(
  request: ErrorAgentRepairRequestV1,
  snapshot: OpenSpecControllerSnapshot,
  smokePassed: boolean,
): ReconciliationStatus {
  const envelope = snapshot.completionEnvelopes.find((item) => item.revision === request.completionEnvelopeRevision);
  if (!envelope) return 'REVIEW_REQUIRED';

  const waitingGate = envelope.requiredGates.find((gate) => gate.status === 'WAITING_ON_AUTHORITY' || gate.status === 'WAITING_ON_DEPENDENCY');
  if (waitingGate) {
    return waitingGate.status === 'WAITING_ON_AUTHORITY' ? 'WAITING_ON_AUTHORITY' : 'WAITING_ON_DEPENDENCY';
  }

  if (request.controllerReportChecksum !== snapshot.checksum) return 'REVIEW_REQUIRED';

  const current = snapshot.allTasks.find((task) => task.taskKey === request.taskKey);
  if (!current) return smokePassed ? 'REVIEW_REQUIRED' : 'SMOKE_FAILED';

  const selection: OpenSpecTaskSelection = {
    taskKey: current.taskKey,
    change: current.change,
    line: current.line,
    text: current.text,
    priority: current.priority,
    controllerState: controllerState(current),
    blockerKey: current.blockerKey ?? current.controller?.blockerKey ?? null,
    requiredReceipts: requiredReceiptsFor(current),
    smokeProfile: smokeProfileFor(current),
    completionEnvelopeRevision: request.completionEnvelopeRevision,
    controllerReportChecksum: snapshot.checksum,
    selectionReason: 'worker_request_reconciliation',
    evidenceHash: evidenceHashFor(current),
  };
  return reconcileOpenSpecSelection(selection, snapshot, smokePassed);
}

function executableFor(): string {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

export async function runAllowlistedSmokeProfile(
  profile: SmokeProfileId,
  options: { change: string; repoRoot?: string; timeoutMs?: number } = { change: '' },
): Promise<SmokeProfileResult> {
  const repoRoot = options.repoRoot ?? process.env.ATLAS_REPO_ROOT ?? path.resolve(process.cwd(), '..');
  const timeoutMs = options.timeoutMs ?? 60_000;
  let executable: string;
  let args: string[];
  if (profile === 'controller-report') {
    executable = process.execPath;
    args = ['scripts/atlas/audit-openspec-execution-controller-v1.mjs'];
  } else if (profile === 'nlp-classification-readiness') {
    executable = process.execPath;
    args = ['scripts/atlas/audit-nlp-agentic-error-readiness-v1.mjs'];
  } else {
    if (!VALID_CHANGE.test(options.change)) throw new Error('OPENSPEC_CHANGE_NAME_INVALID');
    executable = executableFor();
    args = ['openspec', 'validate', options.change, '--strict'];
  }
  try {
    const result = await execFileAsync(executable, args, { cwd: repoRoot, timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 });
    return { profile, passed: true, command: [executable, ...args].join(' '), outputSummary: String(result.stdout).slice(-4000), writesPerformed: false };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    return {
      profile,
      passed: false,
      command: [executable, ...args].join(' '),
      outputSummary: String(failure.stderr ?? failure.stdout ?? failure.message ?? 'smoke command failed').slice(-4000),
      exitCode: typeof failure.code === 'number' ? failure.code : undefined,
      writesPerformed: false,
    };
  }
}
