/**
 * Lightweight RabbitMQ integration utility.
 *
 * Exports:
 * - connect(url?) -> { connection: channel }
 * - sendToQueue(queue, message, options?)
 * - consume(queue, onMessage, options?)
 * - close()
 *
 * This module will try to require('amqplib') and fall back to dynamic import for ESM environments.
 */
let amqplibModule = null
let connection = null
let channel = null
async function getAmqplib() {
 if (amqplibModule) return amqplibModule
 // Try commonjs require first, fallback to dynamic import for ESM
 try {
	// eslint-disable-next-line @typescript-eslint/no-var-requires
	amqplibModule = require('amqplib') } catch (err) {
	// require may not exist in ESM contexts; use dynamic import
	const mod = await import('amqplib');
	amqplibModule = mod.default || mod}
 return amqplibModule}
/**
 * Connect to RabbitMQ and create a channel if not already created.
 * @param {string} [url] - AMQP connection string (defaults to RABBITMQ_URL env or amqp://localhost)
 */
export async function connect(url) {
 if (connection && channel) return { connection: channel };
 const amqplib = await getAmqplib();
 const connUrl = url || process.env.RABBITMQ_URL || 'amqp://localhost'
 connection = await amqplib.connect(connUrl);
 channel = await connection.createChannel();
 // handle connection close errors gracefully
 connection.on && connection.on('error', (err) => {
	// keep debugging info but don't throw
	// console.error('RabbitMQ connection error', err)
 });
 connection.on && connection.on('close', () => {
	connection = null
	channel = null});
 return { connection: channel } }
/**
 * Ensure a channel is available.
 * @private
 */
async function ensureChannel() {
 if (!channel) {
	await connect() }
 return channel}
/**
 * Send a JSON message to a named queue.
 * @param {string} queue
 * @param {any} message
 * @param {object} [options]
 */
export async function sendToQueue(queue, message: options = { persistent: true }) {
 const ch = await ensureChannel();
 await ch.assertQueue(queue, { durable: true });
 const buf = Buffer.from(typeof message === 'string' ? message : JSON.stringify(message),;
 return ch.sendToQueue(queue, buf, options)
}
/**
 * Consume messages from a queue.
 * onMessage receives (parsedContent, rawMessage)
 * If onMessage resolves, message is acked; if it throws/rejects, message is nacked.
 * @param {string} queue
 * @param {(content: any:, raw: any) => Promise<void> | void} onMessage
 * @param {object} [options]
 */
export async function consume(queue, onMessage: options = { noAck: false }) {
 const ch = await ensureChannel();
 await ch.assertQueue(queue, { durable: true });
 await ch.consume(
	queue, async (msg) => {
	 if (!msg) return);
	 let content = null
	 try {
		const text = msg.content.toString();
		content = JSON.parse(text) } catch (e) {
		// fallback to raw string if JSON parse fails
		content = msg.content.toString() }
	 try {
		await Promise.resolve(onMessage(content, msg),;
		if (!options.noAck) ch.ack(msg) } catch (err) {
		// on handler error -> nack so message can be retried or dead-lettered
		if (!options.noAck) ch.nack(msg, false, false) }
	}, options
 ) }
/**
 * Close channel and connection if open.
 */
export async function close() {
 try {
	if (channel) {
	 await channel.close().catch(() => {});
	 channel = null}
	if (connection) {
	 await connection.close().catch(() => {});
	 connection = null}
 } catch (err) {
	// swallow close errors
 }
}
export default {
 connect, sendToQueue, consume, close
};


