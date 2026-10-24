import { RedactingSpanExporterV1 } from './telemetry-redaction-v1.js';

type OpenTelemetryState = {
	sdk: any | null;
	started: boolean;
	initPromise: Promise<{ started: boolean; sdk: any | null }> | null;
};

// Shared across module instances. The Vite config and the SSR hooks each load this module, and a
// module-local state would start a second NodeSDK in the same process.
const STATE_KEY = Symbol.for('deeds-web-app.opentelemetry.state');
const globalState = globalThis as typeof globalThis & { [STATE_KEY]?: OpenTelemetryState };
const state: OpenTelemetryState = (globalState[STATE_KEY] ??= {
	sdk: null,
	started: false,
	initPromise: null,
});

function isTruthy(value: string | undefined): boolean {
	return typeof value === 'string' && /^(1|true|yes|on)$/i.test(value.trim());
}

export function isOpenTelemetryEnabled(): boolean {
	return (
		isTruthy(process.env.OTEL_ENABLED) ||
		isTruthy(process.env.OTEL_EXPORT_ENABLED) ||
		Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT) ||
		Boolean(process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) ||
		Boolean(process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT)
	);
}

/** OTLP/HTTP traces URL when configured; otherwise null (console exporter). Never defaults to a remote host. */
export function resolveOtlpTracesUrl(): string | null {
	// Explicit console mode wins over any configured endpoint.
	if (process.env.OTEL_TRACES_EXPORTER?.trim().toLowerCase() === 'console') return null;
	const explicit = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
	if (explicit) return explicit;
	const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
	return base ? `${base.replace(/\/+$/, '')}/v1/traces` : null;
}

/**
 * Resolves OTLP HTTP headers.
 * Respects OTEL_EXPORTER_OTLP_TRACES_HEADERS / OTEL_EXPORTER_OTLP_HEADERS,
 * and falls back to Langfuse Basic Auth when Langfuse credentials are configured.
 */
export function resolveOtlpHeaders(): Record<string, string> {
	const headers: Record<string, string> = {};
	const raw = process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS?.trim() || process.env.OTEL_EXPORTER_OTLP_HEADERS?.trim();
	if (raw) {
		for (const item of raw.split(',')) {
			const idx = item.indexOf('=');
			if (idx > 0) {
				const key = item.slice(0, idx).trim();
				const val = item.slice(idx + 1).trim();
				if (key) headers[key] = val;
			}
		}
	}
	if (!headers['Authorization'] && !headers['authorization']) {
		const pk = process.env.LANGFUSE_PUBLIC_KEY?.trim();
		const sk = process.env.LANGFUSE_SECRET_KEY?.trim();
		if (pk && sk) {
			const auth = Buffer.from(`${pk}:${sk}`).toString('base64');
			headers['Authorization'] = `Basic ${auth}`;
		}
	}
	return headers;
}

export async function ensureOpenTelemetry(): Promise<{ started: boolean; sdk: any | null }> {
	if (state.started) {
		return { started: true, sdk: state.sdk };
	}

	if (!isOpenTelemetryEnabled()) {
		return { started: false, sdk: null };
	}

	if (!state.initPromise) {
		state.initPromise = (async () => {
			try {
				const [{ NodeSDK }, { getNodeAutoInstrumentations }, traceBase, metrics] = await Promise.all([
					import('@opentelemetry/sdk-node'),
					import('@opentelemetry/auto-instrumentations-node'),
					import('@opentelemetry/sdk-trace-base'),
					import('@opentelemetry/sdk-metrics'),
				]);

				const otlpTracesUrl = resolveOtlpTracesUrl();
				const otlpHeaders = resolveOtlpHeaders();
				const innerTraceExporter = otlpTracesUrl
					? new (await import('@opentelemetry/exporter-trace-otlp-http')).OTLPTraceExporter({
							url: otlpTracesUrl,
							headers: Object.keys(otlpHeaders).length > 0 ? otlpHeaders : undefined,
					  })
					: new traceBase.ConsoleSpanExporter();
				// OBS-06: only allowlisted attributes leave the process (see telemetry-redaction-v1.ts).
				const traceExporter = new RedactingSpanExporterV1(innerTraceExporter as any);
				const metricReader = new metrics.PeriodicExportingMetricReader({
					exporter: new metrics.ConsoleMetricExporter(),
					exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS ?? 60_000),
				});

				const sdk = new NodeSDK({
					serviceName: process.env.OTEL_SERVICE_NAME ?? 'deeds-web-app',
					traceExporter,
					metricReader,
					instrumentations: [getNodeAutoInstrumentations()],
				} as any);

				await sdk.start();
				state.sdk = sdk;
				state.started = true;
				console.log(`[OpenTelemetry] SDK started for ${process.env.OTEL_SERVICE_NAME ?? 'deeds-web-app'} (${process.env.PUBLIC_API_URL ?? 'unset'}) traces=${otlpTracesUrl ?? 'console'}`);
				return { started: true, sdk };
			} catch (err) {
				console.warn('[OpenTelemetry] SDK init failed (non-fatal):', err instanceof Error ? err.message : String(err));
				state.sdk = null;
				state.started = false;
				return { started: false, sdk: null };
			}
		})();
	}

	return state.initPromise;
}

export async function shutdownOpenTelemetry(): Promise<void> {
	if (!state.sdk) return;
	try {
		await state.sdk.shutdown?.();
	} catch (err) {
		console.warn('[OpenTelemetry] SDK shutdown failed (non-fatal):', err instanceof Error ? err.message : String(err));
	} finally {
		state.sdk = null;
		state.started = false;
		state.initPromise = null;
	}
}

export function resetOpenTelemetryForTests(): void {
	Object.assign(state, { sdk: null, started: false, initPromise: null });
}
