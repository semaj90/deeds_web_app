/**
 * GET /api/evidence/[id]/analyze/stream
 *
 * Server-Sent Events route for streaming Gemma4 analysis of a single evidence item.
 * Phase 3 Item #6 from sveltekit-frontend/next_steps_research.md.
 *
 * Pipeline:
 *   1. UUID-validate params.id; require event.locals.user
 *   2. Load evidence row from Postgres (title/summary/mimeType/fileType/extractedText)
 *   3. Build a legal-analysis prompt with the evidence context
 *   4. Stream Gemma4 tokens via the existing llmRouter.generateStream() cascade
 *   5. On `done`, INSERT a row into evidence_audit_log (action='analyzed') with
 *      the full analysis text + duration + model in the changes JSONB
 *
 * SSE event shape (mirrors /api/chat/stream for client reuse):
 *   data: {"type":"start","evidenceId":"...","timestamp":"..."}
 *   data: {"type":"token","content":"..."}    (repeated)
 *   data: {"type":"done","durationMs":1234,"model":"gemma4-rotorquant:latest","auditId":"..."}
 *   data: {"type":"error","error":"..."}      (terminal on failure)
 *
 * Auth: requires locals.user (DEV_BYPASS_AUTH honored upstream).
 * Audit: writes to evidence_audit_log with action='analyzed'. user_id stays NULL
 * (column is uuid in DB, locals.user.id is integer-string — documented mismatch
 * in CLAUDE.md). Caller-id captured in changes.userId for the trail.
 */

import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence, evidenceAuditLog } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import { isUuid } from '$lib/server/validation.js';
import { acquireGpuLease } from '$lib/server/inference/gpu-arbiter.js';

const MODEL = 'gemma4-rotorquant:latest';
const MAX_CONTEXT_CHARS = 8_000; // cap extractedText to keep the prompt bounded

function buildAnalysisPrompt(item: {
	title: string | null;
	description: string | null;
	summary: string | null;
	mimeType: string | null;
	fileType: string | null;
	extractedText?: string | null;
}): string {
	const ctxParts: string[] = [];
	if (item.title) ctxParts.push(`Title: ${item.title}`);
	if (item.description) ctxParts.push(`Description: ${item.description}`);
	if (item.summary) ctxParts.push(`Summary: ${item.summary}`);
	if (item.mimeType || item.fileType) {
		ctxParts.push(`Type: ${item.mimeType ?? item.fileType}`);
	}
	if (item.extractedText) {
		const text = item.extractedText.slice(0, MAX_CONTEXT_CHARS);
		ctxParts.push(`Extracted text:\n${text}`);
	}
	const context = ctxParts.join('\n\n');

	return `You are a legal analyst. Analyze the following evidence item and produce a structured assessment.

## Evidence

${context || '(no extracted content available — analyze metadata only)'}

## Your task

Provide a concise legal analysis covering:

1. **Relevance** — what kind of evidence this appears to be (testimonial, documentary, physical, digital, forensic) and what facts it tends to prove or disprove.
2. **Admissibility concerns** — any obvious hearsay, authentication, chain-of-custody, or privilege issues.
3. **Key citations or statutes** that may apply (e.g., FRE rules for federal, CEC for California). Cite by section if confident; say "uncertain" otherwise.
4. **Recommended next steps** for the case team (additional discovery, expert witness, deposition follow-up).

Keep the analysis under 400 words. Do not invent facts not present in the evidence above.`;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}
	if (!isUuid(params.id)) {
		return new Response('Invalid evidence ID format', { status: 400 });
	}

	// Load the evidence item up-front so we can 404 cleanly BEFORE opening the SSE stream.
	const rows = await db
		.select({
			id: evidence.id,
			title: evidence.title,
			description: evidence.description,
			summary: evidence.summary,
			mimeType: evidence.mimeType,
			fileType: evidence.fileType,
			extractedText: evidence.extractedText,
		})
		.from(evidence)
		.where(eq(evidence.id, params.id))
		.limit(1)
		.catch(() => []);

	if (!rows[0]) {
		return new Response('Evidence not found', { status: 404 });
	}
	const item = rows[0];
	const callerUserId = locals.user.id;
	const startedAt = Date.now();

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			const send = (data: unknown) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
			};

			try {
				await acquireGpuLease('ollama', 120).catch(() => null);

				send({
					type: 'start',
					evidenceId: item.id,
					model: MODEL,
					timestamp: new Date().toISOString(),
				});

				const prompt = buildAnalysisPrompt(item);
				const { llmRouter } = await import('$lib/server/llm-router');

				let fullText = '';
				const responseStream = await llmRouter.generateStream({
					prompt,
					provider: 'ollama',
					model: MODEL,
				});

				for await (const chunk of responseStream) {
					const content =
						(chunk as { content?: string; text?: string }).content ??
						(chunk as { text?: string }).text ??
						'';
					if (!content) continue;
					fullText += content;
					send({ type: 'token', content });
				}

				const durationMs = Date.now() - startedAt;

				// Audit insert is fire-and-forget — never block the SSE close on a write.
				// user_id stays NULL because the DB column is uuid (documented mismatch);
				// the caller's integer id is preserved in changes.userId for the audit trail.
				let auditId: string | null = null;
				try {
					const [inserted] = await db
						.insert(evidenceAuditLog)
						.values({
							evidenceId: item.id,
							action: 'analyzed',
							changes: {
								model: MODEL,
								userId: callerUserId,
								durationMs,
								analysisLength: fullText.length,
								analysisText: fullText,
							},
						})
						.returning({ id: evidenceAuditLog.id });
					auditId = inserted?.id ?? null;
				} catch (auditErr) {
					console.warn('[evidence/analyze/stream] audit insert failed:', auditErr);
				}

				send({
					type: 'done',
					durationMs,
					model: MODEL,
					auditId,
				});
				controller.close();
			} catch (err) {
				console.error('[evidence/analyze/stream] error:', err);
				send({
					type: 'error',
					error: err instanceof Error ? err.message : 'Stream error',
				});
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no',
		},
	});
};
