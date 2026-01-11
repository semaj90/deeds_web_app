#!/usr/bin/env node
/**
 * Phase 90: Cascade Error Detector
 *
 * Analyzes TypeScript files to detect cascade errors caused by root syntax issues.
 * Outputs recommendations for manual review vs safe automated fixing.
 *
 * Usage:
 *   node scripts/phase90-detect-cascade-errors.mjs
 *   node scripts/phase90-detect-cascade-errors.mjs --file src/lib/services/foo.ts
 *   node scripts/phase90-detect-cascade-errors.mjs --export-json
 */

import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  errorDensityThreshold: 50, // errors per 100 lines
  clusterDistanceLines: 5,   // lines between errors to consider a cluster
  minClusterSize: 3,         // minimum errors to be considered a cluster
  targetFiles: [
    'src/lib/services/cognitive-cache-integration.ts',
    'src/lib/services/service-integrations.ts',
    'src/lib/services/minio-service.ts',
    'src/lib/services/enhanced-orchestrator.ts',
  ],
};

// Root patterns that indicate structural issues
const ROOT_CAUSE_PATTERNS = [
  {
    name: 'semicolon_in_object_literal',
    pattern: /\{\s*[^}]*;\s*[^}]*:/,
    severity: 'HIGH',
    description: 'Semicolon used instead of comma in object literal'
  },
  {
    name: 'paren_instead_of_brace',
    pattern: /\{\s*[^}]*\)/m,
    severity: 'HIGH',
    description: 'Closing paren used instead of closing brace'
  },
  {
    name: 'missing_comma_in_list',
    pattern: /,\s*\n\s*\w+\s*\n\s*\w+/,
    severity: 'MEDIUM',
    description: 'Multiple items without commas'
  },
  {
    name: 'unclosed_string',
    pattern: /("|'|`)(?:[^\\]|\\.)*?\n/,
    severity: 'HIGH',
    description: 'String literal not closed before newline'
  },
];

// ============================================================================
// DIAGNOSTICS
// ============================================================================

function getDiagnostics(filePath, content) {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const program = ts.createProgram([filePath], {
    noEmit: true,
    allowJs: true,
    checkJs: false,
  }, {
    getSourceFile: (fileName) => fileName === filePath ? sourceFile : undefined,
    writeFile: () => {},
    getCurrentDirectory: () => process.cwd(),
    getDirectories: () => [],
    fileExists: () => true,
    readFile: () => '',
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  });

  const diagnostics = [
    ...program.getSyntacticDiagnostics(sourceFile),
  ];

  return { sourceFile, diagnostics };
}

// ============================================================================
// ANALYSIS
// ============================================================================

function analyzeErrorDensity(sourceFile, diagnostics) {
  const lineStarts = sourceFile.getLineStarts();
  const totalLines = lineStarts.length;
  const errorCount = diagnostics.length;
  const errorDensity = (errorCount / totalLines) * 100;

  return {
    totalLines,
    errorCount,
    errorDensity: Math.round(errorDensity * 10) / 10,
    isHighDensity: errorDensity > CONFIG.errorDensityThreshold,
  };
}

function findErrorClusters(sourceFile, diagnostics) {
  const clusters = [];
  let currentCluster = [];

  for (let i = 0; i < diagnostics.length; i++) {
    const current = diagnostics[i];
    const currentLine = sourceFile.getLineAndCharacterOfPosition(current.start).line;

    if (currentCluster.length === 0) {
      currentCluster.push({ diagnostic: current, line: currentLine });
    } else {
      const lastLine = currentCluster[currentCluster.length - 1].line;

      if (currentLine - lastLine <= CONFIG.clusterDistanceLines) {
        currentCluster.push({ diagnostic: current, line: currentLine });
      } else {
        if (currentCluster.length >= CONFIG.minClusterSize) {
          clusters.push(currentCluster);
        }
        currentCluster = [{ diagnostic: current, line: currentLine }];
      }
    }
  }

  if (currentCluster.length >= CONFIG.minClusterSize) {
    clusters.push(currentCluster);
  }

  return clusters.map(cluster => ({
    startLine: cluster[0].line + 1,
    endLine: cluster[cluster.length - 1].line + 1,
    errorCount: cluster.length,
    codes: [...new Set(cluster.map(c => c.diagnostic.code))],
  }));
}

