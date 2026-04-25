#!/usr/bin/env node
/**
 * Error Graph Analyzer
 * Parses svelte-check output, categorizes errors, builds a dependency graph,
 * and identifies priority files for fixing.
 *
 * Usage: node scripts/error-graph-analyzer.mjs
 */

import fs from 'fs/promises';
import path from 'path';

// Error category patterns (HMM observable states)
const ERROR_PATTERNS = {
  import_type: /cannot be used as a value because it was imported using 'import type'/i,
  missing_comma: /','\s*expected/,
  missing_semicolon: /';'\s*expected/,
  missing_colon: /':'\s*expected/,
  missing_brace: /'\}'\s*expected/,
  cannot_find_name: /Cannot find name/,
  property_not_exist: /Property .* does not exist on type/,
  type_mismatch: /Type .* is not assignable to type/,
  module_no_export: /Module .* has no exported member/,
  svelte_event: /on:\w+/,
  object_literal: /Object literal may only specify known properties/,
  schema_redeclare: /Cannot redeclare block-scoped variable/,
  file_not_module: /is not a module/,
  argument_count: /Expected \d+ arguments/,
  missing_property: /Property .* is missing/,
};

// HMM Hidden states (inferred root causes)
const HIDDEN_STATES = {
  CORRUPTION: 'Object literal/function signature corruption',
  IMPORT_ISSUE: 'Incorrect import statement',
  TYPE_ERROR: 'TypeScript type mismatch',
  MISSING_DEP: 'Missing dependency or export',
  SVELTE5_MIGRATION: 'Svelte 5 syntax migration needed',
};

class ErrorGraphAnalyzer {
  constructor() {
    this.errors = [];
    this.fileErrors = new Map();
    this.categoryStats = {};
    this.graph = {
      nodes: [],
      edges: []
    };
  }

  async parseErrorLog(logPath) {
    const content = await fs.readFile(logPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      // Parse machine format: TIMESTAMP ERROR "file" line:col "message"
      const match = line.match(/(\d+)\s+ERROR\s+"([^"]+)"\s+(\d+):(\d+)\s+"([^"]+)"/);
      if (match) {
        const [, timestamp, file, lineNo, col, message] = match;

        // Categorize error
        let category = 'other';
        for (const [cat, pattern] of Object.entries(ERROR_PATTERNS)) {
          if (pattern.test(message)) {
            category = cat;
            break;
          }
        }

        // Infer hidden state (root cause)
        let hiddenState = 'unknown';
        if (['missing_comma', 'missing_semicolon', 'missing_colon', 'missing_brace'].includes(category)) {
          hiddenState = 'CORRUPTION';
        } else if (['import_type', 'module_no_export', 'file_not_module'].includes(category)) {
          hiddenState = 'IMPORT_ISSUE';
        } else if (['type_mismatch', 'property_not_exist', 'argument_count', 'missing_property'].includes(category)) {
          hiddenState = 'TYPE_ERROR';
        } else if (['cannot_find_name', 'schema_redeclare'].includes(category)) {
          hiddenState = 'MISSING_DEP';
        } else if (category === 'svelte_event') {
          hiddenState = 'SVELTE5_MIGRATION';
        }

        const error = {
          file,
          line: parseInt(lineNo),
          col: parseInt(col),
          message: message.substring(0, 200),
          category,
          hiddenState
        };

        this.errors.push(error);

        if (!this.fileErrors.has(file)) {
          this.fileErrors.set(file, []);
        }
        this.fileErrors.get(file).push(error);

        // Update category stats
        this.categoryStats[category] = (this.categoryStats[category] || 0) + 1;
      }
    }

    console.log(`📊 Parsed ${this.errors.length} errors from ${this.fileErrors.size} files`);
    return this;
  }

