import * as amqp from 'amqplib';
import type { Connection, Channel, Options } from 'amqplib';

let connection: Connection | null = null;
let channel: Channel | null = null;
let reconnectAttempts = 0;
let connectionFailed = false;

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;
const LOG_PREFIX = '[rabbitmq]';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Simple mask helper
const maskCredentials = (url: string) => {
    return url.replace(/\/\/([^:]+):([^@]+)@/, (_, user) => `//${user}:****@`);
};

const getRabbitMQUrls = (): string[] => {
    const urls: string[] = [];
    if (process.env.RABBITMQ_URL?.trim()) {
        urls.push(process.env.RABBITMQ_URL.trim());
    }
    // Fallbacks
    urls.push('amqp://guest:guest@localhost:5672');
    return urls;
};

const connectWithFallback = async (): Promise<Connection | null> => {
    for (const url of getRabbitMQUrls()) {
        try {
            const safeUrl = maskCredentials(url);
            console.log(`${LOG_PREFIX} attempting ${safeUrl}`);

            const connectionAttempt = await amqp.connect(url, {
                heartbeat: 60,
                timeout: 5000,
            } as any);

            console.log(`${LOG_PREFIX} connected ${safeUrl}`);
            reconnectAttempts = 0;
            return connectionAttempt;
        } catch (error) {
            const err = error as Error;
            console.warn(`${LOG_PREFIX} connect failed (${err.message})`);
        }
    }
    return null;
};

const reconnectWithRetry = async (): Promise<Connection | null> => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`${LOG_PREFIX} max reconnect attempts reached`);
        connectionFailed = true;
        return null;
    }

    reconnectAttempts += 1;
    const delay = RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1);
    console.log(`${LOG_PREFIX} reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    await sleep(delay);
    return connectWithFallback();
};

const ensureChannel = async (): Promise<Channel | null> => {
    if (connectionFailed) return null;

    if (!channel) {
        if (!connection) {
            connection = await connectWithFallback();
            if (!connection) {
                console.warn(`${LOG_PREFIX} connection unavailable, scheduling retry`);
                connection = await reconnectWithRetry();
                if (!connection) return null;
            }

            connection.on('error', async (err: Error) => {
                console.error(`${LOG_PREFIX} connection error`, err);
                channel = null;
                connection = await reconnectWithRetry();
                if (!connection) connectionFailed = true;
            });

            connection.on('close', () => {
                console.warn(`${LOG_PREFIX} connection closed`);
                connection = null;
                channel = null;
            });
        }

        if (connection) {
            try {
                channel = await connection.createChannel();
                console.log(`${LOG_PREFIX} channel ready`);
            } catch (e) {
                console.error(`${LOG_PREFIX} failed to create channel`, e);
                channel = null;
            }
        }
    }
    return channel;
};

export const getRabbitMQChannel = async (): Promise<Channel | null> => ensureChannel();

export const closeRabbitMQConnection = async (): Promise<void> => {
    if (channel) {
        try { await channel.close(); } catch { }
        finally { channel = null; }
    }
    if (connection) {
        try { await connection.close(); } catch { }
        finally { connection = null; }
    }
    connectionFailed = false;
    reconnectAttempts = 0;
};

export const publishMessage = async (
    queueName: string,
    message: Record<string, unknown>,
    options?: Options.Publish
): Promise<boolean> => {
    const ch = await ensureChannel();
    if (!ch) return false;

    await ch.assertQueue(queueName, { durable: true });
    return ch.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), options);
};
