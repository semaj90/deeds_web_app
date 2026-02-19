#!/usr/bin/env node

/**
 * RabbitMQ Job Publisher for Production Pipeline
 * Handles job queuing for crawl → OCR → embed → index workflow
 */

import amqp from 'amqplib';
import { EventEmitter } from 'events';

export class RabbitMQJobPublisher extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      url: config.url || 'amqp://localhost:5672',
      exchanges: {
        main: config.exchanges?.main || 'legal_ai_pipeline',
        dlx: config.exchanges?.dlx || 'legal_ai_pipeline_dlx'
      },
      queues: {
        crawl: 'crawl_jobs',
        ocr: 'ocr_jobs', 
        embed: 'embed_jobs',
        index: 'index_jobs',
        priority: 'priority_jobs'
      },
      reconnectInterval: config.reconnectInterval || 5000
    };
    
    this.connection = null;
    this.channel = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.publishQueue = [];
  }

  async connect() {
    try {
      console.log('🔌 Connecting to RabbitMQ:', this.config.url);
      
      this.connection = await amqp.connect(this.config.url);
      this.channel = await this.connection.createChannel();
      
      // Setup error handlers
      this.connection.on('error', (err) => {
        console.error('❌ RabbitMQ connection error:', err.message);
        this.isConnected = false;
        this.scheduleReconnect();
      });
      
      this.connection.on('close', () => {
        console.log('🔌 RabbitMQ connection closed');
        this.isConnected = false;
        this.scheduleReconnect();
      });

      // Setup exchanges and queues
      await this.setupTopology();
      
      this.isConnected = true;
      console.log('✅ RabbitMQ connected and topology ready');
      
      // Process any queued messages
      await this.processQueuedMessages();
      
      this.emit('connected');
      
    } catch (error) {
      console.error('❌ Failed to connect to RabbitMQ:', error.message);
      this.scheduleReconnect();
    }
  }

  async setupTopology() {
    const { exchanges, queues } = this.config;
    
    // Create exchanges
    await this.channel.assertExchange(exchanges.main, 'topic', { durable: true });
    await this.channel.assertExchange(exchanges.dlx, 'topic', { durable: true });
    
    // Create queues with dead letter exchange
    const queueOptions = {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': exchanges.dlx,
        'x-message-ttl': 3600000, // 1 hour
        'x-max-retries': 3
      }
    };
    
    await this.channel.assertQueue(queues.crawl, queueOptions);
    await this.channel.assertQueue(queues.ocr, queueOptions);
    await this.channel.assertQueue(queues.embed, queueOptions);
    await this.channel.assertQueue(queues.index, queueOptions);
    await this.channel.assertQueue(queues.priority, { 
      ...queueOptions, 
      arguments: { ...queueOptions.arguments, 'x-max-priority': 10 }
    });
    
    // Bind queues to exchange
    await this.channel.bindQueue(queues.crawl, exchanges.main, 'job.crawl.*');
    await this.channel.bindQueue(queues.ocr, exchanges.main, 'job.ocr.*');
    await this.channel.bindQueue(queues.embed, exchanges.main, 'job.embed.*');
    await this.channel.bindQueue(queues.index, exchanges.main, 'job.index.*');
    await this.channel.bindQueue(queues.priority, exchanges.main, 'job.priority.*');
    
    console.log('📋 RabbitMQ topology configured');
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.config.reconnectInterval);
  }

  async publishJob(jobType, jobData, options = {}) {
    const job = {
      id: options.id || `${jobType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: jobType,
      data: jobData,
      priority: options.priority || 5,
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      createdAt: new Date().toISOString(),
      ...options.metadata
    };

    if (!this.isConnected) {
      this.publishQueue.push({ job, options });
      console.log(`📦 Queued job ${job.id} for later publishing`);
      return job.id;
    }

    try {
      const routingKey = `job.${jobType}.${options.priority >= 8 ? 'high' : 'normal'}`;
      const publishOptions = {
        persistent: true,
        priority: job.priority,
        messageId: job.id,
        timestamp: Date.now(),
        headers: {
          'x-retry-count': job.retryCount,
          'x-job-type': jobType
        }
      };

      const success = this.channel.publish(
        this.config.exchanges.main,
        routingKey,
        Buffer.from(JSON.stringify(job)),
        publishOptions
      );

      if (success) {
        console.log(`✅ Published job ${job.id} to ${routingKey}`);
        this.emit('jobPublished', job);
      } else {
        throw new Error('Failed to publish to channel');
      }

      return job.id;
      
    } catch (error) {
      console.error(`❌ Failed to publish job ${job.id}:`, error.message);
      this.publishQueue.push({ job, options });
      throw error;
    }
  }

  async processQueuedMessages() {
    if (this.publishQueue.length === 0) return;
    
    console.log(`📤 Processing ${this.publishQueue.length} queued messages`);
    
    const queue = [...this.publishQueue];
    this.publishQueue = [];
    
    for (const { job, options } of queue) {
      try {
        await this.publishJob(job.type, job.data, { ...options, id: job.id });
      } catch (error) {
        console.error(`❌ Failed to process queued job ${job.id}:`, error.message);
      }
    }
  }

  // Convenience methods for specific job types
  async publishCrawlJob(url, options = {}) {
    return this.publishJob('crawl', { 
      url,
      domain: new URL(url).hostname,
      crawlType: options.crawlType || 'web_page',
      maxDepth: options.maxDepth || 1,
      allowedDomains: options.allowedDomains || [],
      blockedPaths: options.blockedPaths || []
    }, options);
  }

  async publishOCRJob(documentId, filePath, options = {}) {
    return this.publishJob('ocr', {
      documentId,
      filePath,
      format: options.format || 'pdf',
      language: options.language || 'eng',
      dpi: options.dpi || 300
    }, options);
  }

  async publishEmbedJob(documentId, chunks, options = {}) {
    return this.publishJob('embed', {
      documentId,
      chunks,
      model: options.model || 'nomic-embed-text',
      dimensions: options.dimensions || 384
    }, options);
  }

  async publishIndexJob(documentId, embeddings, options = {}) {
    return this.publishJob('index', {
      documentId,
      embeddings,
      indexType: options.indexType || 'pgvector',
      metadata: options.metadata || {}
    }, options);
  }

  async publishBatchJob(jobs, options = {}) {
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`📦 Publishing batch ${batchId} with ${jobs.length} jobs`);
    
    const results = [];
    for (const job of jobs) {
      try {
        const jobId = await this.publishJob(job.type, job.data, {
          ...job.options,
          metadata: {
            ...job.options?.metadata,
            batchId,
            batchSize: jobs.length
          }
        });
        results.push({ success: true, jobId });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    
    return { batchId, results };
  }

  async getQueueStats() {
    if (!this.isConnected) return null;
    
    try {
      const stats = {};
      for (const [name, queue] of Object.entries(this.config.queues)) {
        const queueInfo = await this.channel.checkQueue(queue);
        stats[name] = {
          queue,
          messageCount: queueInfo.messageCount,
          consumerCount: queueInfo.consumerCount
        };
      }
      return stats;
    } catch (error) {
      console.error('❌ Failed to get queue stats:', error.message);
      return null;
    }
  }

  async purgeQueue(queueName) {
    if (!this.isConnected) throw new Error('Not connected to RabbitMQ');
    
    const queue = this.config.queues[queueName];
    if (!queue) throw new Error(`Unknown queue: ${queueName}`);
    
    const result = await this.channel.purgeQueue(queue);
    console.log(`🧹 Purged ${result.messageCount} messages from ${queue}`);
    return result;
  }

  async close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.channel) {
      await this.channel.close();
    }
    
    if (this.connection) {
      await this.connection.close();
    }
    
    this.isConnected = false;
    console.log('🔌 RabbitMQ connection closed');
  }
}

// CLI usage
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const publisher = new RabbitMQJobPublisher();
  
  publisher.on('connected', async () => {
    try {
      // Example usage
      await publisher.publishCrawlJob('https://example.com/legal-docs', { priority: 7 });
      await publisher.publishOCRJob('doc123', '/path/to/document.pdf', { priority: 6 });
      
      const stats = await publisher.getQueueStats();
      console.log('📊 Queue Stats:', JSON.stringify(stats, null, 2));
      
      await publisher.close();
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });
  
  await publisher.connect();
}

export default RabbitMQJobPublisher;