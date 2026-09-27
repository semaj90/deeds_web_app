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
import { readOrfRowsForCandidatesV1 } from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/orf-feature-row-reader-v1.ts';

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const mapPath = arg('--map'); const featureRevision = arg('--feature-revision'); const representationRevision = arg('--representation-revision');
if (!mapPath || !featureRevision || !representationRevision) { console.error('--map, --feature-revision and --representation-revision are all required (pinned; never "latest")'); process.exit(64); }
const map = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, mapPath), 'utf8'));
const candidates = map.candidates.map((c: any) => ({ candidateOrdinal: c.candidateOrdinal, canonicalId: c.canonicalId, packetKey: c.packetKey, sourceRef: c.sourceRef, workspaceRevision: c.workspaceRevision }));

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
const c = await pool.connect(); let rows: any[] = [];
try {
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  rows = (await c.query('SELECT * FROM public.atlas_observation_feature_rows')).rows;
  await c.query('ROLLBACK');
} finally { c.release(); await pool.end(); }

const result = readOrfRowsForCandidatesV1({ candidates, rows, expectedFeatureRevision: featureRevision, expectedRepresentationRevision: representationRevision });
const receipt = {
  schema: 'atlas.ace-fso-03-live-receipt.v1', generatedAt: new Date().toISOString(), level: 'LIVE_READ_ONLY',
  map: { path: mapPath, candidateSnapshotRevision: map.candidateSnapshotRevision, ordinalMapChecksum: map.ordinalMapChecksum, workspaceRevision: map.workspaceRevision },
  expected: { featureRevision, representationRevision },
  candidateCount: candidates.length, persistedRowsRead: rows.length,
  mappedExact: result.accepted.length, missing: result.rejected.filter((r) => r.reason === 'NO_ORF_ROW').length,
  rejectedWithRow: result.rejected.filter((r) => r.reason !== 'NO_ORF_ROW').length,
  rejectionCounts: result.rejectionCounts, synthesizedRows: result.synthesizedRows,
  outputChecksum: 'sha256:' + createHash('sha256').update(JSON.stringify(result)).digest('hex'),
  writesPerformed: false, canonicalAuthority: false,
};
const out = path.join(REPO_ROOT, 'docs', 'reports', `ace-fso-03-live-receipt-v1-${receipt.generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}.json`);
fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ...receipt, receipt: path.relative(REPO_ROOT, out) }, null, 2));
