#!/usr/bin/env node
/**
 * Build a compact NESCHROM97 card registry.
 *
 * Reads local ignored card JSON plus the packet NDJSON ledger and writes small
 * report artifacts. It does not mutate Postgres, Qdrant, Redis, Neo4j, or card
 * JSON.
 */

import fs from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { CARDS_DIR } from './_neschrom-paths.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const PACKETS_PATH = path.join(REPO_ROOT, 'memory', 'packets', 'nes-chrom-packets.jsonl');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const DEFAULT_DATABASE_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'neschrom97-card-registry.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'neschrom97-card-registry.md');
const SMOKE = process.argv.includes('--smoke');
const NO_DB = process.argv.includes('--no-db');

function normalizeSourceRef(value) {
  return String(value ?? '').trim().replace(/\\/g, '/').replace(/^file:/, '').replace(/^\.?\//, '').replace(/^sveltekit-frontend\//, '');
}

function cleanString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanString).filter(Boolean))];
}

function topEntries(map, limit = 15) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const splitAt = trimmed.indexOf('=');
    if (splitAt < 0) continue;
    const key = trimmed.slice(0, splitAt).trim();
    let value = trimmed.slice(splitAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function loadCards() {
  if (!fs.existsSync(CARDS_DIR)) return { cards: [], invalid: 0 };
  const files = (await readdir(CARDS_DIR)).filter((file) => file.endsWith('.json') && file !== 'index.json').sort();
  const cards = [];
  let invalid = 0;

  for (const file of files) {
    try {
      const raw = JSON.parse(await readFile(path.join(CARDS_DIR, file), 'utf8'));
      const sourceRefRaw = cleanString(raw.source ?? raw.source_ref ?? raw.path ?? raw.file_path);
      cards.push({
        id: cleanString(raw.id) ?? file.replace(/\.json$/, ''),
        file,
        source_ref: normalizeSourceRef(sourceRefRaw),
        source_ref_raw: sourceRefRaw,
        title: cleanString(raw.title),
        summary: cleanString(raw.summary),
        tags: cleanStringArray(raw.tags),
        som_cluster: raw.som_cluster ?? raw.somCluster ?? null,
        gpu_cluster: raw.gpuCluster ?? raw.gpu_cluster ?? null,
        generated_at: cleanString(raw.generated_at),
      });
    } catch {
      invalid++;
    }
  }

  return { cards, invalid };
}

async function loadPackets() {
  if (!fs.existsSync(PACKETS_PATH)) return { packets: [], invalid: 0 };
  const text = await readFile(PACKETS_PATH, 'utf8');
  const packets = [];
  let invalid = 0;

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed);
      const sourceRefs = cleanStringArray(row.source_refs ?? row.sourceRefs).map(normalizeSourceRef);
      const featureIds = cleanStringArray(row.feature_ids ?? row.featureIds);
      packets.push({
        line: index + 1,
        packet_id: cleanString(row.packet_id ?? row.id),
        packet_key: cleanString(row.packet_key ?? row.packetKey ?? row.packet_id ?? row.id),
        query_hash: cleanString(row.query_hash ?? row.queryHash),
        feature_id: cleanString(row.feature_id ?? row.featureId) ?? featureIds[0] ?? null,
        feature_ids: featureIds,
        som_cluster: cleanString(row.som_cluster ?? row.somCluster),
        source_refs: sourceRefs,
        qdrant_hits: Number(row.qdrant_hits ?? row.qdrantHits ?? 0),
        cache_hit: Boolean(row.cache_hit ?? row.cacheHit),
        captured_at: cleanString(row.captured_at ?? row.capturedAt),
      });
    } catch {
      invalid++;
    }
  }

  return { packets, invalid };
}

