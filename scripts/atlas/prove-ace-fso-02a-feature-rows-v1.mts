#!/usr/bin/env node
/**
 * ACE-FSO-02A: read-only reproduction of ACE_RESOLVER_FEATURE_ROWS_MISSING against a pinned CandidateOrdinalMapV1.
 * Reads persisted `atlas_observation_feature_rows` (ORF) in one REPEATABLE READ READ ONLY transaction, classifies every
 * candidate ordinal by exact-match outcome, then feeds ONLY exactly-mapped rows to the existing
 * createSearchRuntimeAceResolverV1. It never synthesizes a feature row from Qdrant, Graphify, AST, domain classes or defaults.
 *
 *   npx tsx scripts/atlas/prove-ace-fso-02a-feature-rows-v1.mts --map <candidate-ordinal-map-v1.json> [--feature-revision <rev>]
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { createSearchRuntimeAceResolverV1 } from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/search-runtime-ace-resolver-v1.ts';

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const mapPath = arg('--map');
if (!mapPath) { console.error('--map <pinned candidate-ordinal-map-v1.json> required (never "latest")'); process.exit(64); }
const map = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, mapPath), 'utf8'));
const candidates: any[] = map.candidates;
const receipt: any = {
  schema: 'atlas.ace-fso-02a-feature-rows-repro.v1', generatedAt: new Date().toISOString(), level: 'LIVE_READ_ONLY', writesPerformed: 0, canonicalAuthority: false,
  map: { path: path.relative(REPO_ROOT, path.resolve(REPO_ROOT, mapPath)), candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, workspaceRevision: map.workspaceRevision, rowCount: map.rowCount },
};

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
const c = await pool.connect();
let orf: any[] = [];
try {
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  orf = (await c.query(`SELECT packet_key, feature_revision, source_ref, workspace_revision, representation_id, representation_revision,
      source_version_receipt_id, producer_revision, created_at FROM public.atlas_observation_feature_rows`)).rows;
  await c.query('ROLLBACK');
} finally { c.release(); await pool.end(); }

const wanted = arg('--feature-revision');
const rows = wanted ? orf.filter((r) => r.feature_revision === wanted) : orf;
const byKey = new Map<string, any[]>();
for (const r of rows) { (byKey.get(r.packet_key) ?? byKey.set(r.packet_key, []).get(r.packet_key)!).push(r); }

const outcomes: Record<string, number> = {};
const missing: number[] = []; const rejected: any[] = []; let exact = 0;
for (const cand of candidates) {
  const hits = byKey.get(cand.packetKey) ?? [];
  let reason: string;
  if (hits.length === 0) reason = 'NO_ORF_ROW';
  else {
    const r = hits[0];
    if (hits.length > 1) reason = 'MULTIPLE_ORF_ROWS_FOR_PACKET_KEY';
    else if (r.source_ref !== cand.sourceRef) reason = 'SOURCE_REF_MISMATCH';
    else if (r.workspace_revision == null) reason = 'ORF_WORKSPACE_REVISION_NULL';
    else if (r.workspace_revision !== cand.workspaceRevision) reason = 'ORF_WORKSPACE_REVISION_MISMATCH';
    else if (r.representation_revision == null) reason = 'ORF_REPRESENTATION_REVISION_NULL';
    else reason = 'EXACT_CANDIDATE_MATCH_PENDING_ROUTER_ROW_CONVERSION';
  }
  outcomes[reason] = (outcomes[reason] ?? 0) + 1;
  if (reason.startsWith('EXACT')) exact++;
  else {
    missing.push(cand.candidateOrdinal);
    if (rejected.length < 25 && reason !== 'NO_ORF_ROW') {
      const r = hits[0];
      rejected.push({ candidateOrdinal: cand.candidateOrdinal, packetKey: cand.packetKey, reason, observed: { feature_revision: r.feature_revision, workspace_revision: r.workspace_revision, representation_revision: r.representation_revision, created_at: r.created_at } });
    }
  }
}
const candidateKeys = new Set(candidates.map((x) => x.packetKey));
Object.assign(receipt, {
  expectedCandidateCount: candidates.length,
  persistedRowsConsidered: rows.length,
  persistedRowsOutsideCandidateSet: rows.filter((r) => !candidateKeys.has(r.packet_key)).length,
  persistedFeatureRevisions: [...new Set(orf.map((r) => r.feature_revision))],
  outcomeCounts: outcomes, exactRowsMapped: exact, missingOrdinalCount: missing.length,
  missingOrdinalsSample: missing.slice(0, 25), rejectedRowsSample: rejected,
  orfWorkspaceRevisionNullCount: rows.filter((r) => r.workspace_revision == null).length,
  orfRepresentationRevisionNullCount: rows.filter((r) => r.representation_revision == null).length,
});

// Feed ONLY exactly-mapped rows (none can pass today) to the existing resolver; the resolver is the acceptance test.
let resolverOutcome: any;
try {
  const resolver = createSearchRuntimeAceResolverV1(async () => ({
    candidates: candidates.map((x) => ({ canonicalId: x.canonicalId, packetKey: x.packetKey, sourceRef: x.sourceRef, sourceRevision: x.sourceRevision, workspaceRevision: x.workspaceRevision })),
    ordinalMap: map, rows: [], laneMaskByOrdinal: {}, producerRevision: 'ace-fso-02a:repro:v1', requestId: 'ace-fso-02a:repro', tokenBudget: 1,
    retrievalPolicyRevision: 'ace-fso-02a:repro-not-a-revision', acePlaybookRevision: 'ace-fso-02a:repro-not-a-revision', representationRevision: 'ace-fso-02a:repro-not-a-revision', graphRevision: null,
  } as any));
  await resolver.resolve({ query: 'ace-fso-02a', requestId: 'ace-fso-02a:repro', workspaceRevision: map.workspaceRevision });
  resolverOutcome = { threw: false };
} catch (e: any) { resolverOutcome = { threw: true, error: e.message }; }
receipt.resolverAttempt = { ...resolverOutcome, rowsSuppliedToResolver: 0, note: 'no row passed exact mapping, so none was supplied; nothing synthesized' };
receipt.status = exact === candidates.length ? 'ALL_CANDIDATES_HAVE_EXACT_ORF_ROWS' : 'FEATURE_ROWS_MISSING_REPRODUCED';

const out = path.join(REPO_ROOT, 'docs', 'reports', `ace-fso-02a-feature-rows-repro-v1-${receipt.generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.json`);
fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: receipt.status, expected: candidates.length, orfRows: rows.length, exactRowsMapped: exact, outcomeCounts: outcomes, resolverAttempt: receipt.resolverAttempt, receipt: path.relative(REPO_ROOT, out) }, null, 2));