  buildGraph() {
    // Create nodes for each category
    for (const [category, count] of Object.entries(this.categoryStats)) {
      this.graph.nodes.push({
        id: category,
        type: 'category',
        count,
        percentage: (count / this.errors.length * 100).toFixed(1)
      });
    }

    // Create nodes for hidden states
    const hiddenStateCounts = {};
    for (const error of this.errors) {
      hiddenStateCounts[error.hiddenState] = (hiddenStateCounts[error.hiddenState] || 0) + 1;
    }

    for (const [state, count] of Object.entries(hiddenStateCounts)) {
      this.graph.nodes.push({
        id: `hidden_${state}`,
        type: 'hidden_state',
        label: HIDDEN_STATES[state] || state,
        count,
        percentage: (count / this.errors.length * 100).toFixed(1)
      });
    }

    // Create edges between categories that co-occur in files
    const categoryPairs = new Map();

    for (const [file, errors] of this.fileErrors) {
      const categories = [...new Set(errors.map(e => e.category))];

      for (let i = 0; i < categories.length; i++) {
        for (let j = i + 1; j < categories.length; j++) {
          const key = [categories[i], categories[j]].sort().join('->');
          categoryPairs.set(key, (categoryPairs.get(key) || 0) + 1);
        }
      }
    }

    for (const [pair, weight] of categoryPairs) {
      const [source, target] = pair.split('->');
      if (weight >= 5) { // Only significant connections
        this.graph.edges.push({ source, target, weight });
      }
    }

    // Create edges from categories to hidden states
    for (const [category, pattern] of Object.entries(ERROR_PATTERNS)) {
      let hiddenState;
      if (['missing_comma', 'missing_semicolon', 'missing_colon', 'missing_brace'].includes(category)) {
        hiddenState = 'CORRUPTION';
      } else if (['import_type', 'module_no_export', 'file_not_module'].includes(category)) {
        hiddenState = 'IMPORT_ISSUE';
      } else if (['type_mismatch', 'property_not_exist', 'argument_count', 'missing_property'].includes(category)) {
        hiddenState = 'TYPE_ERROR';
      } else if (['cannot_find_name', 'schema_redeclare'].includes(category)) {
        hiddenState = 'MISSING_DEP';
      } else if (category === 'svelte_event') {
        hiddenState = 'SVELTE5_MIGRATION';
      }

      if (hiddenState && this.categoryStats[category]) {
        this.graph.edges.push({
          source: category,
          target: `hidden_${hiddenState}`,
          weight: this.categoryStats[category],
          type: 'emission'
        });
      }
    }

    return this;
  }

  getPriorityFiles(topN = 30) {
    const fileCounts = [...this.fileErrors.entries()]
      .map(([file, errors]) => ({
        file,
        count: errors.length,
        categories: [...new Set(errors.map(e => e.category))],
        hiddenStates: [...new Set(errors.map(e => e.hiddenState))],
        sample: errors[0]?.message || ''
      }))
      .sort((a, b) => b.count - a.count);

    return fileCounts.slice(0, topN);
  }

  getFixStrategies() {
    const strategies = [];

    // Strategy 1: Import type fixes (automated)
    if (this.categoryStats.import_type > 0) {
      strategies.push({
        priority: 1,
        category: 'import_type',
        count: this.categoryStats.import_type,
        strategy: 'Run: node scripts/fix-import-type.mjs src --apply',
        automated: true
      });
    }

    // Strategy 2: Object corruption (manual + AST)
    const corruptionCount = ['missing_comma', 'missing_semicolon', 'missing_colon', 'missing_brace']
      .reduce((sum, cat) => sum + (this.categoryStats[cat] || 0), 0);

    if (corruptionCount > 0) {
      strategies.push({
        priority: 2,
        category: 'CORRUPTION',
        count: corruptionCount,
        strategy: 'Check .bak files for clean versions, or use AST repair',
        automated: false
      });
    }

    // Strategy 3: Svelte 5 event migration
    if (this.categoryStats.svelte_event > 0) {
      strategies.push({
        priority: 3,
        category: 'svelte_event',
        count: this.categoryStats.svelte_event,
        strategy: 'Run: node scripts/fix-svelte5-events.mjs src --apply',
        automated: true
      });
    }

    // Strategy 4: Module exports
    if (this.categoryStats.module_no_export > 0) {
      strategies.push({
        priority: 4,
        category: 'module_no_export',
        count: this.categoryStats.module_no_export,
        strategy: 'Fix barrel file exports in index.ts files',
        automated: false
      });
    }

    return strategies.sort((a, b) => a.priority - b.priority);
  }

