/**
 * Enhanced Ripgrep (rg) + AWK Search Utility
 *
 * Generates a structured JSON index from raw ripgrep results.
 * Includes a stable execution ID: rg_search_timestamp_id
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export interface RgSearchResult {
	file: string;
	line: number;
	column: number;
	text: string;
	timestamp_id: string;
}

/**
 * Executes an enhanced ripgrep search and formats the output.
 * @param query The search term
 * @param searchPath Directory or file path to search
 */
export function executeEnhancedRgSearch(query: string, searchPath: string): RgSearchResult[] {
	const timestampId = `rg-${Date.now()}-${createHash('md5').update(query).digest('hex').slice(0, 6)}`;
	const args = [
		'-n',
		'--column',
		'--no-heading',
		'--color', 'never',
		'--max-count', '20',
		query,
		searchPath,
	];

	try {
		const result = spawnSync('rg', args, {
			encoding: 'utf8',
			maxBuffer: 50 * 1024 * 1024,
			windowsVerbatimArguments: false,
		});

		if (result.error) {
			throw result.error;
		}

		const output = String(result.stdout ?? '');
		const lines = output.split('\n').filter(Boolean);
		return lines.map(line => {
			const parts = line.split(':');
			const filePath = parts[0] ?? '';
			const lineNum = parseInt(parts[1] ?? '0', 10);
			const colNum = parseInt(parts[2] ?? '0', 10);
			const text = parts.slice(3).join(':').trim();

			return {
				file: filePath,
				line: lineNum,
				column: colNum,
				text,
				timestamp_id: timestampId,
			};
		});
	} catch (error) {
		console.error('[rg-search] Execution failed:', error);
		return [];
	}
}
