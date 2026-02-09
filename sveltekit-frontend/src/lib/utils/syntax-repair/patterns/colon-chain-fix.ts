/**
 * Colon-Chain Corruption Fix Pattern
 *
 * Fixes corrupted syntax where `key: value, key: value` patterns appear
 * instead of proper object literals or function parameters.
 *
 * This is a multi-pass repair pattern that handles cascading fixes.
 *
 * Examples of corruption patterns fixed:
 * 1. `{ key: value, next: prop }` → `{ key: value, next: prop }`
 * 2. `{ a: b, c: d }` → `{ a: b, c: d }`
 * 3. Nested: `{
	outer: { inner: value, next } }` → `{ outer: {
	inner: value, next } }`
 *
 * @requirements 1.5
 */

import { createPattern } from '../pattern-matcher';
import type { PatternMatcher } from '../pattern-matcher';

// ============================================================================
// IMPORT COLON-CHAIN PATTERNS (Highest Priority)
// ============================================================================

/**
 * Pattern to fix longer import colon chains
 * Before: import { A: B, C: D } from
 * After:  import { A, B, C, D } from
 */
export const importLongColonChainPattern: PatternMatcher = createPattern(
  'import-long-colon-chain',
  'Fix longer colon chain in import statements',
  /import\s*\{\s*([A-Za-z_]\w*):\s*([A-Za-z_]\w*):\s*([A-Za-z_]\w*):\s*([A-Za-z_]\w*)\s*\}/g,
  'import { $1, $2, $3, $4 }',
  {
    priority: -1,
  }
);

/**
 * Pattern to fix simple value: value, value chains (likely corrupted imports)
 * Before: import { A, B, C } from
 * After:  import { A, B, C } from
 */
export const importColonChainPattern: PatternMatcher = createPattern(
  'import-colon-chain',
  'Fix colon chain in import statements',
  /import\s*\{\s*([A-Za-z_]\w*):\s*([A-Za-z_]\w*):\s*([A-Za-z_]\w*)\s*\}/g,
  'import { $1, $2, $3 }',
  {
    priority: 0,
  }
);

// ============================================================================
// TRIPLE/QUAD COLON-CHAIN PATTERNS
// ============================================================================

/**
 * Pattern to fix quad colon chains in object literals
 * Before: {
	key: value, next:
	prop: final }
 * After: {
	key: value, next: prop, final }
 */
export const quadColonChainPattern: PatternMatcher = createPattern(
  'quad-colon-chain',
  'Fix quad colon chain corruption in object literals',
  /(\w+):\s*(\w+):\s*(\w+):\s*(\w+):\s*(\w+)/g,
  (_match: string, key1: string, val1: string, key2: string, val2: string, key3: string): string => {
    // Determine if this looks like type annotations or object literals
    if (/^[A-Z]/.test(val1) && /^[A-Z]/.test(val2)) {
      // Type annotations: prop: Type, prop: Type, prop
      return `${key1}: ${val1},
	${key2}: ${val2},
	${key3}`;
    }
    // Object literal: key, value, key: value, key
    return `${key1}: ${val1},
	${key2}: ${val2},
	${key3}`;
  },
	{
    priority: 0,
  }
);

/**
 * Pattern to fix triple colon chains in object literals
 * Before: {
	key: value, key: value }
 * After: {
	key: value, key: value }
 */
export const tripleColonChainPattern: PatternMatcher = createPattern(
  'triple-colon-chain',
  'Fix triple colon chain corruption in object literals',
  /(\w+):\s*(\w+):\s*(\w+):\s*(\w+)/g,
  (_match: string, key1: string, val1: string, key2: string, val2: string): string => {
    // Determine if this is an object literal or type annotation
    // If val1 looks like a type (starts with uppercase), treat differently
    if (/^[A-Z]/.test(val1)) {
      // This might be: prop, Type: prop: Type -> prop: Type, prop: Type
      return `${key1}: ${val1},
	${key2}: ${val2}`;
    }
    // Otherwise treat as corrupted object literal
    return `${key1}: ${val1},
	${key2}: ${val2}`;
  },
	{
    priority: 1,
  }
);

