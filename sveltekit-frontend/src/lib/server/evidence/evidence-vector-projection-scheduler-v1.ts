import { db } from '$lib/server/db/client.js';
import { VECTOR_CONFIG } from '$lib/server/config/vector-config.js';
import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import {
	projectEvidenceVectorOutboxBatchV1,
	type EvidenceProjectionQdrantV1,
} from './evidence-vector-projection-worker-v1.js';
import { EVIDENCE_VECTOR_PROJECTION_LANE_V1 } from './evidence-vector-persistence-v1.js';

const PROJECTION_INTERVAL_MS = 15_000;

export function isEvidenceVectorProjectionEnabled(env: Record<string, string | undefined>): boolean {
	return env.QDRANT_ENABLED === 'true' && env.EVIDENCE_VECTOR_PROJECTION_WORKER_ENABLED === 'true';
}

export function createEvidenceVectorProjectionSchedulerV1(options: {
	enabled: boolean;
	intervalMs?: number;
	runBatch: () => Promise<unknown>;
	logError?: (error: unknown) => void;
}) {
	let timer: ReturnType<typeof setInterval> | null = null;
	let inFlight: Promise<void> | null = null;

	const tick = async () => {
		if (!options.enabled || inFlight) return;
		const batch: Promise<void> = Promise.resolve()
			.then(async () => {
				await options.runBatch();
			})
			.catch((error) => {
				(options.logError ?? console.error)('[EvidenceProjection] batch failed:', error);
			})
			.finally(() => {
				if (inFlight === batch) inFlight = null;
			});
		inFlight = batch;
		await batch;
	};

	return {
		start() {
			if (!options.enabled || timer) return false;
			timer = setInterval(() => void tick(), options.intervalMs ?? PROJECTION_INTERVAL_MS);
			timer.unref?.();
			void tick();
			return true;
		},
		async stop() {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
			await inFlight;
		},
		getStatus() {
			return {
				enabled: options.enabled,
				started: timer !== null,
				inFlight: inFlight !== null,
			};
		},
	};
}

const scheduler = createEvidenceVectorProjectionSchedulerV1({
	enabled: isEvidenceVectorProjectionEnabled(process.env),
	runBatch: async () => {
		const client = getQdrantClient();
		const collectionName = VECTOR_CONFIG.COLLECTIONS.evidence;
		const { collections } = await client.getCollections();
		if (!collections.some((collection) => collection.name === collectionName)) {
			console.warn(`[EvidenceProjection] collection ${collectionName} is absent; outbox remains untouched`);
			return;
		}
		const result = await projectEvidenceVectorOutboxBatchV1(
			db,
			client as unknown as EvidenceProjectionQdrantV1,
			{
				limit: 16,
				resolveCollectionAlias: async (lane) => {
					if (lane !== EVIDENCE_VECTOR_PROJECTION_LANE_V1) {
						throw new Error('EVIDENCE_VECTOR_PROJECTION_LANE_UNSUPPORTED');
					}
					return collectionName;
				},
			},
		);
		if (result.claimed > 0) console.info('[EvidenceProjection] batch', result);
	},
});

export function startEvidenceVectorProjectionSchedulerV1(): boolean {
	return scheduler.start();
}

export function getEvidenceVectorProjectionSchedulerStatusV1() {
	return scheduler.getStatus();
}

export async function stopEvidenceVectorProjectionSchedulerV1(): Promise<void> {
	await scheduler.stop();
}
