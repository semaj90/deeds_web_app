#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as dotenv from 'dotenv';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') }); dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env.local'), override: true });
const REPORT = resolve(ROOT, 'docs/reports/feature-ontology-packet-lineage-v1.json');
const text = (v) => String(v ?? '').trim();
const json = (p) => { try { return JSON.parse(readFileSync(resolve(ROOT, p), 'utf8')); } catch { return {}; } };
const pool = new pg.Pool({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 5434), database: process.env.DB_NAME || 'legal_ai_db', user: process.env.DB_USER || 'legal_admin', password: process.env.DB_PASSWORD || process.env.PGPASSWORD, connectionTimeoutMillis: 15000 });

async function main() {
  const approval = json('docs/reports/feature-ontology-explicit-alias-approval-v1.json');
  if (approval.status !== 'APPROVED_FOR_LINEAGE_RESOLUTION') throw new Error('APPROVED_ALIAS_RECEIPT_REQUIRED');
  const aliases = new Map((approval.approvedPairs ?? []).map((row) => [text(row.aliasSourceRef), row]));
  const observation = json('docs/reports/workspace-source-binding-observation.json');
  const currentWorkspaceRevision = text(observation.record?.workspaceRevision);
  const result = await pool.query(`
    SELECT t.id::text AS tuple_id, t.packet_key, t.source_ref AS tuple_source_ref,
           t.ontology_version, t.extractor_version, t.predicate,
           p.source_ref AS packet_source_ref, p.content_hash AS packet_content_hash,
           p.sha256 AS packet_sha256, p.workspace_revision AS packet_workspace_revision,
           CASE WHEN p.packet_key IS NULL THEN 0 ELSE 1 END AS packet_present,
           count(c.content_hash)::integer AS exact_chunk_match_count
      FROM public.feature_ontology_tuples t
      LEFT JOIN public.atlas_packets p ON p.packet_key = t.packet_key
      LEFT JOIN public.codebase_chunk_index c
        ON c.source_ref = p.source_ref AND c.content_hash = p.content_hash
     WHERE t.predicate = 'USES_CONCEPT'
     GROUP BY t.id, t.packet_key, t.source_ref, t.ontology_version, t.extractor_version,
              t.predicate, p.packet_key, p.source_ref, p.content_hash, p.sha256, p.workspace_revision
     ORDER BY t.id`);
  const graph = await pool.query(`SELECT source_ref, workspace_revision, source_revision, code_source_revision, content_hash, byte_length FROM public.graphify_files WHERE source_ref IS NOT NULL`);
  await pool.end();
  const graphByRef = new Map(); for (const row of graph.rows) { const list = graphByRef.get(text(row.source_ref)) ?? []; list.push(row); graphByRef.set(text(row.source_ref), list); }
  const rows = result.rows.map((row) => {
    const legacy = text(row.tuple_source_ref); const alias = aliases.get(legacy); const canonical = text(alias?.canonicalSourceRef) || null; const graphRows = canonical ? graphByRef.get(canonical) ?? [] : []; const currentGraph = graphRows.filter((item) => text(item.workspace_revision) === currentWorkspaceRevision); const packetHash = text(row.packet_content_hash);
    let classification = 'PACKET_CONTENT_LINEAGE_MISSING';
    if (!alias) classification = 'ALIAS_NOT_APPROVED';
    else if (!currentGraph.length) classification = 'CURRENT_GRAPHIFY_SOURCE_MISSING';
    else if (!Number(row.packet_present) || !packetHash || Number(row.exact_chunk_match_count) !== 1) classification = 'PACKET_CONTENT_LINEAGE_MISSING';
    return { tupleId: text(row.tuple_id), packetKey: text(row.packet_key) || null, legacySourceRef: legacy, canonicalSourceRef: canonical, aliasResolverRevision: approval.resolverRevision, tupleExtractorVersion: text(row.extractor_version) || null, tupleOntologyVersion: text(row.ontology_version) || null, packetPresent: Boolean(Number(row.packet_present)), packetSourceRef: text(row.packet_source_ref) || null, packetContentHash: packetHash || null, packetSha256: text(row.packet_sha256) || null, packetWorkspaceRevision: row.packet_workspace_revision ?? null, exactChunkMatchCount: Number(row.exact_chunk_match_count), graphifySourceRef: canonical, graphifyRowCount: graphRows.length, currentGraphifyRowCount: currentGraph.length, workspaceRevision: currentGraph[0]?.workspace_revision ?? null, graphifyContentHash: currentGraph[0]?.content_hash ?? null, graphifySourceRevision: currentGraph[0]?.code_source_revision ?? currentGraph[0]?.source_revision ?? null, classification };
  });
  const counts = Object.fromEntries([...new Set(rows.map((row) => row.classification))].sort().map((key) => [key, rows.filter((row) => row.classification === key).length]));
  const report = { schema: 'atlas.feature-ontology-packet-lineage.v1', generatedAt: new Date().toISOString(), readOnly: true, postgresWrites: false, qdrantWrites: false, neo4jWrites: false, valkeyWrites: false, workspaceRevision: currentWorkspaceRevision || null, approvalReceipt: 'docs/reports/feature-ontology-explicit-alias-approval-v1.json', hashDomains: { packetContentHash: 'atlas_packets.content_hash; packet/chunk identity only', packetSha256: 'atlas_packets.sha256; identity-recovery hash, not source-revision authority', packetWorkspaceRevision: 'atlas_packets.workspace_revision; observed placeholder 0 for this cohort', chunkContentHash: 'codebase_chunk_index.content_hash; exact packet/chunk join only', graphifyContentHash: 'whole-source observation; not compared to packet/chunk hash' }, packetFieldObservation: { packetRowsWithContentHash: rows.filter((row) => row.packetContentHash).length, packetRowsWithSha256: rows.filter((row) => row.packetSha256).length, packetRowsWithZeroWorkspaceRevision: rows.filter((row) => row.packetWorkspaceRevision === 0 || text(row.packetWorkspaceRevision) === '0').length, exactChunkMatches: rows.filter((row) => row.exactChunkMatchCount === 1).length }, status: rows.some((row) => row.classification === 'PACKET_CONTENT_LINEAGE_MISSING') ? 'PACKET_CONTENT_LINEAGE_INCOMPLETE' : 'PACKET_CONTENT_LINEAGE_RECONCILED', counts: { tuplesExamined: rows.length, ...counts }, eligibleFreshUsesConceptTuples: 0, relationshipGraphRevision: null, nextGate: 'REGENERATE_ONTOLOGY_REQUIRED_UNLESS_PACKET_SOURCE_REVISION_CAN_BE_PROVEN', rows };
  mkdirSync(dirname(REPORT), { recursive: true }); writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ schema: report.schema, status: report.status, counts: report.counts, report: REPORT }, null, 2));
}
main().catch(async (error) => { await pool.end().catch(() => {}); console.error(`[feature-ontology-packet-lineage] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
