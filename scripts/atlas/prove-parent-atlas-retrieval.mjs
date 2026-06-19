#!/usr/bin/env node
/**
 * Parent Atlas deterministic retrieval proof.
 *
 * For each query:
 *   1. delete only its hyperrag exact-match cache keys
 *   2. run cold
 *   3. run warm
 *   4. run warm again
 *   5. compare packet identity and rank ordering
 *
 * No canonical datastore writes. Redis writes are limited to the normal
 * `hyperrag:query:*` runtime cache namespace and replay traces.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import Redis from 'ioredis';
import { loadRepoEnv, resolveRedisConfig, REPO_ROOT } from './connection-config.mjs';

const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-proof-of-truth.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-proof-of-truth.md');
const QUERY_SOURCE = path.join(REPO_ROOT, 'docs', 'reports', 'replay-trace-summary.json');
const ENDPOINT = process.env.HYPERRAG_PACKET_RPC_URL ?? 'http://127.0.0.1:5173/api/hyperrag/packet-rpc';
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const positionalLimit = process.argv.slice(2).find((arg) => /^\d+$/.test(arg));
const LIMIT = Number(
  limitArg?.split('=')[1]
    ?? positionalLimit
    ?? process.env.ATLAS_PROOF_LIMIT
    ?? 50,
);

function queryHash(query) {
  return crypto.createHash('sha256').update(query.trim().toLowerCase()).digest('hex').slice(0, 16);
}

function roundScore(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Number(number.toFixed(8)) : 0;
}

function normalizePackets(payload) {
  return (payload?.packets ?? []).map((packet, index) => ({
    rank: Number(packet.rank ?? index + 1),
    packet_key: String(packet.packet_key ?? ''),
    source_ref: String(packet.source_ref ?? ''),
    canonical_source_ref: String(packet.canonical_source_ref ?? packet.source_ref ?? ''),
    feature_id: packet.feature_id == null ? null : String(packet.feature_id),
    fusion_score: roundScore(packet.fusion_score),
  }));
}

function identitySignature(packets) {
  return packets.map((packet) => [
    packet.rank,
    packet.packet_key,
    packet.source_ref,
    packet.canonical_source_ref,
    packet.feature_id,
  ]);
}

function scoreSignature(packets) {
  return packets.map((packet) => packet.fusion_score);
}

async function callPacketRpc(query) {
  const startedAt = Date.now();
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query,
      limit: 5,
      includeGraph: true,
      useFts: true,
      recordTelemetry: false,
      useExactMatchCache: true,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) {
    throw new Error(`HTTP ${response.status}: ${body.error ?? 'packet RPC failed'}`);
  }
  return {
    duration_ms: Date.now() - startedAt,
    cache_hit: Number(body.trace?.cache_hits ?? 0) > 0,
    cache_source: body.trace?.cache_source ?? null,
    cache_namespace: body.trace?.cache_namespace ?? null,
    replay_id: body.trace?.replay_id ?? null,
    retrieval_strategy: body.trace?.retrieval_strategy ?? body.strategy ?? null,
    packets: normalizePackets(body),
  };
}

async function readQueries() {
  const report = JSON.parse(await fs.readFile(QUERY_SOURCE, 'utf8'));
  const queries = (report.results ?? []).map((row) => String(row.query ?? '').trim()).filter(Boolean);
  if (queries.length < LIMIT) {
    throw new Error(`Need ${LIMIT} replay queries, found ${queries.length} in ${path.relative(REPO_ROOT, QUERY_SOURCE)}`);
  }
  return queries.slice(0, LIMIT);
}

async function main() {
  const queries = await readQueries();
  const env = loadRepoEnv(process.env);
  const redisConfig = resolveRedisConfig(env);
  const redis = new Redis(redisConfig.url, {
    password: redisConfig.password,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  await redis.connect();
  await redis.ping();

  const rows = [];
  try {
    for (let index = 0; index < queries.length; index++) {
      const query = queries[index];
      const hash = queryHash(query);
      const cacheKey = `hyperrag:query:${hash}`;
      const row = {
        index: index + 1,
        query,
        query_hash: hash,
        cold: null,
        warm: null,
        warm_again: null,
        errors: [],
        attempts: [],
      };

      for (let attempt = 1; attempt <= 2; attempt++) {
        await redis.del(cacheKey, `${cacheKey}:prov`);
        const attemptRow = { attempt, cold: null, warm: null, warm_again: null, errors: [], proof: null, passed: false };
        try {
          attemptRow.cold = await callPacketRpc(query);
          attemptRow.warm = await callPacketRpc(query);
          attemptRow.warm_again = await callPacketRpc(query);
        } catch (error) {
          attemptRow.errors.push(error instanceof Error ? error.message : String(error));
        }

        const coldIdentity = identitySignature(attemptRow.cold?.packets ?? []);
        const warmIdentity = identitySignature(attemptRow.warm?.packets ?? []);
        const warmAgainIdentity = identitySignature(attemptRow.warm_again?.packets ?? []);
        const coldScores = scoreSignature(attemptRow.cold?.packets ?? []);
        const warmScores = scoreSignature(attemptRow.warm?.packets ?? []);
        const warmAgainScores = scoreSignature(attemptRow.warm_again?.packets ?? []);
        attemptRow.proof = {
          packets_present: coldIdentity.length > 0,
          cold_is_miss: attemptRow.cold?.cache_hit === false,
          warm_is_hit: attemptRow.warm?.cache_hit === true,
          warm_again_is_hit: attemptRow.warm_again?.cache_hit === true,
          identity_equal: JSON.stringify(coldIdentity) === JSON.stringify(warmIdentity)
            && JSON.stringify(warmIdentity) === JSON.stringify(warmAgainIdentity),
          scores_equal: JSON.stringify(coldScores) === JSON.stringify(warmScores)
            && JSON.stringify(warmScores) === JSON.stringify(warmAgainScores),
        };
        attemptRow.passed = attemptRow.errors.length === 0 && Object.values(attemptRow.proof).every(Boolean);
        row.attempts.push(attemptRow);
        if (attemptRow.passed) {
          row.cold = attemptRow.cold;
          row.warm = attemptRow.warm;
          row.warm_again = attemptRow.warm_again;
          row.proof = attemptRow.proof;
          row.passed = true;
          break;
        }
        row.errors.push(...attemptRow.errors);
        row.proof = attemptRow.proof;
        row.passed = false;
        if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      rows.push(row);
      const detail = row.passed
        ? `attempt=${row.attempts.length}`
        : `proof=${JSON.stringify(row.proof)} errors=${row.errors.join(';')}`;
      console.log(`[proof ${index + 1}/${queries.length}] ${row.passed ? 'PASS' : 'FAIL'} ${query} ${detail}`);
    }
  } finally {
    redis.disconnect();
  }

  const passed = rows.filter((row) => row.passed).length;
  const cacheNamespaceProof = {
    namespace: 'hyperrag:query',
    expected_keys_per_query: 2,
    query_count: queries.length,
    key_count: 0,
  };

  const verificationRedis = new Redis(redisConfig.url, {
    password: redisConfig.password,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  verificationRedis.on('error', () => {});
  try {
    await verificationRedis.connect();
    let cursor = '0';
    do {
      const [next, keys] = await verificationRedis.scan(cursor, 'MATCH', 'hyperrag:query:*', 'COUNT', 500);
      cursor = next;
      cacheNamespaceProof.key_count += keys.length;
    } while (cursor !== '0');
  } finally {
    verificationRedis.disconnect();
  }

  const report = {
    schema: 'parent_atlas_proof_of_truth.v1',
    generated_at: new Date().toISOString(),
    endpoint: ENDPOINT,
    query_source: path.relative(REPO_ROOT, QUERY_SOURCE).replace(/\\/g, '/'),
    summary: {
      queries: rows.length,
      passed,
      failed: rows.length - passed,
      pass_rate: rows.length ? Number((passed / rows.length).toFixed(4)) : 0,
      cold_misses: rows.filter((row) => row.proof?.cold_is_miss).length,
      warm_hits: rows.filter((row) => row.proof?.warm_is_hit).length,
      second_warm_hits: rows.filter((row) => row.proof?.warm_again_is_hit).length,
      identity_equal: rows.filter((row) => row.proof?.identity_equal).length,
      scores_equal: rows.filter((row) => row.proof?.scores_equal).length,
      status: passed === rows.length ? 'PASS' : 'FAIL',
    },
    cache_namespace_proof: cacheNamespaceProof,
    ace_packet_sample: rows.find((row) => row.cold?.packets?.length)?.cold?.packets?.[0] ?? null,
    rows,
  };

  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    REPORT_MD,
    [
      '# Parent Atlas Proof Of Truth',
      '',
      `Generated: ${report.generated_at}`,
      `Status: ${report.summary.status}`,
      '',
      '## Summary',
      '',
      `- queries: ${report.summary.queries}`,
      `- passed: ${report.summary.passed}`,
      `- failed: ${report.summary.failed}`,
      `- cold misses: ${report.summary.cold_misses}`,
      `- warm hits: ${report.summary.warm_hits}`,
      `- second warm hits: ${report.summary.second_warm_hits}`,
      `- identity-equal replays: ${report.summary.identity_equal}`,
      `- score-equal replays: ${report.summary.scores_equal}`,
      `- cache namespace: \`${cacheNamespaceProof.namespace}:*\` (${cacheNamespaceProof.key_count} keys observed)`,
      '',
      '## Failures',
      '',
      ...(rows.filter((row) => !row.passed).map((row) => `- ${row.query}: ${row.errors.join('; ') || JSON.stringify(row.proof)}`)),
      ...(rows.every((row) => row.passed) ? ['- none'] : []),
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(JSON.stringify(report.summary, null, 2));
  process.exitCode = report.summary.status === 'PASS' ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
