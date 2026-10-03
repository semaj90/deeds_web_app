export function validateDocumentGovernanceOpenSpecBindingsV1(records) {
  const taskLedgers = records.filter((record) => record.documentKind === 'OPENSPEC_TASKS');
  const failures = [];
  let boundTaskLedgers = 0;
  let completedCount = 0;
  let totalCount = 0;
  let incompleteTaskLedgers = 0;

  for (const record of taskLedgers) {
    const change = record.openspec?.change;
    if (typeof change !== 'string' || !change.trim()) {
      failures.push(`OPENSPEC_BINDING_MISSING:${record.path}`);
      continue;
    }
    boundTaskLedgers += 1;
    const { completedTasks, totalTasks, progressFraction } = record.openspec;
    if (completedTasks === null || totalTasks === null || totalTasks < completedTasks) {
      failures.push(`OPENSPEC_TASK_PROGRESS_INVALID:${record.path}`);
      continue;
    }
    completedCount += completedTasks;
    totalCount += totalTasks;
    if (completedTasks !== totalTasks) incompleteTaskLedgers += 1;
    const expectedFraction = totalTasks === 0 ? null : completedTasks / totalTasks;
    if (progressFraction !== expectedFraction) failures.push(`OPENSPEC_PROGRESS_FRACTION_MISMATCH:${record.path}`);
  }

  return {
    status: failures.length ? 'BLOCKED' : 'PROVEN_BOUNDED',
    taskLedgers: taskLedgers.length,
    boundTaskLedgers,
    unboundTaskLedgers: taskLedgers.length - boundTaskLedgers,
    completedTasks: completedCount,
    totalTasks: totalCount,
    openTasks: totalCount - completedCount,
    incompleteTaskLedgers,
    failures: failures.sort(),
  };
}

export function getOpenSpecClosureBlockersV1(bindingAudit) {
  if (bindingAudit.openTasks > 0) return [`UNCHECKED_TASKS:${bindingAudit.openTasks}`];
  return [];
}
