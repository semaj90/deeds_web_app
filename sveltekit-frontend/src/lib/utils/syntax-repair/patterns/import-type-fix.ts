/**
 * Import Type Syntax Fix Pattern
 *
 * Fixes various import-related syntax issues:
 * 1. `import { type X }` → `import type { X }` (TypeScript 4.5+ syntax)
 * 2. `import { X, type Y }` → split into separate imports
 * 3. Fix corrupted `type,` syntax in imports
 * 4. Fix broken relative import paths
 * 5. Fix $lib alias imports
 *
 * @requirements 1.4
 */

import { createPattern, type PatternMatcher } from '../pattern-matcher';

// ============================================================================
// TYPE-ONLY IMPORT PATTERNS (TypeScript 4.5+ syntax)
// ============================================================================

/**
 * Pattern to convert `import { type X }` to `import type { X }`
 * This is the preferred TypeScript 4.5+ syntax for type-only imports
 *
 * Before: import { type SomeType } from './types';
 * After:  import type { SomeType } from './types';
 */
export const inlineTypeToTypeImportPattern: PatternMatcher = createPattern(
  'inline-type-to-type-import',
  'Convert import { type X } to import type { X }',
  /import\s*\{\s*type\s+([A-Z][a-zA-Z0-9_]*(?:\s*,\s*type\s+[A-Z][a-zA-Z0-9_]*)*)\s*\}\s*from\s*(['"][^'"]+['"])/g,
  (match: string, types: string, source: string): string => {
    // Extract all type names and clean them up
    const typeNames = types
      .split(',')
      .map((t) => t.replace(/^\s*type\s+/, '').trim())
      .filter((t) => t.length > 0);
    return `import type { ${typeNames.join(', ')} } from ${source}`;
  },
  {
    priority: 1,
    validate: (before, after) => {
      // Ensure we converted inline type imports to type-only imports
      return !after.match(/import\s*\{\s*type\s+[A-Z]/);
    },
  }
);

/**
 * Pattern to convert single `import { type X }` to `import type { X }`
 * Handles the simple case of a single type import
 *
 * Before: import { type Worker } from 'worker_threads';
 * After:  import type { Worker } from 'worker_threads';
 */
export const singleInlineTypeImportPattern: PatternMatcher = createPattern(
  'single-inline-type-import',
  'Convert single import { type X } to import type { X }',
  /import\s*\{\s*type\s+([A-Z][a-zA-Z0-9_]*)\s*\}\s*from\s*(['"][^'"]+['"])/g,
  'import type { $1 } from $2',
  {
    priority: 2,
  }
);

// ============================================================================
// MIXED IMPORT PATTERNS (value + type imports)
// ============================================================================

/**
 * Pattern to split mixed imports with value and type imports
 * This handles the case where we have both value and type imports in one statement
 *
 * Before: import { json, type RequestHandler } from '@sveltejs/kit';
 * After:  import { json } from '@sveltejs/kit';
 *         import type { RequestHandler } from '@sveltejs/kit';
 */
export const mixedImportSplitPattern: PatternMatcher = createPattern(
  'mixed-import-split',
  'Split mixed value and type imports into separate statements',
  /import\s*\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*)*)\s*,\s*type\s+([A-Z][a-zA-Z0-9_]*(?:\s*,\s*type\s+[A-Z][a-zA-Z0-9_]*)*)\s*\}\s*from\s*(['"][^'"]+['"])\s*;?/g,
  (match: string, values: string, types: string, source: string): string => {
    // Clean up value imports
    const valueNames = values
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && !v.startsWith('type '));

    // Clean up type imports
    const typeNames = types
      .split(',')
      .map((t) => t.replace(/^\s*type\s+/, '').trim())
      .filter((t) => t.length > 0);

    const valueImport = `import { ${valueNames.join(', ')} } from ${source};`;
    const typeImport = `import type { ${typeNames.join(', ')} } from ${source};`;

    return `${valueImport}\n${typeImport}`;
  },
  {
    priority: 3,
  }
);

