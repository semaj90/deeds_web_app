import os

files_to_fix = {
    "sveltekit-frontend/src/routes/chat/+page.svelte": r"""<script lang="ts">
    import { enhance } from '$app/forms';
    import { ChatSession } from '$lib/models/ChatSession.svelte';

    // Reactive Chat State Logic using the Barrel Store Pattern
    const room = new ChatSession('case-101');
</script>

<svelte:head>
    <title>Chat | Legal AI</title>
</svelte:head>

<!-- Messages container with test selectors -->
<div class="chat-window" data-testid="chat-window" data-role="chat-messages">
    {#each room.messages as msg, i (i)}
        <div
            class="msg {msg.role}"
            data-testid="chat-message"
            data-role={msg.role}
            data-author={msg.role}
        >
            <strong>{msg.role}:</strong> {msg.content}

            {#if msg.metadata?.confidence !== undefined}
                <span class="confidence" data-testid="confidence">
                    Confidence: {(msg.metadata.confidence * 100).toFixed(0)}%
                </span>
            {/if}

            {#if msg.metadata?.citations?.length}
                <div class="citations" data-testid="citations">
                    <strong>Sources:</strong>
                    {#each msg.metadata.citations as citation}
                        <span class="citation">{citation}</span>
                    {/each}
                </div>
            {/if}

            {#if msg.metadata?.warnings?.length}
                <div class="warning" data-testid="warning">
                    ⚠️ {msg.metadata.warnings.join(', ')}
                </div>
            {/if}
        </div>
    {/each}

    {#if room.status === 'thinking'}
        <p class="loading" data-testid="loading" data-role="chat-streaming">
            AI is reviewing case context...
        </p>
    {/if}
</div>

<!-- Input form with test selectors -->
<form method="POST" action="?/send" use:enhance={() => {
    // Optimistic Update before server response
    const input = document.querySelector('input[name="message"]') as HTMLInputElement;
    if (input.value) {
        room.addOptimistic(input.value);
        input.value = '';
    }

    return async ({ update }) => { await update({ reset: false }); };
}}>
    <input type="hidden" name="chatId" value={room.chatId} />
    <input
        type="text"
        name="message"
        placeholder="Ask about the liability clause..."
        data-testid="chat-input"
        data-role="chat-input"
    />
    <button
        type="submit"
        data-testid="chat-send"
        data-role="chat-send"
    >
        Send
    </button>
</form>

<style>
    .chat-window {
        border: 1px solid #ccc;
        padding: 1rem;
        height: 300px;
        overflow-y: auto;
        margin-bottom: 1rem;
    }
    .msg {
        margin-bottom: 0.5rem;
        padding: 0.5rem;
        border-radius: 4px;
    }
    .msg.user {
        background-color: #e0f7fa;
        text-align: right;
    }
    .msg.assistant {
        background-color: #f1f8e9;
        text-align: left;
    }
    .loading {
        font-style: italic;
        color: #666;
    }
    .confidence {
        display: block;
        font-size: 0.8em;
        color: #666;
        margin-top: 5px;
    }
    .citations {
        font-size: 0.85em;
        margin-top: 8px;
        padding: 5px;
        background: #f5f5f5;
        border-radius: 4px;
    }
    .citation {
        display: inline-block;
        margin: 2px 5px;
        padding: 2px 6px;
        background: #e0e0e0;
        border-radius: 3px;
    }
    .warning {
        margin-top: 8px;
        padding: 8px;
        background: #fff3cd;
        border: 1px solid #ffc107;
        border-radius: 4px;
        color: #856404;
    }
</style>""",

    "sveltekit-frontend/src/routes/chat/[id]/+page.server.ts": r"""/**
 * Phase 76: Chat Route Server
 * Enhanced with direct Ollama integration and Redis pub/sub for SSE
 */

import { fail } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import type { Actions, PageServerLoad } from './$types';

const OLLAMA_URL = process.env?.OLLAMA_URL ?? process.env?.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env?.OLLAMA_MODEL ?? 'gemma3-legal:latest';

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
						error: error.message || 'Failed to generate response',
						timestamp: new Date().toISOString()
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
): Promise<{
	content: string;
	confidence: number;
	citations: string[];
	warnings: string[];
}> {
	let fullContent = '';

	try {
		const response = await fetch(`${OLLAMA_URL}/api/generate`, {
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
""",

    "sveltekit-frontend/src/routes/chat/[id]/+page.svelte": r"""<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/stores';
    import { ChatSession } from '$lib/models/ChatSession.svelte';

    let { data } = $props(); // Load initial history from server load function

    // Initialize our Reactive Rune Class
    // page.params.id ensures we connect to the right channel
    const chat = $derived(new ChatSession($page.params.id, data?.history ?? []));

    $effect(() => {
        return () => chat.destroy(); // Cleanup on unmount
    });
</script>

<svelte:head>
    <title>Chat | Legal AI</title>
</svelte:head>

<!-- Messages container with test selectors -->
<div class="chat-window" data-testid="chat-window" data-role="chat-messages">
    {#each chat.messages as msg, i (i)}
        <div
            class="message {msg.role}"
            data-testid="chat-message"
            data-role={msg.role}
            data-author={msg.role}
        >
            <strong>{msg.role === 'user' ? 'You' : 'Legal AI'}:</strong>
            <p>{msg.content}</p>

            {#if msg.metadata?.confidence !== undefined}
                <span class="confidence" data-testid="confidence">
                    Confidence: {(msg.metadata.confidence * 100).toFixed(0)}%
                </span>
            {/if}

            {#if msg.metadata?.citations?.length}
                <div class="citations" data-testid="citations">
                    <strong>Sources:</strong>
                    {#each msg.metadata.citations as citation}
                        <span class="citation">{citation}</span>
                    {/each}
                </div>
            {/if}

            {#if msg.metadata?.warnings?.length}
                <div class="warning" data-testid="warning">
                    ⚠️ {msg.metadata.warnings.join(', ')}
                </div>
            {/if}
        </div>
    {/each}

    <!-- Loading/streaming indicator -->
    {#if chat.status === 'thinking'}
        <div class="loading" data-testid="loading" data-role="chat-streaming">
            AI is reviewing case context...
        </div>
    {/if}
</div>

<!-- Input form with test selectors -->
<form
    method="POST"
    action="?/send"
    use:enhance={() => {
        // Before submitting:
        const input = document.querySelector('input[name="message"]') as HTMLInputElement;
        const text = input.value;
        if (text) {
            chat.addMessage('user', text); // Optimistic UI update
            chat.sendMessage(); // Set status to thinking
            input.value = ''; // Clear input
        }

        return async ({ update }) => {
            await update({ reset: false });
        };
    }}
>
    <input
        type="text"
        name="message"
        required
        placeholder="Ask about the contract..."
        data-testid="chat-input"
        data-role="chat-input"
    />
    <button
        type="submit"
        disabled={chat.status === 'thinking'}
        data-testid="chat-send"
        data-role="chat-send"
    >
        Send
    </button>
</form>

<style>
    .chat-window {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        border: 1px solid #ccc;
        border-radius: 8px;
        height: 500px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    .message {
        padding: 10px;
        border-radius: 8px;
        max-width: 80%;
    }
    .message.user {
        align-self: flex-end;
        background-color: #e0f7fa;
    }
    .message.assistant {
        align-self: flex-start;
        background-color: #f1f8e9;
    }
    .loading {
        align-self: center;
        font-style: italic;
        color: #888;
        padding: 10px;
    }
    .confidence {
        display: block;
        font-size: 0.8em;
        color: #666;
        margin-top: 5px;
    }
    .citations {
        font-size: 0.85em;
        margin-top: 8px;
        padding: 5px;
        background: #f5f5f5;
        border-radius: 4px;
    }
    .citation {
        display: inline-block;
        margin: 2px 5px;
        padding: 2px 6px;
        background: #e0e0e0;
        border-radius: 3px;
    }
    .warning {
        margin-top: 8px;
        padding: 8px;
        background: #fff3cd;
        border: 1px solid #ffc107;
        border-radius: 4px;
        color: #856404;
    }
    form {
        max-width: 800px;
        margin: 20px auto;
        display: flex;
        gap: 10px;
    }
    input {
        flex: 1;
        padding: 10px;
        border: 1px solid #ccc;
        border-radius: 4px;
    }
    button {
        padding: 10px 20px;
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
    button:disabled {
        background-color: #ccc;
    }
</style>"""
}

def repair_files():
    base_dir = r"c:\Users\james\Videos\deeds-web-app"

    print(f"Starting repair of {len(files_to_fix)} files...")

    for relative_path, clean_content in files_to_fix.items():
        # Clean relative path to match OS
        full_path = os.path.join(base_dir, relative_path.replace("/", os.sep))

        try:
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(full_path), exist_ok=True)

            with open(full_path, "w", encoding="utf-8") as f:
                f.write(clean_content)

            print(f"✅ Repaired: {relative_path}")

        except Exception as e:
            print(f"❌ Failed to repair {relative_path}: {e}")

if __name__ == "__main__":
    repair_files()
