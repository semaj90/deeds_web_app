#!/usr/bin/env node

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSourceRef } from './lib/lineage-field-aliases.mjs';
import { loadAtlasEnvFiles } from './lib/redis-valkey.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INPUT_PATH = path.join(REPO_ROOT, '.tmp', 'addressable-packets.ndjson');
const OUTPUT_PATH = path.join(REPO_ROOT, '.tmp', 'addressable-packets.vectorized.ndjson');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'addressable-packets-vector-enrichment.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'addressable-packets-vector-enrichment.md');
const QDRANT_URL = String(process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/+$/, '');
const OPENCODE_EMBED_DIR = path.join(REPO_ROOT, '.opencode', 'embeddings');
const VECTOR_PREVIEW_FILES = [
  path.join(REPO_ROOT, '.tmp', 'vector64-preview.jsonl'),
  path.join(REPO_ROOT, '.tmp', 'atlas-vector64-dataset.jsonl'),
  path.join(REPO_ROOT, '.tmp', 'ace-nes-packets.json'),
  path.join(REPO_ROOT, '.tmp', 'phase17-pytorch-features.jsonl'),
  path.join(REPO_ROOT, '.tmp', 'addressable-packets.ndjson'),
];

const argv = process.argv.slice(2);
const APPLY_REQUESTED = argv.includes('--apply');
const LIMIT = parseIntFlag(argv, '--limit', 500);
const SAMPLE = parseIntFlag(argv, '--sample', 8);

