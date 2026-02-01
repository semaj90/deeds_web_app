/**
 * Object Literal Type Syntax Fix Pattern
 *
 * Fixes corrupted object literal type annotations where commas appear instead of colons.
 *
 * Before: {
	document: CaseChunkDocument }
 * After: {
	document: CaseChunkDocument }
 */

import { createPattern, type PatternMatcher } from '../pattern-matcher';

/**
 * Pattern to fix property type annotations with comma instead of colon
 * Handles: property, TypeName → property: TypeName
 */
export const propertyTypePattern: PatternMatcher = createPattern(
  'property-type-fix',
  'Fix comma instead of colon in property type annotations',
  /(\w+),\s*([A-Z][a-zA-Z0-9_<>\[\]|&\s]*?)([;}\),])/g,
  '$1: $2$3',
  {
    priority: 40,
    validate: (before, after) => {
      // Ensure we didn't break valid comma-separated lists
      return !after.includes(', :');
    },
	}
);

/**
 * Pattern to fix return type object literals
 * Handles: ): {
	prop: Type } → ): {
	prop: Type }
 */
export const returnTypeObjectPattern: PatternMatcher = createPattern(
  'return-type-object-fix',
  'Fix return type object literal annotations',
  /\):\s*\{\s*(\w+),\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*)\s*\}/g,
  '): { $1: $2 }',
  {
    priority: 38,
  }
);

/**
 * Pattern to fix interface/type property definitions
 * Handles properties in interface definitions
 */
export const interfacePropertyPattern: PatternMatcher = createPattern(
  'interface-property-fix',
  'Fix interface property type annotations',
  /^\s*(\w+),\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*);?\s*$/gm,
  '  $1: $2;',
  {
    priority: 42,
  }
);

/**
 * Pattern to fix generic type parameters with corrupted syntax
 * Handles: Promise<{
	data: Type }> → Promise<{ data: Type }>
 */
export const genericTypeObjectPattern: PatternMatcher = createPattern(
  'generic-type-object-fix',
  'Fix object literals inside generic type parameters',
  /<\{\s*(\w+),\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*)\s*\}>/g,
  '<{ $1: $2 }>',
  {
    priority: 36,
  }
);

/**
 * Pattern to fix multiple properties in object type
 * Handles: {
	a: TypeA; b: TypeB } → { a: TypeA;
	b: TypeB }
 */
export const multiPropertyTypePattern: PatternMatcher = createPattern(
  'multi-property-type-fix',
  'Fix multiple properties in object type annotations',
  /\{\s*(\w+),\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*);\s*(\w+),\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*)\s*\}/g,
  '{ $1: $2; $3: $4 }',
  {
    priority: 34,
  }
);

/**
 * Pattern to fix variable declarations with object type
 * Handles: const, x: { prop: Type } = ... → const x: {
	prop: Type } = ...
 */
export const variableObjectTypePattern: PatternMatcher = createPattern(
  'variable-object-type-fix',
  'Fix variable declarations with object type annotations',
  /(const|let|var)\s+(\w+):\s*\{\s*(\w+),\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*)\s*\}/g,
  '$1 $2: { $3: $4 }',
  {
    priority: 37,
  }
);

/**
 * Pattern to fix function parameter object types
 * Handles: function foo({ prop: Type }: ...) → function foo({ prop: Type }: ...)
 */
export const paramObjectTypePattern: PatternMatcher = createPattern(
  'param-object-type-fix',
  'Fix function parameter object type annotations',
  /\(\{\s*(\w+),\s*([A-Z][a-zA-Z0-9_<>\[\]|&]*)\s*\}:/g,
  '({ $1: $2 }:',
  {
    priority: 35,
  }
);

/**
 * Get all object literal type fix patterns in priority order
 */
export function getObjectLiteralPatterns(): PatternMatcher[] {
  return [
    multiPropertyTypePattern,
    genericTypeObjectPattern,
    paramObjectTypePattern,
    variableObjectTypePattern,
    returnTypeObjectPattern,
    propertyTypePattern,
    interfacePropertyPattern,
  ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/**
 * Apply object literal type fixes to content
 */
export function fixObjectLiteralTypes(content: string): {
	result: string; fixCount: number } {
  let result = content;
  let totalFixes = 0;

  for (const pattern of getObjectLiteralPatterns()) {
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
