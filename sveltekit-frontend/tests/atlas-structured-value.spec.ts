import { describe, expect, it } from 'vitest';
import {
  deriveDictionaryView,
  validateAtlasStructuredValue,
  type AtlasStructuredValueV1,
} from '../src/lib/server/atlas/value/atlas-structured-value';

const producer = { runtime: 'test', parser: 'fixture', revision: '1' };

function str(valueId: string, value: string): AtlasStructuredValueV1 {
  return {
    schema: 'atlas.structured-value.v1',
    valueId,
    kind: 'STRING',
    scalar: { stringValue: value },
    members: [],
    entries: [],
    producer,
  };
}

function int(valueId: string, value: string): AtlasStructuredValueV1 {
  return {
    schema: 'atlas.structured-value.v1',
    valueId,
    kind: 'INT',
    scalar: { intValue: value },
    members: [],
    entries: [],
    producer,
  };
}

describe('AtlasStructuredValueV1', () => {
  it('preserves ordered object entries', () => {
    const value: AtlasStructuredValueV1 = {
      schema: 'atlas.structured-value.v1',
      valueId: 'O91',
      kind: 'OBJECT',
      members: [],
      entries: [
        { ordinal: 0, key: str('k0', 'topK'), value: int('v0', '20'), keyForm: 'IDENTIFIER' },
        { ordinal: 1, key: str('k1', 'graphHops'), value: int('v1', '2'), keyForm: 'IDENTIFIER' },
        {
          ordinal: 2,
          key: str('k2', 'exact'),
          value: {
            schema: 'atlas.structured-value.v1',
            valueId: 'v2',
            kind: 'BOOL',
            scalar: { boolValue: true },
            members: [],
            entries: [],
            producer,
          },
          keyForm: 'IDENTIFIER',
        },
      ],
      producer,
    };

    expect(() => validateAtlasStructuredValue(value)).not.toThrow();
    expect(value.entries.map((entry) => entry.key.scalar?.stringValue)).toEqual([
      'topK',
      'graphHops',
      'exact',
    ]);
  });

  it('does not silently collapse duplicate keys', () => {
    const value: AtlasStructuredValueV1 = {
      schema: 'atlas.structured-value.v1',
      valueId: 'dup-object',
      kind: 'OBJECT',
      members: [],
      entries: [
        { ordinal: 0, key: str('k0', 'a'), value: int('v0', '1'), keyForm: 'STRING' },
        { ordinal: 1, key: str('k1', 'a'), value: int('v1', '2'), keyForm: 'STRING' },
      ],
      producer,
    };

    expect(() => deriveDictionaryView(value)).toThrow(/duplicate dictionary key/);
    expect(deriveDictionaryView(value, 'FIRST_WINS').values.get('a')?.scalar?.intValue).toBe('1');
    expect(deriveDictionaryView(value, 'LAST_WINS').values.get('a')?.scalar?.intValue).toBe('2');
  });

  it('retains 64-bit integers as decimal strings', () => {
    const value = int('large', '18446744073709551615');
    expect(() => validateAtlasStructuredValue(value)).not.toThrow();
    expect(value.scalar?.intValue).toBe('18446744073709551615');
  });

  it('rejects keyed entries on LIST/TUPLE representations', () => {
    const value: AtlasStructuredValueV1 = {
      schema: 'atlas.structured-value.v1',
      valueId: 'bad-list',
      kind: 'LIST',
      members: [],
      entries: [{ ordinal: 0, key: str('k0', 'x'), value: int('v0', '1'), keyForm: 'STRING' }],
      producer,
    };
    expect(() => validateAtlasStructuredValue(value)).toThrow(/may not carry keyed entries/);
  });
});
