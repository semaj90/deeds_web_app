// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
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

	it('exposes the workstation status and summary batch aliases', () => {
		const pkg = JSON.parse(
			readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
		) as { scripts?: Record<string, string> };

		expect(pkg.scripts?.['atlas:workstation:status']).toBe(
			'node ../scripts/atlas/parent-atlas-workstation-status.mjs',
		);
		expect(pkg.scripts?.['atlas:workstation:summaries:100']).toContain(
			'backfill-summary-layers-from-chunks.mjs',
		);
		expect(pkg.scripts?.['atlas:workstation:summaries:100']).toContain('--apply');
		expect(pkg.scripts?.['atlas:workstation:summaries:100']).toContain('--limit=100');
		expect(pkg.scripts?.['atlas:workstation:summaries:100:dry']).toContain('--dry-run');
		expect(pkg.scripts?.['atlas:workstation:mirror-check']).toBe(
			'node ../scripts/atlas/parent-atlas-workstation-end-to-end.mjs',
		);
		expect(pkg.scripts?.['atlas:workstation:end-to-end']).toBe(
			'node ../scripts/atlas/parent-atlas-workstation-end-to-end.mjs',
		);
		expect(pkg.scripts?.['atlas:qdrant:repair']).toBe(
			'node ../scripts/atlas/qdrant-parity-repair.mjs --collection codebase_chunks_384',
		);
		expect(pkg.scripts?.['atlas:qdrant:repair:preflight']).toBe(
			'node ../scripts/atlas/qdrant-parity-repair.mjs --collection codebase_chunks_384 --preflight',
		);
		expect(pkg.scripts?.['atlas:qdrant:repair:legacy']).toBe(
			'node ../scripts/atlas/qdrant-parity-repair.mjs --collection codebase_chunks_768 --sample 25',
		);
	});
});
