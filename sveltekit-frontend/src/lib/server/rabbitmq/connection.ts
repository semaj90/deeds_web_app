import { connect, type Connection, type Channel } from 'amqplib';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';

let connection: Connection | null = null;
let channel: Channel | null = null;

export async function getRabbitConnection(): Promise<Connection> {
    if (connection) return connection;
    try {
        connection = await connect(RABBITMQ_URL);

        connection.on('error', (err) => {
            console.error('RabbitMQ connection error', err);
            connection = null;
            channel = null;
        });

        connection.on('close', () => {
            console.warn('RabbitMQ connection closed');
            connection = null;
            channel = null;
        });

        return connection;
    } catch (err) {
        console.error('Failed to connect to RabbitMQ', err);
        throw err;
    }
}

export async function getRabbitChannel(): Promise<Channel> {
    if (channel) return channel;
    const conn = await getRabbitConnection();
    channel = await conn.createChannel();
    return channel;
}

export async function closeRabbitConnection() {
    if (channel) {
        await channel.close();
        channel = null;
    }
    if (connection) {
        await connection.close();
        connection = null;
    }
}
