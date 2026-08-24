#!/usr/bin/env node

/**
 * Read-only Graphify file-index export.
 *
 * Postgres is the canonical source. This emits rebuildable JSONL for
 * ast-grep, Go retrieval, HyperGraphRAG, mmap/Arrow workers, and embedding
 * projection jobs. It does not create indexes or write a database.
 *
 * Usage:
 *   node scripts/atlas/export-graphify-file-index-v1.mjs --limit=100
 *   node scripts/atlas/export-graphify-file-index-v1.mjs --all
 *   node scripts/atlas/export-graphify-file-index-v1.mjs --all --include-vectors
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const value = (name, fallback) => {
  const item = args.find((arg) => arg.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : fallback;
};
const limitArg = Number.parseInt(value('--limit', '1000'), 10);
const limit = has('--all') ? 0 : (Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 1000);
const includeVectors = has('--include-vectors');
const outputDir = path.resolve(ROOT, value('--output-dir', '.tmp/atlas/graphify-file-index-v1'));
const packetOutput = path.join(outputDir, 'packets.jsonl');
const manifestOutput = path.join(outputDir, 'manifest.json');
const astOutput = path.join(outputDir, 'ast-entities.jsonl');
const reportOutput = path.join(ROOT, 'docs/reports/graphify-file-index-v1.json');

function sqlLiteralLimit() {
  return limit === 0 ? '' : ` LIMIT ${limit}`;
}

function query() {
  const vector = includeVectors ? `, 'embedding', ap.embedding::text` : '';
  return `
    SELECT json_build_object(
      'schema', 'atlas.graphify-file-index-row.v1',
      'packet_key', ap.packet_key,
      'source_ref', ap.source_ref,
      'source_ref_hash', encode(digest(COALESCE(ap.source_ref, ''), 'sha256'), 'hex'),
      'file_url', COALESCE(ap.file_path, ap.source_path, ap.source_ref),
      'feature_id', ap.feature_id,
      'feature_label', ap.feature_label,
      'title_id', ap.title_id,
      'tree_node_id', ap.tree_node_id,
      'source_revision', COALESCE(NULLIF(ap.content_hash, ''), NULLIF(ap.sha256, ''), CASE WHEN ap.workspace_revision IS NOT NULL THEN 'workspace:' || ap.workspace_revision::text END),
      'workspace_revision', ap.workspace_revision,
      'representation_revision', ap.representation_revision,
      'content_hash', ap.content_hash,
      'embedding_digest', ap.embedding_digest,
      'embedding_dimension', ap.source_dimension,
      'embedding_status', ap.embedding_status,
      'domain_class', ap.domain_class,
      'primary_domain', ap.primary_domain,
      'concept_ids', COALESCE(ap.concept_ids, ARRAY[]::text[]),
      'domain_memberships', COALESCE(ap.domain_memberships, '[]'::jsonb),
      'ontology', ap.ontology,
      'packet_ontology', ap.packet_ontology,
      'keywords', COALESCE(ap.keywords, ARRAY[]::text[]),
      'tokens', array_remove(regexp_split_to_array(lower(regexp_replace(COALESCE(ap.source_ref, '') || ' ' || COALESCE(ap.feature_label, '') || ' ' || COALESCE(ap.summary, ''), '[^[:alnum:]_]+', ' ', 'g')), '[[:space:]]+'), ''),
      'payload', COALESCE(ap.payload, '{}'::jsonb),
      'metadata', COALESCE(ap.metadata, '{}'::jsonb),
      'routing', json_build_object('som_cluster', ap.som_cluster, 'som_row', ap.som_row, 'som_col', ap.som_col, 'kmeans_cluster', ap.kmeans_cluster, 'page_rank_score', ap.page_rank_score, 'community_id', ap.community_id),
      'provenance', json_build_object('identity_lane', ap.identity_lane, 'identity_confidence', ap.identity_confidence, 'canonical_source_ref', ap.canonical_source_ref, 'lineage_version', ap.lineage_version)
      ${vector}
    )::text
    FROM atlas_packets ap
    WHERE ap.packet_key IS NOT NULL AND NULLIF(ap.source_ref, '') IS NOT NULL
    ORDER BY ap.source_ref, ap.packet_key${sqlLiteralLimit()};`;
}

function runPsql(sql) {
  return spawn('docker', ['exec', '-i', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-c', sql], { windowsHide: true });
}

async function exportPackets() {
  await fsp.mkdir(outputDir, { recursive: true });
  const output = fs.createWriteStream(packetOutput, { encoding: 'utf8' });
  const child = runPsql(query());
  const childClosed = new Promise((resolve) => child.once('close', (code) => resolve(code ?? 1)));
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const reader = readline.createInterface({ input: child.stdout });
  let rows = 0;
  let invalid = 0;
  const hash = createHash('sha256');
  for await (const line of reader) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      const normalized = `${JSON.stringify(parsed)}\n`;
      output.write(normalized);
      hash.update(normalized);
      rows += 1;
    } catch {
      invalid += 1;
    }
  }
  await new Promise((resolve, reject) => {
    output.end(resolve);
    output.on('error', reject);
  });
  const code = await childClosed;
  if (code !== 0) throw new Error(`postgres export failed with exit code ${code}: ${stderr.trim()}`);
  return { rows, invalid, checksum: hash.digest('hex') };
}

async function runAstPrefill() {
  const args = [path.join(ROOT, 'scripts/atlas/run-ast-entity-prefill-yaml.mjs'), `--output=${astOutput}`];
  args.push(limit ? `--limit=${limit}` : '--all');
  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
  let stdout = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  return new Promise((resolve) => child.on('close', (code) => {
    let receipt = null;
    try { receipt = JSON.parse(stdout.trim()); } catch { /* the exit code remains authoritative */ }
    resolve({ code: code ?? 1, receipt });
  }));
}

const packet = await exportPackets();
const ast = await runAstPrefill();
const manifest = {
  schema: 'atlas.graphify-file-index-manifest.v1',
  read_only: true,
  canonical_authority: 'postgres',
  source_table: 'atlas_packets',
  packet_jsonl: path.relative(ROOT, packetOutput).replaceAll('\\', '/'),
  ast_jsonl: path.relative(ROOT, astOutput).replaceAll('\\', '/'),
  packet_count: packet.rows,
  invalid_rows: packet.invalid,
  packet_checksum: packet.checksum,
  ast_exit_code: ast.code,
  ast_receipt: ast.receipt,
  ast_extractor: 'ast-grep-napi',
  lexical_owner: 'postgres_tsvector_gin_ts_rank_cd',
  lexical_compatibility_alias: 'ps_fts',
  json_parser: 'simdjson_optional_consumer_v8_export_validation',
  vector_transport: includeVectors ? 'postgres_embedding_json' : 'embedding_metadata_only',
  graph_exports: ['tree_node_id', 'routing', 'provenance'],
  hypergraph_input: ['concept_ids', 'ontology', 'packet_ontology', 'payload'],
  canonical_writes: false,
};
await fsp.writeFile(manifestOutput, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await fsp.writeFile(reportOutput, `${JSON.stringify({ ...manifest, generated_at: new Date().toISOString(), report: path.relative(ROOT, reportOutput).replaceAll('\\', '/') }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...manifest, manifest: path.relative(ROOT, manifestOutput).replaceAll('\\', '/'), report: path.relative(ROOT, reportOutput).replaceAll('\\', '/') }, null, 2));
