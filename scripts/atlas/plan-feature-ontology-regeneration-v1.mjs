#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') }); dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/feature-ontology-regeneration-plan-v1.json');
const text = (v) => String(v ?? '').trim();
const json = (p) => { try { return JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')); } catch { return {}; } };
const pool = new pg.Pool({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 5434), database: process.env.DB_NAME || 'legal_ai_db', user: process.env.DB_USER || 'legal_admin', password: process.env.DB_PASSWORD || process.env.PGPASSWORD, connectionTimeoutMillis: 15000 });

async function main() {
  const approval = json('docs/reports/feature-ontology-explicit-alias-approval-v1.json');
  if (approval.status !== 'APPROVED_FOR_LINEAGE_RESOLUTION') throw new Error('APPROVED_ALIAS_RECEIPT_REQUIRED');
  const observation = json('docs/reports/workspace-source-binding-observation.json');
  const currentWorkspaceRevision = text(observation.record?.workspaceRevision);
  const refs = (approval.approvedPairs ?? []).map((row) => text(row.canonicalSourceRef));
  const result = await pool.query(`SELECT t.id::text AS tuple_id, t.packet_key, t.source_ref AS legacy_source_ref, t.feature_key, t.subject_type, t.subject_id, t.predicate, t.object_type, t.object_id, t.object_value, t.confidence, t.ontology_version, t.extractor_version, p.source_ref AS packet_source_ref, p.packet_id, g.source_ref AS graphify_source_ref, g.workspace_revision, g.code_source_revision, g.source_revision, g.content_hash, g.byte_length FROM public.feature_ontology_tuples t LEFT JOIN public.atlas_packets p ON p.packet_key=t.packet_key LEFT JOIN public.graphify_files g ON g.source_ref=p.source_ref AND g.workspace_revision=$1 WHERE t.predicate='USES_CONCEPT' AND p.source_ref = ANY($2::text[]) ORDER BY t.id`, [currentWorkspaceRevision, refs]);
  await pool.end();
  const rows = result.rows.map((row) => ({ tupleId: text(row.tuple_id), packetKey: text(row.packet_key), legacySourceRef: text(row.legacy_source_ref), canonicalSourceRef: text(row.packet_source_ref), graphifySourceRef: text(row.graphify_source_ref), currentWorkspaceRevision: text(row.workspace_revision) || null, sourceRevision: text(row.code_source_revision || row.source_revision) || null, sourceContentHash: text(row.content_hash) || null, byteLength: row.byte_length == null ? null : Number(row.byte_length), featureKey: text(row.feature_key) || null, subject: { type: text(row.subject_type), id: text(row.subject_id) }, predicate: text(row.predicate), object: { type: text(row.object_type), id: text(row.object_id), value: row.object_value ?? null }, confidence: Number(row.confidence), historicalOntologyVersion: text(row.ontology_version), historicalExtractorVersion: text(row.extractor_version), historicalPacketSourceRef: text(row.packet_source_ref), regenerationStatus: text(row.graphify_source_ref) && text(row.code_source_revision || row.source_revision) ? 'CURRENT_SOURCE_AVAILABLE_FOR_FRESH_EXTRACTION' : 'CURRENT_SOURCE_NOT_AVAILABLE' }));
  const grouped = [...new Set(rows.map((row) => row.canonicalSourceRef))].sort().map((sourceRef) => { const sourceRows = rows.filter((row) => row.canonicalSourceRef === sourceRef); return { sourceRef, tupleCount: sourceRows.length, sourceRevision: sourceRows[0]?.sourceRevision ?? null, sourceContentHash: sourceRows[0]?.sourceContentHash ?? null, byteLength: sourceRows[0]?.byteLength ?? null, tupleIds: sourceRows.map((row) => row.tupleId).sort() }; });
  const currentAvailable = rows.filter((row) => row.regenerationStatus === 'CURRENT_SOURCE_AVAILABLE_FOR_FRESH_EXTRACTION');
  const report = { schema: 'atlas.feature-ontology-regeneration-plan.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY_PLAN', readOnly: true, postgresWrites: false, qdrantWrites: false, neo4jWrites: false, valkeyWrites: false, approvalReceipt: 'docs/reports/feature-ontology-explicit-alias-approval-v1.json', workspaceRevision: currentWorkspaceRevision || null, historicalProducer: 'atlas-packets-ontology-v1', targetProducer: 'atlas-current-source-ontology-v2', policy: { preserveHistoricalTuples: true, rewriteHistoricalTuples: false, materializeRelationships: false, requireFreshSourceRevision: true, requireCurrentGraphifyObservation: true }, counts: { approvedSourceRefs: refs.length, approvedTuplesExpected: 595, tuplesSelected: rows.length, currentSourceAvailable: currentAvailable.length, currentSourceUnavailable: rows.length - currentAvailable.length, groupedSources: grouped.length, freshEligibleTuples: 0 }, status: rows.length === 595 && currentAvailable.length === 595 ? 'REGENERATION_INPUTS_READY_READ_ONLY' : 'REGENERATION_INPUTS_INCOMPLETE', nextGate: rows.length === 595 && currentAvailable.length === 595 ? 'RUN_BOUNDED_FRESH_ONTOLOGY_EXTRACTION_DRY_RUN' : 'RECONCILE_REGENERATION_INPUTS', groups: grouped, rows };
  mkdirSync(dirname(REPORT), { recursive: true }); writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ schema: report.schema, status: report.status, counts: report.counts, report: REPORT }, null, 2));
}
main().catch(async (error) => { await pool.end().catch(() => {}); console.error(`[feature-ontology-regeneration-plan] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
