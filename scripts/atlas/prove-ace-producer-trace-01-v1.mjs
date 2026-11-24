#!/usr/bin/env node
/**
 * ACE-PRODUCER-TRACE-01 (live PG18 read-only cohort + negative replay proofs).
 *
 * Traces a real bounded cohort from PostgreSQL 18 (`atlas_packets` JOIN
 * `atlas_workspace_source_bindings`) end to end:
 *   live PG18 revision-qualified rows -> buildAcePacketV3() ->
 *   verifyAcePacketV3() -> CandidateOrdinalMapV1 -> CandidateFeatureSnapshotV1 ->
 *   bridgeAcePacketsToContextManifestV1() + 6 negative replay gates.
 *
 * Run via: `./sveltekit-frontend/node_modules/.bin/tsx.cmd scripts/atlas/prove-ace-producer-trace-01-v1.mjs`
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const N = Number(process.argv.find((a) => a.startsWith('--n='))?.slice(4) ?? 5);
const requestedWorkspaceRev =
  process.argv.find((a) => a.startsWith('--workspace-revision='))?.slice(21) ??
  'sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c';

const dist = (f) => pathToFileURL(path.join(REPO_ROOT, 'packages/parent-atlas/dist/core', f)).href;
const { buildAcePacketV3, verifyAcePacketV3 } = await import(dist('ace-packet-v3.js'));

const srcUrl = (f) => pathToFileURL(path.join(REPO_ROOT, 'sveltekit-frontend/src/lib/server/atlas', f)).href;
const { materializeCandidateOrdinalMap, candidateOrdinalMapV1Schema, assertCandidateOrdinalMapIntegrityV1 } =
  await import(srcUrl('features/canonical-candidate-v1.ts'));
const { materializeCandidateFeatureSnapshot, candidateFeatureSnapshotV1Schema } =
  await import(srcUrl('features/candidate-feature-snapshot-v1.ts'));
const { bridgeAcePacketsToContextManifestV1 } =
  await import(srcUrl('context/ace-packet-v3-context-manifest-bridge-v1.ts'));

const asSha = (hex) => {
  const clean = String(hex ?? '').replace(/^sha256:/, '');
  return /^[0-9a-f]{64}$/i.test(clean) ? `sha256:${clean}` : `sha256:${crypto.createHash('sha256').update(String(hex ?? '')).digest('hex')}`;
};
const section = (data, status, revision, evidence_refs = []) => ({ status, revision, evidence_refs, data });

const steps = [];
const record = (name, ok, detail) => {
  steps.push({ name, ok, detail });
  if (!ok) throw new Error(`ACE_PRODUCER_TRACE_STEP_FAILED:${name}:${JSON.stringify(detail)}`);
};

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, connectionTimeoutMillis: 8000 });

let cohort = [];
let workspaceRevision = requestedWorkspaceRev;
const packetByKey = new Map();

try {
  await pool.query('BEGIN READ ONLY');
  const res = await pool.query(
    `SELECT p.packet_key, p.source_ref, p.source_revision, b.workspace_revision,
            p.feature_id, p.sha256, p.domain_class, p.primary_domain,
            p.community_id, p.pagerank, p.som_row, p.som_col, p.kmeans_cluster
     FROM atlas_packets p
     JOIN atlas_workspace_source_bindings b
       ON b.canonical_source_ref = p.source_ref
      AND b.source_revision = p.source_revision
     WHERE b.workspace_revision = $1
       AND p.source_revision LIKE 'sha256:%'
       AND length(p.source_revision) = 71
     ORDER BY p.packet_key ASC
     LIMIT $2`,
    [requestedWorkspaceRev, N],
  );
  await pool.query('ROLLBACK');
  cohort = res.rows.map((r) => ({
    packetKey: r.packet_key,
    sourceRef: r.source_ref,
    sourceRevision: r.source_revision,
    workspaceRevision: r.workspace_revision,
    featureId: r.feature_id ?? null,
    sha256: r.sha256 ?? null,
    domainClass: r.primary_domain ?? r.domain_class ?? null,
    communityId: r.community_id ?? null,
    pagerank: r.pagerank !== null && r.pagerank !== undefined ? Number(r.pagerank) : null,
    somCell: r.som_row !== null && r.som_col !== null ? [Number(r.som_row), Number(r.som_col)] : null,
    clusterId: r.kmeans_cluster ?? null,
  }));
} finally {
  await pool.end();
}

record('READ_LIVE_PG18_COHORT', cohort.length === N, {
  requested: N,
  selected: cohort.length,
  workspaceRevision,
  packetKeys: cohort.map((c) => c.packetKey),
});

const PRODUCER = 'ace-producer-trace-01@v2-live-pg18';
for (const c of cohort) {
  const inputDigest = `sha256:${crypto.createHash('sha256').update(JSON.stringify(c)).digest('hex')}`;
  const pkt = buildAcePacketV3({
    base: {
      packet_revision: inputDigest,
      producer_revision: PRODUCER,
      hypergraph: null,
      envelope: {
        packet_key: c.packetKey,
        source_ref: c.sourceRef,
        canonical_source_ref: c.sourceRef,
        feature_id: c.featureId,
        source_revision: c.sourceRevision,
      },
    },
    identity: {
      packet_key: c.packetKey,
      source_ref: c.sourceRef,
      workspace_revision: c.workspaceRevision,
      source_revision: c.sourceRevision,
      packet_revision: inputDigest,
      producer_revision: PRODUCER,
      representation_id: 'semantic_768',
      representation_revision: null,
      feature_revision: null,
      graph_revision: null,
      symbol_version_id: null,
      tree_node_id: null,
    },
    source: section(
      {
        language: path.extname(c.sourceRef).slice(1) || null,
        source_digest: asSha(c.sha256 ?? c.sourceRevision),
        start_byte: null,
        end_byte: null,
        ast_state: 'REVISION_QUALIFIED',
      },
      'CURRENT',
      c.sourceRevision,
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
        domain_class: c.domainClass,
      },
      'HINT',
      null,
    ),
    topology: section(
      {
        community_id: c.communityId !== null ? String(c.communityId) : null,
        pagerank: c.pagerank,
        som: c.somCell ? { row: c.somCell[0], col: c.somCell[1] } : null,
        kmeans_cluster: c.clusterId !== null ? String(c.clusterId) : null,
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
      { refs: [`atlas_packets:${c.packetKey}`], contradictions: [], stale_refs: [] },
      'CURRENT',
      c.sourceRevision,
    ),
  });
  verifyAcePacketV3(pkt);
  packetByKey.set(c.packetKey, pkt);
}
record('COMPOSE_AND_VERIFY_PACKETS', packetByKey.size === N, { verified: packetByKey.size });

const candidateSnapshotRevision = `sha256:${crypto
  .createHash('sha256')
  .update(JSON.stringify(cohort.map((c) => c.packetKey).sort()))
  .digest('hex')}`;
const producerRevision = 'ace-producer-trace-01:v2';

const ordinalMap = candidateOrdinalMapV1Schema.parse(
  materializeCandidateOrdinalMap({
    candidates: cohort.map((c) => ({
      canonicalId: c.packetKey,
      packetKey: c.packetKey,
      sourceRef: c.sourceRef,
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: c.workspaceRevision,
      sourceRevision: c.sourceRevision,
      graphRevision: null,
      semanticRevision: null,
    })),
    candidateSnapshotRevision,
    workspaceRevision,
    producerRevision,
  }),
);
assertCandidateOrdinalMapIntegrityV1(ordinalMap);
record('MATERIALIZE_ORDINAL_MAP', ordinalMap.rowCount === N, {
  rowCount: ordinalMap.rowCount,
  ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
});

const featureRevision = `sha256:${crypto
  .createHash('sha256')
  .update(`ACE-PRODUCER-TRACE-01:${ordinalMap.ordinalMapChecksum}`)
  .digest('hex')}`;
const snapshot = candidateFeatureSnapshotV1Schema.parse(
  materializeCandidateFeatureSnapshot({
    ordinalMap,
    featureRevision,
    producerRevision,
    rows: ordinalMap.candidates.map((cand) => ({
      schema: 'atlas.candidate-feature-row.v1',
      candidateOrdinal: cand.candidateOrdinal,
      canonicalId: cand.canonicalId,
      packetKey: cand.packetKey,
      sourceRef: cand.sourceRef,
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision: cand.workspaceRevision,
      sourceRevision: cand.sourceRevision,
      graphRevision: null,
      semanticRevision: null,
      featureRevision,
      representationBindings: [],
      laneMask: [],
      evidenceRefs: [],
    })),
  }),
);
record('MATERIALIZE_FEATURE_SNAPSHOT', snapshot.rowCount === N, {
  rowCount: snapshot.rowCount,
  snapshotChecksum: snapshot.snapshotChecksum,
});

const featureAdmission = { status: 'ADMITTED', snapshot };
const selectedOrdinals = snapshot.rows.map((r) => r.candidateOrdinal).sort((a, b) => a - b);
const packets = [...ordinalMap.candidates]
  .sort((a, b) => a.candidateOrdinal - b.candidateOrdinal)
  .map((c) => packetByKey.get(c.packetKey));

const bridgeResult = bridgeAcePacketsToContextManifestV1({
  featureAdmission,
  selectedOrdinals,
  packets,
  requestId: 'ace-producer-trace-01:req:2',
  tokenBudget: 2048,
  retrievalPolicyRevision: 'ace-producer-trace-01:policy:v2',
  acePlaybookRevision: 'ace-producer-trace-01:playbook:v2',
});
record('BRIDGE_PACKETS_TO_CONTEXT_MANIFEST', bridgeResult !== null, {
  receipt: bridgeResult.receipt,
});

// Negative replay proofs: every tampered/invalid case MUST fail closed.
const negativeProofs = {};
const runNegative = (name, fn) => {
  try {
    fn();
    negativeProofs[name] = { rejected: false, error: 'UNEXPECTED_ACCEPTANCE' };
    return false;
  } catch (err) {
    negativeProofs[name] = { rejected: true, error: err instanceof Error ? err.message : String(err) };
    return true;
  }
};

const negOk = [
  runNegative('bad_checksum', () => {
    const tampered = structuredClone(packets[0]);
    tampered.integrity.packet_checksum = `sha256:${'0'.repeat(64)}`;
    verifyAcePacketV3(tampered);
  }),
  runNegative('stale_revision', () => {
    const tampered = structuredClone(packets[0]);
    tampered.identity.source_revision = `sha256:${'f'.repeat(64)}`;
    bridgeAcePacketsToContextManifestV1({
      featureAdmission,
      selectedOrdinals,
      packets: [tampered, ...packets.slice(1)],
      requestId: 'ace-neg:stale',
      tokenBudget: 2048,
      retrievalPolicyRevision: 'ace-producer-trace-01:policy:v2',
      acePlaybookRevision: 'ace-producer-trace-01:playbook:v2',
    });
  }),
  runNegative('bad_ordinal', () => {
    bridgeAcePacketsToContextManifestV1({
      featureAdmission,
      selectedOrdinals: [999999],
      packets: [packets[0]],
      requestId: 'ace-neg:ordinal',
      tokenBudget: 2048,
      retrievalPolicyRevision: 'ace-producer-trace-01:policy:v2',
      acePlaybookRevision: 'ace-producer-trace-01:playbook:v2',
    });
  }),
  runNegative('unauthorized_source_ref', () => {
    const tampered = structuredClone(packets[0]);
    tampered.identity.source_ref = 'etc/passwd';
    tampered.base.envelope.source_ref = 'etc/passwd';
    bridgeAcePacketsToContextManifestV1({
      featureAdmission,
      selectedOrdinals,
      packets: [tampered, ...packets.slice(1)],
      requestId: 'ace-neg:source-ref',
      tokenBudget: 2048,
      retrievalPolicyRevision: 'ace-producer-trace-01:policy:v2',
      acePlaybookRevision: 'ace-producer-trace-01:playbook:v2',
    });
  }),
  runNegative('forged_citation', () => {
    const tampered = structuredClone(packets[0]);
    tampered.evidence.data.refs = [];
    tampered.evidence.status = 'CURRENT';
    verifyAcePacketV3(tampered);
  }),
  runNegative('missing_encoder', () => {
    const tampered = structuredClone(packets[0]);
    tampered.semantic.data.embedding.status = 'CURRENT';
    tampered.semantic.data.embedding.data.model = null;
    verifyAcePacketV3(tampered);
  }),
].every(Boolean);

record('NEGATIVE_REPLAY_PROOFS', negOk, negativeProofs);

const manifestDir = path.join(REPO_ROOT, '.tmp/atlas');
fs.mkdirSync(manifestDir, { recursive: true });
const manifestPath = path.join(manifestDir, 'ace-producer-manifest-current.json');
fs.writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      schema: 'atlas.ace-producer-manifest.v1',
      generatedAt: new Date().toISOString(),
      workspaceRevision,
      ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
      snapshotChecksum: snapshot.snapshotChecksum,
      contextManifestIdentityChecksum: bridgeResult.admission.manifest.identityChecksum,
      packetKeys: cohort.map((c) => c.packetKey),
    },
    null,
    2,
  ) + '\n',
);

const receipt = {
  schema: 'atlas.ace-producer-trace-01.v1',
  task: 'ACE-PRODUCER-TRACE-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_LIVE_PG18_AND_NEGATIVE_REPLAY',
  writesPerformed: false,
  canonicalAuthority: false,
  cohortSize: N,
  workspaceRevision,
  manifestPath: path.relative(REPO_ROOT, manifestPath).replaceAll('\\', '/'),
  steps,
  negativeProofs,
  bridgeReceipt: bridgeResult.receipt,
  contextManifestIdentityChecksum: bridgeResult.admission.manifest.identityChecksum,
  verdict:
    steps.every((s) => s.ok) && bridgeResult !== null && negOk
      ? 'ACE_PRODUCER_CHAIN_REAL_TRACE_PROVEN'
      : 'ACE_PRODUCER_CHAIN_TRACE_FAILED',
};

fs.writeFileSync(path.join(REPO_ROOT, 'docs/reports/ace-producer-trace-01-v1.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
process.exit(receipt.verdict === 'ACE_PRODUCER_CHAIN_REAL_TRACE_PROVEN' ? 0 : 1);
