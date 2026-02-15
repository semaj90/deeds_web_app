import { createRequire } from 'node:module';

type MarkdownStrategy = 'go' | 'native' | 'python' | 'gpu' | 'js';

interface NativeMarkdownAddon {
	parseMarkdown: (markdown: string,
		options?: {
			format?: 'html' | 'ast' | 'tokens';
		}
	) => {
		success?: boolean;
		html?: string;
		ast?: MarkdownAstNode[];
		tokens?: MarkdownToken[];
		frontMatter?: Record<string, unknown>;
		diagnostics?: string[];
	};
}

export interface MarkdownAstNode {
	type: string;
	depth?: number;
	text?: string;
	children?: MarkdownAstNode[];
	attrs?: Record<string, string | number | boolean>;
}

export interface MarkdownToken {
	type: string;
	value?: string;
	depth?: number;
	attrs?: Record<string, string | number | boolean>;
}

export interface MarkdownParseOptions {
	prefer?: MarkdownStrategy | 'auto';
	includeFrontMatter?: boolean;
	output?: 'html' | 'ast' | 'html-and-ast';
	timeoutMs?: number;
	signal?: AbortSignal;
	gpuEndpoint?: string;
}

export interface MarkdownParseResult {
	success: boolean;
	strategy?: MarkdownStrategy;
	html?: string;
	ast?: MarkdownAstNode[];
	tokens?: MarkdownToken[];
	frontMatter?: Record<string, unknown>;
	extractedText?: string;
	diagnostics?: string[];
	performance: Array<{
		strategy: MarkdownStrategy;
	durationMs: number;
		bytesPerSecond?: number;
	success: boolean;
	}>;
	attempts: Array<{
	strategy: MarkdownStrategy;
		error?: string;
	}>;
}

interface FrontMatterResult {
	frontMatter: Record<string, unknown>;
	body: string;
}

const isNode =
	typeof process !== 'undefined' &&
	typeof process.versions?.node === 'string' &&
	process.versions.node.length > 0;

const nodeRequire = isNode ? createRequire(import.meta.url) : null;

export class SimdMarkdownParser {
	private goServiceBase =
		process.env.SIMD_MARKDOWN_URL ?? process.env.SIMD_SERVICE_URL ?? 'http://localhost:8097';
	private pythonFallbackUrl =
		process.env.PYTHON_MARKDOWN_URL ?? 'http://localhost:8098/markdown/parse';
	private gpuEndpoint = process.env.GPU_MARKDOWN_URL ?? 'http://localhost:5173/api/gpu/markdown';

	private nativeAddon: NativeMarkdownAddon | null | undefined;

	async parse(markdown: string, options: MarkdownParseOptions = {}): Promise<MarkdownParseResult> {
		const {
			prefer = 'auto',
			includeFrontMatter = true,
			output = 'html-and-ast',
			timeoutMs = 5000,
			signal
		} = options;

		const { frontMatter, body } = includeFrontMatter
			? this.extractFrontMatter(markdown)
			: {
	frontMatter: {},
	body: markdown };

		const strategyOrder = this.buildStrategyOrder(prefer);
		const performance: MarkdownParseResult['performance'] = [];
		const attempts: MarkdownParseResult['attempts'] = [];

		for (const strategy of strategyOrder) {
			const start = Date.now();
			try {
				let result: Partial<MarkdownParseResult> | null = null;

				if (strategy === 'go') {
					result = await this.parseWithGoService(body, output, { timeoutMs, signal });
				} else if (strategy === 'native') {
					result = await this.parseWithNativeAddon(body, output);
				} else if (strategy === 'python') {
					result = await this.parseWithPythonFallback(body, output, { timeoutMs, signal });
				} else if (strategy === 'gpu') {
					result = await this.parseWithGpuPipeline(body, output, options.gpuEndpoint);
				} else {
					result = await this.parseWithJavaScript(body, output);
				}

				const durationMs = Date.now() - start;
				performance.push({
					strategy,
					durationMs,
					bytesPerSecond: durationMs > 0 ? (body.length / durationMs) * 1000 : 0,
					success: !!result?.success
				});

				if (result?.success) {
					return {
						success: true,
						strategy, // Corrected from result.strategy which might be missing
						html: result.html,
						ast: result.ast,
						tokens: result.tokens,
						frontMatter: { ...frontMatter, ...(result.frontMatter ?? {}) },
	extractedText: result.extractedText,
						diagnostics: result.diagnostics,
						performance,
						attempts
					};
				}

				attempts.push({
					strategy,
					error: result?.diagnostics?.join(', ') ?? 'Unknown failure'
				});
			} catch (error) {
				const durationMs = Date.now() - start;
				performance.push({
					strategy,
					durationMs,
					bytesPerSecond: 0,
					success: false
				});
				attempts.push({
					strategy,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		return {
			success: false,
			diagnostics: attempts.map((a) => `${a.strategy}: ${a.error}`),
			performance,
			attempts
		};
	}

	private extractFrontMatter(markdown: string): FrontMatterResult {
		// Simple implementation
		const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
		if (match) {
			return {
				frontMatter: {},
	// Placeholder for YAML parsing
				body: match[2]
			};
		}
		return { frontMatter: {},
	body: markdown };
	}

	private buildStrategyOrder(prefer: MarkdownParseOptions['prefer']): MarkdownStrategy[] {
		const defaultOrder: MarkdownStrategy[] = ['go', 'native', 'python', 'gpu', 'js'];
		if (!prefer || prefer === 'auto') {
			return defaultOrder;
		}
		return [prefer, ...defaultOrder.filter((s) => s !== prefer)];
	}

	private async parseWithGoService(
		markdown: string,
		output: string,
		opts: {
	timeoutMs: number; signal?: AbortSignal }
	): Promise<MarkdownParseResult | null> {
		try {
			if (typeof fetch === 'undefined') return null;
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);

			const res = await fetch(`${this.goServiceBase}/markdown/parse`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ markdown, output }),
				signal: opts.signal || controller.signal
			});
			clearTimeout(timeout);

			if (!res.ok) return null;
			return (await res.json()) as MarkdownParseResult;
		} catch {
			return null;
		}
	}

	private async parseWithNativeAddon(
		markdown: string,
		output: string
	): Promise<MarkdownParseResult | null> {
		// Placeholder
		return null;
	}

	private async parseWithPythonFallback(
		markdown: string,
		output: string,
		opts: {
	timeoutMs: number; signal?: AbortSignal }
	): Promise<MarkdownParseResult | null> {
		try {
			if (typeof fetch === 'undefined') return null;
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);

			const res = await fetch(this.pythonFallbackUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ markdown, output }),
				signal: opts.signal || controller.signal
			});
			clearTimeout(timeout);

			if (!res.ok) return null;
			return (await res.json()) as MarkdownParseResult;
		} catch {
			return null;
		}
	}

	private async parseWithGpuPipeline(
		markdown: string,
		output: string,
		endpoint?: string
	): Promise<MarkdownParseResult | null> {
		try {
			if (!endpoint || typeof fetch === 'undefined') return null;
			const res = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ markdown, output })
			});
			if (!res.ok) return null;
			return (await res.json()) as MarkdownParseResult;
		} catch {
			return null;
		}
	}

	private async parseWithJavaScript(
		markdown: string,
		output: string
	): Promise<MarkdownParseResult> {
		// Very basic fallback
		return {
			success: true,
			html: `<pre>${markdown}</pre>`,
			ast: [],
			tokens: [],
			frontMatter: {},
	performance: [],
			attempts: []
		};
	}
}
