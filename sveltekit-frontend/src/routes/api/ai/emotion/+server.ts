import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { LLAMA_SERVER_BASE_URL, getActiveLocalVlmModel } from '$lib/server/ai/local-llama-provider.js';
import { requireUser } from '$lib/server/auth-utils.js';
import type { RequestHandler } from './$types';

/**
 * Server-side membrane for webcam emotion analysis. Browser code must never import
 * local-llama-provider.ts directly (it pulls in node:path + private env state) — this route is
 * the only place that talks to llama-server for this feature. See src/lib/ai/emotion-context.ts.
 *
 * Runtime: the configured llama-server endpoint. It answers an image only when /props reports
 * modalities.vision; on a text-only runtime this route returns 503 instead of letting the model
 * guess an emotion it cannot see. The loaded model is resolved by the llama-server provider.
 *
 * Output is the closed FaceEmotion set (emotion-context.ts) so a later courtroom/Mixamo
 * animation mapping can key on it; anything outside the set is returned as null.
 */

const FACE_EMOTIONS = ['happy', 'sad', 'angry', 'fear', 'surprise', 'disgust', 'neutral'] as const;
type FaceEmotion = (typeof FACE_EMOTIONS)[number];

// ~3 MB of base64; a webcam still is far smaller.
const MAX_IMAGE_BASE64_CHARS = 4_000_000;

const bodySchema = z.object({
	imageBase64: z.string().min(1).max(MAX_IMAGE_BASE64_CHARS),
});

function stripDataUri(value: string): string {
	return value.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
}

function toFaceEmotion(text: string): FaceEmotion | null {
	const word = text.toLowerCase().match(/[a-z]+/)?.[0] ?? '';
	return (FACE_EMOTIONS as readonly string[]).includes(word) ? (word as FaceEmotion) : null;
}

async function visionAvailable(): Promise<boolean> {
	try {
		const res = await fetch(`${LLAMA_SERVER_BASE_URL.replace(/\/v1$/, '')}/props`, {
			signal: AbortSignal.timeout(3_000),
		});
		if (!res.ok) return false;
		const props = (await res.json()) as { modalities?: { vision?: boolean } };
		return props.modalities?.vision === true;
	} catch {
		return false;
	}
}

export const POST: RequestHandler = async (event) => {
	requireUser(event);

	let raw: unknown;
	try {
		raw = await event.request.json();
	} catch {
		return json({ emotion: null, error: 'invalid_json' }, { status: 400 });
	}
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json({ emotion: null, error: 'missing_imageBase64' }, { status: 400 });
	}
	const imageBase64 = stripDataUri(parsed.data.imageBase64);

	if (!(await visionAvailable())) {
		return json({ emotion: null, error: 'vision_unavailable' }, { status: 503 });
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
						content: [
							{
								type: 'text',
								text: `What emotion is this person expressing? Respond with ONLY one word: ${FACE_EMOTIONS.join(', ')}.`,
							},
							{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
						],
					},
				],
				stream: false,
				max_tokens: 32,
			}),
			signal: AbortSignal.timeout(30_000),
		});

		if (!res.ok) return json({ emotion: null, error: `llama_server_${res.status}` }, { status: 502 });

		const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
		return json({ emotion: toFaceEmotion(data?.choices?.[0]?.message?.content ?? '') });
	} catch (error) {
		return json({ emotion: null, error: error instanceof Error ? error.message : 'unknown' }, { status: 502 });
	}
};
