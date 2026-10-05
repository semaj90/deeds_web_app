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
        workspaceRevision: id.workspaceRevision ?? null, representationRevision: null, evidenceRefs: null, executor: null, lanes: Object.keys(k.ranks ?? {}), missingFields: id.missingFields ?? [],
        proofUsable: false, identityComplete: complete };
    });
    const ids = cands.map((k: any) => k.canonicalId ?? '').sort();
    cases.push({ id: c.id, query: c.query, ok: true, latencyMs: Date.now() - t0, candidateCount: cands.length, candidateSetChecksum: sha(ids.join('\n')), evidenceStatus: r.evidence_status ?? null,
      lanes: r.lanes ?? null, degradedLanes: Object.entries(r.lanes ?? {}).filter(([, v]: any) => v.status !== 'OK').map(([k, v]: any) => `${k}:${v.status}${v.reason ? `:${v.reason}` : ''}`),
      readOnlyReceipt: r.read_only_receipt ?? null,
      counts: { candidateId: cands.filter((k: any) => k.canonicalId).length, packetKey: cands.filter((k: any) => k.packetKey).length, sourceRef: cands.filter((k: any) => k.sourceRef).length,
        sourceRevision: cands.filter((k: any) => k.sourceRevision).length, workspaceRevision: cands.filter((k: any) => k.workspaceRevision).length, identityComplete: cands.filter((k: any) => k.identityComplete).length },
      candidates: cands });
  } catch (e: any) { cases.push({ id: c.id, query: c.query, ok: false, latencyMs: Date.now() - t0, error: String(e?.message ?? e).slice(0, 200) }); }
}
const okCases = cases.filter((c) => c.ok);
const distinct = new Set(okCases.map((c) => c.candidateSetChecksum)).size;
const total = okCases.reduce((a, c) => a + c.candidateCount, 0);
const revComplete = okCases.reduce((a, c) => a + c.counts.identityComplete, 0);
const verdict = okCases.length === COHORT.length && distinct === COHORT.length && okCases.every((c) => c.candidateCount > 0)
  ? (revComplete === total && total > 0 ? 'ACCEPTANCE_DISTINCT_AND_REVISION_QUALIFIED' : 'DISTINCT_SETS_BUT_REVISION_INCOMPLETE') : 'NOT_PASSED';
const report = { schema: 'atlas.kernel-real-02-orchestrator-live-proof.v1', generatedAt: new Date().toISOString(), canonicalAuthority: false, writesPerformed: false, executionMode: 'READ_ONLY',
  postgresPasswordPresentInEnv: hasPassword, cohortNote: 'frozen re-creation; original 01B question text was not recorded', verdict, distinctCandidateSets: `${distinct}/${COHORT.length}`,
  revisionQualifiedCandidates: `${revComplete}/${total}`, missingContractFields: ['executor', 'representationRevision', 'evidenceRefs', 'proofUsable'], rewireDecision: 'DO_NOT_REWIRE_atlas_query_UNTIL_TRACE_PARITY_AND_READBACK', cases };
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
console.log('postgresPassword', hasPassword ? 'present' : 'ABSENT (enrichment will degrade)');
for (const c of cases) console.log(c.ok ? `${c.id.padEnd(10)} n=${c.candidateCount} ${c.latencyMs}ms set=${c.candidateSetChecksum.slice(0, 10)} evidence=${c.evidenceStatus} degraded=[${c.degradedLanes.join(',')}] ids=${c.counts.candidateId} pk=${c.counts.packetKey} srcRev=${c.counts.sourceRevision} wsRev=${c.counts.workspaceRevision}`
  : `${c.id.padEnd(10)} THREW ${c.error}`);
console.log(verdict, `distinct=${distinct}/${COHORT.length}`, `revisionQualified=${revComplete}/${total}`);
process.exit(0);
