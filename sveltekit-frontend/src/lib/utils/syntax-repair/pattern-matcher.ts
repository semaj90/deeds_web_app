/**
 * Pattern Matcher Engine for TypeScript Syntax Repair
 *
 * This module provides the core pattern matching infrastructure for identifying
 * and fixing corrupted TypeScript syntax patterns.
 */

/**
 * Represents a single pattern matcher that can identify and fix a specific
 * type of syntax corruption.
 */
export interface PatternMatcher {
  /** Unique identifier for this pattern */
  name: string;
  /** Human-readable description of what this pattern fixes */
  description: string;
  /** The regex pattern to match corrupted syntax */
  pattern: RegExp;
  /** The replacement string or function to fix the corruption */
  replacement: string | ReplacementFunction;
  /** Optional validation function to verify the fix is correct */
  validate?: (before: string, after: string) => boolean;
  /** Priority order for applying this pattern (lower = earlier) */
  priority?: number;
  /** Optional file filter to apply pattern only to matching files */
  fileFilter?: (path: string) => boolean;
}

/**
 * FixPattern interface as defined in the design document.
 * This is an alias for PatternMatcher with the design doc's naming convention.
 *
 * @requirements 1.5
 */
export interface FixPattern {
  /** Unique identifier for this pattern */
  name: string;
  /** The regex pattern to match corrupted syntax */
  regex: RegExp;
  /** The replacement string or function to fix the corruption */
  replacement: string | ((match: string, ...groups: string[]) => string);
  /** Optional file filter to apply pattern only to matching files */
  fileFilter?: (path: string) => boolean;
}

/**
 * Function type for dynamic replacements that need access to capture groups
 */
export type ReplacementFunction = (match: string, ...groups: string[]) => string;

/**
 * Result of applying a pattern to content
 */
export interface PatternMatchResult {
  /** The pattern that was applied */
  patternName: string;
  /** Number of matches found */
  matchCount: number;
  /** Whether the pattern was successfully applied */
  success: boolean;
  /** The content before transformation */
  contentBefore: string;
  /** The content after transformation */
  contentAfter: string;
  /** Any error that occurred during processing */
  error?: string;
}

/**
 * Result of applying a fix to a file
 */
export interface FixResult {
  /** Path to the file that was processed */
  file: string;
  /** Name of the pattern that was applied */
  pattern: string;
  /** Number of matches found and fixed */
  matchCount: number;
  /** Whether the fix was successful */
  success: boolean;
  /** Number of TypeScript errors before the fix */
  errorsBefore: number;
  /** Number of TypeScript errors after the fix */
  errorsAfter: number;
  /** Any error message if the fix failed */
  error?: string;
}

/**
 * Registry for storing and retrieving pattern matchers
 */
class PatternRegistry {
  private patterns: Map<string, PatternMatcher> = new Map();

  /**
   * Register a new pattern matcher
   */
  register(pattern: PatternMatcher): void {
    if (this.patterns.has(pattern.name)) {
      console.warn(`Pattern "${pattern.name}" already registered, overwriting.`);
    }
    this.patterns.set(pattern.name, pattern);
  }

  /**
   * Get a pattern by name
   */
  get(name: string): PatternMatcher | undefined {
    return this.patterns.get(name);
  }

