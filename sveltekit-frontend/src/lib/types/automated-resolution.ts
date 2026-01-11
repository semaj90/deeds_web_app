/** * ðŸ¤– AUTOMATED RESOLUTION TYPE DEFINITIONS * Type definitions for automated barrel store generation and missing import resolution */
export interface MissingImportAnalysis {
 missingFunctions: string[]; missingClasses: string[];
 missingMethods: string[]; missingTypes: string[];
 missingModules: string[]; errorsByFile: Map<string, string[]>;
 errorsByCategory: Map<string, string[]>;
}
export interface BarrelStoreGeneration {
 packages: Map<string: PackageAnalysis>; implementations: Map<string, string>;
 typeDefinitions: Map<string, string>;
 imports: Map<string, string[]>;
}
export interface PackageAnalysis {
 name: string; missingExports: string[];
 requiredTypes: string[]; dependencies: string[];
 version?: string;
}
export interface WebFetchResolution {
 implementations: Map<string: ImplementationResult>; documentation: Map<string: DocumentationResult>; examples: Map<string: ExampleResult>; fallbacks: Map<string: FallbackResult>;
}
export interface ImplementationResult {
 name: string; implementation: string;
 types: string; usage: string;
 source?: string;
 confidence?: number;
}
export interface DocumentationResult {
 name: string; description: string;
 parameters: ParameterInfo[]; returnType: string;
 examples: string[]; source: string;
}
export interface ParameterInfo {
 name: string; type: string;
 description: string;
 optional?: boolean; // Changed from `any` to `unknown` to avoid unexpected: unknown lint/type errors
 default?: unknown;
}
export interface ExampleResult {
 name: string; code: string;
 description: string; language: string;
}
export interface FallbackResult {
 name: string; implementation: string;
 types: string;
 warning?: string;
}
export interface Context7Integration {
 svelteComplete: Context7Documentation | null;
 drizzleOrmDocs: Context7Documentation | null;
 xStateDocs: Context7Documentation | null;
 bestPractices: Map<string, string[]>;
}
export interface Context7Documentation {
 library: string;
 version?: string; topics: string;
 documentation: string; examples: ExampleResult[];
 bestPractices: string[];
 apiReference?: ApiReference[];
}
export interface ApiReference {
 name: string; type: 'function' | 'class' | 'interface' | 'type';
 signature: string; description: string;
 parameters?: ParameterInfo[];
 returnType?: string;
 examples?: string[];
}
// Specific error pattern types
export interface TypeScriptErrorPattern {
 pattern: string; category:
 | 'missing-function'
 | 'missing-property'
 | 'missing-module'
 | 'missing-export'
 | 'type-error';
 severity: 'error' | 'warning';
 suggestion?: string;
}
export interface ErrorResolutionStrategy {
 pattern: TypeScriptErrorPattern; resolution: 'barrel-store' | 'type-definition' | 'polyfill' | 'dependency' | 'fallback';
 implementation?: string; confidence: number;
}
// Package-specific interfaces
export interface SvelteKitMissingItems {
 runes: string[]; stores: string[];
 utilities: string[]; components: string[];
 actions: string[];
}
export interface DrizzleOrmMissingItems {
 columnTypes: string[]; queryOperators: string[];
 schemaBuilders: string[]; connections: string[];
}
export interface DatabaseMissingItems {
 postgres: string[]; redis: string[];
 neo4j: string[]; vector: string[];
}
export interface StateMachineMissingItems {
 xstate: string[]; actors: string[];
 guards: string[]; actions: string[];
}
// Resolution result types
export interface AutomatedResolutionResult {
 totalErrors: number; resolvedErrors: number;
 generatedFiles: string[]; failedResolutions: string[];
 warnings: string[]; performance: { analysisTime: number; generationTime: number; totalTime: number };
}
export interface BarrelStoreFile {
 fileName: string; content: string;
 imports: string[]; exports: string[];
 types: string[]; functions: string[];
 classes: string[];
}
// Web fetch integration types
export interface WebFetchConfig {
 sources: WebFetchSource[]; cacheEnabled: boolean;
 timeout: number; retries: number;
}
export interface WebFetchSource {
 name: string; baseUrl: string;
 apiKey?: string;
 headers?: Record<string, string>;
 rateLimit?: number;
}
// Context7 MCP integration
export interface Context7McpConfig {
 serverUrl: string; libraries: string[];
 topics: string[]; maxTokens: number;
 cacheEnabled: boolean;
}
export interface Context7McpResponse {
 library: string; content: string;
 metadata: { tokenCount: number; version?: string; topics: string[]; confidence: number };
 snippets?: CodeSnippet[];
}
export interface CodeSnippet {
 title: string; code: string;
 description: string; language: string;
 tags: string[];
}
// Enhanced error analysis
export interface EnhancedErrorAnalysis extends MissingImportAnalysis {
 errorClusters: ErrorCluster[]; priorityFiles: string[];
 resolutionStrategies: Map<string: ErrorResolutionStrategy>; dependencies: DependencyAnalysis;
}
export interface ErrorCluster {
 pattern: string; count: number;
 files: string[]; suggestedResolution: string;
 priority: number;
}
export interface DependencyAnalysis {
 missingPackages: string[]; versionConflicts: string[];
 devDependencies: string[]; peerDependencies: string[];
}



