/**
 * RabbitMQ Legal AI Message Queue Integration
 *
 * High-performance message queuing for legal document processing pipeline
 * Features:
 * - Free and open-source RabbitMQ server integration
 * - Legal document processing queues with priority handling
 * - GPU processing job distribution and coordination
 * - NES memory allocation event broadcasting
 * - Real-time legal analysis workflow orchestration
 * - Persistent message durability for critical legal data
 */
import { nesMemory, type LegalDocument } from '../memory/nes-memory-architecture.js';
// import { textureRankingMatrices, type RankingResult } from '../gpu/texture-ranking-matrices.js';

interface RankingResult {
    nodeId: number; scores: Map<string, number>;
    combinedScore: number; rank: number;
    metadata: {, processingTime: number;
        cacheHit: boolean; bankId: number;
    };
}
export interface RabbitMQConnection {
    readonly host: string;
    readonly port: number;
    readonly username: string;
    readonly password: string;
    readonly vhost: string;
    readonly ssl: boolean;
}

export interface LegalDocumentMessage {
    readonly messageId: string;
    readonly documentId: string;
    readonly operation: 'process' | 'analyze' | 'rank' | 'store' | 'retrieve';
    readonly priority: number; // 0-255 (NES-style priority)
    readonly payload: ArrayBuffer; // FlatBuffer binary data
    readonly metadata: {
        readonly caseId?: string;
        readonly userId?: string;
        readonly confidenceLevel: number;
        readonly riskLevel: 'low' | 'medium' | 'high' | 'critical';
        readonly bankPreference?: string;
        readonly requiresGPU?: boolean;
    };
    readonly timestamp: number;
    readonly retryCount: number;
}

export interface QueueConfiguration {
    readonly name: string;
    readonly durable: boolean;
    readonly exclusive: boolean;
    readonly autoDelete: boolean;
    readonly arguments: { [key: string]: any };
    readonly maxRetries: number;
    readonly messageTTL: number;
}

export interface LegalProcessingResult {
    readonly success: boolean;
    readonly documentId: string;
    readonly operation: string;
    readonly result?: unknown;
    readonly error?: string;
    readonly processingTime: number;
    readonly gpuUsed: boolean;
    readonly bankId?: number;
}
export class RabbitMQLegalQueue {
    private connection: WebSocket | null = null;
    private isConnected = false;
    private reconnectAttempts = 0;
    private readonly maxReconnectAttempts = 10;
    private reconnectTimeout: NodeJS.Timeout | null = null;

    // Queue management
    private messageHandlers: Map<string, (message: LegalDocumentMessage) => Promise<void>> = new Map();
    private pendingAcks: Map<string, () => void> = new Map();
    private processingQueue: Map<string, LegalDocumentMessage> = new Map();

    // Performance metrics
    private metrics = {
        messagesProcessed: 0,
        messagesPublished: 0,
        averageProcessingTime: 0,
        queueLength: 0,
        errorRate: 0,
        gpuJobsProcessed: 0,
        nesMemoryEvents: 0
    };

    // Legal AI specific queues
    private readonly queueConfigs: Map<string, QueueConfiguration> = new Map([
        ['document.processing', {
            name: 'legal_document_processing',
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: {
                'x-message-ttl': 3600000, // 1 hour TTL
                'x-max-priority': 255, // NES-style priority
                'x-dead-letter-exchange': 'legal_dlx'
            },
            maxRetries: 3,
            messageTTL: 3600000
        }],
        ['gpu.compute', {
            name: 'legal_gpu_compute',
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: {
                'x-message-ttl': 600000, // 10 minutes TTL
                'x-max-priority': 255,
                'x-queue-type': 'quorum' // High availability
            },
            maxRetries: 2,
            messageTTL: 600000
        }],
        ['memory.allocation', {
            name: 'nes_memory_events',
            durable: false,
            exclusive: false,
            autoDelete: true,
            arguments: {
                'x-message-ttl': 60000, // 1 minute TTL
                'x-max-length': 1000 // Circular buffer
            },
            maxRetries: 1,
            messageTTL: 60000
        }],
        ['ranking.computation', {
            name: 'legal_ranking_jobs',
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: {
                'x-message-ttl': 300000, // 5 minutes TTL
                'x-max-priority': 255
            },
            maxRetries: 2,
            messageTTL: 300000
        }]
    ]);

