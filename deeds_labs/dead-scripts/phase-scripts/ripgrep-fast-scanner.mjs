#!/usr/bin/env node

/**
 * Ripgrep-Powered Fast Error Scanner
 * Uses ripgrep for ultra-fast pattern matching across the codebase
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

class RipgrepFastScanner {
  constructor() {
    this.results = new Map();
    this.patterns = {};
  }

  addPattern(id, pattern) {
    this.patterns[id] = {
      ...pattern,
      // Convert regex to ripgrep-compatible format
      rgPattern: this.convertRegexToRipgrep(pattern.regex)
    };
  }

  convertRegexToRipgrep(regexStr) {
    // Convert JavaScript regex to ripgrep format
    // Remove JS regex delimiters and flags
    let pattern = regexStr.replace(/^\/|\/[gimsuy]*$/g, '');

    // Escape ripgrep special characters that aren't escaped in JS regex
    // ripgrep uses PCRE2, so we need to handle some differences

    return pattern;
  }

  async scanWithRipgrep(patternId, pattern, fileTypes = []) {
    return new Promise((resolve, reject) => {
      const rgPattern = pattern.rgPattern;
      const args = [
        '--json',           // JSON output format
        '--line-number',    // Include line numbers
        '--no-heading',     // Don't show file headings
        '--no-filename',    // Don't show filenames (we get them from JSON)
        rgPattern
      ];

      // Add file type filters
      if (fileTypes.length > 0) {
        fileTypes.forEach(type => {
          args.push('--type', type.replace('.', ''));
        });
      } else {
        // Default to common web file types
        args.push('--type', 'js', '--type', 'ts', '--type', 'svelte', '--type', 'css', '--type', 'scss');
      }

      // Exclude common directories
      args.push('--glob', '!node_modules/**');
      args.push('--glob', '!.svelte-kit/**');
      args.push('--glob', '!build/**');
      args.push('--glob', '!dist/**');

      const rg = spawn('rg', args, { cwd: process.cwd() });

      let stdout = '';
      let stderr = '';

      rg.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      rg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      rg.on('close', (code) => {
        if (code !== 0 && code !== 1) { // 1 is normal for no matches
          reject(new Error(`ripgrep failed: ${stderr}`));
          return;
        }

        const matches = this.parseRipgrepOutput(stdout, patternId, pattern);
        resolve(matches);
      });

      rg.on('error', reject);
    });
  }

  parseRipgrepOutput(output, patternId, pattern) {
    const matches = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const data = JSON.parse(line);

        if (data.type === 'match') {
          const filePath = path.relative(process.cwd(), data.path.text);
          const lineNum = data.line_number;
          const matchText = data.lines.text.trim();
          const matchStart = data.submatches[0]?.start || 0;

          matches.push({
            file: filePath,
            line: lineNum,
            match: matchText,
            index: matchStart,
            pattern: patternId,
            severity: pattern.severity
          });
        }
      } catch (e) {
        // Skip invalid JSON lines
        continue;
      }
    }

    return matches;
  }

  async scanAllPatterns() {
    console.log('🔍 Ripgrep-Powered Fast Scanner');
    console.log('=' .repeat(40));

    const allMatches = [];

    for (const [patternId, pattern] of Object.entries(this.patterns)) {
      console.log(`🔎 Scanning pattern: ${patternId}`);

      try {
        const matches = await this.scanWithRipgrep(patternId, pattern, pattern.fileTypes);
        allMatches.push(...matches);

        console.log(`   ✅ Found ${matches.length} matches`);
      } catch (error) {
        console.log(`   ❌ Error scanning ${patternId}: ${error.message}`);
      }
    }

    // Group by file
    const fileResults = {};
    for (const match of allMatches) {
      if (!fileResults[match.file]) {
        fileResults[match.file] = {
          file: match.file,
          errors: []
        };
      }
      fileResults[match.file].errors.push(match);
    }

    // Convert to results format
    for (const [filePath, data] of Object.entries(fileResults)) {
      this.results.set(filePath, data);
    }

    console.log(`\n🎯 Scan Complete:`);
    console.log(`   📁 Files with matches: ${this.results.size}`);
    console.log(`   🔴 Total matches: ${allMatches.length}`);

    return this.generateReport();
  }

  generateReport() {
    // Pattern frequency analysis
    const patternStats = {};
    const severityStats = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const fileTypeStats = {};

    for (const [filePath, fileData] of this.results) {
      const fileExt = path.extname(filePath);

      if (!fileTypeStats[fileExt]) {
        fileTypeStats[fileExt] = { files: 0, errors: 0 };
      }
      fileTypeStats[fileExt].files++;
      fileTypeStats[fileExt].errors += fileData.errors.length;

      for (const error of fileData.errors) {
        if (!patternStats[error.pattern]) {
          patternStats[error.pattern] = { count: 0, files: new Set() };
        }
        patternStats[error.pattern].count++;
        patternStats[error.pattern].files.add(filePath);

        severityStats[error.severity]++;
      }
    }

    return {
      summary: {
        timestamp: new Date().toISOString(),
        totalFiles: this.results.size,
        totalErrors: Array.from(this.results.values()).reduce((sum, f) => sum + f.errors.length, 0),
        severityBreakdown: severityStats,
        fileTypeBreakdown: fileTypeStats
      },
      patternAnalysis: patternStats,
      rawResults: Object.fromEntries(this.results)
    };
  }
}

// Main execution
async function main() {
  const scanner = new RipgrepFastScanner();

  // Import patterns from existing analyzer
  const { ERROR_PATTERNS } = await import('./redis-error-analyzer-simple.mjs');

  // Add patterns
  Object.entries(ERROR_PATTERNS).forEach(([id, pattern]) => {
    scanner.addPattern(id, pattern);
  });

  console.log(`📊 Loaded ${Object.keys(ERROR_PATTERNS).length} patterns for ripgrep scanning`);

  const results = await scanner.scanAllPatterns();

  // Save results
  await fs.mkdir('analysis', { recursive: true });
  await fs.writeFile(
    'analysis/ripgrep-fast-scan.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n💾 Ripgrep scan results saved to: analysis/ripgrep-fast-scan.json');

  // Print key insights
  console.log('\n🎯 Key Insights:');
  console.log(`   📁 Files scanned: ${results.summary.totalFiles}`);
  console.log(`   🔴 Total errors: ${results.summary.totalErrors}`);
  console.log(`   🚀 Scan method: ripgrep (ultra-fast)`);

  if (results.summary.totalErrors > 0) {
    const topPatterns = Object.entries(results.patternAnalysis)
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 3);

    console.log('\n📈 Top Error Patterns:');
    topPatterns.forEach(([pattern, stats], i) => {
      console.log(`   ${i + 1}. ${pattern}: ${stats.count} occurrences`);
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { RipgrepFastScanner };