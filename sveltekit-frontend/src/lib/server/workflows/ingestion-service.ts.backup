/**
 * Ingestion Workflow Service
 * Integrates XState machine + LokiJS tracker + RabbitMQ messaging
 */

import type { IngestionJob } from '$lib/machines/ingestion-workflow-machine.js';
import { ingestionWorkflowMachine } from '$lib/machines/ingestion-workflow-machine.js';
import { setupQueues } from '$lib/server/rabbitmq.js';
import { jobTracker } from '$lib/services/job-tracker.js';
import { createActor, type ActorRefFrom } from 'xstate';

// New: explicit minimal actor type to avoid `any` type
type WorkflowActor = ActorRefFrom<typeof ingestionWorkflowMachine>;

type ServiceResponse = {
	success: boolean;
	message?: string;
	[key: string]: unknown;
};

class IngestionService {
	// assign the imported actor, cast safely through unknown to our minimal WorkflowActor type
	workflowActor: WorkflowActor;

	config = {
		enableRabbitMQ: true,
		enableRedisQueues: true,
		maxConcurrency: 4,
	};

	constructor() {
		setupQueues();
		this.workflowActor = createActor(ingestionWorkflowMachine).start();
	}

	async enqueue(job: IngestionJob): Promise<ServiceResponse> {
		this.workflowActor.send({ type: 'QUEUE_JOB', job });
		return { success: true, message: `Enqueued job ${job.id}` };
	}

	async process(job: IngestionJob): Promise<ServiceResponse> {
		this.workflowActor.send({ type: 'PROCESS_NEXT_JOB' });
		return { success: true, message: `Detailed processing triggered for job ${job.id}` };
	}

	// Cleanup and maintenance
	async clearCompletedJobs(): Promise<ServiceResponse> {
		this.workflowActor.send({ type: 'CLEAR_COMPLETED' });
		const cleared = jobTracker.clearCompletedJobs();
		return { success: true, message: `Cleared ${cleared} completed jobs` };
	}

	async resetStats(): Promise<ServiceResponse> {
		this.workflowActor.send({ type: 'RESET_STATS' });
		jobTracker.reset();
		return { success: true, message: 'Statistics reset' };
	}

	async shutdown(): Promise<void> {
		console.log('🛑 Shutting down Ingestion Service...');
		// type-safe stop invocation that supports both sync and async stop implementations
		if (this.workflowActor && typeof this.workflowActor.stop === 'function') {
			this.workflowActor.stop();
		}
		await jobTracker.save();
		console.log('✅ Ingestion Service shutdown complete');
	}
}

// Singleton instance
export const ingestionService = new IngestionService();
export default ingestionService;



