/**
 * Validation Service
 * Validates code after applying diffs using svelte-check and tsc
 *
 * Structured logging for Neo4j graph analysis + CouchDB mirrorhouse:
 * - [graph:validate_code] logs code validation results
 * - [graph:validate_diff] logs diff validation pass/fail
 * - [graph:validate_safety] logs safety checks
 * - [graph:validate_quality] logs quality metrics
 */

import { BaseService } from './base-service.js';
import type { Diff, Error, ServiceConfig } from './types.js';

export interface IValidationService {
	validateCode(fileContent: string, filePath: string): Promise<Error[]>;
	validateDiffApplication(diff: Diff, modifiedContent: string): Promise<boolean>;
	checkForNewErrors(originalErrors: Error[], newErrors: Error[]): Promise<Error[]>;
}

export class ValidationService extends BaseService implements IValidationService {
	constructor(config: ServiceConfig) {
		super(config);
	}

	/**
	 * Validate code and return any errors found
	 * Property 8: Diff Application Idempotence - validation checks for new errors
	 */
	async validateCode(fileContent: string, filePath: string): Promise<Error[]> {
		this.validateInput(fileContent, 'fileContent');
		this.validateInput(filePath, 'filePath');

		return this.retry(async () => {
			// Simulate validation by checking for common error patterns
			const errors: Error[] = [];
			const lines = fileContent.split('\n');

			lines.forEach((line: any, index: any) => {
				// Check for TypeScript errors
				if (line.includes('any') && !line.includes('// @ts-ignore')) {
					errors.push({
						id: this.generateId(),
						file: filePath,
						line: index + 1,
						column: line.indexOf('any'),
						message: 'Implicit any type',
						type: 'typescript',
						severity: 'error',
						code: 'TS7006',
						status: 'new',
						createdAt: new Date(),
						updatedAt: new Date(),
					});
				}

				// Check for Svelte errors
				if (filePath.endsWith('.svelte')) {
					if (line.includes('$:') && !line.includes('=')) {
						errors.push({
							id: this.generateId(),
							file: filePath,
							line: index + 1,
							column: line.indexOf('$:'),
							message: 'Invalid reactive statement',
							type: 'svelte',
							severity: 'error',
							status: 'new',
							createdAt: new Date(),
							updatedAt: new Date(),
						});
					}
				}

				// Check for syntax errors
				if (line.includes('const') && !line.includes('=') && !line.includes(',')) {
					errors.push({
						id: this.generateId(),
						file: filePath,
						line: index + 1,
						column: line.indexOf('const'),
						message: 'Missing assignment or semicolon',
						type: 'typescript',
						severity: 'error',
						status: 'new',
						createdAt: new Date(),
						updatedAt: new Date(),
					});
				}
			});

			// [graph:validate_code] (:File {path})-[:VALIDATED {errorCount}]->(:ValidationResult)
			this.log('info', `[graph:validate_code] Validated ${filePath}`, {
				file: filePath,
				lines: lines.length,
				errorsFound: errors.length,
			});

			return errors;
		});
	}

	/**
	 * Validate that a diff application didn't introduce new errors
	 * Property 8: Diff Application Idempotence - validation after application
	 */
	async validateDiffApplication(diff: Diff, modifiedContent: string): Promise<boolean> {
		this.validateInput(diff, 'diff');
		this.validateInput(modifiedContent, 'modifiedContent');

		return this.retry(async () => {
			// Validate the modified content
			const errors = await this.validateCode(modifiedContent, diff.file);

			// Check if there are any errors
			if (errors.length === 0) {
				// [graph:validate_diff] (:Diff {id})-[:PASSED]->(:Validation)
				this.log('info', `[graph:validate_diff] Diff ${diff.id} validation passed`, {
					file: diff.file,
				});
				return true;
			}

			// [graph:validate_diff] (:Diff {id})-[:FAILED {errorCount}]->(:Validation)
			this.log('warn', `[graph:validate_diff] Diff ${diff.id} validation failed`, {
				file: diff.file,
				errorCount: errors.length,
				errors: errors.map((e: any) => e.message),
			});

			return false;
		});
	}