/**
 * Pattern to handle type imports that appear before value imports
 *
 * Before: import { type RequestHandler, json } from '@sveltejs/kit';
 * After:  import { json } from '@sveltejs/kit';
 *         import type { RequestHandler } from '@sveltejs/kit';
 */
export const typeFirstMixedImportPattern: PatternMatcher = createPattern(
  'type-first-mixed-import',
  'Split type-first mixed imports into separate statements',
  /import\s*\{\s*type\s+([A-Z][a-zA-Z0-9_]*(?:\s*,\s*type\s+[A-Z][a-zA-Z0-9_]*)*)\s*,\s*([a-z_][a-zA-Z0-9_]*(?:\s*,\s*[a-z_][a-zA-Z0-9_]*)*)\s*\}\s*from\s*(['"][^'"]+['"])\s*;?/g,
  (match: string, types: string, values: string, source: string): string => {
    // Clean up type imports
    const typeNames = types
      .split(',')
      .map((t) => t.replace(/^\s*type\s+/, '').trim())
      .filter((t) => t.length > 0);

    // Clean up value imports
    const valueNames = values
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && !v.startsWith('type '));

    const valueImport = `import { ${valueNames.join(', ')} } from ${source};`;
    const typeImport = `import type { ${typeNames.join(', ')} } from ${source};`;

    return `${valueImport}\n${typeImport}`;
  },
  {
    priority: 4,
  }
);

/**
 * Pattern to handle complex mixed imports with multiple types interspersed
 *
 * Before: import { json, error, type RequestHandler } from '@sveltejs/kit';
 * After:  import { json, error } from '@sveltejs/kit';
 *         import type { RequestHandler } from '@sveltejs/kit';
 */
export const complexMixedImportPattern: PatternMatcher = createPattern(
  'complex-mixed-import',
  'Split complex mixed imports with multiple values and types',
  /import\s*\{([^}]+)\}\s*from\s*(['"][^'"]+['"])\s*;?/g,
  (match: string, imports: string, source: string): string => {
    // Check if this import has any inline type imports
    if (!imports.includes('type ')) {
      return match; // No type imports, return unchanged
    }

    // Parse all imports
    const parts = imports.split(',').map((p) => p.trim());
    const valueImports: string[] = [];
    const typeImports: string[] = [];

    for (const part of parts) {
      if (part.startsWith('type ')) {
        // This is a type import
        const typeName = part.replace(/^type\s+/, '').trim();
        if (typeName.length > 0) {
          typeImports.push(typeName);
        }
      } else if (part.length > 0) {
        // This is a value import
        valueImports.push(part);
      }
    }

    // If no type imports found, return unchanged
    if (typeImports.length === 0) {
      return match;
    }

    // Build the result
    const results: string[] = [];

    if (valueImports.length > 0) {
      results.push(`import { ${valueImports.join(', ')} } from ${source};`);
    }

    if (typeImports.length > 0) {
      results.push(`import type { ${typeImports.join(', ')} } from ${source};`);
    }

    return results.join('\n');
  },
  {
    priority: 5,
  }
);

// ============================================================================
// CORRUPTED TYPE IMPORT PATTERNS
// ============================================================================

/**
 * Pattern to fix `type,` followed by identifier in imports
 * This handles the case where commas were incorrectly inserted after `type`
 *
 * Before: import { type, AuditLogEntry, type, NewAuditLogEntry }
 * After:  import { type AuditLogEntry, type NewAuditLogEntry }
 */
export const importTypeCommaPattern: PatternMatcher = createPattern(
  'import-type-comma-fix',
  'Fix corrupted import type syntax (type, X → type X)',
  /type,\s*([A-Z][a-zA-Z0-9_]*)/g,
  'type $1',
  {
    priority: 10,
    validate: (before, after) => !after.includes('type,'),
  }
);

