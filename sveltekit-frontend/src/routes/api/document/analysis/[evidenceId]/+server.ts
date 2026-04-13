/**
 * GET /api/document/analysis/[evidenceId]
 * Retrieve document analysis including text extraction, ACE analysis, and metadata
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user && process.env.DEV_BYPASS_AUTH !== 'true') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { evidenceId } = params;

	if (!UUID_RE.test(evidenceId)) {
		return json({ error: 'Invalid evidence ID' }, { status: 400 });
	}

	try {
		// Use raw query with proper column names (snake_case in DB)
		const query = `
      SELECT
        id,
        title,
        file_name,
        file_path,
        file_size,
        mime_type,
        evidence_type,
        metadata,
        created_at,
        updated_at
      FROM evidence
      WHERE id = $1
      LIMIT 1
    `;

		const result = await pool.query(query, [evidenceId]);
		const rows = result.rows;

		if (!rows || rows.length === 0) {
			return json({ error: 'Document evidence not found' }, { status: 404 });
		}

		const docEvidence = rows[0];
		let metadata: Record<string, unknown> = {};
		try {
			const raw = docEvidence.metadata;
			metadata = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {});
		} catch { /* use empty */ }

		// Extract document-specific analysis from metadata
		const extractedText = metadata.extractedText || null;
		const textLength = (typeof extractedText === 'string' ? extractedText.length : 0);
		const pageCount = metadata.pageCount || 0;
		const chunks = metadata.chunks || [];
		const entities = metadata.entities || [];
		const aceAnalysis = metadata.aceAnalysis || null;
		const citations = metadata.citations || [];
		const statutes = metadata.statutes || [];
		const keyTerms = metadata.keyTerms || [];
		const documentMetadata = metadata.documentMetadata || {};
		const processingStatus = metadata.processingStatus || 'unknown';

		return json({
			evidenceId: docEvidence.id,
			title: docEvidence.title,
			fileName: docEvidence.file_name,
			filePath: docEvidence.file_path,
			fileSize: docEvidence.file_size,
			mimeType: docEvidence.mime_type,
			processingStatus,
			extractedText,
			textLength,
			pageCount,
			chunks, // Array of { text, chunkIndex, embedding }
			entities, // Extracted legal entities
			aceAnalysis, // ACE summary/tags/claims
			citations, // Legal citations found
			statutes, // Statute references
			keyTerms, // Important legal terms
			documentMetadata, // { author, createdDate, modifiedDate, application }
			createdAt: docEvidence.created_at,
			updatedAt: docEvidence.updated_at
		});
	} catch (error) {
		console.error('Error fetching document analysis:', error);
		return json(
			{
				error: 'Failed to load document analysis',
				evidenceId,
				processingStatus: 'error',
				extractedText: null,
				textLength: 0,
				pageCount: 0,
				chunks: [],
				entities: [],
				aceAnalysis: null,
				citations: [],
				statutes: [],
				keyTerms: [],
				documentMetadata: {}
			},
			{ status: 200 }
		);
	}
};
