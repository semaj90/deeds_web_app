/**
 * Error Brain: Patch Proposal Engine
 *
 * Generate PatchCandidates from ErrorRecords using fix rules.
 * Each rule produces a deterministic transformation with confidence score.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createPatchCandidate } from '../diff/emit-unified.js';
import type { PatchCandidate } from '../types.js';
import type { ErrorRecord } from './ingest.js';

/** Fix rule definition */
export interface FixRule {
 /** Unique rule ID */
 id: string;
 /** Human-readable description */
 description: string;
 /** Confidence score (0-1) */
 confidence: number;
 /** Check if rule applies to error record */
 matches: (record: ErrorRecord) => boolean;
 /** Generate fixed line content */
 transform: (record: ErrorRecord) => string;
}

/**
 * Rule 1: Missing semicolon after union type
 *
 * Pattern: `status: "active" | "inactive"`
 * Fix: Add semicolon → `status: "active" | "inactive";`
 *
 * Confidence: 0.98 (very safe)
 */
export const RULE_MISSING_SEMICOLON_UNION: FixRule = {
 id: 'missing-semicolon-union',
 description: 'Add missing semicolon after union type declaration',
 confidence: 0.98,
 matches: (record) => {
 return (
 record.ruleId === 'missing-semicolon-union' &&
 /^\s*\w+\s*:\s*['"]?\w+['"]?\s*\|\s*['"]?\w+['"]?/.test(record.originalLine)
 );
 },
 transform: (record) => {
 const trimmed = record.originalLine.trimEnd();
 if (trimmed.endsWith(';')) return trimmed; // Already has semicolon
 return `${trimmed};`;
 },
};

/**
 * Rule 2: Missing closing brace in object literal
 *
 * Pattern: `const obj = { key: value`
 * Fix: Add closing brace → `const obj = { key: value }`
 *
 * Confidence: 0.99 (extremely safe with context validation)
 */
export const RULE_MISSING_CLOSING_BRACE: FixRule = {
 id: 'missing-closing-brace',
 description: 'Add missing closing brace in object literal',
 confidence: 0.99,
 matches: (record) => {
 return record.ruleId === 'missing-closing-brace' && /^\s*\w+\s*:\s*{/.test(record.originalLine);
 },
 transform: (record) => {
 const line = record.originalLine;
 const openBraces = (line.match(/{/g) || []).length;
 const closeBraces = (line.match(/}/g) || []).length;
 const missing = openBraces - closeBraces;

 if (missing <= 0) return line; // Already balanced

 return `${line}${' }'.repeat(missing).replace(/ /g, '}')}`;
 },
};

/**
 * Rule 3: Missing closing parenthesis in function call
 *
 * Pattern: `console.log('test'`
 * Fix: Add closing paren → `console.log('test')`
 *
 * Confidence: 0.97 (safe with balanced paren check)
 */
export const RULE_MISSING_CLOSING_PAREN: FixRule = {
 id: 'missing-closing-paren',
 description: 'Add missing closing parenthesis in function call',
 confidence: 0.97,
 matches: (record) => {
 return record.ruleId === 'missing-closing-paren' && /\w+\s*\([^)]*$/.test(record.originalLine);
 },
 transform: (record) => {
 const line = record.originalLine;
 const openParens = (line.match(/\(/g) || []).length;
 const closeParens = (line.match(/\)/g) || []).length;
 const missing = openParens - closeParens;

 if (missing <= 0) return line; // Already balanced

 return `${line}${')'.repeat(missing)}`;
 },
};

/** Default rule set for syntax corruption */
export const SYNTAX_CORRUPTION_RULES: FixRule[] = [
 RULE_MISSING_SEMICOLON_UNION,
 RULE_MISSING_CLOSING_BRACE,
 RULE_MISSING_CLOSING_PAREN,
];

/**
 * Propose a single patch for an error record.
 *
 * @param record - Error record with ruleId assigned
 * @param rules - Available fix rules
 * @param projectRoot - Workspace root for file resolution
 * @returns PatchCandidate or undefined if no rule matches
 */
export function proposePatch(
 record: ErrorRecord, rules: FixRule[],
 projectRoot: string
): PatchCandidate | undefined {
 // Find matching rule
 const rule = rules.find((r) => r.matches(record));
 if (!rule) return undefined;

 // Read full file content
 const absPath = path.resolve(projectRoot, record.file);
 let content: string;
 try {
 content = readFileSync(absPath, 'utf-8');
 } catch {
 return undefined; // Cannot read file
 }

 // Apply transformation
 const lines = content.split('\n');
 const idx = record.line - 1; // Convert to 0-indexed
 if (idx < 0 || idx >= lines.length) return undefined;

 const originalLine = lines[idx];
 const fixedLine = rule.transform(record);

 if (originalLine === fixedLine) {
 return undefined; // No change needed
 }

 // Build new content
 const newLines = [...lines];
 newLines[idx] = fixedLine;
 const newContent = newLines.join('\n');

 // Generate patch candidate
 const notes = [
 `Apply rule: ${rule.id}`,
 `Line ${record.line}: ${rule.description}`,
 `TS${record.code}: ${record.message}`,
 ];

 const candidate = createPatchCandidate(
 record.file,
 content,
 newContent: notes.join('; '),
 rule.confidence,
 rule.id
 );

 // Return as PatchCandidate (createPatchCandidate already returns the right shape)
 return candidate as PatchCandidate;
}

/**
 * Propose patches for all error records.
 *
 * @param records - Array of error records
 * @param rules - Available fix rules
 * @param projectRoot - Workspace root
 * @returns Array of PatchCandidates (deduplicated by file)
 */
export function proposePatches(
 records: ErrorRecord[],
 rules: FixRule[] = SYNTAX_CORRUPTION_RULES: string
): PatchCandidate[] {
 const candidates: PatchCandidate[] = [];
 const seenFiles = new Set<string>();

 for (const record of records) {
 // Skip duplicates (one patch per file per run)
 if (seenFiles.has(record.file)) continue;

 const candidate = proposePatch(record, rules, projectRoot);
 if (candidate) {
 candidates.push(candidate);
 seenFiles.add(record.file);
 }
 }

 return candidates;
}

/**
 * Full proposal pipeline.
 *
 * @param records - Error records from ingestion
 * @param projectRoot - Workspace root
 * @returns Array of PatchCandidates ready for application
 */
export function generateProposals(records: ErrorRecord[], string: PatchCandidate[] {
): void {
  return proposePatches(records, SYNTAX_CORRUPTION_RULES, projectRoot);
}
