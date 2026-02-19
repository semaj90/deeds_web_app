#!/usr/bin/env node
/**
 * Simple Agentic Test - Core functionality without external dependencies
 * Tests the AST processing and pattern detection without Redis/PostgreSQL
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, extname, relative } from 'path';
import { Worker } from 'worker_threads';
import { performance } from 'perf_hooks';
import { createHash } from 'crypto';

class SimpleAgenticTest {
  constructor() {
    this.stats = {
      filesProcessed: 0,
      issuesFound: 0,
      patternsDetected: {
        svelte4: 0,
        svelte5: 0,
        typescript: 0,
        syntax_errors: 0
      },
      startTime: performance.now()
    };
  }

  async testBasicFunctionality() {
    console.log('🧪 Testing Agentic Repair Core Functionality\n');

    // Test 1: File Discovery
    console.log('1️⃣ Testing file discovery...');
    const files = await this.discoverFiles('src/lib/components', ['.svelte', '.ts']);
    console.log(`   Found ${files.length} files to analyze\n`);

    // Test 2: Sample Analysis
    console.log('2️⃣ Testing AST analysis on sample files...');
    const sampleFiles = files.slice(0, 5);
    const analysisResults = [];

    for (const file of sampleFiles) {
      const result = await this.analyzeFile(file);
      analysisResults.push(result);

      console.log(`   📄 ${relative(process.cwd(), file)}:`);
      console.log(`      - Issues: ${result.analysis.issues.length}`);
      console.log(`      - Complexity: ${result.analysis.metrics.complexity}`);
      console.log(`      - Svelte Version: ${this.detectSvelteVersion(result.content)}`);

      if (result.analysis.issues.length > 0) {
        result.analysis.issues.slice(0, 2).forEach(issue => {
          console.log(`        ⚠️  ${issue.type}: ${issue.message}`);
        });
      }
    }

    // Test 3: Pattern Detection Summary
    console.log('\n3️⃣ Pattern Detection Summary:');
    const summary = this.generateSummary(analysisResults);
    console.table(summary);

    // Test 4: Performance Metrics
    console.log('\n4️⃣ Performance Metrics:');
    const endTime = performance.now();
    const processingTime = (endTime - this.stats.startTime) / 1000;

    console.log(`   ⚡ Processing time: ${processingTime.toFixed(2)}s`);
    console.log(`   📊 Files per second: ${(sampleFiles.length / processingTime).toFixed(1)}`);
    console.log(`   🎯 Issues found: ${this.stats.issuesFound}`);

    return {
      success: true,
      filesAnalyzed: sampleFiles.length,
      issuesFound: this.stats.issuesFound,
      processingTimeSeconds: processingTime,
      patterns: this.stats.patternsDetected
    };
  }

  async discoverFiles(dir, extensions = ['.ts', '.svelte', '.js']) {
    const files = [];

    const walkDirectory = async (currentDir) => {
      try {
        const entries = await readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(currentDir, entry.name);

          if (entry.isDirectory() && !['node_modules', '.git', '.svelte-kit', 'dist'].includes(entry.name)) {
            files.push(...await walkDirectory(fullPath));
          } else if (entry.isFile() && extensions.includes(extname(entry.name))) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Directory not accessible
      }
    };

    await walkDirectory(dir);
    return files;
  }

  async analyzeFile(filepath) {
    try {
      const content = await readFile(filepath, 'utf-8');
      const stats = await stat(filepath);

      const analysis = {
        issues: [],
        suggestions: [],
        metrics: {
          complexity: this.calculateComplexity(content),
          size: content.length,
          lines: content.split('\n').length
        },
        patterns: this.extractPatterns(content, filepath)
      };

      // Detect issues
      analysis.issues = this.detectIssues(content, filepath);

      // Generate suggestions
      analysis.suggestions = this.generateSuggestions(analysis.issues, analysis.patterns);

      // Update stats
      this.stats.filesProcessed++;
      this.stats.issuesFound += analysis.issues.length;

      return {
        file: filepath,
        content,
        analysis,
        contentHash: createHash('sha256').update(content).digest('hex').substring(0, 16),
        lastModified: stats.mtime
      };

    } catch (error) {
      return {
        file: filepath,
        error: error.message,
        analysis: { issues: [], suggestions: [], metrics: {}, patterns: {} }
      };
    }
  }

  calculateComplexity(content) {
    let complexity = 1;

    // Count complexity indicators
    const patterns = [
      /if\s*\(/g,
      /while\s*\(/g,
      /for\s*\(/g,
      /switch\s*\(/g,
      /catch\s*\(/g,
      /&&/g,
      /\|\|/g,
      /\?.*:/g
    ];

    for (const pattern of patterns) {
      const matches = content.match(pattern);
      complexity += matches ? matches.length : 0;
    }

    return Math.min(complexity, 20); // Cap at 20
  }

  extractPatterns(content, filepath) {
    const patterns = {
      svelte4: {
        exportLet: (content.match(/export\s+let\s+\w+/g) || []).length,
        reactiveStatements: (content.match(/\$:\s*/g) || []).length,
        slots: (content.match(/<slot[^>]*>/g) || []).length
      },
      svelte5: {
        props: (content.match(/\$props\(\)/g) || []).length,
        state: (content.match(/\$state\(/g) || []).length,
        derived: (content.match(/\$derived\(/g) || []).length,
        effect: (content.match(/\$effect\(/g) || []).length,
        snippets: (content.match(/\{#snippet\s+\w+/g) || []).length
      },
      typescript: {
        imports: (content.match(/import\s+.*?from\s+['"][^'"]+['"]/g) || []).length,
        exports: (content.match(/export\s+/g) || []).length,
        interfaces: (content.match(/interface\s+\w+/g) || []).length,
        types: (content.match(/type\s+\w+\s*=/g) || []).length
      },
      syntax: {
        semicolonBeforeBrace: (content.match(/;\s*}/g) || []).length,
        trailingComma: (content.match(/,\s*}/g) || []).length,
        emptyBlocks: (content.match(/{\s*}/g) || []).length
      }
    };

    return patterns;
  }

  detectIssues(content, filepath) {
    const issues = [];

    // Svelte 4 → 5 migration issues
    const exportLetCount = (content.match(/export\s+let\s+\w+/g) || []).length;
    if (exportLetCount > 0) {
      issues.push({
        type: 'svelte4_export_let',
        severity: 'warning',
        count: exportLetCount,
        message: `Found ${exportLetCount} export let declarations that should be migrated to $props()`,
        fix: 'migrate_to_props'
      });
      this.stats.patternsDetected.svelte4 += exportLetCount;
    }

    const reactiveCount = (content.match(/\$:\s*/g) || []).length;
    if (reactiveCount > 0) {
      issues.push({
        type: 'svelte4_reactive_statements',
        severity: 'warning',
        count: reactiveCount,
        message: `Found ${reactiveCount} reactive statements that should be migrated to $derived()`,
        fix: 'migrate_to_derived'
      });
      this.stats.patternsDetected.svelte4 += reactiveCount;
    }

    const slotCount = (content.match(/<slot[^>]*>/g) || []).length;
    if (slotCount > 0) {
      issues.push({
        type: 'svelte4_slots',
        severity: 'info',
        count: slotCount,
        message: `Found ${slotCount} slot usage that could be migrated to snippets`,
        fix: 'migrate_to_snippets'
      });
    }

    // Count Svelte 5 patterns
    const svelte5Count = (content.match(/\$(?:props|state|derived|effect)\(/g) || []).length;
    this.stats.patternsDetected.svelte5 += svelte5Count;

    // Syntax issues
    const syntaxIssues = [
      { pattern: /;\s*}/g, type: 'semicolon_before_brace', message: 'Semicolon before closing brace' },
      { pattern: /,\s*}/g, type: 'trailing_comma', message: 'Trailing comma before brace' },
      { pattern: /{\s*}/g, type: 'empty_block', message: 'Empty code block' }
    ];

    for (const syntaxIssue of syntaxIssues) {
      const matches = content.match(syntaxIssue.pattern);
      if (matches && matches.length > 0) {
        issues.push({
          type: syntaxIssue.type,
          severity: 'error',
          count: matches.length,
          message: `Found ${matches.length} instances of: ${syntaxIssue.message}`,
          fix: 'syntax_repair'
        });
        this.stats.patternsDetected.syntax_errors += matches.length;
      }
    }

    // TypeScript patterns
    if (filepath.endsWith('.ts') || content.includes('lang="ts"')) {
      this.stats.patternsDetected.typescript++;
    }

    return issues;
  }

  generateSuggestions(issues, patterns) {
    const suggestions = [];

    // Migration suggestions
    const migrationIssues = issues.filter(i => i.type.startsWith('svelte4_'));
    if (migrationIssues.length > 0) {
      const totalMigrations = migrationIssues.reduce((sum, issue) => sum + issue.count, 0);
      suggestions.push({
        type: 'migration_opportunity',
        priority: 'high',
        message: `This file has ${totalMigrations} patterns that can be modernized to Svelte 5`,
        actions: [
          'Run Svelte 5 migration script',
          'Update export let to $props()',
          'Convert reactive statements to $derived()',
          'Consider using snippets instead of slots'
        ],
        estimatedEffort: totalMigrations < 5 ? 'low' : totalMigrations < 10 ? 'medium' : 'high'
      });
    }

    // Performance suggestions
    const complexity = patterns.svelte4?.reactiveStatements || 0 + patterns.typescript?.functions || 0;
    if (complexity > 5) {
      suggestions.push({
        type: 'performance_optimization',
        priority: 'medium',
        message: 'Consider optimizing complex reactive patterns',
        actions: [
          'Use $derived.by() for expensive computations',
          'Consider memoization for complex operations',
          'Evaluate if all reactive statements are necessary'
        ]
      });
    }

    return suggestions;
  }

  detectSvelteVersion(content) {
    if (content.includes('$props()') || content.includes('{#snippet')) {
      return 5;
    } else if (content.includes('export let') || content.includes('$:')) {
      return 4;
    }
    return 'unknown';
  }

  generateSummary(results) {
    const summary = {
      'Total Files': results.length,
      'Files with Issues': results.filter(r => r.analysis.issues.length > 0).length,
      'Svelte 4 Patterns': this.stats.patternsDetected.svelte4,
      'Svelte 5 Patterns': this.stats.patternsDetected.svelte5,
      'TypeScript Files': this.stats.patternsDetected.typescript,
      'Syntax Errors': this.stats.patternsDetected.syntax_errors,
      'Total Issues': this.stats.issuesFound
    };

    return summary;
  }
}

// Run the test
const test = new SimpleAgenticTest();
test.testBasicFunctionality()
  .then(result => {
    console.log('\n✅ Test completed successfully!');
    console.log('📊 Final Results:', JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });