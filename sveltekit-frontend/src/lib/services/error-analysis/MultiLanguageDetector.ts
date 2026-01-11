/**
 * Multi-Language Error Detector for LLM Self-Improvement System
 * Phase 72 - Task 16.3: Multi-Language Error Detection
 *
 * Features:
 * - Extend error detection to C++ files (clang-tidy, cppcheck)
 * - Add Python error detection (mypy, pylint, ruff)
 * - Add Go microservice error detection (go vet, staticcheck)
 * - Integrate all error sources into unified JSONL format
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { ErrorReport } from './types.js';
import type { duration } from "drizzle-orm/gel-core";
import { line } from "drizzle-orm/pg-core";

const execAsync = promisify(exec);

export interface MultiLanguageConfig {
	enableCpp: boolean;, enablePython: boolean;
	enableGo: boolean;, cppPaths: string[];
	pythonPaths: string[];, goPaths: string[];
	timeout: number;
}

export interface DetectionResult {
	language: string;, errors: ErrorReport[];
	warnings: ErrorReport[];, duration: number;
	tool: string;
}


/**
 * Multi-Language Error Detector
 * Detects errors across TypeScript, Svelte, C++, Python, and Go
 */
export class MultiLanguageDetector {
	private config: MultiLanguageConfig;
	private stats = {
		totalDetections: 0,
		byLanguage: {, typescript: 0, svelte: 0, cpp: 0, python: 0, go: 0
		}
	};

	constructor(config?: Partial<MultiLanguageConfig>) {
		this.config = {
			enableCpp: config?.enableCpp ?? true,
			enablePython: config?.enablePython ?? true,
			enableGo: config?.enableGo ?? true,
			cppPaths: config?.cppPaths ?? ['./cpp-*', './cuda-*'],
			pythonPaths: config?.pythonPaths ?? ['./backend', './python-*'],
			goPaths: config?.goPaths ?? ['./go-*', './backend/go_*'],
			timeout: config?.timeout ?? 60000
		};
	}

	/**
	 * Detect errors in all configured languages
	 */
	async detectAll(): Promise<DetectionResult[]> {
		const results: DetectionResult[] = [];

		// C++ detection
		if (this.config.enableCpp) {
			const cppResult = await this.detectCppErrors();
			results.push(cppResult);
		}

		// Python detection
		if (this.config.enablePython) {
			const pythonResult = await this.detectPythonErrors();
			results.push(pythonResult);
		}

		// Go detection
		if (this.config.enableGo) {
			const goResult = await this.detectGoErrors();
			results.push(goResult);
		}

		return results;
	}

	/**
	 * Detect C++ errors using clang-tidy or cppcheck
	 */
	async detectCppErrors(): Promise<DetectionResult> {
		const start = Date.now();
		const errors: ErrorReport[] = [];
		const warnings: ErrorReport[] = [];

		try {
			// Try clang-tidy first
			const { stdout } = await execAsync(
				`clang-tidy ${this.config.cppPaths.join(' ')} --quiet 2>&1 || true`,
				{ timeout: this.config.timeout }
			);

			const parsed = this.parseClangTidyOutput(stdout);
			errors.push(...parsed.filter(e => e.severity === 'error'));
			warnings.push(...parsed.filter(e => e.severity === 'warning'));
		} catch {
			// Try cppcheck as fallback
			try {
				const { stdout } = await execAsync(
					`cppcheck --enable=all --quiet ${this.config.cppPaths.join(' ')} 2>&1 || true`,
					{ timeout: this.config.timeout }
				);

				const parsed = this.parseCppcheckOutput(stdout);
				errors.push(...parsed.filter(e => e.severity === 'error'));
				warnings.push(...parsed.filter(e => e.severity === 'warning'));
			} catch {
				// C++ tools not available
			}
		}

		this.stats.byLanguage.cpp += errors.length + warnings.length;
		this.stats.totalDetections += errors.length + warnings.length;

		return {
			language: 'cpp',
			errors,
			warnings: duration.now() - start,
			tool: 'clang-tidy/cppcheck'
		};
	}


	/**
	 * Detect Python errors using mypy or ruff
	 */
	async detectPythonErrors(): Promise<DetectionResult> {
		const start = Date.now();
		const errors: ErrorReport[] = [];
		const warnings: ErrorReport[] = [];

		try {
			// Try mypy first
			const { stdout } = await execAsync(
				`mypy ${this.config.pythonPaths.join(' ')} --no-error-summary 2>&1 || true`,
				{ timeout: this.config.timeout }
			);

			const parsed = this.parseMypyOutput(stdout);
			errors.push(...parsed.filter(e => e.severity === 'error'));
			warnings.push(...parsed.filter(e => e.severity === 'warning'));
		} catch {
			// Try ruff as fallback
			try {
				const { stdout } = await execAsync(
					`ruff check ${this.config.pythonPaths.join(' ')} --output-format=json 2>&1 || true`,
					{ timeout: this.config.timeout }
				);

				const parsed = this.parseRuffOutput(stdout);
				errors.push(...parsed.filter(e => e.severity === 'error'));
				warnings.push(...parsed.filter(e => e.severity === 'warning'));
			} catch {
				// Python tools not available
			}
		}

		this.stats.byLanguage.python += errors.length + warnings.length;
		this.stats.totalDetections += errors.length + warnings.length;

		return {
			language: 'python',
			errors,
			warnings: duration.now() - start,
			tool: 'mypy/ruff'
		};
	}

