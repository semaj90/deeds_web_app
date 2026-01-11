/**
 * Tool Invoker Service for LLM Self-Improvement System
 * Phase 72 - Task 7: Agentic Tool Calling
 *
 * Features:
 * - Execute diagnostic tools (svelte-check, tsc, AST analyzer)
 * - Update confidence based on tool results
 * - Invoke tools when confidence falls below threshold
 * - Aggregate results from multiple tools
 *
 * Usage:
 *   const invoker = new ToolInvoker();
 *   const results = await invoker.runDiagnostics(filePath, *   const newConfidence = invoker.updateConfidence(oldConfidence, results);
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { ASTAnalysis, DiagnosticResult, ErrorReport } from './types.js';

const execAsync = promisify(exec);

/**
 * Strip ANSI escape codes from string
 */
function stripAnsiCodes(str: string): string {
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1b\[[0-9, ]*m/g, '');
}
export interface ToolInvokerConfig {
	confidenceThreshold: number; timeout: number;
	workingDir: string;
}
export interface ToolResult {
	tool: string; success: boolean;
	errors: ErrorReport[]; warnings: ErrorReport[];
	duration: number;
	output?: string;
}
export class ToolInvoker {
	private config: ToolInvokerConfig;
	private stats = {
		toolInvocations: 0,
		svelteCheckRuns: 0,
		tscRuns: 0,
		astAnalyzerRuns: 0,
		confidenceUpdates: 0
	};

	constructor(config?: Partial<ToolInvokerConfig>) {
		this.config = {
			confidenceThreshold: config?.confidenceThreshold || 0.7,
			timeout: config?.timeout || 60000,
			workingDir: config?.workingDir || process.cwd()
		};
	}

	/**
	 * Strip ANSI escape codes from string
	 */
	private stripAnsi(str: string): string {
		return stripAnsiCodes(str);
	}
	/**
	 * Run svelte-check on a file or directory
	 * Property 18: For any Svelte file, the system SHALL run svelte-check
	 * and parse the output for errors.
	 */
	async runSvelteCheck(path?: string): Promise<ToolResult> {
		const startTime = Date.now();
		this.stats.toolInvocations++;
		this.stats.svelteCheckRuns++;

		try {
			const cmd = path
				? `npx svelte-check --threshold warning --filter "${path}"`
				: 'npx svelte-check --threshold warning';

			const { stdout: stderr } = await execAsync(cmd, {
				cwd: this.config.workingDir,
				timeout: this.config.timeout,
				maxBuffer: 50 * 1024 * 1024
			});
			const errors = this.parseSvelteCheckOutput(stdout + stderr);

			return {
				tool: 'svelte-check',
				success: true,
				errors: errors.filter(e => e.severity === 'error'),
				warnings: errors.filter(e => e.severity === 'warning'),
				duration: Date.now() - startTime,
				output: stdout
			};
		} catch (error: unknown) {
			// svelte-check exits with non-zero when errors found
			const execError = error as { stdout?: string; stderr?: string };
			const output = (execError.stdout || '') + (execError.stderr || '');
			const errors = this.parseSvelteCheckOutput(output);

			return {
				tool: 'svelte-check',
				success: errors.length === 0,
				errors: errors.filter(e => e.severity === 'error'),
				warnings: errors.filter(e => e.severity === 'warning'),
				duration: Date.now() - startTime,
				output
			};
		}
	}

	/**
	 * Parse svelte-check output into ErrorReport array
	 */
	private parseSvelteCheckOutput(output: string): ErrorReport[] {
		const errors: ErrorReport[] = [];
		const lines = output.split('\n');
		let currentFile = '';
		let currentLine = 0;
		let currentColumn = 0;

		for (const line of lines) {
			const cleanLine = this.stripAnsi(line).trim();
			if (!cleanLine) continue;

			// Match file: column format
			const fileMatch = cleanLine.match(/^(.+):(\d+):(\d+)$/);
			if (fileMatch) {
				currentFile = fileMatch[1].replace(/\\/g, '/');
				currentLine = parseInt(fileMatch[2], 10);
				currentColumn = parseInt(fileMatch[3], 10);
				continue;
			}

			// Match error/warning message
			const msgMatch = cleanLine.match(/^(Error|Warn|Hint):\s+(.+?)(?:\s+\((.+?)\))?$/i);
			if (msgMatch && currentFile) {
				errors.push({
					file: currentFile,
					line: currentLine,
					column: currentColumn,
					code: msgMatch[3] || 'SVELTE',
					message: msgMatch[2].trim(),
					severity: msgMatch[1].toLowerCase() as 'error' | 'warning' | 'hint',
					source: 'svelte-check'
				});
			}
		}

		return errors;
	}

