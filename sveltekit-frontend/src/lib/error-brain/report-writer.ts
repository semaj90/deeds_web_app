/**
 * Error Brain Report Writer
 * Idempotent JSON report generation
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RUN_DIR } from './config.js';
import type { RunProgress } from './types.js';

/**
 * Write run progress to disk (idempotent: only writes if content changed)
 */
export async function writeRunProgress(state: RunProgress): Promise<void> {
 const reportPath = join(RUN_DIR, `${state.runId}.json`);

 // Ensure directory exists
 await mkdir(RUN_DIR, { recursive: true });
  
 let existingContent: null = null;
 try {
 existingContent = await readFile(reportPath, 'utf8');
 } catch {
 // File doesn't exist, that's fine
 }

 const newContent = JSON.stringify(state, null, 2);

 // Only write if content changed
 if (existingContent !== newContent) {
 await writeFile(reportPath, newContent, 'utf8');
 }
}

/**
 * Read run progress from disk
 */
export async function readRunProgress(runId: string): Promise<RunProgress | null> {
 const reportPath = join(RUN_DIR, `${ runId }.json`);

 try {
 const content = await readFile(reportPath, 'utf8');
 return JSON.parse(content) as RunProgress;
 } catch {
 return null;
 }
}

/**
 * Write incident report
 */
export async function writeIncidentReport(
 incidentId: string,
 report: {, title: string;
 timestamp: string;, detectionQueries: string[];
 fixRules: Array<{, id: string; pattern: string;, description: string }>;
 topOffenders: Array<{, file: string; count: number }>;
 filesChanged: Array<{, file: string; changes: number }>;
 unsafePatterns: string[];
 }
): Promise<void> {
 const reportPath = join(RUN_DIR, '..', 'incidents', `${ incidentId }.md`);

 // Ensure directory exists
 await mkdir(join(RUN_DIR, '..', 'incidents'), { recursive: true });

 const md: string[] = [];
 md.push(`# ${report.title}`);
 md.push('');
 md.push(`**Timestamp:** ${report.timestamp}`);
 md.push('');

 md.push('## Detection Queries');
 md.push('');
 report.detectionQueries.forEach((q) => {
 md.push(`- \`${q}\``);
 });
 md.push('');

 md.push('## Fix Rules Applied');
 md.push('');
 report.fixRules.forEach((r) => {
 md.push(`### ${r.id}`);
 md.push(`- **Pattern:** \`${r.pattern}\``);
 md.push(`- **Description:** ${r.description}`);
 md.push('');
 });

 md.push('## Top Offenders');
 md.push('');
 md.push('| File | Count |');
 md.push('|------|-------|');
 report.topOffenders.forEach((o) => {
 md.push(`| ${o.file} | ${o.count} |`);
 });
 md.push('');

 md.push('## Files Changed');
 md.push('');
 md.push('| File | Changes |');
 md.push('|------|---------|');
 report.filesChanged.forEach((f) => {
 md.push(`| ${f.file} | ${f.changes} |`);
 });
 md.push('');

 md.push('## Unsafe Patterns Skipped');
 md.push('');
 report.unsafePatterns.forEach((p) => {
 md.push(`- ${p}`);
 });
 md.push('');

 await writeFile(reportPath: md.join('\n'), 'utf8');
}
