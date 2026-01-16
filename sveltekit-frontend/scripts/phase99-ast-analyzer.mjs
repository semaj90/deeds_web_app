#!/usr/bin/env node
/**
 * Phase 99: ACE Contextual AST Error Analyzer
 * Analyzes TypeScript errors from tsc output and generates comprehensive reports
 * with AST-level pattern detection for automated fixing
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// TSC Error Pattern Categories
const ERROR_PATTERNS = {
  // Type annotation missing
  TS7006: {
    name: 'implicit_any',
    pattern: /error TS7006: Parameter '([^']+)' implicitly has an 'any' type/,
    category: 'type_annotation',
    fix: 'Add explicit type annotation'
  },
  TS7034: {
    name: 'implicit_any_variable',
    pattern: /error TS7034: Variable '([^']+)' implicitly has type 'any'/,
    category: 'type_annotation',
    fix: 'Add explicit type declaration'
  },

  // Import/Export issues
  TS2307: {
    name: 'cannot_find_module',
    pattern: /error TS2307: Cannot find module '([^']+)'/,
    category: 'import',
    fix: 'Fix import path or add .js extension'
  },
  TS2305: {
    name: 'module_has_no_export',
    pattern: /error TS2305: Module '([^']+)' has no exported member '([^']+)'/,
    category: 'import',
    fix: 'Fix named import or use default import'
  },

  // Type mismatch
  TS2322: {
    name: 'type_not_assignable',
    pattern: /error TS2322: Type '([^']+)' is not assignable to type '([^']+)'/,
    category: 'type_mismatch',
    fix: 'Add type assertion or fix type definition'
  },
  TS2345: {
    name: 'argument_type_mismatch',
    pattern: /error TS2345: Argument of type '([^']+)' is not assignable to parameter of type '([^']+)'/,
    category: 'type_mismatch',
    fix: 'Fix argument type or function signature'
  },

  // Null/undefined checks
  TS2532: {
    name: 'object_possibly_undefined',
    pattern: /error TS2532: Object is possibly 'undefined'/,
    category: 'null_check',
    fix: 'Add optional chaining or null check'
  },
  TS2531: {
    name: 'object_possibly_null',
    pattern: /error TS2531: Object is possibly 'null'/,
    category: 'null_check',
    fix: 'Add null check or use nullish coalescing'
  },

  // Property access
  TS2339: {
    name: 'property_does_not_exist',
    pattern: /error TS2339: Property '([^']+)' does not exist on type '([^']+)'/,
    category: 'property_access',
    fix: 'Add property to type or use type assertion'
  },

  // Function issues
  TS2554: {
    name: 'expected_arguments',
    pattern: /error TS2554: Expected (\d+) arguments, but got (\d+)/,
    category: 'function_call',
    fix: 'Fix function call arguments'
  },
  TS2769: {
    name: 'no_overload_matches',
    pattern: /error TS2769: No overload matches this call/,
    category: 'function_call',
    fix: 'Fix function arguments or types'
  }
};

class TscErrorAnalyzer {
  constructor() {
    this.errors = [];
    this.fileErrors = new Map();
    this.categoryStats = new Map();
    this.errorCodeStats = new Map();
  }

  /**
   * Parse tsc error output file
   */
  parseErrorFile(filePath) {
    console.log(`📖 Reading error file: ${filePath}`);

    if (!existsSync(filePath)) {
      console.error(`❌ Error file not found: ${filePath}`);
      return;
    }

    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let currentFile = null;
    let lineNumber = null;

    for (const line of lines) {
      if (!line.trim()) continue;

      // Match file path and line number: src/file.ts(123,45): error TS1234:
      const fileMatch = line.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+):/);

      if (fileMatch) {
        currentFile = fileMatch[1];
        lineNumber = parseInt(fileMatch[2]);
        const column = parseInt(fileMatch[3]);
        const errorCode = fileMatch[4];
        const message = line.substring(line.indexOf(': error ') + 8);

        const error = {
          file: currentFile,
          line: lineNumber,
          column,
          errorCode,
          message,
          rawLine: line
        };

        // Categorize error
        const pattern = ERROR_PATTERNS[errorCode];
        if (pattern) {
          error.category = pattern.category;
          error.fixSuggestion = pattern.fix;
          error.patternName = pattern.name;
        } else {
          error.category = 'unknown';
          error.fixSuggestion = 'Manual review required';
          error.patternName = 'uncategorized';
        }

        this.errors.push(error);

        // Track by file
        if (!this.fileErrors.has(currentFile)) {
          this.fileErrors.set(currentFile, []);
        }
        this.fileErrors.get(currentFile).push(error);

        // Track statistics
        const category = error.category;
        this.categoryStats.set(category, (this.categoryStats.get(category) || 0) + 1);
        this.errorCodeStats.set(errorCode, (this.errorCodeStats.get(errorCode) || 0) + 1);
      }
    }

    console.log(`✅ Parsed ${this.errors.length} errors from ${this.fileErrors.size} files`);
  }

  /**
   * Generate comprehensive AST report
   */
  generateReport(limit = 100) {
    const topFiles = Array.from(this.fileErrors.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, limit);

    let report = `# Phase 99: ACE Contextual Error Fixing - TSC Error Analysis
**Generated:** ${new Date().toISOString()}

## Executive Summary

- **Total TSC Errors:** ${this.errors.length}
- **Files with Errors:** ${this.fileErrors.size}
- **Error Categories:** ${this.categoryStats.size}
- **Unique Error Codes:** ${this.errorCodeStats.size}
- **Analysis Scope:** Top ${limit} files

---

## Error Category Distribution

| Category | Count | Percentage | Automated Fix Potential |
|----------|-------|------------|------------------------|
`;

    const totalErrors = this.errors.length;
    const sortedCategories = Array.from(this.categoryStats.entries())
      .sort((a, b) => b[1] - a[1]);

    for (const [category, count] of sortedCategories) {
      const percentage = ((count / totalErrors) * 100).toFixed(2);
      const automatable = ['type_annotation', 'import', 'null_check'].includes(category);
      const potential = automatable ? '⭐⭐⭐⭐⭐ High' : '⭐⭐⭐ Medium';
      report += `| ${category} | ${count} | ${percentage}% | ${potential} |\n`;
    }

    report += `\n---\n\n## Error Code Distribution\n\n| Error Code | Description | Count | Fix Strategy |\n|------------|-------------|-------|-------------|\n`;

    const sortedCodes = Array.from(this.errorCodeStats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    for (const [code, count] of sortedCodes) {
      const pattern = ERROR_PATTERNS[code];
      const description = pattern ? pattern.name : 'Unknown';
      const fix = pattern ? pattern.fix : 'Manual review';
      report += `| ${code} | ${description} | ${count} | ${fix} |\n`;
    }

    report += `\n---\n\n## Top ${Math.min(limit, topFiles.length)} Files by Error Count\n\n`;

    for (let i = 0; i < topFiles.length; i++) {
      const [file, errors] = topFiles[i];
      const relPath = relative(ROOT, file);

      report += `### ${i + 1}. \`${relPath}\` - **${errors.length} errors**\n\n`;

      // Group errors by category
      const categoryGroups = new Map();
      for (const error of errors) {
        const cat = error.category;
        if (!categoryGroups.has(cat)) {
          categoryGroups.set(cat, []);
        }
        categoryGroups.get(cat).push(error);
      }

      report += `**Error Breakdown:**\n`;
      for (const [category, catErrors] of categoryGroups) {
        report += `- ${category}: ${catErrors.length} errors\n`;
      }

      // Show top 5 errors
      report += `\n**Top Errors:**\n`;
      const topErrors = errors.slice(0, 5);
      for (const error of topErrors) {
        report += `- Line ${error.line}: [${error.errorCode}] ${error.category}\n`;
        report += `  - Fix: ${error.fixSuggestion}\n`;
      }

      report += `\n`;
    }

    report += `\n---\n\n## Automated Fix Patterns\n\n`;

    // Generate fixable patterns
    const fixableCategories = {
      'type_annotation': {
        pattern: 'implicit_any',
        examples: [],
        strategy: 'Add `: any` or infer from usage'
      },
      'import': {
        pattern: 'module_resolution',
        examples: [],
        strategy: 'Add .js extension or fix import path'
      },
      'null_check': {
        pattern: 'optional_chaining',
        examples: [],
        strategy: 'Add ?. operator or ?? null check'
      },
      'property_access': {
        pattern: 'type_assertion',
        examples: [],
        strategy: 'Add type assertion or extend type'
      }
    };

    // Collect examples
    for (const error of this.errors.slice(0, 100)) {
      const category = error.category;
      if (fixableCategories[category] && fixableCategories[category].examples.length < 3) {
        fixableCategories[category].examples.push({
          file: relative(ROOT, error.file),
          line: error.line,
          message: error.message
        });
      }
    }

    for (const [category, data] of Object.entries(fixableCategories)) {
      const count = this.categoryStats.get(category) || 0;
      report += `### ${category} (${count} errors)\n\n`;
      report += `**Strategy:** ${data.strategy}\n\n`;

      if (data.examples.length > 0) {
        report += `**Examples:**\n`;
        for (const ex of data.examples) {
          report += `- \`${ex.file}:${ex.line}\` - ${ex.message}\n`;
        }
      }
      report += `\n`;
    }

    report += `\n---\n\n## Manual Review Queue\n\n`;
    report += `Files with complex errors requiring manual review:\n\n`;

    const manualReviewFiles = topFiles
      .filter(([file, errors]) => {
        const hasComplexErrors = errors.some(e =>
          ['type_mismatch', 'function_call', 'unknown'].includes(e.category)
        );
        return hasComplexErrors;
      })
      .slice(0, 10);

    for (const [file, errors] of manualReviewFiles) {
      const relPath = relative(ROOT, file);
      const complexErrors = errors.filter(e =>
        ['type_mismatch', 'function_call', 'unknown'].includes(e.category)
      );
      report += `- \`${relPath}\` - ${complexErrors.length} complex errors\n`;
    }

    report += `\n---\n\n## Recommended Action Plan\n\n`;
    report += `### Phase 1: Automated Fixes (High Confidence)\n`;
    report += `1. **Type Annotations** (${this.categoryStats.get('type_annotation') || 0} errors)\n`;
    report += `   - Add explicit type annotations for implicit any\n`;
    report += `   - Pattern: \`parameter => parameter: any\`\n\n`;

    report += `2. **Import Resolution** (${this.categoryStats.get('import') || 0} errors)\n`;
    report += `   - Add .js extensions to relative imports\n`;
    report += `   - Fix named imports vs default imports\n\n`;

    report += `3. **Null Checks** (${this.categoryStats.get('null_check') || 0} errors)\n`;
    report += `   - Add optional chaining (?.)\n`;
    report += `   - Add nullish coalescing (??)\n\n`;

    report += `### Phase 2: Semi-Automated Fixes (Medium Confidence)\n`;
    report += `4. **Property Access** (${this.categoryStats.get('property_access') || 0} errors)\n`;
    report += `   - Add type assertions where safe\n`;
    report += `   - Extend interfaces with missing properties\n\n`;

    report += `### Phase 3: Manual Review (Low Confidence)\n`;
    report += `5. **Type Mismatches** (${this.categoryStats.get('type_mismatch') || 0} errors)\n`;
    report += `6. **Function Calls** (${this.categoryStats.get('function_call') || 0} errors)\n`;
    report += `7. **Unknown Patterns** (${this.categoryStats.get('unknown') || 0} errors)\n`;

    return report;
  }

  /**
   * Generate JSON report for automated processing
   */
  generateJsonReport(limit = 100) {
    const topFiles = Array.from(this.fileErrors.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, limit);

    return {
      generated: new Date().toISOString(),
      summary: {
        totalErrors: this.errors.length,
        filesWithErrors: this.fileErrors.size,
        errorCategories: this.categoryStats.size,
        uniqueErrorCodes: this.errorCodeStats.size
      },
      categoryStats: Object.fromEntries(this.categoryStats),
      errorCodeStats: Object.fromEntries(this.errorCodeStats),
      topFiles: topFiles.map(([file, errors]) => ({
        file: relative(ROOT, file),
        errorCount: errors.length,
        categories: Object.fromEntries(
          Array.from(
            errors.reduce((map, e) => {
              map.set(e.category, (map.get(e.category) || 0) + 1);
              return map;
            }, new Map())
          )
        ),
        errors: errors.map(e => ({
          line: e.line,
          column: e.column,
          errorCode: e.errorCode,
          category: e.category,
          message: e.message,
          fixSuggestion: e.fixSuggestion
        }))
      }))
    };
  }

  /**
   * Save reports
   */
  saveReports(limit = 100) {
    const reportsDir = join(ROOT, 'reports');

    // Markdown report
    const mdReport = this.generateReport(limit);
    const mdPath = join(reportsDir, 'phase99-ace-tsc-analysis.md');
    writeFileSync(mdPath, mdReport, 'utf-8');
    console.log(`📄 Saved markdown report: ${mdPath}`);

    // JSON report
    const jsonReport = this.generateJsonReport(limit);
    const jsonPath = join(reportsDir, 'phase99-ace-tsc-analysis.json');
    writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');
    console.log(`📄 Saved JSON report: ${jsonPath}`);

    return { mdPath, jsonPath };
  }
}

// Main execution
const analyzer = new TscErrorAnalyzer();
const errorFile = join(ROOT, 'reports', 'tsc-errors-top500.txt');

analyzer.parseErrorFile(errorFile);
const { mdPath, jsonPath } = analyzer.saveReports(100);

console.log('\n✅ Analysis complete!');
console.log(`\n📊 View reports:`);
console.log(`   - ${mdPath}`);
console.log(`   - ${jsonPath}`);
