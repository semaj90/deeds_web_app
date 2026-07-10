// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	buildLangGraphConfig,
	getLangGraphCheckpointer,
	isLangGraphCheckpointingEnabled,
	resetLangGraphCheckpointerForTests,
} from '$lib/server/langgraph/checkpointer.js';
import {
	ensureOpenTelemetry,
	isOpenTelemetryEnabled,
	resetOpenTelemetryForTests,
	shutdownOpenTelemetry,
} from '$lib/server/observability/opentelemetry.js';

describe('parent atlas workstation wiring', () => {
	beforeEach(() => {
		resetLangGraphCheckpointerForTests();
		resetOpenTelemetryForTests();
	});

	afterEach(async () => {
		await shutdownOpenTelemetry();
		resetLangGraphCheckpointerForTests();
		resetOpenTelemetryForTests();
		delete process.env.LANGGRAPH_CHECKPOINT_ENABLED;
		delete process.env.OTEL_ENABLED;
		delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	});

	it('builds LangGraph thread-scoped configs with thread_id', () => {
		const config = buildLangGraphConfig('thread-123', 'run-456', 'supervisor');
		expect(config.configurable.thread_id).toBe('thread-123');
		expect(config.configurable.run_id).toBe('run-456');
		expect(config.configurable.checkpoint_ns).toBe('supervisor');
	});

	it('keeps LangGraph checkpointing disabled by default', async () => {
		expect(isLangGraphCheckpointingEnabled()).toBe(false);
		expect(await getLangGraphCheckpointer()).toBeNull();
	});

	it('starts OpenTelemetry when enabled', async () => {
		process.env.OTEL_ENABLED = 'true';
		expect(isOpenTelemetryEnabled()).toBe(true);

		const result = await ensureOpenTelemetry();
		expect(result.started).toBe(true);
		expect(result.sdk).toBeTruthy();
	});
});
