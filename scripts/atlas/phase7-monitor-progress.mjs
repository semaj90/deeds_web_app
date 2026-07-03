#!/usr/bin/env node
/**
 * Phase 7 summary monitor for Windows/PowerShell or Node shells.
 *
 * Read-only: does not enqueue, purge, ack, or mutate Postgres.
 */

import { execFile } from 'node:child_process';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const RABBITMQ_USER = process.env.RABBITMQ_USER || 'guest';
const RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || 'guest';
const RABBITMQ_BASE = process.env.RABBITMQ_BASE || 'http://127.0.0.1:15672/api';
const QUEUE = process.env.PHASE7_SUMMARY_QUEUE || 'phase7.summarization';
const DLQ = `${QUEUE}.dlq`;
const POSTGRES_CONTAINER = process.env.POSTGRES_CONTAINER || 'legal-ai-postgres';
const POSTGRES_USER = process.env.POSTGRES_USER || 'legal_admin';
const POSTGRES_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const WATCH = process.argv.includes('--watch');
const INTERVAL_MS = Number(process.env.PHASE7_MONITOR_INTERVAL_MS || 30000);

function basicAuth() {
  return `Basic ${Buffer.from(`${RABBITMQ_USER}:${RABBITMQ_PASSWORD}`).toString('base64')}`;
}

async function readQueue(name) {
  const url = `${RABBITMQ_BASE}/queues/%2f/${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { Authorization: basicAuth() } });
  if (!res.ok) {
    throw new Error(`RabbitMQ ${name} ${res.status}: ${await res.text()}`);
  }
  const q = await res.json();
  return {
    name: q.name,
    messages: Number(q.messages || 0),
    ready: Number(q.messages_ready || 0),
    unacked: Number(q.messages_unacknowledged || 0),
    consumers: Number(q.consumers || 0),
  };
}

async function readPostgres() {
  const sql = `
WITH q AS (
  SELECT
    summary,
    cardinality(regexp_split_to_array(btrim(summary), '[[:space:]]+')) AS words
  FROM codebase_chunk_index
  WHERE summary IS NOT NULL AND btrim(summary) <> ''
)
SELECT
  (SELECT COUNT(*) FROM codebase_chunk_index)::int AS total,
  (SELECT COUNT(*) FROM codebase_chunk_index WHERE summary IS NOT NULL AND btrim(summary) <> '')::int AS summarized,
  (SELECT COUNT(*) FROM codebase_chunk_index WHERE summary IS NULL OR btrim(summary) = '')::int AS missing,
  (SELECT COUNT(*) FROM codebase_chunk_index WHERE updated_at > NOW() - INTERVAL '5 minutes' AND summary IS NOT NULL AND btrim(summary) <> '')::int AS last_5min,
  COUNT(*) FILTER (WHERE LENGTH(summary) >= 30 AND words >= 6)::int AS good,
  COUNT(*) FILTER (WHERE summary LIKE '%<end_of_turn>%' OR summary LIKE '%<thinking>%' OR summary LIKE '%<start_of_turn>%' OR summary LIKE '%<|channel%')::int AS contaminated
FROM q;`;

  const { stdout } = await execFileAsync(
    'docker',
    [
      'exec',
      POSTGRES_CONTAINER,
      'psql',
      '-U',
      POSTGRES_USER,
      '-d',
      POSTGRES_DB,
      '-t',
      '-A',
      '-F',
      ',',
      '-c',
      sql,
    ],
    { maxBuffer: 1024 * 1024 }
  );

  const row = stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);
  if (!row) throw new Error('Postgres progress query returned no rows');

  const [total, summarized, missing, last5min, good, contaminated] = row.split(',').map(Number);
  return {
    total,
    summarized,
    missing,
    last5min,
    good,
    contaminated,
    pctComplete: total ? Number(((summarized / total) * 100).toFixed(1)) : 0,
    pctGood: summarized ? Number(((good / summarized) * 100).toFixed(1)) : 0,
  };
}

function formatReport({ queue, dlq, pg }) {
  const duplicatePressure =
    pg.missing > 0 && queue.messages > Math.max(1000, pg.missing * 1.5)
      ? 'WARN_DUPLICATE_PRESSURE'
      : 'OK';
  const health =
    dlq.messages > 0 || pg.contaminated > 0 || queue.consumers < 1 ? 'WARN' : 'LIVE_PASS';
  const etaMinutes = pg.last5min > 0 ? Math.ceil(pg.missing / (pg.last5min / 5)) : null;

  return {
    at: new Date().toISOString(),
    health,
    duplicatePressure,
    queue,
    dlq,
    postgres: pg,
    etaMinutes,
  };
}

async function tick() {
  const [queue, dlq, pg] = await Promise.all([readQueue(QUEUE), readQueue(DLQ), readPostgres()]);
  const report = formatReport({ queue, dlq, pg });

  console.log(
    [
      `[${report.at}] ${report.health} ${report.duplicatePressure}`,
      `summaries=${pg.summarized}/${pg.total} (${pg.pctComplete}%) missing=${pg.missing} last5min=${pg.last5min}`,
      `quality good=${pg.good} (${pg.pctGood}%) contaminated=${pg.contaminated}`,
      `queue messages=${queue.messages} ready=${queue.ready} unacked=${queue.unacked} consumers=${queue.consumers} dlq=${dlq.messages}`,
      `eta=${report.etaMinutes === null ? 'unknown' : `${report.etaMinutes}m`}`,
    ].join(' | ')
  );

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  }
}

async function main() {
  do {
    await tick();
    if (!WATCH) break;
    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
  } while (true);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
