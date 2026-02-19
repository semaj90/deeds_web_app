#!/usr/bin/env node
/**
 * 🧠 Error Pattern Analyzer & Recognition System
 *
 * Identifies, categorizes, and logs all error patterns in the codebase
 * Creates pattern registry for comprehensive error fixing strategy
 *
 * Patterns discovered:
 * 1. CSS commas instead of semicolons: `top: 10px, right: 10px` → `top: 10px; right: 10px`
 * 2. Object literal corruptions: `{ key, value }` → `{ key: value }`
 * 3. Semicolons between properties: `a: 1; b: 2` → `a: 1, b: 2`
 * 4. Double commas and orphaned semicolons
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.resolve(rootDir, 'sveltekit-frontend');

// Pattern definitions with recognition logic
const ERROR_PATTERNS = {
  CSS_COMMA_INSTEAD_OF_SEMICOLON: {
    id: 'CSS001',
    name: 'CSS commas instead of semicolons',
    description: 'CSS properties separated by commas instead of semicolons or mixed',
    regex: /([a-z-]+:\s*[^;,}]+),(\s*[a-z-]+:)/g,
    example: 'top: 10px, right: 10px; background: red',
    severity: 'CRITICAL',
    affectedTypes: ['svelte', 'css'],
    fix: (match, p1, p2) => `${p1};${p2}`,
    detector: (line) => {
      // Look for CSS property pattern followed by comma, then another property
      const cssPropertyPattern = /^\s*\.[a-z-]+\s*\{[^}]*[a-z-]+:\s*[^;,}]+,\s*[a-z-]+:/;
      return cssPropertyPattern.test(line);
    }
  },

  OBJECT_LITERAL_COMMA_TO_COLON: {
    id: 'OBJ001',
    name: 'Object literal commas instead of colons',
    description: 'Object properties using commas instead of colons: { key, value }',
    regex: /(\{\s*[A-Za-z_$][A-Za-z0-9_$]*)\s*,\s*(?=[0-9\-\[]|['"`]|true|false|null|{|\[)/g,
    example: '{ prop, 123 } should be { prop: 123 }',
    severity: 'CRITICAL',
    affectedTypes: ['ts', 'js', 'svelte'],
    fix: (match, p1) => `${p1}:`,
    detector: (line) => {
      return /\{\s*[A-Za-z_$][A-Za-z0-9_$]*\s*,\s*(?=[0-9\-\[]|['"`]|true|false|null)/.test(line);
    }
  },

  SEMICOLON_BETWEEN_PROPERTIES: {
    id: 'OBJ002',
    name: 'Semicolons between object properties',
    description: 'Object properties separated by semicolons instead of commas',
    regex: /([A-Za-z_$][A-Za-z0-9_$]*\s*:\s*[^\s,}]+);(\s*[A-Za-z_$][A-Za-z0-9_$]*\s*:)/g,
    example: '{ a: 1; b: 2 } should be { a: 1, b: 2 }',
    severity: 'CRITICAL',
    affectedTypes: ['ts', 'js', 'svelte'],
    fix: (match, p1, p2) => `${p1},${p2}`,
    detector: (line) => {
      return /:\s*[^\s,}]+;\s*[A-Za-z_$][A-Za-z0-9_$]*\s*:/.test(line);
    }
  },

  DOUBLE_COMMAS: {
    id: 'SYN001',
    name: 'Double commas',
    description: 'Duplicate commas in object literals or arrays',
    regex: /,\s*,/g,
    example: '{ a, , b }',
    severity: 'HIGH',
    affectedTypes: ['ts', 'js', 'svelte'],
    fix: (match) => ',',
    detector: (line) => /,\s*,/.test(line)
  },

  ORPHANED_SEMICOLON: {
    id: 'SYN002',
    name: 'Orphaned semicolon before brace',
    description: 'Semicolon immediately before closing brace',
    regex: /;\s*(\})/g,
    example: '{ a: 1; }',
    severity: 'MEDIUM',
    affectedTypes: ['ts', 'js', 'svelte'],
    fix: (match, p1) => p1,
    detector: (line) => /;\s*\}/.test(line)
  },

  CSS_DOUBLE_COMMAS: {
    id: 'CSS002',
    name: 'CSS double commas',
    description: 'Duplicate commas in CSS rules',
    regex: /([a-z-]+:\s*[^;]+),,(\s*[a-z-]+)/g,
    example: 'color: red,, background: blue',
    severity: 'HIGH',
    affectedTypes: ['svelte', 'css'],
    fix: (match, p1, p2) => `${p1},${p2}`,
    detector: (line) => /[a-z-]+:\s*[^;]+,,/.test(line)
  },

  TRAILING_COMMA_IN_FUNCTION: {
    id: 'SYN003',
    name: 'Trailing comma in function arguments',
    description: 'Function call with trailing comma before closing paren',
    regex: /\(\s*[^)]*,\s*\)/g,
    example: 'func(a, b, )',
    severity: 'MEDIUM',
    affectedTypes: ['ts', 'js', 'svelte'],
    fix: (match) => match.replace(/,\s*\)/, ')'),
    detector: (line) => /\(\s*[^)]*,\s*\)/.test(line)
  },

  TYPE_ANNOTATION_COMMA: {
    id: 'TS001',
    name: 'Type annotation with comma instead of pipe',
    description: 'Type union using comma instead of pipe: Type1, Type2',
    regex: /:\s*[A-Za-z]+\s*,\s*[A-Za-z]+(?![A-Za-z0-9_$])/g,
    example: 'const x: string, number = 5;',
    severity: 'HIGH',
    affectedTypes: ['ts'],
    fix: (match) => match.replace(/,/, ' |'),
    detector: (line) => /:\s*[A-Za-z]+\s*,\s*[A-Za-z]+(?![A-Za-z0-9_$])/.test(line)
  }
};

/**
 * Scan files and detect error patterns
 */
