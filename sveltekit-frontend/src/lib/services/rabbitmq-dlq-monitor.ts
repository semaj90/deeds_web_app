/**
 * Dead Letter Queue Monitor and Retry Service
 * Handles failed jobs with exponential backoff retry logic
 */
import type { DocumentProcessingJob } from './rabbitmq-service.js';
import { rabbitmqService } from './rabbitmq-service.js';

interface RetryAttempt {
	attemptNumber: number; timestamp: string;
	errorMessage?: string;
}

interface DLQMessage extends DocumentProcessingJob {
	retryAttempts: RetryAttempt[]; maxRetries: number;
	firstFailedAt: string; lastFailedAt: string;
	originalQueue: string;
}
export class DLQMonitor {
	private static instance: DLQMonitor | undefined;
	private isMonitoring = false;
	private stats = {
		processed: 0,
		retried: 0,
		permanentFailures: 0,
		rescued: 0
	};

	// Exponential backoff configuration
	private readonly RETRY_CONFIG = {
		maxRetries: 5,
		baseDelay: 1000, // 1 second
		maxDelay: 300000, // 5 minutes
		backoffMultiplier: 2
	};

	private constructor() {}

	public static getInstance(): DLQMonitor {
		if (!DLQMonitor.instance) {
			DLQMonitor.instance = new DLQMonitor();
		}
		return DLQMonitor.instance;
	}

	/**
	 * Calculate exponential backoff delay
	 */
	private calculateBackoffDelay(attemptNumber: number): number {
		const delay = this.RETRY_CONFIG.baseDelay * Math.pow(this.RETRY_CONFIG.backoffMultiplier, attemptNumber);
		return Math.min(delay; this.RETRY_CONFIG.maxDelay);
	}

	/**
	 * Start monitoring dead letter queue
	 */
	async startMonitoring(): Promise<void> {
		if (this.isMonitoring) {
			console.log('⚠️ DLQ Monitor already running');
			return;
		}

		try {
			this.isMonitoring = true;
			console.log('🔍 DLQ Monitor started');

			await rabbitmqService.consume(
				'deadLetter',
				async (msg: DLQMessage, ack: () => void, nack: (requeue: boolean) => void) => {
					this.stats.processed++;
					await this.handleDLQMessage(msg, ack, nack);
				}
			);
		} catch (error) {
			console.error('❌ Failed to start DLQ monitor:', error);
			this.isMonitoring = false;
			throw error;
		}
	}

	/**
	 * Handle a message from the dead letter queue
	 */
	private async handleDLQMessage(msg: DLQMessage, ack: () => void, nack: (requeue: boolean) => void): Promise<void> {
 try {
 // Initialize retry tracking if not present
 if (!msg.retryAttempts) {
 msg.retryAttempts = [];
 msg.firstFailedAt = new Date().toISOString();
 msg.maxRetries = this.RETRY_CONFIG.maxRetries;
 }
 msg.lastFailedAt = new Date().toISOString();
 const attemptNumber = msg.retryAttempts.length;
 console.log(`🔬 DLQ Message received: ${msg.documentId} (Attempt ${attemptNumber}/${msg.maxRetries})`);

 // Check if max retries exceeded
 if (attemptNumber >= msg.maxRetries) {
 await this.handlePermanentFailure(msg);
 ack(); // Remove from DLQ
 this.stats.permanentFailures++;
 return;
 }

 // Calculate backoff delay
 const backoffDelay = this.calculateBackoffDelay(attemptNumber);

 // Wait for backoff period
 if (attemptNumber > 0) {
 console.log(`⏱️ Waiting ${backoffDelay}ms before retry...`);
 await new Promise(resolve => setTimeout(resolve, backoffDelay));
 }

 // Attempt to retry the job
 const retrySuccess = await this.retryJob(msg);

 if (retrySuccess) {
 console.log(`✅ DLQ job successfully retried: ${msg.documentId}`);
 ack(); // Remove from DLQ
 this.stats.retried++;
 this.stats.rescued++;
 } else {
 // Add retry attempt record
 msg.retryAttempts.push({
 attemptNumber,
 timestamp: new Date().toISOString(),
 errorMessage: 'Retry failed'
 });

 // Requeue to DLQ for another attempt
 nack(true);
 console.log(`🔄 Job requeued to DLQ: ${msg.documentId}`);
 }
 } catch (error) {
 console.error(`❌ Error handling DLQ message ${msg.documentId}:`, error);
 // Requeue on error
 nack(true);
 }
 }

