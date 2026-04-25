#!/usr/bin/env node

import fs from 'fs/promises';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);

// Error patterns to detect - Expanded for comprehensive AST fixing
const ERROR_PATTERNS = {
  // TypeScript Patterns
  TS001: {
    name: 'TypeScript: Union types with comma instead of pipe',
    severity: 'HIGH',
    fileTypes: ['.ts', '.tsx'],
    regex: /(?<=\w+\s*:\s*)(?![\w\s]*[=:])[^;,{}\n]*,\s*\w+(?=\s*[;|=])/g,
    description: 'Type union using comma instead of pipe in TypeScript',
    example: 'let x: string, number = "hello";'
  },
  TS002: {
    name: 'TypeScript: Missing type annotation',
    severity: 'MEDIUM',
    fileTypes: ['.ts', '.tsx'],
    regex: /(?:const|let|var)\s+\w+\s*=\s*(?!\{|\[|['"`]|null|undefined|true|false|\d)/g,
    description: 'Variable declaration without explicit type annotation',
    example: 'const x = 5; // should be const x: number = 5;'
  },
  TS003: {
    name: 'TypeScript: Incorrect optional property syntax',
    severity: 'HIGH',
    fileTypes: ['.ts', '.tsx'],
    regex: /(?<=\w)\?\s*:\s*/g,
    description: 'Optional property using ? before colon instead of after',
    example: 'name?: string; // correct: name?: string;'
  },
  TS004: {
    name: 'TypeScript: Incorrect interface property separator',
    severity: 'HIGH',
    fileTypes: ['.ts', '.tsx'],
    regex: /(?<=\w+\s*(?:\?\s*)?:\s*[^;]+);\s*(?=\w+\s*(?:\?\s*)?:)/g,
    description: 'Interface properties separated by semicolons instead of commas',
    example: 'interface User { name: string; age: number; }'
  },
  TS005: {
    name: 'TypeScript: Missing semicolon in interface',
    severity: 'MEDIUM',
    fileTypes: ['.ts', '.tsx'],
    regex: /(?<=\w+\s*(?:\?\s*)?:\s*[^;]+)(?=\s*\w+\s*(?:\?\s*)?:)/g,
    description: 'Missing semicolon between interface properties',
    example: 'interface User { name: string age: number }'
  },

  // CSS Patterns
  CSS001: {
    name: 'CSS: Commas instead of semicolons',
    severity: 'CRITICAL',
    fileTypes: ['.css', '.scss', '.svelte'],
    regex: /(?<=\w+(?:-\w+)*\s*:\s*[^;]+),\s*(?=\w+(?:-\w+)*\s*:)/g,
    description: 'CSS properties separated by commas instead of semicolons',
    example: 'color: red, font-size: 14px;'
  },
  CSS002: {
    name: 'CSS: Missing semicolons',
    severity: 'MEDIUM',
    fileTypes: ['.css', '.scss', '.svelte'],
    regex: /(?<=\w+(?:-\w+)*\s*:\s*[^;]+)(?=\s*\n|\s*\}|\s*$)(?!\s*[;}]|\s*\n\s*\w+\s*:)/g,
    description: 'CSS property missing trailing semicolon',
    example: 'color: red\nbackground: blue'
  },
  CSS003: {
    name: 'CSS: Double semicolons',
    severity: 'LOW',
    fileTypes: ['.css', '.scss', '.svelte'],
    regex: /;;\s*/g,
    description: 'Double semicolons in CSS',
    example: 'color: red;; background: blue;'
  },

  // JavaScript Patterns
  JS001: {
    name: 'JavaScript: Console statements in production',
    severity: 'LOW',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.svelte', '.mjs'],
    regex: /console\.(log|warn|error|debug|info|trace)\s*\(/g,
    description: 'Console statements left in production code',
    example: 'console.log("Debug info");'
  },
  JS002: {
    name: 'JavaScript: Missing semicolon',
    severity: 'MEDIUM',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.svelte'],
    regex: /(?<=\w+\s*\([^)]*\)\s*|\w+\s*|\+\+|\-\-|\w+\.\w+\s*|\]\s*|\}\s*)(?=\n|\r)(?!\s*[;}\]])/g,
    description: 'Missing semicolon after statement',
    example: 'const x = 5\nconsole.log(x)'
  },
  JS003: {
    name: 'JavaScript: Double equals instead of triple',
    severity: 'HIGH',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.svelte'],
    regex: /(?<=\s|[\(\[{])==(?=\s*\w)/g,
    description: 'Using == instead of === for comparison',
    example: 'if (x == 5) // should be if (x === 5)'
  },

  // Object/Array Patterns
  OBJ001: {
    name: 'JavaScript: Object literal syntax error',
    severity: 'CRITICAL',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.svelte'],
    regex: /(?<=\{[^}]*)\w+\s*,(?=\s*\w+\s*[,}])/g,
    description: 'Object property using comma instead of colon',
    example: '{ name, age: 25 } // should be { name: "John", age: 25 }'
  },
  OBJ002: {
    name: 'JavaScript: Array with missing commas',
    severity: 'MEDIUM',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.svelte'],
    regex: /(?<=\[[\w\s,]*)\w+\s+(?=\w)/g,
    description: 'Array elements not separated by commas',
    example: '[1 2 3] // should be [1, 2, 3]'
  },

  // Syntax Patterns
  SYN001: {
    name: 'Syntax: Double commas',
    severity: 'MEDIUM',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.svelte', '.json'],
    regex: /,,\s*(?![}\]])/g,
    description: 'Double commas in arrays, objects, or parameters',
    example: '[1,,2] or func(a,,b)'
  },
  SYN002: {
    name: 'Syntax: Trailing commas in function calls',
    severity: 'LOW',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.svelte'],
    regex: /(?<=\w+\s*\([^)]*),\s*\)/g,
    description: 'Trailing comma in function parameter list',
    example: 'func(a, b,)'
  },
  SYN003: {
    name: 'Syntax: Incorrect bracket matching',
    severity: 'CRITICAL',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.svelte'],
    regex: /(?<=\w+\s*)\((?=\s*\w+\s*\))/g,
    description: 'Incorrect bracket usage in function calls',
    example: 'func(a b) // should be func(a, b)'
  },

  // Svelte-specific Patterns
  SVELTE001: {
    name: 'Svelte: Incorrect event handler syntax',
    severity: 'HIGH',
    fileTypes: ['.svelte'],
    regex: /on:\w+="\w+"/g,
    description: 'Svelte event handler using quotes instead of curly braces',
    example: '<button on:click="handleClick"> // should be on:click={handleClick}'
  },
  SVELTE002: {
    name: 'Svelte: Missing reactive statement syntax',
    severity: 'MEDIUM',
    fileTypes: ['.svelte'],
    regex: /(?<=\$)\w+\s*=\s*(?!:)/g,
    description: 'Svelte reactive statement missing colon',
    example: '$count = $count + 1 // should be $: count = count + 1'
  },
  SVELTE003: {
    name: 'Svelte: Incorrect store subscription',
    severity: 'HIGH',
    fileTypes: ['.svelte'],
    regex: /(?<=\$)\w+\s*(?![\.:])/g,
    description: 'Incorrect Svelte store subscription syntax',
    example: '$store // should be $store or $: $store'
  },

  // Import/Export Patterns
  IMPORT001: {
    name: 'Import: Missing comma in import statement',
    severity: 'MEDIUM',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.svelte', '.mjs'],
    regex: /(?<=\bimport\s+{[^}]*\w+)\s+(?=\w)/g,
    description: 'Missing comma between imported items',
    example: 'import { a b } from "module"'
  },
  IMPORT002: {
    name: 'Import: Incorrect default import syntax',
    severity: 'HIGH',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.svelte', '.mjs'],
    regex: /import\s+\w+\s+from/g,
    description: 'Default import without curly braces',
    example: 'import React from "react" // should be import React, { useState } from "react"'
  },

  // String/Template Literal Patterns
  STR001: {
    name: 'String: Unclosed template literal',
    severity: 'CRITICAL',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.svelte'],
    regex: /`[^`]*$/gm,
    description: 'Template literal not properly closed',
    example: 'const str = `Hello ${name // missing closing backtick'
  },
  STR002: {
    name: 'String: Mixed quotes',
    severity: 'MEDIUM',
    fileTypes: ['.js', '.ts', '.jsx', '.tsx', '.svelte'],
    regex: /"[^"]*'[^"]*"|'[^']*"[^']*'/g,
    description: 'Mixed single and double quotes in same string',
    example: '"It\'s a "test"" // should be "It\'s a test" or \'It"s a test\''
  }
};

