#!/usr/bin/env node
/**
 * PACKET-CHUNK-RESOLVE-01A -- read-only census.
 *
 * Question: does atlas_packets.chunk_id already carry the exact canonical
 * chunk identity we were missing, or is it bound to the wrong thing?
 *
 * Schema facts established before writing this script (verified live):
 *   - atlas_packets.chunk_id            uuid
 *   - codebase_chunk_index.id           uuid, PK, DEFAULT gen_random_uuid()
 *   - codebase_chunk_index.chunk_id     text, format "card:<source_ref>:<hash>",
 *                                       55,816/55,853 populated -- this looks
 *                                       like the DURABLE, content-derived
 *                                       identity, NOT the row PK.
 *   - atlas_packets.chunk_id's sample values are plain UUIDs (not the
 *     "card:..." shape), so it is type- and shape-compatible with
 *     codebase_chunk_index.id (the ephemeral row PK), not with
 *     codebase_chunk_index.chunk_id (the durable text identity).
 *   - codebase_chunk_index has no revision-comparable column against
 *     atlas_packets.workspace_revision (only updated_at / embedding_created_at
 *     timestamps) -- REVISION_DISAGREEMENT is therefore reported as N/A per
 *     row, never silently treated as "agrees".
 *
 * Population: the same 1,390-row distinct atlas_packets population already
 * established (qdrant_point_id IS NOT NULL AND a codebase_chunk_index row
 * exists for the same source_ref with a numeric qdrant_id) -- re-verified
 * live before writing this script (count matched exactly 1390).
 *
 * Classification (mutually exclusive, in this evaluation order):
 *   NULL_CHUNK_ID              -- atlas_packets.chunk_id is NULL
 *   MULTIPLE_MATCHES           -- >1 codebase_chunk_index row resolves
 *   EXACT_INDEX_ID_MATCH       -- exactly 1 match via chunk_id = codebase_chunk_index.id,
 *                                 source_ref agrees
 *   SOURCE_REF_DISAGREEMENT    -- exactly 1 match via id, but source_ref differs
 *   EXACT_CHUNK_ID_MATCH       -- no id-match, but exactly 1 match via
 *                                 chunk_id::text = codebase_chunk_index.chunk_id (text)
 *   NO_MATCH                   -- chunk_id present, resolves to nothing either way
 *
 * No fallback to source_ref-only joins. No first/last-row tie-breaking.
 * writesPerformed: false, always.
 *
 * Usage: npx tsx scripts/atlas/packet-chunk-resolve-01a.mts
 */
