/**
 * Multi-Pass Processor for TypeScript Syntax Repair
 *
 * Orchestrates multiple passes of pattern matching to handle cascading fixes
 * where fixing one pattern reveals new fixable patterns.
 *
 * @requirements 1.5
 */

import type { PatternMatcher, FixPattern } from './pattern-matcher';
import { processDirectory, processFiles, type DirectoryProcessResult, type FileProcessorConfig } from './file-processor';
import { validateProject, compareResults, generateValidationReport, type ProjectValidationResult } from './validation-engine';
import { getAllPatterns, getPatternsByCategory } from './patterns';

/**
 * ErrorRemediationConfig as defined in the design document
 *
 * @requirements 1.5
 */
export interface ErrorRemediationConfig {
  /** Target directory to process */
  targetDirectory: string;
  /** Maximum number of passes to run */
  maxPasses: number;
  /** Whether to run in dry-run mode (no actual changes) */
  dryRun: boolean;
  /** Fix patterns to apply */
  patterns: FixPattern[];
}

/**
 * RemediationResult as defined in the design document
 *
 * @requirements 1.5
 */
export interface RemediationResult {
  /** Number of files processed */
  filesProcessed: number;
  /** Number of files modified */
  filesModified: number;
  /** Number of fixes applied */
  fixesApplied: number;
  /** Number of errors remaining after remediation */
  errorsRemaining: number;
  /** List of files that could not be automatically fixed */
  unfixableFiles: string[];
}

/**
 * Configuration for multi-pass processing
 */
export interface MultiPassConfig extends Partial<FileProcessorConfig> {
  /** Maximum number of passes to run */
  maxPasses: number;
  /** Stop when no more fixes are found */
  stopOnNoFixes: boolean;
  /** Validate after each pass */
  validateAfterPass: boolean;
  /** Priority files to process first */
  priorityFiles?: string[];
  /** Working directory for validation */
  cwd?: string;
}

/**
 * Default multi-pass configuration
 */
export const defaultMultiPassConfig: MultiPassConfig = {
  maxPasses: 5,
  stopOnNoFixes: true,
  validateAfterPass: false,
  createBackups: true,
  dryRun: false,
  verbose: false,
};

/**
 * Result of a single pass
 */
export interface PassResult {
  /** Pass number (1-indexed) */
  passNumber: number;
  /** Patterns applied in this pass */
  patternsApplied: string[];
  /** Total fixes in this pass */
  totalFixes: number;
  /** Files fixed in this pass */
  filesFixed: number;
  /** Duration of this pass in milliseconds */
  durationMs: number;
  /** Validation result if validation was run */
  validation?: ProjectValidationResult;
}

/**
 * Result of multi-pass processing
 */
export interface MultiPassResult {
  /** All pass results */
  passes: PassResult[];
  /** Total passes executed */
  totalPasses: number;
  /** Total fixes across all passes */
  totalFixes: number;
  /** Total files fixed */
  totalFilesFixed: number;
  /** Initial error count */
  initialErrors: number;
  /** Final error count */
  finalErrors: number;
  /** Error reduction percentage */
  errorReduction: number;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Whether processing completed successfully */
  success: boolean;
  /** Summary message */
  summary: string;
}

/**
 * Run multi-pass processing on a directory
 */
