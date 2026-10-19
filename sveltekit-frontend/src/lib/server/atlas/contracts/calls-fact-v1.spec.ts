import { describe, it, expect } from 'vitest';
import {
  CALLS_FACT_SCHEMA_V1,
  CallsFactV1Schema,
  computeCallsFactEvidenceDigest,
  mintSymbolVersionId,
  extractCallsFactsFromSource,
  type CallsFactV1,
} from './calls-fact-v1.js';

describe('CallsFactV1 Contract & Extractor (Phase 2 CALLS)', () => {
  const sourceRef = 'src/lib/demo-service.ts';
  const sourceRevision = 'rev_20261018_deadbeef';

  it('validates conformant CallsFactV1 schema records', () => {
    const validExact: CallsFactV1 = {
      schema: CALLS_FACT_SCHEMA_V1,
      callerSymbolVersionId: 'sym:caller_123',
      calleeSymbolVersionId: 'sym:callee_456',
      calleeExpression: 'computeScore',
      sourceRef,
      sourceRevision,
      startByte: 120,
      endByte: 132,
      resolution: 'EXACT',
      evidenceDigest: computeCallsFactEvidenceDigest({
        sourceRef,
        calleeExpression: 'computeScore',
        startByte: 120,
        endByte: 132,
        sourceRevision,
      }),
    };

    expect(() => CallsFactV1Schema.parse(validExact)).not.toThrow();

    const validUnresolved: CallsFactV1 = {
      ...validExact,
      calleeSymbolVersionId: null,
      calleeExpression: 'externalApiCall',
      resolution: 'UNRESOLVED',
      evidenceDigest: computeCallsFactEvidenceDigest({
        sourceRef,
        calleeExpression: 'externalApiCall',
        startByte: 120,
        endByte: 132,
        sourceRevision,
      }),
    };
    expect(() => CallsFactV1Schema.parse(validUnresolved)).not.toThrow();
  });

  it('rejects invalid facts: endByte <= startByte or EXACT with null callee', () => {
    const invertedBytes = {
      schema: CALLS_FACT_SCHEMA_V1,
      callerSymbolVersionId: 'sym:c1',
      calleeSymbolVersionId: 'sym:c2',
      calleeExpression: 'foo',
      sourceRef,
      sourceRevision,
      startByte: 100,
      endByte: 50, // invalid
      resolution: 'EXACT' as const,
      evidenceDigest: 'a'.repeat(64),
    };
    expect(() => CallsFactV1Schema.parse(invertedBytes)).toThrow(/endByte must be strictly greater/);

    const exactWithoutCallee = {
      ...invertedBytes,
      endByte: 150,
      calleeSymbolVersionId: null, // invalid for EXACT
    };
    expect(() => CallsFactV1Schema.parse(exactWithoutCallee)).toThrow(/EXACT resolution requires/);
  });

  it('extracts direct calls, class methods, arrow callers, and dynamic calls', () => {
    const code = `
function helper() {
  return 42;
}

const runTask = async () => {
  const result = helper();
  const dynamic = handlers[action]();
  const ext = externalFetch();
  return result;
};

class Service {
  process() {
    return this.validate();
  }
  validate() {
    return true;
  }
}
    `.trim();

    const facts = extractCallsFactsFromSource(code, sourceRef, sourceRevision);

    // Verify all emitted facts conform to schema
    for (const fact of facts) {
      expect(() => CallsFactV1Schema.parse(fact)).not.toThrow();
      expect(fact.sourceRef).toBe(sourceRef);
      expect(fact.sourceRevision).toBe(sourceRevision);
      expect(fact.evidenceDigest).toMatch(/^[a-f0-9]{64}$/);
    }

    // 1. Direct local call: helper() inside runTask() -> EXACT
    const helperCall = facts.find(f => f.calleeExpression === 'helper');
    expect(helperCall).toBeDefined();
    expect(helperCall?.resolution).toBe('EXACT');
    expect(helperCall?.calleeSymbolVersionId).toMatch(/^sym:[a-f0-9]{32}$/);

    // 2. Dynamic computed call: handlers[action]() -> DYNAMIC
    const dynamicCall = facts.find(f => f.calleeExpression.includes('[action]'));
    expect(dynamicCall).toBeDefined();
    expect(dynamicCall?.resolution).toBe('DYNAMIC');
    expect(dynamicCall?.calleeSymbolVersionId).toBeNull();

    // 3. Unresolved call: externalFetch() -> UNRESOLVED
    const externalCall = facts.find(f => f.calleeExpression === 'externalFetch');
    expect(externalCall).toBeDefined();
    expect(externalCall?.resolution).toBe('UNRESOLVED');
    expect(externalCall?.calleeSymbolVersionId).toBeNull();

    // 4. Class method call: this.validate() -> EXACT
    const methodCall = facts.find(f => f.calleeExpression === 'this.validate');
    expect(methodCall).toBeDefined();
    expect(methodCall?.resolution).toBe('EXACT');
    expect(methodCall?.calleeSymbolVersionId).toMatch(/^sym:[a-f0-9]{32}$/);
  });
});
