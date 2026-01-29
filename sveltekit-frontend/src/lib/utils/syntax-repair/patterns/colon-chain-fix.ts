/**
 * Colon-Chain Corruption Fix Pattern
 *
 * Fixes corrupted syntax where `key: value: key: value` patterns appear
 * instead of proper object literals or function parameters.
 *
 * This is a multi-pass repair pattern that handles cascading fixes.
 *
 * @requirements 1.5
 */

import { createPattern, type PatternMatcher } from '../pattern-matcher';

/**
 * Pattern to fix triple colon chains in object literals
 * Before: { key: value: key: value }
 * After:  { key: value, key: value }
 */
export const tripleColonChainPattern: PatternMatcher = createPattern(
  'triple-colon-chain',
  'Fix triple colon chain corruption in object literals',
  /(\w+):\s*(\w+):\s*(\w+):\s*(\w+)/g,
  (match, key1, val1, key2, val2) => {
    // Determine if this is an object literal or type annotation
    // If val1 looks like a type (starts with uppercase), treat differently
    if (/^[A-Z]/.test(val1)) {
      // This might be: prop: Type: prop: Type -> prop: Type, prop: Type
      return `${key1}: ${val1}, ${key2}: ${val2}`;
    }
    // Otherwise treat as corrupted object literal
    return `${key1}: ${val1}, ${key2}: ${val2}`;
  },
  {
    priority: 1,
  }
);

/**
 * Pattern to fix double colon chains
 * Before: key: value: nextKey
 * After:  key: value, nextKey
 */
export const doubleColonChainPattern: PatternMatcher = createPattern(
  'double-colon-chain',
  'Fix double colon chain corruption',
  /(\w+):\s*([a-z_]\w*):\s*([a-z_]\w*)/g,
  (match, key1, val1, key2) => {
    // Check if this looks like a valid type annotation
    // e.g., param: string: number should become param: string, number
    return `${key1}: ${val1}, ${key2}`;
  },
  {
    priority: 2,
  }
);

/**
 * Pattern to fix colon chains with type annotations
 * Before: param: Type: param: Type
 * After:  param: Type, param: Type
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
 * Before: function foo(a: string: b: number)
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
 * Before: (a: string: b: number) =>
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

/**
 * Pattern to fix colon chains in interface definitions
 * Before: interface Foo { a: string: b: number }
 * After:  interface Foo { a: string; b: number }
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
 * Before: type Foo = { a: string: b: number }
 * After:  type Foo = { a: string; b: number }
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
 * Before: ): { a: Type: b: Type }
 * After:  ): { a: Type; b: Type }
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
 * Before: Promise<{ a: Type: b: Type }>
 * After:  Promise<{ a: Type; b: Type }>
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

/**
 * Pattern to fix simple value: value: value chains (likely corrupted imports)
 * Before: import { A: B: C } from
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

/**
 * Pattern to fix longer import colon chains
 * Before: import { A: B: C: D } from
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
 * Get all colon-chain fix patterns in priority order
 */
export function getColonChainPatterns(): PatternMatcher[] {
  return [
    importLongColonChainPattern,
    importColonChainPattern,
    tripleColonChainPattern,
    doubleColonChainPattern,
    typeAnnotationColonChainPattern,
    functionParamColonChainPattern,
    arrowFunctionColonChainPattern,
    interfaceColonChainPattern,
    typeDefColonChainPattern,
    destructuringColonChainPattern,
    returnTypeColonChainPattern,
    genericColonChainPattern,
  ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/**
 * Apply colon-chain fixes to content with multiple passes
 * This function runs multiple passes to handle cascading fixes
 */
export function fixColonChains(content: string, maxPasses: number = 5): { result: string; fixCount: number; passes: number } {
  let result = content;
  let totalFixes = 0;
  let passCount = 0;

  for (let pass = 0; pass < maxPasses; pass++) {
    let passFixes = 0;
    passCount++;

    for (const pattern of getColonChainPatterns()) {
      const matches = result.match(pattern.pattern);
      if (matches) {
        passFixes += matches.length;
        if (typeof pattern.replacement === 'function') {
          result = result.replace(pattern.pattern, pattern.replacement);
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

  return { result, fixCount: totalFixes, passes: passCount };
}