/**
 * Pattern to fix import statements with multiple corrupted type imports
 * Processes the entire import block to handle complex cases
 */
export const importBlockTypeCommaPattern: PatternMatcher = createPattern(
  'import-block-type-comma-fix',
  'Fix entire import blocks with corrupted type, syntax',
  /import\s*\{([^}]+)\}\s*from/g,
  (match: string, imports: string): string => {
    // Fix all `type,` occurrences within the import block
    const fixed = imports.replace(/type,\s*([A-Z])/g, 'type $1');
    return `import {${fixed}} from`;
  },
  {
    priority: 11,
    validate: (before, after) => {
      // Ensure no `type,` patterns remain in imports
      const importMatch = after.match(/import\s*\{[^}]+\}/g);
      if (!importMatch) return true;
      return !importMatch.some((imp) => imp.includes('type,'));
    },
  }
);

/**
 * Pattern to fix type-only imports that got corrupted
 * Handles: import type, { X } → import type { X }
 */
export const importTypeOnlyCorruptedPattern: PatternMatcher = createPattern(
  'import-type-only-corrupted-fix',
  'Fix corrupted type-only import statements',
  /import\s+type,\s*\{/g,
  'import type {',
  {
    priority: 12,
  }
);

// ============================================================================
// $LIB ALIAS IMPORT PATTERNS
// ============================================================================

/**
 * Pattern to fix double $lib paths
 *
 * Before: import { db } from '$lib/$lib/server/db';
 * After:  import { db } from '$lib/server/db';
 */
export const doubleDollarLibPattern: PatternMatcher = createPattern(
  'double-dollar-lib-fix',
  'Fix double $lib paths in imports',
  /from\s*(['"])\$lib\/\$lib\//g,
  "from $1$lib/",
  {
    priority: 20,
  }
);

/**
 * Pattern to fix $lib paths with extra slashes
 *
 * Before: import { db } from '$lib//server/db';
 * After:  import { db } from '$lib/server/db';
 */
export const dollarLibDoubleSlashPattern: PatternMatcher = createPattern(
  'dollar-lib-double-slash-fix',
  'Fix double slashes in $lib paths',
  /from\s*(['"])\$lib\/\//g,
  "from $1$lib/",
  {
    priority: 21,
  }
);

/**
 * Pattern to fix broken $lib paths with spaces
 *
 * Before: import { db } from '$ lib/server/db';
 * After:  import { db } from '$lib/server/db';
 */
export const dollarLibSpacePattern: PatternMatcher = createPattern(
  'dollar-lib-space-fix',
  'Fix spaces in $lib paths',
  /from\s*(['"])\$\s+lib\//g,
  "from $1$lib/",
  {
    priority: 22,
  }
);

// ============================================================================
// RELATIVE IMPORT PATH PATTERNS
// ============================================================================

/**
 * Pattern to fix double dot paths that are broken
 *
 * Before: import { x } from '....//utils';
 * After:  import { x } from '../../utils';
 */
export const brokenRelativePathPattern: PatternMatcher = createPattern(
  'broken-relative-path-fix',
  'Fix broken relative import paths with extra dots/slashes',
  /from\s*(['"])\.\.\.+\/+/g,
  "from $1../",
  {
    priority: 30,
  }
);

/**
 * Pattern to fix relative paths with double slashes
 *
 * Before: import { x } from '..//utils';
 * After:  import { x } from '../utils';
 */
export const relativeDoubleSlashPattern: PatternMatcher = createPattern(
  'relative-double-slash-fix',
  'Fix double slashes in relative paths',
  /from\s*(['"])(\.\.?)\/{2,}/g,
  'from $1$2/',
  {
    priority: 31,
  }
);

/**
 * Pattern to fix paths with trailing slashes before extension
 *
 * Before: import { x } from './utils/.ts';
 * After:  import { x } from './utils.ts';
 */
export const trailingSlashBeforeExtPattern: PatternMatcher = createPattern(
  'trailing-slash-before-ext-fix',
  'Fix trailing slashes before file extensions',
  /from\s*(['"])([^'"]+)\/\.(ts|js|svelte|json)(['"])/g,
  'from $1$2.$3$4',
  {
    priority: 32,
  }
);

// ============================================================================
// SVELTE-SPECIFIC IMPORT PATTERNS
// ============================================================================

/**
 * Pattern to fix Svelte Snippet type imports
 *
 * Before: import { type Snippet } from 'svelte';
 * After:  import type { Snippet } from 'svelte';
 */
export const svelteSnippetTypePattern: PatternMatcher = createPattern(
  'svelte-snippet-type-fix',
  'Fix Svelte Snippet type import syntax',
  /import\s*\{\s*type\s+(Snippet)\s*\}\s*from\s*(['"]svelte['"])/g,
  'import type { $1 } from $2',
  {
    priority: 40,
    fileFilter: (path: string) => path.endsWith('.svelte') || path.endsWith('.ts'),
  }
);

/**
 * Pattern to fix Svelte component type imports
 *
 * Before: import { type Component } from 'svelte';
 * After:  import type { Component } from 'svelte';
 */
export const svelteComponentTypePattern: PatternMatcher = createPattern(
  'svelte-component-type-fix',
  'Fix Svelte Component type import syntax',
  /import\s*\{\s*type\s+(Component|SvelteComponent)\s*\}\s*from\s*(['"]svelte['"])/g,
  'import type { $1 } from $2',
  {
    priority: 41,
    fileFilter: (path: string) => path.endsWith('.svelte') || path.endsWith('.ts'),
  }
);

// ============================================================================
// SVELTEKIT-SPECIFIC IMPORT PATTERNS
// ============================================================================

/**
 * Pattern to fix SvelteKit RequestHandler type imports
 *
 * Before: import { type RequestHandler } from '@sveltejs/kit';
 * After:  import type { RequestHandler } from '@sveltejs/kit';
 */
export const sveltekitRequestHandlerPattern: PatternMatcher = createPattern(
  'sveltekit-request-handler-fix',
  'Fix SvelteKit RequestHandler type import',
  /import\s*\{\s*type\s+(RequestHandler|RequestEvent|Handle|HandleFetch|HandleServerError)\s*\}\s*from\s*(['"]@sveltejs\/kit['"])/g,
  'import type { $1 } from $2',
  {
    priority: 42,
  }
);

/**
 * Pattern to fix SvelteKit PageServerLoad type imports
 *
 * Before: import { type PageServerLoad } from './$types';
 * After:  import type { PageServerLoad } from './$types';
 */
export const sveltekitPageTypesPattern: PatternMatcher = createPattern(
  'sveltekit-page-types-fix',
  'Fix SvelteKit page types import',
  /import\s*\{\s*type\s+(PageServerLoad|PageLoad|LayoutServerLoad|LayoutLoad|Actions|PageData|LayoutData)\s*\}\s*from\s*(['"][^'"]*\$types['"])/g,
  'import type { $1 } from $2',
  {
    priority: 43,
  }
);

// ============================================================================
// DRIZZLE ORM IMPORT PATTERNS
// ============================================================================

/**
 * Pattern to fix Drizzle ORM type imports
 *
 * Before: import { type InferInsertModel } from 'drizzle-orm';
 * After:  import type { InferInsertModel } from 'drizzle-orm';
 */
export const drizzleTypeImportPattern: PatternMatcher = createPattern(
  'drizzle-type-import-fix',
  'Fix Drizzle ORM type imports',
  /import\s*\{\s*type\s+(InferInsertModel|InferSelectModel|PostgresJsDatabase)\s*\}\s*from\s*(['"]drizzle-orm[^'"]*['"])/g,
  'import type { $1 } from $2',
  {
    priority: 44,
  }
);

// ============================================================================
// PATTERN AGGREGATION
// ============================================================================

/**
 * Get all import-related fix patterns in priority order
 */
export function getImportTypePatterns(): PatternMatcher[] {
  return [
    // TypeScript 4.5+ type-only import patterns (highest priority)
    inlineTypeToTypeImportPattern,
    singleInlineTypeImportPattern,
    // Mixed import patterns
    mixedImportSplitPattern,
    typeFirstMixedImportPattern,
    complexMixedImportPattern,
    // Corrupted type import patterns
    importTypeCommaPattern,
    importBlockTypeCommaPattern,
    importTypeOnlyCorruptedPattern,
    // $lib alias patterns
    doubleDollarLibPattern,
    dollarLibDoubleSlashPattern,
    dollarLibSpacePattern,
    // Relative path patterns
    brokenRelativePathPattern,
    relativeDoubleSlashPattern,
    trailingSlashBeforeExtPattern,
    // Svelte-specific patterns
    svelteSnippetTypePattern,
    svelteComponentTypePattern,
    // SvelteKit-specific patterns
    sveltekitRequestHandlerPattern,
    sveltekitPageTypesPattern,
    // Drizzle ORM patterns
    drizzleTypeImportPattern,
  ].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

// ============================================================================
// FIX FUNCTIONS
// ============================================================================

/**
 * Result of applying import type fixes
 */
export interface ImportTypeFixResult {
  /** The transformed content */
  result: string;
  /** Total number of fixes applied */
  fixCount: number;
  /** Number of passes executed */
  passes: number;
  /** Breakdown of fixes by pattern name */
  fixesByPattern: Record<string, number>;
}

/**
 * Apply import type fixes to content with multiple passes
 *
 * @param content - The source code content to transform
 * @param maxPasses - Maximum number of passes to run (default: 3)
 * @returns Object containing the transformed result and fix statistics
 *
 * @requirements 1.4
 */
export function fixImportTypes(
  content: string,
  maxPasses: number = 3
): ImportTypeFixResult {
  let result = content;
  let totalFixes = 0;
  let passCount = 0;
  const fixesByPattern: Record<string, number> = {};

  for (let pass = 0; pass < maxPasses; pass++) {
    let passFixes = 0;
    passCount++;

    for (const pattern of getImportTypePatterns()) {
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
          result = result.replace(
            pattern.pattern,
            pattern.replacement as (substring: string, ...args: string[]) => string
          );
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
 * Detect import-related issues in content
 *
 * @param content - The source code content to check
 * @returns Object containing detection results
 */
export function detectImportIssues(content: string): {
  hasIssues: boolean;
  patternMatches: Record<string, number>;
  totalMatches: number;
} {
  const patternMatches: Record<string, number> = {};
  let totalMatches = 0;

  for (const pattern of getImportTypePatterns()) {
    // Reset regex lastIndex for global patterns
    pattern.pattern.lastIndex = 0;

    const matches = content.match(pattern.pattern);
    if (matches) {
      patternMatches[pattern.name] = matches.length;
      totalMatches += matches.length;
    }
  }

  return {
    hasIssues: totalMatches > 0,
    patternMatches,
    totalMatches,
  };
}

/**
 * Validate that content has no remaining import issues
 *
 * @param content - The source code content to validate
 * @returns True if no import issues are found
 *
 * @requirements 1.4
 */
export function validateNoImportIssues(content: string): boolean {
  // Check for inline type imports that should be type-only imports
  const hasInlineTypeImports = /import\s*\{\s*type\s+[A-Z]/.test(content);

  // Check for corrupted type, syntax
  const hasCorruptedTypeSyntax = /type,\s*[A-Z]/.test(content);

  // Check for double $lib paths
  const hasDoubleDollarLib = /\$lib\/\$lib\//.test(content);

  // Check for double slashes in paths
  const hasDoubleSlashes = /from\s*['"][^'"]*\/\/[^'"]*['"]/.test(content);

  return !hasInlineTypeImports && !hasCorruptedTypeSyntax && !hasDoubleDollarLib && !hasDoubleSlashes;
}
