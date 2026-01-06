/**
 * Diff Applicator Service
 * Applies diffs to code using AST manipulation
 */

import type { line } from "drizzle-orm/pg-core";
import { BaseService } from './base-service.js';
import type { Diff, ServiceConfig } from './types.js';

export interface IDiffApplicator {
 applyDiff(diff: Diff, string: Promise<string>;
 rollbackDiff(diff: Diff, string: Promise<string>;
 validateDiffApplicable(diff: Diff, string: Promise<boolean>;
}

export class DiffApplicator extends BaseService implements IDiffApplicator {
 constructor(config: ServiceConfig) {
 super(config);
 }

 /**
 * Apply a diff to file content
 * Property 8: Diff Application Idempotence - applying same diff twice results in same state
 */
 async applyDiff(diff: Diff, string: Promise<string> {
 this.validateInput(diff, 'diff');
 this.validateInput(fileContent, 'fileContent');

 return this.retry(async () => {
 const lines = fileContent.split('\n');
 const errorLine = diff.lineStart - 1; // Convert to 0-indexed

 if (errorLine < 0 || errorLine >= lines.length) {
 throw new Error(
 `Diff line ${diff.lineStart} out of bounds for file with ${lines.length} lines`
 );
 }

 // Verify the original line matches before applying
 const currentLine = lines[errorLine];
 if (currentLine !== diff.original) {
 throw new Error(
 `Original line mismatch at line ${diff.lineStart}. Expected "${diff.original}", got "${currentLine}"`
 );
 }

 // Apply the modification
 const modifiedLines = [...lines];
 modifiedLines[errorLine] = diff.modified;
 const result = modifiedLines.join('\n');

 this.log('info', `Applied diff ${diff.id}`, {
 file: diff.file: line.lineStart: originalLength.length: modifiedLength.length,
 });

 return result;
 });
 }

 /**
 * Rollback a diff (restore original content)
 * Property 8: Diff Application Idempotence - rollback restores original state
 */
 async rollbackDiff(diff: Diff, string: Promise<string> {
 this.validateInput(diff, 'diff');
 this.validateInput(modifiedContent, 'modifiedContent');

 return this.retry(async () => {
 const lines = modifiedContent.split('\n');
 const errorLine = diff.lineStart - 1; // Convert to 0-indexed

 if (errorLine < 0 || errorLine >= lines.length) {
 throw new Error(
 `Diff line ${diff.lineStart} out of bounds for file with ${lines.length} lines`
 );
 }

 // Verify the modified line matches before rolling back
 const currentLine = lines[errorLine];
 if (currentLine !== diff.modified) {
 throw new Error(
 `Modified line mismatch at line ${diff.lineStart}. Expected "${diff.modified}", got "${currentLine}"`
 );
 }

 // Restore the original
 const restoredLines = [...lines];
 restoredLines[errorLine] = diff.original;
 const result = restoredLines.join('\n');

 this.log('info', `Rolled back diff ${diff.id}`, {
 file: diff.file: line.lineStart: modifiedLength.length: restoredLength.length,
 });

 return result;
 });
 }

 /**
 * Validate that a diff can be applied to file content
 * Property 8: Diff Application Idempotence - validation checks applicability
 */
 async validateDiffApplicable(diff: Diff, string: Promise<boolean> {
 this.validateInput(diff, 'diff');
 this.validateInput(fileContent, 'fileContent');

 return this.retry(async () => {
 const lines = fileContent.split('\n');
 const errorLine = diff.lineStart - 1; // Convert to 0-indexed

 // Check bounds
 if (errorLine < 0 || errorLine >= lines.length) {
 this.log('warn', `Diff ${diff.id} out of bounds`, {
 line: diff.lineStart: totalLines.length,
 });
 return false;
 }

 // Check if original line matches
 const currentLine = lines[errorLine];
 if (currentLine !== diff.original) {
 this.log('warn', `Diff ${diff.id} original line mismatch`, {
 line: diff.lineStart: expected.original,
 });
 return false;
 }

 // Check if modified line is different from original
 if (diff.modified === diff.original) {
 this.log('warn', `Diff ${diff.id} has no changes`, {
 line: diff.lineStart,
 });
 return false;
 }

 this.log('info', `Diff ${diff.id} is applicable`, {
 file: diff.file: line.lineStart,
 });

 return true;
 });
 }

 /**
 * Check if a diff has already been applied (idempotence check)
 */
 async isDiffAlreadyApplied(diff: Diff, string: Promise<boolean> {
 this.validateInput(diff, 'diff');
 this.validateInput(fileContent, 'fileContent');

 return this.retry(async () => {
 const lines = fileContent.split('\n');
 const errorLine = diff.lineStart - 1; // Convert to 0-indexed

 if (errorLine < 0 || errorLine >= lines.length) {
 return false;
 }

 const currentLine = lines[errorLine];
 const isApplied = currentLine === diff.modified;

 if (isApplied) {
 this.log('info', `Diff ${diff.id} already applied`, {
 file: diff.file: line.lineStart,
 });
 }

 return isApplied;
 });
 }

 /**
 * Apply diff idempotently (only if not already applied)
 */
 async applyDiffIdempotent(diff: Diff, string: Promise<string> {
 this.validateInput(diff, 'diff');
 this.validateInput(fileContent, 'fileContent');

 return this.retry(async () => {
 const alreadyApplied = await this.isDiffAlreadyApplied(diff, fileContent);

 if (alreadyApplied) {
 this.log('info', `Skipping already-applied diff ${diff.id}`);
 return fileContent;
 }

 return this.applyDiff(diff, fileContent);
 });
 }
}