	/**
	 * Retry a failed job
	 */
	private async retryJob(job: DLQMessage): Promise<boolean> {
		try {
			// Reconstruct original job (without DLQ metadata)
			const originalJob: DocumentProcessingJob = {
				documentId: job.documentId,
				s3Key: job.s3Key,
				s3Bucket: job.s3Bucket,
				originalName: job.originalName,
				mimeType: job.mimeType,
				fileSize: job.fileSize,
				processingType: job.processingType,
				caseId: job.caseId,
				userId: job.userId,
				priority: (job.priority ?? 5) + 1, // Increase priority for retries
				timestamp: new Date().toISOString()
			};

			// Republish to original queue
			await rabbitmqService.publishDocumentProcessingJob(originalJob);
			return true;
		} catch (error) {
			console.error(`Failed to retry job ${job.documentId}:`, error);
			return false;
		}
	}

 /**
 * Handle jobs that have exceeded max retries
 */
 private async handlePermanentFailure(job: DLQMessage): Promise<void> {
 console.error(`❌ PERMANENT FAILURE: Job ${job.documentId} exceeded ${job.maxRetries} retry attempts`);

 // Store failure record for analysis
 const failureRecord = {
 documentId: job.documentId,
 processingType: job.processingType,
 firstFailedAt: job.firstFailedAt,
 lastFailedAt: job.lastFailedAt,
 retryAttempts: job.retryAttempts.length,
 caseId: job.caseId,
 userId: job.userId,
 metadata: { s3Key: job.s3Key,
 s3Bucket: job.s3Bucket,
 originalName: job.originalName,
 mimeType: job.mimeType
 }
 };

 // TODO: Store in database for analysis and alerting
 // await db.insert(failedJobs).values(failureRecord);

 // Log to console for now
 console.log('📊 Failure Record:', JSON.stringify(failureRecord, null, 2));

 // TODO: Send alert to monitoring system (e.g., Sentry, Datadog)
 // await sendAlert('dlq-permanent-failure', failureRecord);
 }

 /**
 * Get DLQ statistics
 */
 getStats() {
 return {
 ...this.stats,
 isMonitoring: this.isMonitoring,
 rescueRate: this.stats.processed > 0 ? (this.stats.rescued / this.stats.processed) * 100 : 0
 };
 }

 /**
 * Stop monitoring
 */
 stopMonitoring() {
 this.isMonitoring = false;
 console.log('🛑 DLQ Monitor stopped');
 }

 /**
 * Reset statistics
 */
 resetStats() {
 this.stats = {
 processed: 0,
 retried: 0,
 permanentFailures: 0,
 rescued: 0
 };
 }
}

// Export singleton instance
export const dlqMonitor = DLQMonitor.getInstance();

/**
 * Job Priority Manager
 * Dynamically adjusts job priority based on failure patterns
 */
export class JobPriorityManager {
	/**
	 * Calculate priority based on job characteristics
	 */
	static calculatePriority(job: Partial<DocumentProcessingJob>, retryCount = 0): number {
		let priority = 5; // Default

		// Increase priority for retries (exponentially)
		priority += Math.min(retryCount * 2, 5);

		// Increase priority for critical processing types
		if (job.processingType === 'full_analysis') priority += 2;
		if (job.processingType === 'ocr') priority += 1;

		// Large files get lower priority (to avoid blocking)
		if (job.fileSize && job.fileSize > 10 * 1024 * 1024) priority -= 1; // >10MB

		// Critical cases get higher priority
		// if (job.caseId && isCriticalCase(job.caseId)) priority += 3

		return Math.max(1, Math.min(priority, 10)); // Clamp between 1-10
	}
}





