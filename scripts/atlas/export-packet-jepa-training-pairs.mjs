#!/usr/bin/env node
/**
 * Export deterministic packet training pairs for Packet-JEPA experiments.
 *
 * Produces:
 *   .tmp/packet-jepa-training-pairs.ndjson
 *   .tmp/packet-jepa-eval-candidates.ndjson
 *   docs/reports/packet-jepa-training-pairs.{json,md}
 */

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const TMP_DIR = path.join(REPO_ROOT, '.tmp');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const OUTPUT_PAIRS = path.join(TMP_DIR, 'packet-jepa-training-pairs.ndjson');
const OUTPUT_EVAL = path.join(TMP_DIR, 'packet-jepa-eval-candidates.ndjson');
const REPORT_JSON = path.join(REPORTS_DIR, 'packet-jepa-training-pairs.json');
const REPORT_MD = path.join(REPORTS_DIR, 'packet-jepa-training-pairs.md');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run') || argv.includes('--dry');
const LIMIT = parseIntFlag(argv, '--limit', 1000);
const OFFSET = parseIntFlag(argv, '--offset', 0);
const NEGATIVES = parseIntFlag(argv, '--negatives', 9);
const MAX_POSITIVES = parseIntFlag(argv, '--max-positives', 3);

const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });

function parseIntFlag(args, name, fallback) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    const parsed = Number.parseInt(inline.slice(name.length + 1), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  const idx = args.findIndex((arg) => arg === name);
  if (idx >= 0 && args[idx + 1]) {
    const parsed = Number.parseInt(args[idx + 1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => normalizeText(value)).filter(Boolean))];
}

function parseVector(value) {
  if (Buffer.isBuffer(value)) {
    const out = [];
    for (let offset = 0; offset + 4 <= value.length; offset += 4) {
      out.push(value.readFloatLE(offset));
    }
    return out.filter(Number.isFinite);
  }
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (value == null) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const body = trimmed.replace(/^\[/, '').replace(/\]$/, '').replace(/^\{/, '').replace(/\}$/, '');
    return body
      .split(',')
      .map((part) => Number.parseFloat(part.trim()))
      .filter(Number.isFinite);
  }
  return [];
}

function stableHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function splitForPacket(packetKey) {
  return stableHash(packetKey) % 10 < 2 ? 'eval' : 'train';
}

function addToGroup(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function candidateRelations(anchor, candidate) {
  const relations = [];
  if (anchor.feature_id && anchor.feature_id === candidate.feature_id) relations.push('same_feature_id');
  if (anchor.tree_node_id && anchor.tree_node_id === candidate.tree_node_id) relations.push('same_tree_node_id');
  if (anchor.community_id && String(anchor.community_id) === String(candidate.community_id)) relations.push('same_community_id');
  if (
    Number.isFinite(anchor.som_row) &&
    Number.isFinite(anchor.som_col) &&
    Number.isFinite(candidate.som_row) &&
    Number.isFinite(candidate.som_col)
  ) {
    const dist = Math.abs(anchor.som_row - candidate.som_row) + Math.abs(anchor.som_col - candidate.som_col);
    if (dist === 0) relations.push('same_som_cell');
    else if (dist === 1) relations.push('som_neighbor');
  }
  if (anchor.parent_packet_key && anchor.parent_packet_key === candidate.packet_key) relations.push('parent_child');
  if (candidate.parent_packet_key && candidate.parent_packet_key === anchor.packet_key) relations.push('child_parent');
  if (anchor.related_packets.includes(candidate.packet_key) || candidate.related_packets.includes(anchor.packet_key)) relations.push('related_packet');
  if (anchor.directory_path && anchor.directory_path === candidate.directory_path) relations.push('same_directory');
  return relations;
}

function relationWeight(relations) {
  const weights = {
    same_tree_node_id: 1.0,
    parent_child: 0.95,
    child_parent: 0.95,
    related_packet: 0.9,
    same_feature_id: 0.85,
    same_community_id: 0.6,
    same_som_cell: 0.5,
    som_neighbor: 0.4,
    same_directory: 0.25,
  };
  return relations.reduce((sum, relation) => sum + (weights[relation] ?? 0), 0);
}

async function tableExists(client, tableName) {
  const { rows } = await client.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [`public.${tableName}`]);
  return rows[0]?.exists === true;
}

