#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';
import * as dotenv from 'dotenv';
import { classifyFeatureOntologyEvidenceFreshness, summarizeFeatureOntologyEvidenceFreshness, EvidenceFreshnessClassification } from './lib/feature-ontology-evidence-freshness-v1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/feature-ontology-evidence-freshness-v1.json');
const text = (value) => String(value ?? '').trim();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const pool = new pg.Pool({ host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1', port: Number(process.env.DB_PORT || process.env.PGPORT || 5434), database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db', user: process.env.DB_USER || process.env.PGUSER || 'legal_admin', password: process.env.DB_PASSWORD || process.env.PGPASSWORD, connectionTimeoutMillis: 15000 });

function observation() {
  try { return JSON.parse(readFileSync(resolve(ROOT, 'docs/reports/workspace-source-binding-observation.json'), 'utf8')); } catch { return {}; }
}
function aliasReceipt() {
  for (const file of ['docs/reports/feature-ontology-explicit-alias-approval-v1.json', 'docs/reports/feature-ontology-explicit-alias-v1.json']) {
    try { return JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')); } catch { /* try the review receipt */ }
  }
  return {};
}
async function columns(table) {
  const result = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table]);
  return new Set(result.rows.map((row) => row.column_name));
}
function pick(columnsSet, preferred, alias) {
  const found = preferred.find((name) => columnsSet.has(name));
  return found ? `${alias}.${found}` : 'NULL';
}
async function main() {
  const currentWorkspaceRevision = text(observation().record?.workspaceRevision);
  const aliasDocument = aliasReceipt();
  const aliases = aliasDocument.approvedPairs?.length
    ? aliasDocument.approvedPairs.map((row) => ({ ...row, classification: 'VERIFIED_EXPLICIT_ALIAS', promotable: true, resolverRevision: aliasDocument.resolverRevision }))
    : aliasDocument.rows ?? aliasDocument.candidates ?? [];
  const aliasByLegacy = new Map(aliases.map((row) => [text(row.aliasSourceRef || row.sourceRef || row.legacySourceRef), row]));
  const [tupleCols, packetCols, graphCols, registryCols] = await Promise.all([
    columns('feature_ontology_tuples'), columns('atlas_packets'), columns('graphify_files'), columns('atlas_source_refs'),
  ]);
  const selectPacket = [
    `p.packet_key`, `p.source_ref`, pick(packetCols, ['content_hash'], 'p').replace(/^p\./, 'p.'),
    pick(packetCols, ['source_revision', 'code_source_revision'], 'p').replace(/^p\./, 'p.'),
  ];
  const rows = await pool.query(`
    SELECT t.id::text AS tuple_id, t.packet_key, t.source_ref AS tuple_source_ref,
           t.ontology_version, t.extractor_version, t.predicate,
           ${selectPacket[0]} AS packet_key_join, ${selectPacket[1]} AS packet_source_ref,
           ${selectPacket[2]} AS packet_content_hash, ${selectPacket[3]} AS packet_source_revision
      FROM public.feature_ontology_tuples t
      LEFT JOIN public.atlas_packets p ON p.packet_key = t.packet_key
     WHERE t.predicate = 'USES_CONCEPT'
     ORDER BY t.id`);
  const graph = await pool.query(`
    SELECT source_ref, workspace_revision, content_hash,
           ${pick(graphCols, ['source_revision', 'code_source_revision'], 'g')} AS source_revision,
           count(*) OVER (PARTITION BY source_ref) AS source_ref_count
      FROM public.graphify_files g
     WHERE source_ref IS NOT NULL`);
  const graphBySource = new Map();
  for (const row of graph.rows) { const key = text(row.source_ref); const list = graphBySource.get(key) ?? []; list.push(row); graphBySource.set(key, list); }
  const registry = registryCols.size ? await pool.query(`SELECT source_ref_key, repo_id FROM public.atlas_source_refs`) : { rows: [] };
  const registryKeys = new Set(registry.rows.map((row) => `${text(row.repo_id)}\0${text(row.source_ref_key)}`));
  const detail = rows.rows.map((row) => {
    const legacy = text(row.tuple_source_ref);
    const alias = aliasByLegacy.get(legacy) ?? null;
    const canonical = text(alias?.canonicalSourceRef) || null;
    const matches = canonical ? graphBySource.get(canonical) ?? [] : [];
    const graphify = matches.length === 1 ? matches[0] : null;
    const result = classifyFeatureOntologyEvidenceFreshness({
      tuple: { id: row.tuple_id, packet_key: row.packet_key, source_ref: legacy, ontology_version: row.ontology_version, extractor_version: row.extractor_version },
      packet: { content_hash: row.packet_content_hash, source_revision: row.packet_source_revision },
      alias: alias ? { ...alias, sourceRef: legacy, canonicalSourceRef: canonical } : null,
      graphify,
      currentWorkspaceRevision,
    });
    return { ...result, packetSourceRef: text(row.packet_source_ref) || null, predicate: text(row.predicate) || null, canonicalRegistryPresent: canonical ? registryKeys.has(`parent-atlas\\0${canonical}`) || [...registryKeys].some((key) => key.endsWith(`\\0${canonical}`)) : false, graphifyMatchCount: matches.length };
  });
  await pool.end();
  const summary = summarizeFeatureOntologyEvidenceFreshness(detail);
  const report = {
    schema: 'atlas.feature-ontology-evidence-freshness.v1', generatedAt: new Date().toISOString(), readOnly: true,
    postgresWrites: false, qdrantWrites: false, neo4jWrites: false, valkeyWrites: false,
    status: summary.eligibleFreshUsesConceptTuples > 0 ? 'CURRENT_TUPLE_EVIDENCE_COHORT_FOUND' : 'CURRENT_TUPLE_EVIDENCE_COHORT_EMPTY',
    predicate: 'USES_CONCEPT', workspaceRevision: currentWorkspaceRevision || null,
    sourceObservation: 'docs/reports/workspace-source-binding-observation.json', aliasReceipt: 'docs/reports/feature-ontology-explicit-alias-v1.json',
    counts: { tuplesExamined: detail.length, ...summary.counts, eligibleFreshUsesConceptTuples: summary.eligibleFreshUsesConceptTuples },
    eligibleFreshSelectionChecksum: summary.eligibleFreshSelectionChecksum,
    relationshipGraphRevision: null,
    nextGate: summary.eligibleFreshUsesConceptTuples > 0 ? 'REL_01B_PREVIEW_FRESH_CURRENT_KERNELS' : 'REGENERATE_OR_REBIND_ONTOLOGY_EVIDENCE',
    rows: detail,
  };
  mkdirSync(dirname(REPORT), { recursive: true }); writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ schema: report.schema, status: report.status, counts: report.counts, report: REPORT }, null, 2));
}
main().catch(async (error) => { await pool.end().catch(() => {}); console.error(`[feature-ontology-evidence-freshness] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