  /**
   * Get all registered patterns, sorted by priority
   */
  getAll(): PatternMatcher[] {
    return Array.from(this.patterns.values()).sort(
      (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
    );
  }

  /**
   * Check if a pattern is registered
   */
  has(name: string): boolean {
    return this.patterns.has(name);
  }

  /**
   * Remove a pattern from the registry
   */
  unregister(name: string): boolean {
    return this.patterns.delete(name);
  }

  /**
   * Clear all registered patterns
   */
  clear(): void {
    this.patterns.clear();
  }

  /**
   * Get the count of registered patterns
   */
  get size(): number {
    return this.patterns.size;
  }
}

// Global pattern registry instance
export const patternRegistry = new PatternRegistry();

/**
 * Validates that a transformation was successful by checking the before/after content
 */
export function validateTransformation(
  pattern: PatternMatcher,
  before: string,
  after: string
): boolean {
  // If pattern has custom validation, use it
  if (pattern.validate) {
    return pattern.validate(before, after);
  }

  // Default validation: content changed and no pattern matches remain
  if (before === after) {
    return true; // No change needed is valid
  }

  // Check that the pattern no longer matches (fix was complete)
  const remainingMatches = after.match(pattern.pattern);
  return remainingMatches === null || remainingMatches.length === 0;
}

/**
 * Apply a single pattern to content and return the result
 */
export function applyPattern(content: string, pattern: PatternMatcher): PatternMatchResult {
  try {
    // Count matches before replacement
    const matches = content.match(pattern.pattern);
    const matchCount = matches?.length ?? 0;

    if (matchCount === 0) {
      return {
        patternName: pattern.name,
        matchCount: 0,
        success: true,
        contentBefore: content,
        contentAfter: content,
      };
    }

    // Apply the replacement
    let result: string;
    if (typeof pattern.replacement === 'function') {
      result = content.replace(pattern.pattern, pattern.replacement as ReplacementFunction);
    } else {
      result = content.replace(pattern.pattern, pattern.replacement);
    }

    // Validate the transformation
    const isValid = validateTransformation(pattern, content, result);

    return {
      patternName: pattern.name,
      matchCount,
      success: isValid,
      contentBefore: content,
      contentAfter: result,
      error: isValid ? undefined : 'Validation failed after transformation',
    };
  } catch (error) {
    return {
      patternName: pattern.name,
      matchCount: 0,
      success: false,
      contentBefore: content,
      contentAfter: content,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Apply multiple patterns to content in sequence
 */
export function applyPatterns(
  content: string,
  patterns: PatternMatcher[]
): {
	content: string, results: PatternMatchResult[] } {
  let currentContent = content;
  const results: PatternMatchResult[] = [];

  for (const pattern of patterns) {
    const result = applyPattern(currentContent, pattern);
    results.push(result);

    if (result.success) {
      currentContent = result.contentAfter;
    }
  }

  return { content: currentContent, results };
}

/**
 * Execute pattern matching with capture group support
 * This is a lower-level function for complex pattern operations
 */
export function executePattern(
  content: string,
  pattern: RegExp,
  replacement: string | ReplacementFunction
): {
	result: string, matchCount: number } {
  // Ensure the pattern has the global flag for counting
  const globalPattern = pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + 'g');

  const matches = content.match(globalPattern);
  const matchCount = matches?.length ?? 0;

  let result: string;
  if (typeof replacement === 'function') {
    result = content.replace(globalPattern, replacement);
  } else {
    result = content.replace(globalPattern, replacement);
  }

  return { result, matchCount };
}

/**
 * Create a pattern matcher with default values
 *
 * @requirements 1.5
 */
export function createPattern(
  name: string,
  description: string,
  pattern: RegExp,
  replacement: string | ReplacementFunction,
  options?: {
    validate?: (before: string, after: string) => boolean;
    priority?: number;
    fileFilter?: (path: string) => boolean;
  }
): PatternMatcher {
  return {
    name,
    description,
    pattern,
    replacement,
    validate: options?.validate,
    priority: options?.priority ?? 100,
    fileFilter: options?.fileFilter,
  };
}

/**
 * Convert a FixPattern (design doc interface) to PatternMatcher (internal interface)
 *
 * @requirements 1.5
 */
export function fixPatternToMatcher(fixPattern: FixPattern, description?: string): PatternMatcher {
  return {
    name: fixPattern.name,
    description: description ?? `Fix pattern: ${fixPattern.name}`,
    pattern: fixPattern.regex,
    replacement: fixPattern.replacement,
    fileFilter: fixPattern.fileFilter,
    priority: 100,
  };
}

/**
 * Convert a PatternMatcher to FixPattern (design doc interface)
 *
 * @requirements 1.5
 */
export function matcherToFixPattern(matcher: PatternMatcher): FixPattern {
  return {
    name: matcher.name,
    regex: matcher.pattern,
    replacement: matcher.replacement,
    fileFilter: matcher.fileFilter,
  };
}

/**
 * Create a FixPattern directly (matches design doc interface)
 *
 * @requirements 1.5
 */
export function createFixPattern(
  name: string, regex: RegExp,
  replacement: string | ((match: string, ...groups: string[]) => string),
  fileFilter?: (path: string) => boolean
): FixPattern {
  return {
    name,
    regex,
    replacement,
    fileFilter,
  };
}
