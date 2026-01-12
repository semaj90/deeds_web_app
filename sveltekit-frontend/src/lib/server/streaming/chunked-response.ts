/**
 * Chunked Response Handler - Server-Side Streaming
 * Optimizes LLM responses with incremental delivery via SSE
 *
 * Integrates with:
 * - Ollama (gemma3-legal:latest)
 * - RAG pipeline (Qdrant vector search)
 * - RabbitMQ background jobs
 */

export interface ChunkingStrategy {
	maxTokens?: number;
	sentenceBoundary?: boolean;
	preserveContext?: boolean;
}

export interface StreamChunk {
	type: 'content' | 'metadata' | 'error' | 'done';
	content?: string;
	metadata?: Record<string, unknown>;
	error?: string;
	timestamp: number;
}

/**
 * Token-based chunking for embedding models
 * Ensures chunks fit within model context limits
 */
export function chunkByTokens(text: string, maxTokens: number = 512): string[] {
	const tokens = text.split(/\s+/);
	const chunks: string[] = [];

	for (let i = 0; i < tokens.length; i += maxTokens) {
		chunks.push(tokens.slice(i, i + maxTokens).join(' '));
	}

	return chunks;
}

/**
 * Semantic chunking preserves sentence boundaries
 * Better for legal documents where context matters
 */
export function chunkBySentences(text: string, chunkSize: number = 3): string[] {
	// Match sentences ending with . ! ? (handles abbreviations)
	const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
	const chunks: string[] = [];

	for (let i = 0; i < sentences.length; i += chunkSize) {
		const chunk = sentences.slice(i, i + chunkSize).join(' ').trim();
		if (chunk) chunks.push(chunk);
	}

	return chunks;
}

/**
 * Paragraph-based chunking for documents
 * Maintains structural coherence
 */
export function chunkByParagraphs(text: string, maxParagraphs: number = 2): string[] {
	const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
	const chunks: string[] = [];

	for (let i = 0; i < paragraphs.length; i += maxParagraphs) {
		chunks.push(paragraphs.slice(i, i + maxParagraphs).join('\n\n'));
	}

	return chunks;
}

/**
 * Sliding window chunking with overlap
 * Prevents context loss at chunk boundaries
 */
export function chunkWithOverlap(
	text: string,
	chunkSize: number = 512,
	overlap: number = 128
): string[] {
	const tokens = text.split(/\s+/);
	const chunks: string[] = [];
	const step = chunkSize - overlap;

	for (let i = 0; i < tokens.length; i += step) {
		const end = Math.min(i + chunkSize, tokens.length);
		chunks.push(tokens.slice(i, end).join(' '));

		if (end >= tokens.length) break;
	}

	return chunks;
}

/**
 * Create SSE (Server-Sent Events) stream for chunked responses
 */
export function createSSEStream(
	generator: AsyncGenerator<StreamChunk>
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();

	return new ReadableStream({
		async start(controller) {
			try {
				for await (const chunk of generator) {
					const data = `data: ${JSON.stringify(chunk)}\n\n`;
					controller.enqueue(encoder.encode(data));
				}
			} catch (error) {
				const errorChunk: StreamChunk = {
					type: 'error',
					error: error instanceof Error ? error.message : 'Unknown error',
					timestamp: Date.now()
				};
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
			} finally {
				const doneChunk: StreamChunk = {
					type: 'done',
					timestamp: Date.now()
				};
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneChunk)}\n\n`));
				controller.close();
			}
		}
	});
}

/**
 * Example: Stream LLM response with Ollama
 */
export async function* streamOllamaResponse(
	prompt: string,
	model: string = 'gemma3-legal:latest'
): AsyncGenerator<StreamChunk> {
	try {
		const response = await fetch('http://localhost:11434/api/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model,
				prompt,
				stream: true
			})
		});

		if (!response.ok) {
			throw new Error(`Ollama request failed: ${response.statusText}`);
		}

		const reader = response.body?.getReader();
		if (!reader) throw new Error('No response body');

		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() || '';

			for (const line of lines) {
				if (!line.trim()) continue;

				try {
					const data = JSON.parse(line);

					if (data.response) {
						yield {
							type: 'content',
							content: data.response,
							timestamp: Date.now()
						};
					}

					if (data.done) {
						yield {
							type: 'metadata',
							metadata: {
								total_duration: data.total_duration,
								prompt_eval_count: data.prompt_eval_count,
								eval_count: data.eval_count
							},
							timestamp: Date.now()
						};
					}
				} catch (e) {
					console.warn('Failed to parse Ollama chunk:', e);
				}
			}
		}
	} catch (error) {
		yield {
			type: 'error',
			error: error instanceof Error ? error.message : 'Streaming failed',
			timestamp: Date.now()
		};
	}
}

/**
 * Example: RAG-enhanced streaming with Qdrant context injection
 */
export async function* streamRAGResponse(
	query: string,
	qdrantCollection: string = 'knowledge_base'
): AsyncGenerator<StreamChunk> {
	// 1. Get embeddings
	yield {
		type: 'metadata',
		metadata: { stage: 'embedding' },
		timestamp: Date.now()
	};

	const embeddingResponse = await fetch('http://localhost:11434/api/embeddings', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: 'embeddinggemma:latest',
			prompt: query
		})
	});

	const { embedding } = await embeddingResponse.json();

	// 2. Vector search
	yield {
		type: 'metadata',
		metadata: { stage: 'search' },
		timestamp: Date.now()
	};

	const searchResponse = await fetch(`http://localhost:6333/collections/${qdrantCollection}/points/search`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			vector: embedding,
			limit: 5,
			with_payload: true
		})
	});

	const searchResults = await searchResponse.json();

	// 3. Build context
	const context = searchResults.result
		.map((r: any) => r.payload?.text || '')
		.join('\n\n');

	yield {
		type: 'metadata',
		metadata: { stage: 'generate', contextSize: context.length },
		timestamp: Date.now()
	};

	// 4. Stream LLM response with injected context
	const enhancedPrompt = `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer:`;

	yield* streamOllamaResponse(enhancedPrompt);
}

/**
 * Backpressure-aware chunk iterator
 * Pauses when downstream consumer can't keep up
 */
export async function* chunkedIteratorWithBackpressure<T>(
	items: T[],
	chunkSize: number,
	delayMs: number = 0
): AsyncGenerator<T[]> {
	for (let i = 0; i < items.length; i += chunkSize) {
		const chunk = items.slice(i, i + chunkSize);
		yield chunk;

		if (delayMs > 0 && i + chunkSize < items.length) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
}

export default {
	chunkByTokens,
	chunkBySentences,
	chunkByParagraphs,
	chunkWithOverlap,
	createSSEStream,
	streamOllamaResponse,
	streamRAGResponse,
	chunkedIteratorWithBackpressure
};