import { loadAtlasEnv } from './load-atlas-env.mjs';
await loadAtlasEnv();

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: population } = await pool.query(`
    SELECT ap.packet_id, ap.packet_key, ap.source_ref, ap.chunk_id::text AS chunk_id,
           ap.workspace_revision, ap.qdrant_point_id
    FROM atlas_packets ap
    WHERE ap.qdrant_point_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM codebase_chunk_index ci2
        WHERE ci2.source_ref = ap.source_ref
          AND ci2.qdrant_id IS NOT NULL AND ci2.qdrant_id ~ '^[0-9]+$'
      )
  `);

  if (population.length !== 1390) {
    console.warn(`[PACKET-CHUNK-RESOLVE-01A] WARNING: population is ${population.length}, expected 1390 (definition may have drifted since it was last established -- proceeding with the live count, not assuming 1390).`);
  }

  const chunkIdValues = [...new Set(population.filter((p) => p.chunk_id).map((p) => p.chunk_id))];

  // Match set 1: codebase_chunk_index.id = atlas_packets.chunk_id (both uuid)
  const { rows: idMatches } = await pool.query(
    `SELECT id::text AS id, chunk_id, source_ref, updated_at
     FROM codebase_chunk_index WHERE id::text = ANY($1::text[])`,
    [chunkIdValues],
  );
  const idMatchMap = new Map<string, typeof idMatches>();
  for (const row of idMatches) {
    const list = idMatchMap.get(row.id) ?? [];
    list.push(row);
    idMatchMap.set(row.id, list);
  }

  // Match set 2: codebase_chunk_index.chunk_id (text) = atlas_packets.chunk_id::text
  const { rows: textMatches } = await pool.query(
    `SELECT id::text AS id, chunk_id, source_ref, updated_at
     FROM codebase_chunk_index WHERE chunk_id = ANY($1::text[])`,
    [chunkIdValues],
  );
  const textMatchMap = new Map<string, typeof textMatches>();
  for (const row of textMatches) {
    const list = textMatchMap.get(row.chunk_id) ?? [];
    list.push(row);
    textMatchMap.set(row.chunk_id, list);
  }

  const buckets: Record<string, any[]> = {
    NULL_CHUNK_ID: [],
    MULTIPLE_MATCHES: [],
    EXACT_INDEX_ID_MATCH: [],
    SOURCE_REF_DISAGREEMENT: [],
    EXACT_CHUNK_ID_MATCH: [],
    NO_MATCH: [],
  };

  let durableIdentityPresentOnIndexMatch = 0; // among EXACT_INDEX_ID_MATCH, how many also have a non-null codebase_chunk_index.chunk_id (durable text identity)
  let revisionNotComparable = 0;

  for (const p of population) {
    if (!p.chunk_id) {
      buckets.NULL_CHUNK_ID.push({ packet_id: p.packet_id, packet_key: p.packet_key, source_ref: p.source_ref });
      continue;
    }

    const viaId = idMatchMap.get(p.chunk_id) ?? [];
    if (viaId.length > 1) {
      buckets.MULTIPLE_MATCHES.push({ packet_id: p.packet_id, packet_key: p.packet_key, chunk_id: p.chunk_id, matchCount: viaId.length, via: 'id' });
      continue;
    }
    if (viaId.length === 1) {
      const match = viaId[0];
      revisionNotComparable++; // no revision column on codebase_chunk_index to compare against workspace_revision
      if (match.source_ref !== p.source_ref) {
        buckets.SOURCE_REF_DISAGREEMENT.push({
          packet_id: p.packet_id, packet_key: p.packet_key,
          atlas_source_ref: p.source_ref, chunk_index_source_ref: match.source_ref,
          chunk_id: p.chunk_id,
        });
        continue;
      }
      if (match.chunk_id) durableIdentityPresentOnIndexMatch++;
      buckets.EXACT_INDEX_ID_MATCH.push({
        packet_id: p.packet_id, packet_key: p.packet_key, source_ref: p.source_ref,
        chunk_id: p.chunk_id, canonical_chunk_row_id: match.id,
        durable_chunk_text_identity: match.chunk_id ?? null,
      });
      continue;
    }

    // No match via id -- try the text-identity path
    const viaText = textMatchMap.get(p.chunk_id) ?? [];
    if (viaText.length > 1) {
      buckets.MULTIPLE_MATCHES.push({ packet_id: p.packet_id, packet_key: p.packet_key, chunk_id: p.chunk_id, matchCount: viaText.length, via: 'text_chunk_id' });
      continue;
    }
    if (viaText.length === 1) {
      buckets.EXACT_CHUNK_ID_MATCH.push({
        packet_id: p.packet_id, packet_key: p.packet_key, source_ref: p.source_ref,
        chunk_id: p.chunk_id, canonical_chunk_row_id: viaText[0].id,
      });
      continue;
    }

    buckets.NO_MATCH.push({ packet_id: p.packet_id, packet_key: p.packet_key, source_ref: p.source_ref, chunk_id: p.chunk_id });
  }

  const counts = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length]));
  const totalClassified = Object.values(counts).reduce((a, b) => a + b, 0);

  const exactSingleResolution = counts.EXACT_INDEX_ID_MATCH + counts.EXACT_CHUNK_ID_MATCH;

  const report = {
    schema: 'atlas.packet-chunk-resolve-01a.v1',
    task: 'PACKET-CHUNK-RESOLVE-01A',
    readOnly: true,
    writesPerformed: false,
    population: population.length,
    populationDefinition: 'distinct atlas_packets rows: qdrant_point_id IS NOT NULL AND EXISTS a codebase_chunk_index row with the same source_ref and a numeric qdrant_id',
    totalClassified,
    counts,
    exactSingleResolution,
    exactSingleResolutionFraction: population.length > 0 ? exactSingleResolution / population.length : 0,
    schemaFindings: {
      'atlas_packets.chunk_id': 'uuid, type/shape-compatible with codebase_chunk_index.id (the row PK), NOT with codebase_chunk_index.chunk_id (the durable "card:<source_ref>:<hash>" text identity)',
      'codebase_chunk_index.id': 'uuid PK, DEFAULT gen_random_uuid() -- an ephemeral row identifier, not guaranteed stable across reprocessing/rebuild',
      'codebase_chunk_index.chunk_id': `text, durable content-derived identity, ${55816}/${55853} populated repo-wide (verified separately, not part of this population)`,
      durableIdentityCaveat: `Among EXACT_INDEX_ID_MATCH rows, ${durableIdentityPresentOnIndexMatch}/${counts.EXACT_INDEX_ID_MATCH} also carry a non-null durable text chunk_id on the matched codebase_chunk_index row. This means atlas_packets.chunk_id currently resolves via the EPHEMERAL row PK, not the durable identity -- a future codebase_chunk_index rebuild that regenerates ids would silently break this resolution even though the durable chunk_id text would be unchanged. Not a blocker for this census (we are only asked whether it resolves TODAY), but load-bearing for whether ProjectionRegistryV1 should key off codebase_chunk_index.id (ephemeral) or codebase_chunk_index.chunk_id (durable) going forward.`,
      revisionComparability: `No revision-comparable column exists on codebase_chunk_index (only updated_at / embedding_created_at timestamps, no workspace_revision/source_revision analog). REVISION_DISAGREEMENT was therefore never evaluated as a bucket -- reporting it as "agrees" would be fabricated. ${revisionNotComparable} EXACT_INDEX_ID_MATCH rows had this check skipped, not silently passed.`,
    },
    samples: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.slice(0, 5)])),
  };

  console.log(JSON.stringify({ ...report, samples: undefined }, null, 2));
  const fs = await import('node:fs');
  fs.writeFileSync(
    'C:/Users/james/Videos/deeds-web-app/docs/reports/packet-chunk-resolve-01a-results.json',
    JSON.stringify({
      ...report,
      fullBuckets: buckets,
    }, null, 2) + '\n',
  );
  await pool.end();
  process.exit(0);
}

main().catch((err) => { console.error('[FAIL]', err); process.exit(1); });