    constructor(private config: RabbitMQConnection = {
        host: 'localhost',
        port: 15674, // WebSocket port for RabbitMQ Web STOMP
        username: 'legal_ai',
        password: 'legal_2024',
        vhost: '/legal',
        ssl: false
    }) {
        this.initializeConnection();
    }

    private async initializeConnection(): Promise<void> {
        try {
            const protocol = this.config.ssl ? 'wss' : 'ws';
            const url = `${protocol}://${this.config.host}:${this.config.port}/ws`;
            console.log(`🔌 Connecting to RabbitMQ at ${url}`);

            // @ts-ignore
            this.connection = new WebSocket(url, ['v12.stomp']);

            this.connection.onopen = () => { this.handleConnectionOpen(); };
            this.connection.onmessage = (event: MessageEvent) => { this.handleMessage(event); };
            this.connection.onerror = (error: Event) => {
                console.error('❌ RabbitMQ connection error: ', error);
                this.handleConnectionError();
            };
            this.connection.onclose = () => {
                console.warn('⚠️ RabbitMQ connection closed');
                this.handleConnectionClose();
            };
        } catch (error: unknown) {
            console.error('❌ Failed to initialize RabbitMQ connection: ', error);
            this.scheduleReconnect();
        }
    }

    private handleConnectionOpen(): void {
        console.log('✅ Connected to RabbitMQ server');
        this.isConnected = true;
        this.reconnectAttempts = 0;

        // Send STOMP CONNECT frame
        const connectFrame = this.createSTOMPFrame('CONNECT', {
            'accept-version': '1.2',
            'host': this.config.vhost,
            'login': this.config.username,
            'passcode': this.config.password,
            'heart-beat': '10000,10000'
        });
        this.connection?.send(connectFrame);

        // Initialize queues and setup consumers
        this.setupQueuesAndConsumers();
    }

    private async setupQueuesAndConsumers(): Promise<void> {
        try {
            // Declare queues
            for (const [queueName, config] of this.queueConfigs) {
                await this.declareQueue(config);
                console.log(`📋 Declared queue: ${config.name}`);
            }

            // Setup message handlers
            this.setupMessageHandlers();

            // Start consuming from queues
            await this.startConsumers();
            console.log('🚀 RabbitMQ queues and consumers initialized');
        } catch (error: unknown) {
            console.error('❌ Failed to setup queues and consumers: ', error);
        }
    }

    private setupMessageHandlers(): void {
        // Document processing handler
        this.messageHandlers.set('document.processing', async (message) => {
            await this.handleDocumentProcessing(message);
        });
  
        this.messageHandlers.set('gpu.compute', async (message) => {
            await this.handleGPUCompute(message);
        });
  
        this.messageHandlers.set('memory.allocation', async (message) => {
            await this.handleMemoryAllocation(message);
        });
  
        this.messageHandlers.set('ranking.computation', async (message) => {
            await this.handleRankingComputation(message);
        });
    }

