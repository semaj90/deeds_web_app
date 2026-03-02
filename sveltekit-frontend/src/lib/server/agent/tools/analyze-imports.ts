import { z } from 'zod';
import { findFiles } from './find-files.js';
import { analyzeFile } from './analyze-file.js';

/**
 * Analyze Imports Tool - Real Implementation
 *
 * Track dependencies and usage via import statement analysis.
 * Scans files for import statements and builds dependency graph.
 */

export const analyzeImportsSchema = z.object({
	filePattern: z
		.string()
		.describe('Glob pattern to match files (e.g., "**/*.ts", "src/**/*.svelte")'),
	importName: z.string().describe('Package/module name to search for (e.g., "@lucide/svelte")'),
	maxFiles: z.number().optional().default(50).describe('Maximum number of files to analyze')
});

export type AnalyzeImportsInput = z.infer<typeof analyzeImportsSchema>;

export interface ImportMatch {
	filePath: string;
	lineNumber: number;
	importStatement: string;
	importedItems: string[];
	importType: 'default' | 'named' | 'namespace' | 'side-effect';
}

export interface AnalyzeImportsResult {
	importName: string;
	filePattern: string;
	matches: ImportMatch[];
	totalFiles: number;
	filesWithImport: number;
	totalImports: number;
	importTypes: {
		default: number;
		named: number;
		namespace: number;
		sideEffect: number;
	};
	uniqueImportedItems: string[];
	duration: number;
}

/**
 * Execute import analysis
 */
export async function analyzeImports(input: AnalyzeImportsInput): Promise<AnalyzeImportsResult> {
	const startTime = Date.now();
	const { filePattern, importName, maxFiles = 50 } = input;

	// Find files matching pattern
	const findResult = await findFiles({ pattern: filePattern, maxResults: maxFiles });

	const matches: ImportMatch[] = [];
	const importTypes = { default: 0, named: 0, namespace: 0, sideEffect: 0 };
	const uniqueItems = new Set<string>();

	// Analyze each file
	for (const file of findResult.files) {
		try {
			const fileResult = await analyzeFile({ filePath: file.relativePath, maxLines: 1000 });
			const fileMatches = extractImportsFromContent(
				fileResult.content,
				importName,
				file.relativePath
			);

			for (const match of fileMatches) {
				matches.push(match);

				// Track import type
				importTypes[match.importType]++;

				// Track imported items
				for (const item of match.importedItems) {
					uniqueItems.add(item);
				}
			}
		} catch (err) {
			// Skip files that can't be analyzed
			console.warn(`[AnalyzeImports] Could not analyze file: ${file.relativePath}`, err);
		}
	}

	const filesWithImport = new Set(matches.map((m) => m.filePath)).size;
	const duration = Date.now() - startTime;

	return {
		importName,
		filePattern,
		matches,
		totalFiles: findResult.totalFiles,
		filesWithImport,
		totalImports: matches.length,
		importTypes,
		uniqueImportedItems: Array.from(uniqueItems),
		duration
	};
}

/**
 * Extract import statements from file content
 */
function extractImportsFromContent(
	content: string,
	importName: string,
	filePath: string
): ImportMatch[] {
	const matches: ImportMatch[] = [];
	const lines = content.split('\n');

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const line = lines[lineIdx].trim();

		// Skip comments
		if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
			continue;
		}

		// Check if line contains import from the specified package
		if (!line.includes(importName)) {
			continue;
		}

		// Parse different import types
		const importMatch = parseImportStatement(line, importName);
		if (importMatch) {
			matches.push({
				...importMatch,
				filePath,
				lineNumber: lineIdx + 1
			});
		}
	}

	return matches;
}

/**
 * Parse import statement to extract type and items
 */
