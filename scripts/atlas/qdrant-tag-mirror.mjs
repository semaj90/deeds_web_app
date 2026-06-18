#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INPUT_NDJSON = path.join(REPO_ROOT, '.tmp', 'addressable-packets.ndjson');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'qdrant-tag-mirror-audit.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'qdrant-tag-mirror-audit.md');
const QDRANT_URL = String(process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/+$/, '');

const argv = process.argv.slice(2);
const APPLY_REQUESTED = argv.includes('--apply');
const VERIFY_REQUESTED = argv.includes('--verify');
const LIMIT = parseIntFlag(argv, '--limit', 0);
const SAMPLE = parseIntFlag(argv, '--sample', 8);

function parseIntFlag(args, name, fallback) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) {
    const parsed = Number.parseInt(inline.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const idx = args.findIndex((arg) => arg === name);
  if (idx >= 0 && idx < args.length - 1) {
    const parsed = Number.parseInt(args[idx + 1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort();
}

function parseNdjson(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return {
          __invalid: true,
          __line: index + 1,
          __error: error instanceof Error ? error.message : String(error),
        };
      }
    });
}

async function qdrantJson(method, pathname, body) {
  const url = new URL(pathname, `${QDRANT_URL}/`);
  const response = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { ok: response.ok, status: response.status, parsed, text };
}

function buildPatch(packet) {
  const laneIds = uniqueStrings([
    packet.identity_lane,
    packet.packet_kind,
    packet.ledger_type,
    ...Array.isArray(packet.lane_ids) ? packet.lane_ids : [],
    packet.feature_id,
    packet.qdrant_collection,
    packet.community_id === null || packet.community_id === undefined ? '' : String(packet.community_id),
  ]);
  const tags = uniqueStrings([
    ...Array.isArray(packet.tags) ? packet.tags : [],
    packet.feature_label,
    packet.packet_kind,
    packet.identity_lane,
    packet.qdrant_collection,
  ]);
  const patch = {
    packet_key: packet.packet_key || null,
    canonical_source_ref: packet.canonical_source_ref || null,
    source_ref: packet.source_ref || null,
    source_ref_key: packet.source_ref_key || null,
    feature_id: packet.feature_id || null,
    feature_label: packet.feature_label || null,
    lane_ids: laneIds,
    tags,
    bm25_text: packet.bm25_text || null,
    concepts: Array.isArray(packet.concepts) ? packet.concepts : [],
    packet_kind: packet.packet_kind || packet.identity_lane || null,
    ledger_type: packet.ledger_type || null,
    community_id: packet.community_id ?? null,
    community_conf: packet.community_conf ?? null,
    qdrant_payload_key: packet.qdrant_payload_key || null,
    qdrant_vector_dim: packet.qdrant_vector_dim ?? null,
    content_hash: packet.content_hash || null,
    chunk_id: packet.chunk_id || null,
    tree_node_id: packet.tree_node_id || null,
    glyph_record_id: packet.glyph_record_id || null,
    neo4j_node_id: packet.neo4j_node_id || null,
    embedding_ref: packet.embedding_ref || packet.vector_ref || null,
    payload_backfilled_at: new Date().toISOString(),
  };
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)));
}

async function updateQdrantPayload(collection, pointId, patch) {
  const point = /^\d+$/.test(String(pointId)) ? Number(pointId) : pointId;
  const response = await qdrantJson('POST', `/collections/${encodeURIComponent(collection)}/points/payload`, {
    points: [point],
    payload: patch,
    wait: true,
  });
  return response;
}

async function main() {
  const raw = await fs.readFile(INPUT_NDJSON, 'utf8').catch(() => '');
  const packets = parseNdjson(raw).filter((row) => row && !row.__invalid);
  const selected = LIMIT > 0 ? packets.slice(0, LIMIT) : packets;

  const summary = {
    inputRows: packets.length,
    selectedRows: selected.length,
    eligibleRows: 0,
    patchedRows: 0,
    skippedNoQdrantPointId: 0,
    skippedNoQdrantCollection: 0,
    skippedNoChanges: 0,
    failures: 0,
    qdrantReachable: false,
  };

  const samples = [];

  if (VERIFY_REQUESTED) {
    try {
      const probe = await qdrantJson('GET', '/collections');
      summary.qdrantReachable = probe.ok;
    } catch {
      summary.qdrantReachable = false;
    }
  }

  for (const packet of selected) {
    if (!normalizeText(packet.qdrant_point_id)) {
      summary.skippedNoQdrantPointId += 1;
      continue;
    }
    if (!normalizeText(packet.qdrant_collection)) {
      summary.skippedNoQdrantCollection += 1;
      continue;
    }
    const patch = buildPatch(packet);
    const patchKeys = Object.keys(patch);
    if (patchKeys.length === 0) {
      summary.skippedNoChanges += 1;
      continue;
    }

    summary.eligibleRows += 1;
    if (samples.length < SAMPLE) {
      samples.push({
        packet_key: packet.packet_key,
        qdrant_collection: packet.qdrant_collection,
        qdrant_point_id: packet.qdrant_point_id,
        patch_keys: patchKeys,
      });
    }

    if (APPLY_REQUESTED) {
      try {
        const result = await updateQdrantPayload(packet.qdrant_collection, packet.qdrant_point_id, patch);
        if (!result.ok) {
          summary.failures += 1;
          continue;
        }
        summary.patchedRows += 1;
      } catch {
        summary.failures += 1;
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY_REQUESTED ? 'apply' : 'dry-run',
    inputPath: path.relative(REPO_ROOT, INPUT_NDJSON).replace(/\\/g, '/'),
    summary: {
      ...summary,
      patchRatePct: summary.eligibleRows > 0 ? Number(((summary.patchedRows / summary.eligibleRows) * 100).toFixed(2)) : 0,
    },
    samples,
    status: APPLY_REQUESTED
      ? (summary.failures > 0 ? 'APPLY_WITH_ERRORS' : 'APPLIED')
      : 'DRY_RUN_READY',
    nextSafeAction: APPLY_REQUESTED
      ? 'Run the materializer again only if the packet ledger changed; do not re-embed or recreate collections.'
      : 'Review the dry-run patch list, then re-run with --apply once the addressable packet materializer has produced rows.',
  };

  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const md = [
    '# Qdrant Tag Mirror Audit',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    '',
    '## Summary',
    '',
    `- input rows: ${summary.inputRows}`,
    `- selected rows: ${summary.selectedRows}`,
    `- eligible rows: ${summary.eligibleRows}`,
    `- patched rows: ${summary.patchedRows}`,
    `- skipped no qdrant_point_id: ${summary.skippedNoQdrantPointId}`,
    `- skipped no qdrant_collection: ${summary.skippedNoQdrantCollection}`,
    `- skipped no changes: ${summary.skippedNoChanges}`,
    `- failures: ${summary.failures}`,
    `- patch rate: ${report.summary.patchRatePct}%`,
    '',
    '## Samples',
    '',
    ...samples.map((item) => `- ${item.packet_key || '(missing packet_key)'} | ${item.qdrant_collection} | ${item.qdrant_point_id} | ${item.patch_keys.join(', ')}`),
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
    '',
  ].join('\n');

  await fs.writeFile(REPORT_MD, md, 'utf8');

  console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_JSON)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_MD)}`);
  console.log(JSON.stringify({
    status: report.status,
    eligibleRows: summary.eligibleRows,
    patchedRows: summary.patchedRows,
    failures: summary.failures,
    qdrantReachable: summary.qdrantReachable,
  }, null, 2));
}

main().catch((error) => {
  console.error('[qdrant-tag-mirror] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