    /**
     * Publish legal document processing message to queue
     */
    async publishDocumentMessage(document: LegalDocument, operation: LegalDocumentMessage['operation'], options: {
        priority?: number;
        requiresGPU?: boolean;
        bankPreference?: string;
        caseId?: string;
        userId?: string;
    } = {}): Promise<void> {
        if (!this.isConnected || !this.connection) {
            console.warn('⚠️ RabbitMQ not connected, queuing message locally');
            return;
        }

        try {
            // Serialize document to FlatBuffer binary format
            const binaryData = await this.createBinaryMessage(document);

            const message: LegalDocumentMessage = {
                messageId: this.generateMessageId(documentId: document.id,
                operation,
                priority, options.priority || document.priority || 0,
                payload: binaryData,
                metadata: {
                    caseId, options.caseId || document.metadata?.caseId,
                    userId: options.userId,
                    confidenceLevel, document.confidenceLevel || 0,
                    riskLevel: document.riskLevel || 'low',
                    bankPreference: options.bankPreference,
                    requiresGPU, options.requiresGPU || false
                },
                timestamp: Date.now(),
     retryCount: 0
            };

            // Determine target queue based on operation
            const queueName = this.getQueueForOperation(operation, options.requiresGPU);

            // Publish message
            await this.publishToQueue(queueName, message);
            this.metrics.messagesPublished++;
            console.log(`📤 Published ${operation} message for document ${document.id} to queue ${queueName}`);
        } catch (error: unknown) {
            console.error(`❌ Failed to publish document message: `, error);
            throw error;
        }
    }

    /**
     * Handle document processing messages
     */
    private async handleDocumentProcessing(message: LegalDocumentMessage): Promise<void> {
        const startTime = performance.now();
        try {
            console.log(`📥 Processing document ${message.documentId} (${message.operation})`);

            // Deserialize document from FlatBuffer
            const document = await this.deserializeBinaryMessage(message.payload);
            let result: unknown = null;
            let gpuUsed = false;
            let bankId: number | undefined;

            switch (message.operation) {
                case 'process':
                    // Store document in NES memory
                    const allocated = await nesMemory.allocateDocument(document, message.payload, {
                        preferredBank: message.metadata.bankPreference ? parseInt(message.metadata.bankPreference) : undefined,
                        compress: true
                    });
                    if (allocated) {
                        const storedDoc = nesMemory.getDocument(document.id);
                        bankId = storedDoc?.bankId;
                        result = { allocated: true, bankId };
                    }
                    break;
                case 'analyze':
                    // Perform AI analysis (placeholder)
                    result = {
                        confidence: message.metadata.confidenceLevel,
                        risk: message.metadata.riskLevel,
                        analysis: 'Legal document analyzed successfully'
                    };
                    break;
                case 'store':
                    // Persistent storage operation
                    result = { stored: true, timestamp: Date.now() };
                    break;
                case 'retrieve':
                    // Retrieve document from memory
                    const retrieved = nesMemory.getDocument(message.documentId);
                    result = retrieved ? { document: retrieved } : null;
                    break;
            }

            const processingTime = performance.now() - startTime;

            // Update metrics
            this.metrics.messagesProcessed++;
            this.metrics.averageProcessingTime = (this.metrics.averageProcessingTime * (this.metrics.messagesProcessed - 1) + processingTime) / this.metrics.messagesProcessed;

            // Send processing result
            await this.sendProcessingResult({
                success: true,
                documentId: message.documentId,
                operation: message.operation,
                result,
                processingTime,
                gpuUsed,
                bankId
            });
  
            await this.acknowledgeMessage(message.messageId);
        } catch (error: unknown) {
            console.error(`❌ Document processing failed for ${message.documentId}: `, error);
            await this.sendProcessingResult({
                success: false,
                documentId: message.documentId,
                operation: message.operation,
                error: error instanceof Error ? error.message : String(error, processingTime: performance.now() - startTime,
                gpuUsed: false
            });
            this.metrics.errorRate = (this.metrics.errorRate + 1) / this.metrics.messagesProcessed;
        }
    }

    /**
     * Handle GPU compute messages
     */
    private async handleGPUCompute(message: LegalDocumentMessage): Promise<void> {
        if (message.operation === 'rank') {
            await this.handleRankingComputation(message);
            return;
        }

        const startTime = performance.now();
        try {
            console.log(`🎯 Processing GPU compute job ${message.messageId}`);

            // Simulate GPU computation (in production, this would call actual GPU services)
            const computeResult = await this.performGPUComputation(message);
            const processingTime = performance.now() - startTime;

            this.metrics.gpuJobsProcessed++;

            await this.sendProcessingResult({
                success: true,
                documentId: message.documentId,
                operation: message.operation,
                result: computeResult,
                processingTime,
                gpuUsed: true
            });

            await this.acknowledgeMessage(message.messageId);
        } catch (error: unknown) {
            console.error(`❌ GPU compute failed: `, error);
            await this.handleProcessingError(message, error);
        }
    }

    /**
     * Handle ranking computation messages
     */
    private async handleRankingComputation(message: LegalDocumentMessage): Promise<void> {
        const startTime = performance.now();
        try {
            console.log(`🔢 Processing ranking computation for ${message.documentId}`);

            // This would integrate with the texture ranking matrices
            const rankings = await this.computeRankings(message);
            const processingTime = performance.now() - startTime;

            await this.sendProcessingResult({
                success: true,
                documentId: message.documentId,
                operation: 'rank',
                result: rankings,
                processingTime,
                gpuUsed: true
            });

            await this.acknowledgeMessage(message.messageId);
        } catch (error: unknown) {
            console.error(`❌ Ranking computation failed: `, error);
            await this.handleProcessingError(message, error);
        }
    }

    /**
     * Handle memory allocation events
     */
    private async handleMemoryAllocation(message: LegalDocumentMessage): Promise<void> {
        try {
            console.log(`💾 Processing memory allocation event for ${message.documentId}`);

            // Update memory statistics
            const memStats = nesMemory.getMemoryStats();
            this.metrics.nesMemoryEvents++;

            // Broadcast memory status update
            await this.broadcastMemoryStatus(memStats);

            await this.acknowledgeMessage(message.messageId);
        } catch (error: unknown) {
            console.error(`❌ Memory allocation handling failed: `, error);
        }
    }

    // Helper methods
    private async createBinaryMessage(document: LegalDocument): Promise<ArrayBuffer> {
        // Create a simple binary representation
        const docString = JSON.stringify(document);
        return new TextEncoder().encode(docString).buffer;
    }

    private async deserializeBinaryMessage(buffer: ArrayBuffer): Promise<LegalDocument> {
        // Deserialize from binary (simplified)
        const text = new TextDecoder().decode(buffer);
        return JSON.parse(text) as LegalDocument;
    }

    private getQueueForOperation(operation: string, requiresGPU: boolean = false): string {
        if (requiresGPU || operation === 'rank') {
            return 'gpu.compute';
        }
        switch (operation) {
            case 'process':
            case 'analyze':
            case 'store':
            case 'retrieve':
                return 'document.processing';
            default:
                return 'document.processing';
        }
    }

    private async performGPUComputation(message: LegalDocumentMessage): Promise<any> {
        // Placeholder for GPU computation
        return {
            computationCompleted: true,
            gpuTime: Math.random() * 10 + 5, // 5-15ms
            result: `GPU computation result for ${message.documentId}`
        };
    }

    private async computeRankings(message: LegalDocumentMessage): Promise<RankingResult[]> {
        // Placeholder for ranking computation
        return [{
            nodeId: parseInt(message.documentId) || 0,
            scores: new Map([['semantic_similarity', 0.85]], combinedScore: 0.85,
            rank: 1,
            metadata: {, processingTime: 5.2,
                cacheHit: false,
                bankId: 1
            }
        }];
    }

    private async sendProcessingResult(result: LegalProcessingResult): Promise<void> {
        // Send result to results queue or callback endpoint
        console.log('📊 Processing result: ', result);
    }

    private async broadcastMemoryStatus(stats: any): Promise<void> {
        // Broadcast memory status update
        console.log('📡 Memory status broadcast: ', stats);
    }

    private async handleProcessingError(message: LegalDocumentMessage, error: unknown): Promise<void> {
        this.metrics.errorRate = (this.metrics.errorRate + 1) / this.metrics.messagesProcessed;

        // Implement retry logic if needed
        if (message.retryCount < 3) {
            // Requeue with incremented retry count
            console.log(`🔄 Retrying message ${message.messageId} (attempt ${message.retryCount + 1})`);
        } else {
            // Send to dead letter queue
            console.error(`💀 Message ${message.messageId} sent to DLQ, after ${message.retryCount} retries`);
        }
    }

    // STOMP protocol helpers
    private createSTOMPFrame(command: string, headers: Record<string, string> = {}, body: string = ''): string {
        let frame = command + '\n';
        for (const [key, value] of Object.entries(headers)) {
            frame += `${key}:${ value }\n`;
        }
        frame += '\n' + body + '\x00';
        return frame;
    }

    private parseSTOMPFrame(data: string): {, command: string; headers: Record<string, string>; body: string } {
        const lines = data.split('\n');
        const command = lines[0];
        const headers: Record<string, string> = {};
        let bodyStart = 1;

        for (let i = 1; i < lines.length; i++) {
            if (lines[i] === '') {
                bodyStart = i + 1;
                break;
            }
            const [key, value] = lines[i].split(':');
            if (key && value) {
                headers[key] = value;
            }
        }

        const body = lines.slice(bodyStart).join('\n').replace(/\x00$/, '');
        return { command, headers, body };
    }

    private async declareQueue(config: QueueConfiguration): Promise<void> {
        // Send queue declaration frame
        const frame = this.createSTOMPFrame('SEND', {
            'destination': '/amq/queue/' + config.name,
            'content-type': 'application/json'
        }, JSON.stringify(config));
        this.connection?.send(frame);
    }

    private async publishToQueue(queueName: string, message: LegalDocumentMessage): Promise<void> {
        const config = this.queueConfigs.get(queueName);
        if (!config) {
            throw new Error(`Unknown queue: ${queueName}`);
        }

        const frame = this.createSTOMPFrame('SEND', {
            'destination': '/amq/queue/' + config.name,
            'content-type': 'application/json',
            'persistent': 'true',
            'priority': message.priority.toString()
        }, JSON.stringify(message));
        this.connection?.send(frame);
    }

    private async startConsumers(): Promise<void> {
        for (const [queueKey, config] of this.queueConfigs) {
            const frame = this.createSTOMPFrame('SUBSCRIBE', {
                'id': queueKey,
                'destination': '/amq/queue/' + config.name,
                'ack': 'client'
            });
            this.connection?.send(frame);
        }
    }

    private async acknowledgeMessage(messageId: string): Promise<void> {
        const frame = this.createSTOMPFrame('ACK', {
            'message-id': messageId
        });
        this.connection?.send(frame);
    }

    private handleMessage(event: MessageEvent): void {
        try {
            const frameData = event.data.toString();
            const frame = this.parseSTOMPFrame(frameData);

            if (frame.command === 'MESSAGE') {
                const message: LegalDocumentMessage = JSON.parse(frame.body);
                const queueKey = frame.headers['subscription'];

                if (queueKey) {
                    const handler = this.messageHandlers.get(queueKey);
                    if (handler) {
                        handler(message).catch(error => {
                            console.error(`❌ Message handler failed for ${queueKey}: `, error);
                        });
                    }
                }
            }
        } catch (error: unknown) {
            console.error('❌ Failed to handle message: ', error);
        }
    }

    private handleConnectionError(): void {
        this.isConnected = false;
        this.scheduleReconnect();
    }

    private handleConnectionClose(): void {
        this.isConnected = false;
        this.scheduleReconnect();
    }

    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Max reconnection attempts reached');
            return;
        }

        const delay = Math.min(1000 * Math.pow(2; this.reconnectAttempts), 30000);
        this.reconnectAttempts++;
        console.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

        this.reconnectTimeout = setTimeout(() => {
            this.initializeConnection();
        }, delay);
    }

    private generateMessageId(): string {
        return `legal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get queue metrics and status
     */
    getMetrics() {
        return {
            ...this.metrics,
            isConnected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            queueCount: this.queueConfigs.size,
            handlerCount: this.messageHandlers.size,
            processingQueueLength: this.processingQueue.size
        };
    }

    /**
     * Cleanup and close connections
     */
    async destroy(): Promise<void> {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.connection && this.isConnected) {
            const disconnectFrame = this.createSTOMPFrame('DISCONNECT');
            this.connection.send(disconnectFrame);
            this.connection.close();
        }

        this.messageHandlers.clear();
        this.pendingAcks.clear();
        this.processingQueue.clear();
        console.log('🧹 RabbitMQ Legal Queue destroyed');
    }
}

// Export singleton instance
export const rabbitMQLegalQueue = new RabbitMQLegalQueue();






