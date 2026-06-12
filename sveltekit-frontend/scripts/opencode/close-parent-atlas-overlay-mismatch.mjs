#!/usr/bin/env node
import path from 'node:path';
import { PATHS, appendJsonl, readJson, readJsonl, statusChangeEvent } from './task-registry-helpers.mjs';

const TASK_ID = 'task_parent_atlas_overlay_mismatch';
const TASK_KEY = 'parent-atlas-overlay-mismatch';
const RUN_ID = 'parent-atlas-overlay-close-20260612';

async function main() {
  const state = await readJson(PATHS.taskStateJson);
  const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
  const task = tasks.find((row) => row?.task_id === TASK_ID);
  if (!task) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: 'task-not-found', taskId: TASK_ID }, null, 2));
    return;
  }

  const currentStatus = String(task.status ?? '').toUpperCase();
  if (currentStatus === 'DONE' || currentStatus === 'ARCHIVED') {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: 'already-closed', taskId: TASK_ID, status: currentStatus }, null, 2));
    return;
  }

  const crosswalk = await readJson(path.join(PATHS.opencodeDir, '..', 'docs', 'reports', 'parent-atlas-overlay-crosswalk-report.json')).catch(() => null);
  const overlaySync = await readJson(path.join(PATHS.opencodeDir, '..', 'docs', 'reports', 'parent-atlas-overlay-sync-report.json')).catch(() => null);
  const rootOnly = Number(crosswalk?.summary?.byRootClassification?.ROOT_CONTRACT_ONLY ?? crosswalk?.summary?.ROOT_CONTRACT_ONLY ?? 0);
  const missingApp = Number(crosswalk?.summary?.byRootClassification?.MISSING_APP_OVERLAY ?? crosswalk?.summary?.MISSING_APP_OVERLAY ?? 0);
  const aligned = Number(overlaySync?.summary?.rootMissingInApp ?? 0) === 0 && Number(overlaySync?.summary?.appMissingInRoot ?? 0) === 0;

  if (missingApp > 0) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: 'missing-app-overlay-still-open', taskId: TASK_ID, missingApp }, null, 2));
    return;
  }

  const reason = aligned
    ? `parent-atlas overlay sync is aligned; crosswalk shows ${rootOnly} ROOT_CONTRACT_ONLY rows and ${missingApp} missing app overlay rows`
    : `parent-atlas overlay crosswalk shows ${rootOnly} ROOT_CONTRACT_ONLY rows and no missing app overlay rows`;

  await appendJsonl(PATHS.taskEvents, [
    statusChangeEvent(TASK_ID, currentStatus || 'TODO', 'DONE', reason, RUN_ID),
  ]);

  console.log(JSON.stringify({
    ok: true,
    skipped: false,
    taskId: TASK_ID,
    sourceRecommendationKey: TASK_KEY,
    previousState: currentStatus || 'TODO',
    newState: 'DONE',
    reason,
    evidenceRefs: [
      'docs/reports/parent-atlas-overlay-crosswalk-report.json',
      'docs/reports/parent-atlas-overlay-sync-report.json',
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
