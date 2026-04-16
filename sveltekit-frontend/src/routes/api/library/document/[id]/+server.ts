import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';
import { isUuid } from '$lib/server/validation.js';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = params;
  if (!isUuid(id)) return json({ error: 'Invalid ID format' }, { status: 400 });

  const [documentResult, versionsResult] = await Promise.all([
    pool.query(
      `SELECT ld.*, j.name AS jurisdiction_name, j.code AS jurisdiction_code,
			        COALESCE(nc.c, 0)::int AS node_count,
			        COALESCE(cc.c, 0)::int AS chunk_count
			 FROM library_documents ld
			 LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
			 LEFT JOIN LATERAL (SELECT count(*) AS c FROM legal_nodes WHERE document_id = ld.id) nc ON true
			 LEFT JOIN LATERAL (
			 	SELECT count(*) AS c
			 	FROM legal_chunks lc
			 	JOIN legal_nodes ln ON ln.id = lc.legal_node_id
			 	WHERE ln.document_id = ld.id
			 ) cc ON true
			 WHERE ld.id = $1 AND (ld.uploaded_by IS NULL OR ld.uploaded_by = $2)`,
      [id, locals.user.id]
    ),
    pool.query(
      `SELECT id, version_label, source_date, is_current, amendment_note, created_at
			 FROM library_document_versions
			 WHERE document_id = $1
			 ORDER BY created_at DESC`,
      [id]
    ),
  ]).catch(() => [{ rows: [] }, { rows: [] }]);

  if (!documentResult.rows[0]) {
    return json({ error: 'Document not found' }, { status: 404 });
  }

  const row = documentResult.rows[0];

  return json(
    {
      document: {
        id: row.id,
        title: row.title,
        shortTitle: row.short_title,
        citation: row.citation,
        corpusType: row.corpus_type,
        sourceType: row.source_type,
        processingStatus: row.processing_status,
        pageCount: row.page_count,
        wordCount: row.word_count ?? null,
        effectiveDate: row.effective_date,
        isOfficial: row.is_official,
        officialUrl: row.official_url,
        sourceConfidence: row.source_confidence,
        sourceHash: row.source_hash,
        mimeType: row.mime_type,
        minioKey: row.minio_key,
        nodeCount: row.node_count,
        chunkCount: row.chunk_count,
        createdAt: row.created_at,
        jurisdiction: row.jurisdiction_code
          ? { code: row.jurisdiction_code, name: row.jurisdiction_name }
          : null,
      },
      versions: versionsResult.rows.map((version: Record<string, unknown>) => ({
        id: version.id,
        versionLabel: version.version_label,
        sourceDate: version.source_date,
        isCurrent: version.is_current,
        amendmentNote: version.amendment_note,
        createdAt: version.created_at,
      })),
    },
    { headers: cacheControl.long }
  );
};