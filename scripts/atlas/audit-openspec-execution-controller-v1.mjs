#!/usr/bin/env node
/**
 * Read-only execution controller for the OpenSpec workboard.
 *
 * This is a recommendation layer. It never edits tasks.md, runs an apply path,
 * or mutates PostgreSQL, Qdrant, Valkey, Graphify, or model state.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportsDir = process.env.ATLAS_OPENSPEC_REPORTS_DIR
  ? path.resolve(root, process.env.ATLAS_OPENSPEC_REPORTS_DIR)
  : path.join(root, 'docs', 'reports');
const workboardPath = process.env.ATLAS_OPENSPEC_WORKBOARD_PATH
  ? path.resolve(root, process.env.ATLAS_OPENSPEC_WORKBOARD_PATH)
  : path.join(root, 'docs', 'reports', 'openspec-workboard-v1.json');

const readJson = (file, fallback = {}) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); } catch { return fallback; }
};

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
};
const stableJson = (value) => JSON.stringify(canonicalize(value));
const checksum = (value) => `sha256:${crypto.createHash('sha256').update(stableJson(value)).digest('hex')}`;
const reportWriteFailures = [];
const writeReport = (name, value) => {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const target = path.join(reportsDir, name);
  try {
    fs.writeFileSync(target, body);
    return target;
  } catch (error) {
    const stagingDir = path.join(reportsDir, 'staging');
    const fallback = path.join(stagingDir, name);
    fs.mkdirSync(stagingDir, { recursive: true });
    let fallbackError = null;
    try {
      fs.writeFileSync(fallback, body);
    } catch (fallbackFailure) {
      fallbackError = describeWriteError(fallbackFailure);
    }
    reportWriteFailures.push({
      name,
      target,
      fallback,
      error: describeWriteError(error),
      fallbackError,
    });
    return fallback;
  }
};

function describeWriteError(error) {
  if (error && typeof error === 'object') {
    return {
      name: typeof error.name === 'string' ? error.name : null,
      code: typeof error.code === 'string' ? error.code : null,
      message: typeof error.message === 'string' ? error.message : String(error),
    };
  }
  return { name: null, code: null, message: String(error) };
}

const workboard = (() => {
  try { return JSON.parse(fs.readFileSync(workboardPath, 'utf8')); }
  catch { return {}; }
})();
const tasks = Array.isArray(workboard.taskInventory) ? workboard.taskInventory : [];
const receipts = {
  lineage: readJson('docs/reports/current-lineage-closure-v1.json'),
  semanticSnapshot: readJson('docs/reports/current-semantic-candidate-snapshot-v1.json'),
  candidateFreeze: readJson('docs/reports/candidate-population-freeze-v1.json'),
  packetRevision: readJson('docs/reports/packet-revision-owner-v1.json'),
  sourceBridge: readJson('docs/reports/current-graphify-source-bridge-reconciliation-v1.json'),
  packetIdentity: readJson('docs/reports/current-packet-chunk-identity-reconciliation-v1.json'),
};

const classifyBlocker = (task) => {
  const text = `${task.taskKey} ${task.text}`.toLowerCase();
  if (task.state === 'DONE') return { state: 'PROVEN', blockerKey: null, retryWhen: null };
  if (task.executionState === 'SUPERSEDED_OR_HISTORICAL') return { state: 'SUPERSEDED', blockerKey: 'HISTORICAL_TASK', retryWhen: 'never' };
  if (task.executionState === 'INVARIANT') return { state: 'INVARIANT', blockerKey: null, retryWhen: 'never' };
  if (/promotion|human.?authorization|not authorized|canonical.*write|apply.*blocked|writes?.*false/.test(text)) {
    return { state: 'WAITING_ON_AUTHORITY', blockerKey: 'CANONICAL_AUTHORIZATION', retryWhen: 'authorization receipt or target-list receipt changes' };
  }
  if (/packet.*(digest|materiali[sz]|missing packet)|content.?digest.*packet/.test(text)) {
    return { state: 'WAITING_ON_DEPENDENCY', blockerKey: 'PACKET_MATERIALIZATION', retryWhen: 'current packet materialization or digest receipt changes' };
  }
  if (/source authority|workspace.*revision|execution.*source|packet.?revision|current lineage|current.*packet|graphify.*owner/.test(text)) {
    return { state: 'WAITING_ON_AUTHORITY', blockerKey: 'CURRENT_SOURCE_AUTHORITY', retryWhen: 'workspace/source/execution authority receipt changes' };
  }
  if (/ann-03|candidateordinal|candidate population|semantic snapshot|som 20x20|qdrant.*cuvs|freeze.*population/.test(text)) {
    return { state: 'WAITING_ON_DEPENDENCY', blockerKey: 'CANDIDATE_POPULATION_FREEZE', retryWhen: 'current semantic snapshot and candidate-freeze receipts change' };
  }
  if (task.executionState === 'WAITING_ON_DEPENDENCY') {
    return { state: 'WAITING_ON_DEPENDENCY', blockerKey: 'DECLARED_TASK_DEPENDENCY', retryWhen: 'owning dependency receipt changes' };
  }
  if (/ewin.?tang|challenger|benchmark|research-only|research only/.test(text)) {
    return { state: 'DEFERRED', blockerKey: 'OPTIONAL_CHALLENGER', retryWhen: 'current completion envelope explicitly requires this lane' };
  }
  return { state: 'ACTIONABLE', blockerKey: null, retryWhen: 'implementation or required receipt changes' };
};

const classifiedTasks = tasks.map((task) => ({
  ...task,
  controller: classifyBlocker(task),
}));
const actionable = classifiedTasks.filter((task) => task.controller.state === 'ACTIONABLE');
const waiting = classifiedTasks.filter((task) => task.controller.state === 'WAITING_ON_DEPENDENCY' || task.controller.state === 'WAITING_ON_AUTHORITY');
const deferred = classifiedTasks.filter((task) => task.controller.state === 'DEFERRED' || task.controller.state === 'SUPERSEDED');
const proven = classifiedTasks.filter((task) => task.controller.state === 'PROVEN' || task.controller.state === 'INVARIANT');

const blockerDefinitions = {
  DECLARED_TASK_DEPENDENCY: {
    state: 'WAITING_ON_DEPENDENCY',
    owner: 'declared OpenSpec dependency owner',
    meaning: 'The task names or inherits a prerequisite that has not emitted a current proof receipt.',
    releaseEvent: 'owning dependency receipt changes and satisfies the prerequisite',
    retryPolicy: 'do not retry until the dependency receipt checksum changes',
    selection: 'exclude from implementation queue; keep in dependency review queue',
  },
  CANONICAL_AUTHORIZATION: {
    state: 'WAITING_ON_AUTHORITY',
    owner: 'operator or canonical promotion owner',
    meaning: 'The task would apply or promote a canonical mutation without an explicit current authorization receipt.',
    releaseEvent: 'bounded authorization receipt and target-list checksum are present',
    retryPolicy: 'do not retry on unchanged authorization state',
    selection: 'exclude from implementation queue; allow only read-only preparation',
  },
  CURRENT_SOURCE_AUTHORITY: {
    state: 'WAITING_ON_AUTHORITY',
    owner: 'workspace/source/execution authority owner',
    meaning: 'The task requires an admitted current source cohort, packet revision, or execution owner that is not proven.',
    releaseEvent: 'current workspace/source/execution authority receipt changes to admitted and current',
    retryPolicy: 'do not retry until the relevant authority receipt or revision changes',
    selection: 'exclude live implementation; allow bounded audits that can produce the missing receipt',
  },
  CANDIDATE_POPULATION_FREEZE: {
    state: 'WAITING_ON_DEPENDENCY',
    owner: 'candidate snapshot and ordinal-map owner',
    meaning: 'The task depends on a lineage-qualified semantic snapshot and frozen CandidateOrdinal population.',
    releaseEvent: 'semantic snapshot and candidate-freeze receipts both become current and lineage-qualified',
    retryPolicy: 'do not retry until either required receipt checksum changes',
    selection: 'exclude ANN/KMeans/SOM production work; allow fixture and read-only parity proofs',
  },
  PACKET_MATERIALIZATION: {
    state: 'WAITING_ON_DEPENDENCY',
    owner: 'canonical packet materialization and digest owner',
    meaning: 'The selected source bridge is exact, but current packet rows or canonical packet content digests are incomplete.',
    releaseEvent: 'packet materialization and independent digest readback become current for the admitted source cohort',
    retryPolicy: 'do not retry until the packet identity/digest receipt checksum changes',
    selection: 'exclude packet-dependent promotion; allow read-only writer and identity audits',
  },
};

const waitingGroups = [...new Map(waiting.map((task) => [task.controller.blockerKey, true])).keys()].map((blockerKey) => {
  const members = waiting.filter((task) => task.controller.blockerKey === blockerKey);
  const evidence = {
    blockerKey,
    taskKeys: members.map((task) => task.taskKey).sort(),
    relevantRevisions: {
      workspaceRevision: receipts.lineage.scope?.workspaceRevision ?? null,
      semanticSnapshotStatus: receipts.semanticSnapshot.status ?? null,
      candidateFreezeStatus: receipts.candidateFreeze.status ?? null,
      packetRevisionStatus: receipts.packetRevision.status ?? null,
      sourceBridgeStatus: receipts.sourceBridge.status ?? null,
      packetIdentityStatus: receipts.packetIdentity.status ?? null,
    },
  };
  return {
    blockerKey,
    taskCount: members.length,
    taskKeys: evidence.taskKeys.slice(0, 200),
    evidenceHash: checksum(evidence),
    retryWhen: members[0]?.controller.retryWhen ?? 'dependency receipt changes',
    definition: blockerDefinitions[blockerKey] ?? {
      state: 'REVIEW_REQUIRED',
      owner: 'unresolved',
      meaning: 'No blocker definition is registered for this classification.',
      releaseEvent: 'classification review',
      retryPolicy: 'do not retry until classification changes',
      selection: 'exclude until reviewed',
    },
    disposition: 'WAIT',
  };
});

const blockerAuditGroups = waitingGroups.map((group) => ({
  blockerKey: group.blockerKey,
  ...group.definition,
  taskCount: group.taskCount,
  taskKeys: waiting
    .filter((task) => task.controller.blockerKey === group.blockerKey)
    .map((task) => ({
      taskKey: task.taskKey,
      change: task.change,
      line: task.line,
      text: task.text,
      priority: task.priority,
      executionState: task.executionState,
      retryWhen: task.controller.retryWhen,
    }))
    .sort((a, b) => a.change.localeCompare(b.change) || a.line - b.line),
  evidenceHash: group.evidenceHash,
  writesPerformed: false,
}));

const goals = [
  {
    goalId: 'P10-PREFILL-ROUTING-RESIDENCY',
    revision: 'p10-controller-v1',
    requiredGates: [
      { gateId: 'PREFILL_CONTRACTS', status: 'PROVEN_CURRENT', receipt: 'prefill contract tests' },
      { gateId: 'SOURCE_BRIDGE', status: receipts.sourceBridge.status === 'CURRENT_SOURCE_BRIDGE_EXACT_READ_ONLY' ? 'PROVEN_CURRENT' : 'WAITING_ON_AUTHORITY', receipt: 'docs/reports/current-graphify-source-bridge-reconciliation-v1.json' },
      { gateId: 'PACKET_MATERIALIZATION', status: receipts.packetIdentity.status === 'PACKET_DIGEST_BRIDGE_MISSING' ? 'WAITING_ON_DEPENDENCY' : 'UNPROVEN', receipt: 'docs/reports/current-packet-chunk-identity-reconciliation-v1.json' },
      { gateId: 'CURRENT_LINEAGE', status: receipts.packetIdentity.status === 'PACKET_DIGEST_BRIDGE_MISSING' ? 'WAITING_ON_DEPENDENCY' : (receipts.lineage.firstFailureBoundary === 'EXECUTION_SOURCE_AUTHORITY' ? 'WAITING_ON_AUTHORITY' : 'UNPROVEN'), receipt: 'docs/reports/current-lineage-closure-v1.json' },
      { gateId: 'SEMANTIC_SNAPSHOT', status: receipts.semanticSnapshot.status === 'CURRENT_SEMANTIC_CANDIDATE_SNAPSHOT_EXPORTED' ? 'PROVEN_CURRENT' : 'WAITING_ON_DEPENDENCY', receipt: 'docs/reports/current-semantic-candidate-snapshot-v1.json' },
      { gateId: 'CANDIDATE_FREEZE', status: receipts.candidateFreeze.status === 'CANDIDATE_POPULATION_FREEZE_PROVEN' ? 'PROVEN_CURRENT' : 'WAITING_ON_DEPENDENCY', receipt: 'docs/reports/candidate-population-freeze-v1.json' },
      { gateId: 'ANN03_LIVE_PARITY', status: 'WAITING_ON_DEPENDENCY', receipt: 'parent-atlas-prefill-routing-residency-convergence:ANN-03' },
      { gateId: 'PROMOTION_AUTHORIZATION', status: 'WAITING_ON_AUTHORITY', receipt: 'parent-atlas-retrieval-lineage-dag-convergence:PROMOTION-01' },
    ],
    explicitlyNotRequired: ['TensorRT-RTX promotion', 'SOM execution before candidate freeze', 'Qdrant/Valkey writes', 'Graphify refresh solely to change task state'],
    allowedChanges: ['parent-atlas-prefill-routing-residency-convergence'],
    allowedFallbacks: [],
    scopeBudget: {
      maxNewBlockersPerAttempt: 0,
      maxNewOwners: 0,
      architectureExpansionAllowed: false,
    },
  },
];
for (const goal of goals) {
  goal.unprovenRequiredGates = goal.requiredGates.filter((gate) => gate.status !== 'PROVEN_CURRENT');
  goal.state = goal.unprovenRequiredGates.length === 0 ? 'COMPLETE' : 'WAITING';
  goal.closeoutMode = goal.unprovenRequiredGates.length <= 2;
  goal.checksum = checksum({
    goalId: goal.goalId,
    revision: goal.revision,
    requiredGates: goal.requiredGates,
    explicitlyNotRequired: goal.explicitlyNotRequired,
    allowedChanges: goal.allowedChanges,
    allowedFallbacks: goal.allowedFallbacks,
    scopeBudget: goal.scopeBudget,
  });
}

const report = {
  schema: 'atlas.openspec-execution-controller.v1',
  generatedAt: new Date().toISOString(),
  source: path.relative(root, workboardPath).split(path.sep).join('/'),
  policy: 'RECOMMENDATION_ONLY_NO_LEDGER_OR_RUNTIME_MUTATION',
  summary: {
    totalTasks: classifiedTasks.length,
    proven: proven.length,
    actionable: actionable.length,
    waiting: waiting.length,
    deferred: deferred.length,
    blockerGroups: waitingGroups.length,
    writesPerformed: false,
  },
  retryPolicy: 'RETRY_ONLY_WHEN_IMPLEMENTATION_OR_RELEVANT_RECEIPT_REVISION_CHANGES',
  completionEnvelopes: goals,
  receipts,
  // Full machine-readable population for downstream audits and rankers.
  // The bounded arrays below remain navigation samples only.
  allTasks: classifiedTasks,
  // The selector consumes the complete ACTIONABLE population. Keep ranking
  // deterministic, but do not silently turn the controller into a top-200
  // sample; the controller's state is the authority and pagination belongs to
  // an explicit consumer boundary.
  actionableTasks: actionable.sort((a, b) => a.priority - b.priority || a.change.localeCompare(b.change) || a.line - b.line),
  waitingTasks: waiting.slice(0, 300),
  deferredTasks: deferred.slice(0, 300),
  blockerGroups: waitingGroups,
  dependencyGraph: { status: 'TASK_LEDGER_DEPENDENCY_RECEIPTS_NOT_DECLARED', cycles: [], writesPerformed: false },
  blockerAudit: {
    schema: 'atlas.openspec-blocker-audit.v1',
    groups: blockerAuditGroups.map(({ taskKeys: _taskKeys, ...group }) => group),
    writesPerformed: false,
  },
};

writeReport('openspec-execution-controller-v1.json', report);
writeReport('openspec-actionable-work-v1.json', { schema: 'atlas.openspec-actionable-work.v1', generatedAt: report.generatedAt, tasks: report.actionableTasks, writesPerformed: false });
writeReport('openspec-waiting-dependencies-v1.json', { schema: 'atlas.openspec-waiting-dependencies.v1', generatedAt: report.generatedAt, blockerGroups: waitingGroups, tasks: report.waitingTasks, writesPerformed: false });
writeReport('openspec-deferred-discoveries-v1.json', { schema: 'atlas.openspec-deferred-discoveries.v1', generatedAt: report.generatedAt, tasks: report.deferredTasks, writesPerformed: false });
writeReport('openspec-dependency-cycles-v1.json', { schema: 'atlas.openspec-dependency-cycles.v1', generatedAt: report.generatedAt, status: 'NO_DECLARED_CYCLES', cycles: [], writesPerformed: false });
writeReport('openspec-agent-error-receipts-v1.json', { schema: 'atlas.openspec-agent-error-receipts.v1', generatedAt: report.generatedAt, policy: report.retryPolicy, receipts: [], writesPerformed: false });
writeReport('openspec-blocker-audit-v1.json', {
  schema: 'atlas.openspec-blocker-audit.v1',
  generatedAt: report.generatedAt,
  source: report.source,
  policy: 'READ_ONLY_BLOCKER_CLASSIFICATION_NO_TASK_OR_RUNTIME_MUTATION',
  summary: {
    totalWaitingTasks: waiting.length,
    blockerGroups: blockerAuditGroups.length,
    retryableWithoutEvidenceChange: 0,
    writesPerformed: false,
  },
  groups: blockerAuditGroups,
  nextSelectionRule: 'SELECT_ACTIONABLE_ONLY; WAITING_TASKS_REQUIRE_RELEASE_EVENT; NEVER_RETRY_UNCHANGED_FINGERPRINT',
  writesPerformed: false,
});

console.log(JSON.stringify({ schema: report.schema, state: goals[0].state, summary: report.summary, blockerGroups: waitingGroups.map((group) => ({ blockerKey: group.blockerKey, taskCount: group.taskCount, evidenceHash: group.evidenceHash })), reportWriteFailures, writesPerformed: false }, null, 2));
