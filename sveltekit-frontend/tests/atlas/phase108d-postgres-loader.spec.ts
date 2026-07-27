import { describe, expect, it } from 'vitest';
import { parsePostgresJsonRows } from '../../../scripts/atlas/lib/postgres-json-loader.ts';

describe('Phase 108D Postgres JSON loader', () => {
  it('preserves non-null PostgreSQL identity fields', () => {
    const rows = parsePostgresJsonRows(
      JSON.stringify([
        {
          packet_key: '0ba2345cd9c542fa',
          source_ref: 'proto/RetrievalService/Health',
          feature_id: 'retrieval.health',
          content_hash: null,
        },
      ])
    );

    expect(rows[0]?.packet_key).toBe('0ba2345cd9c542fa');
    expect(rows[0]?.source_ref).toBe('proto/RetrievalService/Health');
  });

  it('preserves a genuine null source_ref', () => {
    const rows = parsePostgresJsonRows(
      JSON.stringify([
        {
          packet_key: 'ace_packet_e3b0c44298fc',
          source_ref: null,
          content_hash: null,
        },
      ])
    );

    expect(rows[0]?.packet_key).toBe('ace_packet_e3b0c44298fc');
    expect(rows[0]?.source_ref).toBeNull();
  });

  it('returns no rows for empty JSON arrays', () => {
    expect(parsePostgresJsonRows('[]')).toEqual([]);
  });

  it('throws explicit errors for malformed JSON', () => {
    expect(() => parsePostgresJsonRows('{bad-json')).toThrow(/POSTGRES_JSON_PARSE_FAILED/);
  });

  it('rejects non-object rows', () => {
    expect(() => parsePostgresJsonRows(JSON.stringify(['not-an-object']))).toThrow(/row 0 is not a JSON object/);
  });

  it('does not substitute packet_id for packet_key', () => {
    const rows = parsePostgresJsonRows(
      JSON.stringify([
        {
          packet_key: null,
          packet_id: 'packet_0_1784513267148',
          source_ref: null,
        },
      ])
    );

    expect(rows[0]?.packet_key).toBeNull();
    expect(rows[0]?.packet_id).toBe('packet_0_1784513267148');
  });
});
