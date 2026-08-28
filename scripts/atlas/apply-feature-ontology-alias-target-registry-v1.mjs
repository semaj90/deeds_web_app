#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/feature-ontology-alias-target-registry-apply-v1.json');
const APPROVAL = resolve(ROOT, 'docs/reports/feature-ontology-explicit-alias-approval-v1.json');
const OBSERVATION = resolve(ROOT, 'docs/reports/workspace-source-binding-observation.json');
const EXPECTED_CHECKSUM = '349253cdef7ba59e0a90d7fde6bfdec8526b6f4e1dbc9fb17797c9bd6120b79a';
const text = (v) => String(v ?? '').trim();
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const pool = new pg.Pool({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 5434), database: process.env.DB_NAME || 'legal_ai_db', user: process.env.DB_USER || 'legal_admin', password: process.env.DB_PASSWORD || process.env.PGPASSWORD, connectionTimeoutMillis: 15000 });

async function main() {
  if (process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1') throw new Error('ATLAS_NON_PRODUCTION_DATABASE_REQUIRED');
  const approval = json(APPROVAL);
  if (approval.status !== 'APPROVED_FOR_LINEAGE_RESOLUTION' || approval.selectionChecksum !== EXPECTED_CHECKSUM || approval.approvedPairCount !== 6) throw new Error('APPROVED_SIX_ALIAS_SELECTION_REQUIRED');
  const observation = json(OBSERVATION);
  const bindings = new Map((observation.bindings ?? []).map((row) => [text(row.sourceRef), row]));
  const pairs = approval.approvedPairs ?? [];
  if (pairs.length !== 6) throw new Error('APPROVED_PAIR_COUNT_MUST_BE_SIX');
  const rows = pairs.map((pair) => {
    const ref = text(pair.canonicalSourceRef);
    const binding = bindings.get(ref);
    if (!binding || text(binding.workspaceRevision) !== text(observation.record?.workspaceRevision)) throw new Error(`CURRENT_OBSERVATION_REQUIRED:${ref}`);
    if (!/^[0-9a-f]{64}$/i.test(text(binding.contentDigest))) throw new Error(`CONTENT_DIGEST_REQUIRED:${ref}`);
    return { source_ref_key: ref, repo_id: 'deeds-web-app', source_type: 'code', relative_path: ref, content_hash: text(binding.contentDigest), fragments: JSON.stringify([]), parser_name: 'workspace-source-binding-observer', parser_version: text(binding.producerRevision) || null, commit_sha: text(binding.baseCommitOid || observation.record?.baseCommitOid) || null, corpus_version: `workspace:${text(observation.record?.workspaceRevision)}` };
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of rows) await client.query(`INSERT INTO public.atlas_source_refs (source_ref_key, repo_id, source_type, relative_path, content_hash, fragments, parser_name, parser_version, commit_sha, corpus_version) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10) ON CONFLICT (source_ref_key, repo_id) DO NOTHING`, [row.source_ref_key, row.repo_id, row.source_type, row.relative_path, row.content_hash, row.fragments, row.parser_name, row.parser_version, row.commit_sha, row.corpus_version]);
    const readback = await client.query(`SELECT source_ref_key, repo_id, source_type, relative_path, content_hash, parser_name, parser_version, commit_sha, corpus_version FROM public.atlas_source_refs WHERE repo_id = 'deeds-web-app' AND source_ref_key = ANY($1::text[]) ORDER BY source_ref_key`, [rows.map((row) => row.source_ref_key)]);
    const byRef = new Map(readback.rows.map((row) => [text(row.source_ref_key), row]));
    const mismatches = rows.filter((row) => { const found = byRef.get(row.source_ref_key); return !found || text(found.content_hash) !== row.content_hash || text(found.repo_id) !== row.repo_id; }).map((row) => row.source_ref_key);
    if (readback.rows.length !== 6 || mismatches.length) throw new Error(`REGISTRY_READBACK_MISMATCH:${mismatches.join(',')}`);
    await client.query('COMMIT');
    const report = { schema: 'atlas.feature-ontology-alias-target-registry-apply.v1', generatedAt: new Date().toISOString(), status: 'APPLIED_AND_READBACK_PROVEN', authorization: 'AUTHORIZE NON-PRODUCTION SOURCE REGISTRY INSERT FOR SIX ALIAS TARGETS', approvalReceipt: 'docs/reports/feature-ontology-explicit-alias-approval-v1.json', selectionChecksum: EXPECTED_CHECKSUM, workspaceRevision: text(observation.record?.workspaceRevision), rowCount: 6, readbackCount: readback.rows.length, sourceRegistryOnly: true, aliasRowsWritten: false, tupleRowsWritten: false, graphifyRowsWritten: false, relationshipGraphRevisionDerived: false, qdrantWrites: false, neo4jWrites: false, valkeyWrites: false, rows: readback.rows, nextGate: 'RERUN_SOURCE_REGISTRY_AUDIT_THEN_GRAPHIFY_ALIAS_DRY_RUN' };
    mkdirSync(dirname(REPORT), { recursive: true }); writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ schema: report.schema, status: report.status, rowCount: report.rowCount, readbackCount: report.readbackCount, report: REPORT }, null, 2));
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); await pool.end(); }
}
main().catch(async (error) => { await pool.end().catch(() => {}); console.error(`[alias-target-registry-apply] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
