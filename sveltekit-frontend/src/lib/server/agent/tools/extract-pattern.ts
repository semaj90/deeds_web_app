import { z } from 'zod';

/**
 * Extract Pattern Tool - Real Implementation
 *
 * awk/sed-like text processing with regex patterns.
 * Supports extract, replace, and count operations.
 */

export const extractPatternSchema = z.object({
	text: z.string().describe('Input text to process'),
	pattern: z.string().describe('Regex pattern to match'),
	operation: z.enum(['extract', 'replace', 'count']).describe('Operation to perform'),
	replacement: z.string().optional().describe('Replacement string (for replace operation)'),
	flags: z
		.string()
		.optional()
		.default('g')
		.describe('Regex flags (g=global, i=ignore case, m=multiline)'),
	maxMatches: z.number().optional().default(100).describe('Maximum number of matches to return')
});

export type ExtractPatternInput = z.infer<typeof extractPatternSchema>;

export interface ExtractPatternResult {
	operation: string;
	pattern: string;
	matches?: string[];
	count?: number;
	result?: string;
	lines?: Array<{ lineNumber: number; content: string; match: string }>;
	totalMatches: number;
	truncated: boolean;
}

/**
 * Execute pattern extraction/replacement
 */
export function extractPattern(input: ExtractPatternInput): ExtractPatternResult {
	const { text, pattern, operation, replacement = '', flags = 'g', maxMatches = 100 } = input;

	try {
		const regex = new RegExp(pattern, flags);

		switch (operation) {
			case 'extract':
				return extractMatches(text, regex, maxMatches, pattern);

			case 'replace':
				return replaceMatches(text, regex, replacement, pattern);

			case 'count':
				return countMatches(text, regex, pattern);

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	} catch (err) {
		throw new Error(
			`Pattern extraction failed: ${err instanceof Error ? err.message : 'Unknown error'}`
		);
	}
}

/**
 * Extract all matches
 */
function extractMatches(
	text: string,
	regex: RegExp,
	maxMatches: number,
	pattern: string
): ExtractPatternResult {
	const matches: string[] = [];
	const lines: Array<{ lineNumber: number; content: string; match: string }> = [];
	const textLines = text.split('\n');

	let match: RegExpExecArray | null;
	let totalMatches = 0;

	// Iterate through all lines
	for (let lineIdx = 0; lineIdx < textLines.length; lineIdx++) {
		const line = textLines[lineIdx];
		const lineRegex = new RegExp(regex.source, regex.flags); // Fresh regex for each line

		while ((match = lineRegex.exec(line)) !== null) {
			totalMatches++;

			// Limit results
			if (matches.length >= maxMatches) {
				break;
			}

			const matchStr = match[0];
			matches.push(matchStr);

			lines.push({
				lineNumber: lineIdx + 1,
				content: line.trim(),
				match: matchStr
			});

			// Prevent infinite loop on zero-width matches
			if (match.index === lineRegex.lastIndex) {
				lineRegex.lastIndex++;
			}
		}

		if (matches.length >= maxMatches) {
			break;
		}
	}

	return {
		operation: 'extract',
		pattern,
		matches,
		lines,
		totalMatches,
		truncated: totalMatches > maxMatches
	};
}

/**
 * Replace all matches
 */
function replaceMatches(
	text: string,
	regex: RegExp,
	replacement: string,
	pattern: string
): ExtractPatternResult {
	let totalMatches = 0;
	const result = text.replace(regex, (match, ...args) => {
		totalMatches++;
		return replacement;
	});

	return {
		operation: 'replace',
		pattern,
		result,
		totalMatches,
		truncated: false
	};
}

/**
 * Count all matches
 */
function countMatches(text: string, regex: RegExp, pattern: string): ExtractPatternResult {
	let totalMatches = 0;
	let match: RegExpExecArray | null;

	const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');

	while ((match = globalRegex.exec(text)) !== null) {
		totalMatches++;

		// Prevent infinite loop on zero-width matches
		if (match.index === globalRegex.lastIndex) {
			globalRegex.lastIndex++;
		}
	}

	return {
		operation: 'count',
		pattern,
		count: totalMatches,
		totalMatches,
		truncated: false
	};
}

/**
 * Format pattern extraction results as markdown
 */
export function formatExtractPatternResults(result: ExtractPatternResult): string {
	const { operation, pattern, matches, count, lines, totalMatches, truncated } = result;

	let output = `Pattern: ${pattern}\n`;
	output += `Operation: ${operation}\n`;
	output += `Total matches: ${totalMatches}\n`;

	if (truncated) {
		output += `⚠️ Results truncated (showing first ${matches?.length || 0} matches)\n`;
	}

	output += '\n';

	switch (operation) {
		case 'extract':
			if (matches && matches.length > 0) {
				output += '**Matches:**\n';
				for (let i = 0; i < Math.min(matches.length, 20); i++) {
					output += `${i + 1}. ${matches[i]}\n`;
				}

				if (matches.length > 20) {
					output += `... and ${matches.length - 20} more matches\n`;
				}

				if (lines && lines.length > 0) {
					output += '\n**Match Locations:**\n';
					for (let i = 0; i < Math.min(lines.length, 10); i++) {
						const line = lines[i];
						output += `Line ${line.lineNumber}: ${line.content}\n`;
						output += `  → Match: "${line.match}"\n`;
					}

					if (lines.length > 10) {
						output += `... and ${lines.length - 10} more locations\n`;
					}
				}
			} else {
				output += 'No matches found.\n';
			}
			break;

		case 'replace':
			if (result.result) {
				output += '**Result (first 500 chars):**\n';
				output += '```\n';
				output += result.result.substring(0, 500);
				if (result.result.length > 500) {
					output += '\n... (truncated)';
				}
				output += '\n```\n';
			}
			break;

		case 'count':
			output += `**Count:** ${count || 0} match${count === 1 ? '' : 'es'} found\n`;
			break;
	}

	return output;
}

/**
 * Extract unique matches (deduplicated)
 */
export function extractUniqueMatches(text: string, pattern: string, flags = 'g'): string[] {
	const regex = new RegExp(pattern, flags);
	const matches = new Set<string>();

	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		matches.add(match[0]);

		// Prevent infinite loop on zero-width matches
		if (match.index === regex.lastIndex) {
			regex.lastIndex++;
		}
	}

	return Array.from(matches);
}

/**
 * Advanced pattern operations (awk-like)
 */
export interface AwkOperation {
	pattern: string;
	action: (match: string, lineNumber: number, line: string) => string | null;
}

/**
 * Apply awk-like operations to text
 */
export function awkProcess(text: string, operations: AwkOperation[]): string[] {
	const lines = text.split('\n');
	const results: string[] = [];

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const line = lines[lineIdx];

		for (const op of operations) {
			const regex = new RegExp(op.pattern, 'g');
			let match: RegExpExecArray | null;

			while ((match = regex.exec(line)) !== null) {
				const result = op.action(match[0], lineIdx + 1, line);
				if (result !== null) {
					results.push(result);
				}

				// Prevent infinite loop
				if (match.index === regex.lastIndex) {
					regex.lastIndex++;
				}
			}
		}
	}

	return results;
}
