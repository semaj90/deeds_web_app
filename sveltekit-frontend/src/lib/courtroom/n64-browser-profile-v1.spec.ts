import { describe, expect, it } from 'vitest';
import {
  estimateGeometryBytes,
  fitsGeometryBudget,
  getN64RenderSize,
  N64_BROWSER_PROFILE_V1,
} from './n64-browser-profile-v1.js';

describe('N64 browser profile v1', () => {
  it('uses a 320x240 internal rendering ceiling and an 8 MiB geometry budget', () => {
    expect(N64_BROWSER_PROFILE_V1.internalWidth).toBe(320);
    expect(N64_BROWSER_PROFILE_V1.internalHeight).toBe(240);
    expect(N64_BROWSER_PROFILE_V1.geometryBudgetBytes).toBe(8 * 1024 * 1024);
  });

  it('scales the internal buffer down without changing the canvas aspect ratio', () => {
    expect(getN64RenderSize(1280, 720)).toEqual({ width: 320, height: 180 });
    expect(getN64RenderSize(160, 120)).toEqual({ width: 160, height: 120 });
  });

  it('counts shared geometry once using a conservative vertex and index estimate', () => {
    const geometry = { getTotalVertices: () => 100, getTotalIndices: () => 300 };
    expect(estimateGeometryBytes([{ geometry }, { geometry }])).toBe(4400);
  });

  it('rejects non-finite, negative, or over-budget geometry estimates', () => {
    expect(fitsGeometryBudget(1024, N64_BROWSER_PROFILE_V1.geometryBudgetBytes - 1024)).toBe(true);
    expect(fitsGeometryBudget(1024, N64_BROWSER_PROFILE_V1.geometryBudgetBytes - 1023)).toBe(false);
    expect(fitsGeometryBudget(Number.NaN, 1)).toBe(false);
    expect(fitsGeometryBudget(1, -1)).toBe(false);
  });
});
