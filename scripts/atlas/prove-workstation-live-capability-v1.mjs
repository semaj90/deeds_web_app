#!/usr/bin/env node
/**
 * Bounded live capability proof: Valkey GET-only + Ornith streamed chat.
 * This emits a report file but performs no canonical datastore or cache writes.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Redis from 'ioredis';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/workstation-live-capability-proof-v1.json');
const baseUrl = (process.env.TURBOQUANT_BASE_URL || process.env.TURBOQUANT_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');
const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT || 6379);
const redisPassword = process.env.REDIS_PASSWORD || process.env.REDIS_PASS || 'redis';
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const query = 'parent atlas workstation capability proof';
const cacheKey = `bifrost:sem:query:${crypto.createHash('sha256').update(query, 'utf8').digest('hex')}`;

const report = {
  schema: 'atlas.workstation-live-capability-proof.v1',
  generatedAt: new Date().toISOString(),
  mode: 'BOUNDED_LIVE_READ_PROOF',
  canonicalAuthority: false,
  productionPlanPath: false,
  canonicalDatastoreWrites: { postgres: 0, qdrant: 0, neo4j: 0 },
  cacheWritesPerformed: false,
  proofArtifactWritesPerformed: true,
  modelRequestsAttempted: 0,
  modelResponsesCompleted: 0,
  bitfrost: { cacheKey, status: null, valueSchema: null },
  ornith: { endpoint: `${baseUrl}/v1/chat/completions`, status: null },
};

async function proveBitfrostGet() {
  const redis = new Redis({
    host: redisHost,
    port: redisPort,
    password: redisPassword,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    connectTimeout: 3000,
    commandTimeout: 3000,
    maxRetriesPerRequest: 1,
  });
  try {
    await redis.connect();
    const raw = await redis.get(cacheKey);
    if (raw == null) {
      report.bitfrost.status = 'LIVE_GET_PROVEN';
      report.bitfrost.valueSchema = 'MISS';
      return;
    }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { report.bitfrost.status = 'VALUE_PARSE_REJECT'; report.bitfrost.valueSchema = 'MALFORMED_JSON'; return; }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.identityChecksum !== 'string') {
      report.bitfrost.status = 'VALUE_SCHEMA_REJECT';
      report.bitfrost.valueSchema = 'IDENTITY_CHECKSUM_MISSING';
      return;
    }
    report.bitfrost.status = 'LIVE_VALUE_READ_PROVEN';
    report.bitfrost.valueSchema = 'IDENTITY_CHECKSUM_PRESENT';
    report.bitfrost.identityChecksum = parsed.identityChecksum;
  } catch (error) {
    report.bitfrost.status = 'CACHE_UNAVAILABLE';
    report.bitfrost.error = error instanceof Error ? error.message : String(error);
  } finally {
    redis.disconnect();
  }
}

async function resolveLoadedModel() {
  const response = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`MODEL_DISCOVERY_HTTP_${response.status}`);
  const body = await response.json();
  const ids = Array.isArray(body?.data) ? body.data.map((item) => String(item?.id || '').trim()).filter(Boolean) : [];
  const configured = String(process.env.LLAMA_PRIMARY_MODEL || process.env.TURBOQUANT_MODEL || '').trim();
  if (configured) {
    if (!ids.includes(configured)) throw new Error(`CONFIGURED_MODEL_NOT_LOADED:${configured}`);
    return configured;
  }
  if (ids.length !== 1) throw new Error(`MODEL_SELECTION_AMBIGUOUS:${ids.length}`);
  return ids[0];
}

async function proveOrnithStream() {
  let model;
  try {
    model = await resolveLoadedModel();
    report.ornith.modelId = model;
    report.modelRequestsAttempted = 1;
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: ATLAS_LIVE_OK' }],
        stream: true,
        temperature: 0,
        max_tokens: 64,
      }),
      signal: AbortSignal.timeout(30000),
    });
    report.ornith.httpStatus = response.status;
    if (!response.ok || !response.body) throw new Error(`CHAT_STREAM_HTTP_OR_BODY_${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let output = '';
    let doneSeen = false;
    while (true) {
      const next = await reader.read();
      buffer += decoder.decode(next.value || new Uint8Array(), { stream: !next.done });
      const records = buffer.split(/\r?\n/);
      buffer = records.pop() || '';
      for (const record of records) {
        if (!record.startsWith('data:')) continue;
        const data = record.slice(5).trim();
        if (data === '[DONE]') { doneSeen = true; continue; }
        if (!data) continue;
        const event = JSON.parse(data);
        output += event?.choices?.[0]?.delta?.content || '';
      }
      if (next.done) break;
    }
    if (!doneSeen) throw new Error('CHAT_STREAM_DONE_MARKER_MISSING');
    if (!output.trim()) throw new Error('CHAT_STREAM_EMPTY_CONTENT');
    report.modelResponsesCompleted = 1;
    report.ornith.status = 'LIVE_FIXTURE_PROVEN';
    report.ornith.generated = true;
    report.ornith.outputChecksum = digest(output);
    report.ornith.finishReason = 'DONE_MARKER_OBSERVED';
  } catch (error) {
    report.ornith.status = error?.name === 'TimeoutError' ? 'REQUEST_FAILED' : 'NOT_PROVEN';
    report.ornith.error = error instanceof Error ? error.message : String(error);
    report.ornith.generated = false;
  }
}

await Promise.all([proveBitfrostGet(), proveOrnithStream()]);
report.status = report.ornith.status === 'LIVE_FIXTURE_PROVEN'
  ? 'LIVE_CAPABILITY_PROVEN'
  : 'LIVE_CAPABILITY_NOT_PROVEN';
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ schema: report.schema, status: report.status, bitfrost: report.bitfrost.status, ornith: report.ornith.status, modelRequestsAttempted: report.modelRequestsAttempted, modelResponsesCompleted: report.modelResponsesCompleted, reportPath }, null, 2));
