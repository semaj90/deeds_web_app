#!/usr/bin/env node
/**
 * scripts/diff/reporter.mjs
 *
 * PHASE 17: Patch report infrastructure
 *
 * Manages reports/patches/<stamp>/ with:
 * - *.diff files (unified diff format)
 * - apply-log.json (application results)
 * - metadata.json (batch information)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { patchToUnifiedDiff } from './generator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const patchesDir = path.join(projectRoot, 'reports', 'patches');

/**
 * Get timestamp for report directory
 */
export function getTimestamp() {
  return process.env.BATCH_REPORT_STAMP ||
         new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

/**
 * Create a new report directory
 *
 * @param {string} [stamp] - Optional timestamp override
 * @returns {string} - Absolute path to report directory
 */
export function createReportDir(stamp = null) {
  const timestamp = stamp || getTimestamp();
  const reportDir = path.join(patchesDir, timestamp);

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  return reportDir;
}

/**
 * Save patch to .diff file
 *
 * @param {import('./generator.mjs').PatchMetadata} patch
 * @param {string} reportDir
 * @returns {string} - Path to saved diff file
 */
export function savePatchDiff(patch, reportDir) {
  const fileName = path.basename(patch.filePath, path.extname(patch.filePath)) + '.diff';
  const diffPath = path.join(reportDir, fileName);

  const diffContent = patchToUnifiedDiff(patch);
  fs.writeFileSync(diffPath, diffContent, 'utf8');

  return diffPath;
}

/**
 * Save patch as JSON
 *
 * @param {import('./generator.mjs').PatchMetadata} patch
 * @param {string} reportDir
 * @returns {string} - Path to saved JSON file
 */
export function savePatchJSON(patch, reportDir) {
  const fileName = path.basename(patch.filePath, path.extname(patch.filePath)) + '.patch.json';
  const jsonPath = path.join(reportDir, fileName);

  fs.writeFileSync(jsonPath, JSON.stringify(patch, null, 2), 'utf8');

  return jsonPath;
}

/**
 * Save application log
 *
 * @param {Object} log - Application results
 * @param {string} reportDir
 */
export function saveApplyLog(log, reportDir) {
  const logPath = path.join(reportDir, 'apply-log.json');

  const existingLog = fs.existsSync(logPath)
    ? JSON.parse(fs.readFileSync(logPath, 'utf8'))
    : { entries: [] };

  existingLog.entries.push({
    timestamp: new Date().toISOString(),
    ...log
  });

  fs.writeFileSync(logPath, JSON.stringify(existingLog, null, 2), 'utf8');
}

/**
 * Save batch metadata
 *
 * @param {Object} metadata
 * @param {string} reportDir
 */
export function saveBatchMetadata(metadata, reportDir) {
  const metadataPath = path.join(reportDir, 'metadata.json');

  const data = {
    generatedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    ...metadata
  };

  fs.writeFileSync(metadataPath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Generate summary report as markdown
 *
 * @param {import('./generator.mjs').PatchMetadata[]} patches
 * @param {Object} applyResults
 * @param {string} reportDir
 * @returns {string} - Path to summary markdown
 */
export function generateSummary(patches, applyResults, reportDir) {
  const summaryPath = path.join(reportDir, 'SUMMARY.md');

  const totalAdditions = patches.reduce((sum, p) => sum + p.totalAdditions, 0);
  const totalDeletions = patches.reduce((sum, p) => sum + p.totalDeletions, 0);
  const avgConfidence = patches.reduce((sum, p) => sum + p.confidence, 0) / patches.length;

  const lines = [
    `# Patch Application Summary`,
    ``,
    `**Generated:** ${new Date().toISOString()}`,
    `**Report Directory:** \`${path.basename(reportDir)}\``,
    ``,
    `## Overview`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total patches | ${patches.length} |`,
    `| Applied successfully | ${applyResults?.applied || 0} |`,
    `| Failed | ${applyResults?.failed || 0} |`,
    `| Total additions | +${totalAdditions} |`,
    `| Total deletions | -${totalDeletions} |`,
    `| Average confidence | ${(avgConfidence * 100).toFixed(1)}% |`,
    ``,
    `## Patches`,
    ``
  ];

  for (const patch of patches) {
    const status = applyResults?.results?.find(r => r.filePath === patch.filePath);
    const emoji = status?.success ? '✅' : '❌';

    lines.push(`### ${emoji} \`${path.basename(patch.filePath)}\``);
    lines.push(``);
    lines.push(`- **Reason:** ${patch.reason}`);
    lines.push(`- **Confidence:** ${(patch.confidence * 100).toFixed(1)}%`);
    lines.push(`- **Changes:** +${patch.totalAdditions} -${patch.totalDeletions}`);
    lines.push(`- **Before hash:** \`${patch.beforeHash.substring(0, 12)}\``);
    lines.push(`- **After hash:** \`${patch.afterHash.substring(0, 12)}\``);

    if (status && !status.success) {
      lines.push(`- **Error:** ${status.error}`);
    }

    lines.push(``);
  }

  fs.writeFileSync(summaryPath, lines.join('\n'), 'utf8');

  return summaryPath;
}

/**
 * Complete report generation workflow
 *
 * @param {import('./generator.mjs').PatchMetadata[]} patches
 * @param {Object} [applyResults] - Optional application results
 * @returns {string} - Report directory path
 */
export function generateReport(patches, applyResults = null) {
  const reportDir = createReportDir();

  // Save each patch
  for (const patch of patches) {
    savePatchDiff(patch, reportDir);
    savePatchJSON(patch, reportDir);
  }

  // Save metadata
  saveBatchMetadata({
    patchCount: patches.length,
    totalAdditions: patches.reduce((sum, p) => sum + p.totalAdditions, 0),
    totalDeletions: patches.reduce((sum, p) => sum + p.totalDeletions, 0)
  }, reportDir);

  // Save apply results if provided
  if (applyResults) {
    saveApplyLog(applyResults, reportDir);
  }

  // Generate summary
  generateSummary(patches, applyResults, reportDir);

  console.log(`\n📊 Report generated: ${path.relative(projectRoot, reportDir)}`);

  return reportDir;
}

/**
 * CLI entry point for testing
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Report infrastructure ready');
  console.log(`Patches directory: ${patchesDir}`);

  // Example usage
  const testReport = createReportDir('test-2025-12-15');
  console.log(`Test report created: ${testReport}`);
}