function parseIntFlag(args, name, fallback) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) {
    const parsed = Number.parseInt(inline.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const idx = args.findIndex((arg) => arg === name);
  if (idx >= 0 && idx < args.length - 1) {
    const parsed = Number.parseInt(args[idx + 1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function unique(values) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

function parseNdjson(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return {
          __invalid: true,
          __line: index + 1,
          __error: error instanceof Error ? error.message : String(error),
        };
      }
    });
}

function vectorFromRow(row) {
  return (
    row?.embedding ??
    row?.vector ??
    row?.vector64 ??
    row?.vector_64 ??
    row?.vector_64d ??
    row?.payload?.embedding ??
    row?.payload?.vector ??
    row?.data?.embedding ??
    row?.data?.vector ??
    row?.nes_chrom_packet?.embedding ??
    null
  );
}

function extractArrayVector(value) {
  if (Array.isArray(value) && value.every((v) => Number.isFinite(Number(v)))) {
    return value.map((v) => Number(v));
  }
  if (value && typeof value === 'object') {
    return (
      extractArrayVector(value.vector) ||
      extractArrayVector(value.embedding) ||
      extractArrayVector(value.vector64) ||
      extractArrayVector(value.payload?.embedding) ||
      extractArrayVector(value.payload?.vector) ||
      extractArrayVector(value.data?.embedding) ||
      null
    );
  }
  return null;
}

function candidateKeys(...values) {
  const out = new Set();
  for (const raw of values.flat()) {
    const text = normalizeText(raw);
    if (!text) continue;
    const noLine = text.replace(/:L\d+$/i, '').replace(/#L\d+$/i, '');
    const noQuery = noLine.split(/[?#]/)[0];
    const normalized = normalizeSourceRef(noQuery);
    const leaf = noQuery.split(/[\\/]/).pop() ?? '';
    const stem = leaf.replace(/\.[^.]+$/, '');
    for (const candidate of [text, noLine, noQuery, normalized, leaf, stem]) {
      const trimmed = normalizeText(candidate);
      if (trimmed) out.add(trimmed);
    }
  }
  return [...out];
}

function vectorRecordFromSource(record, source) {
  const vector = extractArrayVector(record);
  if (!vector || vector.length === 0) return null;
  const keys = candidateKeys(
    record.id,
    record.source_ref,
    record.sourceRef,
    record.canonical_source_ref,
    record.canonicalSourceRef,
    record.file_path,
    record.filePath,
    record.path,
    record.packet_key,
    record.packetKey,
    record.qdrant_point_id,
    record.qdrantPointId,
    record.metadata?.source,
    record.metadata?.source_ref,
    record.metadata?.sourceRef,
    record.metadata?.file_path,
    record.metadata?.filePath,
    record.metadata?.path,
    source,
  );
  return {
    vector,
    keys,
    source,
  };
}

async function loadRepoEnv() {
  const env = await loadAtlasEnvFiles(REPO_ROOT, ['.env', '.env.local']);
  for (const [key, value] of Object.entries(env)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

async function readNdjsonFile(filePath) {
  const raw = await fsPromises.readFile(filePath, 'utf8').catch(() => '');
  if (!raw.trim()) return [];
  return parseNdjson(raw);
}

async function readJsonFile(filePath) {
  const raw = await fsPromises.readFile(filePath, 'utf8').catch(() => '');
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readEmbeddingDir(dirPath) {
  const rows = [];
  if (!fs.existsSync(dirPath)) return rows;
  const files = fs.readdirSync(dirPath).filter((file) => file.endsWith('.json')).sort();
  for (const file of files) {
    try {
      const full = path.join(dirPath, file);
      const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
      const vector = extractArrayVector(parsed.vector ?? parsed.embedding ?? parsed);
      if (!vector) continue;
      rows.push(
        vectorRecordFromSource(
          {
            ...parsed,
            metadata: parsed.metadata ?? {},
            source_path: full,
          },
          `opencode:${file}`,
        ),
      );
    } catch {
      // ignore malformed embeddings
    }
  }
  return rows.filter(Boolean);
}

async function readPreviewFiles(paths) {
  const rows = [];
  for (const filePath of paths) {
    if (!fs.existsSync(filePath)) continue;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) continue;
    if (path.extname(filePath).toLowerCase() === '.json') {
      const parsed = await readJsonFile(filePath);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const vector = extractArrayVector(item?.vector64 ?? item?.embedding ?? item?.vector ?? item);
          if (!vector) continue;
          rows.push(
            vectorRecordFromSource(
              {
                ...item,
                metadata: item?.metadata ?? {},
              },
              `preview:${path.basename(filePath)}`,
            ),
          );
        }
      } else if (parsed && typeof parsed === 'object') {
        const vector = extractArrayVector(parsed.vector64 ?? parsed.embedding ?? parsed.vector ?? parsed);
        if (vector) {
          rows.push(
            vectorRecordFromSource(
              {
                ...parsed,
                metadata: parsed.metadata ?? {},
              },
              `preview:${path.basename(filePath)}`,
            ),
          );
        }
      }
      continue;
    }

    const ndjson = await readNdjsonFile(filePath);
    for (const item of ndjson) {
      const vector = extractArrayVector(item?.vector64 ?? item?.embedding ?? item?.vector ?? item);
      if (!vector) continue;
      rows.push(
        vectorRecordFromSource(
          {
            ...item,
            metadata: item?.metadata ?? {},
          },
          `preview:${path.basename(filePath)}`,
        ),
      );
    }
  }
  return rows.filter(Boolean);
}

async function fetchQdrantVectors(pointsByCollection) {
  const map = new Map();
  for (const [collection, ids] of pointsByCollection.entries()) {
    const uniqueIds = [...new Set(ids.filter(Boolean).map((id) => String(id)))];
    if (uniqueIds.length === 0) continue;
    for (let i = 0; i < uniqueIds.length; i += 100) {
      const batch = uniqueIds.slice(i, i + 100);
      try {
        const res = await fetch(`${QDRANT_URL}/collections/${encodeURIComponent(collection)}/points`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ids: batch,
            with_payload: true,
            with_vector: true,
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) continue;
        const data = await res.json().catch(() => null);
        const points = data?.result?.points ?? data?.result ?? [];
        for (const point of points) {
          const vector = extractArrayVector(point.vector ?? point.vectors ?? point.payload?.embedding ?? point.payload?.vector);
          if (!vector) continue;
          const payload = point.payload ?? {};
          const keys = candidateKeys(
            point.id,
            payload.packet_key,
            payload.packetKey,
            payload.source_ref,
            payload.sourceRef,
            payload.canonical_source_ref,
            payload.canonicalSourceRef,
            payload.file_path,
            payload.filePath,
            payload.path,
            payload.feature_id,
            payload.featureId,
            payload.source_ref_key,
            payload.sourceRefKey,
          );
          const pointId = String(point.id);
          map.set(pointId, {
            vector,
            keys,
            source: 'qdrant',
          });
          for (const key of keys) {
            if (!map.has(key)) map.set(key, { vector, keys, source: 'qdrant' });
          }
        }
      } catch {
        // leave as missing
      }
    }
  }
  return map;
}

function buildPacketKeys(packet) {
  return candidateKeys(
    packet.packet_key,
    packet.packetKey,
    packet.source_ref,
    packet.sourceRef,
    packet.canonical_source_ref,
    packet.canonicalSourceRef,
    packet.file_path,
    packet.filePath,
    packet.path,
    packet.qdrant_point_id,
    packet.qdrantPointId,
    packet.id,
    packet.source_ref_key,
    packet.sourceRefKey,
  );
}

function normalizePacket(packet) {
  return {
    ...packet,
    packet_key: normalizeText(packet.packet_key ?? packet.packetKey ?? ''),
    source_ref: normalizeText(packet.source_ref ?? packet.sourceRef ?? ''),
    canonical_source_ref: normalizeText(packet.canonical_source_ref ?? packet.canonicalSourceRef ?? packet.source_ref ?? packet.sourceRef ?? ''),
    file_path: normalizeText(packet.file_path ?? packet.filePath ?? packet.path ?? ''),
    feature_id: normalizeText(packet.feature_id ?? packet.featureId ?? ''),
    feature_label: normalizeText(packet.feature_label ?? packet.featureLabel ?? ''),
    qdrant_point_id: normalizeText(packet.qdrant_point_id ?? packet.qdrantPointId ?? ''),
    qdrant_collection: normalizeText(packet.qdrant_collection ?? packet.qdrantCollection ?? ''),
    community_id: packet.community_id ?? packet.communityId ?? null,
    community_conf: packet.community_conf ?? packet.communityConf ?? null,
    tags: Array.isArray(packet.tags) ? packet.tags : [],
    concepts: Array.isArray(packet.concepts) ? packet.concepts : [],
    lane_ids: Array.isArray(packet.lane_ids) ? packet.lane_ids : [],
  };
}

function attachEmbedding(packet, vector, vectorSource, vectorKey) {
  const normalized = normalizePacket(packet);
  return {
    ...normalized,
    embedding: vector,
    embedding_dim: Array.isArray(vector) ? vector.length : null,
    vector_source: vectorSource ?? null,
    vector_key: vectorKey ?? null,
  };
}

function buildReport(summary, samples) {
  return {
    generatedAt: new Date().toISOString(),
    mode: APPLY_REQUESTED ? 'apply' : 'dry-run',
    inputPath: path.relative(REPO_ROOT, INPUT_PATH).replace(/\\/g, '/'),
    outputPath: path.relative(REPO_ROOT, OUTPUT_PATH).replace(/\\/g, '/'),
    summary,
    samples,
    status: APPLY_REQUESTED ? 'APPLIED' : 'DRY_RUN_READY',
    nextSafeAction: APPLY_REQUESTED
      ? 'Run the packet enrichment lanes runner, then re-run the TurboVec and Neo4j passes on the vectorized packet file.'
      : 'Review the vector join preview, then rerun with --apply to write the vectorized packet file.',
  };
}

function renderMarkdown(report) {
  return [
    '# Addressable Packet Vector Enrichment',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    '',
    '## Summary',
    '',
    `- input rows: ${report.summary.inputRows}`,
    `- selected rows: ${report.summary.selectedRows}`,
    `- rows with embedding: ${report.summary.rowsWithEmbedding}`,
    `- qdrant vectors: ${report.summary.qdrantVectors}`,
    `- opencode vectors: ${report.summary.opencodeVectors}`,
    `- local dump vectors: ${report.summary.localDumpVectors}`,
    `- missing vectors: ${report.summary.missingVectors}`,
    '',
    '## Samples',
    '',
    ...report.samples.map((row) => `- ${row.packet_key || row.source_ref || '(missing packet)'} | ${row.vector_source || 'none'} | dim=${row.embedding_dim ?? 'n/a'} | ${row.vector_key || 'n/a'}`),
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
    '',
  ].join('\n');
}

async function main() {
  await loadRepoEnv();
  const raw = await fsPromises.readFile(INPUT_PATH, 'utf8').catch(() => '');
  const packets = parseNdjson(raw).filter((row) => row && !row.__invalid).map(normalizePacket);
  const selected = LIMIT > 0 ? packets.slice(0, LIMIT) : packets;

  const opencodeVectors = new Map();
  const opencodeRows = await readEmbeddingDir(OPENCODE_EMBED_DIR);
  for (const entry of opencodeRows) {
    if (!entry) continue;
    for (const key of entry.keys) {
      if (!opencodeVectors.has(key)) opencodeVectors.set(key, entry);
    }
  }

  const previewRows = await readPreviewFiles(VECTOR_PREVIEW_FILES);
  const localVectors = new Map();
  for (const entry of previewRows) {
    if (!entry) continue;
    for (const key of entry.keys) {
      if (!localVectors.has(key)) localVectors.set(key, entry);
    }
  }

  const qdrantPoints = new Map();
  const collections = new Map();
  for (const packet of selected) {
    const collection = packet.qdrant_collection || process.env.QDRANT_COLLECTION || 'codebase_chunks_768';
    if (!packet.qdrant_point_id) continue;
    if (!collections.has(collection)) collections.set(collection, []);
    collections.get(collection).push(packet.qdrant_point_id);
  }
  const qdrantVectors = collections.size > 0 ? await fetchQdrantVectors(collections) : new Map();

  const enriched = [];
  const summary = {
    inputRows: packets.length,
    selectedRows: selected.length,
    rowsWithEmbedding: 0,
    qdrantVectors: 0,
    opencodeVectors: 0,
    localDumpVectors: 0,
    missingVectors: 0,
    qdrantReachable: qdrantVectors.size > 0,
  };

  const samples = [];
  for (const packet of selected) {
    const keys = buildPacketKeys(packet);
    let match = null;
    let matchKey = null;
    let vectorSource = null;

    for (const key of keys) {
      const qdrantMatch = qdrantVectors.get(key);
      if (qdrantMatch?.vector) {
        match = qdrantMatch;
        matchKey = key;
        vectorSource = 'qdrant';
        break;
      }
    }

    if (!match) {
      for (const key of keys) {
        const opencodeMatch = opencodeVectors.get(key);
        if (opencodeMatch?.vector) {
          match = opencodeMatch;
          matchKey = key;
          vectorSource = 'opencode';
          break;
        }
      }
    }

    if (!match) {
      for (const key of keys) {
        const localMatch = localVectors.get(key);
        if (localMatch?.vector) {
          match = localMatch;
          matchKey = key;
          vectorSource = 'local_dump';
          break;
        }
      }
    }

    if (match?.vector) {
      summary.rowsWithEmbedding += 1;
      if (vectorSource === 'qdrant') summary.qdrantVectors += 1;
      if (vectorSource === 'opencode') summary.opencodeVectors += 1;
      if (vectorSource === 'local_dump') summary.localDumpVectors += 1;
      enriched.push(attachEmbedding(packet, match.vector, vectorSource, matchKey));
    } else {
      summary.missingVectors += 1;
      enriched.push(attachEmbedding(packet, null, null, null));
    }

    if (samples.length < SAMPLE) {
      samples.push({
        packet_key: packet.packet_key || null,
        source_ref: packet.source_ref || null,
        vector_source: match ? vectorSource : null,
        vector_key: matchKey,
        embedding_dim: Array.isArray(match?.vector) ? match.vector.length : null,
      });
    }
  }

  const report = buildReport(summary, samples);

  await fsPromises.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fsPromises.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsPromises.writeFile(REPORT_MD, renderMarkdown(report), 'utf8');

  if (APPLY_REQUESTED) {
    await fsPromises.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fsPromises.writeFile(
      OUTPUT_PATH,
      `${enriched.map((row) => JSON.stringify(row)).join('\n')}\n`,
      'utf8',
    );
    await fsPromises.writeFile(
      path.join(REPO_ROOT, '.tmp', 'addressable-packets.manifest.json'),
      `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        inputRows: packets.length,
        selectedRows: selected.length,
        rowsWithEmbedding: summary.rowsWithEmbedding,
        qdrantVectors: summary.qdrantVectors,
        opencodeVectors: summary.opencodeVectors,
        localDumpVectors: summary.localDumpVectors,
        missingVectors: summary.missingVectors,
        outputPath: path.relative(REPO_ROOT, OUTPUT_PATH).replace(/\\/g, '/'),
      }, null, 2)}\n`,
      'utf8',
    );
  }

  console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_JSON)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_MD)}`);
  if (APPLY_REQUESTED) {
    console.log(`Wrote ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
  }
  console.log(JSON.stringify({
    status: report.status,
    selectedRows: selected.length,
    rowsWithEmbedding: summary.rowsWithEmbedding,
    missingVectors: summary.missingVectors,
    qdrantVectors: summary.qdrantVectors,
    opencodeVectors: summary.opencodeVectors,
    localDumpVectors: summary.localDumpVectors,
  }, null, 2));
}

main().catch((error) => {
  console.error('[enrich-addressable-packets-with-vectors] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