async function loadLivePackets() {
  if (NO_DB) return { packets: [], reachable: false, error: 'disabled' };
  const env = {
    ...loadEnvFile(path.join(FRONTEND_ROOT, '.env')),
    ...loadEnvFile(path.join(FRONTEND_ROOT, '.env.local')),
    ...process.env,
  };
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL || DEFAULT_DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 3000,
    statement_timeout: 10000,
  });

  try {
    const relation = await pool.query(`select to_regclass('public.nes_chrom_packets') as table_name`);
    if (!relation.rows[0]?.table_name) return { packets: [], reachable: false, error: 'nes_chrom_packets missing' };

    const { rows } = await pool.query(`
      select
        id::text as packet_id,
        packet_key,
        query_hash,
        source_ref,
        source_refs,
        feature_id,
        feature_ids,
        som_cluster,
        qdrant_point_id,
        payload,
        created_at
      from nes_chrom_packets
      where source_ref is not null and source_ref <> ''
      order by updated_at desc nulls last, created_at desc nulls last
      limit 50000
    `);

    const packets = rows.map((row, index) => {
      const sourceRefs = [row.source_ref, ...cleanStringArray(row.source_refs)].map(normalizeSourceRef).filter(Boolean);
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
      const featureIds = cleanStringArray(row.feature_ids);
      return {
        line: index + 1,
        source: 'postgres',
        packet_id: cleanString(row.packet_id),
        packet_key: cleanString(row.packet_key ?? row.packet_id),
        query_hash: cleanString(row.query_hash),
        feature_id: cleanString(row.feature_id) ?? featureIds[0] ?? null,
        feature_ids: featureIds,
        som_cluster: cleanString(row.som_cluster ?? payload.som_cluster ?? payload.somCluster),
        source_refs: [...new Set(sourceRefs)],
        qdrant_hits: row.qdrant_point_id ? 1 : Number(payload.qdrant_hits ?? payload.qdrantHits ?? 0),
        cache_hit: false,
        captured_at: row.created_at instanceof Date ? row.created_at.toISOString() : cleanString(row.created_at),
      };
    });

    return { packets, reachable: true, error: null };
  } catch (err) {
    return { packets: [], reachable: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await pool.end().catch(() => {});
  }
}

