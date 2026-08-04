/**
 * Debounced Parent Atlas DAG orchestration logger.
 *
 * Debounces only noncanonical, high-frequency telemetry such as progress,
 * heartbeat, queue-depth, and repeated status updates.
 *
 * It NEVER debounces:
 * - canonical DAG state mutations
 * - errors/failures
 * - approvals/rejections
 * - terminal transitions
 * - rollback events
 * - durable validation/mutation receipts
 * - OpenTelemetry span start/end
 */

export type DagLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type DagLogKind =
	| 'progress'
	| 'heartbeat'
	| 'queue_depth'
	| 'status'
	| 'state_transition'
	| 'approval'
	| 'rejection'
	| 'error'
	| 'terminal'
	| 'rollback'
	| 'receipt';

export type DagLogEvent = {
	workflowId: string;
	runId: string;
	nodeId?: string;
	kind: DagLogKind;
	level: DagLogLevel;
	message: string;
	timestamp?: string;
	attributes?: Record<string, unknown>;
};

export type EmittedDagLogEvent = DagLogEvent & {
	timestamp: string;
	debounce?: {
		coalescedCount: number;
		firstObservedAt: string;
		lastObservedAt: string;
	};
};

export type DagLogSink = {
	emit(event: EmittedDagLogEvent): void | Promise<void>;
	flush?(): void | Promise<void>;
};

export type DebouncedDagLoggerOptions = {
	debounceMs?: number;
	maxPending?: number;
	now?: () => Date;
	onOverflow?: (details: {
		key: string;
		pendingCount: number;
		maxPending: number;
	}) => void | Promise<void>;
};

type PendingEntry = {
	event: DagLogEvent;
	firstObservedAt: string;
	lastObservedAt: string;
	coalescedCount: number;
	timer: ReturnType<typeof setTimeout>;
};

const DEFAULT_DEBOUNCE_MS = 250;
const DEFAULT_MAX_PENDING = 1000;

const IMMEDIATE_KINDS = new Set<DagLogKind>([
	'state_transition',
	'approval',
	'rejection',
	'error',
	'terminal',
	'rollback',
	'receipt',
]);

function assertRequiredText(value: string, field: string): void {
	if (!value || value.trim().length === 0) {
		throw new Error(`INVALID_DAG_LOG_${field.toUpperCase()}`);
	}
}

function sanitizeAttributes(
	attributes: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!attributes) return undefined;

	// These may remain on span/log records when explicitly needed, but they must
	// not be promoted to stable OTel resource attributes by the sink.
	const blockedKeys = new Set([
		'query_text',
		'prompt',
		'source_content',
		'raw_source',
		'secret',
		'authorization',
		'cookie',
	]);

	const sanitized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(attributes)) {
		if (blockedKeys.has(key.toLowerCase())) continue;
		sanitized[key] = value;
	}
	return sanitized;
}

export class DebouncedDagLogger {
	private readonly sink: DagLogSink;
	private readonly debounceMs: number;
	private readonly maxPending: number;
	private readonly now: () => Date;
	private readonly onOverflow?: DebouncedDagLoggerOptions['onOverflow'];
	private readonly pending = new Map<string, PendingEntry>();
	private closed = false;

	constructor(sink: DagLogSink, options: DebouncedDagLoggerOptions = {}) {
		this.sink = sink;
		this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
		this.maxPending = options.maxPending ?? DEFAULT_MAX_PENDING;
		this.now = options.now ?? (() => new Date());
		this.onOverflow = options.onOverflow;

		if (!Number.isFinite(this.debounceMs) || this.debounceMs < 0) {
			throw new Error('INVALID_DAG_LOG_DEBOUNCE_MS');
		}
		if (!Number.isInteger(this.maxPending) || this.maxPending < 1) {
			throw new Error('INVALID_DAG_LOG_MAX_PENDING');
		}
	}

	get pendingCount(): number {
		return this.pending.size;
	}

