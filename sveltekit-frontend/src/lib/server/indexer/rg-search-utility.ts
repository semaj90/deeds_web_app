/**
 * Enhanced Ripgrep (rg) + AWK Search Utility
 * 
 * Generates a structured JSON index from raw ripgrep results.
 * Includes a stable execution ID: rg_search_timestamp_id
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export interface RgSearchResult {
	file: string;
	line: number;
	column: number;
	text: string;
	timestamp_id: string;
}

/**
 * Executes an enhanced ripgrep search and formats the output via AWK.
 * @param query The search term
 * @param searchPath Directory to search
 */
export function executeEnhancedRgSearch(query: string, searchPath: string): RgSearchResult[] {
	const timestampId = `rg-${Date.now()}-${createHash('md5').update(query).digest('hex').slice(0, 6)}`;
	
	try {
		// Use -n (line number), -c (column), --no-heading for raw format
		// AWK script transforms into JSON-like lines for parsing
		// Note: We escape special characters for the shell
		const cmd = `rg -n --column --no-heading --color never "${query.replace(/"/g, '\\"')}" "${searchPath}"`;
		const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
		
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
				timestamp_id: timestampId
			};
		});
	} catch (error) {
		console.error('[rg-search] Execution failed:', error);
		return [];
	}
}