export async function runMultiPassProcessor(
  targetDirectory: string,
  config: Partial<MultiPassConfig> = {}
): Promise<MultiPassResult> {
  const cfg = { ...defaultMultiPassConfig, ...config };
  const startTime = Date.now();
  const passes: PassResult[] = [];

  // Get initial error count
  let initialValidation: ProjectValidationResult | undefined;
  if (cfg.cwd) {
    initialValidation = await validateProject(cfg.cwd);
  }
  const initialErrors = initialValidation?.totalErrors ?? 0;

  if (cfg.verbose) {
    console.log(`Starting multi-pass processing on ${targetDirectory}`);
    console.log(`Initial error count: ${initialErrors}`);
    console.log(`Max passes: ${cfg.maxPasses}`);
  }

  let totalFixes = 0;
  let totalFilesFixed = 0;
  const allPatterns = getAllPatterns();

  // Process priority files first if specified
  if (cfg.priorityFiles && cfg.priorityFiles.length > 0 && !cfg.dryRun) {
    if (cfg.verbose) {
      console.log(`Processing ${cfg.priorityFiles.length} priority files first...`);
    }
    const priorityResult = await processFiles(cfg.priorityFiles, allPatterns, cfg);
    totalFixes += priorityResult.totalFixes;
    totalFilesFixed += priorityResult.filesFixed;
  }

  // Run passes
  for (let passNum = 1; passNum <= cfg.maxPasses; passNum++) {
    const passStartTime = Date.now();

    if (cfg.verbose) {
      console.log(`\n--- Pass ${passNum} ---`);
    }

    // Process directory with all patterns
    const result = await processDirectory(targetDirectory, allPatterns, cfg);

    const passResult: PassResult = {
      passNumber: passNum,
      patternsApplied: allPatterns.map(p => p.name),
      totalFixes: result.totalFixes,
      filesFixed: result.filesFixed,
      durationMs: Date.now() - passStartTime,
    };

    // Validate after pass if configured
    if (cfg.validateAfterPass && cfg.cwd && !cfg.dryRun) {
      passResult.validation = await validateProject(cfg.cwd);
      if (cfg.verbose) {
        console.log(`Errors after pass ${passNum}: ${passResult.validation.totalErrors}`);
      }
    }

    passes.push(passResult);
    totalFixes += result.totalFixes;
    totalFilesFixed += result.filesFixed;

    if (cfg.verbose) {
      console.log(`Pass ${passNum}: ${result.totalFixes} fixes in ${result.filesFixed} files`);
    }

    // Stop if no fixes were found
    if (cfg.stopOnNoFixes && result.totalFixes === 0) {
      if (cfg.verbose) {
        console.log(`No fixes found in pass ${passNum},
	stopping.`);
      }
      break;
    }
  }

  // Get final error count
  let finalValidation: ProjectValidationResult | undefined;
  if (cfg.cwd && !cfg.dryRun) {
    finalValidation = await validateProject(cfg.cwd);
  }
  const finalErrors = finalValidation?.totalErrors ?? initialErrors;

  const errorReduction = initialErrors > 0
    ? ((initialErrors - finalErrors) / initialErrors) * 100
    : 0;

  const totalDurationMs = Date.now() - startTime;

  // Generate summary
  const summary = generateSummary({
    passes,
    totalFixes,
    totalFilesFixed,
    initialErrors,
    finalErrors,
    errorReduction,
    totalDurationMs,
    dryRun: cfg.dryRun ?? false,
  });

  return {
    passes,
    totalPasses: passes.length,
    totalFixes,
    totalFilesFixed,
    initialErrors,
    finalErrors,
    errorReduction,
    totalDurationMs,
    success: finalErrors <= initialErrors,
    summary,
  };
}

/**
 * Run a single pass with specific pattern category
 */
export async function runSinglePass(
  targetDirectory: string,
  category:
    | 'import-type'
    | 'function-param'
    | 'function-call'
    | 'object-literal'
    | 'nullish-coalescing'
    | 'bits-ui-migration'
    | 'colon-chain'
    | 'a11y-label',
  config: Partial<FileProcessorConfig> = {}
): Promise<DirectoryProcessResult> {
  const patternsByCategory = getPatternsByCategory();
  const patterns = patternsByCategory.get(category) ?? [];

  if (patterns.length === 0) {
    throw new Error(`Unknown pattern category: ${category}`);
  }

  return processDirectory(targetDirectory, patterns, config);
}

/**
 * Run remediation with specific pattern categories
 * Useful for targeted fixes
 */
