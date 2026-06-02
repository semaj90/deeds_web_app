#!/usr/bin/env node
/**
 * organize-rg-search-transcripts.mjs
 *
 * Stream the two large raw ripgrep dumps into compact Parent Atlas packet rows.
 * These files are line-oriented search transcripts, not JSON, so they are
 * processed with a streaming text parser and chunked into packet-sized windows.
 *
 * Outputs:
 *   - .tmp/parent_atlas_packets/rg-dumps/rg-dump-packets.ndjson
 *   - docs/reports/parent-atlas-rg-dump-organizer.json
 *   - docs/reports/parent-atlas-rg-dump-organizer.md
 *
 * The organizer keeps the replay spine visible:
 *   title_id + feature_id + sourceRef
 * and preserves the underlying sourceRefs extracted from each transcript line.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const INPUTS = [
  {
    id: 'rg_turbovec',
    title: 'TurboVec raw search transcript',
    path: path.join(REPO_ROOT, 'docs', 'reports', 'rg_turbovec.txt'),
    preferredFeatureId: 'search.qdrant_vector',
    keywords: ['qdrant', 'pgvector', 'vector', 'similarity', 'cosine', 'hnsw', 'ann', 'embedding', 'retrieval', 'turbovec'],
  },
  {
    id: 'rg_napi',
    title: 'N-API bridge raw search transcript',
    path: path.join(REPO_ROOT, 'docs', 'reports', 'rg_napi.txt'),
    preferredFeatureId: 'gpu.simd_bridge',
    keywords: ['n-api', 'napi', 'node-addon-api', 'tensorrt', 'tensorrt_bridge', 'simdjson', 'libtorch', 'cuda', 'addon', 'bridge'],
  },
];

const OUT_DIR = path.join(REPO_ROOT, '.tmp', 'parent_atlas_packets', 'rg-dumps');
const OUT_NDJSON = path.join(OUT_DIR, 'rg-dump-packets.ndjson');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-rg-dump-organizer.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-rg-dump-organizer.md');

const CHUNK_LINES = Math.max(1_000, Number(process.env.PARENT_ATLAS_RG_CHUNK_LINES ?? 20_000));
const MAX_SNIPPETS = Math.max(3, Number(process.env.PARENT_ATLAS_RG_MAX_SNIPPETS ?? 8));
const MAX_SOURCE_REFS = Math.max(3, Number(process.env.PARENT_ATLAS_RG_MAX_SOURCE_REFS ?? 12));
const MAX_PACKETS_PER_INPUT = Number(process.env.PARENT_ATLAS_RG_MAX_PACKETS ?? 0);
const MAX_TRACKED_SOURCE_REFS = Math.max(500, Number(process.env.PARENT_ATLAS_RG_MAX_TRACKED_SOURCE_REFS ?? 20_000));

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function writeMarkdown(filePath, markdown) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, markdown.endsWith('\n') ? markdown : `${markdown}\n`, 'utf8');
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function toNonEmptyString(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
}

function detectTranscriptEncoding(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(4);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    if (bytesRead >= 2) {
      const bom0 = buffer[0];
      const bom1 = buffer[1];
      if ((bom0 === 0xff && bom1 === 0xfe) || (bom0 === 0xfe && bom1 === 0xff)) {
        return 'utf16le';
      }
    }
    if (bytesRead >= 4 && buffer[1] === 0x00 && buffer[3] === 0x00) {
      return 'utf16le';
    }
    return 'utf8';
  } finally {
    fs.closeSync(fd);
  }
}

function normalizeSourceRef(rawPath, lineNo) {
  const normalized = String(rawPath || '')
    .trim()
    .replace(/^\.\\/, '')
    .replace(/^\.?\//, '')
    .replace(/\\/g, '/');
  if (!normalized) return null;
  return `${normalized}#L${lineNo}`;
}

function parseTranscriptLine(line) {
  const match = line.match(/^(.+?):(\d+):(.*)$/);
  if (!match) {
    return {
      sourceRef: null,
      lineNo: null,
      text: line.trim(),
    };
  }
  const lineNo = Number(match[2]);
  return {
    sourceRef: normalizeSourceRef(match[1], lineNo),
    lineNo,
    text: match[3].trim(),
  };
}

function scoreFeatureId(text, fallbackFeatureId) {
  const lower = text.toLowerCase();
  const rules = [
    { featureId: 'gpu.simd_bridge', keywords: ['napi', 'n-api', 'node-addon-api', 'tensorrt', 'tensorrt_bridge', 'simdjson', 'libtorch', 'cuda', 'addon', 'bridge'] },
    { featureId: 'search.qdrant_vector', keywords: ['qdrant', 'pgvector', 'vector search', 'similarity', 'cosine', 'hnsw', 'ann', 'embedding', 'retrieval', 'turbovec'] },
    { featureId: 'knowledge.atlas_pipeline', keywords: ['parent atlas', 'feature_id', 'sourceref', 'title_id', 'packet', 'atlas'] },
    { featureId: 'cache.redis_bifrost', keywords: ['redis', 'bifrost', 'cache', 'hot cache', 'ace:'] },
  ];

  let best = { featureId: fallbackFeatureId, score: 0, matched: [] };
  for (const rule of rules) {
    const matched = rule.keywords.filter((keyword) => lower.includes(keyword));
    if (matched.length > best.score) {
      best = { featureId: rule.featureId, score: matched.length, matched };
    }
  }
  return best;
}

function trackCount(map, key, limit) {
  if (map.has(key)) {
    map.set(key, map.get(key) + 1);
    return true;
  }
  if (map.size >= limit) return false;
  map.set(key, 1);
  return true;
}

function summarizeChunk({ dump, packetIndex, lineStart, lineEnd, lineCount, sourceRefs, snippets, featureScore }) {
  const titleId = `${dump.id}:chunk:${String(packetIndex).padStart(4, '0')}`;
  const title = `${dump.title} chunk ${packetIndex}`;
  const featureId = featureScore.featureId || dump.preferredFeatureId;
  const summarySeed = snippets.join(' ').slice(0, 480);
  const summary = [
    `${dump.title} chunk spanning lines ${lineStart}-${lineEnd}.`,
    `Dominant lane: ${featureId}.`,
    snippets.length > 0 ? `Snippets: ${snippets.slice(0, 3).join(' ')}` : null,
  ].filter(Boolean).join(' ');

  return {
    title_id: titleId,
    title,
    feature_id: featureId,
    sourceRef: path.relative(REPO_ROOT, dump.path).replace(/\\/g, '/'),
    sourceRefs: [...sourceRefs].slice(0, MAX_SOURCE_REFS),
    related_feature_ids: [...new Set([dump.preferredFeatureId, featureId])].filter(Boolean),
    summary,
    summary_hash: sha256(summarySeed || summary),
    chunk_start_line: lineStart,
    chunk_end_line: lineEnd,
    line_count: lineCount,
    dump_id: dump.id,
    dump_title: dump.title,
    packet_id: `${dump.id}:${packetIndex}`,
    packet_rank: packetIndex,
    source_dump_path: path.relative(REPO_ROOT, dump.path).replace(/\\/g, '/'),
  };
}

async function processDump(dump, outStream) {
  const stats = {
    packets: 0,
    lines: 0,
    parsedLines: 0,
    sourceRefs: new Map(),
    featureIds: new Map(),
    samples: [],
    examples: [],
  };

  const inputEncoding = detectTranscriptEncoding(dump.path);
  const input = fs.createReadStream(dump.path, { encoding: inputEncoding });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let packetIndex = 0;
  let chunkLines = 0;
  let lineStart = 1;
  let lineEnd = 0;
  let packetSnippets = [];
  let packetSourceRefs = new Set();
  let packetFeatureCount = new Map();

  const flush = () => {
    if (chunkLines === 0) return;
    packetIndex += 1;
    stats.packets += 1;
    const featureScore = [...packetFeatureCount.entries()].sort((a, b) => b[1] - a[1])[0] ?? [dump.preferredFeatureId, 0];
    const packet = summarizeChunk({
      dump,
      packetIndex,
      lineStart,
      lineEnd,
      lineCount: chunkLines,
      sourceRefs: packetSourceRefs,
      snippets: packetSnippets,
      featureScore: { featureId: featureScore[0], score: featureScore[1] },
    });
    outStream.write(`${JSON.stringify(packet)}\n`);
    if (stats.samples.length < 6) stats.samples.push(packet);
    stats.featureIds.set(packet.feature_id, (stats.featureIds.get(packet.feature_id) ?? 0) + 1);
    for (const ref of packet.sourceRefs) trackCount(stats.sourceRefs, ref, MAX_TRACKED_SOURCE_REFS);
    if (stats.examples.length < 3) {
      stats.examples.push({
        packet_id: packet.packet_id,
        title_id: packet.title_id,
        feature_id: packet.feature_id,
        sourceRef: packet.sourceRef,
        sourceRefs: packet.sourceRefs.slice(0, 5),
      });
    }
    chunkLines = 0;
    lineStart = lineEnd + 1;
    packetSnippets = [];
    packetSourceRefs = new Set();
    packetFeatureCount = new Map();
  };

  for await (const line of rl) {
    stats.lines += 1;
    lineEnd += 1;
    const parsed = parseTranscriptLine(line);
    const text = parsed.text;
    if (parsed.sourceRef) {
      stats.parsedLines += 1;
      trackCount(stats.sourceRefs, parsed.sourceRef, MAX_TRACKED_SOURCE_REFS);
      packetSourceRefs.add(parsed.sourceRef);
    }
    const lower = text.toLowerCase();
    for (const keyword of dump.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        packetFeatureCount.set(dump.preferredFeatureId, (packetFeatureCount.get(dump.preferredFeatureId) ?? 0) + 1);
      }
    }
    const score = scoreFeatureId(text, dump.preferredFeatureId);
    if (score.score > 0) {
      packetFeatureCount.set(score.featureId, (packetFeatureCount.get(score.featureId) ?? 0) + score.score);
    }
    if (packetSnippets.length < MAX_SNIPPETS && text) {
      packetSnippets.push(text.slice(0, 280));
    }
    chunkLines += 1;
    if (chunkLines >= CHUNK_LINES) flush();
    if (MAX_PACKETS_PER_INPUT > 0 && stats.packets >= MAX_PACKETS_PER_INPUT) break;
  }

  flush();
  input.destroy();

  return stats;
}

function renderMarkdown(report) {
  const lines = [
    '# Parent Atlas RG Dump Organizer',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Inputs',
    ...report.inputs.dumps.map((dump) => `- ${dump.id}: ${dump.path} (${dump.bytesGB} GB)`),
    '',
    '## Summary',
    `- raw bytes processed: ${report.summary.rawBytes}`,
    `- packets written: ${report.summary.packetsWritten}`,
    `- parsed transcript lines: ${report.summary.parsedLines}`,
    `- tracked sourceRefs: ${report.summary.trackedSourceRefs}`,
    `- featureId buckets: ${report.summary.uniqueFeatureIds}`,
    '',
    '## Primary Buckets',
    ...report.dumps.map((dump) => `- ${dump.id}: packets=${dump.packets}, lines=${dump.lines}, primaryFeature=${dump.primaryFeatureId}`),
    '',
    '## Example Packets',
    ...report.examples.slice(0, 8).map((packet) => `- ${packet.title_id} → ${packet.feature_id} | ${packet.summary}`),
    '',
    '## Notes',
    '- The raw dumps are streamed, not loaded into memory.',
    '- These packets are derived from text transcripts; simdjson remains reserved for JSON sidecars and atlas payloads.',
    '- The canonical join spine remains sourceRef + feature_id.',
  ];
  return `${lines.join('\n')}\n`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outStream = fs.createWriteStream(OUT_NDJSON, { encoding: 'utf8' });

  const dumps = [];
  const examples = [];
  const overallSourceRefs = new Map();
  const overallFeatureIds = new Map();
  let rawBytes = 0;
  let packetsWritten = 0;
  let parsedLines = 0;

  for (const dump of INPUTS) {
    if (!fs.existsSync(dump.path)) continue;
    const stat = fs.statSync(dump.path);
    rawBytes += stat.size;
    const stats = await processDump(dump, outStream);
    packetsWritten += stats.packets;
    parsedLines += stats.parsedLines;
    for (const [key, value] of stats.sourceRefs) {
      if (!overallSourceRefs.has(key) && overallSourceRefs.size >= MAX_TRACKED_SOURCE_REFS) continue;
      overallSourceRefs.set(key, (overallSourceRefs.get(key) ?? 0) + value);
    }
    for (const [key, value] of stats.featureIds) overallFeatureIds.set(key, (overallFeatureIds.get(key) ?? 0) + value);
    if (examples.length < 12) examples.push(...stats.examples.slice(0, 12 - examples.length));
    dumps.push({
      id: dump.id,
      path: path.relative(REPO_ROOT, dump.path).replace(/\\/g, '/'),
      bytesGB: Number((stat.size / (1024 ** 3)).toFixed(2)),
      lines: stats.lines,
      parsedLines: stats.parsedLines,
      packets: stats.packets,
      primaryFeatureId: dump.preferredFeatureId,
      topSourceRefs: [...stats.sourceRefs.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([value, count]) => ({ value, count })),
      topFeatureIds: [...stats.featureIds.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([value, count]) => ({ value, count })),
    });
  }

  outStream.end();
  await new Promise((resolve) => outStream.on('close', resolve));

  const report = {
    schema: 'parent_atlas_rg_dump_organizer_report.v1',
    generatedAt: new Date().toISOString(),
    inputs: {
      dumps: INPUTS.map((dump) => ({
        id: dump.id,
        path: path.relative(REPO_ROOT, dump.path).replace(/\\/g, '/'),
        title: dump.title,
      })),
      chunkLines: CHUNK_LINES,
      maxSnippets: MAX_SNIPPETS,
      maxSourceRefs: MAX_SOURCE_REFS,
      maxTrackedSourceRefs: MAX_TRACKED_SOURCE_REFS,
      maxPacketsPerInput: MAX_PACKETS_PER_INPUT || null,
      packetOutDir: path.relative(REPO_ROOT, OUT_DIR).replace(/\\/g, '/'),
      packetOutFile: path.relative(REPO_ROOT, OUT_NDJSON).replace(/\\/g, '/'),
    },
    summary: {
      rawBytes,
      rawGB: Number((rawBytes / (1024 ** 3)).toFixed(2)),
      packetsWritten,
      parsedLines,
      trackedSourceRefs: overallSourceRefs.size,
      uniqueFeatureIds: overallFeatureIds.size,
    },
    dumps,
    examples,
    topSourceRefs: [...overallSourceRefs.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([value, count]) => ({ value, count })),
    topFeatureIds: [...overallFeatureIds.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([value, count]) => ({ value, count })),
  };

  writeJson(REPORT_JSON, report);
  writeMarkdown(REPORT_MD, renderMarkdown(report));

  console.log(`Wrote ${REPORT_JSON}`);
  console.log(`Wrote ${REPORT_MD}`);
  console.log(`Packets: ${packetsWritten}`);
  console.log(`Parsed lines: ${parsedLines}`);
  console.log(`Unique sourceRefs: ${overallSourceRefs.size}`);
  console.log(`Unique featureIds: ${overallFeatureIds.size}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