/**
 * Pattern to fix double colon chains
 * Before: key, value: nextKey
 * After: key, value, nextKey
 */
export const doubleColonChainPattern: PatternMatcher = createPattern(
  'double-colon-chain',
  'Fix double colon chain corruption',
  /(\w+):\s*([a-z_]\w*):\s*([a-z_]\w*)/g,
  (_match: string, key1: string, val1: string, key2: string): string => {
    // Check if this looks like a valid type annotation
    // e.g., param: string, number should become param: string, number
    return `${key1}: ${val1},
	${key2}`;
  },
	{
    priority: 2,
  }
);

// ============================================================================
// TYPE ANNOTATION COLON-CHAIN PATTERNS
// ============================================================================

/**
 * Pattern to fix colon chains with type annotations
 * Before: param, Type: param: Type
 * After:  param: Type; param: Type
 */
export const typeAnnotationColonChainPattern: PatternMatcher = createPattern(
  'type-annotation-colon-chain',
  'Fix colon chain in type annotations',
  /(\w+):\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*):\s*(\w+):\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*)/g,
  '$1: $2, $3: $4',
  {
    priority: 3,
  }
);

/**
 * Pattern to fix colon chains in function parameters
 * Before: function foo(a: string, b: number)
 * After:  function foo(a: string, b: number)
 */
export const functionParamColonChainPattern: PatternMatcher = createPattern(
  'function-param-colon-chain',
  'Fix colon chain in function parameters',
  /\(([^)]*?)(\w+):\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*):\s*(\w+):\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*)([^)]*?)\)/g,
  '($1$2: $3, $4: $5$6)',
  {
    priority: 4,
  }
);

/**
 * Pattern to fix colon chains in arrow function parameters
 * Before: (a:
	string: b, number) =>
 * After:  (a: string, b: number) =>
 */
export const arrowFunctionColonChainPattern: PatternMatcher = createPattern(
  'arrow-function-colon-chain',
  'Fix colon chain in arrow function parameters',
  /\(([^)]*?)(\w+):\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*):\s*(\w+):\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*)([^)]*?)\)\s*=>/g,
  '($1$2: $3, $4: $5$6) =>',
  {
    priority: 5,
  }
);

// ============================================================================
// INTERFACE AND TYPE DEFINITION PATTERNS
// ============================================================================

/**
 * Pattern to fix colon chains in interface definitions
 * Before: interface Foo { a: string, b: number }
 * After:  interface Foo { a: string;
	b: number }
 */
export const interfaceColonChainPattern: PatternMatcher = createPattern(
  'interface-colon-chain',
  'Fix colon chain in interface definitions',
  /interface\s+(\w+)\s*\{([^}]*?)(\w+):\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*):\s*(\w+):\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*)([^}]*?)\}/g,
  'interface $1 {$2$3: $4; $5: $6$7}',
  {
    priority: 6,
  }
);

/**
 * Pattern to fix colon chains in type definitions
 * Before: type Foo = { a: string, b: number }
 * After:  type Foo = { a: string;
	b: number }
 */
export const typeDefColonChainPattern: PatternMatcher = createPattern(
  'type-def-colon-chain',
  'Fix colon chain in type definitions',
  /type\s+(\w+)\s*=\s*\{([^}]*?)(\w+):\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*):\s*(\w+):\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*)([^}]*?)\}/g,
  'type $1 = {$2$3: $4; $5: $6$7}',
  {
    priority: 7,
  }
);

// ============================================================================
// DESTRUCTURING AND OBJECT LITERAL PATTERNS
// ============================================================================

/**
 * Pattern to fix colon chains in object destructuring
 * Before: const { a: b: c } = obj
 * After:  const { a: b, c } = obj
 */
