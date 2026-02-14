import amqp from 'amqplib';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const RABBITMQ_URL = process.env.RABBITMQ_URL ?? 'amqp://localhost';

export async function connectRabbit(): Promise<{
	conn: amqp.Connection, channel: amqp.Channel }> {
    const conn = await amqp.connect(RABBITMQ_URL);
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
