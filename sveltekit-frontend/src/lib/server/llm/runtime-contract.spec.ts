import { describe, expect, it } from 'vitest';
import { normalizeLlamaServerBaseUrlV1 } from './runtime-contract.js';

describe('normalizeLlamaServerBaseUrlV1', () => {
  it.each([
    ['http://127.0.0.1:8090', 'http://127.0.0.1:8090'],
    ['http://127.0.0.1:8090/', 'http://127.0.0.1:8090'],
    ['http://127.0.0.1:8090/v1', 'http://127.0.0.1:8090'],
    ['http://127.0.0.1:8090/v1/', 'http://127.0.0.1:8090'],
  ])('normalizes %s to the shared /v1 API base %s', (input, expected) => {
    expect(normalizeLlamaServerBaseUrlV1(input)).toBe(expected);
  });
});
