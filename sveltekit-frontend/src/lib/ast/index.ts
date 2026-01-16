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
    Autosuggestion
} from './ast-processor.js';

// Svelte-check analyzer
export { SvelteCheckAnalyzer as svelteCheckAnalyzer } from './svelte-check-analyzer.js';
export type {
    ASTAnalysisResult, ASTError,
    FunctionInfo, TypeInfo, VariableInfo
} from './svelte-check-analyzer.js';

// Suggestion engine
export { SuggestionEngine as suggestionEngine } from './suggestion-engine.js';
export type {
    ClusterInfo, CodebaseContext, Suggestion, SuggestionSource, WebSearchResult
} from './suggestion-engine.js';


