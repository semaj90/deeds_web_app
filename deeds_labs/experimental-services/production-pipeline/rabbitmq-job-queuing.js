/**
 * RabbitMQ Job Queuing System
 * Production-ready queue management for crawl → OCR → embed → store pipeline
 */

import amqp from 'amqplib';
import { EventEmitter } from 'events';

class RabbitMQJobQueuing extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      url: config.url || 'amqp://localhost:5672',
      queues: {
        crawl: 'crawl_queue',
        ocr: 'ocr_queue', 
        embed: 'embed_queue',
        index: 'index_queue',
        deadLetter: 'dead_letter_queue'
      },
      exchanges: {
        pipeline: 'pipeline_exchange',
        deadLetter: 'dead_letter_exchange'
      },
      prefetch: config.prefetch || 10,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 5000,
      ...config
    };

    this.connection = null;
    this.channel = null;
    this.isConnected = false;
    this.consumers = new Map();
    this.jobStats = {
      queued: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      retried: 0
    };
  }

  /**
   * Initialize RabbitMQ connection and setup queues
   */
  async initialize() {
    try {
      console.log('🐰 Initializing RabbitMQ connection...');
      
      // Create connection
      this.connection = await amqp.connect(this.config.url);
      this.channel = await this.connection.createChannel();
      
      // Handle connection events
      this.connection.on('error', (err) => {
        console.error('❌ RabbitMQ connection error:', err);
        this.emit('connection_error', err);
      });

      this.connection.on('close', () => {
        console.log('⚠️ RabbitMQ connection closed');
        this.isConnected = false;
        this.emit('connection_closed');
      });

      // Set prefetch for fair dispatch
      await this.channel.prefetch(this.config.prefetch);
      
      // Setup exchanges
      await this.setupExchanges();
      
      // Setup queues
      await this.setupQueues();
      
      this.isConnected = true;
      console.log('✅ RabbitMQ initialized successfully');
      
      this.emit('ready');
      
    } catch (error) {
      console.error('❌ RabbitMQ initialization failed:', error);
      throw error;
    }
  }

  /**
   * Setup exchanges for routing
   */
  async setupExchanges() {
    // Main pipeline exchange
    await this.channel.assertExchange(
      this.config.exchanges.pipeline,
      'topic',
      { durable: true }
    );

    // Dead letter exchange
    await this.channel.assertExchange(
      this.config.exchanges.deadLetter,
      'direct',
      { durable: true }
    );

    console.log('✅ Exchanges configured');
  }

  /**
   * Setup queues with dead letter handling
   */
  async setupQueues() {
    const deadLetterArgs = {
      'x-dead-letter-exchange': this.config.exchanges.deadLetter,
      'x-dead-letter-routing-key': 'failed',
      'x-message-ttl': 300000 // 5 minutes
    };

    // Create main processing queues
    for (const [key, queueName] of Object.entries(this.config.queues)) {
      if (key === 'deadLetter') continue;
      
      await this.channel.assertQueue(queueName, {
        durable: true,
        arguments: deadLetterArgs
      });

      // Bind to pipeline exchange
      await this.channel.bindQueue(
        queueName,
        this.config.exchanges.pipeline,
        `pipeline.${key}`
      );
    }

    // Create dead letter queue
    await this.channel.assertQueue(this.config.queues.deadLetter, {
      durable: true
    });

    await this.channel.bindQueue(
      this.config.queues.deadLetter,
      this.config.exchanges.deadLetter,
      'failed'
    );

    console.log('✅ Queues configured with dead letter handling');
  }

  /**
   * Publish job to specific queue
   */
  async publishJob(jobType, jobData, options = {}) {
    if (!this.isConnected) {
      throw new Error('RabbitMQ not connected');
    }

    const job = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: jobType,
      data: jobData,
      timestamp: new Date().toISOString(),
      attempts: 0,
      maxAttempts: options.maxAttempts || this.config.retryAttempts,
      priority: options.priority || 0,
      metadata: options.metadata || {}
    };

    const routingKey = `pipeline.${jobType}`;
    const publishOptions = {
      persistent: true,
      priority: job.priority,
      messageId: job.id,
      timestamp: Date.now(),
      headers: {
        'x-job-type': jobType,
        'x-attempts': job.attempts,
        'x-max-attempts': job.maxAttempts
      }
    };

    try {
      const published = this.channel.publish(
        this.config.exchanges.pipeline,
        routingKey,
        Buffer.from(JSON.stringify(job)),
        publishOptions
      );

      if (published) {
        this.jobStats.queued++;
        console.log(`📤 Job published: ${job.id} (type: ${jobType})`);
        
        this.emit('job_published', {
          jobId: job.id,
          type: jobType,
          data: jobData
        });

        return job.id;
      } else {
        throw new Error('Failed to publish job to queue');
      }

    } catch (error) {
      console.error('❌ Job publishing failed:', error);
      throw error;
    }
  }

  /**
   * Consume jobs from specific queue
   */
  async consumeJobs(jobType, processor, options = {}) {
    if (!this.isConnected) {
      throw new Error('RabbitMQ not connected');
    }

    const queueName = this.config.queues[jobType];
    if (!queueName) {
      throw new Error(`Unknown job type: ${jobType}`);
    }

    const consumerTag = `consumer_${jobType}_${Date.now()}`;
    
    console.log(`🔄 Starting consumer for ${jobType} jobs...`);

    const consumer = await this.channel.consume(
      queueName,
      async (msg) => {
        if (!msg) return;

        let job;
        try {
          job = JSON.parse(msg.content.toString());
          job.attempts = parseInt(msg.properties.headers['x-attempts'] || 0) + 1;
          
          console.log(`📥 Processing job: ${job.id} (attempt: ${job.attempts})`);
          
          this.jobStats.processing++;
          this.emit('job_started', { jobId: job.id, type: jobType });

          // Process the job
          const startTime = Date.now();
          const result = await processor(job.data, job.metadata);
          const processingTime = Date.now() - startTime;

          // Job completed successfully
          this.channel.ack(msg);
          this.jobStats.processing--;
          this.jobStats.completed++;
          
          console.log(`✅ Job completed: ${job.id} (${processingTime}ms)`);
          
          this.emit('job_completed', {
            jobId: job.id,
            type: jobType,
            result,
            processingTime
          });

          // Chain to next job type if specified
          if (options.nextJobType && result) {
            await this.publishJob(options.nextJobType, {
              ...result,
              previousJobId: job.id
            });
          }

        } catch (error) {
          console.error(`❌ Job processing failed: ${job?.id || 'unknown'}`, error);
          
          this.jobStats.processing--;
          
          // Check if we should retry
          if (job && job.attempts < job.maxAttempts) {
            // Requeue with delay
            setTimeout(async () => {
              try {
                await this.publishJob(jobType, job.data, {
                  ...job.metadata,
                  previousAttempts: job.attempts
                });
                this.jobStats.retried++;
                console.log(`🔄 Job requeued for retry: ${job.id}`);
              } catch (requeueError) {
                console.error('❌ Failed to requeue job:', requeueError);
                this.channel.nack(msg, false, false); // Send to dead letter
              }
            }, this.config.retryDelay);
            
            this.channel.ack(msg); // Acknowledge to remove from queue
            
          } else {
            // Max attempts reached, send to dead letter
            this.jobStats.failed++;
            this.channel.nack(msg, false, false);
            
            this.emit('job_failed', {
              jobId: job?.id || 'unknown',
              type: jobType,
              error: error.message,
              attempts: job?.attempts || 0
            });
          }
        }
      },
      {
        consumerTag,
        noAck: false
      }
    );

    this.consumers.set(jobType, {
      consumerTag: consumer.consumerTag,
      processor,
      options
    });

    console.log(`✅ Consumer started for ${jobType} jobs`);
    return consumer.consumerTag;
  }

  /**
   * Convenient methods for specific job types
   */
  
  // Crawl jobs
  async publishCrawlJob(url, options = {}) {
    return this.publishJob('crawl', {
      url,
      crawlOptions: options.crawlOptions || {},
      metadata: options.metadata || {}
    }, options);
  }

  async consumeCrawlJobs(processor) {
    return this.consumeJobs('crawl', processor, {
      nextJobType: 'ocr' // Chain to OCR after crawling
    });
  }

  // OCR jobs
  async publishOCRJob(documentPath, options = {}) {
    return this.publishJob('ocr', {
      documentPath,
      ocrOptions: options.ocrOptions || {},
      metadata: options.metadata || {}
    }, options);
  }

  async consumeOCRJobs(processor) {
    return this.consumeJobs('ocr', processor, {
      nextJobType: 'embed' // Chain to embedding after OCR
    });
  }

  // Embedding jobs  
  async publishEmbedJob(textContent, options = {}) {
    return this.publishJob('embed', {
      textContent,
      chunks: options.chunks || [],
      embedOptions: options.embedOptions || {},
      metadata: options.metadata || {}
    }, options);
  }

  async consumeEmbedJobs(processor) {
    return this.consumeJobs('embed', processor, {
      nextJobType: 'index' // Chain to indexing after embedding
    });
  }

  // Index jobs
  async publishIndexJob(embeddings, options = {}) {
    return this.publishJob('index', {
      embeddings,
      documentId: options.documentId,
      indexOptions: options.indexOptions || {},
      metadata: options.metadata || {}
    }, options);
  }

  async consumeIndexJobs(processor) {
    return this.consumeJobs('index', processor);
  }

  /**
   * Batch job publishing for bulk operations
   */
  async publishBatchJobs(jobs) {
    const jobIds = [];
    
    for (const job of jobs) {
      const jobId = await this.publishJob(job.type, job.data, job.options);
      jobIds.push(jobId);
    }
    
    console.log(`📦 Published batch of ${jobs.length} jobs`);
    return jobIds;
  }

  /**
   * Get queue status and metrics
   */
  async getQueueStatus() {
    if (!this.isConnected) {
      return { error: 'Not connected to RabbitMQ' };
    }

    const status = {
      connected: this.isConnected,
      stats: { ...this.jobStats },
      queues: {},
      timestamp: new Date().toISOString()
    };

    try {
      for (const [key, queueName] of Object.entries(this.config.queues)) {
        const queueInfo = await this.channel.checkQueue(queueName);
        status.queues[key] = {
          name: queueName,
          messageCount: queueInfo.messageCount,
          consumerCount: queueInfo.consumerCount
        };
      }
    } catch (error) {
      status.error = error.message;
    }

    return status;
  }

  /**
   * Purge specific queue
   */
  async purgeQueue(jobType) {
    const queueName = this.config.queues[jobType];
    if (!queueName) {
      throw new Error(`Unknown job type: ${jobType}`);
    }

    const result = await this.channel.purgeQueue(queueName);
    console.log(`🧹 Purged ${result.messageCount} messages from ${queueName}`);
    return result;
  }

  /**
   * Stop consuming jobs
   */
  async stopConsumer(jobType) {
    const consumer = this.consumers.get(jobType);
    if (!consumer) {
      throw new Error(`No consumer found for job type: ${jobType}`);
    }

    await this.channel.cancel(consumer.consumerTag);
    this.consumers.delete(jobType);
    console.log(`⏹️ Stopped consumer for ${jobType} jobs`);
  }

  /**
   * Process complete pipeline workflow
   */
  async processPipelineWorkflow(url, options = {}) {
    console.log(`🚀 Starting complete pipeline workflow for: ${url}`);
    
    const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const metadata = {
      workflowId,
      url,
      startTime: new Date().toISOString(),
      ...options.metadata
    };

    // Start with crawl job
    const crawlJobId = await this.publishCrawlJob(url, {
      metadata,
      priority: options.priority || 0
    });

    this.emit('workflow_started', {
      workflowId,
      url,
      initialJobId: crawlJobId
    });

    return workflowId;
  }

  /**
   * Cleanup and close connections
   */
  async cleanup() {
    console.log('🧹 Cleaning up RabbitMQ connections...');
    
    // Stop all consumers
    for (const [jobType] of this.consumers) {
      await this.stopConsumer(jobType);
    }

    // Close channel and connection
    if (this.channel) {
      await this.channel.close();
    }
    
    if (this.connection) {
      await this.connection.close();
    }

    this.isConnected = false;
    console.log('✅ RabbitMQ cleanup completed');
  }
}

