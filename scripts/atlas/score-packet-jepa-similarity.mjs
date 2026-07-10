#!/usr/bin/env node
/**
 * Score Packet-JEPA similarity and write additive metrics to atlas_packet_metrics.
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const TMP_DIR = path.join(REPO_ROOT, '.tmp');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const INPUT_LATENTS = path.join(TMP_DIR, 'packet-jepa-latents.ndjson');
const INPUT_PAIRS = path.join(TMP_DIR, 'packet-jepa-training-pairs.ndjson');
const INPUT_REPORT = path.join(REPORTS_DIR, 'packet-jepa-train-report.json');
const OUTPUT_JSONL = path.join(TMP_DIR, 'packet-jepa-similarity-scores.ndjson');
const REPORT_JSON = path.join(REPORTS_DIR, 'packet-jepa-similarity-scores.json');
const REPORT_MD = path.join(REPORTS_DIR, 'packet-jepa-similarity-scores.md');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run') || argv.includes('--dry');
const LIMIT = parseIntFlag(argv, '--limit', 500);
const OFFSET = parseIntFlag(argv, '--offset', 0);

const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });

function parseIntFlag(args, name, fallback) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    const parsed = Number.parseInt(inline.slice(name.length + 1), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const idx = args.findIndex((arg) => arg === name);
  if (idx >= 0 && args[idx + 1]) {
    const parsed = Number.parseInt(args[idx + 1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function readNdjson(absPath) {
  if (!fsSync.existsSync(absPath)) return [];
  return fsSync.readFileSync(absPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readJson(absPath) {
  if (!fsSync.existsSync(absPath)) return null;
  return JSON.parse(fsSync.readFileSync(absPath, 'utf8'));
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na <= 1e-8 || nb <= 1e-8) return 0;
  return dot / Math.sqrt(na * nb);
}

async function ensureColumns(client) {
  await client.query(`
    ALTER TABLE atlas_packet_metrics
    ADD COLUMN IF NOT EXISTS pca_latent real[],
    ADD COLUMN IF NOT EXISTS pca_latent_dim integer,
    ADD COLUMN IF NOT EXISTS jepa_latent real[],
    ADD COLUMN IF NOT EXISTS jepa_latent_dim integer,
    ADD COLUMN IF NOT EXISTS packet_jepa_similarity real,
    ADD COLUMN IF NOT EXISTS jepa_model_version text,
    ADD COLUMN IF NOT EXISTS jepa_trained_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS jepa_scored_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS jepa_evaluation jsonb DEFAULT '{}'::jsonb
  `);
}

function renderMarkdown(report) {
  return [
    '# Packet-JEPA Similarity Scores',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    '',
    '## Summary',
    '',
    `- latent rows: ${report.summary.latentRows}`,
    `- scored rows: ${report.summary.scoredRows}`,
    `- rows written: ${report.summary.rowsWritten}`,
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
    '',
  ].join('\n');
}

async function main() {
  const latentRows = readNdjson(INPUT_LATENTS);
  const pairRows = readNdjson(INPUT_PAIRS);
  const trainingReport = readJson(INPUT_REPORT);
  if (latentRows.length === 0) throw new Error(`Latent file missing or empty: ${INPUT_LATENTS}`);

  const latents = new Map(latentRows.map((row) => [row.packet_key, row]));
  const positiveNeighbors = new Map();
  for (const row of pairRows) {
    if (!positiveNeighbors.has(row.anchor_packet_key)) positiveNeighbors.set(row.anchor_packet_key, new Set());
    if (!positiveNeighbors.has(row.target_packet_key)) positiveNeighbors.set(row.target_packet_key, new Set());
    positiveNeighbors.get(row.anchor_packet_key).add(row.target_packet_key);
    positiveNeighbors.get(row.target_packet_key).add(row.anchor_packet_key);
  }

  const scored = [];
  for (const row of latentRows.slice(OFFSET, OFFSET + LIMIT)) {
    const neighbors = [...(positiveNeighbors.get(row.packet_key) ?? [])].filter((packetKey) => latents.has(packetKey));
    const sims = neighbors.map((packetKey) => cosine(row.jepa_latent, latents.get(packetKey).jepa_latent));
    const similarity = sims.length ? sims.reduce((sum, value) => sum + value, 0) / sims.length : null;
    scored.push({
      packet_key: row.packet_key,
      pca_latent: row.pca_latent,
      pca_latent_dim: Array.isArray(row.pca_latent) ? row.pca_latent.length : null,
      jepa_latent: row.jepa_latent,
      jepa_latent_dim: Array.isArray(row.jepa_latent) ? row.jepa_latent.length : null,
      packet_jepa_similarity: similarity,
      jepa_model_version: 'packet-jepa-v1',
      jepa_evaluation: trainingReport?.evaluation ?? {},
      jepa_trained_at: trainingReport?.generatedAt ?? null,
    });
  }

  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_JSONL, `${scored.map((row) => JSON.stringify(row)).join('\n')}${scored.length ? '\n' : ''}`, 'utf8');

  let rowsWritten = 0;
  const client = await pool.connect();
  try {
    await ensureColumns(client);
    if (!DRY_RUN) {
      for (const row of scored) {
        await client.query(`
          INSERT INTO atlas_packet_metrics (
            packet_key,
            pca_latent,
            pca_latent_dim,
            jepa_latent,
            jepa_latent_dim,
            packet_jepa_similarity,
            jepa_model_version,
            jepa_trained_at,
            jepa_scored_at,
            jepa_evaluation
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9::jsonb)
          ON CONFLICT (packet_key)
          DO UPDATE SET
            pca_latent = EXCLUDED.pca_latent,
            pca_latent_dim = EXCLUDED.pca_latent_dim,
            jepa_latent = EXCLUDED.jepa_latent,
            jepa_latent_dim = EXCLUDED.jepa_latent_dim,
            packet_jepa_similarity = EXCLUDED.packet_jepa_similarity,
            jepa_model_version = EXCLUDED.jepa_model_version,
            jepa_trained_at = EXCLUDED.jepa_trained_at,
            jepa_scored_at = now(),
            jepa_evaluation = EXCLUDED.jepa_evaluation,
            updated_at = now()
        `, [
          row.packet_key,
          row.pca_latent,
          row.pca_latent_dim,
          row.jepa_latent,
          row.jepa_latent_dim,
          row.packet_jepa_similarity,
          row.jepa_model_version,
          row.jepa_trained_at,
          JSON.stringify(row.jepa_evaluation ?? {}),
        ]);
        rowsWritten += 1;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'apply',
    summary: {
      latentRows: latentRows.length,
      scoredRows: scored.length,
      rowsWritten,
    },
    nextSafeAction: 'Wire packet_jepa_similarity into the reranker only after held-out metrics beat the 384d baseline.',
  };
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD, `${renderMarkdown(report)}\n`, 'utf8');

  console.log(JSON.stringify({
    status: 'READY',
    mode: report.mode,
    scoredRows: scored.length,
    rowsWritten,
  }, null, 2));
}

main().catch((error) => {
  console.error('[score-packet-jepa-similarity] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
