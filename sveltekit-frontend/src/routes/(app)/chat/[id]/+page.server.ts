/**
 * Phase 76: Chat Route Server
 * Enhanced with direct Ollama integration and Redis pub/sub for SSE
 */

import { fail } from '@sveltejs/kit';
import type { Redis } from 'ioredis';
import { getRedis } from '$lib/server/redis';
import { getOllamaUrl } from '$lib/config/env.server.js';
import type { Actions, PageServerLoad } from './$types';
import { ollamaFetch } from '$lib/server/ollama.js';

const OLLAMA_URL = getOllamaUrl();
const OLLAMA_MODEL = process.env?.OLLAMA_MODEL ?? 'gemma4-legal:latest';

export const load: PageServerLoad = async ({ params, locals }) => {
	let history: any[] = [];

	try {
		const chatId = params.id;
		const redisKey = `chat:${chatId}`;

		// Load from Redis with timeout (shared between anonymous and authenticated)
		const timeoutPromise = new Promise((_, reject) =>
			setTimeout(() => reject(new Error('Redis timeout')), 3000)
		);

		const rawHistory = await Promise.race([
			redis.get(redisKey),
			timeoutPromise
		]) as string | null;

		history = rawHistory ? JSON.parse(rawHistory) : [];
	} catch (error) {
		console.warn('Redis not available, using empty history:', error);
		// Continue with empty history - don't block page load
	}

	const isAuthenticated = !!locals.user;

	return {
		chatId: params.id,
		history,
		user: locals?.user ?? null,
		isAuthenticated,
		shouldPromptAuth: !isAuthenticated,
		savedChats: []
	};
};

export const actions: Actions = {
	send: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const userMessage = formData.get('message') as string;
		const isAnonymous = !locals.user;
		const chatId = params.id;

		// Validation
		if (!userMessage || userMessage.trim().length === 0) {
			return fail(400, { error: 'Message cannot be empty' });
		}

		if (userMessage.length > 10000) {
			return fail(400, { error: 'Message too long (max 10,000 characters)' });
		}

		const channel = `updates:${chatId}`;
		const redisKey = `chat:${chatId}`;

		try {
			// Publish start event
			await redis.publish(channel, JSON.stringify({ type: 'start' }));

			// Generate AI response via Ollama (streaming)
			const aiResponse = await streamOllamaResponse(userMessage.trim(), channel);

			// Save to Redis history
			try {
				const rawHistory = await redis.get(redisKey);
				const history = rawHistory ? JSON.parse(rawHistory) : [];

				// Add user message
				history.push({
					role: 'user',
					content: userMessage.trim(),
					timestamp: new Date().toISOString()
				});

				// Add AI response
				history.push({
					role: 'assistant',
					content: aiResponse.content,
					timestamp: new Date().toISOString(),
					metadata: {
						confidence: aiResponse.confidence,
						citations: aiResponse.citations,
						warnings: aiResponse.warnings
					}
				});

				// Save updated history
				await redis.set(redisKey, JSON.stringify(history));

				// Publish final AI_REPLY event for SSE
				await redis.publish(
					channel,
					JSON.stringify({
						type: 'AI_REPLY',
						content: aiResponse.content,
						confidence: aiResponse.confidence,
						citations: aiResponse.citations,
						warnings: aiResponse.warnings,
						timestamp: new Date().toISOString()
					})
				);
			} catch (redisError) {
				console.warn('Redis save failed:', redisError);
			}

			return {
				success: true,
				saved: !!locals.user,
				hint: isAnonymous ? '💡 Sign in to save this conversation' : undefined,
				response: aiResponse
			};
		} catch (error: any) {
			console.error('Failed to generate AI response:', error);

			// Publish error event
			try {
				await redis.publish(
          channel,
          JSON.stringify({
            type: 'AI_ERROR',
            error: 'Failed to generate response',
            timestamp: new Date().toISOString(),
          })
        );
			} catch (e) {
				console.warn('Failed to publish error event:', e);
			}

			return fail(500, { error: 'Failed to process message. Please try again.' });
		}
	}
};

/**
 * Stream response from Ollama and publish deltas to Redis
 */
async function streamOllamaResponse(
	message: string,
	channel: string
): Promise<{ content: string, confidence: number;
	citations: string[];
	warnings: string[];
}> {
	let fullContent = '';

	try {
		const response = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: OLLAMA_MODEL,
				prompt: `You are a legal AI assistant. Answer the following question professionally and accurately:\n\n${message}`,
				stream: true,
				options: {
				temperature: 0.7,
					top_p: 0.9
				}
			})
		});

		if (!response.ok) {
			throw new Error(`Ollama API error: ${response.status}`);
		}

		if (!response.body) {
			throw new Error('No response body from Ollama');
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		let streamDone = false;
		while (!streamDone) {
			const { done, value } = await reader.read();
			if (done) {
				streamDone = true;
				continue;
			}

			const chunk = decoder.decode(value, { stream: true });

			// Ollama streams JSONL lines
			for (const line of chunk.split('\n')) {
				if (!line.trim()) continue;

				try {
					const obj = JSON.parse(line);
					const delta = obj.response ?? '';

					if (delta) {
						fullContent += delta;

						// Publish delta to Redis for SSE
						await redis.publish(
							channel,
							JSON.stringify({
								type: 'delta',
								content: delta
							})
						);
					}

					if (obj.done) {
						// Publish done event
						await redis.publish(channel, JSON.stringify({ type: 'done' }));
					}
				} catch {
					// Skip malformed JSON lines
				}
			}
		}

		// Calculate confidence and extract citations
		const confidence = calculateConfidence(fullContent, message);
		const citations = extractCitations(fullContent);
		const warnings = confidence < 0.65 ? ['Low confidence response - please verify with official sources'] : [];

		return {
			content: fullContent || 'I apologize, but I was unable to generate a response.',
			confidence,
			citations,
			warnings
		};
	} catch (error) {
		console.error('Ollama streaming failed:', error);

		// Publish error and done
		await redis.publish(channel, JSON.stringify({ type: 'error', error: String(error) }));
		await redis.publish(channel, JSON.stringify({ type: 'done' }));

		throw error;
	}
}

/**
 * Calculate confidence score based on response quality
 */
function calculateConfidence(response: string, _query: string): number {
	let confidence = 0.8; // Base confidence

	// Reduce confidence for short responses
	if (response.length < 100) confidence -= 0.1;

	// Reduce confidence for uncertain language
	const uncertainPhrases = ['i think', 'maybe', 'possibly', 'not sure', 'uncertain'];
	for (const phrase of uncertainPhrases) {
		if (response.toLowerCase().includes(phrase)) {
			confidence -= 0.05;
		}
	}

	// Increase confidence for citations
	if (response.includes('§') || response.includes('U.S.C.') || response.includes('Cal.')) {
		confidence += 0.1;
	}

	return Math.max(0.3, Math.min(1.0, confidence));
}

/**
 * Extract legal citations from response
 */
function extractCitations(response: string): string[] {
	const citations: string[] = [];

	// Match common legal citation patterns
	const patterns = [/\d+\s+U\.S\.C\.\s+§\s*\d+/g, /\d+\s+Cal\.\s+\d+/g, /\d+\s+F\.\d+d\s+\d+/g];

	for (const pattern of patterns) {
		const matches = response.match(pattern);
		if (matches) {
			citations.push(...matches);
		}
	}

	return [...new Set(citations)]; // Remove duplicates
}
