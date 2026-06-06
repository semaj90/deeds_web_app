#!/usr/bin/env node
import path from 'node:path';
import {
  PATHS,
  ROOT,
  appendJsonl,
  loadRecommendationSnapshot,
  normalizeSnapshotRecommendations,
  readJsonl,
  shouldPromoteRecommendation,
  taskCreateEventFromRecommendation,
  taskIdFromRecommendation,
} from './task-registry-helpers.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

function latestRecommendationByKey(events) {
  const map = new Map();
  for (const event of events) {
    if (!event || event.__parse_error__) continue;
    const key = event.recommendation_key ?? event.title ?? event.event_id;
    if (!key) continue;
    map.set(key, event);
  }
  return map;
}

function existingTaskIds(taskEvents) {
  const ids = new Set();
  const byRecommendation = new Set();
  for (const event of taskEvents) {
    if (!event || event.__parse_error__) continue;
    if (event.task_id) ids.add(event.task_id);
    if (event.source_recommendation_key) byRecommendation.add(event.source_recommendation_key);
  }
  return { ids, byRecommendation };
}

function renderPromotionMarkdown(rows) {
  const lines = [];
  lines.push('# Recommendation Promotion');
  lines.push('');
  lines.push(`- promoted: ${rows.length}`);
  lines.push('');
  for (const row of rows) {
    lines.push(`- ${row.task_id}: ${row.title} (${row.status})`);
    if (row.command) lines.push(`  - command: \`${row.command}\``);
    if (row.source_recommendation_key) lines.push(`  - source: \`${row.source_recommendation_key}\``);
  }
  return lines.join('\n');
}

async function main() {
  const snapshot = await loadRecommendationSnapshot();
  const normalized = normalizeSnapshotRecommendations(snapshot.payload ?? {}, snapshot.sourceFile ?? PATHS.graphRecommendationsJson);
  const recommendationEvents = await readJsonl(PATHS.recommendationEvents);
  const taskEvents = await readJsonl(PATHS.taskEvents);
  const latestByKey = latestRecommendationByKey(recommendationEvents);
  const taskPresence = existingTaskIds(taskEvents);

  const promotable = [];
  for (const row of latestByKey.values()) {
    const normalizedRow = {
      recommendation_key: row.recommendation_key ?? row.title ?? row.event_id,
      title: row.title ?? row.recommendation_key ?? 'untitled recommendation',
      description: row.description ?? '',
      severity: row.severity ?? 'MEDIUM',
      command: row.command ?? null,
      source: row.source ?? null,
      source_refs: row.source_refs ?? [],
      evidence_refs: row.evidence_refs ?? [],
      feature_id: row.feature_id ?? null,
    };
    if (!shouldPromoteRecommendation(normalizedRow)) continue;
    const taskId = taskIdFromRecommendation(normalizedRow);
    if (taskPresence.ids.has(taskId) || taskPresence.byRecommendation.has(normalizedRow.recommendation_key)) continue;
    promotable.push(taskCreateEventFromRecommendation(normalizedRow, snapshot.payload?.generatedAt ?? new Date().toISOString()));
  }

  const appended = DRY_RUN ? 0 : await appendJsonl(PATHS.taskEvents, promotable);

  const summary = {
    ok: true,
    dryRun: DRY_RUN,
    recommendationEvents: recommendationEvents.length,
    taskEvents: taskEvents.length,
    promoted: promotable.length,
    appendedEvents: appended,
    recommendationRows: normalized.length,
    taskEventsPath: path.relative(ROOT, PATHS.taskEvents),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
