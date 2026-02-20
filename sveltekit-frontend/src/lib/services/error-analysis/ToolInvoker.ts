/**
 * Tool Invoker — stub implementation
 * Runs diagnostic tools (svelte-check, tsc) on files.
 */

import type { DiagnosticResult } from './types.js';

export class ToolInvoker {
	async runDiagnostics(_filePath: string): Promise<DiagnosticResult> {
		return {
			tool: 'svelte-check',
			errors: [],
			warnings: [],
			timestamp: Date.now()
		};
	}

	async runTypeCheck(_filePath: string): Promise<DiagnosticResult> {
		return {
			tool: 'tsc',
			errors: [],
			warnings: [],
			timestamp: Date.now()
		};
	}
}

let instance: ToolInvoker | null = null;

export function getToolInvoker(): ToolInvoker {
	if (!instance) {
		instance = new ToolInvoker();
	}
	return instance;
}