function detectRootCauses(content) {
  const rootCauses = [];

  for (const pattern of ROOT_CAUSE_PATTERNS) {
    const matches = content.match(new RegExp(pattern.pattern, 'gm'));
    if (matches) {
      const lines = [];
      let lastIndex = 0;
      let lineNumber = 1;

      for (const match of matches) {
        const index = content.indexOf(match, lastIndex);
        lineNumber += (content.substring(lastIndex, index).match(/\n/g) || []).length;
        lines.push(lineNumber);
        lastIndex = index + match.length;
      }

      rootCauses.push({
        pattern: pattern.name,
        severity: pattern.severity,
        description: pattern.description,
        occurrences: matches.length,
        lines,
      });
    }
  }

  return rootCauses;
}

function assessCascadeRisk(density, clusters, rootCauses) {
  let risk = 'LOW';
  let reasons = [];

  if (density.isHighDensity) {
    risk = 'HIGH';
    reasons.push(`Error density ${density.errorDensity} exceeds threshold ${CONFIG.errorDensityThreshold}`);
  }

  if (clusters.length > 0) {
    risk = risk === 'HIGH' ? 'HIGH' : 'MEDIUM';
    reasons.push(`Found ${clusters.length} error cluster(s)`);
  }

  if (rootCauses.some(rc => rc.severity === 'HIGH')) {
    risk = 'HIGH';
    reasons.push(`Detected ${rootCauses.filter(rc => rc.severity === 'HIGH').length} high-severity root cause pattern(s)`);
  }

  return { risk, reasons };
}

function getRecommendedAction(risk) {
  switch (risk) {
    case 'HIGH':
      return {
        action: 'MANUAL_REVIEW',
        priority: 'URGENT',
        description: 'File requires immediate manual review. Do not attempt automated fixing.',
        steps: [
          'Open file in editor',
          'Sort errors by line number',
          'Identify and fix root causes first (wrong delimiters, missing brackets)',
          'Work from top to bottom',
          'Run validation after each major fix',
        ],
      };
    case 'MEDIUM':
      return {
        action: 'TARGETED_FIX',
        priority: 'MEDIUM',
        description: 'File has error clusters. Manual review of clusters recommended.',
        steps: [
          'Review error clusters manually',
          'Fix root causes in clustered regions',
          'Use Phase 90 for remaining isolated errors',
          'Validate with Phase 91 auto-rollback',
        ],
      };
    default:
      return {
        action: 'SAFE_AUTOFIX',
        priority: 'LOW',
        description: 'File is safe for automated fixing with Phase 90/91.',
        steps: [
          'Run Phase 90 enhanced fixer',
          'Phase 91 will auto-rollback if any regressions',
          'Monitor results',
        ],
      };
  }
}

// ============================================================================
// REPORTING
// ============================================================================

function analyzeFile(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    return null;
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const { sourceFile, diagnostics } = getDiagnostics(absolutePath, content);

  const density = analyzeErrorDensity(sourceFile, diagnostics);
  const clusters = findErrorClusters(sourceFile, diagnostics);
  const rootCauses = detectRootCauses(content);
  const { risk, reasons } = assessCascadeRisk(density, clusters, rootCauses);
  const recommendation = getRecommendedAction(risk);

  return {
    filePath,
    density,
    clusters,
    rootCauses,
    risk,
    reasons,
    recommendation,
  };
}

