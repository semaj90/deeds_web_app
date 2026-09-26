#!/usr/bin/env node
/** Read-only live ACE3 HyperGraphRAG replay against one revision-qualified packet. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const workspaceRevision = 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';
const packetKey = 'packet:00ce699acf88';
const featureId = 'valkey';
const sourceArtifact = '.tmp/atlas/ace-packets-v3/20260925T220337Z/ace-packets-v3-00001.ndjson';
const digest = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, connectionTimeoutMillis: 8000 });

try {
  await pool.query('BEGIN READ ONLY');
  let packet = null;
  const artifactBytes = fs.readFileSync(path.join(REPO_ROOT, sourceArtifact));
  for (const line of artifactBytes.toString('utf8').split(/\r?\n/)) {
    if (!line) continue;
    const candidate = JSON.parse(line);
    if (candidate.identity?.packet_key === packetKey) { packet = candidate; break; }
  }
  if (!packet) throw new Error('ACE3_PACKET_FIXTURE_NOT_FOUND');

  const [{ buildAcePacketV3, verifyAcePacketV3 }, { createFeatureIntelligenceRepository }, { enrichAcePacketV3WithHyperRagV1 }] = await Promise.all([
    import(pathToFileURL(path.join(REPO_ROOT, 'packages/parent-atlas/dist/core/ace-packet-v3.js')).href),
    import(pathToFileURL(path.join(REPO_ROOT, 'packages/parent-atlas/dist/core/feature-intelligence-repository.js')).href),
    import(pathToFileURL(path.join(REPO_ROOT, 'sveltekit-frontend/src/lib/server/atlas/integration/hyperrag-fusion-runtime-adapter-v1.ts')).href),
  ]);

  const { integrity: _integrity, ...body } = packet;
  body.base = { ...body.base, envelope: { ...body.base.envelope, feature_id: featureId } };
  const canonicalPacket = buildAcePacketV3(body);
  const packetReadback = await pool.query(`
    SELECT count(*)::int AS matches
    FROM atlas_packets p
    JOIN atlas_workspace_source_bindings b
      ON b.canonical_source_ref = p.source_ref
     AND b.source_revision = p.source_revision
     AND b.workspace_revision = $4
    WHERE p.packet_key = $1 AND p.source_ref = $2 AND p.source_revision = $3
      AND p.feature_id = $5
  `, [packetKey, packet.identity.source_ref, packet.identity.source_revision, workspaceRevision, featureId]);
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
  const exactBindings = relationships.length ? await pool.query(`
    SELECT canonical_source_ref, source_revision
    FROM atlas_workspace_source_bindings
    WHERE workspace_revision = $1
      AND (canonical_source_ref, source_revision) IN (
        SELECT * FROM unnest($2::text[], $3::text[])
      )
  `, [workspaceRevision, relationships.map((r) => r.source_ref), relationships.map((r) => r.source_revision)]) : { rows: [] };
  const bindingKeys = new Set(exactBindings.rows.map((r) => `${r.canonical_source_ref}\0${r.source_revision}`));
  const allRelationshipsBound = relationships.length > 0 && relationships.every((r) => bindingKeys.has(`${r.source_ref}\0${r.source_revision}`));
  const verified = verifyAcePacketV3(result.packet);
  const passed = result.status === 'ENRICHED'
    && result.acceptedCandidateCount === 1 && result.rejectedCandidateCount === 0
    && result.acePayloads.length === 1 && verified.base.hypergraph !== null
    && allRelationshipsBound
    && (verified.base.hypergraph.retrieval.graph_hops_executed ?? 99) <= 2;

  const report = {
    schema: 'atlas.ace3-hyperrag-live-readonly-proof.v1',
    status: passed ? 'LIVE_READBACK_PROVEN' : 'BLOCKED_OR_FAILED',
    mode: 'READ_ONLY_TRANSACTION_LOCAL_COMPOSITION',
    writes: { database: 0, qdrant: 0, valkey: 0, graphify: 0 },
    packet: {
      packetKey,
      featureId,
      sourceRef: packet.identity.source_ref,
      sourceRevision: packet.identity.source_revision,
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
    inputArtifact: { path: sourceArtifact, sha256: digest(artifactBytes) },
    proofBoundary: 'Live PostgreSQL readback and in-memory ACE composition only; no production caller, persistence, cache write, or retrieval-vote promotion is asserted.',
    generatedAt: new Date().toISOString(),
  };
  if (!passed) process.exitCode = 1;
  const reportDir = path.join(REPO_ROOT, 'docs/reports');
  const reportPath = path.join(reportDir, 'ace3-hyperrag-live-readonly-proof-v1.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ reportPath: path.relative(REPO_ROOT, reportPath).replaceAll('\\', '/'), ...report }, null, 2));
  await pool.query('ROLLBACK');
} catch (error) {
  await pool.query('ROLLBACK').catch(() => undefined);
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
