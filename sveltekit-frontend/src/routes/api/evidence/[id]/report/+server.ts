import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { isUuid } from '$lib/server/validation.js';

/**
 * GET /api/evidence/[id]/report
 * Generate an evidence analysis report for a single evidence item
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const evidenceId = params.id;
	if (!isUuid(evidenceId)) return json({ error: 'Invalid evidence ID format' }, { status: 400 });

	try {
		const [item] = await db
			.select()
			.from(evidence)
			.where(eq(evidence.id, evidenceId))
			.limit(1);

		if (!item) {
			return json({ error: 'Evidence not found' }, { status: 404 });
		}

		const meta = (item.metadata as Record<string, unknown>) ?? {};
		const aiAnalysis = (item.aiAnalysis as Record<string, unknown>) ?? {};

		let aiSummary = item.summary ?? '';
		if (!aiSummary) {
			try {
				const { ollamaFetch } = await import('$lib/server/ollama.js');
				const ollamaRes = await ollamaFetch('/api/generate', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: 'gemma3-legal:latest',
						prompt: `Write a brief forensic analysis report (3-4 sentences) for this evidence item:\nTitle: ${item.title}\nType: ${item.type ?? item.evidenceType ?? 'unknown'}\nDescription: ${item.description ?? 'N/A'}\nSource: ${item.source ?? 'N/A'}`,
						stream: false,
						keep_alive: '24h',
					}),
				});
				if (ollamaRes.ok) {
					const data = await ollamaRes.json();
					if (data.response) aiSummary = data.response.trim();
				}
			} catch {
				aiSummary = `Evidence item "${item.title}" — ${item.type ?? 'unclassified'} evidence collected ${item.collectedAt ? `on ${new Date(item.collectedAt).toLocaleDateString()}` : 'at unknown date'}.`;
			}
		}

		return json({
			id: evidenceId,
			title: item.title,
			type: 'document_analysis',
			status: meta.reviewStatus ?? 'pending',
			priority: 'medium',
			createdAt: item.createdAt,
			updatedAt: item.updatedAt,
			evidence: {
				id: item.id,
				title: item.title,
				description: item.description,
				type: item.type,
				evidenceType: item.evidenceType,
				fileName: item.fileName,
				fileType: item.fileType,
				fileSize: item.fileSize,
				source: item.source,
				collectedAt: item.collectedAt,
				collectedBy: item.collectedBy,
				tags: item.tags,
				aiTags: item.aiTags,
			},
			analysis: {
				summary: aiSummary,
				confidence: aiAnalysis.confidence ?? 0.75,
				entities: aiAnalysis.entities ?? [],
				patterns: aiAnalysis.patterns ?? [],
			},
			metadata: meta,
		});
	} catch (err) {
		console.error(`[evidence/${evidenceId}/report] error:`, err);
		return json({ error: 'Failed to generate report' }, { status: 500 });
	}
};
