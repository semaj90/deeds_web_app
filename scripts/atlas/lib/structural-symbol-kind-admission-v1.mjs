import { STRUCTURAL_SYMBOL_KIND_VALUES } from '../../../packages/parent-atlas/dist/core/structural-symbol.js';

const allowedKinds = new Set(STRUCTURAL_SYMBOL_KIND_VALUES);

export function classifyStructuralSymbolKindV1(value) {
  if (typeof value !== 'string') return { admitted: false, reason: 'SYMBOL_KIND_NOT_STRING' };
  if (!allowedKinds.has(value)) return { admitted: false, reason: 'UNSUPPORTED_STRUCTURAL_SYMBOL_KIND' };
  return { admitted: true, kind: value };
}
