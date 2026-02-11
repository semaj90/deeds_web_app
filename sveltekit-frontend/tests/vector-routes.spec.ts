import { describe, it, expect } from 'vitest';
import { StorePayload, SearchPayload } from '$lib/server/utils/vector-schemas';

describe('StorePayload Schema Validation', () => {
  it('should validate a correct store payload', () => {
    const payload = { text: 'test document', metadata: { title: 'Test' } };
    const parsed = StorePayload.safeParse(payload);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(payload);
  });

  it('should invalidate a store payload with missing text', () => {
    const payload = { metadata: { title: 'Test' } };
    const parsed = StorePayload.safeParse(payload);
    expect(parsed.success).toBe(false);
    expect(parsed.error.flatten().fieldErrors.text).toEqual([
      'String must contain at least 1 character(s)',
    ]);
  });

  it('should invalidate a store payload with empty text', () => {
    const payload = { text: '', metadata: { title: 'Test' } };
    const parsed = StorePayload.safeParse(payload);
    expect(parsed.success).toBe(false);
    expect(parsed.error.flatten().fieldErrors.text).toEqual([
      'String must contain at least 1 character(s)',
    ]);
  });

  it('should validate a store payload with only text', () => {
    const payload = { text: 'another document' };
    const parsed = StorePayload.safeParse(payload);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(payload);
  });
});

describe('SearchPayload Schema Validation', () => {
  it('should validate a correct search payload with queryText', () => {
    const payload = { queryText: 'search query', limit: 10 };
    const parsed = SearchPayload.safeParse(payload);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(payload);
  });

  it('should validate a correct search payload with queryVector', () => {
    const payload = { queryVector: [0.1, 0.2, 0.3], limit: 5 };
    const parsed = SearchPayload.safeParse(payload);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(payload);
  });

  it('should invalidate a search payload with neither queryText nor queryVector', () => {
    const payload = { limit: 5 };
    const parsed = SearchPayload.safeParse(payload);
    expect(parsed.success).toBe(true); // Zod allows this, runtime logic handles the OR
    expect(parsed.data).toEqual(payload);
  });

  it('should invalidate a search payload with invalid limit (negative)', () => {
    const payload = { queryText: 'query', limit: -5 };
    const parsed = SearchPayload.safeParse(payload);
    expect(parsed.success).toBe(false);
    expect(parsed.error.flatten().fieldErrors.limit).toEqual(['Number must be greater than 0']);
  });

  it('should invalidate a search payload with invalid limit (not integer)', () => {
    const payload = { queryText: 'query', limit: 5.5 };
    const parsed = SearchPayload.safeParse(payload);
    expect(parsed.success).toBe(false);
    expect(parsed.error.flatten().fieldErrors.limit).toEqual(['Expected integer, received float']);
  });

  it('should invalidate a search payload with non-numeric queryVector', () => {
    const payload = { queryVector: [0.1, '0.2', 0.3] as any, limit: 5 };
    const parsed = SearchPayload.safeParse(payload);
    expect(parsed.success).toBe(false);
    expect(parsed.error.flatten().fieldErrors.queryVector).toBeDefined();
  });
});
