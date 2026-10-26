import crypto from 'node:crypto';

const HASH = /^sha256:[a-f0-9]{64}$/i;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function hashCanonical(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')}`;
}

function verifyChecksum(value) {
  if (!value || typeof value !== 'object' || typeof value.checksum !== 'string') return false;
  const { checksum, generatedAt: _generatedAt, ...unsigned } = value;
  return checksum === hashCanonical(unsigned);
}

function admissionTaskRef(task) {
  return typeof task?.source === 'string' && Number.isSafeInteger(task?.line)
    ? `${task.source}#L${task.line}`
    : null;
}

export function indexCurrentTaskEvidenceAdmissionsV1({ workboard, evidenceJoin, expectedHead }) {
  const empty = (status, reason = null) => ({
    status,
    reason,
    workspaceRevision: null,
    reportChecksum: null,
    admissionsByTaskKey: new Map(),
    admittedTaskCount: 0,
    rejectedTaskCount: 0,
    unmatchedTaskCount: Array.isArray(workboard?.taskInventory) ? workboard.taskInventory.length : 0,
    canonicalAuthority: false,
    writesPerformed: false,
  });

  if (!evidenceJoin) return empty('TASK_EVIDENCE_JOIN_NOT_SUPPLIED');
  if (evidenceJoin.schema !== 'atlas.current-task-evidence-card-join-report.v1'
    || evidenceJoin.canonicalAuthority !== false
    || evidenceJoin.writesPerformed !== false
    || !verifyChecksum(evidenceJoin)) return empty('TASK_EVIDENCE_JOIN_INVALID', 'SCHEMA_OR_CHECKSUM_INVALID');
  if (!HASH.test(String(evidenceJoin.workspaceRevision ?? ''))
    || evidenceJoin.workspaceHead !== expectedHead) return empty('TASK_EVIDENCE_JOIN_STALE', 'WORKSPACE_REVISION_MISMATCH');

  const tasks = Array.isArray(workboard?.taskInventory) ? workboard.taskInventory : [];
  const snapshotTasks = Array.isArray(workboard?.tasks) ? workboard.tasks : tasks;
  const seenTaskKeys = new Set();
  for (const task of tasks) {
    if (typeof task.taskKey !== 'string' || !task.taskKey || seenTaskKeys.has(task.taskKey)) {
      return empty('TASK_EVIDENCE_JOIN_INVALID', 'DUPLICATE_OR_MISSING_TASK_KEY');
    }
    seenTaskKeys.add(task.taskKey);
  }
  const sourceEntries = Object.entries(workboard?.sourceFileHashes ?? {}).sort(([left], [right]) => left.localeCompare(right));
  if (!sourceEntries.length || !Array.isArray(evidenceJoin.taskEvidenceAdmissions)) {
    return empty('TASK_EVIDENCE_JOIN_INVALID', 'CURRENT_TASK_SNAPSHOT_OR_ADMISSIONS_MISSING');
  }
  const sourceFileHash = hashCanonical(sourceEntries);
  const taskSnapshotChecksum = hashCanonical({ sourceFileHash, tasks: snapshotTasks });
  if (evidenceJoin.taskSourceFileHash !== sourceFileHash
    || evidenceJoin.taskSnapshotChecksum !== taskSnapshotChecksum
    || evidenceJoin.taskCount !== tasks.length) {
    return empty('TASK_EVIDENCE_JOIN_STALE', 'TASK_SNAPSHOT_CHECKSUM_MISMATCH');
  }

  const admissionsByRef = new Map();
  for (const admission of evidenceJoin.taskEvidenceAdmissions) {
    if (!verifyChecksum(admission) || typeof admission.taskRef !== 'string') continue;
    const rows = admissionsByRef.get(admission.taskRef) ?? [];
    rows.push(admission);
    admissionsByRef.set(admission.taskRef, rows);
  }

  const admissionsByTaskKey = new Map();
  let admittedTaskCount = 0;
  let rejectedTaskCount = 0;
  let unmatchedTaskCount = 0;
  const taskKeysByCanonicalRef = new Map();
  for (const task of tasks) {
    const taskRef = admissionTaskRef(task);
    const matches = taskRef ? admissionsByRef.get(taskRef) ?? [] : [];
    const sourceRevision = workboard.sourceFileHashes?.[task.source];
    const admission = matches.length === 1 ? matches[0] : null;
    const admitted = Boolean(admission
      && admission.admitted === true
      && admission.canonicalAuthority === false
      && admission.workspaceRevision === evidenceJoin.workspaceRevision
      && admission.taskRevision === task.blockHash
      && admission.sourceRevision === sourceRevision
      && HASH.test(String(admission.taskRevision ?? ''))
      && HASH.test(String(admission.sourceRevision ?? ''))
      && admission.canonicalTaskRef
      && Array.isArray(admission.evidenceRefs)
      && admission.evidenceRefs.length > 0);
    if (!admission) unmatchedTaskCount += 1;
    if (admitted) admittedTaskCount += 1;
    else rejectedTaskCount += 1;
    if (task.taskKey) {
      admissionsByTaskKey.set(task.taskKey, admitted ? admission : null);
      if (admitted) {
        const taskKeys = taskKeysByCanonicalRef.get(admission.canonicalTaskRef) ?? [];
        taskKeys.push(task.taskKey);
        taskKeysByCanonicalRef.set(admission.canonicalTaskRef, taskKeys);
      }
    }
  }

  for (const taskKeys of taskKeysByCanonicalRef.values()) {
    if (taskKeys.length < 2) continue;
    for (const taskKey of taskKeys) {
      admissionsByTaskKey.set(taskKey, null);
      admittedTaskCount -= 1;
      rejectedTaskCount += 1;
    }
  }

  return {
    status: 'TASK_EVIDENCE_JOIN_SNAPSHOT_MATCHED',
    reason: null,
    workspaceRevision: evidenceJoin.workspaceRevision,
    reportChecksum: evidenceJoin.checksum,
    admissionsByTaskKey,
    admittedTaskCount,
    rejectedTaskCount,
    unmatchedTaskCount,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
