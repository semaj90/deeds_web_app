// amqplib types don't resolve with bundler moduleResolution — use local interfaces
interface AmqpConnection {
    on(event: string, cb: (...args: any[]) => void): void;
    createChannel(): Promise<AmqpChannel>;
    close(): Promise<void>;
}

interface AmqpChannel {
    close(): Promise<void>;
    assertQueue(queue: string, opts?: Record<string, unknown>): Promise<any>;
    sendToQueue(queue: string, content: Buffer, opts?: Record<string, unknown>): boolean;
    consume(queue: string, cb: (msg: any) => void, opts?: Record<string, unknown>): Promise<any>;
    ack(msg: any): void;
    nack(msg: any, allUpTo?: boolean, requeue?: boolean): void;
    prefetch(count: number): void;
    on(event: string, cb: (...args: any[]) => void): void;
    once(event: string, cb: (...args: any[]) => void): void;
}

const RABBITMQ_URL = ENV.RABBITMQ_URL;

let connection: AmqpConnection | null = null;
let channel: AmqpChannel | null = null;

export async function getRabbitConnection(): Promise<AmqpConnection> {
    if (connection) return connection;
    try {
        const amqplib = await import('amqplib');
        connection = await (amqplib as any).connect(RABBITMQ_URL) as AmqpConnection;

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

export async function getRabbitChannel(): Promise<AmqpChannel> {
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

/** Alias for getRabbitChannel - used by publish endpoint */
export const getChannel = getRabbitChannel;

/** Check RabbitMQ connection health */
export async function checkHealth(): Promise<{ connected: boolean; error?: string }> {
    try {
        const conn = await getRabbitConnection();
        return { connected: !!conn };
    } catch (err) {
        return { connected: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
}

/** Get current connection config info */
export function getCurrentConfig() {
    return {
        url: RABBITMQ_URL,
        description: connection ? `Connected to ${RABBITMQ_URL}` : 'Not connected',
        connected: !!connection,
    };
}
