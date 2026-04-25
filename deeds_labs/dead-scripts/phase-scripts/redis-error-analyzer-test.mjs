#!/usr/bin/env node

/**
 * Redis Error Analyzer - Comprehensive Pattern Analysis
 * Scans codebase for common syntax errors and patterns
 */

import fs from 'fs/promises';
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { glob } = require('glob');

// Hardcoded args for testing
const args = {
  top: '10',
  output: 'test-errors.json',
  'cache-only': false,
  refresh: false,
  incremental: false,
  'batch-size': '50',
  parallel: '4'
};

// Error patterns to detect
const ERROR_PATTERNS = {
  TS001: {
    name: 'Type annotation with comma instead of pipe',
    severity: 'HIGH',
    regex: /(?:const|let|var|function|\w+\s*:\s*)\w+\s*:\s*[^|]*,\s*\w+/g,
    description: 'Type union using comma instead of pipe: Type1, Type2',
    example: 'const x: string, number = 5;'
  },
  CSS001: {
    name: 'CSS commas instead of semicolons',
    severity: 'CRITICAL',
    regex: /(?:[\w-]+\s*:\s*[^;]+),\s*(?:[\w-]+\s*:)/g,
    description: 'CSS properties separated by commas instead of semicolons',
    example: 'top: 10px, right: 10px; background: red'
  },
  OBJ001: {
    name: 'Object literal commas instead of colons',
    severity: 'CRITICAL',
    regex: /\{\s*\w+\s*,/g,
    description: 'Object properties using commas instead of colons',
    example: '{ prop, 123 } should be { prop: 123 }'
  },
  OBJ002: {
    name: 'Semicolons between object properties',
    severity: 'CRITICAL',
    regex: /\{\s*[\w\s]+:\s*[^;]+;\s*[\w\s]+:/g,
    description: 'Object properties separated by semicolons instead of commas',
    example: '{ a: 1; b: 2 } should be { a: 1, b: 2 }'
  },
  SYN001: {
    name: 'Double commas',
    severity: 'MEDIUM',
    regex: /,,\s*/g,
    description: 'Double commas in arrays, objects, or parameters',
    example: '[1,,2] or func(a,,b)'
  },
  SYN002: {
    name: 'Orphaned semicolon before brace',
    severity: 'MEDIUM',
    regex: /;\s*\}/g,
    description: 'Semicolon immediately before closing brace',
    example: '{ a: 1; }'
  },
  SYN003: {
    name: 'Trailing comma in function arguments',
    severity: 'LOW',
    regex: /function\s+\w+\s*\([^)]*,\s*\)/g,
    description: 'Trailing comma in function parameter list',
    example: 'function test(a, b,)'
  },
  CSS002: {
    name: 'CSS double commas',
    severity: 'MEDIUM',
    regex: /,,\s*(?:[\w-]+\s*:)/g,
    description: 'Double commas in CSS property lists',
    example: 'margin: 10px,, 20px;'
  }
};

const SEVERITY_LEVELS = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0
};

