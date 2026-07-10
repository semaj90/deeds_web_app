import { ENV } from '$lib/server/env.server.js';

type OpenTelemetryState = {
	sdk: any | null;
	started: boolean;
	initPromise: Promise<{ started: boolean; sdk: any | null }> | null;
};

let state: OpenTelemetryState = {
	sdk: null,
	started: false,
	initPromise: null,
};

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

				const traceExporter = new traceBase.ConsoleSpanExporter();
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
				console.log(`[OpenTelemetry] SDK started for ${process.env.OTEL_SERVICE_NAME ?? 'deeds-web-app'} (${ENV.PUBLIC_API_URL})`);
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
	state = {
		sdk: null,
		started: false,
		initPromise: null,
	};
}