function buildMarkdown(report) {
  const lines = [
    '# NESCHROM97 Card Registry',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- cards: ${report.counts.cards}`,
    `- packets: ${report.counts.packets}`,
    `- cardSourceRefCoverage: ${report.coverage.cardSourceRefCoverage}`,
    `- cardPacketJoinCoverage: ${report.coverage.cardPacketJoinCoverage}`,
    `- cardFeatureCoverage: ${report.coverage.cardFeatureCoverage}`,
    `- cardsWithSom: ${report.counts.cardsWithSom}`,
    `- cardsWithGpu: ${report.counts.cardsWithGpu}`,
    `- cardsWithTags: ${report.counts.cardsWithTags}`,
    `- invalidCardRows: ${report.invalid.cardRows}`,
    `- invalidPacketRows: ${report.invalid.packetRows}`,
    '',
    '## Top Features',
    '',
    ...(report.top.featureIds.length ? report.top.featureIds.map((entry) => `- ${entry.value}: ${entry.count}`) : ['- none']),
    '',
    '## Top SOM Clusters',
    '',
    ...(report.top.somClusters.length ? report.top.somClusters.map((entry) => `- ${entry.value}: ${entry.count}`) : ['- none']),
    '',
    '## Unjoined Card Samples',
    '',
    ...(report.samples.unjoinedCards.length ? report.samples.unjoinedCards.map((card) => `- ${card.id}: ${card.source_ref}`) : ['- none']),
    '',
    '## Notes',
    '',
    '- This registry is a local projection from ignored `neschrom97/cards/*.json` plus `memory/packets/nes-chrom-packets.jsonl`.',
    '- It does not write Postgres, Qdrant, Redis, Neo4j, or card JSON.',
    '- Card JSON remains cold/offline evidence; Postgres/NES packet tables remain canonical.',
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const [{ cards, invalid: invalidCards }, ndjsonPackets, livePackets] = await Promise.all([
    loadCards(),
    loadPackets(),
    loadLivePackets(),
  ]);
  const packets = [...livePackets.packets, ...ndjsonPackets.packets];

  const packetBySourceRef = new Map();
  for (const packet of packets) {
    for (const sourceRef of packet.source_refs) {
      if (!packetBySourceRef.has(sourceRef)) packetBySourceRef.set(sourceRef, []);
      packetBySourceRef.get(sourceRef).push(packet);
    }
  }

  const featureCounts = new Map();
  const somCounts = new Map();
  let cardsWithSourceRef = 0;
  let cardsWithPacketJoin = 0;
  let cardsWithFeature = 0;
  let cardsWithSom = 0;
  let cardsWithGpu = 0;
  let cardsWithTags = 0;

  const registry = cards.map((card) => {
    if (card.source_ref) cardsWithSourceRef++;
    if (card.som_cluster != null) cardsWithSom++;
    if (card.gpu_cluster != null) cardsWithGpu++;
    if (card.tags.length) cardsWithTags++;

    const packetMatches = packetBySourceRef.get(card.source_ref) ?? [];
    if (packetMatches.length) cardsWithPacketJoin++;
    const featureIds = [...new Set(packetMatches.flatMap((packet) => [packet.feature_id, ...packet.feature_ids]).filter(Boolean))];
    if (featureIds.length) cardsWithFeature++;
    for (const featureId of featureIds) featureCounts.set(featureId, (featureCounts.get(featureId) ?? 0) + 1);
    if (card.som_cluster != null) somCounts.set(String(card.som_cluster), (somCounts.get(String(card.som_cluster)) ?? 0) + 1);

    return {
      card_id: card.id,
      packet_keys: [...new Set(packetMatches.map((packet) => packet.packet_key).filter(Boolean))],
      packet_ids: [...new Set(packetMatches.map((packet) => packet.packet_id).filter(Boolean))],
      source_ref: card.source_ref,
      feature_ids: featureIds,
      feature_id: featureIds[0] ?? null,
      som_cluster: card.som_cluster,
      gpu_cluster: card.gpu_cluster,
      tags: card.tags,
      title: card.title,
      qdrant_hits: packetMatches.reduce((sum, packet) => sum + packet.qdrant_hits, 0),
      cache_hit_count: packetMatches.filter((packet) => packet.cache_hit).length,
    };
  });

  const report = {
    schema: 'neschrom97_card_registry.v1',
    generatedAt: new Date().toISOString(),
    inputs: {
      cardsDir: path.relative(REPO_ROOT, CARDS_DIR).replace(/\\/g, '/'),
      packetsPath: path.relative(REPO_ROOT, PACKETS_PATH).replace(/\\/g, '/'),
      livePostgres: livePackets.reachable ? 'reachable' : 'unavailable',
      livePostgresError: livePackets.error,
    },
    counts: {
      cards: cards.length,
      packets: packets.length,
      livePackets: livePackets.packets.length,
      ndjsonPackets: ndjsonPackets.packets.length,
      cardsWithSourceRef,
      cardsWithPacketJoin,
      cardsWithFeature,
      cardsWithSom,
      cardsWithGpu,
      cardsWithTags,
    },
    coverage: {
      cardSourceRefCoverage: cards.length ? Number((cardsWithSourceRef / cards.length).toFixed(4)) : 0,
      cardPacketJoinCoverage: cards.length ? Number((cardsWithPacketJoin / cards.length).toFixed(4)) : 0,
      cardFeatureCoverage: cards.length ? Number((cardsWithFeature / cards.length).toFixed(4)) : 0,
    },
    invalid: { cardRows: invalidCards, packetRows: ndjsonPackets.invalid },
    top: { featureIds: topEntries(featureCounts), somClusters: topEntries(somCounts) },
    samples: {
      joinedCards: registry.filter((row) => row.packet_keys.length).slice(0, 10),
      unjoinedCards: registry.filter((row) => !row.packet_keys.length).slice(0, 10).map((row) => ({ id: row.card_id, source_ref: row.source_ref })),
    },
    registry,
  };

  await mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(REPORT_MD, `${buildMarkdown(report)}\n`, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    cards: cards.length,
    packets: packets.length,
    livePackets: livePackets.packets.length,
    ndjsonPackets: ndjsonPackets.packets.length,
    cardPacketJoinCoverage: report.coverage.cardPacketJoinCoverage,
    cardFeatureCoverage: report.coverage.cardFeatureCoverage,
    reportJson: path.relative(REPO_ROOT, REPORT_JSON),
    reportMd: path.relative(REPO_ROOT, REPORT_MD),
  }, null, 2));

  if (SMOKE && cards.length === 0) {
    console.error('NESCHROM97 smoke failed: no cards discovered');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
