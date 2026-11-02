export const KANBAN_READY_TASK_PLAN_SCHEMA_V1 = 'atlas.kanban-ready-task-plan.v1';

export function buildKanbanReadyTaskPlanV1(rows, batchSize, cohort) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) {
    throw new Error('KANBAN_PLAN_BATCH_SIZE_OUT_OF_RANGE');
  }
  if (typeof cohort !== 'string' || !/^openspec:[a-z0-9][a-z0-9._-]*$/.test(cohort)) {
    throw new Error('KANBAN_PLAN_COHORT_REQUIRED_OR_INVALID');
  }
  if (!Array.isArray(rows) || rows.length > batchSize) {
    throw new Error('KANBAN_PLAN_ROWS_INVALID');
  }
  const seen = new Set();
  const tasks = rows.map((row) => {
    if (!row || typeof row.task_id !== 'string' || row.task_id.length === 0 || seen.has(row.task_id)) {
      throw new Error('KANBAN_PLAN_TASK_ID_INVALID_OR_DUPLICATE');
    }
    seen.add(row.task_id);
    return {
      taskId: row.task_id,
      featureId: typeof row.feature_id === 'string' ? row.feature_id : null,
      featureLabel: typeof row.feature_label === 'string' ? row.feature_label : null,
      lane: row.lane,
      status: row.status,
      priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : null,
      attemptCount: Number.isInteger(Number(row.attempt_count)) ? Number(row.attempt_count) : null,
    };
  });
  return {
    schema: KANBAN_READY_TASK_PLAN_SCHEMA_V1,
    status: 'PLAN_ONLY',
    cohort,
    batchSize,
    readyCount: tasks.length,
    tasks,
    writesPerformed: false,
    commandsExecuted: false,
    canonicalAuthority: false,
  };
}
