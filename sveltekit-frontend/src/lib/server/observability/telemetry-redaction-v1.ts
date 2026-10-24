/**
 * OBS-06: privacy allowlist for trace export.
 *
 * Wraps the trace exporter so that only allowlisted span attributes leave the process. Span events are dropped, because
 * they can carry exception messages, and any attribute not on the allowlist is removed. Values are bounded: strings are
 * truncated, and nothing structured (objects, arrays) is exported.
 *
 * Never allowlist prompts, source text, raw packet payloads, credentials, or query strings. Add a key here only with a
 * reason recorded in the OpenTelemetry owner document.
 */

export const ALLOWED_SPAN_ATTRIBUTE_KEYS_V1: ReadonlySet<string> = new Set([
	// HTTP route metadata (route template, not the concrete URL with query string)
	'http.route',
	'http.request.method',
	'http.method',
	'http.response.status_code',
	'http.status_code',
	'error.type',
	// Receipt verdicts (OBS-07): metadata only, never admission authority
	'atlas.workflow',
	'atlas.service_health',
	'atlas.execution_status',
	'atlas.evidence_validity',
	'atlas.canonical_admission',
	'atlas.receipt_digest',
	'atlas.first_failing_boundary',
	'parent_atlas.request_id',
	'parent_atlas.service_health',
	'parent_atlas.agent_execution_status',
	'parent_atlas.evidence_validity',
	'parent_atlas.canonical_admission',
	'parent_atlas.first_failing_boundary',
	'parent_atlas.refusal_code',
	'parent_atlas.writes_performed',
]);

const MAX_STRING_LENGTH = 128;

/** URL-valued attributes are reduced to their path: no origin, query string, fragment, or credentials. */
const PATH_ONLY_KEYS: ReadonlySet<string> = new Set(['http.target', 'url.path', 'http.url', 'url.full']);

function pathOnly(value: string): string | undefined {
	try {
		return new URL(value, 'http://localhost').pathname.slice(0, MAX_STRING_LENGTH);
	} catch {
		return undefined;
	}
}

export function redactAttributesV1(attributes: Record<string, unknown> | undefined | null): Record<string, string | number | boolean> {
	const out: Record<string, string | number | boolean> = {};
	if (!attributes) return out;
	for (const [key, value] of Object.entries(attributes)) {
		if (PATH_ONLY_KEYS.has(key)) {
			if (typeof value === 'string') {
				const path = pathOnly(value);
				if (path) out['url.path'] = path;
			}
			continue;
		}
		if (!ALLOWED_SPAN_ATTRIBUTE_KEYS_V1.has(key)) continue;
		if (typeof value === 'string') out[key] = value.slice(0, MAX_STRING_LENGTH);
		else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
		else if (typeof value === 'boolean') out[key] = value;
	}
	return out;
}

/** Copy a span for export with redacted attributes and no events. The original span is not mutated. */
export function redactSpanForExportV1<T extends { attributes?: unknown; events?: unknown }>(span: T): T {
	const clone = Object.assign(Object.create(Object.getPrototypeOf(span)), span) as T;
	(clone as { attributes: unknown }).attributes = redactAttributesV1(span.attributes as Record<string, unknown>);
	(clone as { events: unknown }).events = [];
	return clone;
}

type ExportCallback = (result: { code: number; error?: Error }) => void;

/** Span exporter decorator. Delegates to the inner exporter with redacted span copies. */
export class RedactingSpanExporterV1 {
	constructor(private readonly inner: {
		export(spans: any[], resultCallback: ExportCallback): void;
		shutdown(): Promise<void>;
		forceFlush?: () => Promise<void>;
	}) {}

	export(spans: any[], resultCallback: ExportCallback): void {
		this.inner.export(spans.map((span) => redactSpanForExportV1(span)), resultCallback);
	}

	shutdown(): Promise<void> {
		return this.inner.shutdown();
	}

	forceFlush(): Promise<void> {
		return this.inner.forceFlush ? this.inner.forceFlush() : Promise.resolve();
	}
}