class ErrorPatternAnalyzer {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      summary: {
        totalErrors: 0,
        criticalErrors: 0,
        highSeverity: 0,
        mediumSeverity: 0,
        patternBreakdown: []
      },
      patterns: {},
      files: {}
    };
  }

  async scanDirectory(dirPath) {
    console.log('≡ƒöì Error Pattern Analyzer - Comprehensive Scan');
    console.log('📂 Directory:', dirPath);
    console.log('🔍 Starting glob scan...');

    const { glob } = require('glob');
    console.log('📊 Glob loaded, calling glob.sync...');
    const files = glob.sync('**/*.{js,ts,jsx,tsx,svelte,css,scss}', {
      cwd: dirPath,
      absolute: true,
      ignore: ['node_modules/**', '.svelte-kit/**', 'build/**', 'dist/**']
    });
    console.log('📁 Glob completed, found', files.length, 'files');

    // For testing, limit to first 100 files
    const limitedFiles = files.slice(0, 100);
    console.log('≡ƒôè Found', files.length, 'files total, processing first', limitedFiles.length, 'for testing');
    console.log('📋 Sample files:', limitedFiles.slice(0, 3).map(f => path.basename(f)));
    console.log('');

    // Progress bar setup
    const totalFiles = limitedFiles.length;
    let processedFiles = 0;

    for (const file of limitedFiles) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const relativePath = path.relative(dirPath, file);

        await this.analyzeFile(relativePath, content);
        processedFiles++;

        if (processedFiles % 100 === 0) {
          console.log(`Processed ${processedFiles}/${totalFiles} files...`);
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    this.generateReport();
  }

  async analyzeFile(filePath, content) {
    const fileErrors = {};

    for (const [patternId, pattern] of Object.entries(ERROR_PATTERNS)) {
      const matches = content.match(pattern.regex);
      if (matches) {
        const count = matches.length;

        if (!fileErrors[patternId]) {
          fileErrors[patternId] = 0;
        }
        fileErrors[patternId] += count;

        // Track pattern statistics
        if (!this.results.patterns[patternId]) {
          this.results.patterns[patternId] = {
            name: pattern.name,
            severity: pattern.severity,
            count: 0,
            files: new Set(),
            description: pattern.description,
            example: pattern.example
          };
        }

        this.results.patterns[patternId].count += count;
        this.results.patterns[patternId].files.add(filePath);
      }
    }

    if (Object.keys(fileErrors).length > 0) {
      this.results.files[filePath] = fileErrors;
    }
  }

  generateReport() {
    // Calculate summary statistics
    let totalErrors = 0;
    let criticalErrors = 0;
    let highSeverity = 0;
    let mediumSeverity = 0;

    for (const [patternId, pattern] of Object.entries(this.results.patterns)) {
      const count = pattern.count;
      totalErrors += count;

      switch (pattern.severity) {
        case 'CRITICAL':
          criticalErrors += count;
          break;
        case 'HIGH':
          highSeverity += count;
          break;
        case 'MEDIUM':
          mediumSeverity += count;
          break;
      }
    }

    this.results.summary.totalErrors = totalErrors;
    this.results.summary.criticalErrors = criticalErrors;
    this.results.summary.highSeverity = highSeverity;
    this.results.summary.mediumSeverity = mediumSeverity;

    // Sort patterns by frequency
    const sortedPatterns = Object.entries(this.results.patterns)
      .sort(([,a], [,b]) => b.count - a.count)
      .map(([id, pattern]) => ({
        id,
        name: pattern.name,
        count: pattern.count,
        files: pattern.files.size,
        severity: pattern.severity
      }));

    this.results.summary.patternBreakdown = sortedPatterns;

    // Generate formatted output
    this.printReport();
  }

  printReport() {
    const border = 'ΓòÉ'.repeat(100);
    console.log('');
    console.log(border);
    console.log('≡ƒôï ERROR PATTERN ANALYSIS REPORT');
    console.log(border);
    console.log('');

    console.log('≡ƒôè SUMMARY');
    console.log('  Files scanned:       ', Object.keys(this.results.files).length + 1); // +1 for the scan itself
    console.log('  Total errors found:  ', this.results.summary.totalErrors.toLocaleString());
    console.log('  Critical severity:   ', this.results.summary.criticalErrors.toLocaleString());
    console.log('  High severity:       ', this.results.summary.highSeverity.toLocaleString());
    console.log('  Medium severity:     ', this.results.summary.mediumSeverity.toLocaleString());
    console.log('');

    console.log('≡ƒÄ» PATTERN BREAKDOWN (by frequency):');

    for (const pattern of this.results.summary.patternBreakdown) {
      const severityIcon = pattern.severity === 'CRITICAL' ? 'ΓööΓöÇ' : 'ΓööΓöÇ';
      console.log(`  [${pattern.id}] ${pattern.name}`);
      console.log(`    ${severityIcon} Occurrences: ${pattern.count.toLocaleString()} | Files affected: ${pattern.files}`);
    }

    console.log('');
    const detailBorder = 'ΓöÇ'.repeat(100);
    console.log(detailBorder);
    console.log('≡ƒöº DETAILED PATTERN INFORMATION');
    console.log('');

    for (const [patternId, pattern] of Object.entries(this.results.patterns)) {
      console.log(`[${patternId}] ${pattern.name}`);
      console.log(`  Severity: ${pattern.severity}`);
      console.log(`  Description: ${pattern.description}`);
      console.log(`  Example: ${pattern.example}`);
      console.log(`  Detected: ${pattern.count.toLocaleString()} occurrence(s)`);
      console.log(`  Affected files: ${pattern.files.size}`);

      // Show first few affected files
      const files = Array.from(pattern.files).slice(0, 5);
      files.forEach((file, index) => {
        console.log(`    ${index + 1}. ${file}`);
      });

      if (pattern.files.size > 5) {
        console.log(`    ... and ${pattern.files.size - 5} more files`);
      }

      console.log('');
    }

    console.log(border);
    console.log('');
    console.log('Γ£à Results saved to: analysis\\error-patterns.json');
  }

  async saveResults(outputPath) {
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Convert Sets to Arrays for JSON serialization
    const serializable = {
      ...this.results,
      patterns: Object.fromEntries(
        Object.entries(this.results.patterns).map(([id, pattern]) => [
          id,
          {
            ...pattern,
            files: Array.from(pattern.files)
          }
        ])
      )
    };

    await fs.writeFile(outputPath, JSON.stringify(serializable, null, 2));
    console.log(`✅ Results saved to: ${outputPath}`);
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting Redis Error Analyzer...');
  console.log('Arguments:', process.argv.slice(2));
  const analyzer = new ErrorPatternAnalyzer();

  // Default to sveltekit-frontend directory
  const scanDir = process.cwd();
  console.log(`📁 Scanning directory: ${scanDir}`);

  await analyzer.scanDirectory(scanDir);

  // Save results
  const outputPath = path.join(process.cwd(), 'analysis', 'error-patterns.json');
  await analyzer.saveResults(outputPath);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ERROR_PATTERNS, ErrorPatternAnalyzer };