async function getColumns(client, tableName) {
  const { rows } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
  `, [tableName]);
  return new Set(rows.map((row) => row.column_name));
}

function pushIfHas(select, hasColumn, tableAlias, columnName, alias = columnName) {
  if (hasColumn) {
    select.push(alias === columnName ? `${tableAlias}.${columnName}` : `${tableAlias}.${columnName} AS ${alias}`);
  }
}

async function loadPackets(limit, offset) {
  const client = await pool.connect();
  try {
    const packetCols = await getColumns(client, 'atlas_packets');
    const featureExists = await tableExists(client, 'atlas_packet_features');
    const featureCols = featureExists ? await getColumns(client, 'atlas_packet_features') : new Set();
    const select = [
      'ap.packet_key',
      'ap.source_ref',
      'ap.feature_id',
      'ap.domain_class',
      'ap.title_id',
      'ap.tree_node_id',
      'ap.community_id',
      'ap.som_row',
      'ap.som_col',
      'ap.directory_path',
      'ap.parent_packet_key',
      'ap.related_packets',
      'ap.content_embedding_384',
      'ap.embedding',
      'ap.latent_64',
      'ap.summary',
      'ap.keywords',
    ];
    pushIfHas(select, packetCols.has('used_concepts'), 'ap', 'used_concepts');
    if (featureExists) {
      pushIfHas(select, featureCols.has('used_concepts'), 'apf', 'used_concepts', 'features_used_concepts');
      pushIfHas(select, featureCols.has('lexical_features'), 'apf', 'lexical_features');
      pushIfHas(select, featureCols.has('ast_symbols'), 'apf', 'ast_symbols');
      pushIfHas(select, featureCols.has('entities'), 'apf', 'entities');
    }
    const sql = `
      SELECT ${select.join(',\n             ')}
      FROM atlas_packets ap
      ${featureExists ? 'LEFT JOIN atlas_packet_features apf ON apf.packet_key = ap.packet_key' : ''}
      WHERE ap.packet_key IS NOT NULL
        AND ap.feature_id IS NOT NULL
        AND (ap.content_embedding_384 IS NOT NULL OR ap.embedding IS NOT NULL OR ap.latent_64 IS NOT NULL)
      ORDER BY ap.packet_key
      LIMIT $1 OFFSET $2
    `;
    const { rows } = await client.query(sql, [limit, offset]);
    const normalizedRows = rows.map((row) => ({
      packet_key: normalizeText(row.packet_key),
      source_ref: normalizeText(row.source_ref),
      feature_id: normalizeText(row.feature_id),
      domain_class: normalizeText(row.domain_class),
      title_id: normalizeText(row.title_id),
      tree_node_id: normalizeText(row.tree_node_id),
      community_id: normalizeText(row.community_id),
      som_row: Number.isFinite(Number(row.som_row)) ? Number(row.som_row) : null,
      som_col: Number.isFinite(Number(row.som_col)) ? Number(row.som_col) : null,
      directory_path: normalizeText(row.directory_path),
      parent_packet_key: normalizeText(row.parent_packet_key),
      related_packets: uniqueStrings(Array.isArray(row.related_packets) ? row.related_packets : []),
      summary: normalizeText(row.summary),
      keywords: uniqueStrings(Array.isArray(row.keywords) ? row.keywords : []),
      used_concepts: uniqueStrings(Array.isArray(row.used_concepts) ? row.used_concepts : row.features_used_concepts),
      lexical_features: uniqueStrings(Array.isArray(row.lexical_features) ? row.lexical_features : []),
      ast_symbols: uniqueStrings(Array.isArray(row.ast_symbols) ? row.ast_symbols : []),
      entities: uniqueStrings(Array.isArray(row.entities) ? row.entities : []),
      vector: (() => {
        const embedding384 = parseVector(row.content_embedding_384 || row.embedding);
        if (embedding384.length >= 128) return embedding384;
        const latent64 = parseVector(row.latent_64);
        if (latent64.length >= 16) return latent64;
        return [];
      })(),
    })).filter((row) => row.vector.length >= 16);

    const dimCounts = new Map();
    for (const row of normalizedRows) {
      dimCounts.set(row.vector.length, (dimCounts.get(row.vector.length) ?? 0) + 1);
    }
    const dominantDim = [...dimCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return normalizedRows.filter((row) => row.vector.length === dominantDim);
  } finally {
    client.release();
  }
}

function buildPairs(packets) {
  const byFeature = new Map();
  const byTree = new Map();
  const byCommunity = new Map();
  const byDomain = new Map();
  const byDirectory = new Map();
  const bySom = new Map();
  for (const packet of packets) {
    addToGroup(byFeature, packet.feature_id, packet);
    addToGroup(byTree, packet.tree_node_id, packet);
    addToGroup(byCommunity, packet.community_id, packet);
    addToGroup(byDomain, packet.domain_class, packet);
    addToGroup(byDirectory, packet.directory_path, packet);
    addToGroup(bySom, Number.isFinite(packet.som_row) && Number.isFinite(packet.som_col) ? `${packet.som_row}:${packet.som_col}` : '', packet);
  }

  const all = packets;
  const pairRows = [];
  const evalRows = [];

  for (const anchor of packets) {
    const positivePool = new Map();
    const candidatePools = [
      byTree.get(anchor.tree_node_id) ?? [],
      byFeature.get(anchor.feature_id) ?? [],
      byCommunity.get(anchor.community_id) ?? [],
      byDirectory.get(anchor.directory_path) ?? [],
      bySom.get(Number.isFinite(anchor.som_row) && Number.isFinite(anchor.som_col) ? `${anchor.som_row}:${anchor.som_col}` : '') ?? [],
      all.filter((packet) => anchor.related_packets.includes(packet.packet_key)),
    ];
    for (const pool of candidatePools) {
      for (const candidate of pool) {
        if (candidate.packet_key === anchor.packet_key) continue;
        positivePool.set(candidate.packet_key, candidate);
      }
    }

    const positives = [...positivePool.values()]
      .map((candidate) => ({
        candidate,
        relations: candidateRelations(anchor, candidate),
      }))
      .filter((item) => item.relations.length > 0)
      .sort((a, b) => relationWeight(b.relations) - relationWeight(a.relations))
      .slice(0, MAX_POSITIVES);

    if (positives.length === 0) continue;

    const usedNegativeKeys = new Set([anchor.packet_key, ...positives.map((item) => item.candidate.packet_key)]);
    const negatives = [];
    const negativePool = all.filter((packet) =>
      !usedNegativeKeys.has(packet.packet_key) &&
      packet.domain_class !== anchor.domain_class
    );
    const start = stableHash(anchor.packet_key) % Math.max(negativePool.length || 1, 1);
    for (let i = 0; i < negativePool.length && negatives.length < NEGATIVES; i += 1) {
      const candidate = negativePool[(start + i) % negativePool.length];
      if (!candidate || usedNegativeKeys.has(candidate.packet_key)) continue;
      negatives.push(candidate);
      usedNegativeKeys.add(candidate.packet_key);
    }

    const split = splitForPacket(anchor.packet_key);
    for (const positive of positives) {
      pairRows.push({
        anchor_packet_key: anchor.packet_key,
        target_packet_key: positive.candidate.packet_key,
        split,
        label: 1,
        relation_types: positive.relations,
        relation_weight: relationWeight(positive.relations),
        anchor_domain_class: anchor.domain_class,
        target_domain_class: positive.candidate.domain_class,
        anchor_feature_id: anchor.feature_id,
        target_feature_id: positive.candidate.feature_id,
        anchor_tree_node_id: anchor.tree_node_id,
        target_tree_node_id: positive.candidate.tree_node_id,
        input_dim: anchor.vector.length,
        anchor_vector: anchor.vector,
        target_vector: positive.candidate.vector,
      });
    }

    if (split === 'eval' && negatives.length > 0) {
      evalRows.push({
        query_packet_key: anchor.packet_key,
        split,
        query_domain_class: anchor.domain_class,
        input_dim: anchor.vector.length,
        query_vector: anchor.vector,
        positive_packet_keys: positives.map((item) => item.candidate.packet_key),
        positive_vectors: positives.map((item) => item.candidate.vector),
        negative_packet_keys: negatives.map((item) => item.packet_key),
        negative_vectors: negatives.map((item) => item.vector),
        relation_types: positives.map((item) => item.relations),
      });
    }
  }

  return { pairRows, evalRows };
}

function renderMarkdown(report) {
  return [
    '# Packet JEPA Training Pair Export',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    '',
    '## Summary',
    '',
    `- packets loaded: ${report.summary.packetsLoaded}`,
    `- training pairs: ${report.summary.trainingPairs}`,
    `- eval candidate rows: ${report.summary.evalRows}`,
    `- negatives per eval row: ${report.summary.negativesPerEvalRow}`,
    '',
    '## Next Safe Action',
    '',
    report.nextSafeAction,
    '',
  ].join('\n');
}

async function main() {
  const packets = await loadPackets(LIMIT, OFFSET);
  const { pairRows, evalRows } = buildPairs(packets);

  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  if (!DRY_RUN) {
    await fs.writeFile(OUTPUT_PAIRS, `${pairRows.map((row) => JSON.stringify(row)).join('\n')}${pairRows.length ? '\n' : ''}`, 'utf8');
    await fs.writeFile(OUTPUT_EVAL, `${evalRows.map((row) => JSON.stringify(row)).join('\n')}${evalRows.length ? '\n' : ''}`, 'utf8');
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : 'apply',
    inputs: { limit: LIMIT, offset: OFFSET },
    outputs: {
      trainingPairs: path.relative(REPO_ROOT, OUTPUT_PAIRS).replace(/\\/g, '/'),
      evalCandidates: path.relative(REPO_ROOT, OUTPUT_EVAL).replace(/\\/g, '/'),
    },
    summary: {
      packetsLoaded: packets.length,
      trainingPairs: pairRows.length,
      evalRows: evalRows.length,
      negativesPerEvalRow: NEGATIVES,
    },
    nextSafeAction: 'node scripts/atlas/run-venv-python.mjs scripts/atlas/train-packet-jepa.py --dry-run',
  };

  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD, `${renderMarkdown(report)}\n`, 'utf8');

  console.log(JSON.stringify({
    status: 'READY',
    mode: report.mode,
    packetsLoaded: packets.length,
    trainingPairs: pairRows.length,
    evalRows: evalRows.length,
  }, null, 2));
}

main().catch((error) => {
  console.error('[export-packet-jepa-training-pairs] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
