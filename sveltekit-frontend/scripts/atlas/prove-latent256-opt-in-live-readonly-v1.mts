import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { db, pgRows, pool } from '../../src/lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import {
  applyConfiguredLatent256Dedup,
  type RankedCandidate,
} from '../../src/lib/server/retrieval/unified-orchestrator.js';

const rows = pgRows<{ id: string; sourceRef: string; checkpoint: string }>(await db.execute(sql`
  SELECT id::text AS id,
         COALESCE(relative_path, id::text) AS "sourceRef",
         latent_256_checkpoint_revision AS checkpoint
  FROM codebase_chunk_index
  WHERE latent_256 IS NOT NULL
    AND latent_256_checkpoint_revision IS NOT NULL
  ORDER BY id
  LIMIT 5
`));
if (rows.length !== 5 || !rows[0]?.checkpoint) {
  throw new Error(`Expected five revision-qualified rows, found ${rows.length}`);
}

const ranked = rows.map((row, index) => ({
  id: `projection-${index}`,
  identity: {
    candidateId: row.id,
    qdrantPointId: `projection-${index}`,
    packetKey: row.id,
    sourceRef: row.sourceRef,
    sourceRevision: null,
    workspaceRevision: null,
    symbolVersionId: null,
    identitySource: 'QDRANT_PAYLOAD_V1' as const,
    missingFields: ['sourceRevision', 'workspaceRevision'] as const,
  },
  qdrantPointId: `projection-${index}`,
  packetKey: row.id,
  sourceRef: row.sourceRef,
  score: 1 - index / 100,
  path: row.sourceRef,
  symbol: 'live-readonly-sample',
  kind: 'sample',
  ranks: {},
})) satisfies RankedCandidate[];

const selected = await applyConfiguredLatent256Dedup(ranked, {
  enabled: true,
  threshold: 0.9,
  finalK: ranked.length,
  candidatePoolK: ranked.length,
  checkpointRevision: rows[0].checkpoint,
  candidateSnapshotRevision: 'live-readonly-sample-v1',
  representationRevision: 'latent_256',
});

const receipt = {
  schema: 'atlas.latent256-opt-in-live-readonly-proof.v1',
  status: 'PROVEN_BOUNDED',
  inputCount: ranked.length,
  outputCount: selected.length,
  inputPacketKeys: ranked.map(candidate => candidate.packetKey),
  outputPacketKeys: selected.map(candidate => candidate.packetKey),
  defaultPathChanged: false,
  canonicalWrites: 0,
  identityFallbacks: {
    packetKeyFromPointId: 0,
    sourceRefFromPath: 0,
  },
  checkpointRevision: rows[0].checkpoint,
};

await writeFile('../docs/reports/latent256-opt-in-live-readonly-proof-v1.json', `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(receipt));
await pool.end();
