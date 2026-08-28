#!/usr/bin/env node
/** Read-only audit of grounded concept IDs against existing taxonomy authorities. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT = path.join(ROOT, 'docs', 'reports', 'grounded-concept-taxonomy-v1.json');
const EXTRACTION = path.join(ROOT, 'docs', 'reports', 'feature-ontology-fresh-extraction-v1.json');
const clean = (value) => String(value ?? '').trim() || null;
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });

const groundedRows = (() => {
  if (!fs.existsSync(EXTRACTION)) return [];
  const report = JSON.parse(fs.readFileSync(EXTRACTION, 'utf8'));
  return (report.candidates ?? []).filter((row) => row.sourceSpanGrounded === true).map((row) => ({
    candidateId: clean(row.candidateId), objectId: clean(row.objectId), objectValue: clean(row.objectValue),
    sourceRef: clean(row.sourceRef), sourceRevision: clean(row.sourceRevision), workspaceRevision: clean(row.workspaceRevision),
  }));
})();

async function tableExists(tableName) {
  const result = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
  return result.rows[0]?.exists === true;
}

async function values(tableName, column) {
  if (!(await tableExists(tableName))) return { exists: false, values: [] };
  const result = await pool.query(`SELECT DISTINCT ${column}::text AS value FROM public.${tableName} WHERE ${column} IS NOT NULL AND ${column}::text <> '' ORDER BY 1`);
  return { exists: true, values: result.rows.map((row) => row.value) };
}

try {
  const [concepts, domains, kagDomains, legacyOntology] = await Promise.all([
    values('concept_records', 'concept_id'),
    values('domain_taxonomy_v1', 'domain_id'),
    values('kag_domain_taxonomy', 'domain_class'),
    values('feature_ontology_tuples', 'object_id'),
  ]);
  const conceptSet = new Set([...concepts.values, ...legacyOntology.values].map((value) => value.toLowerCase()));
  const rows = groundedRows.map((row) => {
    const id = clean(row.objectId)?.replace(/^concept:/i, '') ?? null;
    const status = id && conceptSet.has(id.toLowerCase()) ? 'REGISTERED_OR_LEGACY_CONCEPT_ID' : 'TAXONOMY_REGISTRY_UNRESOLVED';
    return { ...row, normalizedConceptId: id, taxonomyStatus: status, canonicalAuthority: false };
  });
  const report = {
    schema: 'atlas.grounded-concept-taxonomy.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY',
    postgresWrites: false, relationshipWrites: false, groundedCandidateCount: rows.length,
    authorities: {
      conceptRecords: { exists: concepts.exists, count: concepts.values.length },
      domainTaxonomyV1: { exists: domains.exists, count: domains.values.length },
      kagDomainTaxonomy: { exists: kagDomains.exists, count: kagDomains.values.length },
      legacyFeatureOntologyObjectIds: { exists: legacyOntology.exists, count: legacyOntology.values.length },
    },
    counts: {
      registeredOrLegacyConceptIds: rows.filter((row) => row.taxonomyStatus === 'REGISTERED_OR_LEGACY_CONCEPT_ID').length,
      taxonomyRegistryUnresolved: rows.filter((row) => row.taxonomyStatus === 'TAXONOMY_REGISTRY_UNRESOLVED').length,
    },
    candidates: rows,
    status: rows.length === 0 ? 'NO_GROUNDED_CANDIDATES_TO_CLASSIFY' : rows.every((row) => row.taxonomyStatus === 'REGISTERED_OR_LEGACY_CONCEPT_ID') ? 'GROUNDED_TAXONOMY_IDS_REVIEWABLE' : 'GROUNDED_TAXONOMY_REGISTRY_GAP',
    nextGate: rows.length > 0 && rows.every((row) => row.taxonomyStatus === 'REGISTERED_OR_LEGACY_CONCEPT_ID') ? 'HUMAN_REVIEW' : 'DEFINE_OR_RESTORE_CANONICAL_CONCEPT_REGISTRY',
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, groundedCandidateCount: rows.length, counts: report.counts, reportPath: 'docs/reports/grounded-concept-taxonomy-v1.json' }, null, 2));
} finally {
  await pool.end();
}
