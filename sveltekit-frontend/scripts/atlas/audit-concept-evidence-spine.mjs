#!/usr/bin/env node
/**
 * Audit the live concept evidence spine.
 *
 * Goal:
 *   Determine whether packet_keys, feature_ids, or evidence_cards are the
 *   authoritative join spine into atlas_packets.
 *
 * Read-only. No mutations.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const JSON_OUT = path.join(REPORTS_DIR, 'concept-evidence-spine-audit-report.json');
const MD_OUT = path.join(REPORTS_DIR, 'concept-evidence-spine-audit-report.md');

function ensureLimit(argv) {
  const match = argv.find((arg) => arg.startsWith('--limit='));
  const value = Number.parseInt(match?.split('=')[1] ?? '0', 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
}

function coveragePct(hit, total) {
  return total > 0 ? Number(((hit / total) * 100).toFixed(2)) : 0;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function chooseSpine(packetKeys, featureIds, evidenceCards) {
  if (packetKeys.length > 0) return { field: 'packet_keys', values: packetKeys };
  if (featureIds.length > 0) return { field: 'feature_ids', values: featureIds };
  if (evidenceCards.length > 0) return { field: 'evidence_cards', values: evidenceCards };
  return { field: 'none', values: [] };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Concept Evidence Spine Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- total concepts: ${report.summary.totalConcepts}`);
  lines.push(`- packet_keys concepts: ${report.summary.packetKeyConcepts}`);
  lines.push(`- feature_ids concepts: ${report.summary.featureIdConcepts}`);
  lines.push(`- evidence_cards concepts: ${report.summary.evidenceCardConcepts}`);
  lines.push(`- packet_keys -> atlas_packets.packet_key coverage: ${report.summary.packetKeyJoinCoveragePct}%`);
  lines.push(`- feature_ids -> atlas_packets.feature_id coverage: ${report.summary.featureIdJoinCoveragePct}%`);
  lines.push(`- evidence_cards -> atlas_packets.packet_id coverage: ${report.summary.evidenceCardJoinCoveragePct}%`);
  lines.push('');
  lines.push('## Classification');
  lines.push('');
  for (const [key, value] of Object.entries(report.summary.classifications)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push('');
  lines.push('## Recommendation');
  lines.push('');
  lines.push(`- canonicalSpine: ${report.summary.canonicalSpine}`);
  lines.push(`- action: ${report.summary.recommendedAction}`);
  lines.push('');
  if (report.samples.length > 0) {
    lines.push('## Samples');
    lines.push('');
    lines.push('| concept_id | label | spine | packet_keys | feature_ids | evidence_cards |');
    lines.push('|---|---|---|---:|---:|---:|');
    for (const sample of report.samples.slice(0, 10)) {
      lines.push(`| \`${sample.conceptId}\` | ${sample.label || ''} | ${sample.spine} | ${sample.packetKeyCount} | ${sample.featureIdCount} | ${sample.evidenceCardCount} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  loadAtlasEnv(REPO_ROOT);
  const dbUrl = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  const limit = ensureLimit(process.argv.slice(2));
  const pool = new Pool({ connectionString: dbUrl, max: 1 });
  const generatedAt = new Date().toISOString();

  try {
    const conceptRes = await pool.query(`
      SELECT concept_id, label, evidence_cards, feature_ids, packet_keys, updated_at
      FROM concept_records
      ORDER BY updated_at DESC NULLS LAST, concept_id ASC
      ${limit > 0 ? 'LIMIT $1' : ''}
    `, limit > 0 ? [limit] : []);

    const atlasRes = await pool.query(`
      SELECT packet_id, packet_key, feature_id
      FROM atlas_packets
      WHERE packet_id IS NOT NULL OR packet_key IS NOT NULL OR feature_id IS NOT NULL
    `);

    const atlasPacketIds = new Set();
    const atlasPacketKeys = new Set();
    const atlasFeatureIds = new Set();
    for (const row of atlasRes.rows) {
      if (row.packet_id) atlasPacketIds.add(String(row.packet_id));
      if (row.packet_key) atlasPacketKeys.add(String(row.packet_key));
      if (row.feature_id) atlasFeatureIds.add(String(row.feature_id));
    }

    const samples = [];
    const classifications = {
      PACKET_KEYS_AUTHORITATIVE: 0,
      FEATURE_IDS_AUTHORITATIVE: 0,
      EVIDENCE_CARDS_AUTHORITATIVE: 0,
      MIXED_SPINE: 0,
      STALE_ONLY: 0,
      NO_SPINE: 0,
    };

    let packetKeyConcepts = 0;
    let featureIdConcepts = 0;
    let evidenceCardConcepts = 0;
    let packetKeyJoinHits = 0;
    let featureIdJoinHits = 0;
    let evidenceCardJoinHits = 0;
    let packetKeyValueCount = 0;
    let featureIdValueCount = 0;
    let evidenceCardValueCount = 0;

    for (const row of conceptRes.rows) {
      const conceptId = String(row.concept_id ?? '').trim();
      const label = String(row.label ?? '').trim();
      const evidenceCards = normalizeList(row.evidence_cards);
      const featureIds = normalizeList(row.feature_ids);
      const packetKeys = normalizeList(row.packet_keys);
      const spine = chooseSpine(packetKeys, featureIds, evidenceCards);

      if (packetKeys.length > 0) packetKeyConcepts += 1;
      if (featureIds.length > 0) featureIdConcepts += 1;
      if (evidenceCards.length > 0) evidenceCardConcepts += 1;

      packetKeyValueCount += packetKeys.length;
      featureIdValueCount += featureIds.length;
      evidenceCardValueCount += evidenceCards.length;

      const packetKeyHits = packetKeys.filter((value) => atlasPacketKeys.has(value)).length;
      const featureIdHits = featureIds.filter((value) => atlasFeatureIds.has(value)).length;
      const evidenceCardHits = evidenceCards.filter((value) => atlasPacketIds.has(value)).length;

      packetKeyJoinHits += packetKeyHits;
      featureIdJoinHits += featureIdHits;
      evidenceCardJoinHits += evidenceCardHits;

      const hasPacketKeys = packetKeys.length > 0;
      const hasFeatureIds = featureIds.length > 0;
      const hasEvidenceCards = evidenceCards.length > 0;

      if (!hasPacketKeys && !hasFeatureIds && !hasEvidenceCards) {
        classifications.NO_SPINE += 1;
      } else if (packetKeyHits >= featureIdHits && packetKeyHits >= evidenceCardHits && packetKeyHits > 0) {
        classifications.PACKET_KEYS_AUTHORITATIVE += 1;
      } else if (featureIdHits >= evidenceCardHits && featureIdHits > 0) {
        classifications.FEATURE_IDS_AUTHORITATIVE += 1;
      } else if (evidenceCardHits > 0) {
        classifications.EVIDENCE_CARDS_AUTHORITATIVE += 1;
      } else if (hasPacketKeys || hasFeatureIds || hasEvidenceCards) {
        classifications.STALE_ONLY += 1;
      } else {
        classifications.MIXED_SPINE += 1;
      }

      if (samples.length < 25) {
        samples.push({
          conceptId,
          label,
          spine: spine.field,
          packetKeyCount: packetKeys.length,
          featureIdCount: featureIds.length,
          evidenceCardCount: evidenceCards.length,
          packetKeyHits,
          featureIdHits,
          evidenceCardHits,
        });
      }
    }

    const canonicalSpine =
      classifications.PACKET_KEYS_AUTHORITATIVE >= classifications.FEATURE_IDS_AUTHORITATIVE &&
      classifications.PACKET_KEYS_AUTHORITATIVE >= classifications.EVIDENCE_CARDS_AUTHORITATIVE
        ? 'packet_keys'
        : classifications.FEATURE_IDS_AUTHORITATIVE >= classifications.EVIDENCE_CARDS_AUTHORITATIVE
          ? 'feature_ids'
          : 'evidence_cards';

    const recommendedAction =
      canonicalSpine === 'packet_keys'
        ? 'Backfill evidence_cards from packet_keys; keep packet_keys as the authoritative live spine.'
        : canonicalSpine === 'feature_ids'
          ? 'Backfill evidence_cards from feature_ids; audit packet_keys coverage before changing the spine.'
          : 'Do not mutate yet; the evidence_cards field still appears authoritative in this slice.';

    const report = {
      generatedAt,
      mode: limit > 0 ? 'sample' : 'full',
      limit,
      summary: {
        totalConcepts: conceptRes.rows.length,
        packetKeyConcepts,
        featureIdConcepts,
        evidenceCardConcepts,
        packetKeyValueCount,
        featureIdValueCount,
        evidenceCardValueCount,
        packetKeyJoinHits,
        featureIdJoinHits,
        evidenceCardJoinHits,
        packetKeyJoinCoveragePct: coveragePct(packetKeyJoinHits, packetKeyValueCount),
        featureIdJoinCoveragePct: coveragePct(featureIdJoinHits, featureIdValueCount),
        evidenceCardJoinCoveragePct: coveragePct(evidenceCardJoinHits, evidenceCardValueCount),
        classifications,
        canonicalSpine,
        recommendedAction,
      },
      samples,
    };

    await fs.mkdir(REPORTS_DIR, { recursive: true });
    await fs.writeFile(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(MD_OUT, `${renderMarkdown(report)}\n`, 'utf8');

    console.log(JSON.stringify({
      ok: true,
      mode: report.mode,
      totalConcepts: report.summary.totalConcepts,
      packetKeyJoinCoveragePct: report.summary.packetKeyJoinCoveragePct,
      featureIdJoinCoveragePct: report.summary.featureIdJoinCoveragePct,
      evidenceCardJoinCoveragePct: report.summary.evidenceCardJoinCoveragePct,
      canonicalSpine: report.summary.canonicalSpine,
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
