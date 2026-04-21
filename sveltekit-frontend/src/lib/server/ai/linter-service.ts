import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { existsSync } from 'fs';

const exec = promisify(execCallback);

export interface VerificationResult {
	success: boolean;
	hasErrors: boolean;
	errorCount: number;
	output: string;
	error?: string;
}

/**
 * LinterService — Verification backend for the Agentic Repair Loop.
 * 
 * Provides production-grade validation for Svelte and TypeScript files
 * using svelte-check and tsc.
 */
export class LinterService {
	/**
	 * Run svelte-check on a specific file.
	 * 
	 * @param filePath - Path to the file (absolute or relative to workspace root)
	 * @param options - Analysis depth options
	 */
	static async verifySvelteFile(
		filePath: string,
		options: { checkFull?: boolean; timeoutMs?: number } = {}
	): Promise<VerificationResult> {
		const basename = path.basename(filePath);
		const timeout = options.timeoutMs ?? 45000;
		const cwd = process.cwd();

		try {
			// svelte-check --threshold error
			// We grep for the filename to isolate errors related to the patched file
			const command = options.checkFull
				? 'npx svelte-check --threshold error'
				: `npx svelte-check --threshold error | grep -i "${basename}" || true`;

			const { stdout, stderr } = await exec(command, { 
				cwd, 
				timeout,
				env: { ...process.env, NO_COLOR: '1' } 
			});

			const combined = stdout + stderr;
			
			// Detect errors
			const hasErrors = combined.toLowerCase().includes('error') && 
				              combined.toLowerCase().includes(basename.toLowerCase());
			
			const errorMatches = combined.match(/ERROR:/gi) || [];

			return {
				success: !hasErrors,
				hasErrors,
				errorCount: errorMatches.length,
				output: combined.slice(0, 5000) // Truncate but keep context
			};
		} catch (err: any) {
			// Exit code 1 is expected if errors are found
			if (err.stdout || err.stderr) {
				const combined = (err.stdout || '') + (err.stderr || '');
				const hasErrors = combined.toLowerCase().includes(basename.toLowerCase());
				return {
					success: false,
					hasErrors,
					errorCount: (combined.match(/ERROR:/gi) || []).length || 1,
					output: combined.slice(0, 5000)
				};
			}
			return {
				success: false,
				hasErrors: true,
				errorCount: 1,
				output: '',
				error: err.message
			};
		}
	}

	/**
	 * Run tsc type-check on a TypeScript file.
	 */
	static async verifyTypes(filePath: string): Promise<VerificationResult> {
		if (!filePath.endsWith('.ts') && !filePath.endsWith('.js')) {
			return { success: true, hasErrors: false, errorCount: 0, output: 'Not a TS/JS file' };
		}

		try {
			// Note: tsc --noEmit doesn't support auditing a single file while respecting tsconfig easily.
			// We run svelte-check which includes tsc for .ts files in a Svelte project.
			return this.verifySvelteFile(filePath);
		} catch (err: any) {
			return { success: false, hasErrors: true, errorCount: 1, output: '', error: err.message };
		}
	}
}
