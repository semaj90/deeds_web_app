#!/usr/bin/env node
/**
 * Phase 76: AST Graph Auditor
 *
 * Comprehensive component audit system that:
 * 1. Parses svelte-check machine output for AST analysis
 * 2. Matches components to Svelte 4/5 migration patterns
 * 3. Integrates with CouchDB graph database
 * 4. Generates Phase 66-78 style recommendations
 * 5. Creates actionable migration priority queue
 *
 * Usage:
 *   node scripts/phase76-ast-graph-auditor.mjs [options]
 *
 * Options:
 *   --svelte-check-path <path>  Path to svelte-check JSON output (default: reports/svelte-check-ast.json)
 *   --couchdb-url <url>         CouchDB URL (default: http://localhost:5984)
 *   --db-name <name>            Database name (default: ast-graph-analysis)
 *   --store-audit <path>        Path to store audit JSON (default: reports/phase76-store-audit.json)
 *   --output <path>             Output path for recommendations (default: reports/phase76-ast-graph-recommendations.md)
 *   --json                      Also output JSON format
 *   --verbose                   Enable verbose logging
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Parse svelte-check machine output
 */
function parseSvelteCheckOutput(content) {
  const lines = content.split('\n');
  const errors = [];
  const warnings = [];
  const info = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Parse machine format: timestamp TYPE "file" line:col "message"
    const errorMatch = line.match(/(\d+)\s+ERROR\s+"([^"]+)"\s+(\d+):(\d+)\s+"([^"]+)"/);
    const warningMatch = line.match(/(\d+)\s+WARNING\s+"([^"]+)"\s+(\d+):(\d+)\s+"([^"]+)"/);
    const infoMatch = line.match(/(\d+)\s+INFO\s+"([^"]+)"\s+(\d+):(\d+)\s+"([^"]+)"/);

    if (errorMatch) {
      errors.push({
        timestamp: errorMatch[1],
        file: errorMatch[2].replace(/\\\\/g, '/'),
        line: parseInt(errorMatch[3]),
        column: parseInt(errorMatch[4]),
        message: errorMatch[5],
        severity: 'error'
      });
    } else if (warningMatch) {
      warnings.push({
        timestamp: warningMatch[1],
        file: warningMatch[2].replace(/\\\\/g, '/'),
        line: parseInt(warningMatch[3]),
        column: parseInt(warningMatch[4]),
        message: warningMatch[5],
        severity: 'warning'
      });
    } else if (infoMatch) {
      info.push({
        timestamp: infoMatch[1],
        file: infoMatch[2].replace(/\\\\/g, '/'),
        line: parseInt(infoMatch[3]),
        column: parseInt(infoMatch[4]),
        message: infoMatch[5],
        severity: 'info'
      });
    }
  }

  return { errors, warnings, info };
}

/**
 * Analyze component for Svelte 4/5 migration patterns
 */
