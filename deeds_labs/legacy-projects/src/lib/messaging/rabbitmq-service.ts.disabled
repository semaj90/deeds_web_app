import amqp, { Connection, Channel, Message } from 'amqplib';

/**
 * RabbitMQ Service for Message Queuing and Event-Driven Architecture
 * Handles AI processing pipelines, cache invalidation, and real-time updates
 */

export interface QueueConfig {
  durable: boolean;
  exclusive: boolean;
  autoDelete: boolean;
  arguments?: Record<string, any>;
}

export interface ExchangeConfig {
  type: 'direct' | 'topic' | 'fanout' | 'headers';
  durable: boolean;
  autoDelete: boolean;
  arguments?: Record<string, any>;
}

export interface MessageOptions {
  persistent?: boolean;
  expiration?: string;
  priority?: number;
  correlationId?: string;
  replyTo?: string;
  headers?: Record<string, any>;
}

export interface AIProcessingJob {
  id: string;
  type: 'document_analysis' | 'embedding_generation' | 'summarization' | 'vector_search';
  payload: {
    documentId?: string;
    content?: string;
    embedding?: number[];
    options?: Record<string, any>;
  };
  priority: 'low' | 'medium' | 'high' | 'critical';
  retries: number;
  createdAt: Date;
  scheduledFor?: Date;
}

export class RabbitMQService {
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private isConnecting = false;

  constructor(url: string = 'amqp://localhost') {
    this.url = url;
  }

  /**
   * Connect to RabbitMQ with automatic reconnection
   */
  async connect(): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();
      
      // Set channel prefetch for load balancing
      await this.channel.prefetch(10);

      // Setup connection event handlers
      this.connection.on('error', this.handleConnectionError.bind(this));
      this.connection.on('close', this.handleConnectionClose.bind(this));

      // Setup essential exchanges and queues
      await this.setupInfrastructure();

      this.reconnectAttempts = 0;
      this.isConnecting = false;
      
