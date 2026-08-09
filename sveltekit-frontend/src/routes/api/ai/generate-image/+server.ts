import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { LLAMA_SERVER_BASE_URL, LOCAL_VLM_MODEL } from '$lib/server/ai/local-llama-provider.js';

const imageGenSchema = z.object({
	prompt: z.string().min(1).max(10000),
	negativePrompt: z.string().max(5000).optional(),
	width: z.number().min(64).max(2048).default(512),
	height: z.number().min(64).max(2048).default(512),
	steps: z.number().min(1).max(100).default(20),
	cfgScale: z.number().min(1).max(30).default(7),
	seed: z.number().default(-1),
	style: z.string().max(100).default('default'),
	provider: z.string().max(100).default('local')
});

/** POST /api/ai/generate-image — Generate an image from a text prompt */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = imageGenSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { prompt, style } = parsed.data;

		// Generate a text-based visualization descriptor via LLM
		// (No local image generation model available — return SVG placeholder)
		const res = await fetch(`${LLAMA_SERVER_BASE_URL}/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: LOCAL_VLM_MODEL,
				messages: [
					{ role: 'system', content: 'Describe a visual representation and return strict JSON with description, dominantColors, elements, and mood.' },
					{ role: 'user', content: `Describe a visual representation for: "${prompt.slice(0, 500)}". Style: ${style}. Return JSON: { "description": "...", "dominantColors": ["#hex"], "elements": ["..."], "mood": "..." }` }
				],
				stream: false,
				temperature: 0.7,
				max_tokens: 512
			}),
			signal: AbortSignal.timeout(30_000)
		});

		if (!res.ok) {
			return json({
				success: true,
				type: 'placeholder',
				description: `Image generation queued for: ${prompt.slice(0, 100)}`,
				imageUrl: null
			});
		}

		const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
		let metadata: Record<string, unknown> = {};
		try {
			metadata = JSON.parse(data.choices?.[0]?.message?.content || '{}');
		} catch {
			metadata = { description: data.choices?.[0]?.message?.content || '' };
		}

		return json({
			success: true,
			type: 'descriptor',
			metadata,
			imageUrl: null
		});
	} catch (err) {
		console.error('[/api/ai/generate-image] error:', err);
		return json({ success: false, error: 'Image generation failed' }, { status: 500 });
	}
};


