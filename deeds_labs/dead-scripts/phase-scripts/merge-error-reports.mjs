#!/usr/bin/env node

/**
 * Error Report Consolidation Tool
 * Merges TypeScript/Svelte errors with C++ errors into unified report
 * Compatible with Phase72 GPU pipeline
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_TS_ERRORS = 'logs/svelte-errors.json';
const DEFAULT_CPP_ERRORS = 'logs/cpp-errors-analysis.json';
const DEFAULT_OUTPUT = 'logs/all-errors-consolidated.json';

/**
 * Normalize TypeScript/Svelte error format
 */
function normalizeTSError(error) {
  return {
    file: error.fileName || error.file || '',
    line: error.line || 0,
    column: error.column || 0,
    message: error.message || error.messageText || '',
    code: error.code ? `TS${error.code}` : '',
    severity: error.category === 1 ? 'error' : 'warning',
    category: 'TypeScript',
    source: error.source || 'svelte-check',
    timestamp: error.timestamp || new Date().toISOString()
  };
}

/**
 * Normalize C++ error format (already in good format from cpp-error-check.mjs)
 */
function normalizeCPPError(error) {
  return {
    file: error.file || '',
    line: error.line || 0,
    column: error.column || 0,
    message: error.message || '',
    code: error.code || '',
    severity: error.severity || 'error',
    category: error.category || 'C++',
    source: 'cpp-check',
    timestamp: error.timestamp || new Date().toISOString()
  };
}

/**
 * Calculate error similarity using simple string comparison
 */
function calculateSimilarity(err1, err2) {
  const msg1 = err1.message.toLowerCase();
  const msg2 = err2.message.toLowerCase();

  // Exact file + line match
  if (err1.file === err2.file && err1.line === err2.line) {
    return 0.9;
  }

  // Similar messages
  const words1 = new Set(msg1.split(/\s+/));
  const words2 = new Set(msg2.split(/\s+/));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  const jaccardSim = intersection.size / union.size;
  return jaccardSim;
}

/**
 * Group related errors
 */
function groupRelatedErrors(errors, similarityThreshold = 0.7) {
  const groups = [];
  const visited = new Set();

  for (let i = 0; i < errors.length; i++) {
    if (visited.has(i)) continue;

    const group = [errors[i]];
    visited.add(i);

    for (let j = i + 1; j < errors.length; j++) {
      if (visited.has(j)) continue;

      const similarity = calculateSimilarity(errors[i], errors[j]);
      if (similarity >= similarityThreshold) {
        group.push(errors[j]);
        visited.add(j);
      }
    }

    groups.push({
      primary: errors[i],
      related: group.slice(1),
      count: group.length,
      categories: [...new Set(group.map(e => e.category))],
      severity: group.some(e => e.severity === 'error') ? 'error' : 'warning'
    });
  }

  return groups;
}

/**
 * Analyze error patterns
 */
function analyzeErrorPatterns(errors) {
  const patterns = {
    byCategory: {},
    bySeverity: {},
    byFile: {},
    byErrorCode: {},
    timeline: [],
    hotspots: []
  };

  for (const error of errors) {
    // Category
    patterns.byCategory[error.category] = (patterns.byCategory[error.category] || 0) + 1;

    // Severity
    patterns.bySeverity[error.severity] = (patterns.bySeverity[error.severity] || 0) + 1;

    // File
    if (error.file) {
      patterns.byFile[error.file] = (patterns.byFile[error.file] || 0) + 1;
    }

    // Error code
    if (error.code) {
      patterns.byErrorCode[error.code] = (patterns.byErrorCode[error.code] || 0) + 1;
    }
  }

  // Find hotspots (files with most errors)
  patterns.hotspots = Object.entries(patterns.byFile)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([file, count]) => ({ file, count }));

  return patterns;
}

/**
 * Generate error reduction recommendations
 */
function generateRecommendations(consolidated) {
  const recommendations = [];

  const { patterns, groups } = consolidated;

  // Top error categories
  const topCategories = Object.entries(patterns.byCategory)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  for (const [category, count] of topCategories) {
    recommendations.push({
      priority: 'high',
      category,
      issue: `High error count in ${category} (${count} errors)`,
      suggestion: getSuggestionForCategory(category),
      estimatedImpact: Math.round(count * 0.7) // Assume 70% can be auto-fixed
    });
  }

  // Large error groups (likely cascading failures)
  const largeGroups = groups.filter(g => g.count > 5).slice(0, 5);
  for (const group of largeGroups) {
    recommendations.push({
      priority: 'critical',
      category: 'Cascading Failure',
      issue: `${group.count} related errors from: ${group.primary.message.slice(0, 60)}...`,
      suggestion: 'Fix the primary error to resolve all related errors',
      estimatedImpact: group.count - 1
    });
  }

  // Error hotspots
  if (patterns.hotspots.length > 0) {
    const topHotspot = patterns.hotspots[0];
    recommendations.push({
      priority: 'medium',
      category: 'Error Hotspot',
      issue: `File ${topHotspot.file} has ${topHotspot.count} errors`,
      suggestion: 'Consider refactoring or running focused error analysis on this file',
      estimatedImpact: Math.round(topHotspot.count * 0.5)
    });
  }

  return recommendations;
}

