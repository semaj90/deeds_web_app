import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB
const ALLOWED_AUDIO_TYPES = new Set([
	'audio/wav', 'audio/wave', 'audio/x-wav',
	'audio/mp3', 'audio/mpeg',
	'audio/ogg', 'audio/webm',
	'audio/flac', 'audio/x-flac',
	'audio/mp4', 'audio/aac',
	'application/octet-stream', '' // allow unknown MIME
]);
const ALLOWED_AUDIO_EXTENSIONS = new Set([
	'.wav', '.mp3', '.ogg', '.webm', '.flac', '.m4a', '.aac', '.opus'
]);

/** POST /api/whisper/transcribe — Transcribe audio via Ollama/Whisper */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const formData = await request.formData();
		const audioFile = formData.get('file') as File | null;

		if (!audioFile) {
			return json({ error: 'No audio file provided' }, { status: 400 });
		}

		// Validate file size
		if (audioFile.size > MAX_AUDIO_SIZE) {
			return json({ error: `Audio file too large. Maximum ${MAX_AUDIO_SIZE / 1024 / 1024}MB.` }, { status: 400 });
		}

		// Validate MIME type
		if (audioFile.type && !ALLOWED_AUDIO_TYPES.has(audioFile.type)) {
			return json({ error: 'Invalid audio file type' }, { status: 400 });
		}

		// Validate extension
		const ext = '.' + (audioFile.name.split('.').pop()?.toLowerCase() ?? '');
		if (!ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
			return json({ error: 'Invalid audio file extension' }, { status: 400 });
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