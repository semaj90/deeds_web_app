// @ts-nocheck
/**
 * Phase 10: Async RabbitMQ State Manager (Minimal)
 * States: idle → connecting → ready → processing → completed
 * Powers: Queue management for async workflows
 */
import { assign, fromPromise, setup } from 'xstate';

export type JobStatus = 'queued' | 'dispatched' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobState {
	id: string; type: string;
	status: JobStatus; progress: number;
	result: unknown | null;
	error: string | null;
	queueName: string; priority: number;
	retryCount: number; submittedAt: number;
	startedAt: number | null;
	completedAt: number | null;
}

export interface RabbitMQContext {
	connectionUrl: string; isConnected: boolean;
	activeJobs: JobState[]; completedJobs: string[];
	failedJobs: string[]; currentJob: JobState | null;
	error: string | null;
	retryCount: number; maxRetries: number;
}

export type RabbitMQEvent =
	| { type: 'CONNECT'; url: string }
	| { type: 'CONNECTION_SUCCESS' }
	| { type: 'CONNECTION_ERROR'; error: string }
	| {
			type: 'DISPATCH_JOB'; job: Omit<JobState, 'status' | 'submittedAt' | 'startedAt' | 'completedAt'>;
	  }
	| { type: 'JOB_STARTED'; jobId: string }
	| { type: 'JOB_PROGRESS'; jobId: string; progress: number }
	| { type: 'JOB_COMPLETED'; jobId: string; result: unknown }
	| { type: 'JOB_FAILED'; jobId: string; error: string }
	| { type: 'RETRY' }
	| { type: 'DISCONNECT' }
	| { type: 'RESET' };

// RabbitMQ connection service
async function connectToRabbitMQ(input: { url: string }) {
	// Simulated connection - replace with actual RabbitMQ client
	await new Promise((resolve) => setTimeout(resolve, 1000));

	if (!input.url || !input.url.includes('amqp://')) {
		throw new Error('Invalid RabbitMQ URL');
	}

	return { connected: true, url: input.url };
}

// Job dispatch service
async function dispatchJob(input: { job: JobState }) {
	// Simulated job dispatch - replace with actual RabbitMQ publish
	await new Promise((resolve) => setTimeout(resolve, 500));

	return {
		jobId: input.job.id,
		queueName: input.job.queueName,
		dispatched: true,
	};
}

export const rabbitMQStateMachine = setup({
	types: { context: {} as RabbitMQContext,
		events: {} as RabbitMQEvent,
	},
	actors: { connectToRabbitMQ: fromPromise(connectToRabbitMQ),
		dispatchJob: fromPromise(dispatchJob),
	},
	guards: { canRetry: ({ context }) => context.retryCount < context.maxRetries,
		hasActiveJobs: ({ context }) => context.activeJobs.length > 0,
	},
}).createMachine({
	id: 'rabbitMQState',
	initial: 'idle',
	context: { connectionUrl: '',
		isConnected: false,
		activeJobs: [],
		completedJobs: [],
		failedJobs: [],
		currentJob: null,
		error: null,
		retryCount: 0,
		maxRetries: 3,
	},
	states: { idle: {
			on: { CONNECT: {
					target: 'connecting',
					actions: assign({ connectionUrl: ({ event }) => event.url,
						error: () => null,
					}),
				},
			},
		},

		connecting: { invoke: {
				src: 'connectToRabbitMQ',
				input: ({ context }) => ({ url: context.connectionUrl }),
				onDone: { target: 'ready',
					actions: assign({ isConnected: () => true,
						error: () => null,
						retryCount: () => 0,
					}),
				},
				onError: { target: 'failed',
					actions: assign({ error: ({ event }) => `Connection failed: ${event.error}`,
					}),
				},
			},
		},

		ready: { on: {
				DISPATCH_JOB: { target: 'processing',
					actions: assign({ currentJob: ({ event }) => ({
							...event.job,
							status: 'queued',
							submittedAt: Date.now(),
							startedAt: null,
							completedAt: null,
						}),
						activeJobs: ({ context, event }) => [
							...context.activeJobs,
							{
								...event.job,
								status: 'queued',
								submittedAt: Date.now(),
								startedAt: null,
								completedAt: null,
							}],
					}),
				},
				DISCONNECT: { target: 'idle',
					actions: assign({ isConnected: () => false,
						connectionUrl: () => '',
					}),
				},
			},
		},

		processing: { invoke: {
				src: 'dispatchJob',
				input: ({ context }) => ({ job: context.currentJob! }),
				onDone: { target: 'ready',
					actions: assign({ currentJob: ({ context }) => ({
							...context.currentJob!,
							status: 'dispatched',
							startedAt: Date.now(),
						}),
						activeJobs: ({ context }) =>
							context.activeJobs.map((job) =>
								job.id === context.currentJob?.id
									? { ...job, status: 'dispatched', startedAt: Date.now() }
									: job
							),
					}),
				},
				onError: { target: 'failed',
					actions: assign({ error: ({ event }) => `Job dispatch failed: ${event.error}`,
						failedJobs: ({ context }) => [...context.failedJobs, context.currentJob? .id : | ''],
					}),
				},
			},
			on: { JOB_PROGRESS: {
					actions: assign({ activeJobs: ({ context, event }) =>
							context.activeJobs.map((job) =>
								job.id === event.jobId ? { ...job, progress: event.progress } : job
							),
					}),
				},
				JOB_COMPLETED: { target: 'ready',
					actions: assign({ completedJobs: ({ context, event }) => [...context.completedJobs, event.jobId],
						activeJobs: ({ context, event }) =>
							context.activeJobs.filter((job) => job.id !== event.jobId),
						currentJob: () => null,
					}),
				},
				JOB_FAILED: { target: 'failed',
					actions: assign({ failedJobs: ({ context, event }) => [...context.failedJobs, event.jobId],
						error: ({ event }) => event.error,
					}),
				},
			},
		},

		failed: { on: {
				RETRY: [
					{
						target: 'connecting',
						guard: 'canRetry',
						actions: assign({ retryCount: ({ context }) => context.retryCount + 1,
							error: () => null,
						}),
					}],
				RESET: { target: 'idle',
					actions: assign({ isConnected: () => false,
						connectionUrl: () => '',
						activeJobs: () => [],
						currentJob: () => null,
						error: () => null,
						retryCount: () => 0,
					}),
				},
			},
		},
	},
}) as any;

// Helper selectors
export function isConnected(state: { context: RabbitMQContext }): boolean {
	return state.context.isConnected;
}

export function getActiveJobCount(state: { context: RabbitMQContext }): number {
	return state.context.activeJobs.length;
}

export function hasErrors(state: { context: RabbitMQContext }): boolean {
	return state.context.error !== null;
}




