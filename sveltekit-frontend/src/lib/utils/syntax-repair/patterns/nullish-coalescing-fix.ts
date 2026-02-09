/**
 * Nullish Coalescing Operator Fix Pattern
 *
 * Fixes corrupted nullish coalescing operators that have incorrect spacing.
 *
 * Before: value ?? 'default' or value ??'default'
 * After:  value ?? 'default'
 */

import { createPattern, type PatternMatcher } from '../pattern-matcher';

/**
 * Pattern to fix missing space before ??
 * Handles: value ?? 'default' → value ?? 'default'
 */
export const missingSpaceBeforePattern: PatternMatcher = createPattern(
  'nullish-space-before',
  'Fix missing space before ?? operator',
  /(\w+|\)|\])\?\?(?=\s*['"`\w])/g,
  '$1 ??',
  {
    priority: 50,
  }
);

/**
 * Pattern to fix missing space after ??
 * Handles: value ?? 'default' (already has space before, missing after)
 */
export const missingSpaceAfterPattern: PatternMatcher = createPattern(
  'nullish-space-after',
  'Fix missing space after ?? operator',
  /\?\?(?=['"`\w\(])/g,
  '?? ',
  {
    priority: 52,
  }
);

/**
 * Pattern to fix double spacing around ??
 * Handles: value  ??  'default' → value ?? 'default'
 */
export const doubleSpacingPattern: PatternMatcher = createPattern(
  'nullish-double-space',
  'Fix double spacing around ?? operator',
  /\s+\?\?\s+/g,
  ' ?? ',
  {
    priority: 55,
  }
);

/**
 * Pattern to fix environment variable nullish coalescing
 * Common pattern: process.env.VAR ?? 'default'
 */
export const envVarNullishPattern: PatternMatcher = createPattern(
  'env-var-nullish',
  'Fix environment variable nullish coalescing',
  /(process\.env(?:\?)?\.[\w_]+)\?\?(?=\s*['"`])/g,
  '$1 ??',
  {
    priority: 48,
  }
);

/**
 * Pattern to fix optional chaining followed by nullish coalescing
 * Handles: obj?.prop ?? 'default' → obj?.prop ?? 'default'
 */
export const optionalChainNullishPattern: PatternMatcher = createPattern(
  'optional-chain-nullish',
  'Fix optional chaining followed by nullish coalescing',
  /(\?\.\w+)\?\?/g,
  '$1 ??',
  {
    priority: 46,
  }
);

/**
 * Pattern to fix chained nullish coalescing
 * Handles: a ?? b ?? c → a ?? b ?? c
 */
export const chainedNullishPattern: PatternMatcher = createPattern(
  'chained-nullish',
  'Fix chained nullish coalescing operators',
  /(\w+)\?\?(\w+)\?\?/g,
  '$1 ?? $2 ??',
  {
    priority: 54,
  }
);

/**
 * Pattern to fix nullish coalescing with function calls
 * Handles: getValue() ?? 'default' → getValue() ?? 'default'
 */
export const functionCallNullishPattern: PatternMatcher = createPattern(
  'function-call-nullish',
  'Fix nullish coalescing after function calls',
  /(\w+\([^)]*\))\?\?/g,
  '$1 ??',
  {
    priority: 47,
  }
);

/**
 * Pattern to fix nullish coalescing with array access
 * Handles: arr[0] ?? 'default' → arr[0] ?? 'default'
 */
export const arrayAccessNullishPattern: PatternMatcher = createPattern(
  'array-access-nullish',
  'Fix nullish coalescing after array access',
  /(\w+\[[^\]]+\])\?\?/g,
  '$1 ??',
  {
    priority: 49,
  }
);

/**
 * Get all nullish coalescing fix patterns in priority order
 */
export function getNullishCoalescingPatterns(): PatternMatcher[] {
  return [
    optionalChainNullishPattern,
    functionCallNullishPattern,
    envVarNullishPattern,
    arrayAccessNullishPattern,
    missingSpaceBeforePattern,
    missingSpaceAfterPattern,
    chainedNullishPattern,
    doubleSpacingPattern,
  ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/**
 * Apply nullish coalescing fixes to content
 */
export function fixNullishCoalescing(content: string): {
	result: string, fixCount: number } {
  let result = content;
  let totalFixes = 0;

  for (const pattern of getNullishCoalescingPatterns()) {
    const matches = result.match(pattern.pattern);
    if (matches) {
      totalFixes += matches.length;
      if (typeof pattern.replacement === 'function') {
        result = result.replace(pattern.pattern, pattern.replacement);
      } else {
        result = result.replace(pattern.pattern, pattern.replacement);
      }
    }
  }

  return { result, fixCount: totalFixes };
}
