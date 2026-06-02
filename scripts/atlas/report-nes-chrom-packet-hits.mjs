#!/usr/bin/env node

import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const ENV_PATH = path.join(FRONTEND_ROOT, '.env');
const REPORT_JSON_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'nes-chrom-packet-recent-hits.json');
const REPORT_MD_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'nes-chrom-packet-recent-hits.md');
const DEFAULT_DATABASE_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const splitAt = trimmed.indexOf('=');
    if (splitAt === -1) continue;
    const key = trimmed.slice(0, splitAt).trim();
    let value = trimmed.slice(splitAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function toNonEmptyString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => toNonEmptyString(entry)).filter(Boolean))];
}

function round(value) {
  return Number(value.toFixed(4));
}

function ratio(numerator, denominator) {
  if (!denominator) return 0;
  return round(numerator / denominator);
}

function tally(values) {
  const counts = new Map();
  for (const value of values) {
    const normalized = toNonEmptyString(value);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ value, count }));
}

function sampleMissing(rows, field) {
  return rows.slice(0, 25).map((row) => ({
    packetId: row.id,
    packetKey: row.packet_key,
    queryHash: row.query_hash,
    chunkId: row.chunk_id,
    field,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));
}

function buildWhereClause(filters, params) {
  const clauses = [];

  if (filters.sourceRef) {
    params.push(filters.sourceRef);
    const sourceRefParam = `$${params.length}`;
    clauses.push(`(
      p.source_ref = ${sourceRefParam}
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(p.source_refs, '[]'::jsonb)) AS src(ref)
        WHERE src.ref = ${sourceRefParam}
      )
      OR EXISTS (
        SELECT 1
        FROM nes_chrom_kag_dag_hits h_filter
        WHERE h_filter.packet_id = p.id
          AND h_filter.source_ref = ${sourceRefParam}
      )
    )`);
  }

  if (filters.featureId) {
    params.push(filters.featureId);
    clauses.push(`p.feature_id = $${params.length}`);
  }

  if (filters.queryHash) {
    params.push(filters.queryHash);
    clauses.push(`p.query_hash = $${params.length}`);
  }

  if (filters.parentAtlasCardId) {
    params.push(filters.parentAtlasCardId);
    const parentParam = `$${params.length}`;
    clauses.push(`(
      COALESCE(p.payload->>'parentAtlasCardId', p.payload->>'parent_atlas_card_id') = ${parentParam}
      OR EXISTS (
        SELECT 1
        FROM nes_chrom_kag_dag_hits h_filter
        WHERE h_filter.packet_id = p.id
          AND COALESCE(h_filter.metadata->>'parentAtlasCardId', h_filter.metadata->>'parent_atlas_card_id') = ${parentParam}
      )
    )`);
  }

  return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
}

function buildMarkdown(report) {
  const missingFeatureRows = report.missing.featureId;
  const missingSourceRows = report.missing.sourceRef;
  const topSourceRefs = report.top.sourceRefs;
  const topFeatureIds = report.top.featureIds;
  const lines = [
    '# NES Chrom Packet Recent Hits',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Inspection',
    '',
    `1. Writer path: ${report.inspection.writerPath}`,
    `2. ACE assembly hook path: ${report.inspection.aceAssemblyHookPath}`,
    `3. Read/query path: ${report.inspection.readQueryPath ?? 'none found before this report script'}`,
    `4. DB table names: ${report.tables.packetTable}, ${report.tables.hitTable}`,
    `5. Existing report paths: ${report.inspection.existingReportPaths.join(', ')}`,
    `6. sourceRef/sourceRefs preserved: ${report.integrity.sourceRefPreserved ? 'yes' : 'no'} / ${report.integrity.sourceRefsPreserved ? 'yes' : 'no'}`,
    `7. featureId/feature_id preserved: ${report.integrity.featureIdPreserved ? 'yes' : 'no'}`,
    `8. parentAtlasCardId/parent_atlas_card_id preserved: ${report.integrity.parentAtlasCardIdPreserved ? 'yes' : 'no'}`,
    `9. CHR97 and NES chrom lane relationship: ${report.inspection.chr97VsNesChrom}`,
    `10. Recommended canonical report path: ${report.inspection.canonicalReportPath}`,
    '',
    '## Counts',
    '',
    `- packets: ${report.counts.packets}`,
    `- hits: ${report.counts.hits}`,
    '',
    '## Database Status',
    '',
    `- packet table present: ${report.databaseStatus.packetTablePresent ? 'yes' : 'no'}`,
    `- hit table present: ${report.databaseStatus.hitTablePresent ? 'yes' : 'no'}`,
    `- note: ${report.databaseStatus.note}`,
    '',
    '## Coverage',
    '',
    `- sourceRef: ${report.coverage.sourceRef}`,
    `- featureId: ${report.coverage.featureId}`,
    `- parentAtlasCardId: ${report.coverage.parentAtlasCardId}`,
    `- queryHash: ${report.coverage.queryHash}`,
    `- chunkId: ${report.coverage.chunkId}`,
    '',
    '## Replay Spine',
    '',
    `- sourceRef + feature_id intact: ${report.integrity.sourceRefFeatureIdReplaySpineIntact ? 'yes' : 'no'}`,
    `- packets with sourceRefs array: ${report.integrity.sourceRefsPreserved ? 'all sampled packets' : 'incomplete'}`,
    '',
    '## Top SourceRefs',
    '',
    ...(topSourceRefs.length > 0 ? topSourceRefs.slice(0, 10).map((entry) => `- ${entry.value}: ${entry.count}`) : ['- none']),
    '',
    '## Top FeatureIds',
    '',
    ...(topFeatureIds.length > 0 ? topFeatureIds.slice(0, 10).map((entry) => `- ${entry.value}: ${entry.count}`) : ['- none']),
    '',
    '## Missing feature_id rows',
    '',
    ...(missingFeatureRows.length > 0 ? missingFeatureRows.map((row) => `- ${row.packetKey} (${row.createdAt})`) : ['- none']),
    '',
    '## Missing sourceRef rows',
    '',
    ...(missingSourceRows.length > 0 ? missingSourceRows.map((row) => `- ${row.packetKey} (${row.createdAt})`) : ['- none']),
    '',
    '## Notes',
    '',
    `- parentAtlasCardId coverage reflects payload/metadata presence only; there is no dedicated packet-table column for it in the current lane.`,
    `- This script is read-only and reports on the existing NES chrom packet tables without mutating schemas, packets, or retrieval behavior.`,
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const env = loadEnv();
  const { values } = parseArgs({
    options: {
      sourceRef: { type: 'string' },
      featureId: { type: 'string' },
      queryHash: { type: 'string' },
      parentAtlasCardId: { type: 'string' },
      limit: { type: 'string' },
    },
    allowPositionals: false,
    strict: false,
  });

  const filters = {
    sourceRef: toNonEmptyString(values.sourceRef),
    featureId: toNonEmptyString(values.featureId),
    queryHash: toNonEmptyString(values.queryHash),
    parentAtlasCardId: toNonEmptyString(values.parentAtlasCardId),
    limit: clampInt(values.limit, DEFAULT_LIMIT, 1, MAX_LIMIT),
  };

  const databaseUrl = process.env.DATABASE_URL || env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

  try {
    const relationCheck = await pool.query(`
      SELECT
        to_regclass('public.nes_chrom_packets') AS packet_table,
        to_regclass('public.nes_chrom_kag_dag_hits') AS hit_table
    `);
    const relationRow = relationCheck.rows[0] ?? {};
    const packetTablePresent = Boolean(relationRow.packet_table);
    const hitTablePresent = Boolean(relationRow.hit_table);

    if (!packetTablePresent || !hitTablePresent) {
      const report = {
        schema: 'nes_chrom_packet_recent_hits_report.v1',
        generatedAt: new Date().toISOString(),
        tables: {
          packetTable: 'nes_chrom_packets',
          hitTable: 'nes_chrom_kag_dag_hits',
        },
        counts: {
          packets: 0,
          hits: 0,
        },
        coverage: {
          sourceRef: 0,
          featureId: 0,
          parentAtlasCardId: 0,
          queryHash: 0,
          chunkId: 0,
        },
        missing: {
          featureId: [],
          sourceRef: [],
        },
        top: {
          sourceRefs: [],
          featureIds: [],
        },
        filters: {
          sourceRef: filters.sourceRef,
          featureId: filters.featureId,
          queryHash: filters.queryHash,
          parentAtlasCardId: filters.parentAtlasCardId,
          limit: filters.limit,
        },
        inspection: {
          writerPath: 'sveltekit-frontend/src/lib/server/features/ai/ace/nes-chrom-packet-service.ts',
          aceAssemblyHookPath: 'sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts',
          readQueryPath: 'sveltekit-frontend/src/routes/api/atlas/nes-chrom/+server.ts',
          existingReportPaths: ['docs/reports/nes-chrom-packet-kag-dag-map.md', 'docs/reports/nes-chrom-packet-recent-hits.{json,md}'],
          chr97VsNesChrom: 'separate-but-adjacent lanes: CHR97 is the cartridge fast-path search lane; NES chrom is the durable ACE packet + hit report lane.',
          canonicalReportPath: 'docs/reports/nes-chrom-packet-kag-dag-map.md + docs/reports/nes-chrom-packet-recent-hits.{json,md}',
        },
        integrity: {
          sourceRefPreserved: true,
          sourceRefsPreserved: true,
          featureIdPreserved: true,
          parentAtlasCardIdPreserved: false,
          sourceRefFeatureIdReplaySpineIntact: true,
        },
        databaseStatus: {
          packetTablePresent,
          hitTablePresent,
          note: 'One or both NES chrom tables are absent in the current database; integrity fields below reflect code-path inspection, while counts and coverage reflect the live relation gap.',
        },
      };

      await mkdir(path.dirname(REPORT_JSON_PATH), { recursive: true });
      await writeFile(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      await writeFile(REPORT_MD_PATH, buildMarkdown(report), 'utf8');

      console.log(`[nes-chrom-report] packets=${report.counts.packets} hits=${report.counts.hits}`);
      console.log(`[nes-chrom-report] json=${REPORT_JSON_PATH}`);
      console.log(`[nes-chrom-report] md=${REPORT_MD_PATH}`);
      console.warn('[nes-chrom-report] one or both NES chrom relations are missing in the current database');
      return;
    }

    const params = [];
    const whereClause = buildWhereClause(filters, params);
    params.push(filters.limit);
    const limitParam = `$${params.length}`;
    const packetQuery = `
      SELECT
        p.id,
        p.packet_key,
        p.query_hash,
        p.chunk_id,
        p.source_ref,
        p.source_refs,
        p.feature_id,
        p.packet_type,
        p.lane,
        p.model,
        p.summary,
        p.payload,
        p.qdrant_point_id,
        p.kag_dag_run_id,
        p.kag_node_key,
        p.created_at,
        p.updated_at,
        COALESCE(p.payload->>'parentAtlasCardId', p.payload->>'parent_atlas_card_id') AS parent_atlas_card_id,
        COALESCE(p.payload->>'sourceRef', p.payload->>'source_ref', p.source_ref) AS payload_source_ref,
        COALESCE(p.payload->>'featureId', p.payload->>'feature_id', p.feature_id) AS payload_feature_id
      FROM nes_chrom_packets p
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ${limitParam}
    `;

    const packetResult = await pool.query(packetQuery, params);
    const packets = packetResult.rows;
    const packetIds = packets.map((row) => row.id);
    const hits = packetIds.length > 0
      ? (
          await pool.query(
            `
              SELECT
                h.id,
                h.packet_id,
                h.run_id,
                h.chunk_id,
                h.source_ref,
                h.hit_type,
                h.score,
                h.node_key,
                h.evidence,
                h.created_at
              FROM nes_chrom_kag_dag_hits h
              WHERE h.packet_id = ANY($1::uuid[])
              ORDER BY h.created_at DESC
            `,
            [packetIds],
          )
        ).rows
      : [];

    const hitsByPacket = new Map();
    for (const hit of hits) {
      const packetId = String(hit.packet_id);
      const list = hitsByPacket.get(packetId) ?? [];
      list.push(hit);
      hitsByPacket.set(packetId, list);
    }

    const packetRows = packets.map((row) => {
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
      const sourceRefs = toStringArray(row.source_refs);
      const parentAtlasCardId =
        toNonEmptyString(row.parent_atlas_card_id) ??
        toNonEmptyString(payload.parentAtlasCardId) ??
        toNonEmptyString(payload.parent_atlas_card_id);
      return {
        ...row,
        payload,
        source_refs: sourceRefs,
        parent_atlas_card_id: parentAtlasCardId,
        payload_source_ref: toNonEmptyString(row.payload_source_ref),
        payload_feature_id: toNonEmptyString(row.payload_feature_id),
      };
    });

    const packetsWithSourceRef = packetRows.filter((row) => toNonEmptyString(row.source_ref) || row.payload_source_ref).length;
    const packetsWithFeatureId = packetRows.filter((row) => toNonEmptyString(row.feature_id) || row.payload_feature_id).length;
    const packetsWithParentAtlas = packetRows.filter((row) => {
      if (row.parent_atlas_card_id) return true;
      const packetHits = hitsByPacket.get(String(row.id)) ?? [];
      return packetHits.some((hit) => {
        const metadata = hit.metadata && typeof hit.metadata === 'object' ? hit.metadata : {};
        return toNonEmptyString(metadata.parentAtlasCardId) || toNonEmptyString(metadata.parent_atlas_card_id);
      });
    }).length;
    const packetsWithQueryHash = packetRows.filter((row) => toNonEmptyString(row.query_hash)).length;
    const packetsWithChunkId = packetRows.filter((row) => toNonEmptyString(row.chunk_id)).length;

    const missingFeatureRows = packetRows.filter((row) => !toNonEmptyString(row.feature_id));
    const missingSourceRows = packetRows.filter((row) => !toNonEmptyString(row.source_ref));
    const sourceRefsPreserved = packetRows.every((row) => row.source_refs.length > 0);
    const sourceRefPreserved = packetRows.every((row) => {
      const sourceRef = toNonEmptyString(row.source_ref);
      if (!sourceRef) return false;
      return row.source_refs.includes(sourceRef);
    });
    const featureIdPreserved = packetRows.every((row) => Boolean(toNonEmptyString(row.feature_id)));
    const parentAtlasCardIdPreserved = packetRows.every((row) => Boolean(row.parent_atlas_card_id));
    const replaySpineIntact = packetRows.every((row) => Boolean(toNonEmptyString(row.source_ref) && toNonEmptyString(row.feature_id)));
    const topSourceRefs = tally(packetRows.flatMap((row) => row.source_refs.length > 0 ? row.source_refs : [row.source_ref]));
    const topFeatureIds = tally(packetRows.map((row) => row.feature_id));

    const report = {
      schema: 'nes_chrom_packet_recent_hits_report.v1',
      generatedAt: new Date().toISOString(),
      tables: {
        packetTable: 'nes_chrom_packets',
        hitTable: 'nes_chrom_kag_dag_hits',
      },
      counts: {
        packets: packetRows.length,
        hits: hits.length,
      },
      coverage: {
        sourceRef: ratio(packetsWithSourceRef, packetRows.length),
        featureId: ratio(packetsWithFeatureId, packetRows.length),
        parentAtlasCardId: ratio(packetsWithParentAtlas, packetRows.length),
        queryHash: ratio(packetsWithQueryHash, packetRows.length),
        chunkId: ratio(packetsWithChunkId, packetRows.length),
      },
      missing: {
        featureId: sampleMissing(missingFeatureRows, 'feature_id'),
        sourceRef: sampleMissing(missingSourceRows, 'source_ref'),
      },
      top: {
        sourceRefs: topSourceRefs.slice(0, 10),
        featureIds: topFeatureIds.slice(0, 10),
      },
      filters: {
        sourceRef: filters.sourceRef,
        featureId: filters.featureId,
        queryHash: filters.queryHash,
        parentAtlasCardId: filters.parentAtlasCardId,
        limit: filters.limit,
      },
      inspection: {
        writerPath: 'sveltekit-frontend/src/lib/server/features/ai/ace/nes-chrom-packet-service.ts',
        aceAssemblyHookPath: 'sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts',
        readQueryPath: 'sveltekit-frontend/src/routes/api/atlas/nes-chrom/+server.ts',
        existingReportPaths: ['docs/reports/nes-chrom-packet-kag-dag-map.md', 'docs/reports/nes-chrom-packet-recent-hits.{json,md}'],
        chr97VsNesChrom: 'separate-but-adjacent lanes: CHR97 is the cartridge fast-path search lane; NES chrom is the durable ACE packet + hit report lane.',
        canonicalReportPath: 'docs/reports/nes-chrom-packet-kag-dag-map.md + docs/reports/nes-chrom-packet-recent-hits.{json,md}',
      },
      integrity: {
        sourceRefPreserved,
        sourceRefsPreserved,
        featureIdPreserved,
        parentAtlasCardIdPreserved,
        sourceRefFeatureIdReplaySpineIntact: replaySpineIntact,
      },
      databaseStatus: {
        packetTablePresent: true,
        hitTablePresent: true,
        note: 'Both NES chrom tables are present in the current database.',
      },
    };

    await mkdir(path.dirname(REPORT_JSON_PATH), { recursive: true });
    await writeFile(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await writeFile(REPORT_MD_PATH, buildMarkdown(report), 'utf8');

    console.log(`[nes-chrom-report] packets=${report.counts.packets} hits=${report.counts.hits}`);
    console.log(`[nes-chrom-report] json=${REPORT_JSON_PATH}`);
    console.log(`[nes-chrom-report] md=${REPORT_MD_PATH}`);
    if (!report.integrity.sourceRefFeatureIdReplaySpineIntact) {
      console.warn('[nes-chrom-report] sourceRef + feature_id replay spine is incomplete in the sampled packets');
    }
    if (!report.integrity.parentAtlasCardIdPreserved) {
      console.warn('[nes-chrom-report] parentAtlasCardId is not preserved across all sampled packets');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[nes-chrom-report] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
