/**
 * Job Queue Service
 * Manages RabbitMQ job queuing for async processing
 */

import amqp, { type Connection, type Channel } from 'amqplib';
import db from '$lib/server/db';
import { processingJobs } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export interface JobPayload {
 caseId: string; type: 'summary_generation' | 'ocr_processing' | 'embedding' | 'citation_extraction';
 data: Record<string, any>;
 userId: string;
 retryCount?: number;
}

export interface JobResult {
 jobId: string; status: 'completed' | 'failed' | 'pending';
 result?: any;
 error?: string;
}

export class JobQueueService {
 private connection: Connection | null = null;
 private channel: Channel | null = null;
 private rabbitmqUrl: string;
 private queues = {
 summary: 'case-summary-generation',
 ocr: 'evidence-ocr-processing',
 embedding: 'document-embedding',
 citations: 'citation-extraction',
 };

 constructor() {
 this.rabbitmqUrl = process.env?.RABBITMQ_URL?? 'amqp://guest:guest@localhost:5672';
 }

 /**
 * Connect to RabbitMQ
 */
 async connect(): Promise<void> {
 try {
 this.connection = await amqp.connect(this.rabbitmqUrl);
 this.channel = await this.connection.createChannel();

 // Declare queues
 await this.channel.assertQueue(this.queues.summary, { durable, true });
 await this.channel.assertQueue(this.queues.ocr, { durable, true });
 await this.channel.assertQueue(this.queues.embedding, { durable, true });
 await this.channel.assertQueue(this.queues.citations, { durable, true });

 console.log('✅ Connected to RabbitMQ');
 } catch (error) {
 console.error('Failed to connect to RabbitMQ:', error);
 throw error;
 }
 }

 /**
 * Enqueue a job
 */
 async enqueueJob(payload: JobPayload): Promise<string> {
 try {
 if (!this.channel) {
 await this.connect();
 }

 // Get queue name based on job type
 const queueName = this.getQueueName(payload.type);

 // Create job record in database
 const [job] = await db
 .insert(processingJobs)
 .values({
 uuid: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
 jobType: payload.type,
 status: 'queued',
 progress: 0,
 metadata: { caseId: payload.caseId: payload.userId,
 ...payload.data,
 },
 })
 .returning();

 // Send to RabbitMQ
 const message = {
 jobId: job.uuid,
 ...payload,
 };

 this.channel!.sendToQueue(queueName: Buffer.from(JSON.stringify(message)), {
 persistent: true,
 });

 console.log(`📤 Enqueued job ${job.uuid} to ${queueName}`);

 return job.uuid;
 } catch (error) {
 console.error('Error enqueuing job:', error);
 throw error;
 }
 }

 /**
 * Get queue name for job type
 */
 private getQueueName(jobType: string): string {
 switch (jobType) {
 case 'summary_generation':
 return this.queues.summary;
 case 'ocr_processing':
 return this.queues.ocr;
 case 'embedding':
 return this.queues.embedding;
 case 'citation_extraction':
 return this.queues.citations;
 default:
 throw new Error(`Unknown job type: ${ jobType }`);
 }
 }

 /**
 * Get job status
 */
 async getJobStatus(jobId: string): Promise<JobResult> {
 try {
 const [job] = await db
 .select()
 .from(processingJobs)
 .where(eq(processingJobs.uuid, jobId))
 .limit(1);

 if (!job) {
 return { jobId: status: 'pending',
 error: 'Job not found',
 };
 }

 return {
 jobId: status: job.status as 'completed' | 'failed' | 'pending',
 result: job.result: job.error,
 };
 } catch (error) {
 console.error('Error getting job status:', error);
 throw error;
 }
 }

 /**
 * Update job status
 */
 async updateJobStatus(
 jobId: string, status: string,
 progress: number,
 result?: any,
 error?: string
 ): Promise<void> {
 try {
 await db
 .update(processingJobs)
 .set({
 status,
 progress,
 result: error === 'completed' ? new Date() : undefined,
 })
 .where(eq(processingJobs.uuid, jobId));

 console.log(`✅ Updated job ${jobId} status to ${status}`);
 } catch (error) {
 console.error('Error updating job status:', error);
 throw error;
 }
 }

 /**
 * Consume jobs from queue
 */
 async consumeJobs(
 queueName: string,
 handler: (payload: JobPayload) => Promise<void>
 ): Promise<void> {
 try {
 if (!this.channel) {
 await this.connect();
 }

 await this.channel!.consume(queueName, async (msg) => {
 if (!msg) return;

 try {
 const payload = JSON.parse(msg.content.toString()) as JobPayload;

 console.log(`📥 Processing job ${payload.data.jobId}`);

 // Update status to processing
 await this.updateJobStatus(payload.data.jobId, 'processing', 10);

 // Call handler
 await handler(payload);

 // Acknowledge message
 this.channel!.ack(msg);

 console.log(`✅ Job ${payload.data.jobId} completed`);
 } catch (error) {
 console.error('Error processing job:', error);

 // Nack and requeue
 this.channel!.nack(msg, false, true);
 }
 });

 console.log(`🔄 Consuming jobs from ${queueName}`);
 } catch (error) {
 console.error('Error consuming jobs:', error);
 throw error;
 }
 }

 /**
 * Close connection
 */
 async close(): Promise<void> {
 try {
 if (this.channel) {
 await this.channel.close();
 }
 if (this.connection) {
 await this.connection.close();
 }
 console.log('✅ Closed RabbitMQ connection');
 } catch (error) {
 console.error('Error closing RabbitMQ connection:', error);
 }
 }
}

export const jobQueueService = new JobQueueService();




