import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { acquireGpuLease, releaseGpuLease } from '$lib/server/inference/gpu-arbiter.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const chatMessageSchema = z.object({
	role: z.enum(['user', 'assistant', 'system']),
	content: z.string().max(10000)
});

const chatRequestSchema = z.object({
	message: z.string().max(10000).optional(),
	prompt: z.string().max(10000).optional(),
	messages: z.array(chatMessageSchema).max(50).optional(),
	temperature: z.number().min(0).max(2).optional()
});

/** POST /api/chat — Simple chat endpoint (also handles /api/chat-test callers) */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = chatRequestSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ message: parsed.error.issues[0]?.message ?? 'Invalid input', response: '' }, { status: 400 });
		}
		const body = parsed.data;

		// Support both { message } and { messages: [{ role, content }] } formats
		let userContent: string;
		if (body.messages && body.messages.length > 0) {
			const lastUser = body.messages.filter((m) => m.role === 'user').pop();
			userContent = lastUser?.content || '';
		} else {
			userContent = body.message || body.prompt || '';
		}

		if (!userContent.trim()) {
			return json({ message: 'No message provided', response: '' }, { status: 400 });
		}

		// Acquire GPU lease for Ollama (non-blocking — continue even if lease fails)
		const lease = await acquireGpuLease('ollama', 60).catch(() => null);

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: 'You are a helpful legal AI assistant.' },
					...(body.messages || [{ role: 'user', content: userContent }])
				],
				stream: false,
				options: { temperature: body.temperature ?? 0.7 }
			}),
			signal: AbortSignal.timeout(30_000)
		});

		if (!res.ok) {
			return json({ message: 'AI service unavailable', response: '' }, { status: 502 });
		}

		const data = await res.json();
		const responseText = data.message?.content || '';

		return json({
			message: responseText,
			response: responseText,
			model: data.model || 'gemma3-legal:latest',
			gpuLease: lease ? { backend: lease.backend, expiresAt: lease.expiresAt } : null
		});
	} catch (err) {
		console.error('[/api/chat]', err);
		// Release lease on error so TRT-LLM can take over if needed
		await releaseGpuLease('ollama').catch(() => {});
		return json({ message: 'Chat service error', response: '' }, { status: 503 });
	}
};
