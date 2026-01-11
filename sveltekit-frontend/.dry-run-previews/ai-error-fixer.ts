/**
 * AI-POWERED ERROR FIXING PIPELINE
 * Automated TypeScript error resolution with LLM assistance
 */
import { writable, derived } from 'svelte/store';

export interface FixAttempt {
	id: string;
	errorId: string;
	strategy: string;
	originalCode: string;
	fixedCode: string;
	confidence: number;
	applied: boolean;
	result: 'success' | 'failed' | 'partial';
	timestamp: Date;
	llmModel?: string;
}

export interface ErrorFix {
	errorId: string;
	file: string;
	line: number;
	originalText: string;
	fixedText: string;
	strategy: string;
	confidence: number;
	reasoning: string;
	dependencies: string[];
	validated: boolean;
}

export interface AIFixConfig {
	model: string;
	endpoint: string;
	maxRetries: number;
	confidenceThreshold: number;
	batchSize: number;
	validateFixes: boolean;
	embeddingModel: string;
}

export interface ErrorAnalysisResult {
	id: string;
	file?: string;
	line?: number;
	originalCode?: string;
	code?: string;
	message?: string;
	category?: string;
	fixable?: boolean;
	confidence?: number;
	dependencies?: string[];
	[key: string]: unknown;
}

export class AIErrorFixer {
	private config: AIFixConfig = {
		model: 'gemma3-legal',
		endpoint: 'http://localhost:11434/api/generate',
		maxRetries: 3,
		confidenceThreshold: 0.7,
		batchSize: 10,
		validateFixes: true,
		embeddingModel: 'nomic-embed-text'
	};

	private fixHistory = new Map<string, FixAttempt[]>();

	async fixErrors(errors: ErrorAnalysisResult[]): Promise<ErrorFix[]> {
		if (!errors || errors.length === 0) return [];

		const startTime = performance.now();
		const fixableErrors = errors.filter(
			(e) =>
				e &&
				e.fixable &&
				(typeof e.confidence === 'number' ? e.confidence > this.config.confidenceThreshold : true)
		);

		if (fixableErrors.length === 0) return [];

		const batches = this.createBatches(fixableErrors, this.config.batchSize);
		const allFixes: ErrorFix[] = [];

		for (const batch of batches) {
			const batchFixes = await this.processBatch(batch);
			allFixes.push(...batchFixes);
		}

		const processingTime = performance.now() - startTime;
		console.log(`AI fixing completed in ${processingTime.toFixed(2)}ms`);

		return allFixes;
	}

	private async processBatch(errors: ErrorAnalysisResult[]): Promise<ErrorFix[]> {
		const fixes: ErrorFix[] = [];

		for (const err of errors) {
			try {
				const fix = await this.generateFix(err);
				if (fix) {
					fixes.push(fix);
					await this.cacheFixAttempt(err.id, fix);
				}
			} catch (e) {
				console.error('Error fixing failed for', err?.id, e);
			}
		}

		return fixes;
	}

	private async generateFix(error: ErrorAnalysisResult): Promise<ErrorFix | null> {
		const cached = await this.getCachedFix(error.id);
		if (cached) return cached;

		const fix = await this.generateAIFix(error);
		if (fix && this.config.validateFixes) {
			fix.validated = await this.validateFix(fix);
		}

		return fix;
	}

