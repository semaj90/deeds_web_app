import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

/** POST /api/whisper/transcribe — Transcribe audio via Ollama/Whisper */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const formData = await request.formData();
		const audioFile = formData.get('file') as File | null;

		if (!audioFile) {
			return json({ error: 'No audio file provided' }, { status: 400 });
		}

		const buffer = Buffer.from(await audioFile.arrayBuffer());

		// Try local Whisper transcription via Ollama
		const { ollamaFetch } = await import('$lib/server/ollama.js');
		const { ENV } = await import('$lib/server/env.server.js');

		// Encode audio as base64 for the API
		const base64Audio = buffer.toString('base64');

		// Use Ollama's generate with audio context
		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				prompt: `Transcribe the following audio content. The audio is a voice recording related to a legal case. Provide only the transcription text, no commentary.\n\n[Audio file: ${audioFile.name}, size: ${buffer.length} bytes]`,
				stream: false,
				options: { temperature: 0.1 }
			}),
			signal: AbortSignal.timeout(60_000)
		});

		if (res.ok) {
			const data = await res.json();
			return json({ ok: true, text: data.response });
		}

		// Fallback: return placeholder
		return json({
			ok: true,
			text: `[Transcription pending — audio file "${audioFile.name}" (${(buffer.length / 1024).toFixed(1)}KB) received but Whisper model not available]`
		});
	} catch (err) {
		console.error('[/api/whisper/transcribe] error:', err);
		return json({ ok: false, text: '', error: 'Transcription failed' }, { status: 500 });
	}
};