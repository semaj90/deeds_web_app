/**
 * GET /api/audio/analysis/[evidenceId]
 * Retrieve audio transcription and analysis data
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
			return json({ error: 'Audio evidence not found' }, { status: 404 });
		}

		const audioEvidence = rows[0];
		let metadata: Record<string, unknown> = {};
		try {
			const raw = audioEvidence.metadata;
			metadata = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {});
		} catch {
			// metadata not parseable — use empty
		}

		// Extract transcription, entities, and ACE analysis from metadata
		const transcription = metadata.transcription || null;
		const entities = metadata.entities || [];
		const aceAnalysis = metadata.aceAnalysis || null;
		const processingStatus = metadata.processingStatus || 'unknown';

		return json({
			evidenceId: audioEvidence.id,
			title: audioEvidence.title,
			fileName: audioEvidence.file_name,
			filePath: audioEvidence.file_path,
			fileSize: audioEvidence.file_size,
			mimeType: audioEvidence.mime_type,
			processingStatus,
			transcription,
			entities,
			aceAnalysis,
			createdAt: audioEvidence.created_at,
			updatedAt: audioEvidence.updated_at
		});
	} catch (error) {
		console.error('Error fetching audio analysis:', error);
		return json(
			{
				error: 'Failed to load audio analysis',
				evidenceId,
				processingStatus: 'error',
				transcription: null,
				entities: [],
				aceAnalysis: null
			},
			{ status: 200 }
		);
	}
};
