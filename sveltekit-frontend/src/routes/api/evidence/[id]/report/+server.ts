import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { and, eq } from 'drizzle-orm';
import { LLAMA_SERVER_BASE_URL, LOCAL_VLM_MODEL } from '$lib/server/ai/local-llama-provider.js';
import { isUuid } from '$lib/server/validation.js';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';

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
      .where(and(eq(evidence.id, evidenceId), eq(evidence.userId, Number(locals.user.id))))
      .limit(1);

    if (!item) {
      return json({ error: 'Evidence not found' }, { status: 404 });
    }

    const meta = (item.metadata as Record<string, unknown>) ?? {};
    const aiAnalysis = (item.aiAnalysis as Record<string, unknown>) ?? {};

    let aiSummary = item.summary ?? '';
    if (!aiSummary) {
      try {
        const ollamaRes = await fetch(`${LLAMA_SERVER_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: LOCAL_VLM_MODEL,
            messages: [
              { role: 'system', content: 'You write brief forensic analysis reports for evidence items.' },
              {
                role: 'user',
                content: `Write a brief forensic analysis report (3-4 sentences) for this evidence item:\nTitle: ${item.title}\nType: ${item.type ?? item.evidenceType ?? 'unknown'}\nDescription: ${item.description ?? 'N/A'}\nSource: ${item.source ?? 'N/A'}`,
              },
            ],
            stream: false,
            temperature: 0.2,
            max_tokens: 256,
          }),
          signal: AbortSignal.timeout(30_000),
        });
        if (ollamaRes.ok) {
          const data = await ollamaRes.json();
          const content = data.choices?.[0]?.message?.content ?? '';
          if (content) aiSummary = content.trim();
        }
      } catch {
        aiSummary = `Evidence item "${item.title}" — ${item.type ?? 'unclassified'} evidence collected ${item.collectedAt ? `on ${new Date(item.collectedAt).toLocaleDateString()}` : 'at unknown date'}.`;
      }
    }

    return json(
      {
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
      },
      { headers: cacheControl.medium }
    );
  } catch (err) {
    console.error(`[evidence/${evidenceId}/report] error:`, err);
    return json(
      {
        id: evidenceId,
        title: '',
        type: 'document_analysis',
        status: 'pending',
        priority: 'medium',
        createdAt: null,
        updatedAt: null,
        evidence: null,
        analysis: { summary: '', confidence: 0, entities: [], patterns: [] },
        metadata: {},
      },
      { headers: cacheControl.medium }
    );
  }
};
