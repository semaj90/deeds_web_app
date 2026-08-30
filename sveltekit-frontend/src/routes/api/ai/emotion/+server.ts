import { json } from '@sveltejs/kit';
import { LLAMA_SERVER_BASE_URL, getActiveLocalVlmModel } from '$lib/server/ai/local-llama-provider.js';
import type { RequestHandler } from './$types';

/**
 * Server-side membrane for webcam emotion analysis. Browser code must never import
 * local-llama-provider.ts directly (it pulls in node:path + private env state) — this route is
 * the only place that talks to llama-server for this feature. See src/lib/ai/emotion-context.ts.
 */
export const POST: RequestHandler = async ({ request }) => {
	let imageBase64: unknown;
	try {
		({ imageBase64 } = await request.json());
	} catch {
		return json({ emotion: null, error: 'invalid_json' }, { status: 400 });
	}
	if (typeof imageBase64 !== 'string' || !imageBase64) {
		return json({ emotion: null, error: 'missing_imageBase64' }, { status: 400 });
	}

	try {
		const model = await getActiveLocalVlmModel();
		const res = await fetch(`${LLAMA_SERVER_BASE_URL}/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				messages: [
					{
						role: 'user',
						content:
							'What emotion is this person expressing? Respond with ONLY one word: happy, sad, angry, fear, surprise, disgust, or neutral.',
						images: [imageBase64],
					},
				],
				stream: false,
				max_tokens: 32,
			}),
			signal: AbortSignal.timeout(30_000),
		});

		if (!res.ok) return json({ emotion: null, error: `llama_server_${res.status}` }, { status: 502 });

		const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
		const responseText = (data?.choices?.[0]?.message?.content ?? '').toLowerCase().trim();
		return json({ emotion: responseText || null });
	} catch (error) {
		return json({ emotion: null, error: error instanceof Error ? error.message : 'unknown' }, { status: 502 });
	}
};