export const destructuringColonChainPattern: PatternMatcher = createPattern(
  'destructuring-colon-chain',
  'Fix colon chain in object destructuring',
  /const\s*\{\s*(\w+):\s*(\w+):\s*(\w+)\s*\}/g,
  'const { $1: $2, $3 }',
  {
    priority: 8,
  }
);

/**
 * Pattern to fix colon chains in return type objects
 * Before: ): {
	a: Type, b: Type }
 * After:  ): {
	a: Type; b: Type }
 */
export const returnTypeColonChainPattern: PatternMatcher = createPattern(
  'return-type-colon-chain',
  'Fix colon chain in return type object literals',
  /\):\s*\{\s*(\w+):\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*):\s*(\w+):\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*)\s*\}/g,
  '): { $1: $2; $3: $4 }',
  {
    priority: 9,
  }
);

/**
 * Pattern to fix generic colon chains
 * Before: Promise<{
	a: Type, b: Type }>
 * After: Promise<{
	a: Type; b: Type }>
 */
export const genericColonChainPattern: PatternMatcher = createPattern(
  'generic-colon-chain',
  'Fix colon chain in generic type parameters',
  /<\{\s*(\w+):\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*):\s*(\w+):\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*)\s*\}>/g,
  '<{ $1: $2; $3: $4 }>',
  {
    priority: 10,
  }
);

// ============================================================================
// NESTED OBJECT LITERAL PATTERNS
// ============================================================================

/**
 * Pattern to fix colon chains inside nested object literals
 * Before: {
	outer: { inner: value, next } }
 * After: {
	outer: { inner: value, next } }
 */
export const nestedObjectColonChainPattern: PatternMatcher = createPattern(
  'nested-object-colon-chain',
  'Fix colon chain in nested object literals',
  /\{\s*(\w+):\s*\{\s*(\w+):\s*(\w+):\s*(\w+)\s*\}\s*\}/g,
  '{ $1: { $2: $3, $4 } }',
  {
    priority: 11,
  }
);

/**
 * Pattern to fix deeply nested colon chains
 * Before: {
	a: { b: {
	c: d: e } } }
 * After: {
	a: { b: {
	c: d, e } } }
 */
export const deepNestedColonChainPattern: PatternMatcher = createPattern(
  'deep-nested-colon-chain',
  'Fix colon chain in deeply nested object literals',
  /\{\s*(\w+):\s*\{\s*(\w+):\s*\{\s*(\w+):\s*(\w+):\s*(\w+)\s*\}\s*\}\s*\}/g,
  '{ $1: { $2: { $3: $4, $5 } } }',
  {
    priority: 12,
  }
);

/**
 * Pattern to fix colon chains with nested braces (general case)
 * Handles: {
	inner: value, next }
 * After: {
	inner: value, next }
 */
export const innerBraceColonChainPattern: PatternMatcher = createPattern(
  'inner-brace-colon-chain',
  'Fix colon chain inside braces',
  /\{\s*(\w+):\s*(\w+):\s*(\w+)\s*\}/g,
  '{ $1: $2, $3 }',
  {
    priority: 13,
  }
);

// ============================================================================
// OBJECT PROPERTY COLON-CHAIN PATTERNS
// ============================================================================

/**
 * Pattern to fix colon chains in object property assignments
 * Before: obj = { prop: value, another: thing }
 * After:  obj = { prop: value, another: thing }
 */
export const objectPropertyColonChainPattern: PatternMatcher = createPattern(
  'object-property-colon-chain',
  'Fix colon chain in object property assignments',
  /=\s*\{\s*(\w+):\s*(\w+):\s*(\w+):\s*(\w+)\s*\}/g,
  '= { $1: $2, $3: $4 }',
  {
    priority: 14,
  }
);

/**
 * Pattern to fix colon chains in object spread with properties
 * Before: { ...spread: key, value }
 * After:  { ...spread, key: value }
 */
export const spreadColonChainPattern: PatternMatcher = createPattern(
  'spread-colon-chain',
  'Fix colon chain after spread operator',
  /\{\s*\.\.\.(\w+):\s*(\w+):\s*(\w+)\s*\}/g,
  '{ ...$1, $2: $3 }',
  {
    priority: 15,
  }
);

