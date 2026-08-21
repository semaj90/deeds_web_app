/**
 * Event Fabric Projection Worker
 *
 * Consumes the event-fabric queue and dispatches by eventType. The code
 * evidence path is the first real handler; the remaining event classes
 * are registered now so the control-loop seam is explicit and typed.
 */

import amqp from 'amqplib';
import { ENV } from '$lib/server/env.server.js';
import { declareTopology, QUEUES } from '$lib/server/queue/topology.js';
import {
	verifyCodeEvidenceReadback,
} from '$lib/server/queue/code-evidence-event-processing.js';
import type {
	CodeEvidencePersistedEventV1,
} from '$lib/server/queue/integration-events.js';
import {
	createDefaultEventFabricHandlers,
	parseEventFabricMessage,
	type AnalyticsObservationEventV1,
	type ArtifactFailedEventV1,
	type ArtifactMaterializedEventV1,
	type CheckpointCommitEventV1,
	type EventFabricHandlerRegistry,
	type FailureObservationEventV1,
	type PolicyDecisionReceiptEventV1,
	type RecommendationSignalEventV1,
} from '$lib/server/queue/event-fabric.js';
import { emitEventFabricAnalyticsProjection } from '$lib/server/queue/event-fabric-analytics-projection.js';
import {
	recordArtifactFailure,
	verifyArtifactMaterialization,
} from '$lib/server/queue/artifact-materialization-event-processing.js';

export type EventFabricProjectionHandlers = EventFabricHandlerRegistry;

export type EventFabricProjectionWorker = {
	stop: () => Promise<void>;
};

let channel: any = null;
let connection: any = null;

function buildDefaultHandlers(): EventFabricProjectionHandlers {
	const handlers = createDefaultEventFabricHandlers();
	return {
		...handlers,
		'code.evidence.persisted': async (event: CodeEvidencePersistedEventV1) => {
			await verifyCodeEvidenceReadback(event);
		},
		'artifact.materialized': async (event: ArtifactMaterializedEventV1) => {
			await verifyArtifactMaterialization(event);
		},
		'artifact.failed': async (event: ArtifactFailedEventV1) => {
			recordArtifactFailure(event);
		},
	};
}

export async function dispatchEventFabricEvent(
	event: ReturnType<typeof parseEventFabricMessage>,
	handlers: EventFabricProjectionHandlers
): Promise<void> {
	switch (event.eventType) {
		case 'code.evidence.persisted':
			await handlers['code.evidence.persisted'](event as CodeEvidencePersistedEventV1);
			return;
		case 'failure.observed':
			await handlers['failure.observed'](event as FailureObservationEventV1);
			return;
		case 'analytics.observed':
			await handlers['analytics.observed'](event as AnalyticsObservationEventV1);
			return;
		case 'recommendation.signal':
			await handlers['recommendation.signal'](event as RecommendationSignalEventV1);
			return;
		case 'policy.decision.receipt':
			await handlers['policy.decision.receipt'](event as PolicyDecisionReceiptEventV1);
			return;
		case 'checkpoint.commit':
			await handlers['checkpoint.commit'](event as CheckpointCommitEventV1);
			return;
		case 'artifact.materialized':
			await handlers['artifact.materialized'](event as ArtifactMaterializedEventV1);
			return;
		case 'artifact.failed':
			await handlers['artifact.failed'](event as ArtifactFailedEventV1);
			return;
	}
}

export async function startEventFabricWorker(
	handlers: EventFabricProjectionHandlers = buildDefaultHandlers()
): Promise<EventFabricProjectionWorker> {
	try {
		connection = await (amqp as any).connect(ENV.RABBITMQ_URL);
		channel = await connection.createChannel();

		await declareTopology(channel as any);
		await channel.prefetch(1);

		console.log('Event fabric projection worker started:', { queue: QUEUES.codeEvents });

		channel.consume(
			QUEUES.codeEvents,
			(msg: { content: Buffer } | null) => {
				if (!msg) return;

				void (async () => {
					try {
						const raw = JSON.parse(msg.content.toString('utf8')) as Record<string, unknown>;
						const event = parseEventFabricMessage(raw);
						await dispatchEventFabricEvent(event, handlers);
						emitEventFabricAnalyticsProjection(event);
						channel?.ack(msg);
					} catch (err) {
						console.error('Event fabric projection error:', err);
						channel?.nack(msg, false, false);
					}
				})();
			},
			{ noAck: false }
		);

		return {
			stop: async () => {
				if (channel) {
					await channel.close().catch(() => {});
					channel = null;
				}
				if (connection) {
					await connection.close().catch(() => {});
					connection = null;
				}
			},
			};
	} catch (err) {
		console.error('Failed to start event fabric projection worker:', err);
		throw err;
	}
}

export async function startCodeEvidenceProjectionWorker(): Promise<EventFabricProjectionWorker> {
	return await startEventFabricWorker();
}