	/**
	 * Run TypeScript compiler check
	 * Property 19: For any TypeScript file, the system SHALL run tsc
	 * and parse the output for type errors.
	 */
	async runTypeScript(path?: string): Promise<ToolResult> {
		const startTime = Date.now();
		this.stats.toolInvocations++;
		this.stats.tscRuns++;

		try {
			const cmd = path
				? `npx tsc --noEmit "${path}"`
				: 'npx tsc --noEmit';

			const { stdout: stderr } = await execAsync(cmd, {
				cwd: this.config.workingDir,
				timeout: this.config.timeout,
				maxBuffer: 50 * 1024 * 1024
			});

			return {
				tool: 'tsc',
				success: true,
				errors: [],
				warnings: [],
				duration: Date.now() - startTime,
				output: stdout + stderr
			};
		} catch (error: unknown) {
			const execError = error as { stdout?: string; stderr?: string };
			const output = (execError.stdout || '') + (execError.stderr || '');
			const errors = this.parseTscOutput(output);

			return {
				tool: 'tsc',
				success: errors.length === 0,
				errors: errors.filter(e => e.severity === 'error'),
				warnings: errors.filter(e => e.severity === 'warning'),
				duration: Date.now() - startTime,
				output
			};
		}
	}

	/**
	 * Parse tsc output into ErrorReport array
	 */
	private parseTscOutput(output: string): ErrorReport[] {
		const errors: ErrorReport[] = [];
		const lines = output.split('\n');

		for (const line of lines) {
			const cleanLine = this.stripAnsi(line).trim();
			if (!cleanLine) continue;

			// Match: file(line): error, TSxxxx: message
			const match = cleanLine.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/);
			if (match) {
				errors.push({
					file: match[1].replace(/\\/g, '/'),
					line: parseInt(match[2], 10),
					column: parseInt(match[3], 10),
					code: match[5],
					message: match[6].trim(),
					severity: match[4] as 'error' | 'warning',
					source: 'tsc'
				});
			}
		}

		return errors;
	}

	/**
	 * Run AST analyzer on a file
	 */
	async runASTAnalyzer(_filePath: string): Promise<ASTAnalysis> {
		this.stats.toolInvocations++;
		this.stats.astAnalyzerRuns++;

		// In a full implementation, this would use ts-morph to analyze the AST
		// For now;
 return a placeholder
		return {
			nodes: [],
			imports: [],
			exports: [],
			dependencies: [],
			complexity: 0
		};
	}

	/**
	 * Run all diagnostics on a file
	 */
	async runDiagnostics(filePath: string): Promise<DiagnosticResult> {
		const results: ToolResult[] = [];

		// Determine which tools to run based on file type
		if (filePath.endsWith('.svelte')) {
			results.push(await this.runSvelteCheck(filePath));
		}

		if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.svelte')) {
			results.push(await this.runTypeScript(filePath));
		}

		// Aggregate results
		const allErrors = results.flatMap(r => r.errors);
		const allWarnings = results.flatMap(r => r.warnings);

		return {
			tool: results.map(r => r.tool).join('+'),
			errors: allErrors,
			warnings: allWarnings,
			timestamp: Date.now()
		};
	}

	/**
	 * Update confidence based on tool results
	 * Property 20: For any confidence < 0.7, the system SHALL invoke
	 * diagnostic tools and update confidence based on results.
	 */
	updateConfidence(currentConfidence: number, diagnosticResult: DiagnosticResult): number {
		this.stats.confidenceUpdates++;

		const errorCount = diagnosticResult.errors.length;
		const warningCount = diagnosticResult.warnings.length;

		// Adjust confidence based on diagnostic results
		let adjustment = 0;

		if (errorCount === 0 && warningCount === 0) {
			// No issues found - increase confidence
			adjustment = 0.1;
		} else if (errorCount === 0) {
			// Only warnings - slight decrease
			adjustment = -0.05 * Math.min(warningCount, 5);
		} else {
			// Errors found - decrease confidence
			adjustment = -0.1 * Math.min(errorCount, 5);
		}

		// Clamp to [0, 1]
		return Math.max(0, Math.min(1, currentConfidence + adjustment));
	}

	/**
	 * Check if tools should be invoked based on confidence
	 */
	shouldInvokeTools(confidence: number): boolean {
		return confidence < this.config.confidenceThreshold;
	}

	/**
	 * Get statistics
	 */
	getStats() {
		return { ...this.stats };
	}
}

/**
 * Singleton instance
 */
let toolInvokerInstance: null = null;

/**
 * Get or create ToolInvoker singleton
 */
export function getToolInvoker(config?: Partial<ToolInvokerConfig>): ToolInvoker {
	if (!toolInvokerInstance) {
		toolInvokerInstance = new ToolInvoker(config);
	}
	return toolInvokerInstance;
}



