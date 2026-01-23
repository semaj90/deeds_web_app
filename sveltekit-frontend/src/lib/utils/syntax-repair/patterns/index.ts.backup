/**
 * Pattern Index - Exports all fix patterns
 */

export * from './import-type-fix';
export * from './function-param-fix';
export * from './function-call-fix';
export * from './object-literal-fix';
export * from './nullish-coalescing-fix';

import { getImportTypePatterns } from './import-type-fix';
import { getFunctionParamPatterns } from './function-param-fix';
import { getFunctionCallPatterns } from './function-call-fix';
import { getObjectLiteralPatterns } from './object-literal-fix';
import { getNullishCoalescingPatterns } from './nullish-coalescing-fix';
import type { PatternMatcher } from '../pattern-matcher';

/**
 * Get all patterns in the recommended processing order
 */
export function getAllPatterns(): PatternMatcher[] {
  return [
    ...getImportTypePatterns(),
    ...getFunctionParamPatterns(),
    ...getFunctionCallPatterns(),
    ...getObjectLiteralPatterns(),
    ...getNullishCoalescingPatterns(),
  ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/**
 * Get patterns grouped by category
 */
export function getPatternsByCategory(): Map<string, PatternMatcher[]> {
  const categories = new Map<string, PatternMatcher[]>();

  categories.set('import-type', getImportTypePatterns());
  categories.set('function-param', getFunctionParamPatterns());
  categories.set('function-call', getFunctionCallPatterns());
  categories.set('object-literal', getObjectLiteralPatterns());
  categories.set('nullish-coalescing', getNullishCoalescingPatterns());

  return categories;
}