async function analyzePatterns() {
  console.log('🔍 Error Pattern Analyzer - Comprehensive Scan\n');
  console.log('🎯 Scanning', frontendDir, '\n');

  const results = {
    timestamp: new Date().toISOString(),
    patterns: {},
    filesByPattern: {},
    totalFilesScanned: 0,
    totalErrorsDetected: 0,
    summary: {}
  };

  // Initialize pattern tracking
  Object.values(ERROR_PATTERNS).forEach(pattern => {
    results.patterns[pattern.id] = {
      ...pattern,
      detectedCount: 0,
      affectedFiles: []
    };
    results.filesByPattern[pattern.id] = [];
  });

  try {
    // Scan Svelte files
    const svelteFiles = await glob(`${frontendDir}/src/**/*.svelte`);
    const tsFiles = await glob(`${frontendDir}/src/**/*.ts`);
    const jsFiles = await glob(`${frontendDir}/src/**/*.js`);

    const allFiles = [...svelteFiles, ...tsFiles, ...jsFiles];
    results.totalFilesScanned = allFiles.length;

    console.log(`📊 Found ${allFiles.length} files to scan\n`);

    for (const file of allFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];

          // Check each pattern
          Object.entries(ERROR_PATTERNS).forEach(([patternKey, pattern]) => {
            if (pattern.detector(line)) {
              const matches = line.match(pattern.regex);
              if (matches) {
                results.patterns[pattern.id].detectedCount += matches.length;
                results.totalErrorsDetected += matches.length;

                if (!results.patterns[pattern.id].affectedFiles.includes(file)) {
                  results.patterns[pattern.id].affectedFiles.push(file);
                  results.filesByPattern[pattern.id].push({
                    file,
                    line: lineNum + 1,
                    content: line.trim().substring(0, 120)
                  });
                }
              }
            }
          });
        }
      } catch (e) {
        // Skip files that can't be read
      }
    }

    // Generate summary
    results.summary = {
      totalErrors: results.totalErrorsDetected,
      criticalErrors: Object.values(results.patterns)
        .filter(p => p.severity === 'CRITICAL')
        .reduce((sum, p) => sum + p.detectedCount, 0),
      highSeverity: Object.values(results.patterns)
        .filter(p => p.severity === 'HIGH')
        .reduce((sum, p) => sum + p.detectedCount, 0),
      mediumSeverity: Object.values(results.patterns)
        .filter(p => p.severity === 'MEDIUM')
        .reduce((sum, p) => sum + p.detectedCount, 0),
      patternBreakdown: Object.values(results.patterns)
        .map(p => ({ id: p.id, name: p.name, count: p.detectedCount, files: p.affectedFiles.length }))
        .sort((a, b) => b.count - a.count)
    };

    return results;
  } catch (e) {
    console.error('❌ Error during analysis:', e.message);
    return results;
  }
}

