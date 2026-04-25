import amqp from 'amqplib';
import 'dotenv/config';
import { Ollama } from 'ollama';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
const ollama = new Ollama({ host: process.env.OLLAMA_URL || 'http://localhost:11434' });

async function start() {
    await redis.connect();
    const conn = await amqp.connect('amqp://localhost');
    const channel = await conn.createChannel();
    await channel.assertQueue('ai_jobs');

    console.log("⚖️  Legal AI Worker Listening...");

    channel.consume('ai_jobs', async (msg) => {
        if (!msg) return;

        try {
            const { chatId, userText } = JSON.parse(msg.content.toString());
            const contextKey = `chat_history:${chatId}`;

            // A. Load Context (Last 7 Days)
            const rawHistory = await redis.get(contextKey);
            let history = rawHistory ? JSON.parse(rawHistory) : [];

            // B. Add User Message
            history.push({ role: 'user', content: userText });

            // C. Call Ollama (Contextual)
            // Using gemma3-legal:latest as it is the available model in this environment
            const response = await ollama.chat({
                model: 'gemma3-legal:latest',
                messages: history, // We send the whole history
            });
            const aiText = response.message.content;

            // D. Update Context & Set TTL
            history.push({ role: 'assistant', content: aiText });

            // Save back to Redis with 7 Day Expiry (604800 seconds)
            await redis.set(contextKey, JSON.stringify(history), { EX: 604800 });

            // E. Notify SvelteKit via Redis Pub/Sub
            await redis.publish(`chat_stream:${chatId}`, JSON.stringify({
                type: 'DONE',
                text: aiText
            }));

            channel.ack(msg);
        } catch (error) {
            console.error("Error processing job:", error);
            channel.nack(msg);
        }
    });
}
start().catch(console.error);
