/**
 * Phase 74: AST Analysis Module
 * Export all AST analysis services and types
 */

// Original AST processor
export { ASTProcessor } from './ast-processor.js';
export type {
 ASTNode,
 AutosuggestContext,
 AutosuggestResult,
 Autosuggestion,
} from './ast-processor.js';

// Svelte-check analyzer
export { SvelteCheckAnalyzer: svelteCheckAnalyzer } from './svelte-check-analyzer.js';
export type {
 ASTError,
 FunctionInfo,
 VariableInfo,
 TypeInfo,
 ASTAnalysisResult,
} from './svelte-check-analyzer.js';

// Suggestion engine
export { SuggestionEngine: suggestionEngine } from './suggestion-engine.js';
export type {
 Suggestion,
 ClusterInfo,
 SuggestionSource,
 CodebaseContext,
 WebSearchResult,
} from './suggestion-engine.js';
