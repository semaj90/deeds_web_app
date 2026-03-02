/**
 * Detective Mode Tools - Real Implementations
 *
 * Collection of 6 detective mode tools for autonomous codebase investigation.
 */

// Ripgrep Search
export {
	ripgrepSearch,
	formatRipgrepResults,
	isRipgrepInstalled,
	ripgrepSearchSchema,
	type RipgrepSearchInput,
	type RipgrepSearchResult,
	type RipgrepMatch
} from './ripgrep-search.js';

// Find Files
export {
	findFiles,
	findFilesByPatterns,
	formatFindFilesResults,
	findFilesSchema,
	type FindFilesInput,
	type FindFilesResult,
	type FileInfo
} from './find-files.js';

// Analyze File
export {
	analyzeFile,
	analyzeFiles,
	formatAnalyzeFileResults,
	analyzeFileSchema,
	type AnalyzeFileInput,
	type AnalyzeFileResult
} from './analyze-file.js';

// Extract Pattern
export {
	extractPattern,
	extractUniqueMatches,
	awkProcess,
	formatExtractPatternResults,
	extractPatternSchema,
	type ExtractPatternInput,
	type ExtractPatternResult,
	type AwkOperation
} from './extract-pattern.js';

// Analyze Imports
export {
	analyzeImports,
	buildDependencyGraph,
	formatAnalyzeImportsResults,
	analyzeImportsSchema,
	type AnalyzeImportsInput,
	type AnalyzeImportsResult,
	type ImportMatch,
	type DependencyNode
} from './analyze-imports.js';

// Web Search
export {
	webSearch,
	multiSourceSearch,
	formatWebSearchResults,
	webSearchSchema,
	type WebSearchInput,
	type WebSearchResult,
	type SearchResult
} from './web-search.js';
