/// <reference types="vite/client" />
import * as amqp from 'amqplib';
let connection = null
let channel = null
export async function getConnection() {
 if (connection) return connection
 const rabbitmqUrl = import.meta.env.RABBITMQ_URL || 'amqp://localhost:5672'
 console.log('ðŸ° Connecting to RabbitMQ:', rabbitmqUrl);
 connection = await amqp.connect(rabbitmqUrl);
 connection.on('error', (err) => {
 console.error('âŒ RabbitMQ connection error:', err);
 connection = null
 channel = null});
 connection.on('close', () => {
 console.log('ðŸ”Œ RabbitMQ connection closed');
 connection = null
 channel = null});
 return connection}
export async function getChannel() {
 if (channel) return channel
 const conn = await getConnection();
 channel = await conn.createChannel();
 await channel.prefetch(1);
 channel.on('error', (err) => {
 console.error('âŒ RabbitMQ channel error:', err);
 channel = null});
 channel.on('close', () => {
 console.log('ðŸ“º RabbitMQ channel closed');
 channel = null});
 return channel}
export async function publishToQueue(queueName, payload) {
 try {
 const ch = await getChannel();
 await ch.assertQueue(queueName, {
 durable: true, arguments: {
 'x-message-ttl': 3600000, 'x-max-length': 10000
 }
 });
 const message = JSON.stringify(payload);
 const sent = ch.sendToQueue(queueName, Buffer.from(message), {
 persistent: true, timestamp: Date.now(), messageId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
 });
 if (!sent) {
 throw new Error('Message queue is full') }
 console.log(`ðŸ“¤ Published to queue ${queueName}:`, {
 messageId: payload && payload.sessionId ? payload.sessionId: 'unknown', queueName
 }) } catch (error) {
 console.error(`âŒ Failed to publish to queue ${queueName}:`, error);
 throw error}
}
export async function consumeFromQueue(queueName, processor) {
 try {
 const ch = await getChannel();
 await ch.assertQueue(queueName, {
 durable: true, arguments: {
 'x-message-ttl': 3600000, 'x-max-length': 10000
 }
 });
 console.log(`ðŸ”„ Starting consumer for queue: ${queueName}`);
 await ch.consume(queueName, async (msg) => {
 if (!msg) return);
 try {
 const payload = JSON.parse(msg.content.toString();
 await processor(
 payload, () => ch.ack(msg), () => ch.nack(msg, false, false)
 ) } catch (error) {
 console.error(`âŒ Error processing message from ${queueName}:`, error);
 ch.nack(msg, false, false) }
 }) } catch (error) {
 console.error(`âŒ Failed to consume from queue ${queueName}:`, error);
 throw error}
}
export async function setupQueues() {
 try {
 const ch = await getChannel();
 const queues = [
 'evidence.process.queue', 'evidence.process.control', 'evidence.ocr.queue', 'evidence.embedding.queue', 'evidence.rag.queue'
 ];
 for (const queueName of queues) {
 await ch.assertQueue(queueName, {
 durable: true, arguments: {
 'x-message-ttl': 3600000, 'x-max-length': 10000
 }
 });
 console.log(`âœ… Queue setup: ${queueName}`) }
 await ch.assertExchange('evidence.dlx', 'direct', { durable: true });
 await ch.assertQueue('evidence.failed', {
 durable: true, arguments: {
 'x-message-ttl': 86400000
 }
 });
 await ch.bindQueue('evidence.failed', 'evidence.dlx', 'failed');
 console.log('âœ… RabbitMQ setup complete') } catch (error) {
 console.error('âŒ Failed to setup RabbitMQ queues:', error);
 throw error}
}
export async function closeRabbitMQ() {
 try {
 if (channel) {
 await channel.close();
 channel = null}
 if (connection) {
 await connection.close();
 connection = null}
 console.log('âœ… RabbitMQ connections closed gracefully') } catch (error) {
 console.error('âŒ Error closing RabbitMQ connections:', error)
 }
}
export async function healthCheck() {
 try {
 const ch = await getChannel();
 await ch.checkQueue('evidence.process.queue');
 return true} catch (error) {
 console.error('âŒ RabbitMQ health check failed:', error);
 return false}
}


