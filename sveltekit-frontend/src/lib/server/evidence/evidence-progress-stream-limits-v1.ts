export type EvidenceProgressConnectionLimitReasonV1 = 'PROCESS_LIMIT' | 'ACTOR_LIMIT' | 'JOB_LIMIT';

export type EvidenceProgressStreamLimitsV1 = {
	maxConnectionsPerProcess: number;
	maxConnectionsPerActor: number;
	maxConnectionsPerJob: number;
	maxQueuedBytes: number;
};

const DEFAULT_LIMITS: EvidenceProgressStreamLimitsV1 = {
	maxConnectionsPerProcess: 128,
	maxConnectionsPerActor: 4,
	maxConnectionsPerJob: 2,
	maxQueuedBytes: 16 * 1024,
};

const ENV_LIMITS: Record<keyof EvidenceProgressStreamLimitsV1, { name: string; min: number; max: number }> = {
	maxConnectionsPerProcess: { name: 'EVIDENCE_SSE_MAX_CONNECTIONS_PER_PROCESS', min: 1, max: 4096 },
	maxConnectionsPerActor: { name: 'EVIDENCE_SSE_MAX_CONNECTIONS_PER_ACTOR', min: 1, max: 128 },
	maxConnectionsPerJob: { name: 'EVIDENCE_SSE_MAX_CONNECTIONS_PER_JOB', min: 1, max: 64 },
	maxQueuedBytes: { name: 'EVIDENCE_SSE_MAX_QUEUED_BYTES', min: 1024, max: 1024 * 1024 },
};

function readBoundedLimit(name: string, fallback: number, min: number, max: number): number {
	const raw = process.env[name];
	if (!raw || !/^\d+$/.test(raw)) return fallback;
	const value = Number(raw);
	return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}

export function getEvidenceProgressStreamLimitsV1(): EvidenceProgressStreamLimitsV1 {
	return Object.fromEntries(
		(Object.keys(ENV_LIMITS) as Array<keyof EvidenceProgressStreamLimitsV1>).map((key) => {
			const { name, min, max } = ENV_LIMITS[key];
			return [key, readBoundedLimit(name, DEFAULT_LIMITS[key], min, max)];
		}),
	) as unknown as EvidenceProgressStreamLimitsV1;
}

export function enqueueEvidenceProgressChunkV1(
	controller: ReadableStreamDefaultController<Uint8Array>,
	chunk: Uint8Array,
	maxQueuedBytes: number,
): boolean {
	const desiredSize = controller.desiredSize;
	if (desiredSize === null || chunk.byteLength > maxQueuedBytes || chunk.byteLength > desiredSize) return false;
	controller.enqueue(chunk);
	return true;
}

export class EvidenceProgressConnectionLimiterV1 {
	private readonly actors = new Map<string, number>();
	private readonly jobs = new Map<string, number>();
	private active = 0;

	constructor(private readonly limits: EvidenceProgressStreamLimitsV1) {}

	acquire(actorKey: string, jobKey: string):
		| { allowed: true; release: () => void }
		| { allowed: false; reason: EvidenceProgressConnectionLimitReasonV1 } {
		if (this.active >= this.limits.maxConnectionsPerProcess) return { allowed: false, reason: 'PROCESS_LIMIT' };
		if ((this.actors.get(actorKey) ?? 0) >= this.limits.maxConnectionsPerActor) {
			return { allowed: false, reason: 'ACTOR_LIMIT' };
		}
		if ((this.jobs.get(jobKey) ?? 0) >= this.limits.maxConnectionsPerJob) {
			return { allowed: false, reason: 'JOB_LIMIT' };
		}

		this.active += 1;
		this.actors.set(actorKey, (this.actors.get(actorKey) ?? 0) + 1);
		this.jobs.set(jobKey, (this.jobs.get(jobKey) ?? 0) + 1);
		let released = false;
		return {
			allowed: true,
			release: () => {
				if (released) return;
				released = true;
				this.active = Math.max(0, this.active - 1);
				this.decrement(this.actors, actorKey);
				this.decrement(this.jobs, jobKey);
			},
		};
	}

	private decrement(counts: Map<string, number>, key: string): void {
		const next = (counts.get(key) ?? 0) - 1;
		if (next <= 0) counts.delete(key);
		else counts.set(key, next);
	}
}

export const evidenceProgressStreamLimitsV1 = getEvidenceProgressStreamLimitsV1();
export const evidenceProgressConnectionLimiterV1 = new EvidenceProgressConnectionLimiterV1(
	evidenceProgressStreamLimitsV1,
);
