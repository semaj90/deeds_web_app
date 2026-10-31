import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { and, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';
import { resolveLlamaInferenceTarget } from '$lib/server/llm/runtime-contract.js';

const generatedSummarySchema = z.string().trim().min(40).max(2_000);

function boundedEvidenceContext(input: {
	extractedText: string | null;
	summary: string | null;
	title: string;
	description: string | null;
}): { text: string; source: 'extracted_text' | 'stored_summary' | 'metadata' } {
	const extractedText = input.extractedText?.trim();
	if (extractedText) {
		const maxChars = 24_000;
		const text = extractedText.length <= maxChars
			? extractedText
			: `${extractedText.slice(0, 18_000)}\n\n[Middle of document omitted]\n\n${extractedText.slice(-6_000)}`;
		return { text, source: 'extracted_text' };
	}
	const storedSummary = input.summary?.trim();
	if (storedSummary) return { text: storedSummary.slice(0, 4_000), source: 'stored_summary' };
	return {
		text: [input.title, input.description].filter(Boolean).join('\n').slice(0, 4_000),
		source: 'metadata',
	};
}

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
        extractedText: evidence.extractedText,
        evidenceType: evidence.evidenceType,
      })
      .from(evidence)
      .where(and(
        eq(evidence.id, evidenceId),
        or(eq(evidence.uploadedBy, Number(locals.user.id)), eq(evidence.userId, Number(locals.user.id))),
      ))
      .limit(1);

    if (!item) {
      return json({ error: 'Evidence not found' }, { status: 404 });
    }

    const context = boundedEvidenceContext(item);
    if (!context.text.trim()) {
      return json({ error: 'No extracted evidence text or description is available to summarize' }, { status: 422 });
    }

    let suggestedText = `${context.text.slice(0, 500)}${context.text.length > 500 ? '…' : ''}`;
    let model = 'excerpt-fallback';
    let generated = false;

    try {
      const target = await resolveLlamaInferenceTarget();
      const llamaRes = await fetch(`${target.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: target.model,
          messages: [
            { role: 'system', content: 'Summarize only the supplied evidence. Do not infer facts absent from it. Separate established facts from uncertainty. This is an informational summary, not legal advice.' },
            { role: 'user', content: `Write a clear 2-3 sentence summary of this ${item.evidenceType ?? 'evidence'} item. Prioritize the extracted document text; use metadata only as context.\n\nTitle: ${item.title}\nContext source: ${context.source}\nEvidence text:\n${context.text}` },
          ],
          stream: false,
          temperature: 0.2,
          max_tokens: 256,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (llamaRes.ok) {
        const data = await llamaRes.json();
        const parsed = generatedSummarySchema.safeParse(data.choices?.[0]?.message?.content ?? '');
        if (parsed.success) {
          suggestedText = parsed.data;
          model = target.model;
          generated = true;
        }
      }
    } catch {
      // Return a clearly labeled excerpt when the configured inference runtime is unavailable.
    }

    return json({
      summaryId: crypto.randomUUID(),
      evidenceId,
      suggestedText,
      confidence: generated ? 0.85 : 0,
      model,
      generated,
      contextSource: context.source,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[evidence/${evidenceId}/suggest-summary] error:`, err);
    return json({ error: 'Failed to generate summary' }, { status: 500 });
  }
};