/**
 * Print analysis results
 */
function printResults(results) {
  console.log('\n' + '═'.repeat(80));
  console.log('📋 ERROR PATTERN ANALYSIS REPORT');
  console.log('═'.repeat(80) + '\n');

  console.log(`📊 SUMMARY`);
  console.log(`  Files scanned:        ${results.totalFilesScanned}`);
  console.log(`  Total errors found:   ${results.summary.totalErrors}`);
  console.log(`  Critical severity:    ${results.summary.criticalErrors}`);
  console.log(`  High severity:        ${results.summary.highSeverity}`);
  console.log(`  Medium severity:      ${results.summary.mediumSeverity}\n`);

  console.log(`🎯 PATTERN BREAKDOWN (by frequency):`);
  results.summary.patternBreakdown.forEach(p => {
    console.log(`  [${p.id}] ${p.name}`);
    console.log(`    └─ Occurrences: ${p.count} | Files affected: ${p.files}`);
  });

  console.log('\n' + '─'.repeat(80));
  console.log('🔧 DETAILED PATTERN INFORMATION\n');

  Object.entries(results.patterns).forEach(([id, pattern]) => {
    if (pattern.detectedCount > 0) {
      console.log(`[${pattern.id}] ${pattern.name}`);
      console.log(`  Severity: ${pattern.severity}`);
      console.log(`  Description: ${pattern.description}`);
      console.log(`  Example: ${pattern.example}`);
      console.log(`  Detected: ${pattern.detectedCount} occurrence(s)`);
      console.log(`  Affected files: ${pattern.affectedFiles.length}`);

      if (pattern.affectedFiles.length > 0 && pattern.affectedFiles.length <= 5) {
        pattern.affectedFiles.forEach((f, idx) => {
          const relPath = path.relative(rootDir, f);
          console.log(`    ${idx + 1}. ${relPath}`);
        });
      } else if (pattern.affectedFiles.length > 5) {
        pattern.affectedFiles.slice(0, 3).forEach((f, idx) => {
          const relPath = path.relative(rootDir, f);
          console.log(`    ${idx + 1}. ${relPath}`);
        });
        console.log(`    ... and ${pattern.affectedFiles.length - 3} more files`);
      }
      console.log('');
    }
  });

  console.log('═'.repeat(80) + '\n');
}

/**
 * Save results to JSON
 */
function saveResults(results) {
  const outputPath = path.resolve(rootDir, 'error-analysis', 'error-patterns.json');

  // Ensure directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create a serializable version (remove regex objects)
  const serializable = {
    timestamp: results.timestamp,
    summary: results.summary,
    patterns: Object.entries(results.patterns).map(([id, pattern]) => ({
      id: pattern.id,
      name: pattern.name,
      description: pattern.description,
      severity: pattern.severity,
      affectedTypes: pattern.affectedTypes,
      example: pattern.example,
      detectedCount: pattern.detectedCount,
      affectedFiles: pattern.affectedFiles.map(f => path.relative(rootDir, f))
    })),
    filesByPattern: Object.entries(results.filesByPattern).reduce((acc, [patternId, files]) => {
      acc[patternId] = files.map(f => ({
        file: path.relative(rootDir, f.file),
        line: f.line,
        content: f.content
      }));
      return acc;
    }, {})
  };

  fs.writeFileSync(outputPath, JSON.stringify(serializable, null, 2));
  console.log(`✅ Results saved to: ${path.relative(rootDir, outputPath)}`);
}

/**
 * Main execution
 */
async function main() {
  const results = await analyzePatterns();
  printResults(results);
  saveResults(results);
}

main().catch(console.error);
