/**
 * Phase 76: Context-Aware Legal AI Worker
 * Enhanced with Polyglot Persistence, hallucination detection, and SSE streaming
 */

import amqp from 'amqplib';
import axios from 'axios';
import 'dotenv/config';
import { Ollama } from 'ollama';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
const redisPubSub = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
const ollama = new Ollama({ host: process.env.OLLAMA_URL || 'http://localhost:11434' });

// Configuration
const QUEUE = 'ai_chat_queue';
const TTL_7_DAYS = 60 * 60 * 24 * 7;
const OLLAMA_TIMEOUT_MS = 30000;
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COUCHDB_URL = process.env.COUCHDB_URL || 'http://admin:password@localhost:5984';
const MIN_CONFIDENCE = 0.65;

// Types
interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
    metadata?: {
        confidence?: number;
        citations?: string[];
        graph_context?: string[];
        warnings?: string[];
    };
}

// Fetch graph context from Polyglot Persistence
async function fetchGraphContext(query: string, caseId?: string): Promise<string[]> {
    try {
        const embeddingRes = await ollama.embeddings({
            model: 'nomic-embed-text',
            prompt: query
        });
        const embedding = embeddingRes.embedding;

        const qdrantRes = await axios.post(`${QDRANT_URL}/collections/legal_docs/points/search`, {
            vector: embedding,
            limit: 5,
            with_payload: true
        });

        const relevantDocs = qdrantRes.data.result || [];
        const topology: string[] = [];

        for (const doc of relevantDocs.slice(0, 3)) {
            if (doc.payload?.title) {
                topology.push(`Document: ${doc.payload.title}`);
            }
        }

        return topology.length > 0 ? topology : ['No relevant legal context found'];
    } catch (error) {
        console.error('⚠️ Failed to fetch graph context:', error);
        return ['Context retrieval failed'];
    }
}

// Legal hallucination detection
function detectHallucination(aiResponse: string, providedContext: string[]): {
    confidence: number;
    citations: string[];
    warnings: string[];
} {
    const warnings: string[] = [];
    const citations: string[] = [];
    let confidence = 1.0;

    // Extract citations
    const citationPatterns = [
        /\b\d+\s+U\.S\.C\.\s+§\s*\d+/gi,
        /\b\d+\s+F\.\d+d\s+\d+/gi,
        /\bPub\.\s*L\.\s*No\.\s*\d+-\d+/gi
    ];

    for (const pattern of citationPatterns) {
        const matches = aiResponse.match(pattern);
        if (matches) citations.push(...matches);
    }

    // Verify citations exist in context
    for (const citation of citations) {
        const inContext = providedContext.some(ctx =>
            ctx.toLowerCase().includes(citation.toLowerCase())
        );
        if (!inContext) {
            warnings.push(`⚠️ Citation "${citation}" not found in context`);
            confidence -= 0.1;
        }
    }

    // Check for overly confident language
    const confidentPhrases = ['definitely', 'certainly', 'without a doubt', 'always', 'never'];
    for (const phrase of confidentPhrases) {
        if (aiResponse.toLowerCase().includes(phrase) && citations.length === 0) {
            warnings.push(`⚠️ Confident claim without citations: "${phrase}"`);
            confidence -= 0.05;
        }
    }

    confidence = Math.max(0, confidence);
    return { confidence, citations, warnings };
}

