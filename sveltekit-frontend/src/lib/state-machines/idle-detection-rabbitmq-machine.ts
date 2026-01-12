/**
 * Idle Detection + RabbitMQ Integration Machine
 * Detects user idle state and queues background jobs via RabbitMQ
 *
 * Features:
 * - Idle timeout detection (5 minutes default)
 * - Activity tracking (mouse, keyboard, scroll)
 * - Job queueing to RabbitMQ work queues
 * - Graceful error handling with exponential backoff
 *
 * Integrates with:
 * - RabbitMQ (AMQP 5672) for async job queueing
 * - case-creation-machine (via rabbitmq job queue)
 * - enhanced-legal-case-machine (via rabbitmq job queue)
 *
 * XState v5 compliant
 */

import { assign, fromPromise } from 'xstate';
import { setup } from 'xstate/setup';

export type JobType =
	| 'document_analysis'
	| 'case_clustering'
	| 'legal_research'
	| 'citation_validation'
	| 'self_prompting'
	| 'case_creation'
	| 'case_management'
	| 'recommendation_generation';

export interface IdleContext {
	lastActivityTimestamp: number;
	idleThresholdMs: number;
	isIdle: boolean;
	activityCount: number;
	queuedJobs: Array<{ type: JobType; payload: any; timestamp: number }>;
	errorCount: number;
	lastError?: string;
}

export type IdleEvent =
	| { type: 'ACTIVITY_DETECTED' }
	| { type: 'IDLE_TIMEOUT' }
	| { type: 'QUEUE_JOB'; jobType: JobType; payload: any }
	| { type: 'RESET' };

/**
 * Actor: Check if user is currently idle
 */
const checkIdleStatus = fromPromise<{ isIdle: boolean; idleDurationMs: number }>(
	async ({ input }: { input: IdleContext }) => {
	const now = Date.now();
	const idleDurationMs = now - input.lastActivityTimestamp;
	const isIdle = idleDurationMs >= input.idleThresholdMs;

	return { isIdle, idleDurationMs };
});

/**
 * Actor: Publish job to RabbitMQ queue
 */
const publishToRabbitMQ = fromPromise<{ success: boolean; jobId: string }>(
	async ({ input }: { input: { jobType: JobType; payload: any } }) => {
	const jobId = crypto.randomUUID();

	try {
		const response = await fetch('/api/rabbitmq/publish', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				queue: getQueueNameForJobType(input.jobType),
				message: {
					jobId,
					type: input.jobType,
					payload: input.payload,
					timestamp: Date.now()
				},
				options: {
					persistent: true,
					priority: getPriorityForJobType(input.jobType)
				}
			})
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`RabbitMQ publish failed: ${error}`);
		}

		const result = await response.json();
		console.log(`✅ Published ${input.jobType} job ${jobId} to RabbitMQ`);

		return { success: true, jobId: result.jobId || jobId };
	} catch (error) {
		console.error(`❌ Failed to publish ${input.jobType} job:`, error);
		throw error;
	}
});

/**
 * Helper: Map job type to RabbitMQ queue name
 */
function getQueueNameForJobType(jobType: JobType): string {
	const queueMap: Record<JobType, string> = {
		document_analysis: 'document_analysis_queue',
		case_clustering: 'case_clustering_queue',
		legal_research: 'legal_research_queue',
		citation_validation: 'citation_validation_queue',
		self_prompting: 'self_prompting_queue',
		case_creation: 'case_creation_queue',
		case_management: 'case_management_queue',
		recommendation_generation: 'recommendation_queue'
	};

	return queueMap[jobType];
}

/**
 * Helper: Assign priority to job types (1-10, 10 = highest)
 */
function getPriorityForJobType(jobType: JobType): number {
	const priorityMap: Record<JobType, number> = {
		case_creation: 10, // User-initiated, highest priority
		case_management: 9,
		legal_research: 7,
		citation_validation: 6,
		document_analysis: 5,
		recommendation_generation: 4,
		case_clustering: 3,
		self_prompting: 2
	};

	return priorityMap[jobType];
}

/**
 * Idle Detection State Machine
 */
