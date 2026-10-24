// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RedactingSpanExporterV1, redactAttributesV1, redactSpanForExportV1 } from './telemetry-redaction-v1.js';
import { diagnosticChainReceiptChecksumV1, mapDiagnosticChainReceiptV1, toSpanAttributesV1 } from './offline-receipt-telemetry-v1.js';

class FakeSpan {
	name = 'POST';
	attributes: Record<string, unknown> = {};
	events: unknown[] = [];
	constructor(attributes: Record<string, unknown>, events: unknown[] = []) {
		this.attributes = attributes;
		this.events = events;
	}
	get ended(): boolean {
		return true;
	}
}

describe('OBS-06 attribute allowlist', () => {
	it('keeps route, method and status metadata', () => {
		expect(redactAttributesV1({ 'http.route': '/api/atlas/mastra-agent', 'http.response.status_code': 409, 'http.request.method': 'POST' })).toEqual({
			'http.route': '/api/atlas/mastra-agent',
			'http.response.status_code': 409,
			'http.request.method': 'POST',
		});
	});

	it('preserves only the explicit Mastra refusal outcome fields', () => {
		const attrs = {
			'parent_atlas.request_id': '123e4567-e89b-12d3-a456-426614174000',
			'parent_atlas.service_health': 'AVAILABLE',
			'parent_atlas.agent_execution_status': 'NOT_STARTED',
			'parent_atlas.evidence_validity': 'NOT_ADMITTED',
			'parent_atlas.canonical_admission': 'NOT_ADMITTED',
			'parent_atlas.first_failing_boundary': 'WORKSPACE_AUTHORITY',
			'parent_atlas.refusal_code': 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE',
			'parent_atlas.writes_performed': false,
			'parent_atlas.prompt': 'must not leave the process',
		};
		expect(redactAttributesV1(attrs)).toEqual({
			'parent_atlas.request_id': '123e4567-e89b-12d3-a456-426614174000',
			'parent_atlas.service_health': 'AVAILABLE',
			'parent_atlas.agent_execution_status': 'NOT_STARTED',
			'parent_atlas.evidence_validity': 'NOT_ADMITTED',
			'parent_atlas.canonical_admission': 'NOT_ADMITTED',
			'parent_atlas.first_failing_boundary': 'WORKSPACE_AUTHORITY',
			'parent_atlas.refusal_code': 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE',
			'parent_atlas.writes_performed': false,
		});
	});

	it('reduces URL attributes to a path and never keeps the query string or credentials', () => {
		const out = redactAttributesV1({ 'http.url': 'http://user:pw@127.0.0.1:5173/api/x?token=secret#frag', 'http.target': '/api/atlas/mastra-agent?probe=1' });
		expect(out).toEqual({ 'url.path': '/api/atlas/mastra-agent' });
		expect(JSON.stringify(out)).not.toMatch(/token|secret|pw|probe|frag/);
	});

	it('drops credentials, query strings, prompts, source text and packet payloads', () => {
		const out = redactAttributesV1({
			'url.query': 'token=secret',
			'http.request.header.authorization': 'Basic abc',
			'db.statement': 'SELECT * FROM atlas_packets',
			prompt: 'user text',
			source_text: 'export const x = 1',
			packet_payload: { vector: [0.1, 0.2] },
			'user_agent.original': 'Mozilla',
		});
		expect(out).toEqual({});
	});

	it('bounds string values and refuses non-finite numbers and structured values', () => {
		const out = redactAttributesV1({ 'http.route': 'x'.repeat(500), 'http.response.status_code': Number.NaN, 'error.type': { nested: true } as any });
		expect((out['http.route'] as string).length).toBe(128);
		expect('http.response.status_code' in out).toBe(false);
		expect('error.type' in out).toBe(false);
	});

	it('removes span events, which can carry exception messages', () => {
		const span = new FakeSpan({ 'http.route': '/r' }, [{ name: 'exception', attributes: { 'exception.message': 'secret detail' } }]);
		const clone = redactSpanForExportV1(span);
		expect(clone.events).toEqual([]);
		expect(clone.attributes).toEqual({ 'http.route': '/r' });
		expect(span.events.length).toBe(1);
		expect(span.attributes).toEqual({ 'http.route': '/r' });
	});

	it('exporter decorator passes redacted spans to the inner exporter and never mutates originals', async () => {
		const seen: any[] = [];
		const inner = {
			export(spans: any[], cb: (r: { code: number }) => void) {
				seen.push(...spans);
				cb({ code: 0 });
			},
			shutdown: async () => {},
		};
		const exporter = new RedactingSpanExporterV1(inner);
		const original = new FakeSpan({ 'http.route': '/r', 'http.url': 'http://x?token=1' }, [{ name: 'e' }]);
		await new Promise<void>((resolve) => exporter.export([original], () => resolve()));
		expect(seen).toHaveLength(1);
		expect(seen[0].attributes).toEqual({ 'http.route': '/r', 'url.path': '/' });
		expect(JSON.stringify(seen[0].attributes)).not.toContain('token');
		expect(seen[0].events).toEqual([]);
		expect(original.attributes).toHaveProperty('http.url');
	});
});

describe('OBS-07 receipt verdict attributes', () => {
	it('exposes the four verdicts and the first failing boundary as allowlisted atlas.* keys', () => {
		const receiptBody = {
			schema: 'atlas.omr-msgpack-e2e-receipt.v1',
			overallAuthority: 'DIAGNOSTIC_ONLY_NOT_ADMITTED',
			firstFailingBoundary: null,
			stages: {
				C_DUCKDB_REDUCE: { verdict: 'DIAGNOSTIC_REDUCE_VERIFIED', checks: { SNAPSHOT_MATCH: true } },
				D_MSGPACK: { verdict: 'MSGPACK_ROUNDTRIP_VERIFIED', checks: { PAYLOAD_READBACK: true } },
				E_CHAIN: { verdict: 'DIAGNOSTIC_CHAIN_VERIFIED', checks: { RECEIPT_LINKED: true } },
			},
			links: {
				snapshot: { digest: `sha256:${'d'.repeat(64)}` },
				reduce: { outputDigest: `sha256:${'c'.repeat(64)}` },
				messagepack: {
					descriptorFile: '.tmp/descriptor.msgpack',
					descriptorDigest: `sha256:${'e'.repeat(64)}`,
					envelopePayloadBytesDigest: `sha256:${'f'.repeat(64)}`,
					descriptorByteLength: 1367,
				},
			},
			canonicalAuthority: false,
			writesPerformed: false,
			canonicalWrites: 'DISABLED',
		};
		const mapped = mapDiagnosticChainReceiptV1({
			...receiptBody,
			checksumSha256: diagnosticChainReceiptChecksumV1(receiptBody),
		});
		const attrs = toSpanAttributesV1(mapped);
		expect(attrs).toMatchObject({
			'atlas.workflow': 'postgres-msgpack-diagnostic',
			'atlas.service_health': 'NOT_MEASURED',
			'atlas.execution_status': 'SUCCEEDED',
			'atlas.evidence_validity': 'DIGEST_VERIFIED',
			'atlas.canonical_admission': 'NOT_ADMITTED',
		});
		expect(Object.keys(attrs).every((k) => k.startsWith('atlas.'))).toBe(true);
		expect(Object.keys(attrs)).not.toContain('atlas.agent_run_id');
		// Nulls are not exported (redaction keeps only string, finite number and boolean values).
		expect(redactAttributesV1(attrs)).toEqual(Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== null)));
	});
});
