#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const beforePath = resolve(root, process.argv.find((arg) => arg.startsWith('--before='))?.slice('--before='.length) || 'docs/reports/graphify-runtime-before.json');
const afterPath = resolve(root, process.argv.find((arg) => arg.startsWith('--after='))?.slice('--after='.length) || 'docs/reports/graphify-runtime-after.json');
const out = process.argv.find((arg) => arg.startsWith('--out='))?.slice('--out='.length) || 'docs/reports/graphify-runtime-delta.json';

const before = JSON.parse(readFileSync(beforePath, 'utf8'));
const after = JSON.parse(readFileSync(afterPath, 'utf8'));

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function indexPg(rows = []) {
  return new Map(rows.map((row) => [[row.backend_type, row.object, row.context].join('|'), row]));
}

function pgDelta() {
  const a = indexPg(before.postgres?.pgStatIo);
  const b = indexPg(after.postgres?.pgStatIo);
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort();
  const counters = ['reads', 'read_bytes', 'read_time', 'writes', 'write_bytes', 'write_time', 'extends', 'extend_bytes', 'extend_time', 'hits', 'evictions', 'reuses', 'fsyncs', 'fsync_time'];
  return keys.map((key) => {
    const left = a.get(key) || {};
    const right = b.get(key) || {};
    const delta = {};
    for (const counter of counters) delta[counter] = num(right[counter]) - num(left[counter]);
    return { key, ...delta };
  }).filter((row) => Object.entries(row).some(([key, value]) => key !== 'key' && value !== 0));
}

function valkeyDelta() {
  const counters = ['total_commands_processed', 'keyspace_hits', 'keyspace_misses', 'expired_keys', 'evicted_keys', 'total_net_input_bytes', 'total_net_output_bytes'];
  const stats = {};
  for (const key of counters) stats[key] = num(after.valkey?.stats?.[key]) - num(before.valkey?.stats?.[key]);
  const bifrostPrefixes = {};
  for (const key of new Set([
    ...Object.keys(before.valkey?.bifrostPrefixes || {}),
    ...Object.keys(after.valkey?.bifrostPrefixes || {}),
  ])) {
    bifrostPrefixes[key] = num(after.valkey?.bifrostPrefixes?.[key]) - num(before.valkey?.bifrostPrefixes?.[key]);
  }
  return { stats, bifrostPrefixes };
}

const report = {
  schema: 'atlas.graphify-runtime-observability-delta.v1',
  generatedAt: new Date().toISOString(),
  before: before.generatedAt,
  after: after.generatedAt,
  postgres: {
    serverVersion: after.postgres?.serverVersion ?? null,
    ioMethod: after.postgres?.ioMethod ?? null,
    settings: after.postgres?.settings ?? {},
    pgStatIoAvailable: Boolean(after.postgres?.pgStatIoAvailable),
    delta: pgDelta(),
  },
  valkey: {
    server: after.valkey?.server ?? {},
    memory: after.valkey?.memory ?? {},
    ...valkeyDelta(),
  },
  interpretation: {
    postgresCountersAreClusterCumulative: true,
    deltaRepresentsActivityBetweenSnapshotsNotExclusiveAttribution: true,
    valkeyCountersAreServerCumulative: true,
    canonicalWritesPerformedByObserver: false,
  },
};

const outPath = resolve(root, out);
mkdirSync(resolve(outPath, '..'), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'GRAPHIFY_RUNTIME_DELTA_REPORTED', output: out, pgRows: report.postgres.delta.length, valkeyPrefixDelta: report.valkey.bifrostPrefixes }, null, 2));
