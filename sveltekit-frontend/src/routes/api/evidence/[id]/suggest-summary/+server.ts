import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { and, eq } from 'drizzle-orm';
import { LLAMA_SERVER_BASE_URL, LOCAL_VLM_MODEL } from '$lib/server/ai/local-llama-provider.js';
import { isUuid } from '$lib/server/validation.js';
import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';

/**
 * POST /api/evidence/[id]/suggest-summary
 * Generate an AI-suggested summary for an evidence item using the local llama server
 */
export const POST: RequestHandler = async ({ params, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const evidenceId = params.id;
  if (!isUuid(evidenceId)) return json({ error: 'Invalid evidence ID format' }, { status: 400 });

  try {
    const [item] = await db
      .select({
        id: evidence.id,
        title: evidence.title,
        description: evidence.description,
        summary: evidence.summary,
        evidenceType: evidence.evidenceType,
      })
      .from(evidence)
      .where(and(eq(evidence.id, evidenceId), eq(evidence.userId, Number(locals.user.id))))
      .limit(1);

    if (!item) {
      return json({ error: 'Evidence not found' }, { status: 404 });
    }

    const context = [item.title, item.description, item.summary].filter(Boolean).join('\n');

    let suggestedText = `Summary of "${item.title}": ${item.description ?? 'No description available.'}`;

    try {
      const ollamaRes = await fetch(`${LLAMA_SERVER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: LOCAL_VLM_MODEL,
          messages: [
            { role: 'system', content: 'You summarize evidence for legal review. Be concise and direct.' },
            { role: 'user', content: `Summarize this evidence item for a legal case review. Be concise (2-3 sentences).\n\nEvidence: ${context}` },
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
        if (content) suggestedText = content.trim();
      }
    } catch {
      // Local model unavailable — use basic summary
    }

    return json({
      summaryId: crypto.randomUUID(),
      evidenceId,
      suggestedText,
      confidence: 0.85,
      model: LLM_MODEL_ID,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[evidence/${evidenceId}/suggest-summary] error:`, err);
    return json({ error: 'Failed to generate summary' }, { status: 500 });
  }
};
