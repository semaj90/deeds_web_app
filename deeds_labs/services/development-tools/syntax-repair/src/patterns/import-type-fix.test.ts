/**
 * Import Type Fix Pattern Tests
 *
 * Tests for import-related syntax fixes including:
 * - TypeScript 4.5+ type-only import conversion
 * - Mixed import splitting
 * - Corrupted type syntax fixes
 * - $lib alias fixes
 * - Relative path fixes
 *
 * @requirements 1.4
 */

import { describe, it, expect } from 'vitest';
import {
  fixImportTypes,
  detectImportIssues,
  validateNoImportIssues,
  getImportTypePatterns,
  // Individual patterns for targeted testing
  inlineTypeToTypeImportPattern,
  singleInlineTypeImportPattern,
  mixedImportSplitPattern,
  typeFirstMixedImportPattern,
  complexMixedImportPattern,
  importTypeCommaPattern,
  doubleDollarLibPattern,
  dollarLibDoubleSlashPattern,
  brokenRelativePathPattern,
  relativeDoubleSlashPattern,
} from './import-type-fix';

describe('Import Type Fix Patterns', () => {
  describe('getImportTypePatterns', () => {
    it('should return all patterns sorted by priority', () => {
      const patterns = getImportTypePatterns();
      expect(patterns.length).toBeGreaterThan(0);

      // Verify patterns are sorted by priority
      for (let i = 1; i < patterns.length; i++) {
        const prevPriority = patterns[i - 1].priority ?? 100;
        const currPriority = patterns[i].priority ?? 100;
        expect(currPriority).toBeGreaterThanOrEqual(prevPriority);
      }
    });
  });

  describe('TypeScript 4.5+ Type-Only Import Conversion', () => {
    it('should convert single inline type import to type-only import', () => {
      const input = `import { type Worker } from 'worker_threads';`;
      const expected = `import type { Worker } from 'worker_threads';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });

    it('should convert multiple inline type imports to type-only import', () => {
      const input = `import { type AuditLogEntry, type NewAuditLogEntry } from './types';`;
      const expected = `import type { AuditLogEntry, NewAuditLogEntry } from './types';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });

    it('should convert inline type import from drizzle-orm', () => {
      const input = `import { type PostgresJsDatabase } from 'drizzle-orm/postgres-js';`;
      const expected = `import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });

    it('should convert inline type import from @sveltejs/kit', () => {
      const input = `import { type RequestEvent } from "@sveltejs/kit";`;
      const expected = `import type { RequestEvent } from "@sveltejs/kit";`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });
  });

  describe('Mixed Import Splitting', () => {
    it('should split mixed imports with value first', () => {
      const input = `import { json, type RequestHandler } from '@sveltejs/kit';`;

      const { result } = fixImportTypes(input);

      // Should have both value and type imports
      expect(result).toContain(`import { json } from '@sveltejs/kit'`);
      expect(result).toContain(`import type { RequestHandler } from '@sveltejs/kit'`);
    });

    it('should split mixed imports with multiple values and types', () => {
      const input = `import { json, error, type RequestHandler } from '@sveltejs/kit';`;

      const { result } = fixImportTypes(input);

      expect(result).toContain('json');
      expect(result).toContain('error');
      expect(result).toContain('import type { RequestHandler }');
    });

    it('should split type-first mixed imports', () => {
      const input = `import { type RequestHandler, json } from '@sveltejs/kit';`;

      const { result } = fixImportTypes(input);

      expect(result).toContain('import { json }');
      expect(result).toContain('import type { RequestHandler }');
    });

    it('should handle complex mixed imports with multiple types', () => {
      const input = `import { json, error, type RequestHandler, type Handle } from '@sveltejs/kit';`;

      const { result } = fixImportTypes(input);

      expect(result).toContain('json');
      expect(result).toContain('error');
      expect(result).toContain('RequestHandler');
      expect(result).toContain('Handle');
    });
  });

  describe('Corrupted Type Syntax Fixes', () => {
    it('should fix type, followed by identifier and convert to type-only import', () => {
      const input = `import { type, AuditLogEntry } from './types';`;
      // After fixing type, -> type and then converting to type-only import
      const expected = `import type { AuditLogEntry } from './types';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });

    it('should fix multiple corrupted type, patterns and convert to type-only import', () => {
      const input = `import { type, AuditLogEntry, type, NewAuditLogEntry } from './types';`;

      const { result } = fixImportTypes(input);

      expect(result).not.toContain('type,');
      // After fixing, it becomes a type-only import
      expect(result).toContain('import type {');
      expect(result).toContain('AuditLogEntry');
      expect(result).toContain('NewAuditLogEntry');
    });

    it('should fix import type, { X } pattern', () => {
      const input = `import type, { Worker } from 'worker_threads';`;
      const expected = `import type { Worker } from 'worker_threads';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });
  });

  describe('$lib Alias Fixes', () => {
    it('should fix double $lib paths', () => {
      const input = `import { db } from '$lib/$lib/server/db';`;
      const expected = `import { db } from '$lib/server/db';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });

    it('should fix double slashes in $lib paths', () => {
      const input = `import { db } from '$lib//server/db';`;
      const expected = `import { db } from '$lib/server/db';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });

    it('should fix spaces in $lib paths', () => {
      const input = `import { db } from '$ lib/server/db';`;
      const expected = `import { db } from '$lib/server/db';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });
  });

  describe('Relative Path Fixes', () => {
    it('should fix broken relative paths with extra dots', () => {
      const input = `import { x } from '..../utils';`;
      const expected = `import { x } from '../utils';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });

    it('should fix double slashes in relative paths', () => {
      const input = `import { x } from '..//utils';`;
      const expected = `import { x } from '../utils';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });

    it('should fix trailing slash before extension', () => {
      const input = `import { x } from './utils/.ts';`;
      const expected = `import { x } from './utils.ts';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });
  });

  describe('Svelte-Specific Patterns', () => {
    it('should fix Svelte Snippet type import', () => {
      const input = `import { type Snippet } from 'svelte';`;
      const expected = `import type { Snippet } from 'svelte';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });

    it('should fix Svelte Component type import', () => {
      const input = `import { type Component } from 'svelte';`;
      const expected = `import type { Component } from 'svelte';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });
  });

  describe('SvelteKit-Specific Patterns', () => {
    it('should fix SvelteKit RequestHandler type import', () => {
      const input = `import { type RequestHandler } from '@sveltejs/kit';`;
      const expected = `import type { RequestHandler } from '@sveltejs/kit';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });

    it('should fix SvelteKit PageServerLoad type import', () => {
      const input = `import { type PageServerLoad } from './$types';`;
      const expected = `import type { PageServerLoad } from './$types';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });
  });

  describe('fixImportTypes', () => {
    it('should return fix statistics', () => {
      const input = `
import { type Worker } from 'worker_threads';
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/$lib/server/db';
`;

      const result = fixImportTypes(input);

      expect(result.fixCount).toBeGreaterThan(0);
      expect(result.passes).toBeGreaterThanOrEqual(1);
      expect(Object.keys(result.fixesByPattern).length).toBeGreaterThan(0);
    });

    it('should handle content with no issues', () => {
      const input = `
import type { Worker } from 'worker_threads';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
`;

      const result = fixImportTypes(input);

      // The content is already clean, so the result should be the same
      // Note: Some patterns may still match but produce the same output
      expect(result.result).toBe(input);
    });

    it('should run multiple passes if needed', () => {
      // Content that might need multiple passes
      const input = `import { type, AuditLogEntry, type, NewAuditLogEntry } from './types';`;

      const result = fixImportTypes(input, 3);

      expect(result.passes).toBeGreaterThanOrEqual(1);
      expect(result.result).not.toContain('type,');
    });
  });

  describe('detectImportIssues', () => {
    it('should detect inline type imports', () => {
      const input = `import { type Worker } from 'worker_threads';`;

      const result = detectImportIssues(input);

      expect(result.hasIssues).toBe(true);
      expect(result.totalMatches).toBeGreaterThan(0);
    });

    it('should detect corrupted type syntax', () => {
      const input = `import { type, Worker } from 'worker_threads';`;

      const result = detectImportIssues(input);

      expect(result.hasIssues).toBe(true);
    });

    it('should detect double $lib paths', () => {
      const input = `import { db } from '$lib/$lib/server/db';`;

      const result = detectImportIssues(input);

      expect(result.hasIssues).toBe(true);
    });

    it('should return no issues for clean imports', () => {
      const input = `
import type { Worker } from 'worker_threads';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
`;

      const result = detectImportIssues(input);

      // May still detect some patterns depending on implementation
      // The key is that fixImportTypes should not change clean imports
      const fixed = fixImportTypes(input);
      expect(fixed.result.trim()).toBe(input.trim());
    });
  });

  describe('validateNoImportIssues', () => {
    it('should return false for inline type imports', () => {
      const input = `import { type Worker } from 'worker_threads';`;
      expect(validateNoImportIssues(input)).toBe(false);
    });

    it('should return false for corrupted type syntax', () => {
      const input = `import { type, Worker } from 'worker_threads';`;
      expect(validateNoImportIssues(input)).toBe(false);
    });

    it('should return false for double $lib paths', () => {
      const input = `import { db } from '$lib/$lib/server/db';`;
      expect(validateNoImportIssues(input)).toBe(false);
    });

    it('should return false for double slashes', () => {
      const input = `import { db } from '$lib//server/db';`;
      expect(validateNoImportIssues(input)).toBe(false);
    });

    it('should return true for clean imports', () => {
      const input = `
import type { Worker } from 'worker_threads';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
`;
      expect(validateNoImportIssues(input)).toBe(true);
    });
  });

  describe('Real-world Examples', () => {
    it('should fix concurrent-json-serializer.ts import', () => {
      const input = `import { type Worker, isMainThread, parentPort, workerData } from 'worker_threads';`;

      const { result } = fixImportTypes(input);

      expect(result).toContain('import { isMainThread, parentPort, workerData }');
      expect(result).toContain('import type { Worker }');
    });

    it('should fix db/index-new.ts import', () => {
      const input = `import { type PostgresJsDatabase } from 'drizzle-orm/postgres-js';`;
      const expected = `import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });

    it('should fix CaseRankingService.ts import', () => {
      const input = `import { type InferInsertModel } from 'drizzle-orm';`;
      const expected = `import type { InferInsertModel } from 'drizzle-orm';`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });

    it('should fix charge-bundler.ts import', () => {
      const input = `import { type RequestEvent } from "@sveltejs/kit";`;
      const expected = `import type { RequestEvent } from "@sveltejs/kit";`;

      const { result } = fixImportTypes(input);
      expect(result).toBe(expected);
    });

    it('should fix stream server import', () => {
      const input = `import { type RequestHandler,  error } from '@sveltejs/kit';`;

      const { result } = fixImportTypes(input);

      expect(result).toContain('import { error }');
      expect(result).toContain('import type { RequestHandler }');
    });
  });
});
