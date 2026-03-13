import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;

const suggestFixSchema = z.object({
	route: z.string().max(500).optional(),
	file_path: z.string().max(1000).optional(),
	code: z.string().max(200).optional(),
	message: z.string().max(5000).optional(),
	errors: z.array(z.object({
		code: z.string().max(200),
		message: z.string().max(5000),
		severity: z.string().max(50)
	})).max(50).optional()
});

/**
 * POST /api/phase72/suggest-fix
 * AI-powered fix suggestions using local Ollama (gemma3-legal).
 * Falls back to static suggestions if Ollama is unavailable.
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = suggestFixSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const payload = parsed.data;
		const route = payload.route ?? 'unknown';
		const errorMsg = payload.message ?? payload.errors?.[0]?.message ?? 'Unknown error';
		const errorCode = payload.code ?? payload.errors?.[0]?.code ?? 'UNKNOWN';

		// Try Ollama for AI-powered suggestions
		try {
			const prompt = `You are a SvelteKit 2 + Svelte 5 expert. Analyze this route error and suggest fixes.

Route: ${route}
File: ${payload.file_path ?? 'unknown'}
Error Code: ${errorCode}
Error Message: ${errorMsg}

Provide:
1. A brief fix plan (markdown, 3-5 steps)
2. 3 specific suggestions
3. Related routes that might be affected

Respond in JSON: {"plan": "...", "suggestions": ["..."], "related_routes": ["..."]}`;

			const res = await fetch(`${OLLAMA_URL}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gemma3-legal:latest',
					prompt,
					stream: false,
					options: { temperature: 0.2, num_predict: 512 },
				}),
			});

			if (res.ok) {
				const data = await res.json();
				const text = data.response ?? '';
				const jsonMatch = text.match(/\{[\s\S]*\}/);
				if (jsonMatch) {
					const parsed = JSON.parse(jsonMatch[0]);
					return json({
						plan: parsed.plan ?? text.slice(0, 500),
						suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
						related_routes: Array.isArray(parsed.related_routes) ? parsed.related_routes : [],
					});
				}
				// Raw text fallback
				return json({
					plan: text.slice(0, 500),
					suggestions: [],
					related_routes: [],
				});
			}
		} catch {
			// Ollama unavailable — fall through to static suggestions
		}

		// Static fallback when Ollama is not running
		return json({
			plan: `### Fix Suggestions for \`${route}\`\n\n1. **Run svelte-check** to identify type errors\n2. **Update route layout** if component props changed\n3. **Check imports** for missing or misnamed components\n4. **Verify Svelte 5 runes** — replace \`export let\` with \`$props()\``,
			suggestions: [
				`Review TypeScript errors in ${route} page.ts or layout.ts`,
				'Check component prop compatibility with Svelte 5 runes',
				'Verify all imports use .js extensions (bundler resolves .js → .ts)',
			],
			related_routes: [route],
		});
	} catch (err) {
		console.error('[phase72] suggest-fix error:', err);
		return json(
			{ plan: 'Error generating suggestions.', suggestions: [], related_routes: [] },
			{ status: 500 }
		);
	}
};
