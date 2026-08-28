#!/usr/bin/env node
/**
 * Read-only reconciliation of the current source manifest and projections.
 * The manifest is the denominator; Postgres, Graphify, and Qdrant are mirrors.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestPath = path.join(ROOT, '.tmp', 'atlas', 'indexable-source-manifest-v1', 'manifest.jsonl');
const reportPath = path.join(ROOT, 'docs', 'reports', 'source-scope-reconciliation-v1.json');
const aliasApprovalPath = path.join(ROOT, 'docs', 'reports', 'feature-ontology-explicit-alias-approval-v1.json');
const qdrantUrl = String(process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const qdrantCollection = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const retrievalHealthUrl = process.env.RETRIEVAL_HEALTH_URL ?? 'http://127.0.0.1:8100/health';

function normalize(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
}

function bucket(value) {
  const p = normalize(value);
  if (!p) return 'EMPTY';
  if (p.startsWith('node_modules/') || p.includes('/node_modules/')) return 'NODE_MODULES';
  if (p === '.git' || p.startsWith('.git/') || p.includes('/.git/')) return 'GIT';
  if (p === 'dist' || p.startsWith('dist/') || p.includes('/dist/')) return 'DIST';
  if (p === 'build' || p.startsWith('build/') || p.includes('/build/')) return 'BUILD';
  if (p.startsWith('deeds_labs/archive/') || p.includes('/deeds_labs/archive/')) return 'ARCHIVE';
  if (p.startsWith('sveltekit-frontend/')) return 'SVELTEKIT_FRONTEND';
  if (p.startsWith('scripts/')) return 'SCRIPTS';
  if (p.startsWith('packages/')) return 'PACKAGES';
  if (p.startsWith('services/')) return 'SERVICES';
  if (p.startsWith('docs/')) return 'DOCS';
  return 'OTHER';
}

function countBuckets(values) {
  const out = {};
  for (const value of values) out[bucket(value)] = (out[bucket(value)] ?? 0) + 1;
  return out;
}

async function getJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => null);
    return { reachable: response.ok, status: response.status, body };
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

if (!fs.existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);
const manifestLines = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/).filter(Boolean);
const manifestRows = manifestLines.map((line) => JSON.parse(line));
const manifestRefs = new Set(manifestRows.map((row) => normalize(row.relativePath ?? row.sourceRef)).filter(Boolean));
const admittedManifestRows = manifestRows.filter((row) => row.canonicalAdmission !== false && row.status !== 'EXCLUDED');
const admittedRefs = new Set(admittedManifestRows.map((row) => normalize(row.relativePath ?? row.sourceRef)).filter(Boolean));
const aliasApproval = fs.existsSync(aliasApprovalPath) ? JSON.parse(fs.readFileSync(aliasApprovalPath, 'utf8')) : null;
const approvedAliases = new Map((aliasApproval?.approvedPairs ?? []).map((row) => [normalize(row.aliasSourceRef), normalize(row.canonicalSourceRef)]));
const manifestChecksum = crypto.createHash('sha256').update(manifestLines.map((line) => `${line}\n`).join('')).digest('hex');

const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()) });
const query = async (sql, params = []) => (await pool.query(sql, params)).rows;
let postgres;
try {
  const tableRows = await query(`select table_name from information_schema.tables where table_schema='public' and table_name=any($1)`, [['atlas_packets', 'codebase_chunk_index', 'graphify_files', 'feature_domain_facts']]);
  const tables = new Set(tableRows.map((row) => row.table_name));
  const projection = {};
  if (tables.has('codebase_chunk_index')) {
    projection.codebaseChunkIndex = (await query(`select count(*)::int total, count(*) filter(where coalesce(source_ref,relative_path,'') <> '')::int identified, count(distinct nullif(coalesce(source_ref,relative_path,''),''))::int distinctRefs from codebase_chunk_index`))[0];
    projection.codebaseChunkBuckets = (await query(`select case when lower(coalesce(source_ref,relative_path,'')) like 'node_modules/%' or lower(coalesce(source_ref,relative_path,'')) like '%/node_modules/%' then 'NODE_MODULES' when lower(coalesce(source_ref,relative_path,'')) like '.git/%' or lower(coalesce(source_ref,relative_path,'')) like '%/.git/%' then 'GIT' when lower(coalesce(source_ref,relative_path,'')) like 'dist/%' or lower(coalesce(source_ref,relative_path,'')) like '%/dist/%' then 'DIST' when lower(coalesce(source_ref,relative_path,'')) like 'build/%' or lower(coalesce(source_ref,relative_path,'')) like '%/build/%' then 'BUILD' when lower(coalesce(source_ref,relative_path,'')) like 'sveltekit-frontend/%' then 'SVELTEKIT_FRONTEND' when lower(coalesce(source_ref,relative_path,'')) like 'scripts/%' then 'SCRIPTS' when lower(coalesce(source_ref,relative_path,'')) like 'packages/%' then 'PACKAGES' when lower(coalesce(source_ref,relative_path,'')) like 'services/%' then 'SERVICES' when lower(coalesce(source_ref,relative_path,'')) like 'docs/%' then 'DOCS' when coalesce(source_ref,relative_path,'')='' then 'EMPTY' else 'OTHER' end bucket,count(*)::int count from codebase_chunk_index group by 1 order by 1`));
    projection.embeddingCoverage = (await query(`select count(*)::int total,count(content_embedding_768)::int semantic768,count(search_vector)::int searchVector,count(qdrant_id)::int qdrantIds from codebase_chunk_index`))[0];
  }
  if (tables.has('graphify_files')) projection.graphify = (await query(`select count(*)::int total,count(distinct source_ref)::int distinctRefs,count(*) filter(where workspace_revision like 'sha256:%')::int currentWorkspace,count(*) filter(where content_hash is not null)::int contentHashes from graphify_files`))[0];
  if (tables.has('atlas_packets')) projection.packets = (await query(`select count(*)::int total,count(*) filter(where domain_class is not null)::int domainClass,count(*) filter(where primary_domain is not null)::int primaryDomain,count(*) filter(where taxonomy_level is not null)::int taxonomyLevel from atlas_packets`))[0];
  if (tables.has('feature_domain_facts')) projection.domainFacts = (await query(`select count(*)::int total,count(distinct domain_class)::int distinctClasses,count(*) filter(where domain_class is not null)::int classified from feature_domain_facts`))[0];
  postgres = { reachable: true, tables: [...tables].sort(), projection };
} catch (error) {
  postgres = { reachable: false, error: error instanceof Error ? error.message : String(error) };
} finally {
  await pool.end();
}

const health = await getJson(retrievalHealthUrl);
const qdrant = await getJson(`${qdrantUrl}/collections/${encodeURIComponent(qdrantCollection)}`);
const qdrantSample = qdrant.reachable
  ? await getJson(`${qdrantUrl}/collections/${encodeURIComponent(qdrantCollection)}/points/scroll`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit: 100, with_payload: ['source_ref', 'relative_path', 'packet_key', 'workspace_revision'], with_vector: false }) })
  : { reachable: false };

const qdrantRefs = new Set();
if (qdrant.reachable) {
  let offset = null;
  for (let page = 0; page < 2000; page += 1) {
    const body = { limit: 1000, with_payload: ['source_ref', 'relative_path'], with_vector: false };
    if (offset !== null) body.offset = offset;
    const pageResult = await getJson(`${qdrantUrl}/collections/${encodeURIComponent(qdrantCollection)}/points/scroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!pageResult.reachable) break;
    const points = pageResult.body?.result?.points ?? [];
    for (const point of points) {
      const ref = normalize(point.payload?.source_ref ?? point.payload?.relative_path);
      if (ref) qdrantRefs.add(ref);
    }
    const next = pageResult.body?.result?.next_page_offset;
    if (points.length === 0 || next === null || next === undefined) break;
    offset = next;
  }
}

const projectionRefSets = {
  postgresChunkIndex: new Set(),
  graphifyFiles: new Set(),
  qdrant: qdrantRefs,
};
if (postgres.reachable) {
  const projectionPool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()) });
  try {
    const rows = await projectionPool.query(`select distinct nullif(coalesce(source_ref, relative_path, ''), '') as source_ref from codebase_chunk_index where nullif(coalesce(source_ref, relative_path, ''), '') is not null`);
    projectionRefSets.postgresChunkIndex = new Set(rows.rows.map((row) => normalize(row.source_ref)).filter(Boolean));
    const graphRows = await projectionPool.query(`select distinct nullif(source_ref, '') as source_ref from graphify_files where nullif(source_ref, '') is not null`);
    projectionRefSets.graphifyFiles = new Set(graphRows.rows.map((row) => normalize(row.source_ref)).filter(Boolean));
  } finally {
    await projectionPool.end();
  }
}

const exactCoverage = Object.fromEntries(Object.entries(projectionRefSets).map(([name, refs]) => {
  let matched = 0;
  let aliasMatched = 0;
  let unresolved = 0;
  for (const ref of admittedRefs) {
    if (refs.has(ref)) matched += 1;
    else {
      const alias = [...approvedAliases.entries()].find(([aliasRef, canonical]) => canonical === ref && refs.has(aliasRef));
      if (alias) aliasMatched += 1;
      else unresolved += 1;
    }
  }
  return [name, { projectionDistinctRefs: refs.size, admittedManifestExactMatches: matched, admittedManifestApprovedAliasMatches: aliasMatched, admittedManifestMissing: unresolved, projectionOnlyRefs: [...refs].filter((ref) => !admittedRefs.has(ref) && ![...approvedAliases.keys()].includes(ref)).length }];
}));

const excludedBuckets = ['NODE_MODULES', 'GIT', 'DIST', 'BUILD', 'ARCHIVE'];
const report = {
  schema: 'atlas.source-scope-reconciliation.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  denominator: { manifest: path.relative(ROOT, manifestPath).replaceAll('\\', '/'), manifestRows: manifestRows.length, distinctRefs: manifestRefs.size, admittedRows: admittedManifestRows.length, admittedDistinctRefs: admittedRefs.size, manifestChecksum, buckets: countBuckets(admittedManifestRows.map((row) => row.relativePath ?? row.sourceRef)) },
  namespaceReconciliation: { resolverRevision: aliasApproval?.resolverRevision ?? null, selectionChecksum: aliasApproval?.selectionChecksum ?? null, approvedAliasCount: approvedAliases.size, classificationRule: 'EXACT_CURRENT > APPROVED_ALIAS_CURRENT > UNRESOLVED', exactCoverage },
  exclusionPolicy: { excludedBuckets, manifestExcludedRows: manifestRows.filter((row) => excludedBuckets.includes(bucket(row.relativePath ?? row.sourceRef))).length, status: 'MANIFEST_DECLARED_SCOPE_RECORDED' },
  postgres,
  retrieval: { healthUrl: retrievalHealthUrl, ...health },
  qdrant: { url: qdrantUrl, collection: qdrantCollection, collectionInfo: qdrant.body ?? null, sampleReachable: qdrantSample.reachable, samplePoints: qdrantSample.body?.result?.points?.length ?? 0, samplePayloadKeys: [...new Set((qdrantSample.body?.result?.points ?? []).flatMap((point) => Object.keys(point.payload ?? {})))].sort() },
  gates: {
    manifestAvailable: true,
    postgresReachable: postgres.reachable,
    retrievalReady: health.body?.readiness_state === 'READY_FULL',
    qdrantCollectionReachable: qdrant.reachable,
    excludedDirectoryLeakageInManifest: admittedManifestRows.some((row) => excludedBuckets.includes(bucket(row.relativePath ?? row.sourceRef))),
    canonicalPostgresSemantic768Complete: Number(postgres.projection?.codebaseChunkIndex?.total ?? 0) > 0 && Number(postgres.projection?.embeddingCoverage?.semantic768 ?? 0) === Number(postgres.projection?.codebaseChunkIndex?.total ?? -1),
    manifestToPostgresExactCoverageComplete: exactCoverage.postgresChunkIndex?.admittedManifestMissing === 0,
    manifestToGraphifyExactCoverageComplete: exactCoverage.graphifyFiles?.admittedManifestMissing === 0,
    manifestToQdrantExactCoverageComplete: exactCoverage.qdrant?.admittedManifestMissing === 0,
    status: 'READ_ONLY_SCOPE_AND_ALIGNMENT_RECORDED',
  },
  nextGate: 'RECONCILE_MANIFEST_TO_GRAPHIFY_POSTGRES_QDRANT_BY_SOURCE_REF_AND_REVISION',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath: path.relative(ROOT, reportPath).replaceAll('\\', '/'), gates: report.gates, denominator: report.denominator, postgres: report.postgres, retrieval: report.retrieval, qdrant: report.qdrant }, null, 2));
