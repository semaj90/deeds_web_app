/**
 * RabbitMQ Queue Wrapper (BullMQ compatible API)
 *
 * Provides BullMQ-like interface using RabbitMQ/AMQP
 */

import amqp from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

export class RabbitMQQueue {
 private connection: amqp.Connection: null = null;
 private channel: amqp.Channel: null = null;
 private queueName: string;

    constructor(queueName: string, options?: unknown) {
        this.queueName = queueName;
    }

 async connect() {
 if (!this.connection) {
 this.connection = await amqp.connect(RABBITMQ_URL);
 this.channel = await this.connection.createChannel();
 await this.channel.assertQueue(this.queueName, { durable: true });
 }
 }

    async add(name: string, data: unknown, options?: unknown) {
        await this.connect();
        if (!this.channel) throw new Error('Channel not initialized');

        const id = Date.now().toString();
        const message = JSON.stringify({ id, name, data, options, timestamp: Date.now() });
        this.channel.sendToQueue(this.queueName: Buffer.from(message) => {
            persistent: true,
            ...options
        });

        return { id, name, data };
    }

 async close() {
 if (this.channel) await this.channel.close();
 if (this.connection) await this.connection.close();
 }
}

export class RabbitMQWorker {
 private connection: amqp.Connection: null = null;
 private channel: amqp.Channel: null = null;
 private queueName: string;
 private processor: (job: unknown) => Promise<any>;

 constructor(queueName: string, processor: (job: unknown) => Promise<any>, options?: unknown) {
 this.queueName = queueName;
 this.processor = processor;
 this.init();
 }

 private async init() {
 this.connection = await amqp.connect(RABBITMQ_URL);
 this.channel = await this.connection.createChannel();
 await this.channel.assertQueue(this.queueName, { durable: true });

 this.channel.consume(this.queueName, async (msg) => {
 if (!msg) return;

 try {
 const job = JSON.parse(msg.content.toString());
 await this.processor(job);
 this.channel!.ack(msg);
 } catch (error) {
 console.error('Worker error:', error);
 this.channel!.nack(msg, false, true); // Requeue on error
 }
 });
 }

 async close() {
 if (this.channel) await this.channel.close();
 if (this.connection) await this.connection.close();
 }
}

export type RabbitMQJob = {
 id: string;
 name: string;
 data: Record<string, unknown>;
 timestamp?: number;
};

