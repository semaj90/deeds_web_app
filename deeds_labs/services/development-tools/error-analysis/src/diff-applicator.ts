/**
 * Diff Applicator Service
 * Applies diffs to code using AST manipulation
 *
 * Structured logging for Neo4j graph analysis + CouchDB mirrorhouse:
 * - [graph:diff_apply] logs apply/rollback operations as graph edges
 * - [graph:diff_validate] logs validation checks
 */

import { BaseService } from './base-service.js';
import type { Diff, ServiceConfig } from './types.js';

export interface IDiffApplicator {
	applyDiff(diff: Diff, fileContent: string): Promise<string>;
	rollbackDiff(diff: Diff, modifiedContent: string): Promise<string>;
	validateDiffApplicable(diff: Diff, fileContent: string): Promise<boolean>;
}

export class DiffApplicator extends BaseService implements IDiffApplicator {
	constructor(config: ServiceConfig) {
		super(config);
	}

	/**
	 * Apply a diff to file content
	 * Property 8: Diff Application Idempotence - applying same diff twice results in same state
	 */
	async applyDiff(diff: Diff, fileContent: string): Promise<string> {
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

			const currentLine = lines[errorLine];
			if (currentLine !== diff.original) {
				throw new Error(
					`Original line mismatch at line ${diff.lineStart}. Expected "${diff.original}", got "${currentLine}"`
				);
			}

			const modifiedLines = [...lines];
			modifiedLines[errorLine] = diff.modified;
			const result = modifiedLines.join('\n');

			// [graph:diff_apply] (:Diff)-[:APPLIED_TO]->(:File)
			this.log('info', `[graph:diff_apply] Applied diff ${diff.id}`, {
				file: diff.file,
				line: diff.lineStart,
				originalLength: diff.original.length,
				modifiedLength: diff.modified.length,
			});

			return result;
		});
	}

	/**
	 * Rollback a diff (restore original content)
	 * Property 8: Diff Application Idempotence - rollback restores original state
	 */
	async rollbackDiff(diff: Diff, modifiedContent: string): Promise<string> {
		this.validateInput(diff, 'diff');
		this.validateInput(modifiedContent, 'modifiedContent');

		return this.retry(async () => {
			const lines = modifiedContent.split('\n');
			const errorLine = diff.lineStart - 1;

			if (errorLine < 0 || errorLine >= lines.length) {
				throw new Error(
					`Diff line ${diff.lineStart} out of bounds for file with ${lines.length} lines`
				);
			}

			const currentLine = lines[errorLine];
			if (currentLine !== diff.modified) {
				throw new Error(
					`Modified line mismatch at line ${diff.lineStart}. Expected "${diff.modified}", got "${currentLine}"`
				);
			}

			const restoredLines = [...lines];
			restoredLines[errorLine] = diff.original;
			const result = restoredLines.join('\n');

			// [graph:diff_apply] (:Diff)-[:ROLLED_BACK]->(:File)
			this.log('info', `[graph:diff_apply] Rolled back diff ${diff.id}`, {
				file: diff.file,
				line: diff.lineStart,
				modifiedLength: diff.modified.length,
				restoredLength: diff.original.length,
			});

			return result;
		});
	}

	/**
	 * Validate that a diff can be applied to file content
	 * Property 8: Diff Application Idempotence - validation checks applicability
	 */
	async validateDiffApplicable(diff: Diff, fileContent: string): Promise<boolean> {
		this.validateInput(diff, 'diff');
		this.validateInput(fileContent, 'fileContent');

		return this.retry(async () => {
			const lines = fileContent.split('\n');
			const errorLine = diff.lineStart - 1;

			if (errorLine < 0 || errorLine >= lines.length) {
				this.log('warn', `[graph:diff_validate] Diff ${diff.id} out of bounds`, {
					line: diff.lineStart,
					totalLines: lines.length,
				});
				return false;
			}

			const currentLine = lines[errorLine];
			if (currentLine !== diff.original) {
				this.log('warn', `[graph:diff_validate] Diff ${diff.id} original line mismatch`, {
					line: diff.lineStart,
					expected: diff.original,
				});
				return false;
			}

			if (diff.modified === diff.original) {
				this.log('warn', `[graph:diff_validate] Diff ${diff.id} has no changes`, {
					line: diff.lineStart,
				});
				return false;
			}

			this.log('info', `[graph:diff_validate] Diff ${diff.id} is applicable`, {
				file: diff.file,
				line: diff.lineStart,
			});
			return true;
		});
	}

	/**
	 * Check if a diff has already been applied (idempotence check)
	 */
	async isDiffAlreadyApplied(diff: Diff, fileContent: string): Promise<boolean> {
		this.validateInput(diff, 'diff');
		this.validateInput(fileContent, 'fileContent');

		return this.retry(async () => {
			const lines = fileContent.split('\n');
			const errorLine = diff.lineStart - 1;

			if (errorLine < 0 || errorLine >= lines.length) {
				return false;
			}

			const currentLine = lines[errorLine];
			const isApplied = currentLine === diff.modified;

			if (isApplied) {
				this.log('info', `[graph:diff_validate] Diff ${diff.id} already applied`, {
					file: diff.file,
					line: diff.lineStart,
				});
			}

			return isApplied;
		});
	}

	/**
	 * Apply diff idempotently (only if not already applied)
	 */
	async applyDiffIdempotent(diff: Diff, fileContent: string): Promise<string> {
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