export const idleDetectionMachine = setup({
	types: {} as {
		context: IdleContext,
		events: IdleEvent,
	},
	actors: {
		checkIdleStatus,
		publishToRabbitMQ
	},
	actions: {
		recordActivity: assign({
			lastActivityTimestamp: () => Date.now(),
			activityCount: ({ context }) => context.activityCount + 1,
			isIdle: false
		}),

		markIdle: assign({
			isIdle: true
		}),

		queueJob: assign({
			queuedJobs: ({ context, event }) => {
				if (event.type !== 'QUEUE_JOB') return context.queuedJobs;

				return [
					...context.queuedJobs,
					{
						type: event.jobType,
						payload: event.payload,
						timestamp: Date.now()
					}
				];
			}
		}),

		incrementErrorCount: assign({
			errorCount: ({ context }) => context.errorCount + 1
		}),

		recordError: assign({
			lastError: ({ event }) => {
				if ('error' in event) {
					return String(event.error);
				}
				return 'Unknown error';
			}
		}),

		resetErrors: assign({
			errorCount: 0,
			lastError: undefined
		}),

		clearQueue: assign({
			queuedJobs: []
		})
	},
	guards: {
		isIdleThresholdReached: ({ context }, { isIdle }: { isIdle: boolean }) => {
			return isIdle;
		},

		hasQueuedJobs: ({ context }) => {
			return context.queuedJobs.length > 0;
		},

		canRetry: ({ context }) => {
			return context.errorCount < 5; // Max 5 retries
		}
	}
}).createMachine({
	id: 'idleDetection',
	initial: 'active',
	context: {
		lastActivityTimestamp: Date.now(),
		idleThresholdMs: 5 * 60 * 1000, // 5 minutes default
		isIdle: false,
		activityCount: 0,
		queuedJobs: [],
		errorCount: 0
	},

	states: {
		active: {
			on: {
				ACTIVITY_DETECTED: {
					actions: ['recordActivity']
				},

				IDLE_TIMEOUT: {
					target: 'checkingIdleStatus'
				},

				QUEUE_JOB: {
					actions: ['queueJob']
				}
			},

			after: {
				5000: 'checkingIdleStatus' // Check every 5 seconds
			}
		},

		checkingIdleStatus: {
			invoke: {
				src: 'checkIdleStatus',
				input: ({ context }) => context,

				onDone: [
					{
						guard: ({ event }) => event.output.isIdle,
						target: 'idle',
						actions: ['markIdle']
					},
					{
						target: 'active'
					}
				],

				onError: {
					target: 'active',
					actions: ['recordError', 'incrementErrorCount']
				}
			}
		},

		idle: {
			entry: ['resetErrors'],

			on: {
				ACTIVITY_DETECTED: {
					target: 'active',
					actions: ['recordActivity']
				},

				QUEUE_JOB: {
					target: 'processingQueue',
					actions: ['queueJob']
				}
			},

			after: {
				10000: [
					{
						guard: 'hasQueuedJobs',
						target: 'processingQueue'
					},
					{
						target: 'idle'
					}
				]
			}
		},

		processingQueue: {
			invoke: {
				src: 'publishToRabbitMQ',
				input: ({ context }) => {
					const nextJob = context.queuedJobs[0];
					return {
						jobType: nextJob.type,
						payload: nextJob.payload
					};
				},

				onDone: {
					target: 'idle',
					actions: [
						assign({
							queuedJobs: ({ context }) => context.queuedJobs.slice(1)
						}),
						'resetErrors'
					]
				},

				onError: [
					{
						guard: 'canRetry',
						target: 'retrying',
						actions: ['recordError', 'incrementErrorCount']
					},
					{
						target: 'error',
						actions: ['recordError']
					}
				]
			}
		},

		retrying: {
			after: {
				// Exponential backoff: 2^errorCount seconds
				'{{ Math.pow(2, context.errorCount) * 1000 }}': 'processingQueue'
			}
		},

		error: {
			entry: ['clearQueue'],

			on: {
				RESET: {
					target: 'active',
					actions: ['resetErrors']
				},

				ACTIVITY_DETECTED: {
					target: 'active',
					actions: ['recordActivity', 'resetErrors']
				}
			},

			after: {
				30000: 'active' // Auto-recover after 30 seconds
			}
		}
	}
});

export default idleDetectionMachine;
