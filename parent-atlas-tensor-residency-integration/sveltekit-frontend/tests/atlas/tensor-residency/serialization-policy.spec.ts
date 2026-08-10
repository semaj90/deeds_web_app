import { describe, expect, it } from 'vitest';
import { assertNoTextTensorEncoding, chooseSerialization } from '../../../src/lib/server/atlas/tensors/serialization-policy';

describe('serialization policy', () => {
  it('routes bulk numeric to Arrow IPC', () => expect(chooseSerialization({ purpose: 'bulk_numeric' }).kind).toBe('ARROW_IPC'));
  it('rejects giant base64 tensors', () => expect(() => assertNoTextTensorEncoding('BASE64', 1_000_000)).toThrow());
});
