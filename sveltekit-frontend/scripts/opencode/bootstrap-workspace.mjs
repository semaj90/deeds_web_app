#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PATHS,
  ROOT,
  ensureDir,
  readJson,
  writeStartupContext,
} from './task-registry-helpers.mjs';
import { writeAgentEnvironmentReport } from './environment-detector.mjs';

const EXTRA_ARGS = process.argv.slice(2);
const refreshStartupTruth = EXTRA_ARGS.includes('--refresh-startup-truth');
const deep = EXTRA_ARGS.includes('--deep');

function runStep(label, args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

async function main() {
  await ensureDir(PATHS.recommendationSnapshotJson);
  await ensureDir(PATHS.taskStateJson);

  runStep('build-codebase-recommendations', [path.join(ROOT, 'scripts', 'build-codebase-recommendations.mjs')]);
  runStep('opencode:tasks:refresh', [path.join(ROOT, 'scripts', 'opencode', 'append-recommendation-events.mjs')]);
  runStep('opencode:tasks:promote', [path.join(ROOT, 'scripts', 'opencode', 'promote-recommendations-to-tasks.mjs')]);
  runStep('opencode:tasks:state', [path.join(ROOT, 'scripts', 'opencode', 'rebuild-task-state.mjs')]);
  await writeAgentEnvironmentReport({
    json: PATHS.agentEnvironmentJson,
    md: PATHS.agentEnvironmentMd,
  });

  const state = await readJson(PATHS.taskStateJson);
  if (!state) throw new Error('task state not found after refresh');

  const startupContext = await writeStartupContext(state, {
    openLanesTodo: path.join(ROOT, 'reports', 'parent-atlas-open-lanes-todo.md'),
  });

  if (refreshStartupTruth || deep) {
    const truth = {
      generatedAt: new Date().toISOString(),
      startupContext,
      taskState: {
        path: path.relative(ROOT, PATHS.taskStateJson),
        md: path.relative(ROOT, PATHS.taskStateMd),
      },
      recommendationSnapshot: {
        path: path.relative(ROOT, PATHS.recommendationSnapshotJson),
        md: path.relative(ROOT, PATHS.recommendationSnapshotMd),
      },
    };
    await fs.writeFile(path.join(ROOT, '.opencode', 'startup-truth.json'), JSON.stringify(truth, null, 2) + '\n', 'utf8');
  }

  console.log(JSON.stringify({
    ok: true,
    generatedAt: startupContext.generatedAt,
    taskState: startupContext.tasks.stateJson,
    recommendationSnapshot: startupContext.recommendations.snapshotJson,
    startupContext: path.relative(ROOT, PATHS.startupContext),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
