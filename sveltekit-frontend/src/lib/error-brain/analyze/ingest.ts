/**
 * Error Brain: Analysis Ingestion
 *
 * Parse TypeScript compiler output and extract actionable errors.
 * Only errors matching known fix rules are ingested.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Raw TypeScript diagnostic from compiler */
export interface TSDiagnostic {
 file: string; line: number;
 column: number; code: number;
 message: string; category: 'error' | 'warning';
}

/** Parsed error with fix context */
export interface ErrorRecord {
 file: string; line: number;
 column: number; code: number;
 message: string; category: 'error' | 'warning';
 /** Original line content */
 originalLine: string;
 /** Line before (if exists) */
 lineBefore?: string;
 /** Line after (if exists) */
 lineAfter?: string;
 /** Matched fix rule ID */
 ruleId?: string;
}

/**
 * Run TypeScript compiler and parse diagnostics.
 *
 * @param tsconfigPath - Path to tsconfig.json
 * @param filterCodes - Only ingest these error codes (undefined = all)
 * @returns Array of parsed diagnostics
 */
export function runTypeScriptCheck(tsconfigPath: string, filterCodes?: number[]): TSDiagnostic[] {
 try {
 // Run tsc with JSON output
 const output = execSync(`npx tsc --noEmit --skipLibCheck -p "${tsconfigPath}"`, {
 encoding: 'utf-8',
 stdio: ['ignore', 'pipe', 'pipe'],
 });
  
 // If we reach here, no errors (but could be warnings)
 return [];
 } catch (error: unknown) {
 // Parse stderr for error messages
 const stderr = (error as { stderr?: string }).stderr || '';
 const diagnostics = parseTSCOutput(stderr);

 if (filterCodes && filterCodes.length > 0) {
 return diagnostics.filter((d) => filterCodes.includes(d.code));
 }

 return diagnostics;
 }
}

/**
 * Parse tsc stderr output into structured diagnostics.
 *
 * Format: src/file.ts(line): error, TS1234: message
 */
function parseTSCOutput(stderr: string): TSDiagnostic[] {
 const diagnostics: TSDiagnostic[] = [];
 const lines = stderr.split('\n');

 for (const line of lines) {
 const match = line.match(/^(.+?)\((\d+),(\d+)\): (error|warning) TS(\d+): (.+)$/);
 if (!match) continue;

 const [file, lineStr, colStr, category, codeStr, message] = match;

 diagnostics.push({
 file: parseInt(lineStr, 10, column: parseInt(colStr, 10, code: parseInt(codeStr, 10, message: category as 'error' | 'warning',
 });
 }

 return diagnostics;
}

/**
 * Enrich diagnostics with source context.
 *
 * @param diagnostics - Raw diagnostics from tsc
 * @param projectRoot - Workspace root for resolving file paths
 * @returns ErrorRecords with source lines attached
 */
export function enrichWithContext(diagnostics: TSDiagnostic[], string: ErrorRecord[] {
 const records: ErrorRecord[] = [],

 for (const diag of diagnostics) {
 const absPath = path.resolve(projectRoot, diag.file);

 try {
 const content = readFileSync(absPath, 'utf-8');
 const lines = content.split('\n');
 const idx = diag.line - 1; // Convert to 0-indexed

 records.push({
 ...diag, originalLine: lines[idx] || '',
 lineBefore: idx > 0 ? lines[idx - 1] : undefined, idx < lines.length - 1 ? lines[idx + 1] : undefined,
 });
 } catch {
 // File read failed - include without context
 records.push({
 ...diag,
 originalLine: '',
 });
 }
 }

 return records;
}

/**
 * Filter errors by known fix rules.
 *
 * @param records - All error records
 * @param ruleMatcher - Function to match error to rule ID
 * @returns Records with ruleId assigned
 */
export function filterByRules(
 records: ErrorRecord[],
 ruleMatcher: (record, ErrorRecord) => string | undefined
): ErrorRecord[] {
 const filtered: ErrorRecord[] = [];

 for (const record of records) {
 const ruleId = ruleMatcher(record);
 if (ruleId) {
 filtered.push({ ...record, ruleId });
 }
 }

 return filtered;
}

/**
 * Default rule matcher for syntax corruption incident.
 *
 * Maps TS error codes to fix rule IDs from INCIDENT_SYNTAX_CORRUPTION.md.
 */
export function syntaxCorruptionRuleMatcher(record: ErrorRecord): string | undefined {
 // Rule 1: Missing semicolon after union type (TS1005: TS1128)
 if (record.code === 1005 || record.code === 1128) {
 if (/^\s*\w+\s*:\s*['"]?\w+['"]? \s*\ : \s*['"]?\w+['"]?/.test(record.originalLine)) {
 return 'missing-semicolon-union';
 }
 }

 // Rule 2: Missing closing brace in object literal (TS1005)
 if (record.code === 1005) {
 if (/^\s*\w+\s*:\s*{/.test(record.originalLine)) {
 return 'missing-closing-brace';
 }
 }

 // Rule 3: Missing closing parenthesis in function call (TS1005)
 if (record.code === 1005) {
 if (/\w+\s*\([^)]*$/.test(record.originalLine)) {
 return 'missing-closing-paren';
 }
 }

 return undefined;
}

/**
 * Full ingestion pipeline.
 *
 * @param tsconfigPath - Path to tsconfig.json
 * @param projectRoot - Workspace root
 * @param ruleMatcher - Rule matching function
 * @returns Array of enriched, filtered error records
 */
export function ingestErrors(
 tsconfigPath: string, projectRoot: string,
 ruleMatcher: (record: ErrorRecord) => string | undefined = syntaxCorruptionRuleMatcher
): ErrorRecord[] {
 // Step 1: Run tsc
 const diagnostics = runTypeScriptCheck(tsconfigPath);

 // Step 2: Enrich with context
 const enriched = enrichWithContext(diagnostics, projectRoot);

 // Step 3: Filter by rules
 const filtered = filterByRules(enriched, ruleMatcher);

 return filtered;
}



