#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '..', '..');

function parseArgs(args) {
  const out = {
    query: null,
    latencyMs: 0,
    vectorHits: 0,
    trigramHits: 0,
    ftsHits: 0,
    selectedPacketKey: null,
    selectedPacketKeys: [],
    selectedFeatureId: null,
    featureIds: [],
    fusionScore: null,
    cacheHit: false,
    surface: process.env.OPENCODE ? 'opencode' : 'script',
    environment: 'phase-3d-retrieval-telemetry',
    retrievalStrategy: 'script',
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--query') out.query = next, i += 1;
    else if (arg === '--latency-ms') out.latencyMs = Number(next ?? 0), i += 1;
    else if (arg === '--vector-hits') out.vectorHits = Number(next ?? 0), i += 1;
    else if (arg === '--trigram-hits') out.trigramHits = Number(next ?? 0), i += 1;
    else if (arg === '--fts-hits') out.ftsHits = Number(next ?? 0), i += 1;
    else if (arg === '--selected-packet-key') out.selectedPacketKey = next ?? null, i += 1;
    else if (arg === '--selected-packet-keys') out.selectedPacketKeys = splitList(next), i += 1;
    else if (arg === '--selected-feature-id') out.selectedFeatureId = next ?? null, i += 1;
    else if (arg === '--feature-ids') out.featureIds = splitList(next), i += 1;
    else if (arg === '--fusion-score') out.fusionScore = Number(next ?? 0), i += 1;
    else if (arg === '--cache-hit') out.cacheHit = true;
    else if (arg === '--surface') out.surface = next ?? out.surface, i += 1;
    else if (arg === '--environment') out.environment = next ?? out.environment, i += 1;
    else if (arg === '--retrieval-strategy') out.retrievalStrategy = next ?? out.retrievalStrategy, i += 1;
  }

  return out;
}

function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDbUrl(url) {
  if (!url) return null;
  return url.replace('@0.0.0.0:', '@127.0.0.1:');
}

async function readStdinJson() {
  if (process.stdin.isTTY) return null;
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

async function insertTelemetry(signal) {
  const { Client } = await import('pg');
  const databaseUrl = normalizeDbUrl(process.env.DATABASE_URL);
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured');

  const query = String(signal.query ?? '').slice(0, 2000);
  if (!query) throw new Error('--query is required');

  const queryHash = crypto.createHash('sha256').update(query).digest('hex');
  const selectedPacketKeys = splitList(signal.selectedPacketKeys?.join?.(',') ?? signal.selectedPacketKeys);
  const featureIds = splitList(signal.featureIds?.join?.(',') ?? signal.featureIds);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `
        insert into retrieval_telemetry (
          query, query_hash, latency_ms, vector_hits, trigram_hits, fts_hits,
          selected_packet_key, selected_packet_keys, selected_feature_id, feature_ids,
          fusion_score, cache_hit, surface, environment, retrieval_strategy
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $12, $13, $14, $15)
      `,
      [
        query,
        queryHash,
        Math.max(0, Math.round(Number(signal.latencyMs ?? signal.latency_ms ?? 0))),
        Math.max(0, Math.round(Number(signal.vectorHits ?? signal.vector_hits ?? 0))),
        Math.max(0, Math.round(Number(signal.trigramHits ?? signal.trigram_hits ?? 0))),
        Math.max(0, Math.round(Number(signal.ftsHits ?? signal.fts_hits ?? 0))),
        signal.selectedPacketKey ?? signal.selected_packet_key ?? selectedPacketKeys[0] ?? null,
        JSON.stringify(selectedPacketKeys),
        signal.selectedFeatureId ?? signal.selected_feature_id ?? featureIds[0] ?? null,
        JSON.stringify(featureIds),
        signal.fusionScore ?? signal.fusion_score ?? null,
        Boolean(signal.cacheHit ?? signal.cache_hit),
        signal.surface ?? 'script',
        signal.environment ?? 'phase-3d-retrieval-telemetry',
        signal.retrievalStrategy ?? signal.retrieval_strategy ?? 'script',
      ],
    );
  } finally {
    await client.end();
  }
}

async function main() {
  loadAtlasEnv(APP_ROOT);
  const args = parseArgs(process.argv.slice(2));
  const stdin = await readStdinJson();
  const signal = { ...args, ...(stdin ?? {}) };
  await insertTelemetry(signal);
  console.log(JSON.stringify({
    ok: true,
    query: String(signal.query ?? '').slice(0, 80),
    selectedPacketKey: signal.selectedPacketKey ?? signal.selected_packet_key ?? null,
    selectedFeatureId: signal.selectedFeatureId ?? signal.selected_feature_id ?? null,
  }, null, 2));
}

main().catch((err) => {
  console.error('[capture-retrieval-telemetry] failed:', err?.message ?? err);
  process.exit(1);
});
