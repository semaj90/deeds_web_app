import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { findRepoRoot, searchDocCorpus } from '../../src/lib/server/atlas/docs/doc-intelligence-read-model.js';
import { readVerifiedCanonicalDocChunksV1 } from '../../src/lib/server/atlas/docs/external-doc-citation-readback-v1.js';
import { canonicalSha256V1 } from '../../src/lib/server/atlas/prefill/canonical-hash-v1.js';

// Questions are authored independently of retrieval scores. Search hints are
// only for building the review pool and are excluded from benchmark queries.
const topics = {
  pgvector: [
    ['What does iterative HNSW scanning do when a filter removes too many candidates?', 'hnsw.iterative_scan'],
    ['What limits memory for an iterative HNSW scan?', 'hnsw.scan_mem_multiplier'],
    ['Which setting limits tuples visited by iterative HNSW scans?', 'hnsw.max_scan_tuples'],
    ['How do I adjust the search candidate list for HNSW?', 'hnsw.ef_search'],
    ['How does pgvector represent half precision vectors?', 'halfvec'],
    ['Which operator returns cosine distance?', 'cosine distance'],
    ['How do I build an IVFFlat cosine index?', 'ivfflat vector_cosine_ops'],
    ['How do IVFFlat probes affect query speed and recall?', 'ivfflat.probes'],
  ],
  postgresql: [
    ['What does the io_mode setting control?', 'io_mode'],
    ['When does the planner use a bitmap heap scan?', 'Bitmap Heap Scan'],
    ['What does uuidv7 encode about time?', 'uuidv7'],
    ['How can I inspect buffer usage for a query?', 'EXPLAIN BUFFERS'],
    ['How do I turn a user search string into a text-search query?', 'websearch_to_tsquery'],
    ['When does cover density influence full-text ranking?', 'ts_rank_cd'],
    ['Which operator matches a text vector against a search query?', 'tsvector tsquery'],
    ['What is an index-only scan?', 'Index Only Scan'],
  ],
  'drizzle-kit': [
    ['What does Drizzle Kit generate from schema changes?', 'drizzle-kit generate'],
    ['Which command applies existing migration files?', 'drizzle-kit migrate'],
    ['Which command applies schema changes directly?', 'drizzle-kit push'],
    ['How can Drizzle Kit introspect an existing database?', 'drizzle-kit pull'],
    ['Where does the migration output directory get configured?', 'out'],
    ['How do I launch the Drizzle Studio UI?', 'drizzle-kit studio'],
  ],
  svelte: [
    ['How are derived values declared with runes?', '$derived'],
    ['How does a component declare incoming props?', '$props'],
    ['What does the state rune make reactive?', '$state'],
    ['How is a snippet rendered?', '@render'],
    ['What does an effect track to decide when to run again?', '$effect'],
    ['How do I opt a component prop into two-way binding?', '$bindable'],
    ['How do I create an immutable view of a reactive proxy?', '$state.snapshot'],
    ['How can I attach a function to an element using an action?', 'use action'],
  ],
} as const;

const output = process.argv[2];
if (!output || !process.env.DATABASE_URL) throw new Error('DOC14_OUTPUT_PATH_AND_DATABASE_URL_REQUIRED');
const root = findRepoRoot();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5s'");
    const queries = [];
    for (const [product, questions] of Object.entries(topics)) {
      for (const [idx, [question, hint]] of questions.entries()) {
        const candidates = new Map<string, { ranks: Record<string, number>; citation: unknown; relevanceGrade: null; citationSupported: null }>();
        const lanes: Record<string, unknown> = {};
        for (const [lane, q] of [['questionFts', question], ['reviewHintFts', hint]]) {
          const result = await searchDocCorpus({
            pool: client, root, q, limit: 5, product, canonicalOfficialOnly: true,
          });
          if (result.postgresNote) throw new Error('DOC14_POSTGRES_SEARCH_UNAVAILABLE');
          if (!result.hits.length) {
            lanes[lane] = { status: 'NO_RESULTS', orderedChunkIds: [] };
            continue;
          }
          const readback = await readVerifiedCanonicalDocChunksV1({ pool: client, hits: result.hits });
          if (readback.status !== 'VERIFIED' || readback.citations.length !== result.hits.length) {
            throw new Error('DOC14_CANDIDATE_READBACK_BLOCKED');
          }
          const orderedChunkIds = readback.citations.map((citation, index) => {
            const row = candidates.get(citation.chunkId) ?? {
              ranks: {}, citation, relevanceGrade: null, citationSupported: null,
            };
            row.ranks[lane] = index + 1;
            candidates.set(citation.chunkId, row);
            return citation.chunkId;
          });
          lanes[lane] = { status: 'VERIFIED', orderedChunkIds };
        }
        queries.push({
          queryId: `doc14-${product}-${idx + 1}`, question, product,
          split: product === 'svelte' || product === 'drizzle-kit' ? 'held_out' : 'train',
          lanes, candidates: [...candidates.values()], reviewStatus: 'PENDING_HUMAN_REVIEW',
          reviewerRef: null, answerable: null,
        });
      }
    }
    await client.query('COMMIT');
    const body = {
      schema: 'atlas.doc14-official-doc-review-pool.v1',
      reviewStatus: 'PENDING_HUMAN_REVIEW',
      retrievalPolicyRevision: 'postgres-official-fts-v1',
      splitUnit: 'product',
      reviewHintUse: 'CANDIDATE_DISCOVERY_ONLY',
      unrunLanes: ['dense', 'graph'],
      queries,
      canonicalAuthority: false,
      writesPerformed: false,
    };
    const poolChecksum = `sha256:${canonicalSha256V1(body)}`;
    writeFileSync(resolve(output), JSON.stringify({ ...body, poolChecksum }, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({
      status: 'PENDING_HUMAN_REVIEW', queries: queries.length,
      candidateOccurrences: queries.reduce((n, q) => n + q.candidates.length, 0),
      queriesWithoutCandidates: queries.filter((q) => !q.candidates.length).length,
      poolChecksum,
    }));
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
