#!/usr/bin/env node
/**
 * patch-neschrom97-qdrant-tags.mjs
 *
 * Bounded Qdrant payload write-back for NESCHROM97.
 *
 * Behavior:
 *   - default: dry-run
 *   - --apply: patch Qdrant payloads
 *
 * Inputs:
 *   - neschrom97/cards/*.json
 *   - live nes_chrom_packets rows from Postgres
 *   - existing Qdrant payloads for the resolved point ids
 *
 * Outputs:
 *   - docs/reports/neschrom97-qdrant-tag-apply-report.json
 *   - docs/reports/neschrom97-qdrant-tag-apply-report.md
 *
 * Scope:
 *   - collection: codebase_chunks_768
 *   - do not touch legal_documents
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';
import {
  readJson,
  topEntries,
  writeJson,
  writeMarkdown,
} from './_atlas-utils.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const DEFAULT_DATABASE_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const CARDS_DIR = path.join(REPO_ROOT, 'neschrom97', 'cards');
const PACKET_REPORT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'neschrom97-card-registry.json');
const OUTPUT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'neschrom97-qdrant-tag-apply-report.json');
const OUTPUT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'neschrom97-qdrant-tag-apply-report.md');
const COLLECTION = 'codebase_chunks_768';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const APPLY = process.argv.includes('--apply');
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? Math.max(1, Number.parseInt(LIMIT_ARG.split('=')[1], 10) || 0) : 0;
const CHUNK_SIZE = 100;
const qdrant = new QdrantClient({ url: QDRANT_URL });

function normalizeSourceRef(value) {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^file:/, '')
    .replace(/^\.?\//, '')
    .replace(/^sveltekit-frontend\//, '');
}

function directoryFromSourceRef(sourceRef) {
  const normalized = normalizeSourceRef(sourceRef);
  if (!normalized) return null;
  const dir = path.posix.dirname(normalized);
  return dir === '.' ? null : dir;
}

function cleanString(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanString).filter(Boolean))];
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function normalizeQdrantPointId(value) {
  const text = cleanString(value);
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);
  return text;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const splitAt = trimmed.indexOf('=');
    if (splitAt < 0) continue;
    const key = trimmed.slice(0, splitAt).trim();
    let value = trimmed.slice(splitAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function loadCards() {
  if (!fs.existsSync(CARDS_DIR)) return [];
  const files = fs.readdirSync(CARDS_DIR).filter((file) => file.endsWith('.json') && file !== 'index.json').sort();
  const cards = [];

  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(CARDS_DIR, file), 'utf8'));
      const sourceRefRaw = cleanString(raw.source ?? raw.source_ref ?? raw.path ?? raw.file_path);
      const sourceRef = normalizeSourceRef(sourceRefRaw);
      const featureId = cleanString(raw.feature_id ?? raw.featureId ?? raw.feature_ids?.[0] ?? raw.featureIds?.[0]);
      cards.push({
        id: cleanString(raw.id) ?? file.replace(/\.json$/, ''),
        file,
        source_ref: sourceRef,
        source_ref_raw: sourceRefRaw,
        feature_id: featureId,
        feature_label: cleanString(raw.title),
        directory_path: directoryFromSourceRef(sourceRef),
        tags: cleanStringArray(raw.tags),
        som_cluster: cleanString(raw.som_cluster ?? raw.somCluster),
        gpu_cluster: cleanString(raw.gpuCluster ?? raw.gpu_cluster),
        generated_at: cleanString(raw.generated_at),
      });
    } catch {
      // skip invalid local card JSON
    }
  }

  return cards;
}

async function loadLivePackets() {
  const env = {
    ...loadEnvFile(path.join(FRONTEND_ROOT, '.env')),
    ...loadEnvFile(path.join(FRONTEND_ROOT, '.env.local')),
    ...process.env,
  };
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL || DEFAULT_DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 3000,
  });

  try {
    const relation = await pool.query(`select to_regclass('public.nes_chrom_packets') as table_name`);
    if (!relation.rows[0]?.table_name) {
      return { reachable: false, error: 'nes_chrom_packets missing', packets: [] };
    }

    const { rows } = await pool.query(`
      select
        id::text as packet_id,
        packet_key,
        source_ref,
        source_refs,
        feature_id,
        feature_ids,
        qdrant_point_id,
        payload,
        created_at
      from nes_chrom_packets
      where qdrant_point_id is not null
        and source_ref is not null
        and source_ref <> ''
      order by updated_at desc nulls last, created_at desc nulls last
      limit 50000
    `);

    const packets = rows.map((row) => {
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
      const sourceRefs = unique([row.source_ref, ...cleanStringArray(row.source_refs)].map(normalizeSourceRef));
      return {
        packet_id: cleanString(row.packet_id),
        packet_key: cleanString(row.packet_key ?? row.packet_id),
        source_ref: normalizeSourceRef(row.source_ref),
        source_refs: sourceRefs,
        feature_id: cleanString(row.feature_id) ?? cleanStringArray(row.feature_ids)[0] ?? null,
        qdrant_point_id: normalizeQdrantPointId(row.qdrant_point_id),
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : cleanString(row.created_at),
        payload,
      };
    });

    return { reachable: true, error: null, packets };
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error), packets: [] };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function retrieveQdrantPoints(ids) {
  if (!ids.length) return [];
  const points = [];
  const failures = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const batch = ids.slice(i, i + CHUNK_SIZE);
    try {
      const result = await qdrant.retrieve(COLLECTION, {
        ids: batch,
        with_payload: true,
      });
      const batchPoints = Array.isArray(result) ? result : Array.isArray(result?.points) ? result.points : [];
      points.push(...batchPoints);
      continue;
    } catch {
      // fall through to per-id fallback below
    }

    for (const id of batch) {
      try {
        const result = await qdrant.retrieve(COLLECTION, {
          ids: [id],
          with_payload: true,
        });
        const batchPoints = Array.isArray(result) ? result : Array.isArray(result?.points) ? result.points : [];
        points.push(...batchPoints);
      } catch {
        failures.push(String(id));
      }
    }
  }
  return { points, failures };
}

async function setPayload(pointId, payload) {
  const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload?wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, points: [pointId] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Qdrant set payload failed for ${pointId}: ${response.status} ${body}`);
  }
}

function buildTargetRows(cards, packets) {
  const cardsBySourceRef = new Map();
  const cardsByStem = new Map();

  for (const card of cards) {
    if (!card.source_ref) continue;
    if (!cardsBySourceRef.has(card.source_ref)) cardsBySourceRef.set(card.source_ref, []);
    cardsBySourceRef.get(card.source_ref).push(card);

    const stem = path.posix.basename(card.source_ref).replace(/\.[^.]+$/, '');
    if (!cardsByStem.has(stem)) cardsByStem.set(stem, []);
    cardsByStem.get(stem).push(card);
  }

  const matched = [];
  const unmatched = [];
  const pointIds = new Set();

  for (const packet of packets) {
    const sourceRef = normalizeSourceRef(packet.source_ref);
    const stem = path.posix.basename(sourceRef).replace(/\.[^.]+$/, '');
    const card = cardsBySourceRef.get(sourceRef)?.[0] ?? cardsByStem.get(stem)?.[0] ?? null;
    if (!card) {
      unmatched.push({
        packet_key: packet.packet_key,
        qdrant_point_id: packet.qdrant_point_id,
        source_ref: sourceRef,
        feature_id: packet.feature_id,
      });
      continue;
    }

    const baseTags = new Set(Array.isArray(packet.payload?.tags) ? packet.payload.tags.filter(Boolean).map(String) : []);
    const derivedTags = [
      'surface:neschrom97',
      'surface:hyperrag',
      `card:${card.id}`,
      card.source_ref ? `source_ref:${card.source_ref}` : null,
      packet.packet_key ? `packet:${packet.packet_key}` : null,
      card.feature_id ? `feature:${card.feature_id}` : null,
      card.directory_path ? `directory:${card.directory_path}` : null,
    ].filter(Boolean);

    for (const tag of derivedTags) baseTags.add(tag);

    matched.push({
      card_id: card.id,
      packet_key: packet.packet_key,
      qdrant_point_id: packet.qdrant_point_id,
      source_ref: card.source_ref,
      feature_id: card.feature_id ?? packet.feature_id ?? null,
      feature_label: card.feature_label,
      directory_path: card.directory_path,
      tags: [...baseTags],
      source_tag_count: Array.isArray(packet.payload?.tags) ? packet.payload.tags.length : 0,
      added_tag_count: [...baseTags].length - (Array.isArray(packet.payload?.tags) ? packet.payload.tags.length : 0),
    });
    const normalizedPointId = normalizeQdrantPointId(packet.qdrant_point_id);
    if (normalizedPointId !== null) pointIds.add(normalizedPointId);
  }

  return {
    matched,
    unmatched,
    pointIds: [...pointIds],
  };
}

function buildReport({ cards, livePackets, targetRows, qdrantPoints, retrieveFailures }) {
  const tagHistogram = new Map();
  for (const row of targetRows.matched) {
    for (const tag of row.tags) {
      tagHistogram.set(tag, (tagHistogram.get(tag) ?? 0) + 1);
    }
  }

  const summary = {
    cardsTotal: cards.length,
    livePacketsTotal: livePackets.packets.length,
    matchedPackets: targetRows.matched.length,
    unmatchedPackets: targetRows.unmatched.length,
    retrievedQdrantPoints: qdrantPoints.length,
    retrieveFailures: retrieveFailures.length,
    applyMode: APPLY,
    limit: LIMIT || null,
  };

  return {
    schema: 'neschrom97_qdrant_tag_apply.v1',
    generatedAt: new Date().toISOString(),
    collection: COLLECTION,
    qdrantUrl: QDRANT_URL,
    scope: {
      readOnly: !APPLY,
      excludedCollections: ['legal_documents'],
    },
    inputs: {
      cardsDir: 'neschrom97/cards',
      packetRegistry: 'docs/reports/neschrom97-card-registry.json',
    },
    summary,
    topTags: topEntries(tagHistogram, 20).map(({ key, value }) => ({ tag: key, count: value })),
    matchedSamples: targetRows.matched.slice(0, 25),
    unmatchedSamples: targetRows.unmatched.slice(0, 25),
    qdrantSamples: qdrantPoints.slice(0, 10).map((point) => ({
      id: String(point.id),
      payload_tags: Array.isArray(point.payload?.tags) ? point.payload.tags : [],
      payload_source_ref: cleanString(point.payload?.source_ref ?? point.payload?.sourceRef),
      payload_feature_id: cleanString(point.payload?.feature_id ?? point.payload?.featureId),
    })),
    retrieveFailures: retrieveFailures.slice(0, 50),
    nextActions: APPLY
      ? [
          'Write the matched payloads to codebase_chunks_768.',
          'Keep legal_documents untouched.',
        ]
      : [
          'Review matched samples.',
          'Run again with --apply only if the matched set looks correct.',
        ],
  };
}

function buildMarkdown(report) {
  return [
    '# NESCHROM97 Qdrant Tag Apply Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- read only: ${report.scope.readOnly}`,
    `- cards total: ${report.summary.cardsTotal}`,
    `- live packets total: ${report.summary.livePacketsTotal}`,
    `- matched packets: ${report.summary.matchedPackets}`,
    `- unmatched packets: ${report.summary.unmatchedPackets}`,
    `- retrieved Qdrant points: ${report.summary.retrievedQdrantPoints}`,
    '',
    '## Top Tags',
    '',
    ...(report.topTags.length ? report.topTags.map((entry) => `- ${entry.tag}: ${entry.count}`) : ['- none']),
    '',
    '## Matched Samples',
    '',
    ...(report.matchedSamples.length
      ? report.matchedSamples.map((row) =>
          `- ${row.card_id} :: ${row.packet_key} :: ${row.qdrant_point_id} :: ${row.source_ref} :: ${row.feature_id ?? 'n/a'}`
        )
      : ['- none']),
    '',
    '## Unmatched Samples',
    '',
    ...(report.unmatchedSamples.length
      ? report.unmatchedSamples.map((row) =>
          `- ${row.packet_key} :: ${row.qdrant_point_id} :: ${row.source_ref} :: ${row.feature_id ?? 'n/a'}`
        )
      : ['- none']),
    '',
    '## Next Actions',
    '',
    ...report.nextActions.map((action) => `- ${action}`),
  ].join('\n');
}

async function main() {
  const cards = await loadCards();
  const livePackets = await loadLivePackets();

  if (!livePackets.reachable) {
    console.error(`[neschrom97-qdrant-tag-apply] Postgres unavailable: ${livePackets.error}`);
    process.exit(1);
  }

  const targetRows = buildTargetRows(cards, livePackets.packets);
  const pointIds = targetRows.pointIds;
  const retrieveResult = await retrieveQdrantPoints(pointIds.slice(0, LIMIT || pointIds.length));
  const qdrantPoints = retrieveResult.points;

  const report = buildReport({
    cards,
    livePackets,
    targetRows,
    qdrantPoints,
    retrieveFailures: retrieveResult.failures,
  });

  if (!APPLY) {
    writeJson(OUTPUT_JSON, report);
    writeMarkdown(OUTPUT_MD, buildMarkdown(report));
    console.log(`[neschrom97-qdrant-tag-apply] dry-run report written to ${OUTPUT_JSON}`);
    console.log(`[neschrom97-qdrant-tag-apply] dry-run report written to ${OUTPUT_MD}`);
    console.log(`[neschrom97-qdrant-tag-apply] matched=${report.summary.matchedPackets} unmatched=${report.summary.unmatchedPackets} retrieveFailures=${report.summary.retrieveFailures}`);
    return;
  }

  let patched = 0;
  const targetMap = new Map(targetRows.matched.map((row) => [String(row.qdrant_point_id), row]));
  const idsToPatch = qdrantPoints.map((point) => normalizeQdrantPointId(point.id)).filter((id) => id !== null && targetMap.has(String(id)));

  for (const pointId of idsToPatch) {
    const row = targetMap.get(String(pointId));
    if (!row) continue;
    await setPayload(pointId, {
      tags: row.tags,
      card_id: row.card_id,
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      feature_label: row.feature_label,
      directory_path: row.directory_path,
      surface: 'neschrom97',
    });
    patched++;
  }

  const applyReport = {
    ...report,
    summary: {
      ...report.summary,
      patchedPoints: patched,
    },
  };

  writeJson(OUTPUT_JSON, applyReport);
  writeMarkdown(OUTPUT_MD, buildMarkdown(applyReport));
  console.log(`[neschrom97-qdrant-tag-apply] patched=${patched}`);
  console.log(`[neschrom97-qdrant-tag-apply] report written to ${OUTPUT_JSON}`);
  console.log(`[neschrom97-qdrant-tag-apply] report written to ${OUTPUT_MD}`);
}

main().catch((error) => {
  console.error('[neschrom97-qdrant-tag-apply]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
