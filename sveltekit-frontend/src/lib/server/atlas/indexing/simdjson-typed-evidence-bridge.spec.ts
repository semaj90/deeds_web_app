import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { isSimdJsonAvailable } from '$lib/server/gpu/simdjson-bridge.js';
import { parseNdjsonTypedEvidence, parseNdjsonTypedEvidenceStream } from './simdjson-typed-evidence-bridge.js';

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

	it('reports the parser backend actually used and aligns typed output with V8 JSON.parse', () => {
		const expected = {
			receiptId: `alignment-${randomUUID()}`,
			status: 'PASS' as const,
			durationMs: 23,
		};
		const line = `${JSON.stringify(expected)}${' '.repeat(1100)}`;
		const report = parseNdjsonTypedEvidence({
			artifactRef: 'artifact:test:napi-alignment',
			artifactRevision: 'sha256:' + 'e'.repeat(64),
			ndjson: line,
			payloadSchema: receiptSchema,
			payloadSchemaId: 'atlas.receipt.v1',
		});

		expect(report.accepted).toHaveLength(1);
		expect(report.accepted[0]!.payload).toEqual(JSON.parse(line));
		expect(report.parserExecution.nativeParses + report.parserExecution.fallbackParses).toBe(1);
		expect(report.simdjsonUsed).toBe(report.parserExecution.nativeParses > 0);
		if (isSimdJsonAvailable()) {
			expect(report.parserExecution.backend).toBe('SIMDJSON_NAPI');
			expect(report.parserExecution.nativeParses).toBe(1);
		} else {
			expect(report.parserExecution.backend).toBe('V8_JSON_PARSE');
			expect(report.parserExecution.fallbackParses).toBe(1);
		}
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

	it('incrementally streams split UTF-8 chunks with the same envelope checksums', async () => {
		const ndjson = [
			JSON.stringify({ receiptId: 'stream-1', status: 'PASS', durationMs: 7, note: '東京 🧪' }),
			JSON.stringify({ receiptId: 'stream-2', status: 'FAIL', durationMs: 9, note: 'café' }),
		].join('\n');
		const expected = parseNdjsonTypedEvidence({
			artifactRef: 'artifact:test:stream',
			artifactRevision: 'sha256:' + 'f'.repeat(64),
			ndjson,
			payloadSchema: receiptSchema.extend({ note: z.string() }),
			payloadSchemaId: 'atlas.receipt.v1',
		});
		const bytes = new TextEncoder().encode(ndjson);
		async function* splitBytes() {
			for (let offset = 0; offset < bytes.length; offset += 7) yield bytes.slice(offset, offset + 7);
		}
		const actual = [];
		for await (const row of parseNdjsonTypedEvidenceStream({
			artifactRef: 'artifact:test:stream',
			artifactRevision: 'sha256:' + 'f'.repeat(64),
			chunks: splitBytes(),
			payloadSchema: receiptSchema.extend({ note: z.string() }),
			payloadSchemaId: 'atlas.receipt.v1',
		})) actual.push(row);

		expect(actual.map((row) => row.status)).toEqual(['ACCEPTED', 'ACCEPTED']);
		expect(actual.map((row) => row.status === 'ACCEPTED' ? row.envelope.typedEvidenceChecksum : null))
			.toEqual(expected.accepted.map((row) => row.envelope.typedEvidenceChecksum));
		expect(actual.map((row) => row.recordIndex)).toEqual([0, 1]);
	});

	it('fails closed on malformed UTF-8 bytes', async () => {
		async function* invalidBytes() {
			yield new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]);
		}
		const consume = async () => {
			for await (const _row of parseNdjsonTypedEvidenceStream({
				artifactRef: 'artifact:test:invalid-utf8',
				artifactRevision: 'sha256:' + '1'.repeat(64),
				chunks: invalidBytes(),
				payloadSchema: receiptSchema,
				payloadSchemaId: 'atlas.receipt.v1',
			})) { }
		};
		await expect(consume()).rejects.toThrow('NDJSON_UTF8_DECODE_FAILED');
	});

	it('rejects a record exceeding the configured line bound', async () => {
		async function* oversizedLine() {
			yield new TextEncoder().encode('{"receiptId":"long"}');
		}
		const consume = async () => {
			for await (const _row of parseNdjsonTypedEvidenceStream({
				artifactRef: 'artifact:test:oversized',
				artifactRevision: 'sha256:' + '2'.repeat(64),
				chunks: oversizedLine(),
				payloadSchema: receiptSchema,
				payloadSchemaId: 'atlas.receipt.v1',
				maxLineBytes: 8,
			})) { }
		};
		await expect(consume()).rejects.toThrow('maxLineBytes=8');
	});
});
