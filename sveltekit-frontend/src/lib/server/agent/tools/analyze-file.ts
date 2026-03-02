import { readFile } from 'fs/promises';
import { z } from 'zod';
import { resolve } from 'path';

/**
 * Analyze File Tool - Real Implementation
 *
 * Reads and analyzes file contents with optional syntax highlighting context.
 */

export const analyzeFileSchema = z.object({
	filePath: z.string().describe('Path to file to analyze (relative to project root)'),
	language: z
		.string()
		.optional()
		.describe('Programming language for syntax context (ts, js, py, svelte, etc.)'),
	maxLines: z.number().optional().default(500).describe('Maximum number of lines to return'),
	startLine: z.number().optional().default(1).describe('Starting line number (1-indexed)'),
	endLine: z.number().optional().describe('Ending line number (inclusive)')
});

export type AnalyzeFileInput = z.infer<typeof analyzeFileSchema>;

export interface AnalyzeFileResult {
	filePath: string;
	language?: string;
	content: string;
	lines: number;
	size: number;
	truncated: boolean;
	encoding: string;
	startLine: number;
	endLine: number;
}

/**
 * Execute file analysis
 */
export async function analyzeFile(input: AnalyzeFileInput): Promise<AnalyzeFileResult> {
	const { filePath, language, maxLines = 500, startLine = 1, endLine } = input;

	try {
		// Resolve path relative to project root
		const absolutePath = resolve(process.cwd(), filePath);

		// Security check: Prevent path traversal outside project root
		if (!absolutePath.startsWith(process.cwd())) {
			throw new Error('Access denied: File path outside project root');
		}

		// Read file
		const buffer = await readFile(absolutePath);
		const encoding = detectEncoding(buffer);
		const fullContent = buffer.toString(encoding);

		// Split into lines
		const allLines = fullContent.split('\n');
		const totalLines = allLines.length;

		// Determine line range
		const actualStartLine = Math.max(1, startLine);
		const actualEndLine = endLine
			? Math.min(endLine, totalLines)
			: Math.min(actualStartLine + maxLines - 1, totalLines);

		// Extract requested lines (convert to 0-indexed)
		const requestedLines = allLines.slice(actualStartLine - 1, actualEndLine);
		const content = requestedLines.join('\n');

		// Detect language if not provided
		const detectedLanguage =
			language || detectLanguageFromPath(filePath) || detectLanguageFromContent(content);

		return {
			filePath,
			language: detectedLanguage,
			content,
			lines: totalLines,
			size: buffer.length,
			truncated: actualEndLine < totalLines,
			encoding,
			startLine: actualStartLine,
			endLine: actualEndLine
		};
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new Error(`File not found: ${filePath}`);
		}
		if ((err as NodeJS.ErrnoException).code === 'EACCES') {
			throw new Error(`Permission denied: ${filePath}`);
		}
		throw new Error(
			`Failed to analyze file: ${err instanceof Error ? err.message : 'Unknown error'}`
		);
	}
}

/**
 * Format file analysis results as markdown
 */
export function formatAnalyzeFileResults(result: AnalyzeFileResult): string {
	const { filePath, language, content, lines, size, truncated, startLine, endLine } = result;

	let output = `📄 ${filePath}\n`;
	output += `Language: ${language || 'unknown'} | Lines: ${lines} | Size: ${formatFileSize(size)}\n`;

	if (truncated) {
		output += `⚠️ Showing lines ${startLine}-${endLine} (truncated)\n`;
	}

	output += '\n```' + (language || '') + '\n';
	output += addLineNumbers(content, startLine);
	output += '\n```\n';

	return output;
}

/**
 * Add line numbers to content
 */
function addLineNumbers(content: string, startLine: number): string {
	const lines = content.split('\n');
	const maxLineNumWidth = String(startLine + lines.length - 1).length;

	return lines
		.map((line, idx) => {
			const lineNum = String(startLine + idx).padStart(maxLineNumWidth, ' ');
			return `${lineNum} | ${line}`;
		})
		.join('\n');
}

/**
 * Detect file encoding from buffer
 */
function detectEncoding(buffer: Buffer): BufferEncoding {
	// Check for UTF-8 BOM
	if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
		return 'utf8';
	}

	// Check for UTF-16 LE BOM
	if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
		return 'utf16le';
	}

	// Check for UTF-16 BE BOM
	if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
		// Node.js doesn't have utf16be, convert manually if needed
		return 'utf8'; // Fallback
	}

	// Default to UTF-8
	return 'utf8';
}

/**
 * Detect language from file path
 */
function detectLanguageFromPath(filePath: string): string | undefined {
	const ext = filePath.split('.').pop()?.toLowerCase();
	if (!ext) return undefined;

	const extensionMap: Record<string, string> = {
		ts: 'typescript',
		tsx: 'typescript',
		js: 'javascript',
		jsx: 'javascript',
		mjs: 'javascript',
		cjs: 'javascript',
		py: 'python',
		svelte: 'svelte',
		vue: 'vue',
		rs: 'rust',
		go: 'go',
		java: 'java',
		c: 'c',
		cpp: 'cpp',
		cc: 'cpp',
		cxx: 'cpp',
		h: 'c',
		hpp: 'cpp',
		cs: 'csharp',
		rb: 'ruby',
		php: 'php',
		swift: 'swift',
		kt: 'kotlin',
		scala: 'scala',
		sh: 'bash',
		bash: 'bash',
		zsh: 'zsh',
		md: 'markdown',
		json: 'json',
		yaml: 'yaml',
		yml: 'yaml',
		toml: 'toml',
		xml: 'xml',
		html: 'html',
		css: 'css',
		scss: 'scss',
		sass: 'sass',
		sql: 'sql'
	};

	return extensionMap[ext];
}

/**
 * Detect language from content (simple heuristics)
 */
function detectLanguageFromContent(content: string): string | undefined {
	const firstLine = content.split('\n')[0];

	// Shebang detection
	if (firstLine.startsWith('#!')) {
		if (firstLine.includes('python')) return 'python';
		if (firstLine.includes('node')) return 'javascript';
		if (firstLine.includes('bash') || firstLine.includes('sh')) return 'bash';
		if (firstLine.includes('ruby')) return 'ruby';
	}

	// Content-based heuristics
	if (content.includes('<script') && content.includes('</script>')) {
		if (content.includes('<template>')) return 'vue';
		return 'svelte';
	}

	if (content.includes('import ') && content.includes('from ')) {
		if (content.includes(': ')) return 'typescript';
		return 'javascript';
	}

	if (content.includes('def ') && content.includes(':')) return 'python';
	if (content.includes('func ') && content.includes('{')) return 'go';
	if (content.includes('fn ') && content.includes('{')) return 'rust';

	return undefined;
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Analyze multiple files in batch
 */
export async function analyzeFiles(
	filePaths: string[],
	options?: Partial<AnalyzeFileInput>
): Promise<AnalyzeFileResult[]> {
	const results = await Promise.allSettled(
		filePaths.map((filePath) =>
			analyzeFile({
				filePath,
				...options
			})
		)
	);

	return results
		.filter((result): result is PromiseFulfilledResult<AnalyzeFileResult> => result.status === 'fulfilled')
		.map((result) => result.value);
}
