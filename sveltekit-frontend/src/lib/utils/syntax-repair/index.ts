/**
 * TypeScript Syntax Repair Module
 *
 * Provides automated repair of corrupted TypeScript syntax patterns.
 *
 * @example
 * ```typescript
 * import { runMultiPassProcessor } from '$lib/utils/syntax-repair';
 *
 * const result = await runMultiPassProcessor('src', {
 *   dryRun: true,
 *   verbose: true,
 * });
 *
 * console.log(result.summary);
 * ```
 */

// Core components
export * from './pattern-matcher';
export * from './file-processor';
export * from './validation-engine';
export * from './multi-pass-processor';

// Pattern implementations
export * from './patterns';
