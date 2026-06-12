#!/usr/bin/env node
/**
 * Backfill concept_records.evidence_cards from the live packet spine.
 *
 * This lane repairs historical rows where evidence_cards still point at legacy
 * concept card IDs instead of the current packet spine. The canonical write path
 * is now packet_keys / feature_ids, so this script only promotes evidence_cards
 * when a better live mapping exists.
 *
 * Rules:
 * - dry-run by default
 * - --apply required to mutate
 * - --limit supported
 * - write backup/report before any mutation
 * - do not create concepts
 * - do not overwrite non-stale evidence without an improved mapping
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import { resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const JSON_OUT = path.join(REPORTS_DIR, 'concept-evidence-spine-backfill-report.json');
const MD_OUT = path.join(REPORTS_DIR, 'concept-evidence-spine-backfill-report.md');
const BACKUP_OUT = path.join(REPORTS_DIR, 'concept-evidence-spine-backfill-backup.json');

const APPLY = process.argv.includes('--apply');
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Math.max(0, Number(LIMIT_ARG.split('=')[1] ?? 0)) : 0;

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
}

function sameMembers(left, right) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function isLegacyEvidenceCardId(value) {
  return /^[0-9a-f]{8,32}$/i.test(String(value ?? '').trim());
}

function chooseLiveSpine(packetKeys, featureIds) {
  if (packetKeys.length > 0) return { values: packetKeys, source: 'packet_keys' };
  if (featureIds.length > 0) return { values: featureIds, source: 'feature_ids' };
  return { values: [], source: 'none' };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Concept Evidence Spine Backfill');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- mode: ${report.mode}`);
  lines.push(`- limit: ${report.limit > 0 ? report.limit : 'all'}`);
  lines.push(`- totalRows: ${report.summary.totalRows}`);
  lines.push(`- eligibleRows: ${report.summary.eligibleRows}`);
  lines.push(`- updatedRows: ${report.summary.updatedRows}`);
  lines.push(`- skippedRows: ${report.summary.skippedRows}`);
  lines.push(`- missingSpineRows: ${report.summary.missingSpineRows}`);
  lines.push(`- staleLegacyRows: ${report.summary.staleLegacyRows}`);
  lines.push('');
  lines.push('## Coverage');
  lines.push('');
  lines.push(`- packetKeys coverage: ${report.summary.packetKeysCoveragePct}%`);
  lines.push(`- featureIds coverage: ${report.summary.featureIdsCoveragePct}%`);
  lines.push(`- evidenceCards stale-legacy coverage: ${report.summary.staleLegacyCoveragePct}%`);
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- evidence_cards is the live concept evidence spine.');
  lines.push('- packet_keys is the preferred source; feature_ids is used when packet_keys are missing.');
  lines.push('- legacy card IDs remain in the evidence field for historical provenance.');
  lines.push('');
  if (report.samples.length > 0) {
    lines.push('## Samples');
    lines.push('');
    lines.push('| concept_id | source | before | after |');
    lines.push('|------------|--------|--------|-------|');
    for (const sample of report.samples.slice(0, 10)) {
      lines.push(`| ${sample.conceptId} | ${sample.source} | ${sample.beforeCount} | ${sample.afterCount} |`);
    }
    lines.push('');
  }
  lines.push(`- backup: \`${path.relative(REPO_ROOT, BACKUP_OUT)}\``);
  lines.push(`- report: \`${path.relative(REPO_ROOT, JSON_OUT)}\``);
  return lines.join('\n');
}

async function main() {
  loadAtlasEnv(REPO_ROOT);
  const dbUrl = resolveDatabaseUrl(process.env);
  if (!dbUrl) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: dbUrl, max: 1 });
  const generatedAt = new Date().toISOString();

  try {
    const { rows } = await pool.query(`
      SELECT concept_id, label, evidence_cards, feature_ids, packet_keys, updated_at
      FROM concept_records
      ORDER BY updated_at DESC NULLS LAST, concept_id ASC
    `);

    const totalRows = rows.length;
    const candidates = [];
    let packetKeysRows = 0;
    let featureIdsRows = 0;
    let legacyRows = 0;
    let missingSpineRows = 0;

    for (const row of rows) {
      const conceptId = String(row.concept_id ?? '').trim();
      const label = String(row.label ?? '').trim();
      const evidenceCards = normalizeList(row.evidence_cards);
      const featureIds = normalizeList(row.feature_ids);
      const packetKeys = normalizeList(row.packet_keys);
      const spine = chooseLiveSpine(packetKeys, featureIds);

      if (packetKeys.length > 0) packetKeysRows += 1;
      if (featureIds.length > 0) featureIdsRows += 1;
      if (spine.values.length === 0) missingSpineRows += 1;

      const legacyEvidence = evidenceCards.length > 0 && evidenceCards.every(isLegacyEvidenceCardId);
      if (legacyEvidence) legacyRows += 1;

      const improvedMapping =
        legacyEvidence &&
        spine.values.length > 0 &&
        !sameMembers(evidenceCards, spine.values);

      if (!improvedMapping) continue;

      candidates.push({
        conceptId,
        label,
        before: evidenceCards,
        after: spine.values,
        source: spine.source,
        packetKeys,
        featureIds,
      });
    }

    const selected = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates;
    const backupRows = selected.map((row) => ({
      concept_id: row.conceptId,
      label: row.label,
      source: row.source,
      before_evidence_cards: row.before,
      after_evidence_cards: row.after,
      packet_keys: row.packetKeys,
      feature_ids: row.featureIds,
    }));

    await fsp.mkdir(REPORTS_DIR, { recursive: true });
    await fsp.writeFile(BACKUP_OUT, `${JSON.stringify(backupRows, null, 2)}\n`, 'utf8');

    let updatedRows = 0;
    if (APPLY && selected.length > 0) {
      for (const row of selected) {
        await pool.query(
          `
            UPDATE concept_records
            SET evidence_cards = $1::jsonb,
                updated_at = NOW()
            WHERE concept_id = $2
          `,
          [JSON.stringify(row.after), row.conceptId],
        );
        updatedRows += 1;
      }
    } else {
      updatedRows = selected.length;
    }

    const report = {
      generatedAt,
      mode: APPLY ? 'apply' : 'dry-run',
      limit: LIMIT,
      backupPath: path.relative(REPO_ROOT, BACKUP_OUT),
      totalRows,
      samples: selected.slice(0, 10).map((row) => ({
        conceptId: row.conceptId,
        label: row.label,
        source: row.source,
        beforeCount: row.before.length,
        afterCount: row.after.length,
      })),
      summary: {
        totalRows,
        eligibleRows: candidates.length,
        updatedRows,
        skippedRows: totalRows - candidates.length,
        missingSpineRows,
        staleLegacyRows: legacyRows,
        packetKeysCoveragePct: totalRows ? Number(((packetKeysRows / totalRows) * 100).toFixed(2)) : 0,
        featureIdsCoveragePct: totalRows ? Number(((featureIdsRows / totalRows) * 100).toFixed(2)) : 0,
        staleLegacyCoveragePct: totalRows ? Number(((legacyRows / totalRows) * 100).toFixed(2)) : 0,
      },
    };

    await fsp.writeFile(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fsp.writeFile(MD_OUT, `${renderMarkdown(report)}\n`, 'utf8');

    console.log(JSON.stringify({
      ok: true,
      mode: report.mode,
      limit: LIMIT,
      totalRows,
      eligibleRows: candidates.length,
      updatedRows,
      backupPath: path.relative(REPO_ROOT, BACKUP_OUT),
      reportPath: path.relative(REPO_ROOT, JSON_OUT),
    }, null, 2));
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
