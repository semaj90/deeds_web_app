
// src/lib/server/rabbitmq-service.ts

/**
 * Simplified RabbitMQ Service for queue management in backend
 */

export interface QueueOptions {
    durable: boolean;
}

export class RabbitMQServiceStub {
    async connect() {
        console.log("RabbitMQService (Stub) connected");
    }

    async ensureQueue(queueName: string, options?: QueueOptions) {
        console.log(`RabbitMQService (Stub) ensuring queue: ${queueName}`);
    }

    async publish(queueName: string, message: any) {
        console.log(`RabbitMQService (Stub) published to ${queueName}:`, message);
    }

    async consume(queueName: string, callback: (msg: any) => void) {
        console.log(`RabbitMQService (Stub) consuming from ${queueName}`);
    }

    async initialize() {
        await this.connect();
    }

    async purgeQueue(queueName: string) {
        console.log(`RabbitMQService (Stub) purged queue: ${queueName}`);
    }

    async close() {
        console.log("RabbitMQService (Stub) closed");
    }
}

export const rabbitmqService = new RabbitMQServiceStub();

// Also export as rabbitMQService (camelCase vs PascalCase match)
// if other files use different casing, but usually stick to one.
// The error log showed `src/lib/server/queue/rabbitmq-manager.ts` imported `../../rabbitmq-service.js` which mapped to this file location.
// I will keep it simple.
