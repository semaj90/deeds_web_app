import { spawn } from 'child_process';
import { z } from 'zod';

/**
 * Ripgrep Search Tool - Real Implementation
 *
 * Fast regex codebase search using ripgrep (rg) binary.
 * Requires ripgrep installed: https://github.com/BurntSushi/ripgrep
 *
 * Install:
 * - Windows: choco install ripgrep
 * - macOS: brew install ripgrep
 * - Linux: apt install ripgrep
 */

export const ripgrepSearchSchema = z.object({
	pattern: z.string().describe('Regex pattern to search for'),
	fileType: z.string().optional().describe('File type filter (ts, py, svelte, js, etc.)'),
	contextLines: z.number().optional().default(0).describe('Number of context lines before/after match'),
	ignoreCase: z.boolean().optional().default(false).describe('Case-insensitive search'),
	maxResults: z.number().optional().default(100).describe('Maximum number of matches to return')
});

export type RipgrepSearchInput = z.infer<typeof ripgrepSearchSchema>;

export interface RipgrepMatch {
	filePath: string;
	lineNumber: number;
	content: string;
	contextBefore?: string[];
	contextAfter?: string[];
}

export interface RipgrepSearchResult {
	pattern: string;
	matches: RipgrepMatch[];
	totalMatches: number;
	filesSearched: number;
	duration: number;
	truncated: boolean;
}

/**
 * Execute ripgrep search
 */
export async function ripgrepSearch(input: RipgrepSearchInput): Promise<RipgrepSearchResult> {
	const startTime = Date.now();
	const { pattern, fileType, contextLines = 0, ignoreCase = false, maxResults = 100 } = input;

	// Build ripgrep arguments
	const args: string[] = [
		'--json', // JSON output for parsing
		'--no-heading',
		'--line-number',
		'--color=never'
	];

	// File type filter
	if (fileType) {
		args.push('--type', fileType);
	}

	// Context lines
	if (contextLines > 0) {
		args.push('--context', contextLines.toString());
	}

	// Case sensitivity
	if (ignoreCase) {
		args.push('--ignore-case');
	}

	// Max results (ripgrep uses --max-count per file)
	args.push('--max-count', Math.ceil(maxResults / 10).toString());

	// Pattern
	args.push(pattern);

	// Search path (current working directory)
	args.push('.');

	return new Promise((resolve, reject) => {
		const rg = spawn('rg', args, {
			cwd: process.cwd(),
			env: { ...process.env },
			windowsHide: true
		});

		let stdout = '';
		let stderr = '';

		rg.stdout.on('data', (data) => {
			stdout += data.toString();
		});

		rg.stderr.on('data', (data) => {
			stderr += data.toString();
		});

		rg.on('error', (err) => {
			// Ripgrep not installed
			reject(new Error(`Ripgrep not found. Install via: choco install ripgrep (Windows) or brew install ripgrep (macOS). Error: ${err.message}`));
		});

		rg.on('close', (code) => {
			const duration = Date.now() - startTime;

			// Exit code 0 = matches found, 1 = no matches, 2+ = error
			if (code === 2) {
				reject(new Error(`Ripgrep error: ${stderr}`));
				return;
			}

			// Parse JSON output
			const matches: RipgrepMatch[] = [];
			const filesSet = new Set<string>();
			let currentFile = '';
			let currentLineNumber = 0;
			const contextMap = new Map<string, { before: string[]; after: string[] }>();

			for (const line of stdout.split('\n')) {
				if (!line.trim()) continue;

				try {
					const json = JSON.parse(line);

					if (json.type === 'match') {
						const filePath = json.data.path.text;
						const lineNumber = json.data.line_number;
						const content = json.data.lines.text.trim();

						filesSet.add(filePath);

						// Limit results
						if (matches.length >= maxResults) {
							break;
						}

						matches.push({
							filePath,
							lineNumber,
							content,
							contextBefore: contextMap.get(`${filePath}:${lineNumber}`)?.before,
							contextAfter: contextMap.get(`${filePath}:${lineNumber}`)?.after
						});

						currentFile = filePath;
						currentLineNumber = lineNumber;
					} else if (json.type === 'context' && contextLines > 0) {
						// Context lines
						const filePath = json.data.path.text;
						const lineNumber = json.data.line_number;
						const content = json.data.lines.text.trim();

						const key = `${currentFile}:${currentLineNumber}`;
						if (!contextMap.has(key)) {
							contextMap.set(key, { before: [], after: [] });
						}

						const ctx = contextMap.get(key)!;
						if (lineNumber < currentLineNumber) {
							ctx.before.push(content);
						} else {
							ctx.after.push(content);
						}
					}
				} catch (err) {
					// Skip invalid JSON lines
					continue;
				}
			}

			resolve({
				pattern,
				matches,
				totalMatches: matches.length,
				filesSearched: filesSet.size,
				duration,
				truncated: matches.length >= maxResults
			});
		});
	});
}

/**
 * Format ripgrep results as markdown string
 */
export function formatRipgrepResults(result: RipgrepSearchResult): string {
	const { pattern, matches, totalMatches, filesSearched, duration, truncated } = result;

	if (matches.length === 0) {
		return `No matches found for pattern: ${pattern}`;
	}

	let output = `Found ${totalMatches} match${totalMatches === 1 ? '' : 'es'} across ${filesSearched} file${filesSearched === 1 ? '' : 's'} (${duration}ms)\n`;

	if (truncated) {
		output += `⚠️ Results truncated (showing first ${matches.length} matches)\n`;
	}

	output += '\n';

	// Group matches by file
	const matchesByFile = new Map<string, RipgrepMatch[]>();
	for (const match of matches) {
		if (!matchesByFile.has(match.filePath)) {
			matchesByFile.set(match.filePath, []);
		}
		matchesByFile.get(match.filePath)!.push(match);
	}

	// Format output
	for (const [filePath, fileMatches] of matchesByFile) {
		output += `\n📄 ${filePath} (${fileMatches.length} match${fileMatches.length === 1 ? '' : 'es'})\n`;

		for (const match of fileMatches) {
			output += `   Line ${match.lineNumber}: ${match.content}\n`;

			// Context lines
			if (match.contextBefore && match.contextBefore.length > 0) {
				output += `   Context before:\n`;
				for (const line of match.contextBefore) {
					output += `     ${line}\n`;
				}
			}
			if (match.contextAfter && match.contextAfter.length > 0) {
				output += `   Context after:\n`;
				for (const line of match.contextAfter) {
					output += `     ${line}\n`;
				}
			}
		}
	}

	return output;
}

/**
 * Check if ripgrep is installed
 */
export async function isRipgrepInstalled(): Promise<boolean> {
	return new Promise((resolve) => {
		const rg = spawn('rg', ['--version'], { windowsHide: true });

		rg.on('error', () => resolve(false));
		rg.on('close', (code) => resolve(code === 0));
	});
}
