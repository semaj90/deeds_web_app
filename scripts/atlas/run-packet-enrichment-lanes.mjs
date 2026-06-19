#!/usr/bin/env node

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnvFiles } from './lib/redis-valkey.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const INPUT_CANDIDATES = [
  path.join(REPO_ROOT, '.tmp', 'addressable-packets.vectorized.ndjson'),
  path.join(REPO_ROOT, '.tmp', 'addressable-packets.ndjson'),
];
const OUTPUT_PATH = path.join(REPO_ROOT, '.tmp', 'addressable-packets.enriched.ndjson');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'packet-enrichment-lanes-audit.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'packet-enrichment-lanes-audit.md');

const argv = process.argv.slice(2);
const APPLY_REQUESTED = argv.includes('--apply');
const LIMIT = parseIntFlag(argv, '--limit', 500);
const SAMPLE = parseIntFlag(argv, '--sample', 8);
const SUMMARY_LIMIT = parseIntFlag(argv, '--summary-limit', 25);

const TURBOQUANT_URL = (process.env.TURBOQUANT_URL ?? process.env.TURBOQUANT_BASE_URL ?? 'http://127.0.0.1:8090').replace(/\/+$/, '');
const GEMMA4_ENABLED = String(process.env.GEMMA4_ENABLED ?? 'true').toLowerCase() !== 'false';

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

function resolveLlamaServerModelId() {
  const explicit = String(process.env.LLAMA_MODEL ?? process.env.TURBOQUANT_MODEL ?? '').trim();
  if (explicit) return explicit;

  const modelPath = String(
    process.env.ROTORQUANT_MODEL_PATH ??
    process.env.TURBO_MODEL_PATH ??
    process.env.TURBOQUANT_MODEL_PATH ??
    '',
  ).trim();
  if (modelPath) {
    const base = path.basename(modelPath).trim();
    if (base) return base;
  }

  const gemma4 = String(process.env.GEMMA4_MODEL ?? '').trim();
  if (gemma4 && !/^gemma4-rotorquant(?::latest)?$/i.test(gemma4)) return gemma4;

  return 'gemma4-legal-iq4xs-direct.gguf';
}

const GEMMA4_MODEL = resolveLlamaServerModelId();

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

