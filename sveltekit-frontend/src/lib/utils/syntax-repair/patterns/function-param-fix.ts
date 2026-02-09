/**
 * Function Parameter Syntax Fix Pattern
 *
 * Fixes corrupted function parameter lists where colons appear where commas should be.
 *
 * Before: function foo(resourceId: string: Record<string, unknown>)
 * After:  function foo(resourceId: string, data: Record<string, unknown>)
 */

import { createPattern, type PatternMatcher } from '../pattern-matcher';

/**
 * Pattern to fix parameter lists with double colons
 * Detects: param, Type: NextType and converts to param: Type, nextParam: NextType
 */
export const doubleColonParamPattern: PatternMatcher = createPattern(
  'double-colon-param',
  'Fix double colon in function parameters',
  /(\w+):\s*([\w<>\[\],\s|&]+?):\s*([A-Z][\w<>\[\],\s|&]*)/g,
  (match, param1, type1, type2) => {
    // Generate a parameter name based on the type
    const paramName = generateParamName(type2);
    return `${param1}: ${type1.trim()},
	${paramName}: ${type2}`;
  },
	{
    priority: 20,
  }
);

/**
 * Pattern to fix simple colon-separated parameters
 * Handles cases like: (a: b) in function calls that should be (a, b)
 */
export const simpleColonParamPattern: PatternMatcher = createPattern(
  'simple-colon-param',
  'Fix simple colon-separated parameters in function signatures',
  /\(([a-z_]\w*):\s*([a-z_]\w*)\s*:\s*([a-z_]\w*)\)/gi,
  '($1: $2, $3)',
  {
    priority: 25,
  }
);

/**
 * Pattern to fix async function parameters
 */
export const asyncFunctionParamPattern: PatternMatcher = createPattern(
  'async-function-param',
  'Fix corrupted async function parameters',
  /async\s+(\w+)\s*\(([^)]*?):\s*([A-Z][\w<>]*)\s*:\s*([A-Z][\w<>]*)/g,
  (match, funcName, params, type1, type2) => {
    const paramName = generateParamName(type2);
    return `async ${funcName}(${params}: ${type1},
	${paramName}: ${type2}`;
  },
	{
    priority: 15,
  }
);

/**
 * Pattern to fix arrow function parameters
 */
export const arrowFunctionParamPattern: PatternMatcher = createPattern(
  'arrow-function-param',
  'Fix corrupted arrow function parameters',
  /\(([^)]*?):\s*([\w<>\[\]|&\s]+?)\s*:\s*([\w<>\[\]|&]+)\s*\)\s*=>/g,
  (match, params, type1, type2) => {
    const paramName = generateParamName(type2);
    return `(${params}: ${type1.trim()},
	${paramName}: ${type2}) =>`;
  },
	{
    priority: 18,
  }
);

/**
 * Generate a reasonable parameter name from a type name
 */
function generateParamName(typeName: string): string {
  // Remove generic parameters
  const baseName = typeName.replace(/<.*>/, '').trim();

  // Common type to param name mappings
  const typeToParam: Record<string, string> = {
    'Record': 'data',
    'string': 'value',
    'number': 'num',
    'boolean': 'flag',
    'Array': 'items',
    'Promise': 'result',
    'Error': 'error',
    'Request': 'request',
    'Response': 'response',
    'Event': 'event',
    'Function': 'callback',
    'Object': 'obj',
    'Map': 'map',
    'Set': 'set',
  };

  if (typeToParam[baseName]) {
    return typeToParam[baseName];
  }

  // Convert PascalCase to camelCase
  if (baseName.length > 0) {
    return baseName.charAt(0).toLowerCase() + baseName.slice(1);
  }

  return 'param';
}

/**
 * Get all function parameter fix patterns in priority order
 */
export function getFunctionParamPatterns(): PatternMatcher[] {
  return [
    asyncFunctionParamPattern,
    arrowFunctionParamPattern,
    doubleColonParamPattern,
    simpleColonParamPattern,
  ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/**
 * Apply function parameter fixes to content
 */
export function fixFunctionParams(content: string): {
	result: string; fixCount: number } {
  let result = content;
  let totalFixes = 0;

  for (const pattern of getFunctionParamPatterns()) {
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
