#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  PATHS,
  ROOT,
  appendJsonl,
  ensureDir,
  loadRecommendationSnapshot,
  normalizeSnapshotRecommendations,
  recommendationEventFromRow,
  readText,
  writeJson,
  writeText,
} from './task-registry-helpers.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

function renderRecommendationsMarkdown(rows, generatedAt, sourceLabel) {
  const lines = [];
  lines.push(`# Recommendations - ${generatedAt}`);
  lines.push('');
  lines.push(`**Source**: ${sourceLabel}`);
  lines.push(`**Total**: ${rows.length} recommendations`);
  lines.push('');
  lines.push('## Top Recommendations');
  lines.push('');
  for (const [index, row] of rows.slice(0, 10).entries()) {
    const sev = String(row.severity ?? 'MEDIUM').toUpperCase();
    lines.push(`${index + 1}. **[${sev}]** \`${row.recommendation_key}\` - ${row.title}`);
    if (row.description) lines.push(`   - ${row.description}`);
    if (row.command) lines.push(`   - \`${row.command}\``);
  }
  lines.push('');
  lines.push('## Files');
  lines.push('');
  for (const row of rows.slice(0, 10)) {
    const refs = (row.evidence_refs ?? row.source_refs ?? []).join(', ');
    if (refs) lines.push(`- ${row.recommendation_key}: ${refs}`);
  }
  return lines.join('\n');
}

async function syncSnapshotFiles(snapshot, rows, sourceLabel) {
  await ensureDir(PATHS.recommendationSnapshotJson);
  await writeJson(PATHS.recommendationSnapshotJson, snapshot.payload ?? {});
  const mdSource = snapshot.sourceMd && existsSync(snapshot.sourceMd) ? snapshot.sourceMd : null;
  if (mdSource) {
    await fs.copyFile(mdSource, PATHS.recommendationSnapshotMd);
  } else {
    await writeText(PATHS.recommendationSnapshotMd, renderRecommendationsMarkdown(rows, snapshot.payload?.generatedAt ?? new Date().toISOString(), sourceLabel));
  }
}

async function main() {
  const snapshot = await loadRecommendationSnapshot();
  const sourceLabel = snapshot.sourceFile ? path.relative(ROOT, snapshot.sourceFile) : 'missing-snapshot';
  const normalized = normalizeSnapshotRecommendations(snapshot.payload ?? {}, snapshot.sourceFile ?? PATHS.graphRecommendationsJson);
  const eventRunId = snapshot.payload?.generatedAt ?? new Date().toISOString();
  const events = normalized.map((row, index) => recommendationEventFromRow(row, eventRunId, index, snapshot.sourceFile));
  const appended = DRY_RUN ? 0 : await appendJsonl(PATHS.recommendationEvents, events);

  if (!DRY_RUN) {
    await syncSnapshotFiles(snapshot, normalized, sourceLabel);
  }

  const summary = {
    ok: true,
    dryRun: DRY_RUN,
    sourceLabel,
    recommendationRows: normalized.length,
    appendedEvents: appended,
    snapshotSource: snapshot.sourceFile ? path.relative(ROOT, snapshot.sourceFile) : null,
    recommendationEventsPath: path.relative(ROOT, PATHS.recommendationEvents),
    snapshotJsonPath: path.relative(ROOT, PATHS.recommendationSnapshotJson),
    snapshotMdPath: path.relative(ROOT, PATHS.recommendationSnapshotMd),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
