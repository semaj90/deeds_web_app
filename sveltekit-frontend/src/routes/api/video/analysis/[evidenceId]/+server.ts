/**
 * GET /api/video/analysis/[evidenceId]
 * Retrieve video analysis including VLM frame analysis, transcription, and metadata
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
			return json({ error: 'Video evidence not found' }, { status: 404 });
		}

		const videoEvidence = rows[0];
		let metadata: Record<string, unknown> = {};
		try {
			const raw = videoEvidence.metadata;
			metadata = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? {});
		} catch { /* use empty */ }

		// Extract video-specific analysis from metadata
		const transcription = metadata.transcription || null; // Audio track transcription
		const vlmAnalysis = metadata.vlmAnalysis || null; // Gemma4 VLM frame analysis
		const frameAnalysis = metadata.frameAnalysis || []; // Per-frame VLM results
		const sceneDetection = metadata.sceneDetection || []; // Scene boundaries
		const entities = metadata.entities || [];
		const aceAnalysis = metadata.aceAnalysis || null;
		const videoMetadata = metadata.videoMetadata || {}; // Duration, resolution, codec, etc.
		const processingStatus = metadata.processingStatus || 'unknown';

		return json({
			evidenceId: videoEvidence.id,
			title: videoEvidence.title,
			fileName: videoEvidence.file_name,
			filePath: videoEvidence.file_path,
			fileSize: videoEvidence.file_size,
			mimeType: videoEvidence.mime_type,
			processingStatus,
			transcription, // Audio transcription (if video has audio)
			vlmAnalysis, // Overall VLM summary
			frameAnalysis, // Array of { timestamp, framePath, description, objects, tags }
			sceneDetection, // Array of { startTime, endTime, description }
			entities, // Extracted from transcription + VLM
			aceAnalysis, // ACE analysis of combined audio + visual
			videoMetadata, // { duration, width, height, codec, fps, bitrate }
			createdAt: videoEvidence.created_at,
			updatedAt: videoEvidence.updated_at
		});
	} catch (error) {
		console.error('Error fetching video analysis:', error);
		return json({
      evidenceId,
      title: '',
      fileName: '',
      filePath: '',
      fileSize: 0,
      mimeType: '',
      processingStatus: 'error',
      transcription: null,
      vlmAnalysis: null,
      frameAnalysis: [],
      sceneDetection: [],
      entities: [],
      aceAnalysis: null,
      videoMetadata: {},
      createdAt: null,
      updatedAt: null,
    });
	}
};