/**
 * Pipeline Job Processors
 * Integrate with the crawl-ocr-embed-worker functionality
 */
export class PipelineProcessors {
  constructor(workerPool) {
    this.workerPool = workerPool; // Reference to the worker cluster
  }

  /**
   * Crawl job processor
   */
  async processCrawlJob(jobData, metadata) {
    console.log(`🕷️ Processing crawl job for: ${jobData.url}`);
    
    try {
      // Delegate to worker pool
      const result = await this.workerPool.crawlDocument(jobData.url, {
        ...jobData.crawlOptions,
        metadata
      });

      return {
        documentPath: result.documentPath,
        contentType: result.contentType,
        pageCount: result.pageCount,
        extractedLinks: result.extractedLinks,
        metadata: {
          ...metadata,
          crawlCompleted: new Date().toISOString(),
          fileSize: result.fileSize
        }
      };

    } catch (error) {
      console.error('❌ Crawl job failed:', error);
      throw error;
    }
  }

  /**
   * OCR job processor
   */
  async processOCRJob(jobData, metadata) {
    console.log(`👁️ Processing OCR job for: ${jobData.documentPath}`);
    
    try {
      const result = await this.workerPool.processOCR(jobData.documentPath, {
        ...jobData.ocrOptions,
        metadata
      });

      return {
        textContent: result.textContent,
        chunks: result.chunks,
        confidence: result.confidence,
        language: result.language,
        metadata: {
          ...metadata,
          ocrCompleted: new Date().toISOString(),
          pageCount: result.pageCount
        }
      };

    } catch (error) {
      console.error('❌ OCR job failed:', error);
      throw error;
    }
  }