export async function runCategoryRemediation(
  targetDirectory: string,
  categories: Array<
    | 'import-type'
    | 'function-param'
    | 'function-call'
    | 'object-literal'
    | 'nullish-coalescing'
    | 'bits-ui-migration'
    | 'colon-chain'
    | 'a11y-label'
  >,
  config: Partial<MultiPassConfig> = {}
): Promise<MultiPassResult> {
  const cfg = { ...defaultMultiPassConfig, ...config };
  const patternsByCategory = getPatternsByCategory();

  // Collect patterns from specified categories
  const selectedPatterns: PatternMatcher[] = [];
  for (const category of categories) {
    const patterns = patternsByCategory.get(category);
    if (patterns) {
      selectedPatterns.push(...patterns);
    }
  }

  // Sort by priority
  selectedPatterns.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  const startTime = Date.now();
  const passes: PassResult[] = [];

  // Get initial error count
  let initialValidation: ProjectValidationResult | undefined;
  if (cfg.cwd) {
    initialValidation = await validateProject(cfg.cwd);
  }
  const initialErrors = initialValidation?.totalErrors ?? 0;

  if (cfg.verbose) {
    console.log(`Running category remediation on ${targetDirectory}`);
    console.log(`Categories: ${categories.join(', ')}`);
    console.log(`Patterns: ${selectedPatterns.length}`);
    console.log(`Initial error count: ${initialErrors}`);
  }

  let totalFixes = 0;
  let totalFilesFixed = 0;

  // Run passes with selected patterns
  for (let passNum = 1; passNum <= cfg.maxPasses; passNum++) {
    const passStartTime = Date.now();

    if (cfg.verbose) {
      console.log(`\n--- Pass ${passNum} ---`);
    }

    const result = await processDirectory(targetDirectory, selectedPatterns, cfg);

    const passResult: PassResult = {
      passNumber: passNum,
      patternsApplied: selectedPatterns.map((p) => p.name),
      totalFixes: result.totalFixes,
      filesFixed: result.filesFixed,
      durationMs: Date.now() - passStartTime,
    };

    if (cfg.validateAfterPass && cfg.cwd && !cfg.dryRun) {
      passResult.validation = await validateProject(cfg.cwd);
      if (cfg.verbose) {
        console.log(`Errors after pass ${passNum}: ${passResult.validation.totalErrors}`);
      }
    }

    passes.push(passResult);
    totalFixes += result.totalFixes;
    totalFilesFixed += result.filesFixed;

    if (cfg.verbose) {
      console.log(`Pass ${passNum}: ${result.totalFixes} fixes in ${result.filesFixed} files`);
    }

    if (cfg.stopOnNoFixes && result.totalFixes === 0) {
      if (cfg.verbose) {
        console.log(`No fixes found in pass ${passNum},
	stopping.`);
      }
      break;
    }
  }

  // Get final error count
  let finalValidation: ProjectValidationResult | undefined;
  if (cfg.cwd && !cfg.dryRun) {
    finalValidation = await validateProject(cfg.cwd);
  }
  const finalErrors = finalValidation?.totalErrors ?? initialErrors;

  const errorReduction =
    initialErrors > 0 ? ((initialErrors - finalErrors) / initialErrors) * 100 : 0;

  const totalDurationMs = Date.now() - startTime;

  const summary = generateSummary({
    passes,
    totalFixes,
    totalFilesFixed,
    initialErrors,
    finalErrors,
    errorReduction,
    totalDurationMs,
    dryRun: cfg.dryRun ?? false,
  });

  return {
    passes,
    totalPasses: passes.length,
    totalFixes,
    totalFilesFixed,
    initialErrors,
    finalErrors,
    errorReduction,
    totalDurationMs,
    success: finalErrors <= initialErrors,
    summary,
  };
}

/**
 * Generate a human-readable summary of the multi-pass result
 */
function generateSummary(data: {
	passes: PassResult[];
  totalFixes: number;
	totalFilesFixed: number;
  initialErrors: number;
	finalErrors: number;
  errorReduction: number;
	totalDurationMs: number;
  dryRun: boolean;
}): string {
  const lines: string[] = [
    '═'.repeat(60),
    '  TypeScript Syntax Repair - Summary',
    '═'.repeat(60),
    '',
  ];

  if (data.dryRun) {
    lines.push('  ⚠️  DRY RUN MODE - No changes were made');
    lines.push('');
  }

  lines.push(`  Passes Executed:    ${data.passes.length}`);
  lines.push(`  Total Fixes:        ${data.totalFixes}`);
  lines.push(`  Files Modified:     ${data.totalFilesFixed}`);
  lines.push(`  Duration:           ${(data.totalDurationMs / 1000).toFixed(2)}s`);
  lines.push('');

  if (data.initialErrors > 0) {
    lines.push(`  Initial Errors:     ${data.initialErrors}`);
    lines.push(`  Final Errors:       ${data.finalErrors}`);
    lines.push(`  Error Reduction:    ${data.errorReduction.toFixed(1)}%`);
    lines.push('');

    if (data.finalErrors === 0) {
      lines.push('  ✅ SUCCESS: Zero errors achieved!');
    } else if (data.finalErrors < data.initialErrors) {
      lines.push('  ✅ Progress made - errors reduced');
    } else if (data.finalErrors === data.initialErrors) {
      lines.push('  ℹ️  No change in error count');
    } else {
      lines.push('  ⚠️  Warning: Error count increased');
    }
  }

  lines.push('');
  lines.push('  Pass Details:');
  lines.push('  ' + '-'.repeat(40));

  for (const pass of data.passes) {
    lines.push(`    Pass ${pass.passNumber}: ${pass.totalFixes} fixes in ${pass.filesFixed} files (${pass.durationMs}ms)`);
  }

  lines.push('');
  lines.push('═'.repeat(60));

  return lines.join('\n');
}

