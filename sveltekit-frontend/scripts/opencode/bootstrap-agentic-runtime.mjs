#!/usr/bin/env node
import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  PATHS,
  ROOT,
  appendJsonl,
  nowIso,
  readJson,
  summarizeTaskState,
  statusChangeEvent,
  writeStartupContext,
} from './task-registry-helpers.mjs';
import { loadAtlasEnv } from '../atlas/load-atlas-env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DRY_RUN = process.argv.includes('--dry-run');

function runCommand(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status ?? 1}`);
  }
}

function runNodeScript(relPath) {
  runCommand(process.execPath, [path.join(ROOT, relPath)]);
}

function detectRuntime(envFilesLoaded) {
  return {
    cwd: process.cwd(),
    repoRoot: ROOT,
    vscodeWorkspace: Boolean(process.env.VSCODE_PID || (process.env.TERM_PROGRAM ?? '').includes('vscode')),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    qdrantCollection: process.env.QDRANT_COLLECTION || process.env.CODEBASE_QDRANT_COLLECTION || 'codebase_chunks_768',
    redisHost: process.env.REDIS_HOST || '127.0.0.1',
    hasPackageJson: existsSync(path.join(ROOT, 'package.json')),
    hasOpenCodeTasks: existsSync(PATHS.taskEvents) || existsSync(PATHS.taskStateJson),
    hasTemporalRegistry: existsSync(PATHS.taskStateMd) || existsSync(PATHS.taskStateJson),
    activeTaskCount: 0,
    envFilesLoaded,
  };
}

function buildServiceCheck() {
  return {
    postgresConfigured: Boolean(process.env.DATABASE_URL),
    qdrantConfigured: Boolean(process.env.QDRANT_URL || process.env.QDRANT_COLLECTION || process.env.CODEBASE_QDRANT_COLLECTION),
    redisConfigured: Boolean(process.env.REDIS_URL || process.env.REDIS_HOST || process.env.REDIS_PASSWORD),
    qdrantCollection: process.env.QDRANT_COLLECTION || process.env.CODEBASE_QDRANT_COLLECTION || 'codebase_chunks_768',
    redisHost: process.env.REDIS_HOST || '127.0.0.1',
  };
}

async function main() {
  const envLoad = loadAtlasEnv(ROOT);
  const startupBriefingJsonPath = (await readJson(PATHS.startupBriefingJson)) ? PATHS.startupBriefingJson : path.join(ROOT, '..', '.opencode', 'startup-briefing.json');
  const startupBriefingReport = await readJson(startupBriefingJsonPath);
  const startupBriefing = startupBriefingReport?.briefing ?? startupBriefingReport?.summary ?? startupBriefingReport ?? null;
  const runtime = detectRuntime(envLoad.loadedFiles.map((filePath) => path.relative(ROOT, filePath)));
  runtime.startupBriefingPresent = Boolean(startupBriefingReport);
  runtime.startupBriefingNextLane = startupBriefing?.nextLane ?? null;
  runtime.startupBriefingTasksOpen = startupBriefing?.sinceLastWorked?.tasksOpen ?? null;
  const serviceCheck = buildServiceCheck();

  let state = await readJson(PATHS.taskStateJson);
  if (!state) {
    runNodeScript('scripts/opencode/append-recommendation-events.mjs');
    runNodeScript('scripts/opencode/promote-recommendations-to-tasks.mjs');
    runNodeScript('scripts/opencode/rebuild-task-state.mjs');
    state = await readJson(PATHS.taskStateJson);
  }
  if (!state) throw new Error('task state not found after refresh');

  const selectedTask = summarizeTaskState(state).activeLane;
  runtime.activeTaskCount = Array.isArray(state.tasks)
    ? state.tasks.filter((task) => !['DONE', 'ARCHIVED'].includes(String(task?.status ?? '').toUpperCase())).length
    : 0;

  const activeStatus = String(selectedTask?.status ?? '').toUpperCase();
  const selectedTaskEvent = selectedTask && !['DONE', 'ARCHIVED', 'IN_PROGRESS'].includes(activeStatus)
    ? statusChangeEvent(
        selectedTask.task_id,
        activeStatus || 'TODO',
        'IN_PROGRESS',
        `bootstrap-selected-lane:${selectedTask.source_recommendation_key ?? selectedTask.task_id ?? 'unknown'}`,
        nowIso(),
      )
    : null;

  if (selectedTaskEvent && !DRY_RUN) {
    await appendJsonl(PATHS.taskEvents, [selectedTaskEvent]);
  }

  if (!DRY_RUN) {
    runNodeScript('scripts/opencode/append-recommendation-events.mjs');
    runNodeScript('scripts/opencode/promote-recommendations-to-tasks.mjs');
    runNodeScript('scripts/opencode/rebuild-task-state.mjs');
    state = await readJson(PATHS.taskStateJson);
    if (!state) throw new Error('task state not found after bootstrap refresh');
  }

  const finalSelectedTask = summarizeTaskState(state).activeLane ?? selectedTask;

  await writeStartupContext(state, {
    runtime,
    startupBriefing: startupBriefing
      ? {
          path: path.relative(ROOT, startupBriefingJsonPath),
          nextLane: startupBriefing.nextLane ?? null,
          tasksOpen: startupBriefing.sinceLastWorked?.tasksOpen ?? null,
          productionReadiness: startupBriefing.sinceLastWorked?.productionReadiness ?? null,
        }
      : null,
    selectedTask: finalSelectedTask
      ? {
          taskId: finalSelectedTask.task_id,
          title: finalSelectedTask.title,
          priority: finalSelectedTask.priority,
          status: finalSelectedTask.status,
          command: finalSelectedTask.command ?? null,
          sourceRecommendationKey: finalSelectedTask.source_recommendation_key ?? null,
        }
      : null,
    serviceCheck,
    openLanesTodo: path.join(ROOT, 'reports', 'parent-atlas-open-lanes-todo.md'),
  });

  const summary = {
    ok: true,
    dryRun: DRY_RUN,
    runtime,
    serviceCheck,
    selectedTask: finalSelectedTask
      ? {
          taskId: finalSelectedTask.task_id,
          title: finalSelectedTask.title,
          priority: finalSelectedTask.priority,
          status: finalSelectedTask.status,
          command: finalSelectedTask.command ?? null,
          sourceRecommendationKey: finalSelectedTask.source_recommendation_key ?? null,
        }
      : null,
    taskStatePath: path.relative(ROOT, PATHS.taskStateJson),
    taskEventsPath: path.relative(ROOT, PATHS.taskEvents),
    startupContextPath: path.relative(ROOT, PATHS.startupContext),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
