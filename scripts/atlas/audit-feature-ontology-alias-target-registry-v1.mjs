#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';
import * as dotenv from 'dotenv';
import { classifyAliasTargetRegistry, summarizeAliasTargetRegistry, AliasTargetRegistryClassification } from './lib/feature-ontology-alias-target-registry-v1.mjs';
import { aliasSelectionChecksum } from './lib/feature-ontology-explicit-alias-v1.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/feature-ontology-alias-target-registry-v1.json');
const EXPECTED_RESOLVER = 'feature-ontology-explicit-alias:v1';
const EXPECTED_CHECKSUM = '349253cdef7ba59e0a90d7fde6bfdec8526b6f4e1dbc9fb17797c9bd6120b79a';
const text = (value) => String(value ?? '').trim();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const pool = new pg.Pool({ host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1', port: Number(process.env.DB_PORT || process.env.PGPORT || 5434), database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db', user: process.env.DB_USER || process.env.PGUSER || 'legal_admin', password: process.env.DB_PASSWORD || process.env.PGPASSWORD, connectionTimeoutMillis: 15000 });

function loadReceipt() {
  for (const file of ['docs/reports/feature-ontology-explicit-alias-approval-v1.json', 'docs/reports/feature-ontology-explicit-alias-v1.json']) {
    try { return JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')); } catch { /* try the review receipt */ }
  }
  return {};
}
async function main() {
  const receipt = loadReceipt();
  const allCandidates = receipt.approvedPairs?.length
    ? receipt.approvedPairs.map((row) => ({ ...row, classification: 'EXPLICIT_ALIAS_REVIEW_READY' }))
    : receipt.candidates ?? [];
  const candidates = allCandidates.filter((row) => row.classification === 'EXPLICIT_ALIAS_REVIEW_READY');
  const canonicalRefs = candidates.map((row) => text(row.canonicalSourceRef)).filter(Boolean).sort();
  const selectionChecksum = receipt.approvedPairs?.length ? text(receipt.selectionChecksum) : aliasSelectionChecksum(allCandidates);
  const checksumValid = text(receipt.resolverRevision) === EXPECTED_RESOLVER && selectionChecksum === EXPECTED_CHECKSUM && canonicalRefs.length === 6;
  const table = await pool.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'atlas_source_refs') AS present`);
  if (!table.rows[0]?.present) {
    await pool.end();
    const report = { schema: 'atlas.feature-ontology-alias-target-registry.v1', generatedAt: new Date().toISOString(), readOnly: true, postgresWrites: false, status: 'SOURCE_REGISTRY_TABLE_UNAVAILABLE', resolverRevision: text(receipt.resolverRevision) || null, selectionChecksum: text(receipt.selectionChecksum) || null, counts: {}, rows: [] };
    mkdirSync(dirname(REPORT), { recursive: true }); writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ status: report.status, report: REPORT }, null, 2)); process.exitCode = 2; return;
  }
  const registry = canonicalRefs.length ? await pool.query(`SELECT source_ref_key, repo_id, content_hash, commit_sha, corpus_version FROM public.atlas_source_refs WHERE source_ref_key = ANY($1::text[]) ORDER BY source_ref_key, repo_id`, [canonicalRefs]) : { rows: [] };
  await pool.end();
  const expectedRepoId = text(process.env.ATLAS_SOURCE_REGISTRY_REPO_ID) || null;
  const rows = candidates.map((candidate) => {
    const matches = registry.rows.filter((row) => text(row.source_ref_key) === text(candidate.canonicalSourceRef));
    const classification = classifyAliasTargetRegistry({ target: candidate.canonicalSourceRef, matches, expectedRepoId, checksumValid });
    const match = matches.length === 1 ? matches[0] : null;
    return { aliasSourceRef: candidate.aliasSourceRef, canonicalSourceRef: candidate.canonicalSourceRef, repoId: match?.repo_id ?? null, sourceRefKey: match?.source_ref_key ?? null, registryContentHash: match?.content_hash ?? null, registryCommitSha: match?.commit_sha ?? null, registryCorpusVersion: match?.corpus_version ?? null, registryMatchCount: matches.length, classification };
  });
  const summary = summarizeAliasTargetRegistry(rows);
  const report = { schema: 'atlas.feature-ontology-alias-target-registry.v1', generatedAt: new Date().toISOString(), readOnly: true, postgresWrites: false, qdrantWrites: false, neo4jWrites: false, valkeyWrites: false, resolverRevision: text(receipt.resolverRevision) || null, selectionChecksum: text(receipt.selectionChecksum) || null, computedSelectionChecksum: selectionChecksum, expectedSelectionChecksum: EXPECTED_CHECKSUM, registry: { table: 'public.atlas_source_refs', matchingRule: 'literal source_ref_key equality only', contentHashMeaning: 'stable registry identity metadata; not freshness proof' }, status: summary.registeredUniqueTargets === 6 && summary.missingTargets === 0 && summary.duplicateTargets === 0 ? 'CANONICAL_ALIAS_TARGETS_REGISTERED_UNIQUE' : 'CANONICAL_ALIAS_TARGET_REGISTRY_INCOMPLETE', counts: { selectedTargets: canonicalRefs.length, ...summary }, rows, nextGate: summary.registeredUniqueTargets === 6 && summary.missingTargets === 0 && summary.duplicateTargets === 0 ? 'ALIAS_APPROVAL_01' : 'RECONCILE_CANONICAL_SOURCE_REGISTRY' };
  mkdirSync(dirname(REPORT), { recursive: true }); writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ schema: report.schema, status: report.status, counts: report.counts, report: REPORT }, null, 2));
}
main().catch(async (error) => { await pool.end().catch(() => {}); console.error(`[alias-target-registry] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
