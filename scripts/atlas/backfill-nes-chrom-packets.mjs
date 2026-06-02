#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const ENV_PATH = path.join(FRONTEND_ROOT, '.env');
const REPORT_JSON_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'nes-chrom-backfill-report.json');
const REPORT_MD_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'nes-chrom-backfill-report.md');
const DEFAULT_DATABASE_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;
const DEFAULT_INPUT_PATH = path.join(REPO_ROOT, 'docs', 'reports', 'missing-features-review-latest.json');

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

function slug(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/[^a-z0-9:_/-]+/g, '_')
    .replace(/\/+/g, '/')
    .replace(/_+/g, '_')
    .replace(/^[_/]+|[_/]+$/g, '')
    .slice(0, 96) || 'unknown';
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function normalizeCandidates(report) {
  const rows = Array.isArray(report?.missingFeatureCandidates) ? report.missingFeatureCandidates : [];
  return rows
    .map((row) => ({
      filePath: toNonEmptyString(row.filePath),
      prefix: toNonEmptyString(row.prefix) ?? '',
      feature: toNonEmptyString(row.feature) ?? 'unknown',
      importErrorCount: Number(row.importErrorCount ?? 0) || 0,
      staticImportCount: Number(row.staticImportCount ?? 0) || 0,
      stableKey: toNonEmptyString(row.stableKey) ?? sha256(String(row.filePath ?? 'unknown')).slice(0, 12),
    }))
    .filter((row) => row.filePath)
    .sort((a, b) => b.importErrorCount - a.importErrorCount || a.filePath.localeCompare(b.filePath));
}

function buildSummary(candidate) {
  return [
    `NES/Glyph seed packet for ${candidate.feature}`,
    `sourceRef=${candidate.filePath}`,
    `prefix=${candidate.prefix || 'unknown'}`,
    `importErrors=${candidate.importErrorCount}`,
    `staticImports=${candidate.staticImportCount}`,
  ].join(' | ');
}

function buildPacketKey(featureId, queryHash, chunkId) {
  return ['nes', slug(featureId), queryHash.slice(0, 16), slug(chunkId).slice(0, 64)].join(':');
}

