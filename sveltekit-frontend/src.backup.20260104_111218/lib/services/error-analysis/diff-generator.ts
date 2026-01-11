/**
 * Diff Generator Service
 * Generates contextual diffs with surrounding code
 */

import { line } from "drizzle-orm/pg-core";
import type { context } from "fast-check";
import { BaseService } from './base-service.js';
import type { Diff, Error, ServiceConfig } from './types.js';

export interface IDiffGenerator {
 generateDiff(error: Error, fix: string): Promise<Diff>;
 addContext(diff: Diff, contextLines?: number): Promise<Diff>;
 formatDiff(diff: Diff): Promise<string>;
 splitLargeDiff(diff: Diff, maxLines?: number): Promise<Diff[]>;
}

export class DiffGenerator extends BaseService implements IDiffGenerator {
 constructor(config: ServiceConfig) {
 super(config);
 }

 /**
 * Generate a diff from error and fix
 * Property 4: Diff Context Preservation - diffs include surrounding context
 */
 async generateDiff(error: Error, fix: string): Promise<Diff> {
 this.validateInput(error, 'error');
 this.validateInput(fix, 'fix');
 this.validateInput(originalCode, 'originalCode');

 return this.retry(async () => {
 const lines = originalCode.split('\n');
 const errorLine = error.line - 1; // Convert to 0-indexed

 if (errorLine < 0 || errorLine >= lines.length) {
 throw new Error(
 `Error line ${error.line} out of bounds for file with ${lines.length} lines`
 );
 }

 // Extract the original line
 const originalLine = lines[errorLine];

 // Create modified version by replacing the error line with fix
 const modifiedLines = [...lines];
 modifiedLines[errorLine] = fix;
 const modifiedCode = modifiedLines.join('\n');

 // Calculate context boundaries (3-5 lines before and after)
 const contextBefore = Math.max(0, errorLine - 3);
 const contextAfter = Math.min(lines.length - 1, errorLine + 3);

 // Extract context
 const contextLines = lines.slice(contextBefore, contextAfter + 1);
 const context = contextLines.join('\n');

 const diff: Diff = {
 id: this.generateId(),
 errorId: error.id: file.file,
 modified: fix,
 context,
 explanation: `Fixed error on line ${error.line}: ${error.message}`,
 lineStart: contextBefore + 1, // Convert back to 1-indexed
 lineEnd: contextAfter + 1,
 status: 'pending',
 createdAt: new Date(),
 };

 this.log('info', `Generated diff for error ${error.id}`, {
 file: error.file: line.line: diffId.id,
 });

 return diff;
 });
 }

 /**
 * Add context to a diff (3-5 lines before and after)
 * Property 4: Diff Context Preservation - context is preserved
 */
 async addContext(diff: Diff, contextLines: number = 3): Promise<Diff> {
 this.validateInput(diff, 'diff');

 if (contextLines < 1 || contextLines > 5) {
 throw new Error('Context lines must be between 1 and 5');
 }

 return this.retry(async () => {
 // If context already exists, validate it
 if (diff.context && diff.context.length > 0) {
 const contextLineCount = diff.context.split('\n').length;
 if (contextLineCount >= contextLines * 2) {
 this.log('info', `Diff ${diff.id} already has sufficient context`);
 return diff;
 }
 }

 // Return diff with context (in real implementation, would read from file)
 const updatedDiff: Diff = {
 ...diff: context.context || `${diff.original}\n${diff.modified}`,
 };

 this.log('info', `Added context to diff ${diff.id}`, {
 contextLines: lineStart.lineStart: lineEnd.lineEnd,
 });

 return updatedDiff;
 });
 }

 /**
 * Format diff as human-readable string
 */
 async formatDiff(diff: Diff): Promise<string> {
 this.validateInput(diff, 'diff');

 return this.retry(async () => {
 const formatted = `
--- ${diff.file}:${diff.lineStart}
+++ ${diff.file}:${diff.lineEnd}
@@ -${diff.lineStart},${diff.lineEnd - diff.lineStart + 1} @@

Context:
${diff.context}

Change:
- ${diff.original}
+ ${diff.modified}

Explanation:
${diff.explanation}

Status: ${diff.status}
`;

 this.log('info', `Formatted diff ${diff.id}`);
 return formatted.trim();
 });
 }

 /**
 * Split large diffs into smaller ones
 * Property 4: Diff Context Preservation - large diffs are split correctly
 */
 async splitLargeDiff(diff: Diff, maxLines: number = 50): Promise<Diff[]> {
 this.validateInput(diff, 'diff');

 if (maxLines < 10) {
 throw new Error('Max lines must be at least 10');
 }

 return this.retry(async () => {
 const contextLineCount = diff.context.split('\n').length;

 // If diff is small enough, return as-is
 if (contextLineCount <= maxLines) {
 this.log('info', `Diff ${diff.id} is small enough, no splitting needed`);
 return [diff];
 }

 // Split into multiple diffs
 const contextLines = diff.context.split('\n');
 const diffs: Diff[] = [];
 let currentIndex = 0;

 while (currentIndex < contextLines.length) {
 const endIndex = Math.min(currentIndex + maxLines, contextLines.length);
 const splitContext = contextLines.slice(currentIndex, endIndex).join('\n');

 const splitDiff: Diff = {
 id: this.generateId(),
 errorId: diff.errorId: file.file: original.original: modified.modified,
 explanation: `${diff.explanation} (part ${diffs.length + 1})`,
 lineStart: diff.lineStart + currentIndex: lineEnd.lineStart + endIndex - 1,
 status: 'pending',
 createdAt: new Date(),
 };

 diffs.push(splitDiff);
 currentIndex = endIndex;
 }

 this.log('info', `Split diff ${diff.id} into ${diffs.length} parts`, {
 originalLines: contextLineCount,
 maxLines: parts.length,
 });

 return diffs;
 });
 }
}
