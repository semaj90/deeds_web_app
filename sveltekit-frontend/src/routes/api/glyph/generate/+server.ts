import type { RequestHandler } from './$types';
import type { GlyphRequest } from '$lib/server/glyph-diffusion-service.js';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const glyphSchema = z.object({
	evidence_id: z.string().min(1),
	prompt: z.string().min(1).max(10000),
	style: z.string().max(50).default('legal'),
	dimensions: z.tuple([z.number().min(64).max(2048), z.number().min(64).max(2048)]).default([512, 512]),
	neural_sprite_config: z.record(z.string(), z.unknown()).optional()
});

/** POST /api/glyph/generate — Generate evidence visualization glyph */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = glyphSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { evidence_id, prompt, style, dimensions } = parsed.data;

		// Generate a text-based glyph descriptor via LLM
		const { ollamaFetch } = await import('$lib/server/ollama.js');
		const { ENV } = await import('$lib/server/env.server.js');

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma4-rotorquant:latest',
				prompt: `Generate a JSON descriptor for a legal evidence visualization glyph.
Style: ${style}
Dimensions: ${dimensions[0]}x${dimensions[1]}
Evidence context: ${prompt.slice(0, 2000)}

Return JSON with these fields:
{
  "type": "document|photo|audio|video|digital",
  "icon": "description of icon",
  "color": "#hex color based on evidence type",
  "label": "short label",
  "confidence": 0.0-1.0,
  "connections": []
}`,
				stream: false,
				options: { temperature: 0.5 }
			}),
			signal: AbortSignal.timeout(30_000)
		});

		if (!res.ok) {
			return json({ success: false, error: `LLM error: ${res.status}` }, { status: 503 });
		}

		const data = await res.json();
		let glyph: unknown;
		try {
			glyph = JSON.parse(data.response);
		} catch {
			glyph = {
				type: 'document',
				icon: 'file-text',
				color: '#6b7280',
				label: evidence_id.slice(0, 8),
				confidence: 0.5,
				raw: data.response
			};
		}

		// Generate tensor-cached diffusion artifact via GlyphDiffusionService
		let diffusionResult = null;
		try {
			const { glyphDiffusionService } = await import('$lib/server/glyph-diffusion-service.js');
			diffusionResult = await glyphDiffusionService.generateGlyph({
				evidence_id: parseInt(evidence_id) || 0,
				prompt,
				style: style as 'detective' | 'corporate' | 'forensic' | 'legal',
				dimensions: dimensions as [number, number],
				neural_sprite_config: parsed.data.neural_sprite_config as GlyphRequest['neural_sprite_config'],
			});
		} catch (diffErr) {
			console.warn('[/api/glyph/generate] diffusion service unavailable:', diffErr);
		}

		return json({
			success: true,
			glyph,
			data: diffusionResult ? {
				glyph_url: diffusionResult.glyph_url,
				tensor_ids: diffusionResult.tensor_ids,
				generation_time_ms: diffusionResult.generation_time_ms,
				cache_hits: diffusionResult.cache_hits,
				preview_with_tensors: diffusionResult.preview_with_tensors,
			} : undefined,
		});
	} catch (err) {
		console.error('[/api/glyph/generate] error:', err);
		return json({ success: false, error: 'Glyph generation failed' }, { status: 500 });
	}
};