function printReport(results) {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   PHASE 90: CASCADE ERROR DETECTION REPORT                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Summary
  const highRisk = results.filter(r => r.risk === 'HIGH');
  const mediumRisk = results.filter(r => r.risk === 'MEDIUM');
  const lowRisk = results.filter(r => r.risk === 'LOW');

  console.log('📊 SUMMARY\n');
  console.log(`   Total files analyzed: ${results.length}`);
  console.log(`   🔴 High risk (manual review):  ${highRisk.length}`);
  console.log(`   🟡 Medium risk (targeted fix): ${mediumRisk.length}`);
  console.log(`   🟢 Low risk (safe autofix):    ${lowRisk.length}\n`);

  // Detailed results
  for (const result of results) {
    const icon = result.risk === 'HIGH' ? '🔴' : result.risk === 'MEDIUM' ? '🟡' : '🟢';

    console.log(`${icon} ${path.basename(result.filePath)}`);
    console.log(`   Risk: ${result.risk}`);
    console.log(`   Error Density: ${result.density.errorDensity} errors/100 lines (${result.density.errorCount} errors, ${result.density.totalLines} lines)`);

    if (result.clusters.length > 0) {
      console.log(`   Error Clusters: ${result.clusters.length}`);
      result.clusters.forEach(cluster => {
        console.log(`      • Lines ${cluster.startLine}-${cluster.endLine}: ${cluster.errorCount} errors`);
      });
    }

    if (result.rootCauses.length > 0) {
      console.log(`   Root Causes Detected:`);
      result.rootCauses.forEach(rc => {
        console.log(`      • ${rc.description} (${rc.occurrences}x at lines: ${rc.lines.slice(0, 3).join(', ')}${rc.lines.length > 3 ? '...' : ''})`);
      });
    }

    console.log(`   Recommendation: ${result.recommendation.action}`);
    console.log(`   Priority: ${result.recommendation.priority}`);
    console.log(`   → ${result.recommendation.description}\n`);
  }

  // Action plan
  if (highRisk.length > 0) {
    console.log('🔧 IMMEDIATE ACTION REQUIRED\n');
    console.log('   Files requiring manual review:\n');
    highRisk.forEach(r => {
      console.log(`   📝 ${r.filePath}`);
      r.recommendation.steps.forEach((step, i) => {
        console.log(`      ${i + 1}. ${step}`);
      });
      console.log('');
    });
  }

  if (mediumRisk.length > 0) {
    console.log('⚠️  TARGETED FIXES RECOMMENDED\n');
    console.log('   Files with error clusters:\n');
    mediumRisk.forEach(r => {
      console.log(`   📝 ${r.filePath}`);
      console.log(`      Focus on clusters at lines: ${r.clusters.map(c => `${c.startLine}-${c.endLine}`).join(', ')}\n`);
    });
  }

  if (lowRisk.length > 0) {
    console.log('✅ SAFE FOR AUTOMATED FIXING\n');
    console.log('   Files ready for Phase 90/91:\n');
    lowRisk.forEach(r => {
      console.log(`   • ${r.filePath}`);
    });
    console.log('\n   Run: node scripts/phase91-test-run.mjs\n');
  }
}

function exportToJson(results) {
  const outputPath = path.join(process.cwd(), 'reports', 'cascade-error-detection.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const exportData = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: results.length,
      highRisk: results.filter(r => r.risk === 'HIGH').length,
      mediumRisk: results.filter(r => r.risk === 'MEDIUM').length,
      lowRisk: results.filter(r => r.risk === 'LOW').length,
    },
    files: results,
  };

  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`\n📄 Detailed report exported to: ${outputPath}\n`);
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  const exportJson = args.includes('--export-json');
  const fileArg = args.find(arg => arg.startsWith('--file='));

  let filesToAnalyze = CONFIG.targetFiles;

  if (fileArg) {
    filesToAnalyze = [fileArg.split('=')[1]];
  }

  const results = filesToAnalyze
    .map(analyzeFile)
    .filter(r => r !== null);

  if (results.length === 0) {
    console.log('No files found to analyze.');
    return;
  }

  printReport(results);

  if (exportJson) {
    exportToJson(results);
  }
}

main();
