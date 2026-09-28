#!/usr/bin/env node
/**
 * ACE-FSO-03 live read-only receipt: runs the REAL exact-gate reader (readOrfRowsForCandidatesV1) over a pinned
 * CandidateOrdinalMapV1 and the persisted ORF table. One REPEATABLE READ READ ONLY transaction; writes only the receipt.
 *   npx tsx scripts/atlas/prove-ace-fso-03-live-v1.mts --map <candidate-ordinal-map-v1.json> --feature-revision <rev> --representation-revision <rev>
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { readOrfRowsForCandidateMapV1 } from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/orf-feature-row-reader-v1.ts';

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const mapPath = arg('--map'); const featureRevision = arg('--feature-revision'); const representationRevision = arg('--representation-revision');
const expectedSnapshot = arg('--snapshot'); const expectedOrdinalChecksum = arg('--ordinal-map-checksum'); const expectedWorkspace = arg('--workspace-revision');
if (!mapPath || !featureRevision || !representationRevision || !expectedSnapshot || !expectedOrdinalChecksum || !expectedWorkspace) {
  console.error('--map, --snapshot, --ordinal-map-checksum, --workspace-revision, --feature-revision and --representation-revision are required and must be explicitly pinned');
  process.exit(64);
}
const isUnresolvedRevision = (value: string) =>
  /(?:^|[:/_-])(?:latest|unset|unknown|now|pending|unresolved|none|null)(?:$|[:/_-])/i.test(value.trim());
if (isUnresolvedRevision(representationRevision) || isUnresolvedRevision(featureRevision) || isUnresolvedRevision(expectedWorkspace)) {
  console.error('pinned feature, representation and workspace revisions must not contain unresolved sentinels'); process.exit(64);
}
const map = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, mapPath), 'utf8'));
const mapBytes = fs.readFileSync(path.resolve(REPO_ROOT, mapPath));

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
const c = await pool.connect(); let rows: any[] = [];
try {
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  rows = (await c.query('SELECT * FROM public.atlas_observation_feature_rows')).rows;
  await c.query('ROLLBACK');
} finally { c.release(); await pool.end(); }

const result = readOrfRowsForCandidateMapV1({
  ordinalMap: map,
  expectedCandidateSnapshotRevision: expectedSnapshot,
  expectedOrdinalMapChecksum: expectedOrdinalChecksum,
  expectedWorkspaceRevision: expectedWorkspace,
  rows,
  expectedFeatureRevision: featureRevision,
  expectedRepresentationRevision: representationRevision,
});
if (result.accepted.length + result.rejected.length !== result.mapIdentity.rowCount) {
  throw new Error('ORF_READ_RESULT_CANDIDATE_CONSERVATION_FAILED');
}
const receipt = {
  schema: 'atlas.ace-fso-03-live-receipt.v1', generatedAt: new Date().toISOString(), level: 'LIVE_READ_ONLY',
  map: { path: mapPath, fileSha256: createHash('sha256').update(mapBytes).digest('hex'), ...result.mapIdentity },
  expected: { featureRevision, representationRevision },
  candidateCount: result.mapIdentity.rowCount, persistedRowsRead: rows.length,
  mappedExact: result.accepted.length, missing: result.rejected.length,
  noOrfRow: result.rejected.filter((r) => r.reason === 'NO_ORF_ROW').length,
  rejectedWithRow: result.rejected.filter((r) => r.reason !== 'NO_ORF_ROW').length,
  rejectionCounts: result.rejectionCounts, synthesizedRows: result.synthesizedRows,
  outputChecksum: 'sha256:' + createHash('sha256').update(JSON.stringify(result)).digest('hex'),
  writesPerformed: false, canonicalAuthority: false,
};
const out = path.join(REPO_ROOT, 'docs', 'reports', `ace-fso-03-live-receipt-v1-${receipt.generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.json`);
fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ...receipt, receipt: path.relative(REPO_ROOT, out) }, null, 2));
