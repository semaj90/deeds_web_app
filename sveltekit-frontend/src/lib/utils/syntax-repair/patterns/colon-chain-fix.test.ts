/**
 * Unit tests for Colon-Chain Corruption Fix Pattern
 *
 * Tests the detection and repair of colon-chain corruption patterns
 * including nested object literals and edge cases.
 *
 * @requirements 1.5
 */

import { describe, it, expect } from 'vitest';
import {
  getColonChainPatterns,
  fixColonChains,
  detectColonChainCorruption,
  validateNoColonChainCorruption,
  tripleColonChainPattern,
  doubleColonChainPattern,
  nestedObjectColonChainPattern,
  innerBraceColonChainPattern,
  importColonChainPattern,
  typeAnnotationColonChainPattern,
  stringValueColonChainPattern,
  numericValueColonChainPattern,
  booleanValueColonChainPattern,
} from './colon-chain-fix';

describe('Colon-Chain Fix Patterns', () => {
  describe('getColonChainPatterns', () => {
    it('should return all colon-chain patterns', () => {
      const patterns = getColonChainPatterns();
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every((p) => p.name && p.pattern && p.replacement !== undefined)).toBe(true);
    });

    it('should return patterns sorted by priority', () => {
      const patterns = getColonChainPatterns();
      for (let i = 1; i < patterns.length; i++) {
        const prevPriority = patterns[i - 1].priority ?? 100;
        const currPriority = patterns[i].priority ?? 100;
        expect(currPriority).toBeGreaterThanOrEqual(prevPriority);
      }
    });
  });

  describe('Basic colon-chain corruption fixes', () => {
    it('should fix triple colon chain: {
	key: value, next: prop }', () => {
      const input = '{ key: value:
	next: prop }';
      const { result } = fixColonChains(input);
      expect(result).toBe('{ key: value, next: prop }');
    });

    it('should fix simple colon chain: {
	a: b: c: d }', () => {
      const input = '{ a: b:
	c: d }';
      const { result } = fixColonChains(input);
      expect(result).toBe('{ a: b, c: d }');
    });

    it('should fix double colon chain: {
	key: value, next }', () => {
      const input = '{ key: value, next }';
      const { result } = fixColonChains(input);
      expect(result).toBe('{ key: value, next }');
    });
  });

  describe('Nested object literal fixes', () => {
    it('should fix nested colon chain: {
	outer: { inner: value, next } }', () => {
      const input = '{ outer: {
	inner: value, next } }';
      const { result } = fixColonChains(input);
      expect(result).toBe('{ outer: {
	inner: value, next } }');
    });

    it('should fix deeply nested colon chain', () => {
      const input = '{ a: {
	b: { c: d: e } } }';
      const { result } = fixColonChains(input);
      expect(result).toBe('{ a: {
	b: { c: d, e } } }');
    });

    it('should fix inner brace colon chain', () => {
      const input = '{ inner: value, next }';
      const { result } = fixColonChains(input);
      expect(result).toBe('{ inner: value, next }');
    });
  });

  describe('Import statement fixes', () => {
    it('should fix import colon chain: import { A, B, C }', () => {
      const input = "import { A, B, C } from 'module'";
      const { result } = fixColonChains(input);
      expect(result).toBe("import { A, B, C } from 'module'");
    });

    it('should fix longer import colon chain: import { A: B:
	C: D }', () => {
      const input = "import { A: B:
	C: D } from 'module'";
      const { result } = fixColonChains(input);
      expect(result).toBe("import { A, B, C, D } from 'module'");
    });
  });

  describe('Type annotation fixes', () => {
    it('should fix type annotation colon chain', () => {
      const input = 'param: String:
	another: Number';
      const { result } = fixColonChains(input);
      expect(result).toBe('param: String, another: Number');
    });

    it('should fix function parameter colon chain', () => {
      const input = 'function foo(a: String:
	b: Number) {}';
      const { result } = fixColonChains(input);
      expect(result).toBe('function foo(a: String, b: Number) {}');
    });

    it('should fix arrow function parameter colon chain', () => {
      const input = '(a: String:
	b: Number) => {}';
      const { result } = fixColonChains(input);
      expect(result).toBe('(a: String, b: Number) => {}');
    });
  });

  describe('Value type fixes', () => {
    it('should fix string value colon chain', () => {
      const input = '{ key: "value":
	next: "prop" }';
      const { result } = fixColonChains(input);
      expect(result).toBe('{ key: "value", next: "prop" }');
    });

    it('should fix numeric value colon chain', () => {
      const input = '{ key: 123:
	next: 456 }';
      const { result } = fixColonChains(input);
      expect(result).toBe('{ key: 123, next: 456 }');
    });

    it('should fix boolean value colon chain', () => {
      const input = '{ key: true:
	next: false }';
      const { result } = fixColonChains(input);
      expect(result).toBe('{ key: true, next: false }');
    });

    it('should fix nullish value colon chain', () => {
      const input = '{ key: null:
	next: undefined }';
      const { result } = fixColonChains(input);
      expect(result).toBe('{ key: null, next: undefined }');
    });
  });

  describe('Multi-pass repair', () => {
    it('should apply multiple passes for cascading fixes', () => {
      // This input has multiple corruption patterns that may need multiple passes
      const input = '{ a: b:
	c: d: e: f }';
      const { result, passes } = fixColonChains(input);
      // Should fix to proper object literal format
      expect(result).not.toContain(': :');
      expect(passes).toBeGreaterThanOrEqual(1);
    });

    it('should stop when no more fixes are found', () => {
      const input = '{ key: value }'; // Already valid
      const { result, fixCount, passes } = fixColonChains(input);
      expect(result).toBe('{ key: value }');
      expect(fixCount).toBe(0);
      expect(passes).toBe(1);
    });

    it('should track fixes by pattern name', () => {
      const input = '{ a: b:
	c: d }';
      const { fixesByPattern } = fixColonChains(input);
      expect(Object.keys(fixesByPattern).length).toBeGreaterThan(0);
    });
  });

  describe('Detection functions', () => {
    it('should detect colon-chain corruption', () => {
      const input = '{ key: value:
	next: prop }';
      const detection = detectColonChainCorruption(input);
      expect(detection.hasCorruption).toBe(true);
      expect(detection.totalMatches).toBeGreaterThan(0);
    });

    it('should not detect corruption in valid code', () => {
      const input = '{ key: value, next: prop }';
      const detection = detectColonChainCorruption(input);
      expect(detection.hasCorruption).toBe(false);
      expect(detection.totalMatches).toBe(0);
    });

    it('should validate no corruption after fix', () => {
      const input = '{ key: value:
	next: prop }';
      const { result } = fixColonChains(input);
      expect(validateNoColonChainCorruption(result)).toBe(true);
    });
  });

  describe('Individual pattern tests', () => {
    it('tripleColonChainPattern should match triple colon chains', () => {
      const input = 'key: value:
	next: prop';
      const matches = input.match(tripleColonChainPattern.pattern);
      expect(matches).not.toBeNull();
      expect(matches?.length).toBe(1);
    });

    it('doubleColonChainPattern should match double colon chains', () => {
      const input = 'key: value, next';
      const matches = input.match(doubleColonChainPattern.pattern);
      expect(matches).not.toBeNull();
    });

    it('nestedObjectColonChainPattern should match nested patterns', () => {
      const input = '{ outer: {
	inner: value, next } }';
      const matches = input.match(nestedObjectColonChainPattern.pattern);
      expect(matches).not.toBeNull();
    });

    it('innerBraceColonChainPattern should match inner brace patterns', () => {
      const input = '{ inner: value, next }';
      const matches = input.match(innerBraceColonChainPattern.pattern);
      expect(matches).not.toBeNull();
    });

    it('importColonChainPattern should match import patterns', () => {
      const input = 'import { A, B, C }';
      const matches = input.match(importColonChainPattern.pattern);
      expect(matches).not.toBeNull();
    });

    it('typeAnnotationColonChainPattern should match type annotations', () => {
      const input = 'param: Type:
	another: Type';
      const matches = input.match(typeAnnotationColonChainPattern.pattern);
      expect(matches).not.toBeNull();
    });

    it('stringValueColonChainPattern should match string values', () => {
      const input = 'key: "value":
	next: "prop"';
      const matches = input.match(stringValueColonChainPattern.pattern);
      expect(matches).not.toBeNull();
    });

    it('numericValueColonChainPattern should match numeric values', () => {
      const input = 'key: 123:
	next: 456';
      const matches = input.match(numericValueColonChainPattern.pattern);
      expect(matches).not.toBeNull();
    });

    it('booleanValueColonChainPattern should match boolean values', () => {
      const input = 'key: true:
	next: false';
      const matches = input.match(booleanValueColonChainPattern.pattern);
      expect(matches).not.toBeNull();
    });
  });

  describe('Real-world examples', () => {
    it('should fix corrupted Svelte component props', () => {
      const input = `const props = {
        title: "Hello":
	description: "World"
      }`;
      const { result } = fixColonChains(input);
      expect(result).toContain('title: "Hello", description: "World"');
    });

    it('should fix corrupted TypeScript interface', () => {
      const input = 'interface Props { name: String:
	age: Number }';
      const { result } = fixColonChains(input);
      // Note: The general pattern fixes to comma, which is also valid TypeScript
      // The interface-specific pattern would use semicolons but has lower priority
      expect(result).toBe('interface Props { name: String, age: Number }');
    });

    it('should fix corrupted type definition', () => {
      const input = 'type Config = { host: String:
	port: Number }';
      const { result } = fixColonChains(input);
      // Note: The general pattern fixes to comma, which is also valid TypeScript
      // The type-specific pattern would use semicolons but has lower priority
      expect(result).toBe('type Config = { host: String, port: Number }');
    });

    it('should fix corrupted object destructuring', () => {
      const input = 'const { a: b: c } = obj';
      const { result } = fixColonChains(input);
      expect(result).toBe('const { a: b, c } = obj');
    });

    it('should handle multiple corruptions in one file', () => {
      const input = `
        const obj1 = { a: b:
	c: d };
        const obj2 = { x: y: z };
        import { A, B, C } from 'module';
      `;
      const { result, fixCount } = fixColonChains(input);
      expect(fixCount).toBeGreaterThan(0);
      expect(result).not.toMatch(/\w+:\s*\w+:\s*\w+:\s*\w+/);
    });
  });

  describe('Edge cases', () => {
    it('should not break valid ternary operators', () => {
      const input = 'const x = condition ? value1 : value2';
      const { result } = fixColonChains(input);
      expect(result).toBe(input);
    });

    it('should not break valid object literals', () => {
      const input = '{ key: value, another: prop }';
      const { result } = fixColonChains(input);
      expect(result).toBe(input);
    });

    it('should not break valid type annotations', () => {
      const input = 'function foo(a: string, b: number): void {}';
      const { result } = fixColonChains(input);
      expect(result).toBe(input);
    });

    it('should handle empty content', () => {
      const input = '';
      const { result, fixCount } = fixColonChains(input);
      expect(result).toBe('');
      expect(fixCount).toBe(0);
    });

    it('should handle content with no corruption', () => {
      const input = 'const x = 1; const y = 2;';
      const { result, fixCount } = fixColonChains(input);
      expect(result).toBe(input);
      expect(fixCount).toBe(0);
    });
  });
});