async function loadRepoEnv() {
  const env = await loadAtlasEnvFiles(REPO_ROOT, ['.env', '.env.local']);
  for (const [key, value] of Object.entries(env)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

function tokenize(text) {
  return unique(
    String(text ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9_./:-]+/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
}

function termsFromPacket(packet) {
  return unique([
    ...tokenize(packet.feature_id),
    ...tokenize(packet.feature_label),
    ...tokenize(packet.source_ref),
    ...tokenize(packet.canonical_source_ref),
    ...tokenize(packet.file_path),
    ...tokenize(packet.packet_key),
    ...tokenize(packet.summary),
    ...tokenize(Array.isArray(packet.tags) ? packet.tags.join(' ') : ''),
    ...tokenize(Array.isArray(packet.concepts) ? packet.concepts.join(' ') : ''),
    ...tokenize(Array.isArray(packet.lane_ids) ? packet.lane_ids.join(' ') : ''),
  ]);
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
    summary: normalizeText(packet.summary ?? ''),
    lane_ids: Array.isArray(packet.lane_ids) ? packet.lane_ids : [],
    tags: Array.isArray(packet.tags) ? packet.tags : [],
    concepts: Array.isArray(packet.concepts) ? packet.concepts : [],
    embedding: Array.isArray(packet.embedding) ? packet.embedding : null,
    embedding_dim: Number.isFinite(Number(packet.embedding_dim)) ? Number(packet.embedding_dim) : null,
    pagerank_score: packet.pagerank_score ?? packet.pagerank ?? null,
    authority_score: packet.authority_score ?? packet.authority ?? null,
    som_cluster: packet.som_cluster ?? packet.cluster_id ?? null,
    som_x: packet.som_x ?? null,
    som_y: packet.som_y ?? null,
  };
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length && i < b.length; i += 1) sum += Number(a[i]) * Number(b[i]);
  return sum;
}

function norm(a) {
  let sum = 0;
  for (const v of a) sum += Number(v) * Number(v);
  return Math.sqrt(sum);
}

function cosine(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  return dot(a, b) / (na * nb);
}

function packetId(packet) {
  return packet.packet_key || packet.source_ref || packet.canonical_source_ref || packet.file_path || 'unknown';
}

async function summarizeWithGemma4(packet, neighbors, terms) {
  if (!GEMMA4_ENABLED || !TURBOQUANT_URL) return null;
  const prompt = [
    'Summarize this codebase packet in one sentence.',
    `packet_key: ${packet.packet_key || '(missing)'}`,
    `source_ref: ${packet.source_ref || '(missing)'}`,
    `feature_id: ${packet.feature_id || '(missing)'}`,
    `feature_label: ${packet.feature_label || '(missing)'}`,
    `terms: ${terms.slice(0, 12).join(', ') || '(none)'}`,
    'neighbors:',
    ...neighbors.slice(0, 5).map((n) => `- ${n.packet_key || n.source_ref || '(unknown)'} score=${n.score.toFixed(4)}`),
    'Return only the summary sentence.',
  ].join('\n');

  try {
    const response = await fetch(`${TURBOQUANT_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        model: GEMMA4_MODEL,
        temperature: 0,
        stream: false,
        messages: [
          { role: 'system', content: 'You write concise technical packet summaries grounded in the supplied packet fields.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      data?.output_text ??
      null;
    return normalizeText(content) || null;
  } catch {
    return null;
  }
}

async function main() {
  await loadRepoEnv();
  const inputPath = INPUT_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  const selectedInput = inputPath ?? INPUT_CANDIDATES[0];
  const raw = await fsPromises.readFile(selectedInput, 'utf8').catch(() => '');
  const packets = parseNdjson(raw).filter((row) => row && !row.__invalid).map(normalizePacket);
  const selected = LIMIT > 0 ? packets.slice(0, LIMIT) : packets;

  const vectorPackets = selected.filter((packet) => Array.isArray(packet.embedding) && packet.embedding.length > 0);
  const vectorNorms = vectorPackets.map((packet) => norm(packet.embedding));

  const enriched = [];
  const summary = {
    inputRows: packets.length,
    selectedRows: selected.length,
    vectorRows: vectorPackets.length,
    termsRows: 0,
    pagerankRows: 0,
    cosineRows: 0,
    summaryRows: 0,
    summaryDeferredRows: 0,
    somRows: 0,
    missingVectorRows: selected.length - vectorPackets.length,
    lanedRows: 0,
  };

  const samples = [];
  for (let index = 0; index < selected.length; index += 1) {
    const packet = selected[index];
    const terms = termsFromPacket(packet);
    if (terms.length > 0) summary.termsRows += 1;

    const pagerankScore =
      Number.isFinite(Number(packet.pagerank_score)) ? Number(packet.pagerank_score) :
      Number.isFinite(Number(packet.authority_score)) ? Number(packet.authority_score) :
      null;
    if (pagerankScore !== null) summary.pagerankRows += 1;

    const neighbors = [];
    if (Array.isArray(packet.embedding) && packet.embedding.length > 0) {
      for (let j = 0; j < vectorPackets.length; j += 1) {
        const other = vectorPackets[j];
        if (packetId(other) === packetId(packet)) continue;
        const score = cosine(packet.embedding, other.embedding);
        if (!Number.isFinite(score)) continue;
        neighbors.push({
          packet_key: other.packet_key || null,
          source_ref: other.source_ref || null,
          score,
        });
      }
      neighbors.sort((a, b) => b.score - a.score);
      neighbors.splice(10);
      if (neighbors.length > 0) summary.cosineRows += 1;
    }

    let summaryText = packet.summary || null;
    if (APPLY_REQUESTED && !summaryText && summary.summaryDeferredRows < SUMMARY_LIMIT) {
      summaryText = await summarizeWithGemma4(packet, neighbors, terms);
    }
    if (summaryText) summary.summaryRows += 1;
    else summary.summaryDeferredRows += 1;

    const somCluster =
      packet.som_cluster ??
      packet.cluster_id ??
      packet.community_id ??
      null;
    const somX =
      Number.isFinite(Number(packet.som_x)) ? Number(packet.som_x) :
      null;
    const somY =
      Number.isFinite(Number(packet.som_y)) ? Number(packet.som_y) :
      null;
    if (somCluster !== null && somCluster !== undefined && String(somCluster).trim() !== '') summary.somRows += 1;

    const laneIds = unique([
      ...packet.lane_ids,
      'langextract',
      packet.embedding ? 'cosine_top10' : null,
      summaryText ? 'gemma4_summary' : null,
      somCluster !== null ? 'som20x20' : null,
      pagerankScore !== null ? 'pagerank' : null,
    ]);

    const enrichedPacket = {
      ...packet,
      lane_ids: laneIds,
      langextract_terms: terms,
      pagerank_score: pagerankScore,
      authority_score: Number.isFinite(Number(packet.authority_score)) ? Number(packet.authority_score) : null,
      top10_neighbors: neighbors,
      summary: summaryText,
      cluster_id: packet.cluster_id ?? packet.community_id ?? null,
      som_cluster: somCluster,
      som_x: somX,
      som_y: somY,
      topology_label: packet.topology_label ?? null,
      ontology_label: packet.ontology_label ?? null,
    };
    summary.lanedRows += 1;
    enriched.push(enrichedPacket);

    if (samples.length < SAMPLE) {
      samples.push({
        packet_key: packet.packet_key || null,
        source_ref: packet.source_ref || null,
        lane_ids: laneIds,
        terms: terms.slice(0, 8),
        neighbor_count: neighbors.length,
        summary_present: Boolean(summaryText),
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY_REQUESTED ? 'apply' : 'dry-run',
    inputPath: path.relative(REPO_ROOT, selectedInput).replace(/\\/g, '/'),
    outputPath: path.relative(REPO_ROOT, OUTPUT_PATH).replace(/\\/g, '/'),
    summary,
    samples,
    status: APPLY_REQUESTED ? 'APPLIED' : 'DRY_RUN_READY',
    nextSafeAction: APPLY_REQUESTED
      ? 'Use the enriched file as the source for TurboVec, Neo4j, and HyperRAG downstream passes.'
      : 'Review the lane output, then rerun with --apply to materialize the enriched packet file.',
  };

  await fsPromises.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fsPromises.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fsPromises.writeFile(
    REPORT_MD,
    [
      '# Packet Enrichment Lanes',
      '',
      `Generated: ${report.generatedAt}`,
      `Status: ${report.status}`,
      '',
      '## Summary',
      '',
      `- input rows: ${summary.inputRows}`,
      `- selected rows: ${summary.selectedRows}`,
      `- vector rows: ${summary.vectorRows}`,
      `- terms rows: ${summary.termsRows}`,
      `- pagerank rows: ${summary.pagerankRows}`,
      `- cosine rows: ${summary.cosineRows}`,
      `- summary rows: ${summary.summaryRows}`,
      `- summary deferred rows: ${summary.summaryDeferredRows}`,
      `- som rows: ${summary.somRows}`,
      `- missing vector rows: ${summary.missingVectorRows}`,
      '',
      '## Samples',
      '',
      ...samples.map((item) => `- ${item.packet_key || item.source_ref || '(missing packet)'} | lanes=${item.lane_ids.join(', ')} | neighbors=${item.neighbor_count} | summary=${item.summary_present ? 'yes' : 'no'}`),
      '',
      '## Next Safe Action',
      '',
      report.nextSafeAction,
      '',
    ].join('\n'),
    'utf8',
  );

  if (APPLY_REQUESTED) {
    await fsPromises.writeFile(
      OUTPUT_PATH,
      `${enriched.map((row) => JSON.stringify(row)).join('\n')}\n`,
      'utf8',
    );
  }

  console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_JSON)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_MD)}`);
  if (APPLY_REQUESTED) console.log(`Wrote ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
  console.log(JSON.stringify({
    status: report.status,
    selectedRows: summary.selectedRows,
    vectorRows: summary.vectorRows,
    summaryRows: summary.summaryRows,
    missingVectorRows: summary.missingVectorRows,
  }, null, 2));
}

main().catch((error) => {
  console.error('[run-packet-enrichment-lanes] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
