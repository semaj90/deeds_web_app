// SvelteKit API Gateway for Legal AI Chat with vLLM integration
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    metadata?: {
        tensorIds?: string[];
        cacheKey?: string;
        tokens?: number;
        similarity?: number;
    };
}

interface LegalCase {
    id: string;
    title: string;
    description: string;
    messages: ChatMessage[];
    embeddings: string[];
    status: 'active' | 'archived';
}

// Custom vLLM orchestrator with memory-mapped KV caches
class LegalAIOrchestrator {
    private static instance: LegalAIOrchestrator;
    private fastApiUrl = 'http://localhost:8000';
    private tensorServiceUrl = 'http://localhost:8080';

    static getInstance(): LegalAIOrchestrator {
        if (!LegalAIOrchestrator.instance) {
            LegalAIOrchestrator.instance = new LegalAIOrchestrator();
        }
        return LegalAIOrchestrator.instance;
    }

    // Gemma3 legal model inference with memory reuse
    async generateResponse(
        caseId: string,
        messages: ChatMessage[],
        options: {
            userId: string;
            maxTokens?: number;
            temperature?: number;
            useKVCache?: boolean;
            reuseEmbeddings?: boolean;
        }
    ): Promise<AsyncGenerator<string, void, unknown>> {
        const {
            userId,
            maxTokens = 1024,
            temperature = 0.7,
            useKVCache = true,
            reuseEmbeddings = true
        } = options;

        // Generate cache key for KV reuse
        const cacheKey = this.generateCacheKey(caseId, messages, userId);

        // Check for reusable embeddings and KV caches
        let contextTensorIds: string[] = [];
        if (reuseEmbeddings) {
            contextTensorIds = await this.findReusableContext(caseId, messages, userId);
        }

        const requestBody = {
            messages: messages.map(m => ({
                role: m.role,
                content: m.content
            })),
            case_id: caseId,
            user_id: userId,
            max_tokens: maxTokens,
            temperature,
            stream: true,
            cache_key: useKVCache ? cacheKey : undefined,
            context_tensor_ids: contextTensorIds,
            model: 'gemma3-legal-latest' // Custom legal-trained Gemma3
        };

        // Stream from FastAPI vLLM service
        const response = await fetch(`${this.fastApiUrl}/chat/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-Id': userId,
                'X-Case-Id': caseId
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`vLLM service error: ${response.statusText}`);
        }

        // Create async generator for streaming
        return this.streamResponse(response);
    }

    private async *streamResponse(response: Response): AsyncGenerator<string, void, unknown> {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
            throw new Error('No response body');
        }

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') return;

                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.token) {
                                yield parsed.token;
                            }
                            if (parsed.tensor_id) {
                                // Store generated embeddings for reuse
                                await this.storeGeneratedEmbedding(parsed.tensor_id, parsed.embedding);
                            }
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    // Find reusable context from previous conversations
    private async findReusableContext(
        caseId: string,
        messages: ChatMessage[],
        userId: string
    ): Promise<string[]> {
        // Get similar conversations/embeddings
        const lastMessage = messages[messages.length - 1]?.content || '';

        const response = await fetch(`${this.fastApiUrl}/embed/similar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: lastMessage,
                case_id: caseId,
                user_id: userId,
                top_k: 5,
                threshold: 0.8
            })
        });

        if (response.ok) {
            const similar = await response.json();
            return similar.tensor_ids || [];
        }

        return [];
    }

    // Store AI-generated embeddings for future reuse
    private async storeGeneratedEmbedding(tensorId: string, embedding: number[]) {
        try {
            const tensorData = new Float32Array(embedding).buffer;

            await fetch(`${this.tensorServiceUrl}/tensor/${tensorId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Tensor-Shape': JSON.stringify([embedding.length]),
                    'X-Tensor-Dtype': 'float32',
                    'X-GPU-Reusable': 'true'
                },
                body: tensorData
            });
        } catch (error) {
            console.error('Failed to store generated embedding:', error);
        }
    }

    // Generate consistent cache key for KV reuse
    private generateCacheKey(caseId: string, messages: ChatMessage[], userId: string): string {
        const context = messages.slice(-3).map(m => m.content).join('|'); // Last 3 messages
        const hash = this.simpleHash(context);
        return `kv_${caseId}_${userId}_${hash}`;
    }

    private simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
}

// POST /api/chat/[caseId] - Generate AI response
export const POST: RequestHandler = async ({ params, request, cookies }) => {
    const { caseId } = params;

    // Authentication
    const sessionId = cookies.get('session');
    if (!sessionId) {
        throw error(401, 'Unauthorized');
    }

    const userId = 'user_' + sessionId.slice(0, 8);

    try {
        const {
            message,
            messages = [],
            maxTokens,
            temperature,
            useKVCache = true,
            reuseEmbeddings = true
        } = await request.json();

        // Add user message to conversation
        const userMessage: ChatMessage = {
            role: 'user',
            content: message,
            timestamp: Date.now()
        };

        const fullMessages = [...messages, userMessage];

        const orchestrator = LegalAIOrchestrator.getInstance();

        // Check if streaming is requested
        const acceptHeader = request.headers.get('accept');
        if (acceptHeader?.includes('text/event-stream')) {
            // Return streaming response
            const generator = await orchestrator.generateResponse(caseId, fullMessages, {
                userId,
                maxTokens,
                temperature,
                useKVCache,
                reuseEmbeddings
            });

            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                async start(controller) {
                    try {
                        for await (const token of generator) {
                            const data = `data: ${JSON.stringify({ token })}\n\n`;
                            controller.enqueue(encoder.encode(data));
                        }
                        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                        controller.close();
                    } catch (error) {
                        controller.error(error);
                    }
                }
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        } else {
            // Return complete response
            const generator = await orchestrator.generateResponse(caseId, fullMessages, {
                userId,
                maxTokens,
                temperature,
                useKVCache,
                reuseEmbeddings
            });

            let fullResponse = '';
            for await (const token of generator) {
                fullResponse += token;
            }

            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: fullResponse,
                timestamp: Date.now(),
                metadata: {
                    tokens: fullResponse.split(' ').length,
                    cacheKey: orchestrator['generateCacheKey'](caseId, fullMessages, userId)
                }
            };

            return json({
                message: assistantMessage,
                caseId,
                cached: false // TODO: implement proper cache detection
            });
        }
    } catch (err) {
        console.error('Chat generation error:', err);
        throw error(500, 'Failed to generate response');
    }
};

// GET /api/chat/[caseId] - Retrieve conversation history
export const GET: RequestHandler = async ({ params, url, cookies }) => {
    const { caseId } = params;

    const sessionId = cookies.get('session');
    if (!sessionId) {
        throw error(401, 'Unauthorized');
    }

    const userId = 'user_' + sessionId.slice(0, 8);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    try {
        // Fetch conversation from database/cache
        const response = await fetch(`http://localhost:8000/chat/history`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                case_id: caseId,
                user_id: userId,
                limit,
                offset
            })
        });

        if (!response.ok) {
            throw error(500, 'Failed to fetch conversation');
        }

        const data = await response.json();
        return json(data);
    } catch (err) {
        console.error('Conversation retrieval error:', err);
        throw error(500, 'Failed to retrieve conversation');
    }
};

// DELETE /api/chat/[caseId] - Clear conversation and caches
export const DELETE: RequestHandler = async ({ params, cookies }) => {
    const { caseId } = params;

    const sessionId = cookies.get('session');
    if (!sessionId) {
        throw error(401, 'Unauthorized');
    }

    const userId = 'user_' + sessionId.slice(0, 8);

    try {
        // Clear conversation and associated tensor caches
        const response = await fetch(`http://localhost:8000/chat/clear`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                case_id: caseId,
                user_id: userId,
                clear_tensors: true,
                clear_kv_cache: true
            })
        });

        if (!response.ok) {
            throw error(500, 'Failed to clear conversation');
        }

        return json({
            caseId,
            cleared: true,
            timestamp: Date.now()
        });
    } catch (err) {
        console.error('Conversation clear error:', err);
        throw error(500, 'Failed to clear conversation');
    }
};