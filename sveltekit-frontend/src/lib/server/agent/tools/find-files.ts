import fg from 'fast-glob';
import { z } from 'zod';
import { stat } from 'fs/promises';

/**
 * Find Files Tool - Real Implementation
 *
 * Fast file finding using glob patterns via fast-glob.
 * Supports glob patterns like "**\/*.ts", "src/**\/*.svelte", etc.
 */

export const findFilesSchema = z.object({
	pattern: z.string().describe('Glob pattern to match files (e.g., "**/*.ts", "src/**/*.svelte")'),
	maxResults: z.number().optional().default(100).describe('Maximum number of files to return'),
	ignoreCase: z.boolean().optional().default(false).describe('Case-insensitive matching'),
	excludePatterns: z
		.array(z.string())
		.optional()
		.default(['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'])
		.describe('Patterns to exclude from search')
});

export type FindFilesInput = z.input<typeof findFilesSchema>;

export interface FileInfo {
	path: string;
	relativePath: string;
	size: number;
	modified: Date;
	extension: string;
}

export interface FindFilesResult {
	pattern: string;
	files: FileInfo[];
	totalFiles: number;
	duration: number;
	truncated: boolean;
}

/**
 * Execute file search using glob patterns
 */
export async function findFiles(input: FindFilesInput): Promise<FindFilesResult> {
	const startTime = Date.now();
	const { pattern, maxResults = 100, ignoreCase = false, excludePatterns = [] } = input;

	try {
		// Fast-glob options
		const options: fg.Options = {
			cwd: process.cwd(),
			ignore: excludePatterns,
			caseSensitiveMatch: !ignoreCase,
			absolute: true,
			onlyFiles: true,
			stats: false, // We'll stat manually for file info
			followSymbolicLinks: false
		};

		// Execute glob search
		const filePaths = await fg(pattern, options);

		// Limit results
		const limitedPaths = filePaths.slice(0, maxResults);

		// Get file info for each result
		const files: FileInfo[] = [];
		for (const filePath of limitedPaths) {
			try {
				const stats = await stat(filePath);
				const relativePath = filePath.replace(process.cwd(), '').replace(/^[/\\]/, '');
				const extension = filePath.split('.').pop() || '';

				files.push({
					path: filePath,
					relativePath,
					size: stats.size,
					modified: stats.mtime,
					extension
				});
			} catch (err) {
				// Skip files that can't be stat'd (permissions, deleted, etc.)
				console.warn(`[FindFiles] Could not stat file: ${filePath}`, err);
			}
		}

		const duration = Date.now() - startTime;

		return {
			pattern,
			files,
			totalFiles: files.length,
			duration,
			truncated: filePaths.length > maxResults
		};
	} catch (err) {
		throw new Error(
			`File search failed: ${err instanceof Error ? err.message : 'Unknown error'}`
		);
	}
}

/**
 * Format find results as markdown string
 */
export function formatFindFilesResults(result: FindFilesResult): string {
	const { pattern, files, totalFiles, duration, truncated } = result;

	if (files.length === 0) {
		return `No files found matching pattern: ${pattern}`;
	}

	let output = `Found ${totalFiles} file${totalFiles === 1 ? '' : 's'} matching "${pattern}" (${duration}ms)\n`;

	if (truncated) {
		output += `⚠️ Results truncated (showing first ${files.length} files)\n`;
	}

	output += '\n';

	// Group by extension
	const byExtension = new Map<string, FileInfo[]>();
	for (const file of files) {
		const ext = file.extension || '(no extension)';
		if (!byExtension.has(ext)) {
			byExtension.set(ext, []);
		}
		byExtension.get(ext)!.push(file);
	}

	// Sort extensions by file count
	const sortedExtensions = Array.from(byExtension.entries()).sort((a, b) => b[1].length - a[1].length);

	// Format output
	for (const [ext, extFiles] of sortedExtensions) {
		output += `\n📁 .${ext} files (${extFiles.length})\n`;

		// Sort by size (largest first) and take top 10 per extension
		const topFiles = extFiles
			.sort((a, b) => b.size - a.size)
			.slice(0, 10);

		for (const file of topFiles) {
			const sizeStr = formatFileSize(file.size);
			const dateStr = file.modified.toLocaleDateString();
			output += `   ${file.relativePath} (${sizeStr}, ${dateStr})\n`;
		}

		if (extFiles.length > 10) {
			output += `   ... and ${extFiles.length - 10} more\n`;
		}
	}

	return output;
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
 * Find files by multiple patterns (OR logic)
 */
export async function findFilesByPatterns(
	patterns: string[],
	options?: Partial<FindFilesInput>
): Promise<FindFilesResult> {
	const startTime = Date.now();
	const allFiles = new Set<string>();

	// Execute each pattern
	for (const pattern of patterns) {
		const result = await findFiles({ pattern, ...options });
		for (const file of result.files) {
			allFiles.add(file.path);
		}
	}

	// Convert back to FileInfo array
	const files: FileInfo[] = [];
	for (const filePath of Array.from(allFiles)) {
		try {
			const stats = await stat(filePath);
			const relativePath = filePath.replace(process.cwd(), '').replace(/^[/\\]/, '');
			const extension = filePath.split('.').pop() || '';

			files.push({
				path: filePath,
				relativePath,
				size: stats.size,
				modified: stats.mtime,
				extension
			});
		} catch (err) {
			// Skip files that can't be stat'd
		}
	}

	const duration = Date.now() - startTime;
	const maxResults = options?.maxResults || 100;

	return {
		pattern: patterns.join(' OR '),
		files: files.slice(0, maxResults),
		totalFiles: files.length,
		duration,
		truncated: files.length > maxResults
	};
}
