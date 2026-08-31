import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseNdjsonTypedEvidence } from './simdjson-typed-evidence-bridge.js';

const receiptSchema = z
	.object({
		receiptId: z.string().min(1),
		status: z.enum(['PASS', 'FAIL']),
		durationMs: z.number().finite().nonnegative(),
	})
	.strict();

describe('parseNdjsonTypedEvidence', () => {
	it('accepts valid NDJSON lines and produces checksum-sealed envelopes', () => {
		const ndjson = [
			JSON.stringify({ receiptId: 'r1', status: 'PASS', durationMs: 12 }),
			JSON.stringify({ receiptId: 'r2', status: 'FAIL', durationMs: 340 }),
		].join('\n');

		const report = parseNdjsonTypedEvidence({
			artifactRef: 'artifact:test:1',
			artifactRevision: 'sha256:' + 'a'.repeat(64),
			ndjson,
			payloadSchema: receiptSchema,
			payloadSchemaId: 'atlas.receipt.v1',
		});

		expect(report.totalLines).toBe(2);
		expect(report.accepted).toHaveLength(2);
		expect(report.rejected).toHaveLength(0);
		expect(report.accepted[0]!.payload.receiptId).toBe('r1');
		expect(report.accepted[0]!.envelope.canonicalAuthority).toBe(false);
		expect(report.accepted[0]!.envelope.recordIndex).toBe(0);
		expect(report.accepted[0]!.envelope.sourceRef).toBe('artifact:test:1');
		expect(report.accepted[0]!.envelope.sourceRevision).toBe('sha256:' + 'a'.repeat(64));
		expect(report.accepted[0]!.envelope.rawInputChecksum).toMatch(/^[a-f0-9]{64}$/);
		expect(report.accepted[0]!.envelope.typedEvidenceChecksum).toBe(report.accepted[0]!.envelope.payloadChecksum);
		expect(report.accepted[0]!.envelope.parserRevision).toBe('simdjson-parser-bridge:v1');
		expect(report.accepted[0]!.envelope.envelopeId).not.toBe(report.accepted[1]!.envelope.envelopeId);
	});

	it('is deterministic: same NDJSON produces the same envelope checksums on repeated runs', () => {
		const ndjson = JSON.stringify({ receiptId: 'r1', status: 'PASS', durationMs: 5 });
		const args = {
			artifactRef: 'artifact:test:2',
			artifactRevision: 'sha256:' + 'b'.repeat(64),
			ndjson,
			payloadSchema: receiptSchema,
			payloadSchemaId: 'atlas.receipt.v1',
		};
		const a = parseNdjsonTypedEvidence(args);
		const b = parseNdjsonTypedEvidence(args);
		expect(a.accepted[0]!.envelope.envelopeId).toBe(b.accepted[0]!.envelope.envelopeId);
		expect(a.accepted[0]!.envelope.payloadChecksum).toBe(b.accepted[0]!.envelope.payloadChecksum);
	});

	it('rejects a line failing the typed schema without throwing or stopping the stream', () => {
		const ndjson = [
			JSON.stringify({ receiptId: 'r1', status: 'PASS', durationMs: 5 }),
			JSON.stringify({ receiptId: 'r2', status: 'MAYBE', durationMs: 5 }),
			JSON.stringify({ receiptId: 'r3', status: 'PASS', durationMs: 5 }),
		].join('\n');

		const report = parseNdjsonTypedEvidence({
			artifactRef: 'artifact:test:3',
			artifactRevision: 'sha256:' + 'c'.repeat(64),
			ndjson,
			payloadSchema: receiptSchema,
			payloadSchemaId: 'atlas.receipt.v1',
		});

		expect(report.totalLines).toBe(3);
		expect(report.accepted).toHaveLength(2);
		expect(report.rejected).toHaveLength(1);
		expect(report.rejected[0]!.recordIndex).toBe(1);
		expect(report.rejected[0]!.code).toBe('SCHEMA_REJECTED');
		expect(report.rejected[0]!.reason).toContain('status');
	});

	it('rejects a malformed JSON line without throwing', () => {
		const ndjson = [
			JSON.stringify({ receiptId: 'r1', status: 'PASS', durationMs: 5 }),
			'{not valid json',
		].join('\n');

		const report = parseNdjsonTypedEvidence({
			artifactRef: 'artifact:test:4',
			artifactRevision: 'sha256:' + 'd'.repeat(64),
			ndjson,
			payloadSchema: receiptSchema,
			payloadSchemaId: 'atlas.receipt.v1',
		});

		expect(report.accepted).toHaveLength(1);
		expect(report.rejected).toHaveLength(1);
		expect(report.rejected[0]!.code).toBe('JSON_PARSE_FAILED');
		expect(report.rejected[0]!.reason).toContain('SIMDJSON_TYPED_EVIDENCE_PARSE_FAILED');
	});
});