  /**
   * Embedding job processor
   */
  async processEmbedJob(jobData, metadata) {
    console.log(`🧠 Processing embedding job for ${jobData.chunks?.length || 0} chunks`);
    
    try {
      const result = await this.workerPool.generateEmbeddings(
        jobData.textContent,
        jobData.chunks,
        {
          ...jobData.embedOptions,
          metadata
        }
      );

      return {
        embeddings: result.embeddings,
        documentId: result.documentId,
        vectorCount: result.embeddings.length,
        metadata: {
          ...metadata,
          embeddingCompleted: new Date().toISOString(),
          model: result.model
        }
      };

    } catch (error) {
      console.error('❌ Embedding job failed:', error);
      throw error;
    }
  }

  /**
   * Index job processor
   */
  async processIndexJob(jobData, metadata) {
    console.log(`📚 Processing index job for document: ${jobData.documentId}`);
    
    try {
      const result = await this.workerPool.storeEmbeddings(
        jobData.embeddings,
        jobData.documentId,
        {
          ...jobData.indexOptions,
          metadata
        }
      );

      return {
        indexed: true,
        documentId: jobData.documentId,
        vectorsStored: result.vectorsStored,
        searchIndexUpdated: result.searchIndexUpdated,
        metadata: {
          ...metadata,
          indexCompleted: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('❌ Index job failed:', error);
      throw error;
    }
  }
}

// Export the main class
export default RabbitMQJobQueuing;

// Export convenience factory function
export function createJobQueue(config = {}) {
  return new RabbitMQJobQueuing(config);
}