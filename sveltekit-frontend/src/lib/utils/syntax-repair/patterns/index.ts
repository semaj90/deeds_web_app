/**
 * Pattern Index - Exports all fix patterns
 *
 * This module aggregates all syntax repair patterns for the multi-pass processor.
 * Patterns are organized by category and can be applied individually or as a group.
 */

// Core pattern exports
export * from './import-type-fix';
export * from './function-param-fix';
export * from './function-call-fix';
export * from './object-literal-fix';
export * from './nullish-coalescing-fix';

// New pattern exports for Svelte 5 remediation
export * from './bits-ui-migration-fix';
export * from './colon-chain-fix';
export * from './a11y-label-fix';

// Pattern getter imports
import { getImportTypePatterns } from './import-type-fix';
import { getFunctionParamPatterns } from './function-param-fix';
import { getFunctionCallPatterns } from './function-call-fix';
import { getObjectLiteralPatterns } from './object-literal-fix';
import { getNullishCoalescingPatterns } from './nullish-coalescing-fix';
import { getBitsUiMigrationPatterns } from './bits-ui-migration-fix';
import { getColonChainPatterns } from './colon-chain-fix';
import { getA11yLabelPatterns } from './a11y-label-fix';

import type { PatternMatcher } from '../pattern-matcher';

/**
 * Pattern categories for selective processing
 */
export type PatternCategory =
  | 'import-type'
  | 'function-param'
  | 'function-call'
  | 'object-literal'
  | 'nullish-coalescing'
  | 'bits-ui-migration'
  | 'colon-chain'
  | 'a11y-label';

/**
 * Get all patterns in the recommended processing order
 * Patterns are sorted by priority (lower = earlier)
 */
export function getAllPatterns(): PatternMatcher[] {
  return [
    // Colon-chain fixes first (highest priority, fixes cascading issues)
    ...getColonChainPatterns(),
    // Import fixes next
    ...getImportTypePatterns(),
    // Bits-UI migration patterns
    ...getBitsUiMigrationPatterns(),
    // Function-related fixes
    ...getFunctionParamPatterns(),
    ...getFunctionCallPatterns(),
    // Object literal fixes
    ...getObjectLiteralPatterns(),
    // Nullish coalescing fixes
    ...getNullishCoalescingPatterns(),
    // A11y fixes last (they may depend on other fixes)
    ...getA11yLabelPatterns(),
  ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/**
 * Get patterns grouped by category
 */
export function getPatternsByCategory(): Map<PatternCategory, PatternMatcher[]> {
  const categories = new Map<PatternCategory, PatternMatcher[]>();

  categories.set('colon-chain', getColonChainPatterns());
  categories.set('import-type', getImportTypePatterns());
  categories.set('bits-ui-migration', getBitsUiMigrationPatterns());
  categories.set('function-param', getFunctionParamPatterns());
  categories.set('function-call', getFunctionCallPatterns());
  categories.set('object-literal', getObjectLiteralPatterns());
  categories.set('nullish-coalescing', getNullishCoalescingPatterns());
  categories.set('a11y-label', getA11yLabelPatterns());

  return categories;
}

/**
 * Get patterns for a specific category
 */
export function getPatternsForCategory(category: PatternCategory): PatternMatcher[] {
  const categoryMap = getPatternsByCategory();
  return categoryMap.get(category) ?? [];
}

/**
 * Get patterns for TypeScript files only (excludes Svelte-specific patterns)
 */
export function getTypeScriptPatterns(): PatternMatcher[] {
  return [
    ...getColonChainPatterns(),
    ...getImportTypePatterns(),
    ...getFunctionParamPatterns(),
    ...getFunctionCallPatterns(),
    ...getObjectLiteralPatterns(),
    ...getNullishCoalescingPatterns(),
  ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/**
 * Get patterns for Svelte files (includes all patterns)
 */
export function getSveltePatterns(): PatternMatcher[] {
  return getAllPatterns();
}

/**
 * Get pattern statistics
 */
export function getPatternStats(): {, totalPatterns: number;
  byCategory: Record<PatternCategory, number>;
} {
  const categories = getPatternsByCategory();
  const byCategory: Record<string, number> = {};

  let total = 0;
  categories.forEach((patterns, category) => {
    byCategory[category] = patterns.length;
    total += patterns.length;
  });

  return {
    totalPatterns: total,
    byCategory: byCategory as Record<PatternCategory, number>,
  };
}
