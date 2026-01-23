/**
 * Validation Engine for TypeScript Syntax Repair
 *
 * Provides TypeScript compilation validation to verify fixes don't introduce
 * new errors and to track error count reduction.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * TypeScript error information
 */
export interface TypeScriptError {
  /** File path where the error occurred */
  file: string;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
  /** Error code (e.g., TS1005) */
  code: string;
  /** Error message */
  message: string;
}

/**
 * Result of validating a single file
 */
export interface ValidationResult {
  /** File that was validated */
  file: string;
  /** List of errors found */
  errors: TypeScriptError[];
  /** Whether the file is valid (no errors) */
  isValid: boolean;
}

/**
 * Result of validating the entire project
 */
export interface ProjectValidationResult {
  /** Total number of errors */
  totalErrors: number;
  /** Errors grouped by file */
  errorsByFile: Map<string, number>;
  /** Errors grouped by error code */
  errorsByCode: Map<string, number>;
  /** All errors */
  errors: TypeScriptError[];
  /** Raw output from tsc */
  rawOutput: string;
  /** Whether validation succeeded (exit code 0) */
  success: boolean;
}

/**
 * Parse TypeScript compiler output into structured errors
 */
export function parseTypeScriptOutput(output: string): TypeScriptError[] {
  const errors: TypeScriptError[] = [];

  // Match TypeScript error format: file(line,col): error TSxxxx: message
  const errorPattern = /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/gm;

  let match;
  while ((match = errorPattern.exec(output)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      code: match[4],
      message: match[5],
    });
  }

  return errors;
}

/**
 * Get the total error count from TypeScript output
 */
export function getErrorCount(output: string): number {
  // Look for the summary line: "Found X errors"
  const summaryMatch = output.match(/Found\s+(\d+)\s+errors?/i);
  if (summaryMatch) {
    return parseInt(summaryMatch[1], 10);
  }

  // Fallback: count individual error lines
  const errors = parseTypeScriptOutput(output);
  return errors.length;
}

/**
 * Group errors by file path
 */
export function groupErrorsByFile(errors: TypeScriptError[]): Map<string, number> {
  const byFile = new Map<string, number>();

  for (const error of errors) {
    const current = byFile.get(error.file) ?? 0;
    byFile.set(error.file, current + 1);
  }

  return byFile;
}

/**
 * Group errors by error code
 */
export function groupErrorsByCode(errors: TypeScriptError[]): Map<string, number> {
  const byCode = new Map<string, number>();

  for (const error of errors) {
    const current = byCode.get(error.code) ?? 0;
    byCode.set(error.code, current + 1);
  }

  return byCode;
}

/**
 * Run TypeScript compiler on the project and return validation result
 */
export async function validateProject(
  cwd: string = process.cwd()
): Promise<ProjectValidationResult> {
  try {
    // Run tsc with --noEmit to check without generating output
    const { stdout, stderr } = await execAsync('npx tsc --noEmit 2>&1', {
      cwd,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large outputs
    });

    const output = stdout + stderr;
    const errors = parseTypeScriptOutput(output);

    return {
      totalErrors: errors.length,
      errorsByFile: groupErrorsByFile(errors),
      errorsByCode: groupErrorsByCode(errors),
      errors,
      rawOutput: output,
      success: errors.length === 0,
    };
  } catch (error: unknown) {
    // tsc exits with non-zero when there are errors
    const execError = error as { stdout?: string; stderr?: string; message?: string };
    const output = (execError.stdout ?? '') + (execError.stderr ?? '');
    const errors = parseTypeScriptOutput(output);

    return {
      totalErrors: errors.length || getErrorCount(output),
      errorsByFile: groupErrorsByFile(errors),
      errorsByCode: groupErrorsByCode(errors),
      errors,
      rawOutput: output,
      success: false,
    };
  }
}

/**
 * Run svelte-check on the project
 */
export async function validateSvelte(
  cwd: string = process.cwd()
): Promise<ProjectValidationResult> {
  try {
    const { stdout, stderr } = await execAsync('npx svelte-check --output human 2>&1', {
      cwd,
      maxBuffer: 50 * 1024 * 1024,
    });

    const output = stdout + stderr;
    const errors = parseSvelteCheckOutput(output);

    return {
      totalErrors: errors.length,
      errorsByFile: groupErrorsByFile(errors),
      errorsByCode: groupErrorsByCode(errors),
      errors,
      rawOutput: output,
      success: errors.length === 0,
    };
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string };
    const output = (execError.stdout ?? '') + (execError.stderr ?? '');
    const errors = parseSvelteCheckOutput(output);

    return {
      totalErrors: errors.length,
      errorsByFile: groupErrorsByFile(errors),
      errorsByCode: groupErrorsByCode(errors),
      errors,
      rawOutput: output,
      success: false,
    };
  }
}

