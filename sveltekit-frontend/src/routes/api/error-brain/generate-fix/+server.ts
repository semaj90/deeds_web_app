import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';

interface FixSource {
	type: string;
	id: string;
	content: string;
	relevance: number;
}

/**
 * POST /api/error-brain/generate-fix
 * Generate a fix using Ollama with validated KB sources as context
 * Human-in-the-loop: returns fix for review, does NOT auto-apply
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();

	if (!body?.errorMessage) throw error(400, 'Missing errorMessage');
	if (!body?.filePath) throw error(400, 'Missing filePath');

	const errorMessage: string = body.errorMessage;
	const filePath: string = body.filePath;
	const originalCode: string = body.originalCode ?? '';
	const sources: FixSource[] = Array.isArray(body.sources) ? body.sources : [];

	// Build context from validated sources
	const sourceContext = sources
		.slice(0, 5)
		.map((s, i) => `[Source ${i + 1} - ${s.type}] (relevance: ${s.relevance.toFixed(2)})\n${s.content}`)
		.join('\n\n');

	const prompt = `You are a TypeScript/SvelteKit expert. Fix the following error using the knowledge base sources provided.

## Error
File: ${filePath}
Error: ${errorMessage}

${originalCode ? `## Original Code\n\`\`\`typescript\n${originalCode.slice(0, 2000)}\n\`\`\`` : ''}

## Knowledge Base Sources
${sourceContext || 'No sources available — use your own knowledge.'}

## Instructions
1. Analyze the error and sources
2. Generate a minimal fix (change only what's needed)
3. Explain WHY this fix works
4. Rate your confidence (0-1)

Respond in JSON format:
{
  "fixedCode": "the corrected code",
  "explanation": "why this fix works",
  "confidence": 0.85,
  "citations": ["source IDs used"],
  "changeDescription": "one-line summary of what changed"
}`;

	try {
		const ollamaRes = await fetch('http://localhost:11434/api/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				prompt,
				format: 'json',
				stream: false,
				options: { temperature: 0.2, num_predict: 2048 },
			}),
			signal: AbortSignal.timeout(60000),
		});

		if (!ollamaRes.ok) {
			throw new Error(`Ollama returned ${ollamaRes.status}`);
		}

		const data = await ollamaRes.json();
		let fix: Record<string, unknown>;

		try {
			fix = JSON.parse(data.response);
		} catch {
			// LLM returned non-JSON — wrap it
			fix = {
				fixedCode: data.response,
				explanation: 'Raw LLM response (non-JSON)',
				confidence: 0.3,
				citations: [],
				changeDescription: 'Generated fix',
			};
		}

		return json({
			success: true,
			fix: {
				fixedCode: fix.fixedCode ?? '',
				explanation: fix.explanation ?? '',
				confidence: Math.min(Math.max(Number(fix.confidence) || 0, 0), 1),
				citations: Array.isArray(fix.citations) ? fix.citations : [],
				changeDescription: fix.changeDescription ?? '',
			},
			metadata: {
				filePath,
				errorMessage,
				sourcesUsed: sources.length,
				model: 'gemma3-legal:latest',
				generatedAt: new Date().toISOString(),
				tokenCount: data.eval_count ?? null,
				durationMs: data.total_duration ? Math.round(data.total_duration / 1e6) : null,
			},
		});
	} catch (e) {
		console.error('[error-brain/generate-fix] Ollama failed:', (e as Error).message);
		return json({
			success: false,
			error: 'Fix generation failed — Ollama unavailable',
			fix: null,
			metadata: { filePath, errorMessage, model: 'gemma3-legal:latest' },
		}, { status: 503 });
	}
};