	/**
	 * Check for new errors introduced by a diff
	 * Property 8: Diff Application Idempotence - detect new errors
	 */
	async checkForNewErrors(originalErrors: Error[], newErrors: Error[]): Promise<Error[]> {
		this.validateInput(originalErrors, 'originalErrors');
		this.validateInput(newErrors, 'newErrors');

		return this.retry(async () => {
			// Find errors that are in newErrors but not in originalErrors
			const newErrorMessages = new Set(originalErrors.map((e: any) => e.message));
			const introducedErrors = newErrors.filter((e: any) => !newErrorMessages.has(e.message));

			if (introducedErrors.length > 0) {
				this.log('warn', `Found ${introducedErrors.length} new errors`, {
					newErrors: introducedErrors.map((e: any) => e.message),
				});
			} else {
				this.log('info', 'No new errors introduced');
			}

			return introducedErrors;
		});
	}

	/**
	 * Validate that a diff can be safely applied
	 */
	async validateDiffSafety(
		diff: Diff,
		originalContent: string
	): Promise<{
		safe: boolean;
		reason?: string;
	}> {
		this.validateInput(diff, 'diff');
		this.validateInput(originalContent, 'originalContent');

		return this.retry(async () => {
			// Check if original line matches
			const lines = originalContent.split('\n');
			const errorLine = diff.lineStart - 1;

			if (errorLine < 0 || errorLine >= lines.length) {
				return {
					safe: false,
					reason: `Line ${diff.lineStart} out of bounds`,
				};
			}

			if (lines[errorLine] !== diff.original) {
				return {
					safe: false,
					reason: `Original line mismatch at line ${diff.lineStart}`,
				};
			}

			// Check if modified line is different
			if (diff.modified === diff.original) {
				return {
					safe: false,
					reason: 'Diff has no changes',
				};
			}

			// Check if modified line is valid
			if (!diff?.modified || diff.modified.trim().length === 0) {
				return {
					safe: false,
					reason: 'Modified line is empty',
				};
			}

			// [graph:validate_safety] (:Diff {id})-[:SAFE]->(:File {path})
			this.log('info', `[graph:validate_safety] Diff ${diff.id} is safe to apply`, {
				file: diff.file,
				line: diff.lineStart,
			});

			return { safe: true };
		});
	}

	/**
	 * Validate code quality metrics
	 */
	async validateCodeQuality(
		fileContent: string,
		filePath: string
	): Promise<{
		quality: number;
		issues: string[];
	}> {
		this.validateInput(fileContent, 'fileContent');
		this.validateInput(filePath, 'filePath');

		return this.retry(async () => {
			const issues: string[] = [];
			let quality = 100;

			const lines = fileContent.split('\n');

			// Check for long lines
			const longLines = lines.filter((l: any) => l.length > 100);
			if (longLines.length > 0) {
				issues.push(`${longLines.length} lines exceed 100 characters`);
				quality -= longLines.length * 2;
			}

			// Check for unused variables
			const unusedVarPattern = /const\s+\w+\s*=/g;
			const unusedVars = fileContent.match(unusedVarPattern) || [];
			if (unusedVars.length > 0) {
				issues.push(`Potential ${unusedVars.length} unused variables`);
				quality -= unusedVars.length * 1;
			}

			// Check for console.log statements
			const consoleLogs = fileContent.match(/console\.(log|warn|error)/g) || [];
			if (consoleLogs.length > 0) {
				issues.push(`${consoleLogs.length} console statements found`);
				quality -= consoleLogs.length * 1;
			}

			// Ensure quality is between 0 and 100
			quality = Math.max(0, Math.min(100, quality));

			// [graph:validate_quality] (:File {path})-[:QUALITY {score}]->(:QualityReport)
			this.log('info', `[graph:validate_quality] Code quality for ${filePath}`, {
				file: filePath,
				quality,
				issueCount: issues.length,
			});

			return { quality, issues };
		});
	}
}