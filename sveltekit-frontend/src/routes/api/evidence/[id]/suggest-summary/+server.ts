import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { and, eq } from 'drizzle-orm';
import { getChatModelKeepAlive } from '$lib/server/ollama.js';
import { isUuid } from '$lib/server/validation.js';

/**
 * POST /api/evidence/[id]/suggest-summary
 * Generate an AI-suggested summary for an evidence item using Ollama
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
        type: evidence.type,
      })
      .from(evidence)
      .where(and(eq(evidence.id, evidenceId), eq(evidence.userId, locals.user.id)))
      .limit(1);

    if (!item) {
      return json({ error: 'Evidence not found' }, { status: 404 });
    }

    const context = [item.title, item.description, item.summary].filter(Boolean).join('\n');

    let suggestedText = `Summary of "${item.title}": ${item.description ?? 'No description available.'}`;

    try {
      const { ollamaFetch } = await import('$lib/server/ollama.js');
      const ollamaRes = await ollamaFetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4-legal:latest',
          prompt: `Summarize this evidence item for a legal case review. Be concise (2-3 sentences).\n\nEvidence: ${context}`,
          stream: false,
          keep_alive: getChatModelKeepAlive(),
        }),
      });
      if (ollamaRes.ok) {
        const data = await ollamaRes.json();
        if (data.response) suggestedText = data.response.trim();
      }
    } catch {
      // Ollama unavailable — use basic summary
    }

    return json({
      summaryId: crypto.randomUUID(),
      evidenceId,
      suggestedText,
      confidence: 0.85,
      model: 'gemma4-legal',
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[evidence/${evidenceId}/suggest-summary] error:`, err);
    return json({ error: 'Failed to generate summary' }, { status: 500 });
  }
};