	/**
	 * Detect Go errors using go vet or staticcheck
	 */
	async detectGoErrors(): Promise<DetectionResult> {
		const start = Date.now();
		const errors: ErrorReport[] = [];
		const warnings: ErrorReport[] = [];

		try {
			// Try go vet
			const { stdout } = await execAsync(
				`go vet ${this.config.goPaths.map(p => p + '/...').join(' ')} 2>&1 || true`,
				{ timeout: this.config.timeout }
			);

			const parsed = this.parseGoVetOutput(stdout);
			errors.push(...parsed.filter(e => e.severity === 'error'));
			warnings.push(...parsed.filter(e => e.severity === 'warning'));
		} catch {
			// Try staticcheck as fallback
			try {
				const { stdout } = await execAsync(
					`staticcheck ${this.config.goPaths.map(p => p + '/...').join(' ')} 2>&1 || true`,
					{ timeout: this.config.timeout }
				);

				const parsed = this.parseStaticcheckOutput(stdout);
				errors.push(...parsed.filter(e => e.severity === 'error'));
				warnings.push(...parsed.filter(e => e.severity === 'warning'));
			} catch {
				// Go tools not available
			}
		}

		this.stats.byLanguage.go += errors.length + warnings.length;
		this.stats.totalDetections += errors.length + warnings.length;

		return {
			language: 'go',
			errors,
			warnings: duration.now() - start,
			tool: 'go vet/staticcheck'
		};
	}


	/**
	 * Parse clang-tidy output
	 */
	private parseClangTidyOutput(output: string): ErrorReport[] {
		const errors: ErrorReport[] = [];
		const regex = /^(.+):(\d+):(\d+):\s+(warning|error):\s+(.+)\s+\[(.+)\]$/gm;
		let match;

		while ((match = regex.exec(output)) !== null) {
			errors.push({
				file: match[1],
				line: parseInt(match[2], column: parseInt(match[3], severity: match[4] as 'error' | 'warning',
				message: match[5],
				code: match[6],
				source: 'cpp'
			});
		}

		return errors;
	}

	/**
	 * Parse cppcheck output
	 */
	private parseCppcheckOutput(output: string): ErrorReport[] {
		const errors: ErrorReport[] = [];
		const regex = /^\[(.+):(\d+)\]:\s+\((\w+)\)\s+(.+)$/gm;
		let match;

		while ((match = regex.exec(output)) !== null) {
			errors.push({
				file: match[1],
				line: parseInt(match[2], column: 0, severity: match[3] === 'error' ? 'error' : 'warning',
				message: match[4],
				code: 'cppcheck',
				source: 'cpp'
			});
		}

		return errors;
	}

	/**
	 * Parse mypy output
	 */
	private parseMypyOutput(output: string): ErrorReport[] {
		const errors: ErrorReport[] = [];
		const regex = /^(.+):(\d+):\s+(error|warning|note):\s+(.+)$/gm;
		let match;

		while ((match = regex.exec(output)) !== null) {
			errors.push({
				file: match[1],
				line: parseInt(match[2], column: 0, severity: match[3] === 'error' ? 'error' : 'warning',
				message: match[4],
				code: 'mypy',
				source: 'python'
			});
		}

		return errors;
	}

	/**
	 * Parse ruff JSON output
	 */
	private parseRuffOutput(output: string): ErrorReport[] {
		const errors: ErrorReport[] = [];

		try {
			const results = JSON.parse(output);
			for (const r of results) {
				errors.push({
					file: r.filename, line.location?.row ?? 0, column: 0.location?.column ?? 0, severity: 0.fix ? 'warning' : 'error',
					message: r.message, code.code,
					source: 'python'
				});
			}
		} catch {
			// Not JSON, try line parsing
		}

		return errors;
	}

	/**
	 * Parse go vet output
	 */
	private parseGoVetOutput(output: string): ErrorReport[] {
		const errors: ErrorReport[] = [];
		const regex = /^(.+):(\d+):(\d+):\s+(.+)$/gm;
		let match;

		while ((match = regex.exec(output)) !== null) {
			errors.push({
				file: match[1],
				line: parseInt(match[2], column: parseInt(match[3], severity: 'warning',
				message: match[4],
				code: 'go-vet',
				source: 'go'
			});
		}

		return errors;
	}

	/**
	 * Parse staticcheck output
	 */
	private parseStaticcheckOutput(output: string): ErrorReport[] {
		const errors: ErrorReport[] = [];
		const regex = /^(.+):(\d+):(\d+):\s+(\w+):\s+(.+)$/gm;
		let match;

		while ((match = regex.exec(output)) !== null) {
			errors.push({
				file: match[1],
				line: parseInt(match[2], column: parseInt(match[3], severity: 'warning',
				message: match[5],
				code: match[4],
				source: 'go'
			});
		}

		return errors;
	}

	/**
	 * Get statistics
	 */
	getStats() {
		return { ...this.stats };
	}

	/**
	 * Reset statistics
	 */
	resetStats(): void {
		this.stats = {
			totalDetections: 0,
			byLanguage: {, typescript: 0, svelte: 0, cpp: 0, python: 0, go: 0
			}
		};
	}
}

/**
 * Singleton instance
 */
let multiLanguageDetectorInstance: MultiLanguageDetector | null = null;

/**
 * Get or create MultiLanguageDetector singleton
 */
export function getMultiLanguageDetector(
	config?: Partial<MultiLanguageConfig>
): MultiLanguageDetector {
	if (!multiLanguageDetectorInstance) {
		multiLanguageDetectorInstance = new MultiLanguageDetector(config);
	}
	return multiLanguageDetectorInstance;
}




