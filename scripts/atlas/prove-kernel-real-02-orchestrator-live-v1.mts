#!/usr/bin/env node
/**
 * KERNEL-REAL-02 live three-query proof for executeUnifiedRetrieval (READ ONLY: executionMode READ_ONLY, no writes, no rewiring, no authorization phrase).
 * Records per query: candidateSetChecksum, lane/executor status, identity fields, revision completeness, proofUsable, latency, degraded lanes.
 * The 2026-10-04 harness lived outside the repo and its question text was not recorded; this cohort is a frozen RE-CREATION (three unrelated
 * questions: code-owner, legal, embedding), so results are comparable in kind, not byte-identical to that run.
 * proofUsable here is deliberately strict: every identity field plus sourceRevision AND workspaceRevision must be present; the orchestrator does not emit
 * executor / representationRevision / evidenceRefs per candidate, so those are reported as missing and never invented.
 * Run from sveltekit-frontend/:  npx tsx ../scripts/atlas/prove-kernel-real-02-orchestrator-live-v1.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(path.join(ROOT, f)); } catch { /* absent */ } }
const { executeUnifiedRetrieval } = await import('../../sveltekit-frontend/src/lib/server/retrieval/unified-orchestrator.js');

const COHORT = [
  { id: 'code-owner', query: 'Which module owns unified retrieval and how does it fuse lanes with reciprocal rank fusion?' },
  { id: 'legal', query: 'What does the repository say about chain of custody for evidence?' },
  { id: 'embedding', query: 'How are 768-dimensional embeddings produced and validated?' }
];
const { qualifyEvidenceV1 } = await import('../../sveltekit-frontend/src/lib/server/atlas/identity/lineage-qualification-v1.js');
const { default: pg } = await import('pg');
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const REPORT = path.join(ROOT, 'docs/reports/kernel-real-02-orchestrator-live-proof-v1.json');
const hasPassword = Boolean(process.env.POSTGRES_PASSWORD);

const cases: any[] = [];
for (const c of COHORT) {
  const t0 = Date.now();
  try {
    const r: any = await executeUnifiedRetrieval({ query: c.query, limit: 8, executionMode: 'READ_ONLY' });
    const cands = (r.candidates ?? []).map((k: any) => {
      const id = k.identity ?? {};
      const complete = Boolean(id.candidateId && id.packetKey && id.sourceRef && id.sourceRevision && id.workspaceRevision);
      return { canonicalId: id.candidateId ?? null, packetKey: id.packetKey ?? null, sourceRef: id.sourceRef ?? null, sourceRevision: id.sourceRevision ?? null,
        workspaceRevision: id.workspaceRevision ?? null, representationRevision: id.representationRevision ?? null, evidenceRefs: id.evidenceRefs ?? null, packetBinding: id.packetBinding ?? null, executor: r.lanes?.semantic?.executor ?? null, lanes: Object.keys(k.ranks ?? {}), missingFields: id.missingFields ?? [],
        proofUsable: false, identityComplete: complete };
    });
    const ids = cands.map((k: any) => k.canonicalId ?? '').sort();
    cases.push({ id: c.id, query: c.query, ok: true, latencyMs: Date.now() - t0, candidateCount: cands.length, candidateSetChecksum: sha(ids.join('\n')), evidenceStatus: r.evidence_status ?? null,
      lanes: r.lanes ?? null, degradedLanes: Object.entries(r.lanes ?? {}).filter(([, v]: any) => v.status !== 'OK').map(([k, v]: any) => `${k}:${v.status}${v.reason ? `:${v.reason}` : ''}`),
      readOnlyReceipt: r.read_only_receipt ?? null,
      counts: { candidateId: cands.filter((k: any) => k.canonicalId).length, packetKey: cands.filter((k: any) => k.packetKey).length, sourceRef: cands.filter((k: any) => k.sourceRef).length,
        sourceRevision: cands.filter((k: any) => k.sourceRevision).length, workspaceRevision: cands.filter((k: any) => k.workspaceRevision).length, identityComplete: cands.filter((k: any) => k.identityComplete).length, evidenceRefs: cands.filter((k: any) => k.evidenceRefs?.length).length, lineageProven: cands.filter((k: any) => k.packetBinding === 'LINEAGE_PROVEN').length },
      candidates: cands });
  } catch (e: any) { cases.push({ id: c.id, query: c.query, ok: false, latencyMs: Date.now() - t0, error: String(e?.message ?? e).slice(0, 200) }); }
}
// Canonical qualification: the repo's one qualifier (qualifyEvidenceV1) decides eligibility from packet + PROVEN bridge rows; this harness only supplies rows (read-only SELECTs).
const admitted = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
const ADMITTED_WS: string | null = admitted.status === 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' && admitted.authority === true ? admitted.workspaceRevision : null;
const qpool = new pg.Pool({ host: process.env.POSTGRES_HOST ?? '127.0.0.1', port: Number(process.env.POSTGRES_PORT ?? 5434), user: process.env.POSTGRES_USER ?? 'legal_admin', password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB ?? 'legal_ai_db', max: 1 });
try {
  for (const c of cases.filter((x) => x.ok)) {
    const ids = c.candidates.map((k: any) => k.canonicalId).filter(Boolean);
    const rows = (await qpool.query(`SELECT cc.id AS chunk_id, cc.source_ref, l.packet_key, l.canonical_chunk_id, l.source_revision AS bridge_source_revision, l.revision_status,
        a.workspace_revision_key, a.source_revision AS packet_source_revision, b.source_revision AS admitted_source_revision
      FROM codebase_chunk_index cc
      LEFT JOIN atlas_packet_chunk_lineage l ON l.chunk_row_id = cc.id
      LEFT JOIN atlas_packets a ON a.packet_key = l.packet_key
      LEFT JOIN atlas_workspace_source_bindings b ON b.workspace_revision = $2 AND b.canonical_source_ref = cc.source_ref
     WHERE cc.id = ANY($1::uuid[])`, [ids, ADMITTED_WS])).rows;
    for (const k of c.candidates) {
      const r = rows.find((x: any) => x.chunk_id === k.canonicalId);
      const q = qualifyEvidenceV1({
        packet: r?.packet_key ? { packetKey: r.packet_key, workspaceRevisionKey: r.workspace_revision_key ?? null, sourceRevision: r.packet_source_revision ?? null, sourceRef: r.source_ref ?? null } : null,
        memberships: r?.packet_key ? [{ packetKey: r.packet_key, canonicalChunkId: r.canonical_chunk_id ?? null, revisionStatus: r.revision_status ?? '', sourceRevision: r.bridge_source_revision ?? null }] : [],
        expected: { workspaceRevision: ADMITTED_WS ?? '', sourceRevision: r?.admitted_source_revision ?? '' },
      });
      k.eligibility = q.eligibility; k.chunkIdentityStatus = q.chunkIdentity.status; k.canonicalChunkId = q.chunkIdentity.canonicalChunkIds[0] ?? null;
      k.proofUsable = q.eligibility === 'CHUNK_REVISION_QUALIFIED';
    }
    c.counts.eligibility = c.candidates.reduce((a: any, k: any) => { a[k.eligibility] = (a[k.eligibility] ?? 0) + 1; return a; }, {});
    c.counts.chunkRevisionQualified = c.candidates.filter((k: any) => k.proofUsable).length;
  }
} finally { await qpool.end(); }
const okCases = cases.filter((c) => c.ok);
const distinct = new Set(okCases.map((c) => c.candidateSetChecksum)).size;
const total = okCases.reduce((a, c) => a + c.candidateCount, 0);
const revComplete = okCases.reduce((a, c) => a + c.counts.chunkRevisionQualified, 0);
const verdict = okCases.length === COHORT.length && distinct === COHORT.length && okCases.every((c) => c.candidateCount > 0)
  ? (revComplete === total && total > 0 ? 'ACCEPTANCE_DISTINCT_AND_REVISION_QUALIFIED' : revComplete > 0 ? 'DISTINCT_SETS_PARTIALLY_CHUNK_QUALIFIED' : 'DISTINCT_SETS_BUT_REVISION_INCOMPLETE') : 'NOT_PASSED';