function getSuggestionForCategory(category) {
  const suggestions = {
    'TypeScript': 'Run `npm run check:svelte` and fix type errors. Use `any` type sparingly.',
    'CUDA': 'Check GPU memory usage with `nvidia-smi`. Use CUDA_CHECK() macro for error handling.',
    'LibTorch': 'Verify tensor shapes and device placement. Check model compatibility.',
    'MSVC': 'Verify include paths in CMakeLists.txt. Check for missing dependencies.',
    'N-API': 'Ensure proper type conversion between JS and C++. Check for memory leaks.',
    'Svelte': 'Check component syntax. Verify Svelte 5 runes usage ($state, $effect, etc.)'
  };

  return suggestions[category] || 'Review error messages and apply appropriate fixes.';
}

/**
 * Main consolidation function
 */
async function consolidateErrors(tsPath, cppPath, outputPath) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Error Consolidation & Analysis');
  console.log('═══════════════════════════════════════════════════════\n');

  // Load error reports
  let tsErrors = [];
  let cppErrors = [];

  if (fs.existsSync(tsPath)) {
    console.log(`📝 Loading TypeScript errors from: ${tsPath}`);
    const tsData = JSON.parse(fs.readFileSync(tsPath, 'utf-8'));
    tsErrors = (Array.isArray(tsData) ? tsData : tsData.errors || []).map(normalizeTSError);
    console.log(`   Found ${tsErrors.length} TypeScript errors\n`);
  } else {
    console.log(`⚠️  TypeScript error file not found: ${tsPath}\n`);
  }

  if (fs.existsSync(cppPath)) {
    console.log(`📝 Loading C++ errors from: ${cppPath}`);
    const cppData = JSON.parse(fs.readFileSync(cppPath, 'utf-8'));
    cppErrors = (cppData.errors || []).map(normalizeCPPError);
    console.log(`   Found ${cppErrors.length} C++ errors\n`);
  } else {
    console.log(`⚠️  C++ error file not found: ${cppPath}\n`);
  }

  const allErrors = [...tsErrors, ...cppErrors];

  if (allErrors.length === 0) {
    console.log('✅ No errors found! System is clean.\n');
    process.exit(0);
  }

  console.log('📊 Analyzing error patterns...');
  const patterns = analyzeErrorPatterns(allErrors);

  console.log('🔍 Grouping related errors...');
  const groups = groupRelatedErrors(allErrors);

  console.log('💡 Generating recommendations...\n');
  const recommendations = generateRecommendations({ patterns, groups });

  // Build consolidated report
  const consolidated = {
    timestamp: new Date().toISOString(),
    summary: {
      total: allErrors.length,
      typescript: tsErrors.length,
      cpp: cppErrors.length,
      byCategory: patterns.byCategory,
      bySeverity: patterns.bySeverity,
      errorGroups: groups.length,
      uniqueFiles: Object.keys(patterns.byFile).length
    },
    patterns,
    groups: groups.slice(0, 20), // Top 20 error groups
    recommendations,
    errors: allErrors,
    metadata: {
      sources: {
        typescript: tsPath,
        cpp: cppPath
      },
      analysisVersion: '1.0.0',
      toolchain: {
        node: process.version,
        platform: process.platform
      }
    }
  };

  // Save consolidated report
  fs.writeFileSync(outputPath, JSON.stringify(consolidated, null, 2));
  console.log(`📁 Consolidated report saved to: ${outputPath}\n`);

  // Print summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Total errors: ${consolidated.summary.total}`);
  console.log(`  - TypeScript: ${consolidated.summary.typescript}`);
  console.log(`  - C++: ${consolidated.summary.cpp}`);
  console.log(`\nBy severity:`);
  console.log(`  - Errors: ${patterns.bySeverity.error || 0}`);
  console.log(`  - Warnings: ${patterns.bySeverity.warning || 0}`);
  console.log(`  - Critical: ${patterns.bySeverity.critical || 0}`);
  console.log(`\nError groups: ${groups.length}`);
  console.log(`Unique files affected: ${consolidated.summary.uniqueFiles}\n`);

  // Print top recommendations
  if (recommendations.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Top Recommendations');
    console.log('═══════════════════════════════════════════════════════');

    recommendations.slice(0, 5).forEach((rec, idx) => {
      console.log(`\n${idx + 1}. [${rec.priority.toUpperCase()}] ${rec.issue}`);
      console.log(`   ${rec.suggestion}`);
      console.log(`   Estimated impact: Fix ${rec.estimatedImpact} errors`);
    });
    console.log('');
  }

  // Print top hotspots
  if (patterns.hotspots.length > 0) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Error Hotspots (Top 5 Files)');
    console.log('═══════════════════════════════════════════════════════');

    patterns.hotspots.slice(0, 5).forEach((hotspot, idx) => {
      console.log(`${idx + 1}. ${hotspot.file} (${hotspot.count} errors)`);
    });
    console.log('');
  }

  // Exit code based on errors
  const criticalErrors = patterns.bySeverity.error || 0;
  if (criticalErrors > 0) {
    console.log(`❌ Found ${criticalErrors} critical errors`);
    process.exit(1);
  } else {
    console.log(`⚠️  Found ${patterns.bySeverity.warning || 0} warnings (no critical errors)`);
    process.exit(0);
  }
}

// CLI handling
const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

const tsPath = getArg('--ts') || DEFAULT_TS_ERRORS;
const cppPath = getArg('--cpp') || DEFAULT_CPP_ERRORS;
const outputPath = getArg('--output') || DEFAULT_OUTPUT;

consolidateErrors(tsPath, cppPath, outputPath).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
