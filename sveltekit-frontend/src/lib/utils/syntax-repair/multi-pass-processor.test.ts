/**
 * Unit tests for Multi-Pass Syntax Repair Processor
 *
 * Tests the FixPattern interface, pattern registry, and multi-pass processing.
 *
 * @requirements 1.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  type FixPattern,
  type PatternMatcher,
  createPattern,
  createFixPattern,
  fixPatternToMatcher,
  matcherToFixPattern,
  patternRegistry,
  applyPattern,
  applyPatterns,
} from './pattern-matcher';
import {
  type ErrorRemediationConfig,
  type RemediationResult,
  type MultiPassConfig,
  type MultiPassResult,
  defaultMultiPassConfig,
} from './multi-pass-processor';
import { getAllPatterns, getPatternsByCategory, type PatternCategory } from './patterns';

describe('FixPattern Interface', () => {
  it('should create a valid FixPattern with required fields', () => {
    const pattern: FixPattern = {
      name: 'test-pattern',
      regex: /test/g,
      replacement: 'replacement',
    };

    expect(pattern.name).toBe('test-pattern');
    expect(pattern.regex).toBeInstanceOf(RegExp);
    expect(pattern.replacement).toBe('replacement');
    expect(pattern.fileFilter).toBeUndefined();
  });

  it('should create a FixPattern with optional fileFilter', () => {
    const pattern: FixPattern = {
      name: 'svelte-only-pattern',
      regex: /on:click/g,
      replacement: 'onclick',
      fileFilter: (path: string) => path.endsWith('.svelte'),
    };

    expect(pattern.fileFilter).toBeDefined();
    expect(pattern.fileFilter!('component.svelte')).toBe(true);
    expect(pattern.fileFilter!('utils.ts')).toBe(false);
  });

  it('should support function replacement in FixPattern', () => {
    const pattern: FixPattern = {
      name: 'dynamic-replacement',
      regex: /(\w+):\s*(\w+):\s*(\w+)/g,
      replacement: (match: string, key1: string, val1: string, key2: string) => {
        return `${key1}: ${val1}, ${key2}`;
      },
    };

    const testContent = 'prop: value: next';
    const result = testContent.replace(pattern.regex, pattern.replacement as any);
    expect(result).toBe('prop: value, next');
  });
});

describe('createFixPattern helper', () => {
  it('should create a FixPattern with minimal arguments', () => {
    const pattern = createFixPattern('simple-fix', /error/g, 'fixed');

    expect(pattern.name).toBe('simple-fix');
    expect(pattern.regex.source).toBe('error');
    expect(pattern.replacement).toBe('fixed');
    expect(pattern.fileFilter).toBeUndefined();
  });

  it('should create a FixPattern with fileFilter', () => {
    const filter = (path: string) => path.includes('components');
    const pattern = createFixPattern('component-fix', /old/g, 'new', filter);

    expect(pattern.fileFilter).toBe(filter);
    expect(pattern.fileFilter!('src/components/Button.svelte')).toBe(true);
    expect(pattern.fileFilter!('src/utils/helpers.ts')).toBe(false);
  });
});

describe('Pattern conversion functions', () => {
  it('should convert FixPattern to PatternMatcher', () => {
    const fixPattern: FixPattern = {
      name: 'test-fix',
      regex: /test/g,
      replacement: 'fixed',
      fileFilter: (path) => path.endsWith('.ts'),
    };

    const matcher = fixPatternToMatcher(fixPattern, 'Test description');

    expect(matcher.name).toBe('test-fix');
    expect(matcher.description).toBe('Test description');
    expect(matcher.pattern).toBe(fixPattern.regex);
    expect(matcher.replacement).toBe('fixed');
    expect(matcher.fileFilter).toBe(fixPattern.fileFilter);
    expect(matcher.priority).toBe(100);
  });

  it('should convert PatternMatcher to FixPattern', () => {
    const matcher: PatternMatcher = {
      name: 'test-matcher',
      description: 'A test matcher',
      pattern: /pattern/g,
      replacement: 'replaced',
      priority: 50,
      fileFilter: (path) => path.endsWith('.svelte'),
    };

    const fixPattern = matcherToFixPattern(matcher);

    expect(fixPattern.name).toBe('test-matcher');
    expect(fixPattern.regex).toBe(matcher.pattern);
    expect(fixPattern.replacement).toBe('replaced');
    expect(fixPattern.fileFilter).toBe(matcher.fileFilter);
  });
});

describe('PatternRegistry', () => {
  beforeEach(() => {
    patternRegistry.clear();
  });

  it('should register and retrieve patterns', () => {
    const pattern = createPattern(
      'registry-test',
      'Test pattern for registry',
      /test/g,
      'fixed'
    );

    patternRegistry.register(pattern);

    expect(patternRegistry.has('registry-test')).toBe(true);
    expect(patternRegistry.get('registry-test')).toBe(pattern);
    expect(patternRegistry.size).toBe(1);
  });

  it('should return patterns sorted by priority', () => {
    const lowPriority = createPattern('low', 'Low priority', /low/g, 'l', { priority: 100 });
    const highPriority = createPattern('high', 'High priority', /high/g, 'h', { priority: 1 });
    const medPriority = createPattern('med', 'Medium priority', /med/g, 'm', { priority: 50 });

    patternRegistry.register(lowPriority);
    patternRegistry.register(highPriority);
    patternRegistry.register(medPriority);

    const all = patternRegistry.getAll();

    expect(all[0].name).toBe('high');
    expect(all[1].name).toBe('med');
    expect(all[2].name).toBe('low');
  });

  it('should unregister patterns', () => {
    const pattern = createPattern('to-remove', 'Will be removed', /remove/g, '');

    patternRegistry.register(pattern);
    expect(patternRegistry.has('to-remove')).toBe(true);

    patternRegistry.unregister('to-remove');
    expect(patternRegistry.has('to-remove')).toBe(false);
  });
});

describe('Pattern application', () => {
  it('should apply a single pattern to content', () => {
    const pattern = createPattern(
      'colon-fix',
      'Fix colon chains',
      /(\w+):\s*(\w+):\s*(\w+)/g,
      '$1: $2, $3'
    );

    const content = 'const obj = { key: value: next }';
    const result = applyPattern(content, pattern);

    expect(result.success).toBe(true);
    expect(result.matchCount).toBe(1);
    expect(result.contentAfter).toBe('const obj = { key: value, next }');
  });

  it('should apply multiple patterns in sequence', () => {
    const patterns = [
      createPattern('fix-a', 'Fix A', /AAA/g, 'A'),
      createPattern('fix-b', 'Fix B', /BBB/g, 'B'),
    ];

    const content = 'AAA and BBB';
    const { content: result, results } = applyPatterns(content, patterns);

    expect(result).toBe('A and B');
    expect(results).toHaveLength(2);
    expect(results[0].matchCount).toBe(1);
    expect(results[1].matchCount).toBe(1);
  });

  it('should handle patterns with no matches', () => {
    const pattern = createPattern('no-match', 'No matches', /xyz/g, 'abc');

    const content = 'This content has no matches';
    const result = applyPattern(content, pattern);

    expect(result.success).toBe(true);
    expect(result.matchCount).toBe(0);
    expect(result.contentAfter).toBe(content);
  });

  it('should apply function replacements correctly', () => {
    const pattern = createPattern(
      'uppercase-fix',
      'Convert to uppercase',
      /\[(\w+)\]/g,
      (match: string, word: string) => `[${word.toUpperCase()}]`
    );

    const content = 'Hello [world] and [test]';
    const result = applyPattern(content, pattern);

    expect(result.contentAfter).toBe('Hello [WORLD] and [TEST]');
    expect(result.matchCount).toBe(2);
  });
});

describe('Pattern categories', () => {
  it('should return all patterns from getAllPatterns', () => {
    const patterns = getAllPatterns();

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.every(p => p.name && p.pattern && p.replacement !== undefined)).toBe(true);
  });

  it('should group patterns by category', () => {
    const categories = getPatternsByCategory();

    expect(categories.size).toBeGreaterThan(0);
    expect(categories.has('colon-chain')).toBe(true);
    expect(categories.has('bits-ui-migration')).toBe(true);
    expect(categories.has('a11y-label')).toBe(true);
  });

  it('should have patterns sorted by priority within categories', () => {
    const categories = getPatternsByCategory();

    for (const [category, patterns] of categories) {
      for (let i = 1; i < patterns.length; i++) {
        const prevPriority = patterns[i - 1].priority ?? 100;
        const currPriority = patterns[i].priority ?? 100;
        expect(currPriority).toBeGreaterThanOrEqual(prevPriority);
      }
    }
  });
});

describe('ErrorRemediationConfig interface', () => {
  it('should define valid configuration structure', () => {
    const config: ErrorRemediationConfig = {
      targetDirectory: 'src',
      maxPasses: 5,
      dryRun: true,
      patterns: [
        {
          name: 'test-pattern',
          regex: /test/g,
          replacement: 'fixed',
        },
      ],
    };

    expect(config.targetDirectory).toBe('src');
    expect(config.maxPasses).toBe(5);
    expect(config.dryRun).toBe(true);
    expect(config.patterns).toHaveLength(1);
  });
});

describe('RemediationResult interface', () => {
  it('should define valid result structure', () => {
    const result: RemediationResult = {
      filesProcessed: 100,
      filesModified: 25,
      fixesApplied: 150,
      errorsRemaining: 50,
      unfixableFiles: ['file1.ts', 'file2.svelte'],
    };

    expect(result.filesProcessed).toBe(100);
    expect(result.filesModified).toBe(25);
    expect(result.fixesApplied).toBe(150);
    expect(result.errorsRemaining).toBe(50);
    expect(result.unfixableFiles).toHaveLength(2);
  });
});

describe('MultiPassConfig defaults', () => {
  it('should have sensible default values', () => {
    expect(defaultMultiPassConfig.maxPasses).toBe(5);
    expect(defaultMultiPassConfig.stopOnNoFixes).toBe(true);
    expect(defaultMultiPassConfig.validateAfterPass).toBe(false);
    expect(defaultMultiPassConfig.createBackups).toBe(true);
    expect(defaultMultiPassConfig.dryRun).toBe(false);
    expect(defaultMultiPassConfig.verbose).toBe(false);
  });
});

describe('File filter functionality', () => {
  it('should filter patterns based on file path', () => {
    const svelteOnlyPattern = createPattern(
      'svelte-only',
      'Only for Svelte files',
      /on:click/g,
      'onclick',
      {
        fileFilter: (path) => path.endsWith('.svelte'),
      }
    );

    expect(svelteOnlyPattern.fileFilter).toBeDefined();
    expect(svelteOnlyPattern.fileFilter!('Button.svelte')).toBe(true);
    expect(svelteOnlyPattern.fileFilter!('utils.ts')).toBe(false);
  });

  it('should filter patterns for TypeScript files only', () => {
    const tsOnlyPattern = createPattern(
      'ts-only',
      'Only for TypeScript files',
      /import type/g,
      'import { type',
      {
        fileFilter: (path) => path.endsWith('.ts') && !path.endsWith('.svelte'),
      }
    );

    expect(tsOnlyPattern.fileFilter!('service.ts')).toBe(true);
    expect(tsOnlyPattern.fileFilter!('Component.svelte')).toBe(false);
  });
});
