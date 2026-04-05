import { setCache } from '$lib/server/utils/server-cache.js';
import { ENV } from '$lib/server/env.server.js';

const RABBITMQ_URL = ENV.RABBITMQ_URL;
const QUEUE_NAME = "summarization_tasks";

export async function summarizeWithQueue(content: string, documentId: string): Promise<any> {
    try {
        const amqplib = await import("amqplib") as any;
        const connection = await (amqplib.connect ?? amqplib.default)(RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_NAME, { durable: true });

        const task = { documentId, content };
        channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(task)), { persistent: true });

        await channel.close();
        await connection.close();
    } catch (e: any) {
        // If RabbitMQ is not available, fall back to immediate cache mark
        console.warn("RabbitMQ unavailable, marking as processing only:", e?.message);
    }

    await setCache(documentId, { status: "processing" });
    return { success: true, message: "Summarization task queued (or marked processing)." };
}
