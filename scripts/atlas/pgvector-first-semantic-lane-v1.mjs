// pgvector-first semantic candidate lane (additive, behind ATLAS_PGVECTOR_FIRST_LANE=1).
// Candidate executor only: it never fuses, never votes in SearchRuntime, and never changes the
// default retrieval path. Reads codebase_chunk_index.content_embedding_768 (full coverage) with the
// HNSW index; ef_search is set per transaction. Candidates whose source or workspace revision is
// not admitted are returned flagged UNADMITTED_REVISION, never silently dropped or defaulted.
export const PGVECTOR_FIRST_LANE_FLAG = 'ATLAS_PGVECTOR_FIRST_LANE';
export const EMBEDDING_DIMENSION = 768;
export const EF_SEARCH_MIN = 1;
export const EF_SEARCH_MAX = 1000;
export const LIMIT_MAX = 200;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;

export function isPgvectorFirstLaneEnabled(env = process.env) {
  return env[PGVECTOR_FIRST_LANE_FLAG] === '1';
}

export function validateQueryVector(vector) {
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSION) throw new Error('PGVECTOR_LANE_DIMENSION_INVALID');
  for (const v of vector) {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('PGVECTOR_LANE_VECTOR_NOT_FINITE');
  }
  return vector;
}

export function validateLaneArgs({ limit = 10, efSearch = 100 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > LIMIT_MAX) throw new Error('PGVECTOR_LANE_LIMIT_INVALID');
  if (!Number.isInteger(efSearch) || efSearch < EF_SEARCH_MIN || efSearch > EF_SEARCH_MAX) throw new Error('PGVECTOR_LANE_EF_SEARCH_INVALID');
  return { limit, efSearch };
}

export function toVectorLiteral(vector) {
  return `[${vector.map((v) => String(v)).join(',')}]`;
}

// Parameterized SQL only. No string interpolation of caller data.
export function buildPgvectorFirstQuery({ queryVector, limit = 10, efSearch = 100 } = {}) {
  validateQueryVector(queryVector);
  const args = validateLaneArgs({ limit, efSearch });
  return {
    setEfSearch: { text: 'SELECT set_config($1, $2, true)', values: ['hnsw.ef_search', String(args.efSearch)] },
    text: `SELECT id::text AS id, source_ref, source_revision, workspace_revision,
                  1 - (content_embedding_768 <=> $1::vector) AS score
           FROM codebase_chunk_index
           WHERE content_embedding_768 IS NOT NULL
           ORDER BY content_embedding_768 <=> $1::vector ASC, id ASC
           LIMIT $2`,
    values: [toVectorLiteral(queryVector), args.limit],
  };
}

export function classifyRevisions(row) {
  const admitted = typeof row.source_revision === 'string' && SHA256_RE.test(row.source_revision)
    && typeof row.workspace_revision === 'string' && SHA256_RE.test(row.workspace_revision);
  return admitted ? 'ADMITTED' : 'UNADMITTED_REVISION';
}

// Runs the lane inside one READ ONLY transaction. The client is injected (pg.Client-like).
export async function runPgvectorFirstLane(client, { queryVector, limit = 10, efSearch = 100 } = {}, env = process.env) {
  if (!isPgvectorFirstLaneEnabled(env)) return { status: 'DISABLED', candidates: [] };
  const q = buildPgvectorFirstQuery({ queryVector, limit, efSearch });
  await client.query('BEGIN READ ONLY');
  try {
    await client.query(q.setEfSearch.text, q.setEfSearch.values);
    const res = await client.query(q.text, q.values);
    await client.query('COMMIT');
    const candidates = res.rows.map((row) => ({
      id: row.id,
      sourceRef: row.source_ref,
      sourceRevision: row.source_revision,
      workspaceRevision: row.workspace_revision,
      score: Number(row.score),
      revisionStatus: classifyRevisions(row),
      lane: 'pgvector_first_768',
      canonicalAuthority: false,
    }));
    return { status: 'OK', candidates };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}
