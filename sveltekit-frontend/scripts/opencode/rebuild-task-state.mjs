#!/usr/bin/env node
import path from 'node:path';
import {
  PATHS,
  ROOT,
  ensureDir,
  readJsonl,
  renderTaskStateMarkdown,
  summarizeTaskState,
  writeJson,
  writeStartupContext,
  writeText,
  writeTemporalTaskRegistryReport,
} from './task-registry-helpers.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

function compareIso(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''));
}

function buildRecommendationStats(events) {
  const byKey = new Map();
  for (const event of events) {
    if (!event || event.__parse_error__) continue;
    const key = event.recommendation_key ?? event.source_recommendation_key ?? event.title ?? event.event_id;
    if (!key) continue;
    const next = byKey.get(key) ?? {
      count: 0,
      firstSeen: event.created_at ?? event.timestamp ?? null,
      lastSeen: event.created_at ?? event.timestamp ?? null,
      latest: event,
    };
    next.count += 1;
    const created = event.created_at ?? event.timestamp ?? null;
    if (created && (!next.firstSeen || compareIso(created, next.firstSeen) < 0)) next.firstSeen = created;
    if (created && (!next.lastSeen || compareIso(created, next.lastSeen) > 0)) next.lastSeen = created;
    if (created && (!next.latest || compareIso(created, next.latest.created_at ?? next.latest.timestamp ?? '') >= 0)) next.latest = event;
    byKey.set(key, next);
  }
  return byKey;
}

function foldTaskEvents(taskEvents) {
  const tasks = new Map();
  let createdCount = 0;
  for (const event of taskEvents) {
    if (!event || event.__parse_error__) continue;
    const taskId = event.task_id ?? null;
    if (!taskId) continue;
    const next = tasks.get(taskId) ?? {
      task_id: taskId,
      title: event.title ?? event.new_state ?? event.previous_state ?? 'untitled task',
      description: event.description ?? '',
      priority: event.priority ?? 'MEDIUM',
      status: event.status ?? event.new_state ?? 'TODO',
      source_recommendation_key: event.source_recommendation_key ?? null,
      command: event.command ?? null,
      feature_id: event.feature_id ?? null,
      source_refs: event.source_refs ?? [],
      evidence_refs: event.evidence_refs ?? [],
      first_seen: event.created_at ?? event.timestamp ?? null,
      last_seen: event.created_at ?? event.timestamp ?? null,
      created_at: event.created_at ?? event.timestamp ?? null,
      updated_at: event.created_at ?? event.timestamp ?? null,
      history: [],
    };
    const timestamp = event.created_at ?? event.timestamp ?? null;
    if (timestamp && (!next.first_seen || compareIso(timestamp, next.first_seen) < 0)) next.first_seen = timestamp;
    if (timestamp && (!next.last_seen || compareIso(timestamp, next.last_seen) > 0)) next.last_seen = timestamp;
    if (event.event_type === 'TASK_CREATED') {
      createdCount += 1;
      next.title = event.title ?? next.title;
      next.description = event.description ?? next.description;
      next.priority = event.priority ?? next.priority;
      next.status = event.status ?? next.status;
      next.source_recommendation_key = event.source_recommendation_key ?? next.source_recommendation_key;
      next.command = event.command ?? next.command;
      next.feature_id = event.feature_id ?? next.feature_id;
      next.source_refs = event.source_refs ?? next.source_refs;
      next.evidence_refs = event.evidence_refs ?? next.evidence_refs;
      next.created_at = timestamp ?? next.created_at;
      next.updated_at = timestamp ?? next.updated_at;
      next.history.push(event);
    } else if (event.event_type === 'TASK_STATUS_CHANGED') {
      next.status = event.new_state ?? next.status;
      next.updated_at = timestamp ?? next.updated_at;
      next.history.push(event);
    } else if (event.event_type === 'TASK_ARCHIVED') {
      next.status = 'ARCHIVED';
      next.updated_at = timestamp ?? next.updated_at;
      next.history.push(event);
    } else {
      next.history.push(event);
    }
    tasks.set(taskId, next);
  }
  return { tasks, createdCount };
}

function sortTasks(tasks) {
  const priorityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return [...tasks].sort((a, b) => {
    const pa = priorityWeight[String(a.priority ?? '').toUpperCase()] ?? 0;
    const pb = priorityWeight[String(b.priority ?? '').toUpperCase()] ?? 0;
    if (pa !== pb) return pb - pa;
    return String(b.last_seen ?? b.updated_at ?? '').localeCompare(String(a.last_seen ?? a.updated_at ?? ''));
  });
}

async function main() {
  const recommendationEvents = await readJsonl(PATHS.recommendationEvents);
  const taskEvents = await readJsonl(PATHS.taskEvents);
  const recommendationStats = buildRecommendationStats(recommendationEvents);
  const taskFold = foldTaskEvents(taskEvents);
  const tasks = sortTasks(
    [...taskFold.tasks.values()].map((task) => {
      const stats = recommendationStats.get(task.source_recommendation_key ?? '') ?? null;
      return {
        ...task,
        seen_count: stats?.count ?? 0,
        first_seen: task.first_seen ?? stats?.firstSeen ?? task.created_at ?? null,
        last_seen: task.last_seen ?? stats?.lastSeen ?? task.updated_at ?? task.created_at ?? null,
      };
    }),
  );

  const state = {
    generatedAt: new Date().toISOString(),
    recommendationEventsCount: recommendationEvents.filter((row) => !row.__parse_error__).length,
    taskEventsCount: taskEvents.filter((row) => !row.__parse_error__).length,
    promotedRecommendationsCount: taskFold.createdCount,
    tasks,
    recommendationSummary: [...recommendationStats.entries()].map(([recommendation_key, stats]) => ({
      recommendation_key,
      count: stats.count,
      first_seen: stats.firstSeen,
      last_seen: stats.lastSeen,
      title: stats.latest?.title ?? recommendation_key,
      severity: stats.latest?.severity ?? 'MEDIUM',
      command: stats.latest?.command ?? null,
      source: stats.latest?.source ?? null,
      feature_id: stats.latest?.feature_id ?? null,
    })),
  };

  if (!DRY_RUN) {
    await writeJson(PATHS.taskStateJson, state);
    await writeText(PATHS.taskStateMd, renderTaskStateMarkdown(state));
    await writeTemporalTaskRegistryReport(state, {
      sourceFiles: {
        recommendationEvents: path.relative(ROOT, PATHS.recommendationEvents),
        taskEvents: path.relative(ROOT, PATHS.taskEvents),
        recommendationSnapshot: path.relative(ROOT, PATHS.recommendationSnapshotJson),
      },
    });
    await writeStartupContext(state);
  }

  const summary = summarizeTaskState(state);
  console.log(JSON.stringify({
    ok: true,
    dryRun: DRY_RUN,
    generatedAt: state.generatedAt,
    recommendationEvents: state.recommendationEventsCount,
    taskEvents: state.taskEventsCount,
    promotedRecommendations: state.promotedRecommendationsCount,
    taskCount: summary.taskCount,
    openTaskCount: summary.openTaskCount,
    archivedTaskCount: summary.archivedTaskCount,
    taskStatePath: path.relative(ROOT, PATHS.taskStateJson),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
