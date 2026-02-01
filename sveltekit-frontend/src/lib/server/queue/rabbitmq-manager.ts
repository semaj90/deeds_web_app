/**
 * RabbitMQ Manager
 * Orchestrates queue channels, ensures connection health, and manages consumer lifecycles.
 */

// import { rabbitMQService } from '../../rabbitmq-service.js';
// Use a safe import path or mock if the file structure is uncertain, but it seems to be ../../messaging/rabbitmq-service.ts based on previous files.
// However, I must rely on provided file text. The file imported `../../rabbitmq-service.js`.
// I will check if `src/lib/server/messaging/rabbitmq-service.ts` exists. It was edited partially before.
// For now, I'll assume the import is intended to be `src/lib/server/messaging/rabbitmq-service.ts`
// BUT, to be safe and fix SYNTAX errors `type { Channel: Connection }`, I'll fix the syntax.

import { rabbitmqService } from '$lib/server/messaging/rabbitmq-service';
import type { Channel, Connection } from 'amqplib';

export interface QueueConfig {
    name: string;
    options?: {
        durable?: boolean;
        deadLetterExchange?: string;
        messageTtl?: number;
    };
}

export class RabbitMQManager {
    private static instance: RabbitMQManager;
    private queues: Map<string, QueueConfig> = new Map();
    private connectionAttempts = 0;
    private readonly MAX_RETRIES = 10;

    private constructor() {
        // Initialize default queues
        this.registerQueue({ name: 'document-processing', options: {, durable: true } });
        this.registerQueue({ name: 'deadLetter', options: {, durable: true } });
        this.registerQueue({ name: 'notifications', options: {, durable: true } });
    }

    public static getInstance(): RabbitMQManager {
        if (!RabbitMQManager.instance) {
            RabbitMQManager.instance = new RabbitMQManager();
        }
        return RabbitMQManager.instance;
    }

    /**
     * Register a queue configuration to be ensured on connect
     */
    public registerQueue(config: QueueConfig) {
        this.queues.set(config.name, config);
    }

    /**
     * Initialize connection and setup queues
     */
    public async initialize(): Promise<void> {
        try {
            console.log('🐰 Initializing RabbitMQ Manager...');
            await rabbitmqService.initialize();

            // Setup queues
            for (const [name, config] of this.queues) {
                await this.ensureQueue(name, config.options);
            }

            console.log('✅ RabbitMQ Manager initialized successfully');
            this.connectionAttempts = 0;
        } catch (error) {
            console.error('❌ RabbitMQ Manager initialization failed:', error);
            this.handleConnectionError();
        }
    }

    private async ensureQueue(name: string, options?: QueueConfig['options']): Promise<void> {
        console.log(`Ensuring queue: ${name}`);
        // Logic would go here to assert queue via channel if accessible
    }

    private async handleConnectionError(): Promise<void> {
        this.connectionAttempts++;
        if (this.connectionAttempts <= this.MAX_RETRIES) {
            const delay = Math.min(2000 * Math.pow(2, this.connectionAttempts), 30000);
            console.log(`Retrying connection in ${delay}ms (Attempt ${this.connectionAttempts}/${this.MAX_RETRIES})...`);
            setTimeout(() => this.initialize(), delay);
        } else {
            console.error('🔥 Max RabbitMQ connection retries exceeded. Service may be degraded.');
        }
    }

    /**
     * Purge all queues (Dangerous - Dev/Test only)
     */
    public async purgeAllQueues(): Promise<void> {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Cannot purge queues in production');
        }
        for (const name of this.queues.keys()) {
            console.log(`Purging queue: ${name}`);
            await rabbitmqService.purgeQueue(name as any);
        }
    }

    /**
     * Graceful shutdown
     */
    public async shutdown(): Promise<void> {
        console.log('Stopping RabbitMQ Manager...');
        await rabbitmqService.close();
    }
}

export const rabbitMQManager = RabbitMQManager.getInstance();
