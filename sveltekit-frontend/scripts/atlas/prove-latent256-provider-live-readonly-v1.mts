import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { db, pgRows, pool } from '../../src/lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { PostgresLatent256CandidateProvider } from '../../src/lib/server/retrieval/latent256-candidate-provider.js';

const rows = pgRows<{ id: string; checkpoint: string }>(await db.execute(sql`
  SELECT id::text AS id, latent_256_checkpoint_revision AS checkpoint
  FROM codebase_chunk_index
  WHERE latent_256 IS NOT NULL
    AND latent_256_checkpoint_revision IS NOT NULL
  ORDER BY id
  LIMIT 5
`));

const candidateIds = rows.map(row => row.id);
const checkpointRevision = rows[0]?.checkpoint ?? '';
if (candidateIds.length === 0 || checkpointRevision.length === 0) {
  throw new Error('No revision-qualified latent_256 sample is available');
}

const input = {
  candidateIds,
  checkpointRevision,
  candidateSnapshotRevision: 'live-readonly-sample-v1',
  representationRevision: 'latent_256',
};
const provider = new PostgresLatent256CandidateProvider();
const first = await provider.hydrate(input);
const second = await provider.hydrate(input);
const receipt = {
  schema: 'atlas.latent256-provider-live-readonly-proof.v1',
  status: first.receiptChecksum === second.receiptChecksum
    && first.requested === candidateIds.length
    && first.found === candidateIds.length
    && first.revisionMismatch === 0
    && first.invalidShape === 0
    ? 'PROVEN_BOUNDED'
    : 'REVIEW_REQUIRED',
  input: {
    candidateCount: candidateIds.length,
    checkpointRevision,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    representationRevision: input.representationRevision,
  },
  first,
  second,
  deterministic: first.receiptChecksum === second.receiptChecksum,
  canonicalWrites: 0,
  candidateIds,
};

await writeFile('../docs/reports/latent256-provider-live-readonly-proof-v1.json', `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(receipt));
await pool.end();