/**
 * Parse svelte-check output into structured errors
 */
function parseSvelteCheckOutput(output: string): TypeScriptError[] {
  const errors: TypeScriptError[] = [];

  // Match svelte-check error format
  // /path/to/file.svelte:line:col
  // Error: message (ts)
  const errorPattern = /^(.+?):(\d+):(\d+)\s*\n\s*Error:\s*(.+?)(?:\s*\(ts\))?$/gm;

  let match;
  while ((match = errorPattern.exec(output)) !== null) {
    errors.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      code: 'SVELTE',
      message: match[4],
    });
  }

  // Also try to match TypeScript-style errors in svelte-check output
  const tsErrors = parseTypeScriptOutput(output);
  errors.push(...tsErrors);

  return errors;
}

/**
 * Get a quick error count without full parsing (faster)
 */
export async function getQuickErrorCount(
  cwd: string = process.cwd()
): Promise<number> {
  try {
    const { stdout, stderr } = await execAsync('npx tsc --noEmit 2>&1 | tail -1', {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });

    return getErrorCount(stdout + stderr);
  } catch (error: unknown) {
    const execError = error as { stdout?: string; stderr?: string };
    const output = (execError.stdout ?? '') + (execError.stderr ?? '');
    return getErrorCount(output);
  }
}

/**
 * Categorize errors by their root cause
 */
export function categorizeErrors(errors: TypeScriptError[]): Map<string, TypeScriptError[]> {
  const categories = new Map<string, TypeScriptError[]>();

  const categoryMap: Record<string, string> = {
    'TS1005': 'comma-colon-swap',      // ',' expected
    'TS1128': 'declaration-expected',   // Declaration or statement expected
    'TS1434': 'unknown-keyword',        // Unknown keyword or identifier
    'TS1109': 'expression-expected',    // Expression expected
    'TS1135': 'argument-expected',      // Argument expression expected
    'TS2304': 'cannot-find-name',       // Cannot find name
    'TS2339': 'property-not-exist',     // Property does not exist
    'TS2345': 'argument-type',          // Argument type not assignable
    'TS2322': 'type-not-assignable',    // Type not assignable
  };

  for (const error of errors) {
    const category = categoryMap[error.code] ?? 'other';
    const existing = categories.get(category) ?? [];
    existing.push(error);
    categories.set(category, existing);
  }

  return categories;
}

/**
 * Generate a summary report of validation results
 */
export function generateValidationReport(result: ProjectValidationResult): string {
  const lines: string[] = [
    '='.repeat(60),
    'TypeScript Validation Report',
    '='.repeat(60),
    '',
    `Total Errors: ${result.totalErrors}`,
    `Status: ${result.success ? '✅ PASS' : '❌ FAIL'}`,
    '',
  ];

  if (result.errorsByCode.size > 0) {
    lines.push('Errors by Code:');
    lines.push('-'.repeat(40));

    const sortedCodes = Array.from(result.errorsByCode.entries())
      .sort((a, b) => b[1] - a[1]);

    for (const [code, count] of sortedCodes) {
      lines.push(`  ${code}: ${count}`);
    }
    lines.push('');
  }

  if (result.errorsByFile.size > 0) {
    lines.push('Top 10 Files with Most Errors:');
    lines.push('-'.repeat(40));

    const sortedFiles = Array.from(result.errorsByFile.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    for (const [file, count] of sortedFiles) {
      lines.push(`  ${count.toString().padStart(4)} ${file}`);
    }
    lines.push('');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * Compare two validation results to show progress
 */
export function compareResults(
  before: ProjectValidationResult,
  after: ProjectValidationResult
): string {
  const diff = before.totalErrors - after.totalErrors;
  const percentage = before.totalErrors > 0
    ? ((diff / before.totalErrors) * 100).toFixed(1)
    : '0';

  const lines: string[] = [
    '='.repeat(60),
    'Error Reduction Report',
    '='.repeat(60),
    '',
    `Before: ${before.totalErrors} errors`,
    `After:  ${after.totalErrors} errors`,
    `Reduced: ${diff} errors (${percentage}%)`,
    '',
  ];

  if (diff > 0) {
    lines.push('✅ Progress made!');
  } else if (diff < 0) {
    lines.push('⚠️ Warning: Error count increased!');
  } else {
    lines.push('ℹ️ No change in error count');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}
