/**
 * POST /api/evidence/[id]/vlm-analyze
 * Runs VLM (Vision Language Model) analysis on an existing evidence file.
 * Fetches the file from MinIO, passes to 3-tier VLM pipeline (Triton → TurboQuant → Ollama).
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { getFile } from '$lib/server/minio-client.js';
import { ENV } from '$lib/server/env.server.js';
import { isUuid } from '$lib/server/validation.js';

const EVIDENCE_BUCKET = ENV.MINIO_EVIDENCE_BUCKET;

function extractObjectKey(fileUrl: string): { bucket: string; key: string } | null {
	if (!fileUrl) return null;
	if (fileUrl.startsWith('minio://')) {
		const rest = fileUrl.slice('minio://'.length);
		const slashIdx = rest.indexOf('/');
		if (slashIdx === -1) return null;
		return { bucket: rest.slice(0, slashIdx), key: rest.slice(slashIdx + 1) };
	}
	if (fileUrl.startsWith('http')) {
		try {
			const url = new URL(fileUrl);
			const parts = url.pathname.split('/').filter(Boolean);
			if (parts.length >= 2) return { bucket: parts[0], key: parts.slice(1).join('/') };
		} catch {
			/* invalid URL */
		}
	}
	if (fileUrl.includes('/')) return { bucket: EVIDENCE_BUCKET, key: fileUrl };
	return null;
}

export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const evidenceId = params.id;
	if (!isUuid(evidenceId)) return json({ error: 'Invalid evidence ID' }, { status: 400 });

	// Look up evidence record
	const [row] = await db
		.select({
			fileUrl: evidence.fileUrl,
			fileName: evidence.fileName,
			mimeType: evidence.mimeType,
			title: evidence.title,
		})
		.from(evidence)
		.where(eq(evidence.id, evidenceId))
		.limit(1);

	if (!row) return json({ error: 'Evidence not found' }, { status: 404 });

	const fileUrl = row.fileUrl ?? row.fileName;
	if (!fileUrl) return json({ error: 'No file associated with this evidence' }, { status: 400 });

	const parsed = extractObjectKey(fileUrl);
	if (!parsed) return json({ error: 'Cannot resolve file location' }, { status: 400 });

	// Parse optional request body
	let promptOverride: string | undefined;
	let detectionContext: string | undefined;
	let skipCache = false;
	try {
		const body = await request.json();
		promptOverride = body.promptOverride;
		detectionContext = body.detectionContext;
		skipCache = body.skipCache === true;
	} catch {
		// No body or invalid JSON — use defaults
	}

	try {
		const buffer = await getFile(parsed.bucket, parsed.key);

		const { analyzeEvidenceImage } = await import(
			'$lib/server/analysis/vlm-evidence-analyzer.js'
		);

		const result = await analyzeEvidenceImage({
			buffer,
			fileName: row.fileName ?? row.title ?? 'evidence',
			detectionContext,
			promptOverride,
			skipCache,
		});

		// Persist AI analysis to evidence record
		await db
			.update(evidence)
			.set({
				aiAnalysis: result,
				aiTags: result.suggestedTags,
				aiSummary: result.summary,
				updatedAt: new Date(),
			})
			.where(eq(evidence.id, evidenceId))
			.catch((err) => console.warn('[VLM] DB update failed:', err));

		return json({ success: true, analysis: result });
	} catch (err) {
		console.error('[VLM] Evidence analysis failed:', err);
		return json({ error: 'VLM analysis failed' }, { status: 500 });
	}
};
