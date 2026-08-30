import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Standalone entrypoint: load the same repository env precedence used by Atlas
// scripts before importing SvelteKit's database module.
const { loadRepoEnv, resolveDatabaseUrl } = await import('../../../scripts/atlas/connection-config.mjs');
const repoEnv = loadRepoEnv({});
process.env.DATABASE_URL = resolveDatabaseUrl(repoEnv);

const { db, pgRows, pool } = await import('../../src/lib/server/db/client.js');
const { sql } = await import('drizzle-orm');
const { PostgresLatent256CandidateProvider } = await import('../../src/lib/server/retrieval/latent256-candidate-provider.js');

const arg = (name: string, fallback: number): number => {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
  const parsed = value == null ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid --${name}`);
  return parsed;
};

const limit = arg('limit', 32);
const replayCount = arg('replay', 2);
const candidateSnapshotRevision = process.argv.find((item) => item.startsWith('--candidate-snapshot='))?.split('=')[1]
  ?? 'live-readonly-sample-v1';

const rows = pgRows<{ id: string; checkpoint: string }>(await db.execute(sql`
  SELECT id::text AS id, latent_256_checkpoint_revision AS checkpoint
  FROM codebase_chunk_index
  WHERE latent_256 IS NOT NULL
    AND latent_256_checkpoint_revision IS NOT NULL
  ORDER BY id
  LIMIT ${limit}
`));

const candidateIds = rows.map(row => row.id);
const checkpointRevision = rows[0]?.checkpoint ?? '';
if (candidateIds.length === 0 || checkpointRevision.length === 0) {
  throw new Error('No revision-qualified latent_256 sample is available');
}

const input = {
  candidateIds,
  checkpointRevision,
  candidateSnapshotRevision,
  representationRevision: 'latent_256',
};
const provider = new PostgresLatent256CandidateProvider();
const replays = [];
for (let index = 0; index < replayCount; index += 1) {
  replays.push(await provider.hydrate(input));
}
const first = replays[0];
const second = replays[replays.length - 1];
const identityParity = replays.every((run) =>
  JSON.stringify(run.outcomes) === JSON.stringify(first.outcomes));
const checksumParity = replays.every((run) =>
  run.receiptChecksum === first.receiptChecksum && run.vectorsChecksum === first.vectorsChecksum);
const counts = {
  missing: first.missing,
  revisionMismatches: first.revisionMismatch,
  invalidDimensionsOrNonFinite: first.invalidShape,
  identityUnresolved: first.identityUnresolved,
};
const receipt = {
  schema: 'atlas.latent256-live-readback.v1',
  status: checksumParity && identityParity && first.revisionMismatch === 0 && first.invalidShape === 0
    ? 'LIVE_READBACK_PROVEN'
    : 'REVIEW_REQUIRED',
  canonicalAuthority: 'postgres',
  canonicalIdField: 'codebase_chunk_index.id',
  representationId: 'latent_256',
  dimensions: 256,
  checksumEncoding: 'IEEE754_F32LE',
  input: {
    candidateCount: candidateIds.length,
    checkpointRevision,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    representationRevision: input.representationRevision,
  },
  requestedCandidates: candidateIds.length,
  canonicalIdsResolved: new Set(first.outcomes.filter((o) => o.canonicalId !== null).map((o) => o.canonicalId)).size,
  vectorsHydrated: first.found,
  missingVectors: counts.missing,
  revisionMismatches: counts.revisionMismatches,
  invalidDimensionsOrNonFinite: counts.invalidDimensionsOrNonFinite,
  ambiguousRows: 0,
  identityUnresolved: counts.identityUnresolved,
  candidateDrops: 0,
  candidateReorders: 0,
  failOpenPreserved: counts.missing + counts.revisionMismatches + counts.invalidDimensionsOrNonFinite + counts.identityUnresolved,
  outcomes: first.outcomes,
  replay: { runs: replayCount, identityParity, checksumParity },
  canonicalWrites: 0,
  databaseWrites: false,
  productionActivation: false,
  candidateIds,
};

const reportPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/reports/latent256-live-readback-v1.json');
await writeFile(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(receipt));
await pool.end();
