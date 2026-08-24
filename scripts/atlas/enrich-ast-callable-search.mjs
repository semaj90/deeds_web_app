#!/usr/bin/env node
/**
 * Read-only by default. Enriches the rebuildable callable-search projection
 * from AST domain candidates and nominations. Canonical symbol identity is
 * never created here.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = Number((args.find((arg) => arg.startsWith('--limit=')) || '').split('=')[1] || 0) || null;
const domainPath = path.resolve(ROOT, '.tmp/atlas/graphify-file-index-v1/ast-entity-okf-domain.jsonl');
const nominationPath = path.resolve(ROOT, '.tmp/atlas/graphify-file-index-v1/ast-symbol-nominations.jsonl');
const reportPath = path.resolve(ROOT, 'docs/reports/ast-callable-enrichment-v1.json');
const readJsonl = async (file) => (await fs.readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean).map(JSON.parse);

function inferUses(row, nomination) {
  const text = [row.qualified_name, row.signature_normalized, ...(row.imports || []), ...(row.calls || []), nomination?.container_qualified_name]
    .filter(Boolean).join(' ').toLowerCase();
  const rules = [
    ['retrieval', ['qdrant', 'embedding', 'vector', 'search', 'rank', 'bm25', 'rrf']],
    ['database', ['postgres', 'drizzle', 'sql', 'migration', 'query', 'insert', 'select']],
    ['network', ['fetch', 'http', 'grpc', 'socket', 'request', 'response']],
    ['cache', ['redis', 'valkey', 'cache', 'ttl', 'memo']],
    ['graph', ['neo4j', 'graph', 'pagerank', 'community', 'edge', 'node', 'traversal']],
    ['agent', ['agent', 'mcp', 'workflow', 'tool', 'prompt', 'trace']],
    ['ml', ['torch', 'cuda', 'xgboost', 'embedding', 'model', 'tensor', 'som', 'kmeans']],
  ];
  return rules.filter(([, words]) => words.some((word) => text.includes(word))).map(([name]) => name);
}

const domains = await readJsonl(domainPath);
const nominations = await readJsonl(nominationPath);
const domainByKey = new Map(domains.map((row) => [`${row.source_ref}\0${row.symbol_name}\0${row.symbol_kind}`, row]));
const nominationByKey = new Map(nominations.map((row) => [`${row.source_ref}\0${row.name}\0${row.kind}`, row]));
const report = {
  schema: 'atlas.ast-callable-enrichment-v1', mode: APPLY ? 'APPLY' : 'DRY_RUN',
  domainCandidates: domains.length, nominationCandidates: nominations.length,
  rowsSeen: 0, rowsMatched: 0, rowsEnriched: 0, variablesSkipped: 0,
  databaseWrites: false, canonicalWrites: false, sample: [], limit: LIMIT,
};

const pool = new pg.Pool({ connectionString: DATABASE_URL });
if (!APPLY) {
  const byKind = Object.groupBy ? Object.groupBy(domains, (row) => row.symbol_kind) : {};
  const rows = (await pool.query(`SELECT symbol_version_id, qualified_name, node_kind, source_ref, source_revision, callable_metadata FROM atlas_callable_search ORDER BY symbol_version_id LIMIT $1`, [LIMIT || 100])).rows;
  report.rowsSeen = rows.length;
  for (const row of rows) {
    const metadata = row.callable_metadata || {};
    const kind = String(row.node_kind || metadata.kind || '').toLowerCase();
    const name = String(row.qualified_name || '').split('.').pop();
    const domain = domainByKey.get(`${row.source_ref}\0${name}\0${kind}`);
    if (!domain) continue;
    report.rowsMatched++;
    if (report.sample.length < 5) report.sample.push({ sourceRef: row.source_ref, symbol: row.qualified_name, kind, domain: domain.domain_id, inferredUses: inferUses(row, null) });
  }
  report.kindCounts = Object.fromEntries(Object.entries(byKind).map(([kind, rows]) => [kind, rows.length]));
  await pool.end();
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
if (!LIMIT) throw new Error('--apply requires an explicit --limit=N');

try {
  const rows = (await pool.query(`SELECT symbol_version_id, qualified_name, node_kind, source_ref, source_revision, callable_metadata FROM atlas_callable_search ORDER BY symbol_version_id LIMIT $1`, [LIMIT])).rows;
  report.rowsSeen = rows.length;
  await pool.query('BEGIN');
  for (const row of rows) {
    const kind = String(row.node_kind || row.callable_metadata?.kind || '').toLowerCase();
    if (kind === 'variable') { report.variablesSkipped++; continue; }
    const name = String(row.qualified_name || '').split('.').pop();
    const domain = domainByKey.get(`${row.source_ref}\0${name}\0${kind}`) || domainByKey.get(`${row.source_ref}\0${name}\0${kind === 'function_declaration' ? 'function' : kind}`);
    if (!domain) continue;
    const nomination = nominationByKey.get(`${row.source_ref}\0${name}\0${kind}`);
    const inferredUses = inferUses(row, nomination);
    const parent = nomination?.container_qualified_name || (String(row.qualified_name).includes('.') ? String(row.qualified_name).split('.').slice(0, -1).join('.') : null);
    const metadata = { schema: 'atlas.callable-enrichment-metadata.v1', classification_id: domain.classification_id, evidence: domain.evidence || [], identity_status: domain.identity_status || 'RESOLVED_CANDIDATE', extractor: 'ast-grep', extractor_revision: nomination?.extractor_revision || null };
    await pool.query(`UPDATE atlas_callable_search SET parent_qualified_name=$2, domain_id=$3, domain_confidence=$4, secondary_domains=$5::text[], taxonomy_revision=$6, inferred_uses=$7::text[], enrichment_metadata=$8::jsonb, updated_at=now() WHERE symbol_version_id=$1`, [row.symbol_version_id, parent, domain.domain_id, domain.confidence ?? null, domain.secondary_domains || [], domain.taxonomy_revision || null, inferredUses, JSON.stringify(metadata)]);
    report.rowsMatched++; report.rowsEnriched++;
    if (report.sample.length < 5) report.sample.push({ symbolVersionId: row.symbol_version_id, qualifiedName: row.qualified_name, domain: domain.domain_id, inferredUses });
  }
  await pool.query('COMMIT'); report.databaseWrites = true;
} catch (error) { await pool.query('ROLLBACK'); throw error; } finally { await pool.end(); }
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
