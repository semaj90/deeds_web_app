import { describe, expect, it, vi } from 'vitest';
import { sampleDirectionalDiagnostics } from './directional-diagnostics';

describe('sampleDirectionalDiagnostics', () => {
  it('uses only the supplied bounded JVP/VJP samples and emits derived diagnostics', () => {
    const jvp = vi.fn((direction: readonly number[]) => [2 * direction[0], 3 * direction[1]]);
    const vjp = vi.fn((cotangent: readonly number[]) => [2 * cotangent[0], 3 * cotangent[1]]);
    const receipt = sampleDirectionalDiagnostics(
      { inputDimension: 2, outputDimension: 2, jvp, vjp },
      [
        { inputDirection: [1, 0], outputCotangent: [1, 0] },
        { inputDirection: [0, 1], outputCotangent: [0, 1] }
      ]
    );

    expect(jvp).toHaveBeenCalledTimes(2);
    expect(vjp).toHaveBeenCalledTimes(2);
    expect(receipt.jvpNorms).toEqual([2, 3]);
    expect(receipt.vjpNorms).toEqual([2, 3]);
    expect(receipt.meanJvpNorm).toBe(2.5);
    expect(receipt.maxVjpNorm).toBe(3);
    expect(receipt.jacobianMaterialized).toBe(false);
    expect(receipt.canonicalAuthority).toBe(false);
  });

  it('fails closed on invalid dimensions, non-finite values, and over-budget samples', () => {
    const backend = { inputDimension: 1, outputDimension: 1, jvp: () => [1], vjp: () => [1] };
    expect(() => sampleDirectionalDiagnostics(backend, [])).toThrow(/sample count/);
    expect(() => sampleDirectionalDiagnostics(backend, Array.from({ length: 65 }, () => ({
      inputDirection: [1], outputCotangent: [1]
    })))).toThrow(/sample count/);
    expect(() => sampleDirectionalDiagnostics(backend, [
      { inputDirection: [Number.NaN], outputCotangent: [1] }
    ])).toThrow(/non-finite/);
    expect(() => sampleDirectionalDiagnostics({ ...backend, inputDimension: 0 }, [
      { inputDirection: [1], outputCotangent: [1] }
    ])).toThrow(/inputDimension/);
  });

  it('rejects backend results with the wrong shape', () => {
    expect(() => sampleDirectionalDiagnostics({
      inputDimension: 1,
      outputDimension: 2,
      jvp: () => [1],
      vjp: () => [1]
    }, [{ inputDirection: [1], outputCotangent: [1, 0] }])).toThrow(/JVP result dimension mismatch/);
  });
});
