/**
 * Inert PostgreSQL adapter for canonical chunk-embedding admission (CEI-16b-02/05).
 * No pool, environment or connection is created here; the caller injects them. Nothing in the repo
 * calls this yet, so it cannot write. Qualification uses binding + proven packet->chunk lineage read
 * inside the same SERIALIZABLE transaction (chunk mirror revision columns may be null and are not
 * relied on). `atlas_workspace_source_bindings.repo_id` is TEXT (e.g. 'deeds-web-app'), not uuid.
 */
import { createHash } from 'node:crypto';

const sha = (v) => `sha256:${createHash('sha256').update(v, 'utf8').digest('hex')}`;
const one = (rows) => (rows.length === 1 ? rows[0] : null);
const asHex = (d) => (typeof d === 'string' ? (d.startsWith('sha256:') ? d : `sha256:${d}`) : null);
export const parseHalfvecText = (t) => (typeof t === 'string' ? JSON.parse(t) : t);

export function createPostgresChunkEmbeddingAdmissionRepositoryV1({ pool, repoId, formatSummaryInput = null }) {
  if (!pool || typeof pool.connect !== 'function') throw new Error('INJECTED_POSTGRES_POOL_REQUIRED');
  if (typeof repoId !== 'string' || !repoId) throw new Error('BINDING_REPO_ID_REQUIRED');

  return {
    async transaction(run) {
      const client = await pool.connect();
      let began = false;
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        began = true;
        const tx = {
          async getAdmissionEvidence(plan) {
            const chunk = one((await client.query(`
              SELECT id::text AS "chunkRowId", chunk_id AS "chunkId", source_ref AS "sourceRef", content,
                     summary_text AS "summaryText", summary_provenance AS "summaryProvenance"
                FROM public.codebase_chunk_index WHERE id = $1::uuid FOR UPDATE`, [plan.chunkRowId])).rows);
            if (!chunk) return null;
            const b = await client.query(`
              SELECT workspace_revision AS "workspaceRevision", source_revision AS "sourceRevision", content_digest AS "contentDigest"
                FROM public.atlas_workspace_source_bindings
               WHERE repo_id = $1 AND workspace_revision = $2 AND canonical_source_ref = $3 AND source_revision = $4`,
            [repoId, plan.workspaceRevision, plan.sourceRef, plan.sourceRevision]);
            const l = await client.query(`
              SELECT canonical_chunk_id AS "canonicalChunkId"
                FROM public.atlas_packet_chunk_lineage
               WHERE chunk_row_id = $1::uuid AND canonical_chunk_id = $2 AND source_ref = $3
                 AND source_revision = $4 AND revision_status = 'PROVEN'`,
            [plan.chunkRowId, plan.canonicalChunkId, plan.sourceRef, plan.sourceRevision]);
            const binding = one(b.rows); const lineage = one(l.rows);
            const sp = chunk.summaryProvenance ?? null;
            return {
              chunkRowId: chunk.chunkRowId, chunkId: chunk.chunkId, sourceRef: chunk.sourceRef,
              canonicalChunkId: lineage?.canonicalChunkId ?? null,
              sourceRevision: binding?.sourceRevision ?? null, workspaceRevision: binding?.workspaceRevision ?? null,
              sourceFileSha256: asHex(binding?.contentDigest),
              contentSha256: typeof chunk.content === 'string' ? sha(chunk.content) : null,
              revisionStatus: lineage ? 'PROVEN' : 'MISSING', bindingStatus: binding ? 'PROVEN' : 'MISSING',
              bindingMatchCount: b.rowCount, lineageMatchCount: l.rowCount,
              summaryText: chunk.summaryText, summaryProvenance: sp,
              summaryDigestRecomputed: typeof chunk.summaryText === 'string' ? sha(chunk.summaryText) : null,
              // formatter is injected; without one the summary input cannot be bound and the kernel blocks
              summaryInputSha256: typeof chunk.summaryText === 'string' && formatSummaryInput ? sha(formatSummaryInput(chunk)) : null,
            };
          },
          async readTarget(chunkRowId) {
            return one((await client.query(
              'SELECT content_embedding::text AS "contentEmbedding" FROM public.codebase_chunk_index WHERE id = $1::uuid FOR UPDATE', [chunkRowId])).rows);
          },
          async setEmbeddingIfEmpty({ chunkRowId, vector, model, version }) {
            return client.query(`
              UPDATE public.codebase_chunk_index
                 SET content_embedding = $2::halfvec(768), embedding_model = $3, embedding_version = $4,
                     embedding_dimension = 768, embedding_normalized = true,
                     embedding_created_at = COALESCE(embedding_created_at, NOW()), updated_at = NOW()
               WHERE id = $1::uuid AND content_embedding IS NULL
              RETURNING id`, [chunkRowId, `[${vector.join(',')}]`, model, version]);
          },
          async readBackEmbedding(chunkRowId) {
            const r = one((await client.query(`
              SELECT content_embedding::text AS v, embedding_model AS model, embedding_version AS version, embedding_dimension AS dimension
                FROM public.codebase_chunk_index WHERE id = $1::uuid`, [chunkRowId])).rows);
            return r ? { vector: parseHalfvecText(r.v), model: r.model, version: r.version, dimension: r.dimension } : null;
          },
        };
        const result = await run(tx);
        await client.query('COMMIT');
        began = false;
        return result;
      } catch (error) {
        if (began) { try { await client.query('ROLLBACK'); } catch { /* keep original failure */ } }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
