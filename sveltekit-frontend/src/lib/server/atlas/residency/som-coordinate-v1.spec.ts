import { describe, expect, it } from 'vitest';
import { SomCoordinateV1Schema } from './som-coordinate-v1.js';

describe('SomCoordinateV1Schema', () => {
  it('carries representationRevision and somRevision as independent axes', () => {
    const beforeRetrain = SomCoordinateV1Schema.parse({
      representationRevision: 'semantic768:r1',
      somRevision: 'som:r1',
      x: 3.2,
      y: -1.1,
      z: 0.5,
      quantizationError: 0.02,
    });
    const afterRetrain = SomCoordinateV1Schema.parse({
      representationRevision: 'semantic768:r1',
      somRevision: 'som:r2',
      x: 3.4,
      y: -1.0,
      z: 0.6,
      quantizationError: 0.018,
    });

    expect(afterRetrain.representationRevision).toBe(beforeRetrain.representationRevision);
    expect(afterRetrain.somRevision).not.toBe(beforeRetrain.somRevision);
  });

  it('rejects a coordinate missing quantizationError', () => {
    expect(() =>
      SomCoordinateV1Schema.parse({
        representationRevision: 'semantic768:r1',
        somRevision: 'som:r1',
        x: 0,
        y: 0,
        z: 0,
      }),
    ).toThrow();
  });

  it('rejects a non-finite coordinate value', () => {
    expect(() =>
      SomCoordinateV1Schema.parse({
        representationRevision: 'semantic768:r1',
        somRevision: 'som:r1',
        x: Number.POSITIVE_INFINITY,
        y: 0,
        z: 0,
        quantizationError: 0.01,
      }),
    ).toThrow();
  });
});
