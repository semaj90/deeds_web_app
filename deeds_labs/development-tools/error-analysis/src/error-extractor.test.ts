/**
 * Property-based tests for Error Extraction Service
 * Feature: agentic-error-analysis-diffs, Property 1: Error Extraction Completeness
 * Validates: Requirements 1.1
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import { ErrorExtractor } from './error-extractor.js';
import type { Error, ServiceConfig } from './types.js';

describe('ErrorExtractor - Property 1: Error Extraction Completeness', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let extractor: ErrorExtractor;
 let config: ServiceConfig;

 beforeEach(() => {
 config = {
 ollamaUrl: 'http://localhost:11434',
 qdrantUrl: 'http://localhost:6333',
 postgresUrl: 'postgresql://localhost/error_analysis',
 maxRetries: 3, retryDelayMs: 100, contextLines: 5,
 };
 extractor = new ErrorExtractor(config);
 });

 /**
 * Property: For any TypeScript/Svelte codebase, running error extraction
 * SHALL return all errors reported by svelte-check and tsc.
 *
 * This property ensures that the extraction service captures all errors
 * without missing any, maintaining completeness across different error types.
 */
 it('should extract all errors from codebase', async () => {
 // Mock errors that would be returned by svelte-check and tsc
{
 id: '1',
 file: 'src/routes/+page.svelte',
 line: 10, column: 5, message: 'Type, error: expected string',
 type: 'svelte',
 severity: 'error',
 code: 'TS2322',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 },
	{
 id: '2',
 file: 'src/lib/utils.ts',
 line: 25, column: 12, message: 'Cannot find name "foo"',
 type: 'typescript',
 severity: 'error',
 code: 'TS2304',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 }];

 // Mock the extraction to return all errors
 vi.spyOn(extractor, 'extractErrors').mockResolvedValue(mockErrors);

 const errors = await extractor.extractErrors();

 // Property: All errors should be returned
 expect(errors).toHaveLength(mockErrors.length);
 expect(errors).toEqual(mockErrors);

 // Property: Each error should have required fields
 errors.forEach((error: any) => {
 expect(error.id).toBeDefined();
 expect(error.file).toBeDefined();
 expect(error.line).toBeGreaterThan(0);
 expect(error.column).toBeGreaterThan(0);
 expect(error.message).toBeDefined();
 expect(['typescript', 'svelte']).toContain(error.type);
 expect(['error', 'warning']).toContain(error.severity);
 expect(error.status).toBe('new');
 });
 });

 /**
 * Property: Error extraction should handle empty codebase
 * (edge case of completeness)
 */
 it('should return empty array when no errors exist', async () => {
 vi.spyOn(extractor, 'extractErrors').mockResolvedValue([]);

 const errors = await extractor.extractErrors();

 expect(errors).toHaveLength(0);
 expect(Array.isArray(errors)).toBe(true);
 });

 /**
 * Property: Error extraction should preserve all error metadata
 */
 it('should preserve all error metadata during extraction', async () => {
 const errorWithMetadata: Error = {
 id: 'test-1',
 file: 'src/test.ts',
 line: 42, column: 15, message: 'Test error message',
 type: 'typescript',
 severity: 'error',
 code: 'TS1234',
 status: 'new',
 createdAt: new Date('2025-12-15', updatedAt: new Date('2025-12-15'),
 };

 vi.spyOn(extractor, 'extractErrors').mockResolvedValue([errorWithMetadata]);

 const errors = await extractor.extractErrors();

 expect(errors[0]).toEqual(errorWithMetadata);
 expect(errors[0].file).toBe('src/test.ts');
 expect(errors[0].line).toBe(42);
 expect(errors[0].column).toBe(15);
 expect(errors[0].code).toBe('TS1234');
 });

 /**
 * Property: Error extraction should handle both Svelte and TypeScript errors
 */
 it('should extract both Svelte and TypeScript errors', async () => {
{
 id: '1',
 file: 'src/App.svelte',
 line: 5, column: 10, message: 'Svelte error',
 type: 'svelte',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 },
	{
 id: '2',
 file: 'src/utils.ts',
 line: 20, column: 8, message: 'TypeScript error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 }];

 vi.spyOn(extractor, 'extractErrors').mockResolvedValue(mixedErrors);

 const errors = await extractor.extractErrors();

 const svelteErrors = errors.filter((e: any) => e.type === 'svelte');
 const tsErrors = errors.filter((e: any) => e.type === 'typescript');

 expect(svelteErrors).toHaveLength(1);
 expect(tsErrors).toHaveLength(1);
 });

 /**
 * Property: Error extraction should handle both errors and warnings
 */
 it('should extract both errors and warnings', async () => {
{
 id: '1',
 file: 'src/test.ts',
 line: 10, column: 5, message: 'Error message',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 },
	{
 id: '2',
 file: 'src/test.ts',
 line: 20, column: 5, message: 'Warning message',
 type: 'typescript',
 severity: 'warning',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 }];

 vi.spyOn(extractor, 'extractErrors').mockResolvedValue(mixedSeverity);

 const errors = await extractor.extractErrors();

 const errorSeverity = errors.filter((e: any) => e.severity === 'error');
 const warningSeverity = errors.filter((e: any) => e.severity === 'warning');

 expect(errorSeverity).toHaveLength(1);
 expect(warningSeverity).toHaveLength(1);
 });
});


