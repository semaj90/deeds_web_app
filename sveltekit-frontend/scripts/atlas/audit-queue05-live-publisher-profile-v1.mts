#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadAtlasEnv } from './load-atlas-env.mjs';

loadAtlasEnv();

const REPORT_PATH = path.resolve(
  process.cwd(),
  '..',
  'docs',
  'reports',
  'queue-large-payload-live-profile-v1.json',
);

const hostRaw = process.env.LANGFUSE_HOST ?? 'http://127.0.0.1:3030';
const host = hostRaw.endsWith('/') ? hostRaw.slice(0, -1) : hostRaw;
const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
const secretKey = process.env.LANGFUSE_SECRET_KEY;

const baseReport = {
  schema: 'atlas.queue-large-payload-live-profile.v1',
  queriedAt: new Date().toISOString(),
  readOnly: true,
  externalWritesPerformed: false,
  publisherChangesPerformed: false,
  traceBackend: host,
  query: { endpoint: '/api/public/traces', limit: 100, queueTracePrefix: 'queue:publish:' },
};

if (!publicKey || !secretKey || process.env.LANGFUSE_ENABLED !== 'true') {
  const report = {
    ...baseReport,
    status: 'BLOCKED_TRACE_BACKEND_NOT_CONFIGURED',
    fetchedTraceCount: 0,
    queuePublishTraceCount: 0,
    measuredPayloadTraceCount: 0,
    measuredPayloadCoverage: 0,
    error: 'LANGFUSE_ENABLED and both API keys are required for a read-only trace query',
    nextGate: 'QUEUE-05-LIVE-PUBLISHER-PROFILE-01',
  };
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
const response = await fetch(`${host}/api/public/traces?limit=100`, {
  headers: { Authorization: `Basic ${auth}` },
});

if (!response.ok) {
  throw new Error(`Langfuse trace query failed with HTTP ${response.status}`);
}

const body = (await response.json()) as { data?: Array<Record<string, unknown>> };
const traces = Array.isArray(body.data) ? body.data : [];
const queueTraces = traces.filter((trace) => String(trace.name ?? '').startsWith('queue:publish:'));
const measured = queueTraces.filter((trace) => {
  const metadata = trace.metadata;
  return Boolean(metadata && typeof metadata === 'object' && Number.isFinite(Number((metadata as Record<string, unknown>).payloadBytes)));
});

const routingKeyCounts: Record<string, number> = {};
const measuredByRoutingKey: Record<string, { count: number; minBytes: number; maxBytes: number }> = {};
for (const trace of queueTraces) {
  const name = String(trace.name ?? 'unknown');
  routingKeyCounts[name] = (routingKeyCounts[name] ?? 0) + 1;
  const metadata = trace.metadata as Record<string, unknown> | undefined;
  const bytes = Number(metadata?.payloadBytes);
  if (!Number.isFinite(bytes)) continue;
  const current = measuredByRoutingKey[name];
  if (!current) {
    measuredByRoutingKey[name] = { count: 1, minBytes: bytes, maxBytes: bytes };
  } else {
    current.count += 1;
    current.minBytes = Math.min(current.minBytes, bytes);
    current.maxBytes = Math.max(current.maxBytes, bytes);
  }
}

const report = {
  ...baseReport,
  status: measured.length > 0
    ? 'LIVE_PUBLISHER_PROFILE_SAMPLES_AVAILABLE'
    : 'LIVE_PUBLISHER_PROFILE_NO_MEASURED_SAMPLES',
  fetchedTraceCount: traces.length,
  queuePublishTraceCount: queueTraces.length,
  measuredPayloadTraceCount: measured.length,
  measuredPayloadCoverage: queueTraces.length === 0 ? 0 : measured.length / queueTraces.length,
  routingKeyCounts,
  measuredByRoutingKey,
  latestTraceTimestamp: traces
    .map((trace) => String(trace.timestamp ?? ''))
    .filter(Boolean)
    .sort()
    .at(-1) ?? null,
  nextGate: measured.length > 0
    ? 'QUEUE-05-AMPLIFICATION-DECISION-01'
    : 'QUEUE-05-LIVE-PUBLISHER-PROFILE-01',
  note: measured.length > 0
    ? 'Measured payload bytes came from existing queue trace metadata; no publisher migration is authorized by this report.'
    : 'Historical queue traces are present, but none contains payloadBytes metadata from the new instrumentation. No synthetic publisher traffic was emitted.',
};

await mkdir(path.dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  fetchedTraceCount: report.fetchedTraceCount,
  queuePublishTraceCount: report.queuePublishTraceCount,
  measuredPayloadTraceCount: report.measuredPayloadTraceCount,
  measuredPayloadCoverage: report.measuredPayloadCoverage,
  latestTraceTimestamp: report.latestTraceTimestamp,
  reportPath: REPORT_PATH,
}, null, 2));
