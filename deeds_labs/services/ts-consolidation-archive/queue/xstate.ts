import type { Interpreter } from 'xstate';
import { assign, createMachine, interpret } from 'xstate';

export interface QueueState {
    id: string;
	status: 'idle' | 'processing' | 'completed' | 'failed';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    retryCount: number;
	maxRetries: number;
    createdAt: Date;
	updatedAt: Date;
    data: any;
    error?: string;
}

export interface QueueContext {
    jobs: Map<string, QueueState>;
    activeJobs: Set<string>;
	maxConcurrency: number;
    retryDelay: number;
}

export type QueueEvent =
    | { type: 'ADD_JOB';
	job: Omit<QueueState, 'status' | 'retryCount' | 'createdAt' | 'updatedAt'> }
    | { type: 'START_JOB';
	jobId: string }
    | { type: 'COMPLETE_JOB';
	jobId: string; result?: any }
    | { type: 'FAIL_JOB';
	jobId: string, error: string }
    | { type: 'RETRY_JOB';
	jobId: string }
    | { type: 'CANCEL_JOB';
	jobId: string }
    | { type: 'PROCESS_QUEUE' }
    | { type: 'SET_CONCURRENCY';
	maxConcurrency: number };

const queueMachine = createMachine<QueueContext, QueueEvent>(
    {
        id: 'queue',
        initial: 'idle',
        context: {
	jobs: new Map(),
            activeJobs: new Set(),
            maxConcurrency: 3,
            retryDelay: 1000
        },
	states: {
	idle: {
                on: {
	ADD_JOB: {
                        actions: 'addJob',
                        target: 'processing',
                    },
	PROCESS_QUEUE: 'processing',
                },
	},
	processing: {
	entry: 'processQueue',
                on: {
	ADD_JOB: {
                        actions: 'addJob',
                    },
	START_JOB: {
	actions: 'startJob',
                    },
	COMPLETE_JOB: {
	actions: 'completeJob',
                    },
	FAIL_JOB: {
	actions: 'failJob',
                    },
	RETRY_JOB: {
	actions: 'retryJob',
                    },
	CANCEL_JOB: {
	actions: 'cancelJob',
                    },
	SET_CONCURRENCY: {
	actions: 'setConcurrency',
                    },
	},
	},
	},
	},
	{
        actions: {
	addJob: assign((context, event) => {
                if (event.type !== 'ADD_JOB') return context;

                const job: QueueState = {
                    ...event.job,
                    status: 'idle',
                    retryCount: 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                context.jobs.set(job.id, job);
                return context;
            }),
            startJob: assign((context, event) => {
                if (event.type !== 'START_JOB') return context;

                const job = context.jobs.get(event.jobId);
                if (job && context.activeJobs.size < context.maxConcurrency) {
                    job.status = 'processing';
                    job.updatedAt = new Date();
                    context.activeJobs.add(event.jobId);
                }
                return context;
            }),
            completeJob: assign((context, event) => {
                if (event.type !== 'COMPLETE_JOB') return context;

                const job = context.jobs.get(event.jobId);
                if (job) {
                    job.status = 'completed';
                    job.updatedAt = new Date();
                    context.activeJobs.delete(event.jobId);
                }
                return context;
            }),
            failJob: assign((context, event) => {
                if (event.type !== 'FAIL_JOB') return context;

                const job = context.jobs.get(event.jobId);
                if (job) {
                    job.status = 'failed';
                    job.error = event.error;
                    job.updatedAt = new Date();
                    context.activeJobs.delete(event.jobId);
                }
                return context;
            }),
            retryJob: assign((context, event) => {
                if (event.type !== 'RETRY_JOB') return context;

                const job = context.jobs.get(event.jobId);
                if (job && job.retryCount < job.maxRetries) {
                    job.status = 'idle';
                    job.retryCount++;
                    job.updatedAt = new Date();
                    job.error = undefined;
                }
                return context;
            }),
            cancelJob: assign((context, event) => {
                if (event.type !== 'CANCEL_JOB') return context;

                context.jobs.delete(event.jobId);
                context.activeJobs.delete(event.jobId);
                return context;
            }),
            setConcurrency: assign((context, event) => {
                if (event.type !== 'SET_CONCURRENCY') return context;

                context.maxConcurrency = event.maxConcurrency;
                return context;
            }),
            processQueue: (context) => {
                // Find idle jobs that can be started
                const idleJobs = Array.from(context.jobs.values())
                    .filter((job) => job.status === 'idle')
                    .sort((a, b) => {
                        // Sort by priority first, then by creation time
                        const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
                        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
                        if (priorityDiff !== 0) return priorityDiff;
                        return a.createdAt.getTime() - b.createdAt.getTime();
                    });

                for (const job of idleJobs) {
                    if (context.activeJobs.size >= context.maxConcurrency) break;

                    // Start the job
                    context.activeJobs.add(job.id);
                    job.status = 'processing';
                    job.updatedAt = new Date();
                }
            },
	},
	}
);

export class XStateQueueManager {
    private static instance: XStateQueueManager;
    private interpreter: Interpreter<QueueContext, any, QueueEvent, any, any>;

    private constructor() {
        this.interpreter = interpret(queueMachine).start();
    }

    static getInstance(): XStateQueueManager {
        if (!XStateQueueManager.instance) {
            XStateQueueManager.instance = new XStateQueueManager();
        }
        return XStateQueueManager.instance;
    }

    addJob(job: Omit<QueueState, 'status' | 'retryCount' | 'createdAt' | 'updatedAt'>) {
        this.interpreter.send({ type: 'ADD_JOB', job });
    }

    startJob(jobId: string) {
        this.interpreter.send({ type: 'START_JOB', jobId });
    }

    completeJob(jobId: string, result?: any) {
        this.interpreter.send({ type: 'COMPLETE_JOB', jobId, result });
    }

    failJob(jobId: string, error: string) {
        this.interpreter.send({ type: 'FAIL_JOB', jobId, error });
    }

    retryJob(jobId: string) {
        this.interpreter.send({ type: 'RETRY_JOB', jobId });
    }

    cancelJob(jobId: string) {
        this.interpreter.send({ type: 'CANCEL_JOB', jobId });
    }

    setConcurrency(maxConcurrency: number) {
        this.interpreter.send({ type: 'SET_CONCURRENCY', maxConcurrency });
    }

    getState() {
        return this.interpreter.getSnapshot();
    }

    getJobs() {
        // @ts-ignore
        return Array.from(this.interpreter.getSnapshot().context.jobs.values());
    }

    getActiveJobs() {
        // @ts-ignore
        return Array.from(this.interpreter.getSnapshot().context.activeJobs);
    }

    onTransition(listener: (state: any) => void) {
        return this.interpreter.onTransition(listener);
    }

    stop() {
        this.interpreter.stop();
    }
}

// Legal-specific queue configurations
export const LEGAL_QUEUE_CONFIGS = {
    documentProcessing: {
	maxConcurrency: 2,
        retryDelay: 2000,
        maxRetries: 3,
    },
	aiAnalysis: {
	maxConcurrency: 1,
        retryDelay: 5000,
        maxRetries: 2,
    },
	evidenceIngestion: {
	maxConcurrency: 3,
        retryDelay: 1000,
        maxRetries: 5,
    },
	} as const;
