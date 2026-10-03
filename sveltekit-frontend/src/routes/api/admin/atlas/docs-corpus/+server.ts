/**
 * GET /api/admin/atlas/docs-corpus — DocIntelligenceStudioSnapshotV1 (READ ONLY).
 * Canonical owner: PostgreSQL atlas_external_doc_*. Local corpora are reference/generated only.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { pool } from '$lib/server/db/client';
import { requireAdmin } from '$lib/server/auth-utils';
import { buildDocIntelligenceStudioSnapshotV1 } from '$lib/server/atlas/docs/doc-intelligence-read-model.js';

export const GET: RequestHandler = async (event) => {
	requireAdmin(event);
	const snapshot = await buildDocIntelligenceStudioSnapshotV1({ pool });
	return json(snapshot, { headers: { 'Cache-Control': 'no-store' } });
};