/**
 * Run error remediation using the design document's interface.
 * This is the main entry point that matches the spec's ErrorRemediationConfig.
 *
 * @param config - ErrorRemediationConfig from design document
 * @returns RemediationResult with processing statistics
 *
 * @requirements 1.5
 */
export async function runErrorRemediation(
  config: ErrorRemediationConfig
): Promise<RemediationResult> {
  const { targetDirectory, maxPasses, dryRun, patterns } = config;

  // Convert FixPattern[] to PatternMatcher[]
  const matchers: PatternMatcher[] = patterns.map(fp => ({
    name: fp.name,
    description: `Fix, pattern: ${fp.name}`,
    pattern: fp.regex,
    replacement: fp.replacement,
    fileFilter: fp.fileFilter,
    priority: 100,
  }));

  // Track unfixable files
  const unfixableFiles: string[] = [];
  let totalFilesProcessed = 0;
  let totalFilesModified = 0;
  let totalFixesApplied = 0;

  // Run multi-pass processing
  for (let pass = 1; pass <= maxPasses; pass++) {
    const result = await processDirectory(targetDirectory, matchers, {
      dryRun,
      createBackups: !dryRun,
      verbose: false,
    });

    totalFilesProcessed = result.filesProcessed;
    totalFilesModified += result.filesFixed;
    totalFixesApplied += result.totalFixes;

    // Track failed files
    for (const failedFile of result.failedFiles) {
      if (!unfixableFiles.includes(failedFile)) {
        unfixableFiles.push(failedFile);
      }
    }

    // Stop if no more fixes found
    if (result.totalFixes === 0) {
      break;
    }
  }

  // Get remaining error count (would need validation in real scenario)
  // For now, return 0 as placeholder - actual validation would use validateProject()
  const errorsRemaining = 0;

  return {
    filesProcessed: totalFilesProcessed,
    filesModified: totalFilesModified,
    fixesApplied: totalFixesApplied,
    errorsRemaining,
    unfixableFiles,
  };
}

/**
 * Run error remediation with validation to get accurate error counts.
 * Extended version that includes validation for error counting.
 *
 * @param config - ErrorRemediationConfig from design document
 * @param cwd - Working directory for validation (defaults to process.cwd())
 * @returns RemediationResult with accurate error counts
 *
 * @requirements 1.5
 */
export async function runErrorRemediationWithValidation(
  config: ErrorRemediationConfig,
  cwd: string = process.cwd()
): Promise<RemediationResult> {
  const { targetDirectory, maxPasses, dryRun, patterns } = config;

  // Convert FixPattern[] to PatternMatcher[]
  const matchers: PatternMatcher[] = patterns.map(fp => ({
    name: fp.name,
    description: `Fix, pattern: ${fp.name}`,
    pattern: fp.regex,
    replacement: fp.replacement,
    fileFilter: fp.fileFilter,
    priority: 100,
  }));

  // Track unfixable files
  const unfixableFiles: string[] = [];
  let totalFilesProcessed = 0;
  let totalFilesModified = 0;
  let totalFixesApplied = 0;

  // Run multi-pass processing
  for (let pass = 1; pass <= maxPasses; pass++) {
    const result = await processDirectory(targetDirectory, matchers, {
      dryRun,
      createBackups: !dryRun,
      verbose: false,
    });

    totalFilesProcessed = result.filesProcessed;
    totalFilesModified += result.filesFixed;
    totalFixesApplied += result.totalFixes;

    // Track failed files
    for (const failedFile of result.failedFiles) {
      if (!unfixableFiles.includes(failedFile)) {
        unfixableFiles.push(failedFile);
      }
    }

    // Stop if no more fixes found
    if (result.totalFixes === 0) {
      break;
    }
  }

  // Get remaining error count via validation
  let errorsRemaining = 0;
  if (!dryRun) {
    const validation = await validateProject(cwd);
    errorsRemaining = validation.totalErrors;
  }

  return {
    filesProcessed: totalFilesProcessed,
    filesModified: totalFilesModified,
    fixesApplied: totalFixesApplied,
    errorsRemaining,
    unfixableFiles,
  };
}

/**
 * Export the main index
 */
export { getAllPatterns, getPatternsByCategory } from './patterns';