function parseImportStatement(
	line: string,
	importName: string
): Omit<ImportMatch, 'filePath' | 'lineNumber'> | null {
	// Side-effect import: import 'package'
	const sideEffectMatch = line.match(
		new RegExp(`^import\\s+['"]${escapeRegex(importName)}['"]`)
	);
	if (sideEffectMatch) {
		return {
			importStatement: line,
			importedItems: [],
			importType: 'side-effect'
		};
	}

	// Default import: import Foo from 'package'
	const defaultMatch = line.match(
		new RegExp(`^import\\s+(\\w+)\\s+from\\s+['"]${escapeRegex(importName)}['"]`)
	);
	if (defaultMatch) {
		return {
			importStatement: line,
			importedItems: [defaultMatch[1]],
			importType: 'default'
		};
	}

	// Named imports: import { Foo, Bar } from 'package'
	const namedMatch = line.match(
		new RegExp(`^import\\s+\\{([^}]+)\\}\\s+from\\s+['"]${escapeRegex(importName)}['"]`)
	);
	if (namedMatch) {
		const items = namedMatch[1]
			.split(',')
			.map((item) => {
				// Handle "as" aliases
				const parts = item.trim().split(/\s+as\s+/);
				return parts[0].trim();
			})
			.filter(Boolean);

		return {
			importStatement: line,
			importedItems: items,
			importType: 'named'
		};
	}

	// Namespace import: import * as Foo from 'package'
	const namespaceMatch = line.match(
		new RegExp(`^import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+['"]${escapeRegex(importName)}['"]`)
	);
	if (namespaceMatch) {
		return {
			importStatement: line,
			importedItems: [namespaceMatch[1]],
			importType: 'namespace'
		};
	}

	// Mixed: import Foo, { Bar, Baz } from 'package'
	const mixedMatch = line.match(
		new RegExp(
			`^import\\s+(\\w+)\\s*,\\s*\\{([^}]+)\\}\\s+from\\s+['"]${escapeRegex(importName)}['"]`
		)
	);
	if (mixedMatch) {
		const defaultItem = mixedMatch[1];
		const namedItems = mixedMatch[2]
			.split(',')
			.map((item) => item.trim().split(/\s+as\s+/)[0].trim())
			.filter(Boolean);

		return {
			importStatement: line,
			importedItems: [defaultItem, ...namedItems],
			importType: 'named' // Treat mixed as named for stats
		};
	}

	return null;
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Format import analysis results as markdown
 */
export function formatAnalyzeImportsResults(result: AnalyzeImportsResult): string {
	const {
		importName,
		filePattern,
		matches,
		totalFiles,
		filesWithImport,
		totalImports,
		importTypes,
		uniqueImportedItems,
		duration
	} = result;

	let output = `📦 Import Analysis: ${importName}\n`;
	output += `Pattern: ${filePattern}\n`;
	output += `Files scanned: ${totalFiles} | Files with import: ${filesWithImport} | Total imports: ${totalImports}\n`;
	output += `Duration: ${duration}ms\n\n`;

	// Import type breakdown
	output += '**Import Types:**\n';
	output += `  Default: ${importTypes.default}\n`;
	output += `  Named: ${importTypes.named}\n`;
	output += `  Namespace: ${importTypes.namespace}\n`;
	output += `  Side-effect: ${importTypes.sideEffect}\n\n`;

	// Unique imported items
	if (uniqueImportedItems.length > 0) {
		output += `**Imported Items (${uniqueImportedItems.length}):**\n`;
		const displayItems = uniqueImportedItems.slice(0, 20);
		output += displayItems.join(', ');
		if (uniqueImportedItems.length > 20) {
			output += `, ... and ${uniqueImportedItems.length - 20} more`;
		}
		output += '\n\n';
	}

	// Files using import
	if (matches.length > 0) {
		output += `**Files (showing first 10):**\n`;

		// Group by file
		const byFile = new Map<string, ImportMatch[]>();
		for (const match of matches) {
			if (!byFile.has(match.filePath)) {
				byFile.set(match.filePath, []);
			}
			byFile.get(match.filePath)!.push(match);
		}

		let fileCount = 0;
		for (const [filePath, fileMatches] of byFile) {
			if (fileCount >= 10) break;
			fileCount++;

			output += `\n📄 ${filePath} (${fileMatches.length} import${fileMatches.length === 1 ? '' : 's'})\n`;
			for (const match of fileMatches.slice(0, 3)) {
				output += `   Line ${match.lineNumber}: ${match.importStatement}\n`;
			}
			if (fileMatches.length > 3) {
				output += `   ... and ${fileMatches.length - 3} more\n`;
			}
		}

		if (byFile.size > 10) {
			output += `\n... and ${byFile.size - 10} more files\n`;
		}
	}

	return output;
}

/**
 * Build dependency graph for a package
 */
export interface DependencyNode {
	package: string;
	files: string[];
	importCount: number;
	importedItems: string[];
}

export async function buildDependencyGraph(
	packageName: string,
	filePattern = '**/*.{ts,tsx,js,jsx,svelte}'
): Promise<DependencyNode> {
	const result = await analyzeImports({ filePattern, importName: packageName });

	return {
		package: packageName,
		files: Array.from(new Set(result.matches.map((m) => m.filePath))),
		importCount: result.totalImports,
		importedItems: result.uniqueImportedItems
	};
}