// ============================================================================
// SVELTE-SPECIFIC COLON-CHAIN PATTERNS
// ============================================================================

/**
 * Pattern to fix colon chains in Svelte $props() destructuring
 * Before: let { prop: Type, another: Type } = $props()
 * After:  let { prop, another }: {
	prop: Type; another: Type } = $props()
 */
export const sveltePropsColonChainPattern: PatternMatcher = createPattern(
  'svelte-props-colon-chain',
  'Fix colon chain in Svelte $props() destructuring',
  /let\s*\{\s*(\w+):\s*([A-Z]\w*):\s*(\w+):\s*([A-Z]\w*)\s*\}\s*=\s*\$props\(\)/g,
  'let { $1, $3 }: { $1: $2; $3: $4 } = $props()',
  {
    priority: 16,
    fileFilter: (path: string) => path.endsWith('.svelte'),
  }
);

/**
 * Pattern to fix colon chains in Svelte reactive statements
 * Before: $:
	result: value, computed
 * After:  let result = $derived(value, computed
 */
export const svelteReactiveColonChainPattern: PatternMatcher = createPattern(
  'svelte-reactive-colon-chain',
  'Fix colon chain in Svelte reactive statements',
  /\$:\s*(\w+):\s*(\w+):\s*(\w+)/g,
  '$: $1 = $2, $3',
  {
    priority: 17,
    fileFilter: (path: string) => path.endsWith('.svelte'),
  }
));

// ============================================================================
// EDGE CASE PATTERNS
// ============================================================================

/**
 * Pattern to fix colon chains with string values
 * Before: {
	key: "value": next: "prop" }
 * After: {
	key: "value", next: "prop" }
 */