	private async generateAIFix(error: ErrorAnalysisResult): Promise<ErrorFix | null> {
		const prompt = this.createFixPrompt(error);

		try {
			const response = await fetch(this.config.endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: this.config.model,
					prompt,
					options: {
						temperature: 0.1,
						top_p: 0.9,
						max_tokens: 1000
					}
				})
			});

			if (!response.ok) return null;

			const data = await response.json();
			const responseText = data?.response || data?.text || '';

			if (!responseText) return null;
			return this.parseFixResponse(error, responseText);
		} catch (e) {
			console.error('AI fix failed:', e);
			return null;
		}
	}

	private createFixPrompt(error: ErrorAnalysisResult): string {
		const line = error.line || 0;
		const original = error.originalCode ?? '// Code not available';

		return `You are a TypeScript expert. Fix this error:

Error: ${error.code || 'unknown'} - ${error.message || ''}
File: ${error.file || 'unknown'}
Line: ${line}
Category: ${error.category || 'general'}

Context around line ${line}:
\`\`\`typescript
// Line ${Math.max(0, line - 1)}:
// Line ${line}: ${original}
\`\`\`

Provide ONLY the fixed code for line ${line} with format:
FIXED_CODE: [your fix here]
REASONING: [brief explanation]
CONFIDENCE: [0.0-1.0]

Common fixes for ${error.code || 'unknown'}:
${this.getCommonFixes(error.code || '')}`;
	}

	private getCommonFixes(code: string): string {
		const fixes: Record<string, string> = {
			TS1434: '- Remove unexpected keyword\n- Fix identifier syntax\n- Check for typos',
			TS2304: '- Add missing import\n- Declare the variable\n- Check spelling',
			TS2307: '- Fix module path\n- Install missing package\n- Check file exists',
			TS2457: '- Rename type alias\n- Use different name\n- Avoid reserved keywords',
			TS1005: '- Add missing semicolon\n- Add missing comma\n- Check syntax',
			TS1128: '- Add missing declaration\n- Complete the statement\n- Fix syntax'
		};
		return fixes[code] || '- Manual review required\n- Check TypeScript documentation';
	}

	private parseFixResponse(error: ErrorAnalysisResult, response: string): ErrorFix | null {
		try {
			const fixedCodeMatch = response.match(/FIXED_CODE:\s*([\s\S]*?)(?:\nREASONING:|\nCONFIDENCE:|$)/i);
			const reasoningMatch = response.match(/REASONING:\s*([\s\S]*?)(?:\nCONFIDENCE:|$)/i);
			const confidenceMatch = response.match(/CONFIDENCE:\s*([\d.]+)/i);

			if (!fixedCodeMatch) return null;

			const fixedText = fixedCodeMatch[1].trim();
			const reasoning = reasoningMatch?.[1]?.trim() || 'AI generated fix';
			const confidence = parseFloat(confidenceMatch?.[1] || '0.5');

			const fix: ErrorFix = {
				errorId: error.id,
				file: error.file || 'unknown',
				line: error.line || 0,
				originalText: error.originalCode || '',
				fixedText,
				strategy: this.getFixStrategy(error.code),
				confidence,
				reasoning,
				dependencies: (error.dependencies as string[]) || [],
				validated: false
			};

			return fix;
		} catch (e) {
			console.error('Failed to parse response:', e);
			return null;
		}
	}

	private getFixStrategy(code?: string): string {
		const strategies: Record<string, string> = {
			TS1434: 'syntax_cleanup',
			TS2304: 'add_import',
			TS2307: 'fix_module_path',
			TS2457: 'rename_type',
			TS1005: 'add_punctuation',
			TS1128: 'add_declaration'
		};
		return (code && strategies[code]) || 'manual_fix';
	}

	private async validateFix(fix: ErrorFix): Promise<boolean> {
		if (!fix || !fix.fixedText) return false;
		if (fix.fixedText === fix.originalText) return false;
		if (fix.confidence < this.config.confidenceThreshold) return false;

		try {
			if (fix.strategy === 'add_punctuation' && !/[,.{}()[\]]/.test(fix.fixedText)) return false;
			if (fix.strategy === 'add_import' && !/import\s+/.test(fix.fixedText)) return false;
			return true;
		} catch {
			return false;
		}
	}

	private async getCachedFix(errorId: string): Promise<ErrorFix | null> {
		// Placeholder for cache lookup
		return null;
	}

	private async cacheFixAttempt(errorId: string, fix: ErrorFix): Promise<void> {
		const attempt: FixAttempt = {
			id: `fix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			errorId,
			strategy: fix.strategy,
			originalCode: fix.originalText,
			fixedCode: fix.fixedText,
			confidence: fix.confidence,
			applied: false,
			result: 'success',
			timestamp: new Date(),
			llmModel: this.config.model
		};

		const history = this.fixHistory.get(errorId) || [];
		history.push(attempt);
		this.fixHistory.set(errorId, history);
	}

	async applyFixes(fixes: ErrorFix[]): Promise<{ applied: number; failed: number; results: unknown[] }> {
		const results: unknown[] = [];
		let applied = 0;
		let failed = 0;

		for (const fix of fixes) {
			try {
				if (fix.validated && fix.confidence >= this.config.confidenceThreshold) {
					const result = await this.applyFix(fix);
					results.push(result);
					if ((result as any).success) applied++;
					else failed++;
				} else {
					results.push({
						errorId: fix.errorId,
						success: false,
						reason: 'Fix not validated or confidence too low'
					});
					failed++;
				}
			} catch (e) {
				console.error(`Failed to apply fix for ${fix.errorId}:`, e);
				results.push({ errorId: fix.errorId, success: false, error: String(e) });
				failed++;
			}
		}

		return { applied, failed, results };
	}

	private async applyFix(fix: ErrorFix): Promise<{ errorId: string; success: boolean; reason?: string }> {
		try {
			const resp = await fetch('/api/files/read', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ file: fix.file })
			});

			if (!resp.ok) {
				return { errorId: fix.errorId, success: false, reason: 'Could not read file' };
			}

			const { content } = await resp.json();
			const lines = typeof content === 'string' ? content.split(/\r?\n/) : [];

			if (fix.line <= 0 || fix.line > lines.length + 1) {
				return { errorId: fix.errorId, success: false, reason: 'Line number out of range' };
			}

			lines[fix.line - 1] = fix.fixedText;

			const writeResp = await fetch('/api/files/write', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ file: fix.file, content: lines.join('\n') })
			});

			if (!writeResp.ok) {
				return { errorId: fix.errorId, success: false, reason: 'Could not write file' };
			}

			const history = this.fixHistory.get(fix.errorId) || [];
			const last = history[history.length - 1];
			if (last) last.applied = true;

			return { errorId: fix.errorId, success: true };
		} catch (e) {
			return { errorId: fix.errorId, success: false, reason: String(e) };
		}
	}

	getFixHistory(errorId?: string): FixAttempt[] {
		if (errorId) return this.fixHistory.get(errorId) || [];
		return Array.from(this.fixHistory.values()).flat();
	}

	getStats() {
		const allAttempts = this.getFixHistory();
		const totalAttempts = allAttempts.length;
		const successfulFixes = allAttempts.filter((a) => a.result === 'success').length;
		const failedFixes = allAttempts.filter((a) => a.result === 'failed').length;
		const averageConfidence =
			allAttempts.reduce((sum, a) => sum + (a.confidence || 0), 0) / (allAttempts.length || 1);
		const appliedFixes = allAttempts.filter((a) => a.applied).length;

		return {
			totalAttempts,
			successfulFixes,
			failedFixes,
			averageConfidence,
			appliedFixes
		};
	}

	private createBatches<T>(items: T[], size: number): T[][] {
		const out: T[][] = [];
		for (let i = 0; i < items.length; i += size) {
			out.push(items.slice(i, i + size));
		}
		return out;
	}
}

// Store integration
export const aiErrorFixer = new AIErrorFixer();

export const errorFixerStore = writable({
	initialized: false,
	fixing: false,
	fixes: [] as ErrorFix[],
	appliedFixes: 0,
	failedFixes: 0,
	stats: {
		totalAttempts: 0,
		successfulFixes: 0,
		failedFixes: 0,
		averageConfidence: 0,
		appliedFixes: 0
	}
});

export const fixerProgressStore = derived(errorFixerStore, ($store) => ({
	active: $store.fixing,
	totalFixes: $store.fixes.length,
	applied: $store.appliedFixes,
	failed: $store.failedFixes,
	successRate:
		$store.appliedFixes + $store.failedFixes > 0
			? $store.appliedFixes / ($store.appliedFixes + $store.failedFixes)
			: 0
}));

export const aiErrorFixerAPI = {
	async initialize() {
		errorFixerStore.update((s) => ({ ...s, initialized: true }));
	},

	async processAndFixErrors(tscOutput: string) {
		errorFixerStore.update((s) => ({ ...s, fixing: true }));

		try {
			// Parse errors from tsc output
			const analysisResults: ErrorAnalysisResult[] = [];
			const lines = tscOutput.split('\n');

			for (const line of lines) {
				const match = line.match(/(.+)\((\d+),(\d+)\): error (TS\d+): (.+)/);
				if (match) {
					analysisResults.push({
						id: `${match[1]}:${match[2]}:${match[4]}`,
						file: match[1],
						line: parseInt(match[2]),
						code: match[4],
						message: match[5],
						fixable: true,
						confidence: 0.8
					});
				}
			}

			const fixes = await aiErrorFixer.fixErrors(analysisResults);
			const applyResults = await aiErrorFixer.applyFixes(fixes);
			const stats = aiErrorFixer.getStats();

			errorFixerStore.update((state) => ({
				...state,
				fixing: false,
				fixes,
				appliedFixes: applyResults.applied,
				failedFixes: applyResults.failed,
				stats
			}));

			return {
				totalErrors: analysisResults.length,
				fixesGenerated: fixes.length,
				appliedFixes: applyResults.applied,
				failedFixes: applyResults.failed,
				fixes
			};
		} catch (error) {
			console.error('Error fixing failed:', error);
			errorFixerStore.update((s) => ({ ...s, fixing: false }));
			throw error;
		}
	},

	async getStats() {
		return aiErrorFixer.getStats();
	},

	async getFixHistory(errorId?: string) {
		return aiErrorFixer.getFixHistory(errorId);
	}
};
