/**
 * RabbitMQ XState v5 Integration
 *
 * XState v5 state machine that manages RabbitMQ connection lifecycle,
 * consumer orchestration, and job state tracking.
 *
 * States: disconnected → connecting → connected → consuming ↔ error
 *
 * Uses:
 *   - src/lib/server/queue/rabbitmq-manager-fixed.ts — canonical queue manager with handlers
 */

import { setup, createActor, fromPromise, assign } from 'xstate';

/** Queue names matching rabbitmq-manager-fixed.ts */
export const MANAGED_QUEUES = {
	cache_invalidate: 'cache.invalidate',
	document_embed: 'document.embed',
	evidence_process: 'evidence.process',
	vector_index: 'vector.index',
	chat_context: 'chat.context',
	analytics_track: 'analytics.track',
	codebase_index: 'codebase.index'
} as const;

export type ManagedQueueName = (typeof MANAGED_QUEUES)[keyof typeof MANAGED_QUEUES];

export interface RabbitMQContext {
	connected: boolean;
	consuming: boolean;
	activeConsumers: string[];
	error: string | null;
	reconnectAttempts: number;
	maxReconnectAttempts: number;
	messagesProcessed: number;
	lastMessageAt: number | null;
}

export type RabbitMQEvent =
	| { type: 'CONNECT' }
	| { type: 'CONNECTED' }
	| { type: 'START_CONSUMERS' }
	| { type: 'CONSUMERS_READY'; queues: string[] }
	| { type: 'DISCONNECT' }
	| { type: 'MESSAGE_PROCESSED'; queue: string }
	| { type: 'ERROR'; error: string }
	| { type: 'RETRY' };

const initialContext: RabbitMQContext = {
	connected: false,
	consuming: false,
	activeConsumers: [],
	error: null,
	reconnectAttempts: 0,
	maxReconnectAttempts: 5,
	messagesProcessed: 0,
	lastMessageAt: null
};

export const rabbitmqMachine = setup({
	types: {} as {
		context: RabbitMQContext;
		events: RabbitMQEvent;
	},
	actors: {
		connectToRabbitMQ: fromPromise(async () => true),
		initializeManager: fromPromise(async () => {
			const { rabbitmq } = await import('$lib/server/queue/rabbitmq-manager-fixed.js');
			const ok = await rabbitmq.initialize();
			if (!ok) throw new Error('RabbitMQ manager initialization failed');
			return Object.values(MANAGED_QUEUES);
		})
	},
	actions: {
		setConnected: assign({
			connected: true,
			error: null,
			reconnectAttempts: 0
		}),
		setConsuming: assign(({ event }) => ({
			consuming: true,
			activeConsumers: event.type === 'CONSUMERS_READY' ? event.queues : []
		})),
		setError: assign(({ event, context }) => ({
			connected: false,
			consuming: false,
			error: event.type === 'ERROR' ? event.error : 'Unknown error',
			reconnectAttempts: context.reconnectAttempts + 1
		})),
		resetConnection: assign({
			connected: false,
			consuming: false,
			activeConsumers: [] as string[]
		}),
		trackMessage: assign(({ context }) => ({
			messagesProcessed: context.messagesProcessed + 1,
			lastMessageAt: Date.now()
		}))
	},
	guards: {
		canRetry: ({ context }) => context.reconnectAttempts < context.maxReconnectAttempts
	}
}).createMachine({
	id: 'rabbitmq-orchestrator',
	initial: 'disconnected',
	context: initialContext,
	states: {
		disconnected: {
			on: {
				CONNECT: { target: 'connecting' }
			}
		},
		connecting: {
			invoke: {
				src: 'connectToRabbitMQ',
				onDone: {
					target: 'connected',
					actions: 'setConnected'
				},
				onError: {
					target: 'error',
					actions: assign(({ event }) => ({
						error: (event.error as Error)?.message ?? 'Connection failed',
						connected: false,
						consuming: false
					}))
				}
			}
		},
		connected: {
			on: {
				START_CONSUMERS: { target: 'startingConsumers' },
				DISCONNECT: { target: 'disconnected', actions: 'resetConnection' },
				ERROR: { target: 'error', actions: 'setError' }
			}
		},
		startingConsumers: {
			invoke: {
				src: 'initializeManager',
				onDone: {
					target: 'consuming',
					actions: assign(({ event }) => ({
						consuming: true,
						activeConsumers: event.output as string[]
					}))
				},
				onError: {
					target: 'error',
					actions: assign(({ event }) => ({
						error: (event.error as Error)?.message ?? 'Consumer setup failed',
						consuming: false
					}))
				}
			}
		},
		consuming: {
			on: {
				MESSAGE_PROCESSED: { actions: 'trackMessage' },
				DISCONNECT: { target: 'disconnected', actions: 'resetConnection' },
				ERROR: { target: 'error', actions: 'setError' }
			}
		},
		error: {
			on: {
				CONNECT: {
					guard: 'canRetry',
					target: 'connecting'
				},
				RETRY: {
					guard: 'canRetry',
					target: 'connecting'
				}
			},
			after: {
				5000: {
					guard: 'canRetry',
					target: 'connecting'
				}
			}
		}
	}
});

// Singleton actor
let _actor: ReturnType<typeof createActor<typeof rabbitmqMachine>> | null = null;

export function getRabbitMQActor() {
	if (!_actor) {
		_actor = createActor(rabbitmqMachine);
		_actor.start();
	}
	return _actor;
}

/** Get current state snapshot */
export function getRabbitMQState(): RabbitMQContext {
	return getRabbitMQActor().getSnapshot().context;
}

/** Start the full pipeline: connect → start consumers */
export async function startRabbitMQPipeline(): Promise<void> {
	const actor = getRabbitMQActor();
	actor.send({ type: 'CONNECT' });

	return new Promise((resolve, reject) => {
		const sub = actor.subscribe((snapshot) => {
			if (snapshot.matches('connected')) {
				actor.send({ type: 'START_CONSUMERS' });
			}
			if (snapshot.matches('consuming')) {
				sub.unsubscribe();
				resolve();
			}
			if (
				snapshot.matches('error') &&
				snapshot.context.reconnectAttempts >= snapshot.context.maxReconnectAttempts
			) {
				sub.unsubscribe();
				reject(new Error(snapshot.context.error ?? 'Max reconnect attempts exceeded'));
			}
		});
	});
}

export const rabbitmqActor = getRabbitMQActor();
export default rabbitmqActor;