// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	ensureOpenTelemetry,
	isOpenTelemetryEnabled,
	resetOpenTelemetryForTests,
	resolveOtlpHeaders,
	resolveOtlpTracesUrl,
} from './opentelemetry.js';

const KEYS = [
	'OTEL_ENABLED',
	'OTEL_EXPORT_ENABLED',
	'OTEL_EXPORTER_OTLP_ENDPOINT',
	'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
	'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT',
	'OTEL_EXPORTER_OTLP_HEADERS',
	'OTEL_EXPORTER_OTLP_TRACES_HEADERS',
	'OTEL_TRACES_EXPORTER',
	'LANGFUSE_PUBLIC_KEY',
	'LANGFUSE_SECRET_KEY',
];

beforeEach(() => {
	for (const key of KEYS) delete process.env[key];
	resetOpenTelemetryForTests();
});

afterEach(() => {
	for (const key of KEYS) delete process.env[key];
	resetOpenTelemetryForTests();
});

describe('OpenTelemetry startup configuration', () => {
	it('stays disabled by default: no telemetry environment means no SDK and no exporter', async () => {
		expect(isOpenTelemetryEnabled()).toBe(false);
		expect(resolveOtlpTracesUrl()).toBeNull();
		await expect(ensureOpenTelemetry()).resolves.toEqual({ started: false, sdk: null });
	});

	it('uses an explicit traces endpoint unchanged', () => {
		process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://127.0.0.1:3030/api/public/otel/v1/traces';
		expect(resolveOtlpTracesUrl()).toBe('http://127.0.0.1:3030/api/public/otel/v1/traces');
	});

	it('resolves a base endpoint to /v1/traces and drops trailing slashes', () => {
		process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:4318/';
		expect(resolveOtlpTracesUrl()).toBe('http://127.0.0.1:4318/v1/traces');
	});

	it('prefers the explicit traces endpoint over the base endpoint', () => {
		process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:4318';
		process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://127.0.0.1:3030/api/public/otel/v1/traces';
		expect(resolveOtlpTracesUrl()).toBe('http://127.0.0.1:3030/api/public/otel/v1/traces');
	});

	it('explicit console mode overrides a configured endpoint', () => {
		process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:4318';
		process.env.OTEL_TRACES_EXPORTER = 'console';
		expect(resolveOtlpTracesUrl()).toBeNull();
	});

	it('never defaults to a remote host when only the enable flag is set', () => {
		process.env.OTEL_ENABLED = 'true';
		expect(isOpenTelemetryEnabled()).toBe(true);
		expect(resolveOtlpTracesUrl()).toBeNull();
	});

	it('an unreachable configured endpoint does not prevent SDK initialization', async () => {
		process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT = 'http://127.0.0.1:1/unreachable';
		const result = await ensureOpenTelemetry();
		expect(result.started).toBe(true);
		expect(result.sdk).not.toBeNull();
	});

	it('returns empty headers when no headers or Langfuse credentials are set', () => {
		expect(resolveOtlpHeaders()).toEqual({});
	});

	it('resolves Langfuse Basic Auth header when public and secret keys are provided', () => {
		process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
		process.env.LANGFUSE_SECRET_KEY = 'sk-test';
		const expectedAuth = `Basic ${Buffer.from('pk-test:sk-test').toString('base64')}`;
		expect(resolveOtlpHeaders()).toEqual({ Authorization: expectedAuth });
	});

	it('prefers explicit OTEL_EXPORTER_OTLP_HEADERS over default Langfuse auth if authorization header is provided', () => {
		process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
		process.env.LANGFUSE_SECRET_KEY = 'sk-test';
		process.env.OTEL_EXPORTER_OTLP_HEADERS = 'Authorization=Bearer custom-token,X-Custom=123';
		expect(resolveOtlpHeaders()).toEqual({
			Authorization: 'Bearer custom-token',
			'X-Custom': '123',
		});
	});
});
