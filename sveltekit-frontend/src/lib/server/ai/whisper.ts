import { ENV } from '$lib/server/env.server.js';

/**
 * Transcribe via persistent whisper-server.exe HTTP API.
 * Server keeps model in GPU VRAM — no cold start overhead.
 */
export async function transcribeViaServer(
	buffer: Buffer,
	filename: string,
	language: string = 'auto',
	translate: boolean = false,
): Promise<{ ok: true; text: string; language: string | null; segments?: any[] } | null> {
	const serverUrl = ENV.WHISPER_SERVER_URL;

	// Health check first (fast fail)
	try {
		const healthRes = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(2000) });
		if (!healthRes.ok) return null;
	} catch {
		return null;
	}

	// POST /inference with multipart form
	const form = new FormData();
	form.append('file', new Blob([new Uint8Array(buffer)]), filename);
	form.append('temperature', '0.0');
	form.append('response_format', 'json');
	if (language && language !== 'auto') {
		form.append('language', language);
	}
	if (translate) {
		form.append('translate', 'true');
	}

	const res = await fetch(`${serverUrl}/inference`, {
		method: 'POST',
		body: form,
		signal: AbortSignal.timeout(120_000), // 2 min max for long audio
	});

	if (!res.ok) return null;

	const data = await res.json();
	// whisper-server returns { text: "...", segments: [...] } or similar
	const text = (data.text ?? '').trim();
	const detectedLang = data.language ?? null;
	const segments = Array.isArray(data.segments) ? data.segments : undefined;

	return { ok: true, text, language: detectedLang, segments };
}