const report = { schema: 'atlas.kernel-real-02-orchestrator-live-proof.v1', generatedAt: new Date().toISOString(), canonicalAuthority: false, writesPerformed: false, executionMode: 'READ_ONLY',
  postgresPasswordPresentInEnv: hasPassword, cohortNote: 'frozen re-creation; original 01B question text was not recorded', verdict, distinctCandidateSets: `${distinct}/${COHORT.length}`,
  revisionQualifiedCandidates: `${revComplete}/${total}`, qualification: 'qualifyEvidenceV1 (packet.workspace_revision_key == admitted, packet+bridge source_revision == admitted binding, PROVEN membership, exactly one canonical chunk)', representationRevisionRequiredForProofUsable: false, missingContractFields: ['representationRevision (no producer; optional in the canonical coordinate)', 'candidateSnapshotRevision / ordinalMapChecksum / coordinateArtifactChecksum (retrieval-level coordinate, not produced by the orchestrator)'], rewireDecision: 'DO_NOT_REWIRE_atlas_query_UNTIL_TRACE_PARITY_AND_READBACK', cases };
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
console.log('postgresPassword', hasPassword ? 'present' : 'ABSENT (enrichment will degrade)');
for (const c of cases) console.log(c.ok ? `${c.id.padEnd(10)} n=${c.candidateCount} ${c.latencyMs}ms set=${c.candidateSetChecksum.slice(0, 10)} evidence=${c.evidenceStatus} degraded=[${c.degradedLanes.join(',')}] ids=${c.counts.candidateId} pk=${c.counts.packetKey} srcRev=${c.counts.sourceRevision} wsRev=${c.counts.workspaceRevision} chunkQualified=${c.counts.chunkRevisionQualified} evidenceRefs=${c.counts.evidenceRefs} lineageProven=${c.counts.lineageProven}`
  : `${c.id.padEnd(10)} THREW ${c.error}`);
console.log(verdict, `distinct=${distinct}/${COHORT.length}`, `revisionQualified=${revComplete}/${total}`);
process.exit(0);
