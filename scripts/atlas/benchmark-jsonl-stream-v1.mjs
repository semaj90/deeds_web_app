/**
 * Benchmark Bounded JSONL Stream & SIMD Fanout Batching vs Baseline JSON.parse (`PARSE-01`, `PERF-01`)
 *
 * Evaluates:
 * 1. Baseline whole-slice UTF-8 split + `JSON.parse`
 * 2. Bounded streaming parser (`streamJsonlBatchesV1` from `scripts/atlas/lib/stream-jsonl-batches-v1.mjs`)
 * 3. Deterministic columnar batch assembly (`createParsedBatchV1` sorting & SHA-256 framing)
 *
 * Strictly in-memory/stream read-only. Performs zero database, Qdrant, or Valkey writes.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { streamJsonlBatchesV1 } from './lib/stream-jsonl-batches-v1.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const idx = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1)
  );
  return sortedValues[idx];
}

function generateDeterministicJsonlChunks({ recordCount = 25000, chunkTargetBytes = 64 * 1024 } = {}) {
  const chunks = [];
  let currentParts = [];
  let currentBytes = 0;
  let totalBytes = 0;
  const domains = ['ast', 'graph', 'retrieval'];

  for (let i = 0; i < recordCount; i++) {
    const domain = domains[i % domains.length];
    const packetKey = `pkt_${String(i % 5000).padStart(6, '0')}`;
    const sourceRevision = `rev_${String((i * 7) % 100).padStart(4, '0')}`;
    const lineObj = {
      schema: 'atlas.ingest-record.v1',
      domain,
      packetKey,
      sourceRevision,
      sourceOffset: totalBytes,
      sourceRef: `sveltekit-frontend/src/lib/server/module_${i % 250}.ts`,
      featureId: `feat_${i % 64}`,
      symbol: `symbol_${i % 1024}`,
      summary: `Deterministic benchmark payload line ${i} with UTF-8 legal text §1983 and structural metadata.`,
    };
    const buf = Buffer.from(JSON.stringify(lineObj) + '\n', 'utf8');
    currentParts.push(buf);
    currentBytes += buf.byteLength;
    totalBytes += buf.byteLength;

    if (currentBytes >= chunkTargetBytes) {
      chunks.push(Buffer.concat(currentParts, currentBytes));
      currentParts = [];
      currentBytes = 0;
    }
  }
  if (currentBytes > 0) {
    chunks.push(Buffer.concat(currentParts, currentBytes));
  }

  return { chunks, totalBytes, recordCount };
}

export async function runJsonlStreamBenchmarkV1({
  recordCount = 25000,
  batchRecords = 512,
} = {}) {
  const fixture = generateDeterministicJsonlChunks({ recordCount });
  const totalMB = fixture.totalBytes / (1024 * 1024);

  // 1. Baseline: Buffer.concat + split('\n') + JSON.parse
  const rssBeforeBaseline = process.memoryUsage().rss;
  const t0Base = performance.now();
  const fullText = Buffer.concat(fixture.chunks, fixture.totalBytes).toString('utf8');
  const rawLines = fullText.split('\n');
  let baselineParsedCount = 0;
  const baselineHash = createHash('sha256');
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line) continue;
    const obj = JSON.parse(line);
    if (obj && typeof obj === 'object') {
      baselineParsedCount += 1;
      baselineHash.update(obj.packetKey);
    }
  }
  const baselineMs = performance.now() - t0Base;
  const rssAfterBaseline = process.memoryUsage().rss;
  const baselineDigest = baselineHash.digest('hex');

  // 2. Bounded Stream Batching: streamJsonlBatchesV1
  const batchLatenciesMs = [];
  const domainCounts = { ast: 0, graph: 0, retrieval: 0 };
  let streamParsedCount = 0;
  let batchCount = 0;
  const streamHash = createHash('sha256');
  const rssBeforeStream = process.memoryUsage().rss;
  const t0Stream = performance.now();
  let lastBatchTick = t0Stream;

  const readable = Readable.from(fixture.chunks);
  for await (const batch of streamJsonlBatchesV1(readable, { batchRecords })) {
    const now = performance.now();
    batchLatenciesMs.push(Number((now - lastBatchTick).toFixed(4)));
    lastBatchTick = now;
    batchCount += 1;
    streamParsedCount += batch.recordCount;
    for (const rec of batch.records) {
      streamHash.update(rec.packetKey);
      if (rec.domain in domainCounts) {
        domainCounts[rec.domain] += 1;
      }
    }
  }
  const streamMs = performance.now() - t0Stream;
  const rssAfterStream = process.memoryUsage().rss;
  const streamDigest = streamHash.digest('hex');

  const sortedLatencies = [...batchLatenciesMs].sort((a, b) => a - b);
  const p50BatchMs = percentile(sortedLatencies, 50);
  const p95BatchMs = percentile(sortedLatencies, 95);
  const p99BatchMs = percentile(sortedLatencies, 99);

  const countsvals = Object.values(domainCounts);
  const maxPartition = Math.max(...countsvals);
  const minPartition = Math.min(...countsvals);
  const partitionSkewRatio = minPartition > 0 ? Number((maxPartition / minPartition).toFixed(4)) : 1;

  return {
    schema: 'atlas.jsonl-simd-stream-benchmark.v1',
    generatedAt: new Date().toISOString(),
    canonicalAuthority: false,
    writesPerformed: false,
    stagesCovered: ['PARSE-01', 'PERF-01'],
    fixture: {
      recordCount: fixture.recordCount,
      totalBytes: fixture.totalBytes,
      totalMB: Number(totalMB.toFixed(3)),
      chunkCount: fixture.chunks.length,
      batchRecords,
    },
    parity: {
      recordCountMatches: baselineParsedCount === streamParsedCount && streamParsedCount === fixture.recordCount,
      packetKeySequenceDigestMatches: baselineDigest === streamDigest,
      packetKeySequenceDigest: streamDigest,
    },
    baselineWholeBufferJsonParse: {
      elapsedMs: Number(baselineMs.toFixed(2)),
      recordsPerSec: Math.round((baselineParsedCount / baselineMs) * 1000),
      mbPerSec: Number(((totalMB / baselineMs) * 1000).toFixed(2)),
      rssDeltaMB: Number(((rssAfterBaseline - rssBeforeBaseline) / (1024 * 1024)).toFixed(2)),
    },
    boundedStreamJsonlBatchesV1: {
      elapsedMs: Number(streamMs.toFixed(2)),
      batchCount,
      recordsPerSec: Math.round((streamParsedCount / streamMs) * 1000),
      mbPerSec: Number(((totalMB / streamMs) * 1000).toFixed(2)),
      p50BatchLatencyMs: p50BatchMs,
      p95BatchLatencyMs: p95BatchMs,
      p99BatchLatencyMs: p99BatchMs,
      rssDeltaMB: Number(((rssAfterStream - rssBeforeStream) / (1024 * 1024)).toFixed(2)),
      domainPartitionCounts: domainCounts,
      partitionSkewRatio,
    },
  };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() ===
    path.resolve(fileURLToPath(import.meta.url)).toLowerCase();

if (isMain) {
  const report = await runJsonlStreamBenchmarkV1();
  const outPath = path.join(REPO_ROOT, 'docs/reports/jsonl-simd-stream-benchmark-v1.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(report, null, 2));
}
