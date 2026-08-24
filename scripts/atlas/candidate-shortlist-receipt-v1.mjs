#!/usr/bin/env node
/**
 * Read-only CandidateFeatureMatrix -> low-rank shortlist receipt.
 *
 * The matrix is a rebuildable projection of ORF metadata. PostgreSQL remains
 * canonical; CandidateOrdinal is an execution address derived from the
 * deterministic packet-key order in this receipt.
 */
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (match) args.set(match[1], match[2]);
}

const env = loadRepoEnv();
const limit = Math.max(1, Math.min(512, Number(args.get('limit') ?? 512)));
const targetCount = Math.max(1, Math.min(96, Number(args.get('target-count') ?? 96)));
const rank = Math.max(1, Math.min(32, Number(args.get('rank') ?? 8)));
const featureRevision = String(args.get('feature-revision') ?? 'atlas-ast-entity-prefill-v2');
const outputPath = path.resolve(REPO_ROOT, String(args.get('out') ?? 'docs/reports/atlas-candidate-shortlist-receipt-v1.json'));

function loadPg() {
  const roots = [path.join(REPO_ROOT, 'sveltekit-frontend', 'node_modules'), path.join(REPO_ROOT, 'node_modules')];
  for (const root of roots) {
    try { return createRequire(path.join(root, '_dummy.js'))('pg'); } catch {}
  }
  throw new Error('pg package not found in workspace node_modules');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

function flag(value, key) {
  return value && typeof value === 'object' && value[key] ? 1 : 0;
}

function rowFeatures(row) {
  return [
    count(row.ast_observation_kinds),
    count(row.ontology_classes),
    count(row.langextract_classes),
    count(row.flattened_tags),
    count(row.evidence_refs),
    flag(row.structural_flags, 'hasFunction'),
    flag(row.structural_flags, 'hasDatabaseAccess'),
    Number(row.pagerank ?? 0),
    Number(row.personalized_pagerank ?? 0),
    Number(row.som_row ?? 0),
    Number(row.som_col ?? 0),
    Number(row.kmeans_cluster_id ?? 0),
  ].map((value) => Number.isFinite(value) ? value : 0);
}

function parseVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/^\[|\]$/g, '');
  if (!text) return null;
  const values = text.split(',').map(Number);
  return values.every(Number.isFinite) ? values : null;
}