export const stringValueColonChainPattern: PatternMatcher = createPattern(
  'string-value-colon-chain',
  'Fix colon chain with string values',
  /(\w+):\s*"([^"]*)":\s*(\w+):\s*"([^"]*)"/g,
  '$1: "$2", $3: "$4"',
  {
    priority: 18,
  }
);

/**
 * Pattern to fix colon chains with numeric values
 * Before: {
	key: 123, next: 456 }
 * After: {
	key: 123, next: 456 }
 */
export const numericValueColonChainPattern: PatternMatcher = createPattern(
  'numeric-value-colon-chain',
  'Fix colon chain with numeric values',
  /(\w+):\s*(\d+):\s*(\w+):\s*(\d+)/g,
  '$1: $2, $3: $4',
  {
    priority: 19,
  }
);

/**
 * Pattern to fix colon chains with boolean values
 * Before: {
	key: true, next: false }
 * After: {
	key: true, next: false }
 */
export const booleanValueColonChainPattern: PatternMatcher = createPattern(
  'boolean-value-colon-chain',
  'Fix colon chain with boolean values',
  /(\w+):\s*(true|false):\s*(\w+):\s*(true|false)/g,
  '$1: $2, $3: $4',
  {
    priority: 20,
  }
);

/**
 * Pattern to fix colon chains with null/undefined values
 * Before: {
	key: null, next | undefined }
 * After: {
	key: null, next | undefined }
 */
export const nullishValueColonChainPattern: PatternMatcher = createPattern(
  'nullish-value-colon-chain',
  'Fix colon chain with null/undefined values',
  /(\w+):\s*(null|undefined):\s*(\w+):\s*(null|undefined|\w+)/g,
  '$1: $2, $3: $4',
  {
    priority: 21,
  }
);

// ============================================================================
// PATTERN AGGREGATION
// ============================================================================

/**
 * Get all colon-chain fix patterns in priority order
 */
export function getColonChainPatterns(): PatternMatcher[] {
  return [
    // Import patterns (highest priority)
    importLongColonChainPattern,
    importColonChainPattern,
    // Quad and triple colon chains
    quadColonChainPattern,
    tripleColonChainPattern,
    doubleColonChainPattern,
    // Type annotation patterns
    typeAnnotationColonChainPattern,
    functionParamColonChainPattern,
    arrowFunctionColonChainPattern,
    // Interface and type definition patterns
    interfaceColonChainPattern,
    typeDefColonChainPattern,
    // Destructuring and object literal patterns
    destructuringColonChainPattern,
    returnTypeColonChainPattern,
    genericColonChainPattern,
    // Nested object patterns
    nestedObjectColonChainPattern,
    deepNestedColonChainPattern,
    innerBraceColonChainPattern,
    // Object property patterns
    objectPropertyColonChainPattern,
    spreadColonChainPattern,
    // Svelte-specific patterns
    sveltePropsColonChainPattern,
    svelteReactiveColonChainPattern,
    // Edge case patterns
    stringValueColonChainPattern,
    numericValueColonChainPattern,
    booleanValueColonChainPattern,
    nullishValueColonChainPattern,
  ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

// ============================================================================
// MULTI-PASS REPAIR FUNCTION
// ============================================================================

/**
 * Result of applying colon-chain fixes
 */
export interface ColonChainFixResult {
  /** The transformed content */
  result: string;
  /** Total number of fixes applied across all passes */
  fixCount: number;
  /** Number of passes executed */
  passes: number;
  /** Breakdown of fixes by pattern name */
  fixesByPattern: Record<string, number>;
}

/**
 * Apply colon-chain fixes to content with multiple passes
 * This function runs multiple passes to handle cascading fixes
 *
 * @param content - The source code content to transform
 * @param maxPasses - Maximum number of passes to run (default: 5)
 * @returns Object containing the transformed result, fix count, passes, and breakdown
 *
 * @requirements 1.5
 */
export function fixColonChains(
  content: string,
  maxPasses: number = 5
): ColonChainFixResult {
  let result = content;
  let totalFixes = 0;
  let passCount = 0;
  const fixesByPattern: Record<string, number> = {};

  for (let pass = 0; pass < maxPasses; pass++) {
    let passFixes = 0;
    passCount++;

    for (const pattern of getColonChainPatterns()) {
      // Reset regex lastIndex for global patterns
      pattern.pattern.lastIndex = 0;

      const matches = result.match(pattern.pattern);
      if (matches) {
        const matchCount = matches.length;
        passFixes += matchCount;

        // Track fixes by pattern name
        fixesByPattern[pattern.name] = (fixesByPattern[pattern.name] ?? 0) + matchCount;

        // Apply the replacement
        if (typeof pattern.replacement === 'function') {
          result = result.replace(pattern.pattern, pattern.replacement as (substring: string, ...args: string[]) => string);
        } else {
          result = result.replace(pattern.pattern, pattern.replacement);
        }
      }
    }

    totalFixes += passFixes;

    // Stop if no more fixes found
    if (passFixes === 0) {
      break;
    }
  }

  return { result, fixCount: totalFixes, passes: passCount, fixesByPattern };
}

/**
 * Detect colon-chain corruption patterns in content
 *
 * @param content - The source code content to check
 * @returns Object containing detection results
 */
export function detectColonChainCorruption(content: string): {
	hasCorruption: boolean;
  patternMatches: Record<string, number>;
  totalMatches: number;
} {
  const patternMatches: Record<string, number> = {};
  let totalMatches = 0;

  for (const pattern of getColonChainPatterns()) {
    // Reset regex lastIndex for global patterns
    pattern.pattern.lastIndex = 0;

    const matches = content.match(pattern.pattern);
    if (matches) {
      patternMatches[pattern.name] = matches.length;
      totalMatches += matches.length;
    }
  }

  return {
    hasCorruption: totalMatches > 0,
    patternMatches,
    totalMatches,
  };
}

/**
 * Validate that content has no remaining colon-chain corruption
 *
 * @param content - The source code content to validate
 * @returns True if no corruption patterns are found
 *
 * @requirements 1.5
 */
export function validateNoColonChainCorruption(content: string): boolean {
  const detection = detectColonChainCorruption(content);
  return !detection.hasCorruption;
}
