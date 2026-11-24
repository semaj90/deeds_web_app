#!/usr/bin/env node
/** Read-only live ACE3 HyperGraphRAG replay against one revision-qualified packet from PG18. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const workspaceRevision =
  process.argv.find((a) => a.startsWith('--workspace-revision='))?.slice(21) ??
  'sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c';
const packetKey = 'packet:00ce699acf88';
const featureId = 'valkey';
const digest = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, connectionTimeoutMillis: 8000 });

try {
  await pool.query('BEGIN READ ONLY');
  const pktRes = await pool.query(
    `SELECT p.packet_key, p.source_ref, p.source_revision, b.workspace_revision, p.feature_id,
            p.sha256, p.domain_class, p.primary_domain, p.community_id, p.pagerank,
            p.som_row, p.som_col, p.kmeans_cluster
     FROM atlas_packets p
     JOIN atlas_workspace_source_bindings b
       ON b.canonical_source_ref = p.source_ref
      AND b.source_revision = p.source_revision
      AND b.workspace_revision = $2
     WHERE p.packet_key = $1 AND p.feature_id = $3
     LIMIT 1`,
    [packetKey, workspaceRevision, featureId],
  );
  if (pktRes.rows.length !== 1) throw new Error('ACE3_LIVE_PG18_PACKET_NOT_FOUND');
  const row = pktRes.rows[0];

  const [{ buildAcePacketV3, verifyAcePacketV3 }, { createFeatureIntelligenceRepository }, { enrichAcePacketV3WithHyperRagV1 }] =
    await Promise.all([
      import(pathToFileURL(path.join(REPO_ROOT, 'packages/parent-atlas/dist/core/ace-packet-v3.js')).href),
      import(pathToFileURL(path.join(REPO_ROOT, 'packages/parent-atlas/dist/core/feature-intelligence-repository.js')).href),
      import(pathToFileURL(path.join(REPO_ROOT, 'sveltekit-frontend/src/lib/server/atlas/integration/hyperrag-fusion-runtime-adapter-v1.ts')).href),
    ]);

  const inputDigest = digest(JSON.stringify(row));
  const section = (data, status, revision, evidence_refs = []) => ({ status, revision, evidence_refs, data });
  const asSha = (hex) => {
    const clean = String(hex ?? '').replace(/^sha256:/, '');
    return /^[0-9a-f]{64}$/i.test(clean) ? `sha256:${clean}` : digest(String(hex ?? ''));
  };
  const producer = 'ace3-08-live-readonly-pg18@v2';
  const canonicalPacket = buildAcePacketV3({
    base: {
      packet_revision: inputDigest,
      producer_revision: producer,
      hypergraph: null,
      envelope: {
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        canonical_source_ref: row.source_ref,
        feature_id: row.feature_id,
        source_revision: row.source_revision,
      },
    },
    identity: {
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      workspace_revision: row.workspace_revision,
      source_revision: row.source_revision,
      packet_revision: inputDigest,
      producer_revision: producer,
      representation_id: 'semantic_768',
      representation_revision: null,
      feature_revision: null,
      graph_revision: null,
      symbol_version_id: null,
      tree_node_id: null,
    },
    source: section(
      {
        language: path.extname(row.source_ref).slice(1) || null,
        source_digest: asSha(row.sha256 ?? row.source_revision),
        start_byte: null,
        end_byte: null,
        ast_state: 'REVISION_QUALIFIED',
      },
      'CURRENT',
      row.source_revision,
      ['atlas_workspace_source_bindings'],
    ),
    semantic: section(
      {
        summary: section({ text: null, input_digest: null, model_revision: null }, 'PENDING', null),
        embedding: section(
          { model: null, dimension: null, input_digest: null, embedding_digest: null, vector_ref: null },
          'PENDING',
          null,
        ),
        keywords: [],
        entities: [],
        concept_ids: [],
        domain_class: row.primary_domain ?? row.domain_class ?? null,
      },
      'HINT',
      null,
    ),
    topology: section(
      {
        community_id: row.community_id !== null ? String(row.community_id) : null,
        pagerank: row.pagerank !== null && row.pagerank !== undefined ? Number(row.pagerank) : null,
        som: row.som_row !== null && row.som_col !== null ? { row: Number(row.som_row), col: Number(row.som_col) } : null,
        kmeans_cluster: row.kmeans_cluster !== null ? String(row.kmeans_cluster) : null,
        centroid_refs: [],
      },
      'HINT',
      null,
    ),
    residency: section(
      { tier: 'COLD', lod: 'IDENTITY', utility: null, prefetch_reasons: [], cache_identity_checksum: null },
      'PENDING',
      null,
    ),
    evidence: section(
      { refs: [`atlas_packets:${row.packet_key}`], contradictions: [], stale_refs: [] },
      'CURRENT',
      row.source_revision,
    ),
  });

  const packetReadback = await pool.query(
    `SELECT count(*)::int AS matches
     FROM atlas_packets p
     JOIN atlas_workspace_source_bindings b
       ON b.canonical_source_ref = p.source_ref
      AND b.source_revision = p.source_revision
      AND b.workspace_revision = $4
     WHERE p.packet_key = $1 AND p.source_ref = $2 AND p.source_revision = $3
       AND p.feature_id = $5`,
    [packetKey, row.source_ref, row.source_revision, workspaceRevision, featureId],
  );
  if (packetReadback.rows[0]?.matches !== 1) throw new Error('CANONICAL_PACKET_CURRENT_BINDING_NOT_UNIQUE');

  const result = await enrichAcePacketV3WithHyperRagV1({
    packet: canonicalPacket,
    queryId: 'ace3-08-live-readonly-proof',
    producerRevision: 'ace3-08-live-readonly-audit-v1',
    repository: createFeatureIntelligenceRepository(pool),
    maximumHopCount: 2,
    fanoutLimit: 20,
  });
  const relationships = result.facade?.relationships ?? [];
  const exactBindings = relationships.length
    ? await pool.query(
        `SELECT canonical_source_ref, source_revision
         FROM atlas_workspace_source_bindings
         WHERE workspace_revision = $1
           AND (canonical_source_ref, source_revision) IN (
             SELECT * FROM unnest($2::text[], $3::text[])
           )`,
        [workspaceRevision, relationships.map((r) => r.source_ref), relationships.map((r) => r.source_revision)],
      )
    : { rows: [] };
  const bindingKeys = new Set(exactBindings.rows.map((r) => `${r.canonical_source_ref}\0${r.source_revision}`));
  const allRelationshipsBound =
    relationships.length > 0 && relationships.every((r) => bindingKeys.has(`${r.source_ref}\0${r.source_revision}`));
  const verified = verifyAcePacketV3(result.packet);
  const passed =
    result.status === 'ENRICHED' &&
    result.acceptedCandidateCount === 1 &&
    result.rejectedCandidateCount === 0 &&
    result.acePayloads.length === 1 &&
    verified.base.hypergraph !== null &&
    allRelationshipsBound &&
    (verified.base.hypergraph.retrieval.graph_hops_executed ?? 99) <= 2;

  const report = {
    schema: 'atlas.ace3-hyperrag-live-readonly-proof.v1',
    status: passed ? 'LIVE_READBACK_PROVEN' : 'BLOCKED_OR_FAILED',
    mode: 'READ_ONLY_TRANSACTION_LOCAL_COMPOSITION',
    writes: { database: 0, qdrant: 0, valkey: 0, graphify: 0 },
    packet: {
      packetKey,
      featureId,
      sourceRef: row.source_ref,
      sourceRevision: row.source_revision,
      workspaceRevision,
      canonicalPacketAndSourceBindingRows: packetReadback.rows[0]?.matches ?? 0,
    },
    retrieval: {
      status: result.status,
      reason: result.reason ?? null,
      acceptedCandidates: result.acceptedCandidateCount,
      rejectedCandidates: result.rejectedCandidateCount,
      relationshipsRead: relationships.length,
      relationshipsWithExactCurrentBindings: relationships.filter((r) => bindingKeys.has(`${r.source_ref}\0${r.source_revision}`)).length,
      payloadCount: result.acePayloads.length,
      hops: verified.base.hypergraph?.retrieval.graph_hops_executed ?? null,
      packetChecksumVerified: true,
    },
    inputSource: { kind: 'LIVE_PG18_READ_ONLY', sha256: inputDigest },
    proofBoundary:
      'Live PostgreSQL readback and in-memory ACE composition only; no production caller, persistence, cache write, or retrieval-vote promotion is asserted.',
    generatedAt: new Date().toISOString(),
  };
  if (!passed) process.exitCode = 1;
  const reportDir = path.join(REPO_ROOT, 'docs/reports');
  const reportPath = path.join(reportDir, 'ace3-hyperrag-live-readonly-proof-v1.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ reportPath: path.relative(REPO_ROOT, reportPath).replaceAll('\\', '/'), ...report }, null, 2));
  await pool.query('ROLLBACK');
} catch (error) {
  await pool.query('ROLLBACK').catch(() => undefined);
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