function buildMarkdown(report) {
  const lines = [
    '# NES Chrom Backfill Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Inputs',
    '',
    `- source report: ${report.inputs.sourceReportPath}`,
    `- source candidates: ${report.inputs.candidateCount}`,
    `- limit: ${report.inputs.limit}`,
    '',
    '## Outputs',
    '',
    `- packets written: ${report.outputs.packetsWritten}`,
    `- hits written: ${report.outputs.hitsWritten}`,
    `- kag_dag_runs seeded: ${report.outputs.kagDagRunsWritten}`,
    '',
    '## Top Packets',
    '',
    ...(report.outputs.topPackets.length > 0
      ? report.outputs.topPackets.map((row) => `- ${row.packet_key} :: ${row.source_ref} :: ${row.feature_id}`)
      : ['- none']),
    '',
    '## Notes',
    '',
    '- This backfill seeds packet rows from the existing missing-feature analysis so the NES/Glyph lane has live rows to query.',
    '- The packet writer path remains unchanged; this only materializes durable rows for the read/query lane.',
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  const env = loadEnv();
  const { values } = parseArgs({
    options: {
      dryRun: { type: 'boolean', default: false },
      apply: { type: 'boolean', default: false },
      limit: { type: 'string' },
      input: { type: 'string' },
    },
    allowPositionals: false,
    strict: false,
  });

  const dryRun = Boolean(values.dryRun) || !Boolean(values.apply);
  const limit = clampInt(values.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const inputPath = toNonEmptyString(values.input) ?? DEFAULT_INPUT_PATH;

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input report not found: ${inputPath}`);
  }

  const report = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const candidates = normalizeCandidates(report).slice(0, limit);
  if (candidates.length === 0) {
    throw new Error('No missing-feature candidates available for NES/Glyph backfill');
  }

  const databaseUrl = process.env.DATABASE_URL || env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

  const seedQuery = 'nes-glyph backfill from missing-features review';
  const queryHash = sha256(seedQuery);
  const runMetadata = {
    sourceReportPath: path.relative(REPO_ROOT, inputPath).replace(/\\/g, '/'),
    candidateCount: candidates.length,
    seed: 'missing-features-review-latest.json',
    mode: dryRun ? 'dry-run' : 'apply',
  };

  const packets = candidates.map((candidate) => {
    const featureId = candidate.feature;
    const sourceRef = candidate.filePath;
    const chunkId = candidate.stableKey;
    const packetKey = buildPacketKey(featureId, queryHash, chunkId);
    const sourceRefs = [sourceRef];
    const summary = buildSummary(candidate);
    const payload = {
      seed: true,
      lane: 'nes_glyph_seed',
      query: seedQuery,
      queryHash,
      sourceRef,
      sourceRefs,
      featureId,
      filePath: candidate.filePath,
      prefix: candidate.prefix,
      stableKey: candidate.stableKey,
      importErrorCount: candidate.importErrorCount,
      staticImportCount: candidate.staticImportCount,
    };
    const score = Math.min(1, Math.max(0, candidate.importErrorCount / Math.max(candidate.staticImportCount || 1, 1)));
    return {
      packetKey,
      queryHash,
      chunkId,
      sourceRef,
      sourceRefs,
      featureId,
      summary,
      payload,
      score,
      nodeKey: candidate.prefix || candidate.feature,
      evidence: {
        sourceReportPath: runMetadata.sourceReportPath,
        stableKey: candidate.stableKey,
        importErrorCount: candidate.importErrorCount,
        staticImportCount: candidate.staticImportCount,
      },
    };
  });

  const now = new Date().toISOString();
  const reportOut = {
    schema: 'nes_glyph_backfill_report.v1',
    generatedAt: now,
    mode: dryRun ? 'dry-run' : 'apply',
    inputs: {
      sourceReportPath: runMetadata.sourceReportPath,
      candidateCount: candidates.length,
      limit,
    },
    outputs: {
      kagDagRunsWritten: dryRun ? 0 : 1,
      packetsWritten: dryRun ? 0 : packets.length,
      hitsWritten: dryRun ? 0 : packets.length,
      topPackets: packets.slice(0, 10).map((p) => ({
        packet_key: p.packetKey,
        source_ref: p.sourceRef,
        feature_id: p.featureId,
      })),
    },
    queryHash,
    note: 'Seeds NES/Glyph packets from the missing-features analysis so the packet lane is live and searchable.',
  };

  if (dryRun) {
    fs.mkdirSync(path.dirname(REPORT_JSON_PATH), { recursive: true });
    fs.writeFileSync(REPORT_JSON_PATH, `${JSON.stringify(reportOut, null, 2)}\n`, 'utf8');
    fs.writeFileSync(REPORT_MD_PATH, buildMarkdown(reportOut), 'utf8');
    console.log(`[nes-glyph-backfill] dry-run packets=${packets.length} hits=${packets.length}`);
    console.log(`[nes-glyph-backfill] json=${REPORT_JSON_PATH}`);
    console.log(`[nes-glyph-backfill] md=${REPORT_MD_PATH}`);
    await pool.end();
    return;
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const runInsert = await client.query(
        `
          INSERT INTO kag_dag_runs (
            query, query_hash, intent, status, model, total_duration_ms,
            final_answer, final_json, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
          RETURNING id
        `,
        [
          seedQuery,
          queryHash,
          'nes_glyph_backfill',
          'completed',
          'gemma4-rotorquant:latest',
          0,
          'NES/Glyph backfill seed packets generated from the missing-features analysis.',
          JSON.stringify({ ok: true, packets: packets.length, source: runMetadata.sourceReportPath }),
          JSON.stringify(runMetadata),
        ],
      );
      const runId = runInsert.rows[0]?.id ?? null;

      const packetIds = [];
      for (const packet of packets) {
        const upsert = await client.query(
          `
            INSERT INTO nes_chrom_packets (
              packet_key, query_hash, chunk_id, source_ref, source_refs, feature_id,
              packet_type, lane, model, summary, payload, embedding, qdrant_point_id,
              kag_dag_run_id, kag_node_key, token_budget, created_at, updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5::jsonb, $6,
              'nes_chrom', 'semantic_packet', 'gemma4-rotorquant:latest', $7, $8::jsonb, NULL, NULL,
              $9, $10, 6000, NOW(), NOW()
            )
            ON CONFLICT (packet_key) DO UPDATE SET
              summary = EXCLUDED.summary,
              payload = EXCLUDED.payload,
              source_refs = EXCLUDED.source_refs,
              kag_dag_run_id = EXCLUDED.kag_dag_run_id,
              kag_node_key = EXCLUDED.kag_node_key,
              token_budget = EXCLUDED.token_budget,
              updated_at = NOW()
            RETURNING id
          `,
          [
            packet.packetKey,
            packet.queryHash,
            packet.chunkId,
            packet.sourceRef,
            JSON.stringify(packet.sourceRefs),
            packet.featureId,
            packet.summary,
            JSON.stringify(packet.payload),
            runId,
            packet.nodeKey,
          ],
        );
        const packetId = upsert.rows[0]?.id;
        if (packetId) packetIds.push(packetId);
      }

      if (packetIds.length > 0) {
        await client.query(`DELETE FROM nes_chrom_kag_dag_hits WHERE packet_id = ANY($1::uuid[])`, [packetIds]);
      }

      for (let i = 0; i < packets.length; i += 1) {
        const packet = packets[i];
        const packetId = packetIds[i];
        if (!packetId) continue;
        await client.query(
          `
            INSERT INTO nes_chrom_kag_dag_hits (
              packet_id, run_id, chunk_id, source_ref, hit_type, score, node_key, created_at
            )
            VALUES ($1, $2, $3, $4, 'seeded', $5, $6, NOW())
          `,
          [
            packetId,
            runId,
            packet.chunkId,
            packet.sourceRef,
            packet.score,
            packet.nodeKey,
          ],
        );
      }

      await client.query('COMMIT');

      reportOut.outputs.kagDagRunsWritten = 1;
      reportOut.outputs.packetsWritten = packets.length;
      reportOut.outputs.hitsWritten = packets.length;
      fs.mkdirSync(path.dirname(REPORT_JSON_PATH), { recursive: true });
      fs.writeFileSync(REPORT_JSON_PATH, `${JSON.stringify(reportOut, null, 2)}\n`, 'utf8');
      fs.writeFileSync(REPORT_MD_PATH, buildMarkdown(reportOut), 'utf8');

      console.log(`[nes-glyph-backfill] packets=${packets.length} hits=${packets.length}`);
      console.log(`[nes-glyph-backfill] json=${REPORT_JSON_PATH}`);
      console.log(`[nes-glyph-backfill] md=${REPORT_MD_PATH}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[nes-glyph-backfill] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
