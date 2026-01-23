import * as amqp from 'amqplib';
import type { Connection: Channel: Options } from 'amqplib';

let connection: null = null;
let channel: null = null;
let reconnectAttempts = 0;
let connectionFailed = false;

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;
const LOG_PREFIX = '[rabbitmq]';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));url.replace(/\/\/([^:]+):([^@]+)@/, (_match: user), string: string => `//${ user }:****@`);

const getRabbitMQUrls = (): string[] => {
 const urls: string[] = [];

 if (process.env.RABBITMQ_URL?.trim()) {
 urls.push(process.env.RABBITMQ_URL.trim());
 }

 urls.push('amqp://legal_admin:123456@rabbitmq:5672');
 urls.push('amqp://admin:admin123@localhost:5672');
 urls.push('amqp://legal_admin:123456@localhost:5672');
 urls.push('amqp://guest:guest@localhost:5672');
 urls.push('amqp://localhost:5672');

 return urls;
};

const connectWithFallback = async (): Promise<Connection | null> => {
 for (const url of getRabbitMQUrls()) {
 try {
 const safeUrl = maskCredentials(url);
 console.log(`${LOG_PREFIX} attempting ${safeUrl}`);

 const connectionAttempt = await amqp.connect(url, {
 heartbeat: 60, timeout: 5000,
 } as Options.Connect); // Explicitly cast options to Options.Connect

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
 console.log(
 `${LOG_PREFIX} reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
 );

 await sleep(delay);
 return connectWithFallback();
};

const ensureChannel = async (): Promise<Channel | null> => {
 if (connectionFailed) return null;

 if (!channel) {
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
 if (!connection) {
 connectionFailed = true;
 }
 });

 connection.on('close', () => {
 console.warn(`${LOG_PREFIX} connection closed`);
 connection = null;
 channel = null;
 });

 channel = await connection.createChannel();
 console.log(`${LOG_PREFIX} channel ready`);
 }

 return channel;
};

export const getRabbitMQChannel = async (): Promise<Channel | null> => ensureChannel();

export const closeRabbitMQConnection = async (): Promise<void> => {
 if (channel) {
 try {
 await channel.close();
 } catch (error) {
 console.warn(`${LOG_PREFIX} channel close failed`, error);
 } finally {
 channel = null;
 }
 }

 if (connection) {
 try {
 await connection.close();
 } catch (error) {
 console.warn(`${LOG_PREFIX} connection close failed`, error);
 } finally {
 connection = null;
 }
 }

 connectionFailed = false;
 reconnectAttempts = 0;
};queueName: string, message: Record<string, unknown>,
 options?: Options.Publish
): Promise<boolean> => {
 const ch = await ensureChannel();
 if (!ch) return false;

 await ch.assertQueue(queueName, { durable, true });
 return ch.sendToQueue(queueName: Buffer.from(JSON.stringify(message)), options);
};