  async generateReport(outputDir = 'logs') {
    // Ensure output dir exists
    await fs.mkdir(outputDir, { recursive: true });

    // 1. Save error graph
    const graphPath = path.join(outputDir, 'error-graph.json');
    await fs.writeFile(graphPath, JSON.stringify(this.graph, null, 2));
    console.log(`📊 Graph saved to ${graphPath}`);

    // 2. Save priority files
    const priorityFiles = this.getPriorityFiles(50);
    const priorityPath = path.join(outputDir, 'priority-files.json');
    await fs.writeFile(priorityPath, JSON.stringify(priorityFiles, null, 2));
    console.log(`📁 Priority files saved to ${priorityPath}`);

    // 3. Save fix strategies
    const strategies = this.getFixStrategies();
    const strategiesPath = path.join(outputDir, 'fix-strategies.json');
    await fs.writeFile(strategiesPath, JSON.stringify(strategies, null, 2));
    console.log(`🔧 Fix strategies saved to ${strategiesPath}`);

    // 4. Generate summary report
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalErrors: this.errors.length,
        totalFiles: this.fileErrors.size,
        categories: this.categoryStats,
      },
      hiddenStates: {},
      graph: {
        nodes: this.graph.nodes.length,
        edges: this.graph.edges.length,
      },
      topFiles: priorityFiles.slice(0, 10),
      strategies,
    };

    // Calculate hidden state distribution
    for (const error of this.errors) {
      report.hiddenStates[error.hiddenState] = (report.hiddenStates[error.hiddenState] || 0) + 1;
    }

    const reportPath = path.join(outputDir, 'error-analysis-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`📋 Full report saved to ${reportPath}`);

    // 5. Print summary
    console.log('\n' + '='.repeat(70));
    console.log('📈 ERROR ANALYSIS SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Errors:  ${this.errors.length}`);
    console.log(`Total Files:   ${this.fileErrors.size}`);
    console.log('\n🏷️ Categories:');
    Object.entries(this.categoryStats)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, count]) => {
        const pct = (count / this.errors.length * 100).toFixed(1);
        console.log(`  ${count.toString().padStart(6)} (${pct.padStart(5)}%) - ${cat}`);
      });

    console.log('\n🧠 Hidden States (Root Causes):');
    Object.entries(report.hiddenStates)
      .sort((a, b) => b[1] - a[1])
      .forEach(([state, count]) => {
        const pct = (count / this.errors.length * 100).toFixed(1);
        const desc = HIDDEN_STATES[state] || state;
        console.log(`  ${count.toString().padStart(6)} (${pct.padStart(5)}%) - ${desc}`);
      });

    console.log('\n📁 Top 10 Files with Most Errors:');
    priorityFiles.slice(0, 10).forEach((f, i) => {
      console.log(`  ${(i+1).toString().padStart(2)}. ${f.count.toString().padStart(4)} errors: ${f.file}`);
    });

    console.log('\n🔧 Recommended Fix Strategies:');
    strategies.forEach((s, i) => {
      const auto = s.automated ? '⚡ AUTO' : '✋ MANUAL';
      console.log(`  ${(i+1)}. [${auto}] ${s.category}: ${s.count} errors`);
      console.log(`     → ${s.strategy}`);
    });

    console.log('\n' + '='.repeat(70));

    return report;
  }
}

// Main execution
async function main() {
  const logPath = 'logs/svelte-check-full.txt';

  try {
    await fs.access(logPath);
  } catch {
    console.error(`❌ Error log not found: ${logPath}`);
    console.log('   Run: npx svelte-check --output machine > logs/svelte-check-full.txt');
    process.exit(1);
  }

  console.log('🔬 HMM-Style Error Graph Analyzer');
  console.log('='.repeat(70));

  const analyzer = new ErrorGraphAnalyzer();
  await analyzer.parseErrorLog(logPath);
  analyzer.buildGraph();
  await analyzer.generateReport('logs');
}

main().catch(console.error);
