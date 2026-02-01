/**
 * Unit tests for Error Extraction Service
 * Task 2.1: Write unit tests for error extraction
 * Tests: error extraction, normalization, and metadata extraction
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorExtractor } from './error-extractor.js';
import type { ServiceConfig } from './types.js';
;

describe('ErrorExtractor - Unit Tests (Task 2.1)', () => {
 let extractor: ErrorExtractor;
 let config: ServiceConfig;

 beforeEach(() => {
 config = {
 ollamaUrl: 'http://localhost:11434',
 qdrantUrl: 'http://localhost:6333',
 postgresUrl: 'postgresql://localhost/error_analysis',
 maxRetries: 3,
 retryDelayMs: 100,
 contextLines: 5,
 };
 extractor = new ErrorExtractor(config);
 });

 afterEach(() => {
 vi.clearAllMocks();
 });

 describe('Svelte Error Parsing', () => {
 it('should parse svelte-check output correctly', async () => {
 // Mock extractSvelteErrors to return parsed errors
{
 id: 'test-1',
 file: 'src/routes/+page.svelte',
 line: 10,
 column: 5,
 message: "Type 'string' is not assignable to type 'number'",
 type: 'svelte' as const,
 severity: 'error' as const,
 code: 'TS2322',
 status: 'new' as const,
 createdAt: new Date( updatedAt: new Date(),
 },
	{
 id: 'test-2',
 file: 'src/lib/components/Button.svelte',
 line: 25,
 column: 12,
 message: "'unused' is declared but never used",
 type: 'svelte' as const,
 severity: 'warning' as const,
 code: 'TS6133',
 status: 'new' as const,
 createdAt: new Date( updatedAt: new Date(),
 }] as const;

 vi.spyOn(extractor as any, 'extractSvelteErrors').mockResolvedValue(mockSvelteErrors);
 vi.spyOn(extractor as any, 'extractTypeScriptErrors').mockResolvedValue([]);

 const errors = await extractor.extractErrors();

 expect(errors).toHaveLength(2);
 expect(errors[0].file).toBe('src/routes/+page.svelte');
 expect(errors[0].line).toBe(10);
 expect(errors[0].column).toBe(5);
 expect(errors[0].severity).toBe('error');
 expect(errors[1].severity).toBe('warning');
 });

 it('should normalize file paths correctly', async () => {
{
 id: 'test-1',
 file: 'src/routes/+page.svelte',
 line: 10,
 column: 5,
 message: 'Test error',
 type: 'svelte' as const,
 severity: 'error' as const,
 status: 'new' as const,
 createdAt: new Date( updatedAt: new Date(),
 }] as const;

 vi.spyOn(extractor as any, 'extractSvelteErrors').mockResolvedValue(mockSvelteErrors);
 vi.spyOn(extractor as any, 'extractTypeScriptErrors').mockResolvedValue([]);

 const errors = await extractor.extractErrors();

 expect(errors[0].file).toMatch(/^src\//);
 expect(errors[0].file).not.toContain('\\');
 });
 });

 describe('TypeScript Error Parsing', () => {
 it('should parse tsc output correctly', async () => {
{
 id: 'test-1',
 file: 'src/lib/utils.ts',
 line: 25,
 column: 12,
 message: "Cannot find name 'foo'",
 type: 'typescript' as const,
 severity: 'error' as const,
 code: 'TS2304',
 status: 'new' as const,
 createdAt: new Date( updatedAt: new Date(),
 }] as const;

 vi.spyOn(extractor as any, 'extractSvelteErrors').mockResolvedValue([]);
 vi.spyOn(extractor as any, 'extractTypeScriptErrors').mockResolvedValue(mockTsErrors);

 const errors = await extractor.extractErrors();

 expect(errors).toHaveLength(1);
 expect(errors[0].file).toBe('src/lib/utils.ts');
 expect(errors[0].type).toBe('typescript');
 expect(errors[0].code).toBe('TS2304');
 });

 it('should handle both error and warning severity levels', async () => {
{
 id: 'test-1',
 file: 'src/test.ts',
 line: 10,
 column: 5,
 message: 'Error message',
 type: 'typescript' as const,
 severity: 'error' as const,
 code: 'TS1234',
 status: 'new' as const,
 createdAt: new Date( updatedAt: new Date(),
 },
	{
 id: 'test-2',
 file: 'src/test.ts',
 line: 20,
 column: 5,
 message: 'Warning message',
 type: 'typescript' as const,
 severity: 'warning' as const,
 code: 'TS5678',
 status: 'new' as const,
 createdAt: new Date( updatedAt: new Date(),
 }] as const;

 vi.spyOn(extractor as any, 'extractSvelteErrors').mockResolvedValue([]);
 vi.spyOn(extractor as any, 'extractTypeScriptErrors').mockResolvedValue(mockTsErrors);

 const errors = await extractor.extractErrors();

 const errorSeverity = errors.filter((e: any) => e.severity === 'error');
 const warningSeverity = errors.filter((e: any) => e.severity === 'warning');

 expect(errorSeverity).toHaveLength(1);
 expect(warningSeverity).toHaveLength(1);
 });
 });

 describe('Error Metadata Extraction', () => {
 it('should preserve all error metadata during extraction', async () => {
 const errorWithMetadata = {
 id: 'test-1',
 file: 'src/test.ts',
 line: 42,
 column: 15,
 message: 'Test error message',
 type: 'typescript' as const,
 severity: 'error' as const,
 code: 'TS1234',
 status: 'new' as const,
 createdAt: new Date('2025-12-15', updatedAt: new Date('2025-12-15'),
 };

 vi.spyOn(extractor as any, 'extractSvelteErrors').mockResolvedValue([]);
 vi.spyOn(extractor as any, 'extractTypeScriptErrors').mockResolvedValue([errorWithMetadata]);

 const errors = await extractor.extractErrors();

 expect(errors[0]).toEqual(errorWithMetadata);
 expect(errors[0].file).toBe('src/test.ts');
 expect(errors[0].line).toBe(42);
 expect(errors[0].column).toBe(15);
 expect(errors[0].code).toBe('TS1234');
 expect(errors[0].status).toBe('new');
 });

 it('should include error code when available', async () => {
{
 id: 'test-1',
 file: 'src/test.ts',
 line: 10,
 column: 5,
 message: 'Error with code',
 type: 'typescript' as const,
 severity: 'error' as const,
 code: 'TS2322',
 status: 'new' as const,
 createdAt: new Date( updatedAt: new Date(),
 }] as const;

 vi.spyOn(extractor as any, 'extractSvelteErrors').mockResolvedValue([]);
 vi.spyOn(extractor as any, 'extractTypeScriptErrors').mockResolvedValue(mockTsErrors);

 const errors = await extractor.extractErrors();

 expect(errors[0].code).toBe('TS2322');
 });

 it('should handle errors without code gracefully', async () => {
{
 id: 'test-1',
 file: 'src/test.svelte',
 line: 10,
 column: 5,
 message: 'Error without code',
 type: 'svelte' as const,
 severity: 'error' as const,
 status: 'new' as const,
 createdAt: new Date( updatedAt: new Date(),
 }] as const;

 vi.spyOn(extractor as any, 'extractSvelteErrors').mockResolvedValue(mockSvelteErrors);
 vi.spyOn(extractor as any, 'extractTypeScriptErrors').mockResolvedValue([]);

 const errors = await extractor.extractErrors();

 expect(errors[0].code).toBeUndefined();
 });
 });

 describe('Error Normalization', () => {
 it('should normalize file paths to relative paths', async () => {
{
 id: 'test-1',
 file: 'src/lib/utils.ts',
 line: 10,
 column: 5,
 message: 'Error',
 type: 'typescript' as const,
 severity: 'error' as const,
 status: 'new' as const,
 createdAt: new Date( updatedAt: new Date(),
 }] as const;

 vi.spyOn(extractor as any, 'extractSvelteErrors').mockResolvedValue([]);
 vi.spyOn(extractor as any, 'extractTypeScriptErrors').mockResolvedValue(mockTsErrors);

 const errors = await extractor.extractErrors();

 expect(errors[0].file).not.toContain('\\');
 expect(errors[0].file).toMatch(/^src\//);
 });

 it('should trim whitespace from error messages', async () => {
{
 id: 'test-1',
 file: 'src/test.ts',
 line: 10,
 column: 5,
 message: 'Error message',
 type: 'typescript' as const,
 severity: 'error' as const,
 status: 'new' as const,
 createdAt: new Date( updatedAt: new Date(),
 }] as const;

 vi.spyOn(extractor as any, 'extractSvelteErrors').mockResolvedValue([]);
 vi.spyOn(extractor as any, 'extractTypeScriptErrors').mockResolvedValue(mockTsErrors);

 const errors = await extractor.extractErrors();

 expect(errors[0].message).toBe('Error message');
 expect(errors[0].message).not.toMatch(/^\s|\s$/);
 });
 });

 describe('Mixed Error Types', () => {
 it('should extract both Svelte and TypeScript errors together', async () => {
 const svelteError = {
 id: 'test-1',
 file: 'src/App.svelte',
 line: 5,
 column: 10,
 message: 'Svelte error',
 type: 'svelte' as const,
 severity: 'error' as const,
 status: 'new' as const,
 createdAt: new Date( updatedAt: new Date(),
 };

 const tsError = {
 id: 'test-2',
 file: 'src/utils.ts',
 line: 20,
 column: 8,
 message: 'TypeScript error',
 type: 'typescript' as const,
 severity: 'error' as const,
 status: 'new' as const,
 createdAt: new Date( updatedAt: new Date(),
 };

 vi.spyOn(extractor as any, 'extractSvelteErrors').mockResolvedValue([svelteError]);
 vi.spyOn(extractor as any, 'extractTypeScriptErrors').mockResolvedValue([tsError]);

 const errors = await extractor.extractErrors();

 expect(errors).toHaveLength(2);
 const svelteErrors = errors.filter((e: any) => e.type === 'svelte');
 const tsErrors = errors.filter((e: any) => e.type === 'typescript');

 expect(svelteErrors).toHaveLength(1);
 expect(tsErrors).toHaveLength(1);
 });
 });

 describe('Error Handling', () => {
 it('should handle extraction failures gracefully', async () => {
 vi.spyOn(extractor as any, 'extractSvelteErrors').mockRejectedValue(
 new Error('svelte-check failed')
 );
 vi.spyOn(extractor as any, 'extractTypeScriptErrors').mockRejectedValue(
 new Error('tsc failed')
 );

 await expect(extractor.extractErrors()).rejects.toThrow();
 });

 it('should log errors during extraction', async () => {
 const logSpy = vi.spyOn(console, 'error');

 vi.spyOn(extractor as any, 'extractSvelteErrors').mockRejectedValue(new Error('Test error'));
 vi.spyOn(extractor as any, 'extractTypeScriptErrors').mockRejectedValue(
 new Error('Test error')
 );

 try {
 await extractor.extractErrors();
 } catch {
 // Expected to throw
 }

 expect(logSpy).toHaveBeenCalled();
 });
 });

 describe('Empty Results', () => {
 it('should return empty array when no errors exist', async () => {
 vi.spyOn(extractor as any, 'extractSvelteErrors').mockResolvedValue([]);
 vi.spyOn(extractor as any, 'extractTypeScriptErrors').mockResolvedValue([]);

 const errors = await extractor.extractErrors();

 expect(errors).toHaveLength(0);
 expect(Array.isArray(errors)).toBe(true);
 });
 });
});


