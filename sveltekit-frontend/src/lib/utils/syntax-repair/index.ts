/**
 * TypeScript Syntax Repair Module
 *
 * Provides automated repair of corrupted TypeScript syntax patterns.
 *
 * This module implements the Error Remediation Pipeline as defined in the design document,
 * supporting multi-pass processing with configurable fix patterns.
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
 *
 * @example Using design document interface
 * ```typescript
 * import { runErrorRemediation, type ErrorRemediationConfig } from '$lib/utils/syntax-repair';
 *
 * const config: ErrorRemediationConfig = {
 *   targetDirectory: 'src',
 *   maxPasses: 5,
 *   dryRun: false,
 *   patterns: [
 *     {
 *       name: 'fix-colons',
 *       regex: /key:\s*value:\s*key/g,
 *       replacement: 'key: value, key',
 *     }
 *   ]
 * };
 *
 * const result = await runErrorRemediation(config);
 * console.log(`Fixed ${result.fixesApplied} issues in ${result.filesModified} files`);
 * ```
 *
 * @requirements 1.5
 */

// Core components
export * from './pattern-matcher';
export * from './file-processor';
export * from './validation-engine';
export * from './multi-pass-processor';

// Pattern implementations
export * from './patterns';