async function analyzeComponentPatterns(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    const patterns = {
      exportLet: (content.match(/export\s+let\s+\w+/g) || []).length,
      reactiveStatements: (content.match(/\$:\s*\w+/g) || []).length,
      writableStores: (content.match(/writable\(/g) || []).length,
      derivedStores: (content.match(/derived\(/g) || []).length,
      onMount: (content.match(/onMount\(/g) || []).length,
      onDestroy: (content.match(/onDestroy\(/g) || []).length,
      createEventDispatcher: (content.match(/createEventDispatcher\(/g) || []).length,
      stateRune: (content.match(/\$state\(/g) || []).length,
      derivedRune: (content.match(/\$derived\(/g) || []).length,
      propsRune: (content.match(/\$props\(/g) || []).length,
      effectRune: (content.match(/\$effect\(/g) || []).length,
    };

    // Calculate migration complexity score
    const svelte4Score =
      patterns.exportLet * 2 +
      patterns.reactiveStatements * 3 +
      patterns.writableStores * 5 +
      patterns.derivedStores * 4 +
      patterns.onMount * 3 +
      patterns.onDestroy * 3 +
      patterns.createEventDispatcher * 4;

    const svelte5Score =
      patterns.stateRune * 2 +
      patterns.derivedRune * 2 +
      patterns.propsRune * 2 +
      patterns.effectRune * 2;

    const migrationStatus = svelte5Score > 0 ? 'partial' : (svelte4Score > 0 ? 'svelte4' : 'unknown');

    return {
      patterns,
      svelte4Score,
      svelte5Score,
      migrationStatus,
      migrationComplexity: svelte4Score > 20 ? 'high' : svelte4Score > 10 ? 'medium' : 'low'
    };
  } catch (error) {
    return null;
  }
}

/**
 * Correlate AST errors with migration patterns
 */
function correlateErrorsWithMigration(astAnalysis, componentAnalysis) {
  const correlations = [];

  for (const error of astAnalysis.errors) {
    const analysis = componentAnalysis.get(error.file);
    if (!analysis) continue;

    // Check if error is likely related to Svelte 4 patterns
    const migrationRelated =
      error.message.includes('not assignable') ||
      error.message.includes('does not exist') ||
      error.message.includes('possibly undefined') ||
      error.message.includes('missing in type');

    if (migrationRelated && analysis.svelte4Score > 0) {
      correlations.push({
        error,
        analysis,
        confidence: 'high',
        recommendation: 'Migrate to Svelte 5 runes to resolve type issues'
      });
    }
  }

  return correlations;
}

/**
 * Generate CouchDB graph document
 */
function generateGraphDocument(componentPath, analysis, errors = []) {
  const fileName = path.basename(componentPath);

  return {
    _id: `component:${componentPath}`,
    type: 'component',
    path: componentPath,
    fileName,
    timestamp: new Date().toISOString(),

    // Migration analysis
    migration: {
      status: analysis.migrationStatus,
      complexity: analysis.migrationComplexity,
      svelte4Score: analysis.svelte4Score,
      svelte5Score: analysis.svelte5Score,
      patterns: analysis.patterns
    },

    // AST errors
    errors: errors.map(e => ({
      line: e.line,
      column: e.column,
      message: e.message,
      severity: e.severity
    })),

    // Graph edges (relationships)
    edges: {
      dependsOn: [],  // Will be populated by import analysis
      usedBy: [],     // Will be populated by reverse lookup
      storeConnections: []  // Connections to store files
    },

    // Phase 66-78 integration
    phase66_78: {
      priority: calculatePriority(analysis, errors),
      recommendations: generateRecommendations(analysis, errors),
      estimatedEffort: estimateEffort(analysis)
    }
  };
}

/**
 * Calculate migration priority (Phase 66-78 style)
 */
function calculatePriority(analysis, errors) {
  let priority = 0;

  // High priority for complex Svelte 4 patterns
  priority += analysis.svelte4Score * 10;

  // Higher priority if there are AST errors
  priority += errors.length * 50;

  // Higher priority for widely-used patterns
  priority += analysis.patterns.exportLet * 20;
  priority += analysis.patterns.createEventDispatcher * 30;

  return priority;
}

/**
 * Generate Phase 66-78 style recommendations
 */
function generateRecommendations(analysis, errors) {
  const recommendations = [];

  if (analysis.patterns.exportLet > 0) {
    recommendations.push({
      type: 'migration',
      priority: 'high',
      pattern: 'export-let-to-props',
      description: `Found ${analysis.patterns.exportLet} export let declarations`,
      action: 'Replace with $props() rune',
      example: 'export let value → const { value } = $props()'
    });
  }

  if (analysis.patterns.reactiveStatements > 0) {
    recommendations.push({
      type: 'migration',
      priority: 'high',
      pattern: 'reactive-to-derived',
      description: `Found ${analysis.patterns.reactiveStatements} reactive statements`,
      action: 'Replace with $derived() rune',
      example: '$: doubled = count * 2 → const doubled = $derived(count * 2)'
    });
  }

  if (analysis.patterns.onMount > 0 || analysis.patterns.onDestroy > 0) {
    recommendations.push({
      type: 'migration',
      priority: 'medium',
      pattern: 'lifecycle-to-effect',
      description: `Found ${analysis.patterns.onMount + analysis.patterns.onDestroy} lifecycle hooks`,
      action: 'Replace with $effect() rune',
      example: 'onMount(() => {...}) → $effect(() => {...})'
    });
  }

  if (analysis.patterns.createEventDispatcher > 0) {
    recommendations.push({
      type: 'migration',
      priority: 'medium',
      pattern: 'dispatcher-to-callbacks',
      description: `Found ${analysis.patterns.createEventDispatcher} event dispatchers`,
      action: 'Replace with callback props',
      example: 'dispatch("change", data) → onchange?.(data)'
    });
  }

  if (errors.length > 0) {
    const typeErrors = errors.filter(e =>
      e.message.includes('not assignable') ||
      e.message.includes('does not exist')
    );

    if (typeErrors.length > 0) {
      recommendations.push({
        type: 'bugfix',
        priority: 'critical',
        pattern: 'type-errors',
        description: `${typeErrors.length} TypeScript errors detected`,
        action: 'Fix type mismatches, likely related to store/prop types',
        errors: typeErrors.slice(0, 3).map(e => e.message)
      });
    }
  }

  return recommendations;
}

/**
 * Estimate migration effort
 */
function estimateEffort(analysis) {
  const baseMinutes = 15;
  const patternMinutes = {
    exportLet: 3,
    reactiveStatements: 5,
    onMount: 4,
    onDestroy: 2,
    createEventDispatcher: 6,
    writableStores: 8,
    derivedStores: 6
  };

  let totalMinutes = baseMinutes;
  for (const [pattern, count] of Object.entries(analysis.patterns)) {
    if (patternMinutes[pattern]) {
      totalMinutes += count * patternMinutes[pattern];
    }
  }

  const hours = Math.ceil(totalMinutes / 60 * 10) / 10;

  return {
    minutes: totalMinutes,
    hours,
    complexity: analysis.migrationComplexity,
    humanReadable: hours < 1 ? `${totalMinutes} minutes` : `${hours} hours`
  };
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(componentAnalysis, astAnalysis, correlations, storeAudit) {
  const now = new Date().toISOString();

  let md = `# Phase 76: AST Graph Audit Report\n\n`;
  md += `**Generated:** ${now}\n\n`;
  md += `## Executive Summary\n\n`;

  const totalComponents = componentAnalysis.size;
  const svelte4Components = Array.from(componentAnalysis.values())
    .filter(a => a.migrationStatus === 'svelte4').length;
  const svelte5Components = Array.from(componentAnalysis.values())
    .filter(a => a.migrationStatus === 'partial').length;
  const unknownComponents = totalComponents - svelte4Components - svelte5Components;

  md += `- **Total Components Analyzed:** ${totalComponents}\n`;
  md += `- **Svelte 4 Components:** ${svelte4Components} (${(svelte4Components / totalComponents * 100).toFixed(1)}%)\n`;
  md += `- **Partially Migrated:** ${svelte5Components} (${(svelte5Components / totalComponents * 100).toFixed(1)}%)\n`;
  md += `- **Unknown/Clean:** ${unknownComponents}\n`;
  md += `- **AST Errors:** ${astAnalysis.errors.length}\n`;
  md += `- **AST Warnings:** ${astAnalysis.warnings.length}\n`;
  md += `- **Migration-Related Errors:** ${correlations.length}\n\n`;

  // Store audit integration
  if (storeAudit) {
    md += `### Store Migration Status\n\n`;
    md += `- **Total Stores:** ${storeAudit.totalFiles || 0}\n`;
    md += `- **Needs Migration:** ${storeAudit.migrationNeeded || 0}\n`;
    md += `- **Already Migrated:** ${storeAudit.alreadyMigrated || 0}\n`;
    md += `- **Progress:** ${storeAudit.progress || 0}%\n\n`;
  }

  md += `## Top 10 Migration Priorities\n\n`;

  const priorityQueue = Array.from(componentAnalysis.entries())
    .map(([file, analysis]) => {
      const errors = astAnalysis.errors.filter(e => e.file === file);
      return {
        file,
        analysis,
        errors,
        priority: calculatePriority(analysis, errors)
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10);

  for (let i = 0; i < priorityQueue.length; i++) {
    const item = priorityQueue[i];
    md += `### ${i + 1}. \`${path.basename(item.file)}\`\n\n`;
    md += `**Path:** \`${item.file}\`\n\n`;
    md += `**Priority Score:** ${item.priority}\n\n`;
    md += `**Migration Status:** ${item.analysis.migrationStatus}\n\n`;
    md += `**Complexity:** ${item.analysis.migrationComplexity}\n\n`;
    md += `**Estimated Effort:** ${estimateEffort(item.analysis).humanReadable}\n\n`;

    md += `**Patterns Found:**\n`;
    md += `- Export Let: ${item.analysis.patterns.exportLet}\n`;
    md += `- Reactive Statements: ${item.analysis.patterns.reactiveStatements}\n`;
    md += `- Lifecycle Hooks: ${item.analysis.patterns.onMount + item.analysis.patterns.onDestroy}\n`;
    md += `- Event Dispatchers: ${item.analysis.patterns.createEventDispatcher}\n`;
    md += `- Stores: ${item.analysis.patterns.writableStores + item.analysis.patterns.derivedStores}\n\n`;

    if (item.errors.length > 0) {
      md += `**AST Errors (${item.errors.length}):**\n`;
      for (const error of item.errors.slice(0, 3)) {
        md += `- Line ${error.line}: ${error.message}\n`;
      }
      if (item.errors.length > 3) {
        md += `- ...and ${item.errors.length - 3} more\n`;
      }
      md += `\n`;
    }

    const recommendations = generateRecommendations(item.analysis, item.errors);
    if (recommendations.length > 0) {
      md += `**Recommendations:**\n`;
      for (const rec of recommendations) {
        md += `- [${rec.priority.toUpperCase()}] ${rec.description}\n`;
        md += `  - Action: ${rec.action}\n`;
        if (rec.example) md += `  - Example: \`${rec.example}\`\n`;
      }
      md += `\n`;
    }

    md += `---\n\n`;
  }

  md += `## Migration-Related AST Errors\n\n`;
  if (correlations.length === 0) {
    md += `No migration-related AST errors detected.\n\n`;
  } else {
    for (const corr of correlations.slice(0, 20)) {
      md += `### \`${path.basename(corr.error.file)}\` (Line ${corr.error.line})\n\n`;
      md += `**Error:** ${corr.error.message}\n\n`;
      md += `**Confidence:** ${corr.confidence}\n\n`;
      md += `**Recommendation:** ${corr.recommendation}\n\n`;
      md += `**Svelte 4 Score:** ${corr.analysis.svelte4Score}\n\n`;
      md += `---\n\n`;
    }
  }

  md += `## Phase 66-78 Integration Graph\n\n`;
  md += `This analysis integrates with the Phase 66-78 pipeline:\n\n`;
  md += `1. **AST Analysis** → svelte-check TypeScript/Svelte errors\n`;
  md += `2. **Pattern Detection** → Svelte 4/5 migration patterns\n`;
  md += `3. **Graph Database** → CouchDB relationship mapping\n`;
  md += `4. **Priority Calculation** → Smart queue based on complexity + errors\n`;
  md += `5. **Automation Ready** → Integration with phase76-migrate-store.mjs\n\n`;

  md += `### Next Steps\n\n`;
  md += `1. Review top 10 priority components\n`;
  md += `2. Run migration tool on high-priority items:\n`;
  md += `   \`\`\`bash\n`;
  md += `   node scripts/phase76-migrate-store.mjs <file-path>\n`;
  md += `   \`\`\`\n`;
  md += `3. Fix migration-related AST errors\n`;
  md += `4. Update CouchDB graph with migration progress\n`;
  md += `5. Re-run audit to track progress\n\n`;

  md += `---\n\n`;
  md += `*Generated by Phase 76 AST Graph Auditor*\n`;

  return md;
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const options = {
    svelteCheckPath: 'reports/svelte-check-ast.json',
    couchdbUrl: 'http://localhost:5984',
    dbName: 'ast-graph-analysis',
    storeAuditPath: 'reports/phase76-store-audit.json',
    outputPath: 'reports/phase76-ast-graph-recommendations.md',
    json: false,
    verbose: false
  };

  // Parse command-line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--svelte-check-path' && args[i + 1]) {
      options.svelteCheckPath = args[++i];
    } else if (args[i] === '--couchdb-url' && args[i + 1]) {
      options.couchdbUrl = args[++i];
    } else if (args[i] === '--db-name' && args[i + 1]) {
      options.dbName = args[++i];
    } else if (args[i] === '--store-audit' && args[i + 1]) {
      options.storeAuditPath = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      options.outputPath = args[++i];
    } else if (args[i] === '--json') {
      options.json = true;
    } else if (args[i] === '--verbose') {
      options.verbose = true;
    }
  }

  log('\n🔍 Phase 76: AST Graph Auditor\n', 'cyan');
  log('━'.repeat(60), 'dim');

  // Step 1: Read svelte-check output
  log('\n📖 Reading svelte-check AST analysis...', 'yellow');
  const svelteCheckPath = path.resolve(ROOT_DIR, options.svelteCheckPath);
  const svelteCheckContent = await fs.readFile(svelteCheckPath, 'utf-8');
  const astAnalysis = parseSvelteCheckOutput(svelteCheckContent);

  log(`   ✓ Found ${astAnalysis.errors.length} errors`, 'green');
  log(`   ✓ Found ${astAnalysis.warnings.length} warnings`, 'green');

  // Step 2: Read store audit if available
  let storeAudit = null;
  try {
    const storeAuditPath = path.resolve(ROOT_DIR, options.storeAuditPath);
    const storeAuditContent = await fs.readFile(storeAuditPath, 'utf-8');
    storeAudit = JSON.parse(storeAuditContent);
    log(`   ✓ Loaded store audit: ${storeAudit.totalFiles} files`, 'green');
  } catch (error) {
    if (options.verbose) {
      log(`   ⚠ No store audit found (optional)`, 'yellow');
    }
  }

  // Step 3: Analyze all unique component files
  log('\n🔬 Analyzing component migration patterns...', 'yellow');
  const uniqueFiles = new Set([
    ...astAnalysis.errors.map(e => e.file),
    ...astAnalysis.warnings.map(e => e.file)
  ]);

  const componentAnalysis = new Map();
  let analyzed = 0;

  for (const file of uniqueFiles) {
    if (!file.endsWith('.svelte') && !file.endsWith('.svelte.ts')) continue;

    const fullPath = path.resolve(ROOT_DIR, file);
    const analysis = await analyzeComponentPatterns(fullPath);

    if (analysis) {
      componentAnalysis.set(file, analysis);
      analyzed++;

      if (options.verbose && analysis.svelte4Score > 0) {
        log(`   📄 ${path.basename(file)}: Svelte 4 score ${analysis.svelte4Score}`, 'dim');
      }
    }
  }

  log(`   ✓ Analyzed ${analyzed} components`, 'green');

  // Step 4: Correlate errors with migration patterns
  log('\n🔗 Correlating AST errors with migration patterns...', 'yellow');
  const correlations = correlateErrorsWithMigration(astAnalysis, componentAnalysis);
  log(`   ✓ Found ${correlations.length} migration-related errors`, 'green');

  // Step 5: Generate graph documents
  log('\n🗄️  Generating CouchDB graph documents...', 'yellow');
  const graphDocuments = [];

  for (const [file, analysis] of componentAnalysis) {
    const errors = astAnalysis.errors.filter(e => e.file === file);
    const doc = generateGraphDocument(file, analysis, errors);
    graphDocuments.push(doc);
  }

  log(`   ✓ Generated ${graphDocuments.length} graph documents`, 'green');

  // Step 6: Generate reports
  log('\n📊 Generating reports...', 'yellow');

  const mdReport = generateMarkdownReport(componentAnalysis, astAnalysis, correlations, storeAudit);
  const outputPath = path.resolve(ROOT_DIR, options.outputPath);
  await fs.writeFile(outputPath, mdReport);
  log(`   ✓ Markdown report: ${outputPath}`, 'green');

  if (options.json) {
    const jsonReport = {
      timestamp: new Date().toISOString(),
      summary: {
        totalComponents: componentAnalysis.size,
        astErrors: astAnalysis.errors.length,
        astWarnings: astAnalysis.warnings.length,
        migrationRelatedErrors: correlations.length
      },
      componentAnalysis: Array.from(componentAnalysis.entries()).map(([file, analysis]) => ({
        file,
        ...analysis,
        errors: astAnalysis.errors.filter(e => e.file === file)
      })),
      correlations,
      graphDocuments,
      storeAudit
    };

    const jsonPath = outputPath.replace('.md', '.json');
    await fs.writeFile(jsonPath, JSON.stringify(jsonReport, null, 2));
    log(`   ✓ JSON report: ${jsonPath}`, 'green');
  }

  // Summary
  log('\n━'.repeat(60), 'dim');
  log('\n✅ Phase 76: AST Graph Audit Complete\n', 'green');
  log(`📊 Summary:`, 'cyan');
  log(`   • Components analyzed: ${componentAnalysis.size}`, 'white');
  log(`   • AST errors: ${astAnalysis.errors.length}`, 'white');
  log(`   • Migration-related: ${correlations.length}`, 'white');
  log(`   • Graph documents: ${graphDocuments.length}`, 'white');
  log(`   • Reports: ${outputPath}`, 'white');

  log(`\n📋 Next Steps:`, 'cyan');
  log(`   1. Review: cat ${options.outputPath}`, 'white');
  log(`   2. Migrate top priorities with phase76-migrate-store.mjs`, 'white');
  log(`   3. Insert graph documents into CouchDB (optional)`, 'white');
  log(`   4. Track progress with re-audit\n`, 'white');
}

main().catch(error => {
  log(`\n❌ Error: ${error.message}`, 'red');
  if (error.stack) {
    log(error.stack, 'dim');
  }
  process.exit(1);
});