async function main() {
  try {
    const scanDir = process.cwd();
    console.log(`📁 Scanning directory: ${scanDir}`);

    console.log('🔍 Starting glob scan...');
    const { glob } = require('glob');
    const files = glob.sync('**/*.{js,ts,jsx,tsx,svelte,css,scss}', {
      cwd: scanDir,
      absolute: true,
      ignore: ['node_modules/**', '.svelte-kit/**', 'build/**', 'dist/**']
    });

    console.log(`📊 Found ${files.length} files total`);

    // Process files in batches of 1000
    const batchSize = 1000;
    const totalBatches = Math.ceil(files.length / batchSize);
    let allErrors = [];
    let totalProcessed = 0;

    console.log(`🚀 Processing ${totalBatches} batches of ${batchSize} files each...`);
    console.log('');

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIndex = batchIndex * batchSize;
      const endIndex = Math.min(startIndex + batchSize, files.length);
      const batchFiles = files.slice(startIndex, endIndex);

      console.log(`📦 Batch ${batchIndex + 1}/${totalBatches}: Processing files ${startIndex + 1}-${endIndex}`);

      const batchErrors = await processBatch(batchFiles, batchIndex + 1, totalBatches);
      allErrors = allErrors.concat(batchErrors);
      totalProcessed += batchFiles.length;

      console.log(`   ✅ Batch ${batchIndex + 1} complete: ${batchErrors.length} errors found`);
      console.log('');
    }

    console.log(`🎯 Analysis complete! Processed ${totalProcessed} files, found ${allErrors.length} potential errors.`);

    // Group errors by pattern and severity
    const patternBreakdown = {};
    const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const fileTypeStats = {};
    const patternDetails = {};

    for (const error of allErrors) {
      // Pattern breakdown
      if (!patternBreakdown[error.pattern]) {
        patternBreakdown[error.pattern] = 0;
      }
      patternBreakdown[error.pattern]++;

      // Severity counts
      severityCounts[error.severity]++;

      // File type stats
      const fileExt = path.extname(error.file).toLowerCase();
      if (!fileTypeStats[fileExt]) {
        fileTypeStats[fileExt] = { files: new Set(), errors: 0 };
      }
      fileTypeStats[fileExt].files.add(error.file);
      fileTypeStats[fileExt].errors++;

      // Pattern details for AST fixing
      if (!patternDetails[error.pattern]) {
        patternDetails[error.pattern] = {
          name: ERROR_PATTERNS[error.pattern]?.name || error.pattern,
          severity: error.severity,
          examples: [],
          files: new Set(),
          totalCount: 0
        };
      }
      patternDetails[error.pattern].totalCount++;
      patternDetails[error.pattern].files.add(error.file);
      if (patternDetails[error.pattern].examples.length < 5) {
        patternDetails[error.pattern].examples.push({
          file: error.file,
          line: error.line,
          match: error.match,
          suggestion: error.suggestion
        });
      }
    }

    // Create comprehensive results
    const results = {
      timestamp: new Date().toISOString(),
      summary: {
        totalFiles: files.length,
        processedFiles: totalProcessed,
        totalErrors: allErrors.length,
        criticalErrors: severityCounts.CRITICAL,
        highSeverity: severityCounts.HIGH,
        mediumSeverity: severityCounts.MEDIUM,
        lowSeverity: severityCounts.LOW,
        batchesProcessed: totalBatches,
        batchSize: batchSize
      },
      patternBreakdown,
      fileTypeStats: Object.fromEntries(
        Object.entries(fileTypeStats).map(([ext, stats]) => [
          ext,
          { fileCount: stats.files.size, errorCount: stats.errors }
        ])
      ),
      patternDetails: Object.fromEntries(
        Object.entries(patternDetails).map(([id, details]) => [
          id,
          {
            ...details,
            files: Array.from(details.files),
            fileCount: details.files.size
          }
        ])
      ),
      topErrors: allErrors.slice(0, 50) // Top 50 errors for AST fixing
    };

    // Print comprehensive summary
    printComprehensiveSummary(results);
    console.log('');

    // Ensure analysis directory exists
    const analysisDir = path.join(scanDir, 'analysis');
    await fs.mkdir(analysisDir, { recursive: true });

    // Save results
    const outputPath = path.join(analysisDir, 'error-patterns-comprehensive.json');
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
    console.log(`✅ Comprehensive results saved to: ${outputPath}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

async function processBatch(batchFiles, batchNumber, totalBatches) {
  const errors = [];
  let processedCount = 0;

  for (const file of batchFiles) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      const fileErrors = analyzeFile(file, content);
      if (fileErrors.length > 0) {
        errors.push(...fileErrors);
      }
      processedCount++;

      // Progress indicator every 100 files in batch
      if (processedCount % 100 === 0) {
        const progress = ((processedCount / batchFiles.length) * 100).toFixed(1);
        console.log(`   📊 ${progress}% complete (${processedCount}/${batchFiles.length} files)`);
      }
    } catch (error) {
      // Skip files that can't be read
    }
  }

  return errors;
}

function analyzeFile(filePath, content) {
  const errors = [];
  const fileExt = path.extname(filePath).toLowerCase();

  for (const [patternId, pattern] of Object.entries(ERROR_PATTERNS)) {
    // Check if pattern applies to this file type
    if (pattern.fileTypes && !pattern.fileTypes.includes(fileExt)) {
      continue;
    }

    const matches = content.match(pattern.regex);
    if (matches) {
      for (const match of matches) {
        // Additional context validation for certain patterns
        if (isValidError(patternId, match, content, filePath)) {
          errors.push({
            file: path.relative(process.cwd(), filePath),
            pattern: patternId,
            severity: pattern.severity,
            description: pattern.description,
            match: match.trim(),
            line: getLineNumber(content, match),
            suggestion: getFixSuggestion(patternId, match)
          });
        }
      }
    }
  }

  return errors;
}

function isValidError(patternId, match, content, filePath) {
  // Additional validation logic to reduce false positives

  switch (patternId) {
    case 'TS001':
      // Make sure this is actually a type annotation, not object property
      const beforeMatch = content.substring(0, content.indexOf(match)).slice(-50);
      return /\b(?:const|let|var|function|\w+\s*:\s*)\w+\s*$/.test(beforeMatch);

    case 'TS002':
      // Skip if it's in a context where types might not be needed (like destructuring)
      return !match.includes('{') && !match.includes('[');

    case 'CSS001':
    case 'CSS002':
      // Make sure we're in CSS context, not JavaScript
      const fileExt = path.extname(filePath).toLowerCase();
      return ['.css', '.scss'].includes(fileExt) ||
             (fileExt === '.svelte' && isInStyleBlock(content, match));

    default:
      return true;
  }
}

function isInStyleBlock(content, match) {
  const matchIndex = content.indexOf(match);
  const beforeMatch = content.substring(0, matchIndex);
  const lastStyleOpen = beforeMatch.lastIndexOf('<style');
  const lastStyleClose = beforeMatch.lastIndexOf('</style>');

  return lastStyleOpen > lastStyleClose;
}

function getFixSuggestion(patternId, match) {
  switch (patternId) {
    case 'TS001':
      return match.replace(/,\s*/g, ' | ');
    case 'CSS001':
      return match.replace(/,\s*(?=\w)/g, '; ');
    case 'CSS002':
      return match + ';';
    case 'OBJ001':
      return match.replace(/(\w+)\s*,/g, '$1: /* value */,');
    case 'SYN001':
      return match.replace(/,,/g, ',');
    default:
      return 'Manual review required';
  }
}

function getLineNumber(content, match) {
  const index = content.indexOf(match);
  if (index === -1) return 0;
  return content.substring(0, index).split('\n').length;
}

function printComprehensiveSummary(results) {
  const border = '═'.repeat(100);
  console.log('');
  console.log(border);
  console.log('🔍 COMPREHENSIVE ERROR PATTERN ANALYSIS - AST PHASE READY');
  console.log(border);

  console.log(`📁 Files scanned: ${results.summary.processedFiles}/${results.summary.totalFiles}`);
  console.log(`🔴 Total errors: ${results.summary.totalErrors.toLocaleString()}`);
  console.log(`🚨 Critical: ${results.summary.criticalErrors.toLocaleString()}`);
  console.log(`⚠️  High: ${results.summary.highSeverity.toLocaleString()}`);
  console.log(`ℹ️  Medium: ${results.summary.mediumSeverity.toLocaleString()}`);
  console.log(`✅ Low: ${results.summary.lowSeverity.toLocaleString()}`);
  console.log(`📦 Batches processed: ${results.summary.batchesProcessed} (${results.summary.batchSize} files each)`);
  console.log('');

  console.log('📋 Pattern Breakdown:');
  for (const [pattern, count] of Object.entries(results.patternBreakdown)) {
    const severity = getSeverityForPattern(pattern);
    const icon = severity === 'CRITICAL' ? '🚨' : severity === 'HIGH' ? '⚠️' : severity === 'MEDIUM' ? 'ℹ️' : '✅';
    const patternInfo = ERROR_PATTERNS[pattern];
    const name = patternInfo ? patternInfo.name : pattern;
    console.log(`  ${icon} ${pattern}: ${count.toLocaleString()} - ${name}`);
  }

  // Show top 5 errors with suggestions
  if (results.topErrors && results.topErrors.length > 0) {
    console.log('');
    console.log('💡 Top Error Examples with Fix Suggestions:');
    const topErrors = results.topErrors.slice(0, 5);
    topErrors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error.file}:${error.line} - ${error.description}`);
      console.log(`     Found: "${error.match}"`);
      if (error.suggestion) {
        console.log(`     Fix: "${error.suggestion}"`);
      }
      console.log('');
    });
  }
}

function getSeverityForPattern(patternId) {
  const pattern = ERROR_PATTERNS[patternId];
  return pattern ? pattern.severity : 'UNKNOWN';
}

main();

export { ERROR_PATTERNS, getSeverityForPattern, analyzeFile };