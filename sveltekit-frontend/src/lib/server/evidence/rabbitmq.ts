import amqp from 'amqplib';
import { ENV } from '$lib/server/env.server.js';

const RABBITMQ_URL = ENV.RABBITMQ_URL;

export async function connectRabbit(): Promise<{
	conn: any, channel: any }> {
    const conn = await (amqp as any).connect(RABBITMQ_URL);
    conn.on('error', (err: unknown) => {
        console.error('[evidence-rabbitmq] RabbitMQ connection error (handled):', err instanceof Error ? err.message : err);
    });
    conn.on('close', () => {
        console.warn('[evidence-rabbitmq] RabbitMQ connection closed');
    });
    const channel = await conn.createChannel();
    return { conn, channel };
}

export async function publish(queue: string, msg: any): Promise<void> {
    const { conn, channel } = await connectRabbit();
    try {
        await channel.assertQueue(queue, { durable: true });
        channel.sendToQueue(queue, Buffer.from(JSON.stringify(msg)), { persistent: true });
    } finally {
        setTimeout(() => conn.close(), 500);
    }
}

export async function consume(queue: string, onMessage: (msg: unknown) => Promise<void>) {
    const { conn, channel } = await connectRabbit();
    await channel.assertQueue(queue, { durable: true });
    channel.prefetch(1);

    channel.consume(queue, async (m) => {
        if (!m) return;
        try {
            const payload = JSON.parse(m.content.toString());
            await onMessage(payload);
            channel.ack(m);
        } catch (err) {
            console.error('Worker error', err);
            channel.nack(m, false, false);
        }
    });

    return { conn, channel };
}