	async log(event: DagLogEvent): Promise<void> {
		if (this.closed) throw new Error('DAG_LOGGER_CLOSED');

		assertRequiredText(event.workflowId, 'workflow_id');
		assertRequiredText(event.runId, 'run_id');
		assertRequiredText(event.message, 'message');

		const normalized: DagLogEvent = {
			...event,
			attributes: sanitizeAttributes(event.attributes),
		};

		if (IMMEDIATE_KINDS.has(event.kind) || this.debounceMs === 0) {
			await this.flushScope(event.workflowId, event.runId);
			await this.emitImmediate(normalized);
			return;
		}

		const key = this.keyFor(normalized);
		const observedAt = this.now().toISOString();
		const existing = this.pending.get(key);

		if (existing) {
			clearTimeout(existing.timer);
			existing.event = normalized;
			existing.lastObservedAt = observedAt;
			existing.coalescedCount += 1;
			existing.timer = this.schedule(key);
			return;
		}

		if (this.pending.size >= this.maxPending) {
			await this.onOverflow?.({
				key,
				pendingCount: this.pending.size,
				maxPending: this.maxPending,
			});
			// Preserve bounded memory. Flush the oldest pending entry rather than
			// silently dropping a new workflow/node key.
			const oldestKey = this.pending.keys().next().value as string | undefined;
			if (oldestKey) await this.flushKey(oldestKey);
		}

		this.pending.set(key, {
			event: normalized,
			firstObservedAt: observedAt,
			lastObservedAt: observedAt,
			coalescedCount: 1,
			timer: this.schedule(key),
		});
	}

	async flushKey(key: string): Promise<void> {
		const entry = this.pending.get(key);
		if (!entry) return;

		clearTimeout(entry.timer);
		this.pending.delete(key);

		await this.sink.emit({
			...entry.event,
			timestamp: entry.lastObservedAt,
			debounce: {
				coalescedCount: entry.coalescedCount,
				firstObservedAt: entry.firstObservedAt,
				lastObservedAt: entry.lastObservedAt,
			},
		});
	}

	async flushScope(workflowId: string, runId: string): Promise<void> {
		const prefix = `${workflowId}\u001f${runId}\u001f`;
		const keys = [...this.pending.keys()].filter((key) => key.startsWith(prefix));
		for (const key of keys) await this.flushKey(key);
	}

	async flushAll(): Promise<void> {
		for (const key of [...this.pending.keys()]) await this.flushKey(key);
		await this.sink.flush?.();
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		await this.flushAll();
	}

	private keyFor(event: DagLogEvent): string {
		return [
			event.workflowId,
			event.runId,
			event.nodeId ?? '',
			event.kind,
			event.level,
		].join('\u001f');
	}

	private schedule(key: string): ReturnType<typeof setTimeout> {
		const timer = setTimeout(() => {
			void this.flushKey(key).catch((error) => {
				// The sink should independently record failures. Avoid an
				// unhandled rejection from a timer callback.
				console.error('DebouncedDagLogger flush failed', error);
			});
		}, this.debounceMs);
		timer.unref?.();
		return timer;
	}

	private async emitImmediate(event: DagLogEvent): Promise<void> {
		await this.sink.emit({
			...event,
			timestamp: event.timestamp ?? this.now().toISOString(),
		});
	}
}

export function registerDagLoggerShutdown(
	logger: DebouncedDagLogger,
): () => void {
	let shuttingDown = false;

	const shutdown = () => {
		if (shuttingDown) return;
		shuttingDown = true;
		void logger.close().catch((error) => {
			console.error('Failed to flush DAG logger during shutdown', error);
		});
	};

	process.once('beforeExit', shutdown);
	process.once('SIGINT', shutdown);
	process.once('SIGTERM', shutdown);

	return () => {
		process.off('beforeExit', shutdown);
		process.off('SIGINT', shutdown);
		process.off('SIGTERM', shutdown);
	};
}