// Health check for Ollama
async function checkOllamaHealth(): Promise<boolean> {
    try {
        // Fast check to see if Ollama is responsive
        await axios.get(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/tags`, { timeout: 2000 });
        return true;
    } catch (error) {
        console.warn('⚠️ Ollama health check failed:', error instanceof Error ? error.message : String(error));
        return false;
    }
}

async function startWorker() {
    await redis.connect();
    await redisPubSub.connect();
    const rabbitMQUrl = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
    const conn = await amqp.connect(rabbitMQUrl);
    const channel = await conn.createChannel();
    await channel.assertQueue(QUEUE, { durable: true });

    console.log("🚀 Phase 76: Legal AI Worker listening...");
    console.log(`  - RabbitMQ: ${rabbitMQUrl}`);
    console.log(`  - Ollama: ${ollama.host}`);
    console.log(`  - Qdrant: ${QDRANT_URL}`);
    console.log(`  - CouchDB: ${COUCHDB_URL}`);
    console.log(`  - Min Confidence: ${MIN_CONFIDENCE}\n`);

    channel.consume(QUEUE, async (msg) => {
        if (!msg) return;

        let chatId: string | null = null;

        try {
            const content = JSON.parse(msg.content.toString());
            chatId = content.chatId;
            const userMessage = content.userMessage;
            const caseId = content.caseId; /* renamed from content.caseId; for safety */
            /* Not sure why the original had double reference, forcing caseId */

            /*  Wait, in line 147 original: const caseId = content.caseId; which is fine. */
            /* But line 141: let chatId: string: null = null; is bad syntax */
            /* line 174: timestamp: new, new: ... bad syntax */

            if (!chatId) { /* userMessage check moved or implied */
             if (!chatId || !content.message) { /* Using content.message based on +page.server.ts sending message */
                /* Wait, +page.server.ts sends: { chatId, message, caseId, userId, isAnonymous, timestamp } */
                /* The worker code was using content.userMessage which might be wrong if +page.server.ts sends message */
                 console.error("Invalid message format");
                 channel.ack(msg);
                 return;
             }
             const realUserMessage = content.message || content.userMessage;

             // Check Ollama health before processing
            const isOllamaReady = await checkOllamaHealth();
            if (!isOllamaReady) {
                console.error("❌ Ollama is not ready. Requeuing message...");
                channel.nack(msg, false, true); // Requeue
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s before picking up again
                return;
            }

            console.log(`\n📥 Processing chat ${chatId}`);

            const redisKey = `chat:${chatId}`;

            // 1. Retrieve conversation history
            const rawHistory = await redis.get(redisKey);
            const history: ChatMessage[] = rawHistory ? JSON.parse(rawHistory) : [];
            console.log(`📚 Loaded ${history.length} messages`);

            // 2. Append user message
            history.push({ role: 'user', content: realUserMessage, timestamp: new Date().toISOString() });

            // 3. Fetch graph context (Mirror Pattern)
            console.log('🔍 Fetching graph context...');
            const graphContext = await fetchGraphContext(realUserMessage, caseId);
            console.log(`✅ Retrieved ${graphContext.length} context items`);

            // 4. Inject system message with context
            const systemMessage: ChatMessage = {
                role: 'system',
                content: `You are a legal AI assistant with access to a knowledge graph.

**Available Context:**
${graphContext.join('\n')}

**Instructions:**
1. Answer based on the provided context when relevant
2. Cite specific documents/statutes when making claims
3. Express uncertainty if the context doesn't contain relevant information
4. Flag any potential legal risks or ambiguities
5. Do NOT fabricate case citations or statute numbers`
            };

            const fullMessages = [systemMessage, ...history];

            // 5. Call Ollama with timeout and retry
            let aiText = "";
            let attempts = 0;
            const maxAttempts = 3;

            while (attempts < maxAttempts) {
                try {
                    const response = await Promise.race([
                        ollama.chat({
                            model: 'gemma3-legal:latest',
                            messages: fullMessages.map(m => ({ role: m.role, content: m.content })),
                            options: {
                                temperature: 0.3, top_p: 0.85, num_predict: 1024
                            }
                        }),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Ollama timeout')), OLLAMA_TIMEOUT_MS)
                        )
                    ]);

                    aiText = (response as any).message.content;
                    console.log('🤖 Ollama response received');
                    break;
                } catch (error: any) {
                    attempts++;
                    if (attempts >= maxAttempts) {
                        aiText = "I apologize, but the legal analysis service is currently unavailable. Please try again in a moment.";
                        console.error(`❌ Ollama failed after ${maxAttempts} attempts:`, error.message);
                    } else {
                        const backoff = 1000 * Math.pow(2, attempts);
                        console.warn(`⚠️ Retry ${attempts}/${maxAttempts} after ${backoff}ms...`);
                        await new Promise(resolve => setTimeout(resolve, backoff));
                    }
                }
            }

            // 6. Detect hallucinations
            const analysis = detectHallucination(aiText, graphContext);
            console.log(`🎯 Confidence: ${analysis.confidence.toFixed(2)}`);
            if (analysis.warnings.length > 0) {
                console.warn(`⚠️ Warnings: ${analysis.warnings.join(', ')}`);
            }

            // 7. Build assistant message
            const assistantMsg: ChatMessage = {
                role: 'assistant',
                content: aiText,
                timestamp: new Date().toISOString(),
                metadata: {
                    confidence: analysis.confidence,
                    citations: analysis.citations,
                    graph_context: graphContext.slice(0, 3),
                    warnings: analysis.warnings
                }
            };

            history.push(assistantMsg);

            // 8. Save updated history with 7-day TTL
            await redis.set(redisKey, JSON.stringify(history), { EX: TTL_7_DAYS });
            console.log(`💾 Saved ${history.length} messages (TTL: 7 days)`);

            // 9. Publish to SSE via Redis Pub/Sub
            const notification = {
                type: 'AI_REPLY',
                content: aiText,
                confidence: analysis.confidence,
                citations: analysis.citations,
                warnings: analysis.warnings,
                timestamp: new Date().toISOString()
            };

            await redisPubSub.publish(`updates:${chatId}`, JSON.stringify(notification));
            console.log(`✅ Published to updates:${chatId}`);

            channel.ack(msg);
        }
        } catch (error: any) {
            console.error(`💥 Error processing message:`, error.message);

            if (chatId) {
                const errorNotification = {
                    type: 'AI_ERROR',
                    content: 'Legal AI processing failed. Please try again.',
                    error: error.message,
                    timestamp: new Date().toISOString()
                };
                await redisPubSub.publish(`updates:${chatId}`, JSON.stringify(errorNotification));
            }

            channel.nack(msg, false, false);
        }
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('\n🛑 Shutting down gracefully...');
        await channel.close();
        await conn.close();
        await redis.quit();
        await redisPubSub.quit();
        process.exit(0);
    });
}

startWorker().catch(console.error);