      console.log('✅ RabbitMQ connected successfully');
    } catch (error) {
      this.isConnecting = false;
      console.error('❌ RabbitMQ connection failed:', error);
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`🔄 Retrying connection in ${delay}ms (attempt ${this.reconnectAttempts})`);
        setTimeout(() => this.connect(), delay);
      } else {
        throw new Error('Max reconnection attempts reached');
      }
    }
  }

  /**
   * Setup essential RabbitMQ infrastructure
   */
  private async setupInfrastructure(): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');

    // AI Processing Exchange and Queues
    await this.declareExchange('ai_processing', { 
      type: 'topic', 
      durable: true, 
      autoDelete: false 
    });

    // Document analysis queue
    await this.declareQueue('ai.document.analysis', {
      durable: true,
      exclusive: false,
      autoDelete: false,
      arguments: {
        'x-message-ttl': 3600000, // 1 hour TTL
        'x-max-priority': 10,
        'x-dead-letter-exchange': 'ai_processing_dlx'
      }
    });

    // Embedding generation queue
    await this.declareQueue('ai.embedding.generation', {
      durable: true,
      exclusive: false,
      autoDelete: false,
      arguments: {
        'x-message-ttl': 3600000,
        'x-max-priority': 10
      }
    });

    // Vector search queue
    await this.declareQueue('ai.vector.search', {
      durable: true,
      exclusive: false,
      autoDelete: false,
      arguments: {
        'x-message-ttl': 1800000, // 30 minutes TTL
        'x-max-priority': 10
      }
    });

    // Cache Events Exchange
    await this.declareExchange('cache_events', {
      type: 'fanout',
      durable: true,
      autoDelete: false
    });

    // Real-time Updates Exchange
    await this.declareExchange('realtime_updates', {
      type: 'topic',
      durable: true,
      autoDelete: false
    });

    // Dead Letter Exchange for failed messages
    await this.declareExchange('ai_processing_dlx', {
      type: 'direct',
      durable: true,
      autoDelete: false
    });

    await this.declareQueue('ai.failed', {
      durable: true,
      exclusive: false,
      autoDelete: false
    });

    // Bind queues to exchanges
    await this.bindQueue('ai.document.analysis', 'ai_processing', 'ai.document.*');
    await this.bindQueue('ai.embedding.generation', 'ai_processing', 'ai.embedding.*');
    await this.bindQueue('ai.vector.search', 'ai_processing', 'ai.vector.*');
    await this.bindQueue('ai.failed', 'ai_processing_dlx', 'failed');
  }

  /**
   * Declare an exchange
   */
  async declareExchange(name: string, config: ExchangeConfig): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');
    
    await this.channel.assertExchange(name, config.type, {
      durable: config.durable,
      autoDelete: config.autoDelete,
      arguments: config.arguments
    });
  }

  /**
   * Declare a queue
   */
  async declareQueue(name: string, config: QueueConfig): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');
    
    await this.channel.assertQueue(name, {
      durable: config.durable,
      exclusive: config.exclusive,
      autoDelete: config.autoDelete,
      arguments: config.arguments
    });
  }

  /**
   * Bind queue to exchange
   */
  async bindQueue(queueName: string, exchangeName: string, routingKey: string): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');
    
    await this.channel.bindQueue(queueName, exchangeName, routingKey);
  }

  /**
   * Publish a message to an exchange
   */
  async publish(
    exchange: string,
    routingKey: string,
    message: any,
    options: MessageOptions = {}
  ): Promise<boolean> {
    if (!this.channel) throw new Error('Channel not initialized');

    const messageBuffer = Buffer.from(JSON.stringify(message));
    
    return this.channel.publish(exchange, routingKey, messageBuffer, {
      persistent: options.persistent ?? true,
      expiration: options.expiration,
      priority: options.priority ?? 5,
      correlationId: options.correlationId,
      replyTo: options.replyTo,
      headers: options.headers,
      timestamp: Date.now()
    });
  }

  /**
   * Send message directly to a queue
   */
  async sendToQueue(
    queueName: string,
    message: any,
    options: MessageOptions = {}
  ): Promise<boolean> {
    if (!this.channel) throw new Error('Channel not initialized');

    const messageBuffer = Buffer.from(JSON.stringify(message));
    
    return this.channel.sendToQueue(queueName, messageBuffer, {
      persistent: options.persistent ?? true,
      expiration: options.expiration,
      priority: options.priority ?? 5,
      correlationId: options.correlationId,
      replyTo: options.replyTo,
      headers: options.headers,
      timestamp: Date.now()
    });
  }

  /**
   * Consume messages from a queue
   */
  async consume(
    queueName: string,
    handler: (message: Message) => Promise<void>,
    options: {
      noAck?: boolean;
      exclusive?: boolean;
      priority?: number;
      arguments?: Record<string, any>;
    } = {}
  ): Promise<{ consumerTag: string }> {
    if (!this.channel) throw new Error('Channel not initialized');

    const result = await this.channel.consume(
      queueName,
      async (message) => {
        if (!message) return;

        try {
          await handler(message);
          
          if (!options.noAck) {
            this.channel!.ack(message);
          }
        } catch (error) {
          console.error(`Message processing failed for queue ${queueName}:`, error);
          
          // Reject and requeue with limit
          const retryCount = (message.properties.headers?.retryCount || 0) + 1;
          
          if (retryCount <= 3) {
            // Requeue with retry count
            await this.sendToQueue(queueName, JSON.parse(message.content.toString()), {
              headers: { ...message.properties.headers, retryCount }
            });
          } else {
            // Send to dead letter queue
            await this.publish('ai_processing_dlx', 'failed', {
              originalQueue: queueName,
              message: JSON.parse(message.content.toString()),
              error: error.message,
              retryCount
            });
          }
          
          this.channel!.nack(message, false, false);
        }
      },
      {
        noAck: options.noAck ?? false,
        exclusive: options.exclusive ?? false,
        priority: options.priority,
        arguments: options.arguments
      }
    );

    return result;
  }

  /**
   * Schedule AI processing job
   */
  async scheduleAIJob(job: AIProcessingJob): Promise<void> {
    const routingKey = `ai.${job.type.replace('_', '.')}`;
    
    const messageOptions: MessageOptions = {
      priority: this.getPriorityValue(job.priority),
      correlationId: job.id,
      headers: {
        jobType: job.type,
        retries: job.retries,
        createdAt: job.createdAt.toISOString()
      }
    };

    if (job.scheduledFor) {
      // Delay message using TTL and dead letter exchange
      const delay = job.scheduledFor.getTime() - Date.now();
      if (delay > 0) {
        messageOptions.expiration = delay.toString();
      }
    }

    await this.publish('ai_processing', routingKey, job, messageOptions);
  }

  /**
   * Setup AI processing workers
   */
  async setupAIWorkers(): Promise<void> {
    // Document analysis worker
    await this.consume('ai.document.analysis', async (message) => {
      const job: AIProcessingJob = JSON.parse(message.content.toString());
      await this.processDocumentAnalysis(job);
    });

    // Embedding generation worker
    await this.consume('ai.embedding.generation', async (message) => {
      const job: AIProcessingJob = JSON.parse(message.content.toString());
      await this.processEmbeddingGeneration(job);
    });

    // Vector search worker
    await this.consume('ai.vector.search', async (message) => {
      const job: AIProcessingJob = JSON.parse(message.content.toString());
      await this.processVectorSearch(job);
    });

    console.log('✅ AI processing workers initialized');
  }

  /**
   * Broadcast real-time update
   */
  async broadcastUpdate(
    type: 'document_processed' | 'analysis_complete' | 'search_result',
    data: any,
    userId?: string
  ): Promise<void> {
    const routingKey = userId ? `update.${type}.${userId}` : `update.${type}`;
    
    await this.publish('realtime_updates', routingKey, {
      type,
      data,
      timestamp: new Date(),
      userId
    });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<{
    messageCount: number;
    consumerCount: number;
  }> {
    if (!this.channel) throw new Error('Channel not initialized');
    
    const queueInfo = await this.channel.checkQueue(queueName);
    return {
      messageCount: queueInfo.messageCount,
      consumerCount: queueInfo.consumerCount
    };
  }

  /**
   * Purge queue
   */
  async purgeQueue(queueName: string): Promise<{ messageCount: number }> {
    if (!this.channel) throw new Error('Channel not initialized');
    
    return await this.channel.purgeQueue(queueName);
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      console.log('✅ RabbitMQ connection closed');
    } catch (error) {
      console.error('Error closing RabbitMQ connection:', error);
    }
  }

  // Private helper methods

  private async processDocumentAnalysis(job: AIProcessingJob): Promise<void> {
    console.log(`Processing document analysis job: ${job.id}`);
    
    // Here you would integrate with your AI service
    // This is a placeholder for the actual implementation
    const result = {
      documentId: job.payload.documentId,
      analysis: 'Document analysis completed',
      confidence: 0.95,
      processingTime: Date.now() - job.createdAt.getTime()
    };

    // Broadcast completion
    await this.broadcastUpdate('analysis_complete', result);
  }

  private async processEmbeddingGeneration(job: AIProcessingJob): Promise<void> {
    console.log(`Processing embedding generation job: ${job.id}`);
    
    // Placeholder for embedding generation
    const result = {
      documentId: job.payload.documentId,
      embedding: Array(384).fill(0).map(() => Math.random()),
      model: 'nomic-embed-text',
      processingTime: Date.now() - job.createdAt.getTime()
    };

    await this.broadcastUpdate('document_processed', result);
  }

  private async processVectorSearch(job: AIProcessingJob): Promise<void> {
    console.log(`Processing vector search job: ${job.id}`);
    
    // Placeholder for vector search
    const result = {
      query: job.payload.content,
      results: [],
      totalResults: 0,
      processingTime: Date.now() - job.createdAt.getTime()
    };

    await this.broadcastUpdate('search_result', result);
  }

  private getPriorityValue(priority: AIProcessingJob['priority']): number {
    const priorityMap = {
      low: 1,
      medium: 5,
      high: 8,
      critical: 10
    };
    return priorityMap[priority];
  }

  private handleConnectionError(error: Error): void {
    console.error('RabbitMQ connection error:', error);
  }

  private handleConnectionClose(): void {
    console.warn('RabbitMQ connection closed, attempting to reconnect...');
    this.connection = null;
    this.channel = null;
    
    setTimeout(() => {
      if (!this.connection) {
        this.connect().catch(console.error);
      }
    }, 5000);
  }
}

// Export singleton instance
export const rabbitmqService = new RabbitMQService(
  process.env.RABBITMQ_URL || 'amqp://localhost'
);