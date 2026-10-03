import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createEvidenceTupleFromRawSpanV1, createEvidenceTupleV1, EvidenceTupleV1Schema } from './evidence-tuple-v1.js';

const base = {
  schema: 'atlas.evidence-tuple.v1' as const,
  subject: 'hydrate_candidates',
  predicate: 'sql_binding_failed',
  object: 'ANY() received an invalid parameter shape',
  session_id: '188b',
  source_path: 'docs/reports/npm-dev-session-188b.log',
  byte_start: 1234567,
  byte_end: 1234920,
  raw_sha256: `sha256:${'a'.repeat(64)}`,
  severity: 'error',
};

describe('EvidenceTupleV1', () => {
  it('creates a deterministic content-addressed envelope', () => {
    const first = createEvidenceTupleV1(base);
    const second = createEvidenceTupleV1({ ...base });
    expect(first).toEqual(second);
    expect(first.event_id).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(EvidenceTupleV1Schema.safeParse(first).success).toBe(true);
  });

  it('changes event identity when any evidence pointer or claim field changes', () => {
    const original = createEvidenceTupleV1(base);
    expect(createEvidenceTupleV1({ ...base, byte_start: base.byte_start + 1 }).event_id).not.toBe(original.event_id);
    expect(createEvidenceTupleV1({ ...base, raw_sha256: `sha256:${'b'.repeat(64)}` }).event_id).not.toBe(original.event_id);
    expect(createEvidenceTupleV1({ ...base, object: 'different claim' }).event_id).not.toBe(original.event_id);
  });

  it('rejects invalid spans, malformed hashes, unknown fields, and tampered event ids', () => {
    expect(() => createEvidenceTupleV1({ ...base, byte_end: base.byte_start })).toThrow();
    expect(() => createEvidenceTupleV1({ ...base, raw_sha256: 'sha256:short' })).toThrow();
    const tuple = createEvidenceTupleV1(base);
    expect(EvidenceTupleV1Schema.safeParse({ ...tuple, event_id: `sha256:${'f'.repeat(64)}` }).success).toBe(false);
    expect(EvidenceTupleV1Schema.safeParse({ ...tuple, kv_cache: 'forbidden' }).success).toBe(false);
  });

  it('hashes exact UTF-8 byte spans and rejects out-of-range or split-codepoint spans', () => {
    const sourceBytes = Buffer.from('header\nα claim X\ntrailer', 'utf8');
    const spanBytes = Buffer.from('α claim X', 'utf8');
    const byteStart = sourceBytes.indexOf(spanBytes);
    const tuple = createEvidenceTupleFromRawSpanV1({
      sourceBytes,
      sourcePath: 'logs/session.log',
      byteStart,
      byteEnd: byteStart + spanBytes.byteLength,
      sessionId: 'session-1',
      subject: 'symbol:X',
      predicate: 'REPORTED',
      object: 'claim X',
      severity: 'info',
    });
    expect(tuple.byte_start).toBe(byteStart);
    expect(tuple.byte_end - tuple.byte_start).toBe(spanBytes.byteLength);
    expect(tuple.raw_sha256).toBe(`sha256:${createHash('sha256').update(spanBytes).digest('hex')}`);
    expect(() => createEvidenceTupleFromRawSpanV1({
      sourceBytes, sourcePath: 'logs/session.log', byteStart: sourceBytes.byteLength,
      byteEnd: sourceBytes.byteLength + 1, sessionId: 'session-1', subject: 's', predicate: 'p', object: 'o', severity: 'info',
    })).toThrow('EVIDENCE_TUPLE_BYTE_SPAN_INVALID');
    expect(() => createEvidenceTupleFromRawSpanV1({
      sourceBytes, sourcePath: 'logs/session.log', byteStart: byteStart + 1,
      byteEnd: byteStart + spanBytes.byteLength, sessionId: 'session-1', subject: 's', predicate: 'p', object: 'o', severity: 'info',
    })).toThrow('EVIDENCE_TUPLE_SPAN_NOT_UTF8');
  });
});