async function main() {
  const { Pool } = loadPg();
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 1, statement_timeout: 15_000 });
  try {
    const result = await pool.query(`
      SELECT o.packet_key, o.source_ref, o.feature_revision, o.ast_observation_kinds,
             ontology_classes, langextract_classes, flattened_tags, evidence_refs,
             structural_flags, kmeans_cluster_id, som_row, som_col,
             pagerank, personalized_pagerank, c.content_embedding
      FROM atlas_observation_feature_rows o
      LEFT JOIN LATERAL (
        SELECT cci.content_embedding
        FROM codebase_chunk_index cci
        WHERE cci.source_ref = o.source_ref
        ORDER BY cci.source_ref
        LIMIT 1
      ) c ON true
      WHERE o.feature_revision = $1 AND c.content_embedding IS NOT NULL
      ORDER BY o.packet_key
      LIMIT $2
    `, [featureRevision, limit]);
    if (result.rows.length < targetCount || result.rows.length < 2) {
      throw new Error(`insufficient ORF rows: ${result.rows.length}; need at least ${targetCount}`);
    }

    const rows = result.rows;
    const semantic = rows.map((row) => parseVector(row.content_embedding));
    if (semantic.some((vector) => !vector || vector.length !== 768)) {
      throw new Error('semantic_768 coverage is incomplete for the frozen shortlist snapshot');
    }
    const ordinals = rows.map((_, index) => index);
    const matrix = rows.map(rowFeatures);
    const queryFeatures = matrix[0].map((_, column) => matrix.reduce((sum, row) => sum + row[column], 0) / matrix.length);
    const payload = JSON.stringify({ matrix, ordinals, queryFeatures, semantic, rank, targetCount });
    const python = spawnSync(process.env.PYTHON ?? 'python', ['-c', `
import json
import sys
from atlas_compute.low_rank import shortlist_candidate_ordinals
from atlas_compute.exact_semantic import exact_semantic_search
payload = json.load(sys.stdin)
selected, receipt = shortlist_candidate_ordinals(
    payload['matrix'], payload['ordinals'], payload['queryFeatures'],
    rank=payload['rank'], target_count=payload['targetCount'], device='cpu', seed=0xA71A5,
)
query = [payload['semantic'][0]]
ids = [str(value) for value in payload['ordinals']]
full = exact_semantic_search(payload['semantic'], query, ids, metric='cosine', top_k=len(ids), device='cpu')
selected_set = set(selected)
short_rows = [index for index in range(len(ids)) if index in selected_set]
short_vectors = [payload['semantic'][index] for index in short_rows]
short_ids = [str(index) for index in short_rows]
short = exact_semantic_search(short_vectors, [payload['semantic'][0]], short_ids, metric='cosine', top_k=len(short_ids), device='cpu')
full_order = [hit.ordinal for hit in full.hits[0]]
short_order = [int(hit.canonical_id) for hit in short.hits[0]]
metrics = {}
for k in (10, 24):
    oracle = set(full_order[:k])
    admitted = set(short_order[:k])
    metrics[f'recallAt{k}'] = len(oracle & admitted) / float(k)
    metrics[f'top{k}Overlap'] = metrics[f'recallAt{k}']
oracle_top24 = set(full_order[:24])
dcg = sum((1.0 / __import__('math').log2(rank + 2)) for rank, ordinal in enumerate(short_order[:24]) if ordinal in oracle_top24)
ideal = sum((1.0 / __import__('math').log2(rank + 2)) for rank in range(24))
metrics['oracleNdcgAt24'] = dcg / ideal if ideal else 0.0
metrics['shortlistContainsOracleTop24'] = len(set(full_order[:24]) & selected_set) / 24.0
print(json.dumps({'selected': selected, 'receipt': receipt.to_dict(), 'exact': {
    'metric': 'cosine', 'dimensions': 768, 'device': 'cpu',
    'fullTop24': full_order[:24], 'shortlistTop24': short_order[:24], 'metrics': metrics,
    'oracleChecksum': full.result_checksum, 'shortlistChecksum': short.result_checksum,
}}))
`], { cwd: REPO_ROOT, input: payload, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    if (python.status !== 0) throw new Error(`low-rank adapter failed: ${python.stderr || python.stdout}`);
    const shortlist = JSON.parse(python.stdout);
    const packetKeys = shortlist.selected.map((ordinal) => rows[ordinal]?.packet_key).filter(Boolean);
    const packetKeyChecksum = sha256(packetKeys.join('\n'));
    const ordinalMapChecksum = sha256(rows.map((row, ordinal) => `${ordinal}\t${row.packet_key}`).join('\n'));
    const report = {
      schema: 'atlas.candidate-shortlist-receipt.v1',
      generatedAt: new Date().toISOString(),
      readOnly: true,
      databaseWrites: false,
      canonicalAuthority: false,
      featureRevision,
      inputCount: rows.length,
      targetCount,
      rank,
      ordinalMap: 'sorted_packet_key_execution_ordinal_v1',
      ordinalMapChecksum,
      candidateOrdinals: shortlist.selected,
      packetKeyChecksum,
      lowRank: shortlist.receipt,
      exactSemantic: shortlist.exact,
      sourceRefs: packetKeys.map((packetKey) => rows.find((row) => row.packet_key === packetKey)?.source_ref),
      quality: {
        exactRerank: 'EXECUTED',
        recallAt10: shortlist.exact.metrics.recallAt10,
        recallAt24: shortlist.exact.metrics.recallAt24,
        top24Overlap: shortlist.exact.metrics.top24Overlap,
        oracleNdcgAt24: shortlist.exact.metrics.oracleNdcgAt24,
        ndcgAt24: null,
      },
      status: 'EXECUTED_UNPROVEN',
    };
    await import('node:fs/promises').then(({ writeFile, mkdir }) => mkdir(path.dirname(outputPath), { recursive: true }).then(() => writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 2; });
