/**
 * Function Call Argument Syntax Fix Pattern
 *
 * Fixes corrupted function call arguments where colons appear between arguments.
 *
 * Before: eq(auditLog.resourceType, filter.resourceType)
 * After:  eq(auditLog.resourceType, filter.resourceType)
 */

import { createPattern, type PatternMatcher } from '../pattern-matcher';

/**
 * Pattern to fix simple function calls with colon-separated arguments
 * Handles: fn(arg1: arg2) → fn(arg1, arg2)
 */
export const simpleFunctionCallPattern: PatternMatcher = createPattern(
  'simple-function-call',
  'Fix colon-separated arguments in simple function calls',
  /(\w+)\(([^()]+?):\s*([^()]+?)\)/g,
  (match, funcName, arg1, arg2) => {
    // Don't fix if this looks like a type annotation (arg: Type)
    if (isTypeAnnotation(arg1, arg2)) {
      return match;
    }
    return `${funcName}(${arg1.trim()},
	${arg2.trim()})`;
  },
	{
    priority: 30,
  }
);

/**
 * Pattern to fix method calls with colon-separated arguments
 * Handles: obj.method(arg1: arg2) → obj.method(arg1, arg2)
 */
export const methodCallPattern: PatternMatcher = createPattern(
  'method-call-fix',
  'Fix colon-separated arguments in method calls',
  /\.(\w+)\(([^()]+?):\s*([^()]+?)\)/g,
  (match, methodName, arg1, arg2) => {
    if (isTypeAnnotation(arg1, arg2)) {
      return match;
    }
    return `.${methodName}(${arg1.trim()},
	${arg2.trim()})`;
  },
	{
    priority: 32,
  }
);

/**
 * Pattern to fix Drizzle ORM eq() calls specifically
 * These are very common in the codebase
 */
export const drizzleEqPattern: PatternMatcher = createPattern(
  'drizzle-eq-fix',
  'Fix Drizzle ORM eq() function calls',
  /eq\((\w+(?:\.\w+)*):\s*(\w+(?:\.\w+)*)\)/g,
  'eq($1, $2)',
  {
    priority: 25,
  }
);

/**
 * Pattern to fix Drizzle ORM and() calls
 */
export const drizzleAndPattern: PatternMatcher = createPattern(
  'drizzle-and-fix',
  'Fix Drizzle ORM and() function calls',
  /and\(([^()]+?):\s*([^()]+?)\)/g,
  (match, arg1, arg2) => {
    if (isTypeAnnotation(arg1, arg2)) {
      return match;
    }
    return `and(${arg1.trim()},
	${arg2.trim()})`;
  },
	{
    priority: 26,
  }
);

/**
 * Pattern to fix Drizzle ORM or() calls
 */
export const drizzleOrPattern: PatternMatcher = createPattern(
  'drizzle-or-fix',
  'Fix Drizzle ORM or() function calls',
  /or\(([^()]+?):\s*([^()]+?)\)/g,
  (match, arg1, arg2) => {
    if (isTypeAnnotation(arg1, arg2)) {
      return match;
    }
    return `or(${arg1.trim()},
	${arg2.trim()})`;
  },
	{
    priority: 27,
  }
);

/**
 * Pattern to fix nested function calls
 * Handles: outer(inner(a: b): c) → outer(inner(a, b), c)
 */
export const nestedCallPattern: PatternMatcher = createPattern(
  'nested-call-fix',
  'Fix nested function calls with corrupted arguments',
  /(\w+)\((\w+)\(([^()]+?):\s*([^()]+?)\):\s*([^()]+?)\)/g,
  (match, outer, inner, arg1, arg2, arg3) => {
    return `${outer}(${inner}(${arg1.trim()},
	${arg2.trim()}), ${arg3.trim()})`;
  },
	{
    priority: 35,
  }
);

/**
 * Pattern to fix chained method calls
 */
export const chainedCallPattern: PatternMatcher = createPattern(
  'chained-call-fix',
  'Fix chained method calls with corrupted arguments',
  /\.(\w+)\(([^()]+?)\)\.(\w+)\(([^()]+?):\s*([^()]+?)\)/g,
  (match, method1, args1, method2, arg2a, arg2b) => {
    return `.${method1}(${args1}).${method2}(${arg2a.trim()},
	${arg2b.trim()})`;
  },
	{
    priority: 38,
  }
);

/**
 * Check if the arguments look like a type annotation rather than corrupted call args
 */
function isTypeAnnotation(arg1: string, arg2: string): boolean {
  const trimmedArg1 = arg1.trim();
  const trimmedArg2 = arg2.trim();

  // If arg2 starts with uppercase, it's likely a type
  if (/^[A-Z]/.test(trimmedArg2)) {
    // But check if arg1 is a simple identifier (parameter name)
    if (/^[a-z_]\w*$/i.test(trimmedArg1)) {
      return true;
    }
  }

  // Common type patterns
  const typePatterns = [
    /^string$/,
    /^number$/,
    /^boolean$/,
    /^void$/,
    /^null$/,
    /^undefined$/,
    /^any$/,
    /^unknown$/,
    /^never$/,
    /^object$/,
    /^Array</,
    /^Record</,
    /^Map</,
    /^Set</,
    /^Promise</,
    /\[\]$/,
    /\|/,  // Union types
    /&/,   // Intersection types
  ];

  return typePatterns.some(pattern => pattern.test(trimmedArg2));
}

/**
 * Get all function call fix patterns in priority order
 */
export function getFunctionCallPatterns(): PatternMatcher[] {
  return [
    drizzleEqPattern,
    drizzleAndPattern,
    drizzleOrPattern,
    simpleFunctionCallPattern,
    methodCallPattern,
    nestedCallPattern,
    chainedCallPattern,
  ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/**
 * Apply function call fixes to content
 */
export function fixFunctionCalls(content: string): {
	result: string; fixCount: number } {
  let result = content;
  let totalFixes = 0;

  for (const pattern of getFunctionCallPatterns()) {
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
