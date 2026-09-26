/**
 * Inert PostgreSQL adapter for canonical chunk-summary admission.
 * No pool, environment, or connection is created here; the caller injects them.
 */
import { createHash } from 'node:crypto';

const hashContent = (value) => createHash('sha256').update(value, 'utf8').digest('hex');
const one = (rows) => rows.length === 1 ? rows[0] : null;

export function createPostgresChunkSummaryAdmissionRepositoryV1({
  pool,
  repositoryUuid,
  identityRepositoryId,
  computeSourceIdentityKeyV1,
}) {
  if (!pool || typeof pool.connect !== 'function') throw new Error('INJECTED_POSTGRES_POOL_REQUIRED');
  if (typeof repositoryUuid !== 'string' || !repositoryUuid) throw new Error('POSTGRES_REPOSITORY_UUID_REQUIRED');
  if (typeof identityRepositoryId !== 'string' || !identityRepositoryId) throw new Error('CANONICAL_IDENTITY_REPOSITORY_ID_REQUIRED');
  if (typeof computeSourceIdentityKeyV1 !== 'function') throw new Error('CANONICAL_SOURCE_IDENTITY_OWNER_REQUIRED');

  return {
    async transaction(run) {
      const client = await pool.connect();
      let began = false;
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        began = true;
        const tx = {
          async getAdmissionEvidence(proposal) {
            const chunkResult = await client.query(`
              SELECT id::text AS "chunkRowId", chunk_id AS "chunkId", source_ref AS "sourceRef",
                     content, summary_text AS "summaryText", summary_provenance AS "summaryProvenance"
                FROM public.codebase_chunk_index
               WHERE id = $1::uuid
               FOR UPDATE
            `, [proposal.chunkRowId]);
            const chunk = one(chunkResult.rows);
            if (!chunk) return null;

            const bindingResult = await client.query(`
              SELECT workspace_revision AS "workspaceRevision", source_revision AS "sourceRevision",
                     binding_checksum AS "bindingChecksum"
                FROM public.atlas_workspace_source_bindings
               WHERE repo_id = $1::uuid
                 AND workspace_revision = $2
                 AND canonical_source_ref = $3
                 AND source_revision = $4
            `, [repositoryUuid, proposal.workspaceRevision, proposal.sourceRef, proposal.sourceRevision]);
            const binding = one(bindingResult.rows);

            const lineageResult = await client.query(`
              SELECT canonical_chunk_id AS "canonicalChunkId", source_ref AS "sourceRef",
                     source_revision AS "sourceRevision", revision_status AS "revisionStatus"
                FROM public.atlas_packet_chunk_lineage
               WHERE chunk_row_id = $1::uuid
                 AND canonical_chunk_id = $2
                 AND source_ref = $3
                 AND source_revision = $4
                 AND revision_status = 'PROVEN'
            `, [proposal.chunkRowId, proposal.chunkCanonicalId, proposal.sourceRef, proposal.sourceRevision]);
            const lineage = one(lineageResult.rows);
            const canonicalSourceIdentityKey = computeSourceIdentityKeyV1(identityRepositoryId, chunk.sourceRef);
            const content = chunk.content;
            const inputTextSha256 = typeof content === 'string' ? hashContent(content) : null;

            return {
              sourceIdentityKey: canonicalSourceIdentityKey,
              chunkRowId: chunk.chunkRowId,
              chunkId: chunk.chunkId,
              canonicalChunkId: lineage?.canonicalChunkId ?? proposal.chunkCanonicalId,
              sourceRef: chunk.sourceRef,
              sourceRevision: binding?.sourceRevision ?? null,
              workspaceRevision: binding?.workspaceRevision ?? null,
              revisionStatus: lineage ? 'PROVEN' : 'MISSING',
              bindingStatus: binding ? 'PROVEN' : 'MISSING',
              bindingChecksum: binding?.bindingChecksum ?? null,
              inputTextSha256,
              inputByteLength: typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : null,
              packetKey: null,
              bindingMatchCount: bindingResult.rowCount,
              lineageMatchCount: lineageResult.rowCount,
            };
          },
          async readCurrentTarget(chunkRowId) {
            const result = await client.query(`
              SELECT summary_text AS "summaryText", summary_provenance AS "summaryProvenance"
                FROM public.codebase_chunk_index
               WHERE id = $1::uuid
               FOR UPDATE
            `, [chunkRowId]);
            return one(result.rows);
          },
          async setSummaryIfEmpty({ chunkRowId, summaryText, summaryProvenance }) {
            return client.query(`
              UPDATE public.codebase_chunk_index
                 SET summary_text = $2,
                     summary_provenance = $3::jsonb
               WHERE id = $1::uuid
                 AND summary_text IS NULL
                 AND summary_provenance IS NULL
              RETURNING id
            `, [chunkRowId, summaryText, JSON.stringify(summaryProvenance)]);
          },
        };
        const result = await run(tx);
        await client.query('COMMIT');
        began = false;
        return result;
      } catch (error) {
        if (began) {
          try { await client.query('ROLLBACK'); } catch { /* retain the original failure */ }
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
