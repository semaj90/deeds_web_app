/**
 * Property-Based Tests for Context Formatter Service
 * Task 8.1: Write property tests for context formatting
 * Feature: agentic-error-analysis-diffs, Property 3: Prompt Persistence Round-Trip
 * Validates: Requirements 3.1, 3.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';;
import fc from 'fast-check';
import { ContextFormatter } from './context-formatter.js';
import type { ServiceConfig, Error, Pattern } from './types.js';

describe('ContextFormatter - Property-Based Tests (Task 8.1)', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 let formatter: ContextFormatter;
 let config: ServiceConfig;

 beforeEach(() => {
 config = {
 ollamaUrl: 'http://localhost:11434',
 qdrantUrl: 'http://localhost:6333',
 postgresUrl: 'postgresql://localhost/error_analysis',
 maxRetries: 3, retryDelayMs: 100, contextLines: 5,
 };
 formatter = new ContextFormatter(config);
 });

 /**
 * Property 3: Prompt Persistence Round-Trip
 * For any error context, formatting and parsing should preserve information
 */
 describe('Property 3: Prompt Persistence Round-Trip', () => {
 it('should format error context with all required fields', async () => {
 const error: Error = {
 id: 'error-1',
 file: 'test.ts',
 line: 10, column: 5, message: 'Type, error: expected string but got number',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const patterns: Pattern[] = [
 {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 20,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 }];

 const context = await formatter.formatErrorContext(error, patterns);

 // Verify all required information is present
 expect(context).toContain(error.id);
 expect(context).toContain(error.file);
 expect(context).toContain(error.message);
 expect(context).toContain(patterns[0].filePath);
 expect(context).toContain(patterns[0].code);
 });

 it('should format context with code snippet', async () => {
 const error: Error = {
 id: 'error-1',
 file: 'test.ts',
 line: 10, column: 5, message: 'Type error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const codeSnippet = 'const x: string = 123;';
 const context = await formatter.formatErrorContext(error, [], codeSnippet);

 expect(context).toContain(codeSnippet);
 expect(context).toContain('Code Snippet');
 });

 it('should format complete prompt for LLM', async () => {
 const error: Error = {
 id: 'error-1',
 file: 'test.ts',
 line: 10, column: 5, message: 'Type error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const context = 'Error context here';
 const prompt = await formatter.formatPrompt(error, context);

 expect(prompt).toContain(context);
 expect(prompt).toContain('Root Cause');
 expect(prompt).toContain('Suggested Fix');
 expect(prompt).toContain('Explanation');
 });

 it('should parse LLM response correctly', async () => {
 const response = `## Root Cause
The variable is assigned a number but declared as string.

## Suggested Fix
\`\`\`typescript
const x: number = 123;
\`\`\`

## Explanation
Change the type annotation from string to number to match the assigned value.`;

 const parsed = await formatter.parseResponse(response);

 expect(parsed.fix).toContain('const x: number = 123;');
 expect(parsed.explanation).toContain('Change the type annotation');
 });

 it('should handle multiple patterns in context', async () => {
 const error: Error = {
 id: 'error-1',
 file: 'test.ts',
 line: 10, column: 5, message: 'Type error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const patterns: Pattern[] = [
 {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 20,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 },
 {
 id: 'pattern-2',
 filePath: 'other.ts',
 lineNumber: 30,
 code: 'const, y: number = "hello";',
 errorType: 'type-mismatch',
 similarity: 0.92,
 }];

 const context = await formatter.formatErrorContext(error, patterns);

 expect(context).toContain('Pattern 1');
 expect(context).toContain('Pattern 2');
 expect(context).toContain('95.0%');
 expect(context).toContain('92.0%');
 });

 it('should format context without patterns', async () => {
 const error: Error = {
 id: 'error-1',
 file: 'test.ts',
 line: 10, column: 5, message: 'Type error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const context = await formatter.formatErrorContext(error, []);

 expect(context).toContain(error.id);
 expect(context).toContain(error.message);
 expect(context).not.toContain('Similar Patterns');
 });
 });

 /**
 * Property: Response Parsing
 * For any valid LLM response, parsing should extract fix and explanation
 */
 describe('Property: Response Parsing', () => {
 it('should extract code from various markdown formats', async () => {
 const responses = [
 `## Suggested Fix
\`\`\`typescript
const x = 123;
\`\`\`

## Explanation
This is the fix.`,
 `## Suggested Fix
\`\`\`js
const x = 123;
\`\`\`

## Explanation
This is the fix.`,
 `## Suggested Fix
\`\`\`
const x = 123;
\`\`\`

## Explanation
This is the fix.`];

 for (const response of responses) {
 const parsed = await formatter.parseResponse(response);
 expect(parsed.fix).toContain('const x = 123;');
 expect(parsed.explanation).toContain('This is the fix');
 }
 });

 it('should handle explanation with multiple sections', async () => {
 const response = `## Root Cause
The issue is here.

## Suggested Fix
\`\`\`typescript
const x = 123;
\`\`\`

## Explanation
This is the fix.
It works because of reasons.

## Additional Notes
Some notes here.`;

 const parsed = await formatter.parseResponse(response);
 expect(parsed.fix).toContain('const x = 123;');
 expect(parsed.explanation).toContain('This is the fix');
 });
 });

 /**
 * Property: Error Handling
 * For any invalid input, service should throw appropriate error
 */
 describe('Property: Error Handling', () => {
 it('should reject empty error', async () => {
 await expect(formatter.formatErrorContext(null as any, [])).rejects.toThrow();
 });

 it('should reject empty patterns array type', async () => {
 const error: Error = {
 id: 'error-1',
 file: 'test.ts',
 line: 10, column: 5, message: 'Type error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 await expect(formatter.formatErrorContext(error, null as any)).rejects.toThrow();
 });

 it('should reject empty context in prompt', async () => {
 const error: Error = {
 id: 'error-1',
 file: 'test.ts',
 line: 10, column: 5, message: 'Type error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 await expect(formatter.formatPrompt(error, '')).rejects.toThrow('Invalid input');
 });

 it('should reject invalid response format', async () => {
 const invalidResponse = 'This is not a valid response format';
 await expect(formatter.parseResponse(invalidResponse)).rejects.toThrow(
 'Invalid response format'
 );
 });

 it('should reject empty response', async () => {
 await expect(formatter.parseResponse('')).rejects.toThrow('Invalid input');
 });
 });

 /**
 * Property: Format Consistency
 * For any error, formatted context should be consistent
 */
 describe('Property: Format Consistency', () => {
 it('should produce consistent formatting for same input', async () => {
 const error: Error = {
 id: 'error-1',
 file: 'test.ts',
 line: 10, column: 5, message: 'Type error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const patterns: Pattern[] = [
 {
 id: 'pattern-1',
 filePath: 'test.ts',
 lineNumber: 20,
 code: 'const, x: string = 123;',
 errorType: 'type-mismatch',
 similarity: 0.95,
 }];

 const context1 = await formatter.formatErrorContext(error, patterns);
 const context2 = await formatter.formatErrorContext(error, patterns);

 expect(context1).toBe(context2);
 });

 it('should produce consistent prompt formatting', async () => {
 const error: Error = {
 id: 'error-1',
 file: 'test.ts',
 line: 10, column: 5, message: 'Type error',
 type: 'typescript',
 severity: 'error',
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 };

 const context = 'Error context';

 const prompt1 = await formatter.formatPrompt(error, context);
 const prompt2 = await formatter.formatPrompt(error, context);

 expect(prompt1).toBe(prompt2);
 });
 });
});


