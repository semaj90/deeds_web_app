#!/usr/bin/env node
/**
 * Phase 78: Comprehensive Error Analysis & Knowledge Graph Integration
 *
 * Pipeline:
 * 1. Run svelte-check + tsc
 * 2. Parse and categorize errors
 * 3. Store in PostgreSQL (error_events table)
 * 4. Update knowledge graph for LLM retrieval
 * 5. Generate AI-powered fix suggestions
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.blue}▶${colors.reset} ${msg}`),
};

/**
 * Run svelte-check and capture errors
 */
function runSvelteCheck() {
  log.step('Running svelte-check...');
  try {
    const output = execSync('npx svelte-check --threshold error --output human', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return { success: true, output, errors: [] };
  } catch (error) {
    // svelte-check exits with non-zero when errors found
    const output = error.stdout || error.stderr || '';
    const errors = parseSvelteCheckOutput(output);
    return { success: false, output, errors };
  }
}

/**
 * Run TypeScript compiler check
 */
function runTypeScriptCheck() {
  log.step('Running TypeScript check...');
  try {
    const output = execSync('npx tsc --noEmit', {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
    return { success: true, output, errors: [] };
  } catch (error) {
    const output = error.stdout || error.stderr || '';
    const errors = parseTypeScriptOutput(output);
    return { success: false, output, errors };
  }
}

/**
 * Parse svelte-check output
 */
function parseSvelteCheckOutput(output) {
  const errors = [];
  const lines = output.split('\n');

  let currentFile = null;
  let currentError = null;

  for (const line of lines) {
    // Match file path: src/routes/... (line:col)
    const fileMatch = line.match(/^(.+\.svelte)\s+\((\d+):(\d+)\)$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      if (currentError) {
        errors.push(currentError);
      }
      currentError = {
        file: currentFile,
        line: parseInt(fileMatch[2]),
        column: parseInt(fileMatch[3]),
        message: '',
        code: null,
        severity: 'error',
        source: 'svelte-check',
      };
      continue;
    }

    // Match error message
    if (currentError && line.trim()) {
      const codeMatch = line.match(/\(ts\((\d+)\)\)/);
      if (codeMatch) {
        currentError.code = `TS${codeMatch[1]}`;
      }
      currentError.message += line.trim() + ' ';
    }
  }

  if (currentError) {
    errors.push(currentError);
  }

  return errors.filter(e => e.message.trim());
}

/**
 * Parse TypeScript compiler output
 */
function parseTypeScriptOutput(output) {
  const errors = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Match: src/lib/file.ts(123,45): error TS1234: Message
    const match = line.match(/^(.+\.(?:ts|svelte))\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
    if (match) {
      errors.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
        code: match[4],
        message: match[5].trim(),
        severity: 'error',
        source: 'typescript',
      });
    }
  }

  return errors;
}

/**
 * Categorize errors for knowledge graph
 */
function categorizeErrors(errors) {
  const categories = {
    'svelte-5-migration': [],
    'type-errors': [],
    'import-errors': [],
    'syntax-errors': [],
    'other': [],
  };

  for (const error of errors) {
    const msg = error.message.toLowerCase();
    const code = error.code || '';

    if (msg.includes('$state') || msg.includes('$props') || msg.includes('$derived') || msg.includes('$effect')) {
      categories['svelte-5-migration'].push(error);
    } else if (code.startsWith('TS2') || msg.includes('type')) {
      categories['type-errors'].push(error);
    } else if (code === 'TS2307' || msg.includes('cannot find module')) {
      categories['import-errors'].push(error);
    } else if (code === 'TS1005' || code === 'TS1109') {
      categories['syntax-errors'].push(error);
    } else {
      categories['other'].push(error);
    }
  }

  return categories;
}

/**
 * Generate knowledge graph entries for errors
 */
function generateKnowledgeGraph(categorizedErrors) {
  const knowledgeEntries = [];

  for (const [category, errors] of Object.entries(categorizedErrors)) {
    if (errors.length === 0) continue;

    const entry = {
      category,
      errorCount: errors.length,
      files: [...new Set(errors.map(e => e.file))],
      errorCodes: [...new Set(errors.map(e => e.code).filter(Boolean))],
      commonPatterns: extractCommonPatterns(errors),
      suggestedFixes: generateFixSuggestions(category, errors),
      timestamp: new Date().toISOString(),
    };

    knowledgeEntries.push(entry);
  }

  return knowledgeEntries;
}

/**
 * Extract common error patterns
 */
function extractCommonPatterns(errors) {
  const patterns = {};

  for (const error of errors) {
    const key = `${error.code}: ${error.message.substring(0, 50)}`;
    patterns[key] = (patterns[key] || 0) + 1;
  }

  return Object.entries(patterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pattern, count]) => ({ pattern, count }));
}

/**
 * Generate fix suggestions based on error category
 */
function generateFixSuggestions(category, errors) {
  const suggestions = [];

  switch (category) {
    case 'svelte-5-migration':
      suggestions.push({
        title: 'Migrate to Svelte 5 Runes',
        description: 'Convert let statements to $state(), export let to $props()',
        command: 'npx sv migrate svelte-5',
        confidence: 0.9,
      });
      break;

    case 'type-errors':
      suggestions.push({
        title: 'Add TypeScript type annotations',
        description: 'Explicitly type variables and function parameters',
        command: null,
        confidence: 0.7,
      });
      break;

    case 'import-errors':
      suggestions.push({
        title: 'Fix import paths',
        description: 'Check for case-sensitivity and correct module paths',
        command: null,
        confidence: 0.8,
      });
      break;

    case 'syntax-errors':
      suggestions.push({
        title: 'Fix syntax issues',
        description: 'Check for missing semicolons, brackets, or trailing commas',
        command: null,
        confidence: 0.85,
      });
      break;
  }

  return suggestions;
}

/**
 * Save results
 */
function saveResults(allErrors, categorized, knowledge) {
  const reportsDir = join(projectRoot, 'reports', 'phase78');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Create reports directory if it doesn't exist
  execSync(`New-Item -ItemType Directory -Force -Path "${reportsDir}"`, { shell: 'powershell.exe' });

  // Save raw errors
  const errorsFile = join(reportsDir, `errors-${timestamp}.json`);
  writeFileSync(errorsFile, JSON.stringify(allErrors, null, 2));
  log.success(`Saved ${allErrors.length} errors to ${errorsFile}`);

  // Save categorized errors
  const categorizedFile = join(reportsDir, `categorized-${timestamp}.json`);
  writeFileSync(categorizedFile, JSON.stringify(categorized, null, 2));
  log.success(`Saved categorized errors to ${categorizedFile}`);

  // Save knowledge graph
  const knowledgeFile = join(reportsDir, `knowledge-graph-${timestamp}.json`);
  writeFileSync(knowledgeFile, JSON.stringify(knowledge, null, 2));
  log.success(`Saved knowledge graph to ${knowledgeFile}`);

  // Save summary
  const summary = {
    timestamp,
    totalErrors: allErrors.length,
    categories: Object.entries(categorized).map(([name, errors]) => ({
      name,
      count: errors.length,
      files: [...new Set(errors.map(e => e.file))].length,
    })),
    topErrors: allErrors.slice(0, 10),
  };

  const summaryFile = join(reportsDir, `summary-${timestamp}.md`);
  const summaryMd = generateSummaryMarkdown(summary);
  writeFileSync(summaryFile, summaryMd);
  log.success(`Saved summary to ${summaryFile}`);

  return { errorsFile, categorizedFile, knowledgeFile, summaryFile };
}

/**
 * Generate markdown summary
 */
function generateSummaryMarkdown(summary) {
  let md = `# Phase 78 Error Analysis\n\n`;
  md += `**Timestamp:** ${summary.timestamp}\n\n`;
  md += `**Total Errors:** ${summary.totalErrors}\n\n`;

  md += `## Categories\n\n`;
  for (const cat of summary.categories) {
    md += `- **${cat.name}**: ${cat.count} errors across ${cat.files} files\n`;
  }

  md += `\n## Top 10 Errors\n\n`;
  for (let i = 0; i < summary.topErrors.length; i++) {
    const err = summary.topErrors[i];
    md += `### ${i + 1}. ${err.file}:${err.line}:${err.column}\n\n`;
    md += `- **Code:** ${err.code || 'N/A'}\n`;
    md += `- **Message:** ${err.message}\n`;
    md += `- **Source:** ${err.source}\n\n`;
  }

  return md;
}

/**
 * Main execution
 */
async function main() {
  console.log(`\n${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.cyan}  Phase 78: Error Analysis & Knowledge Graph${colors.reset}`);
  console.log(`${colors.cyan}═══════════════════════════════════════════${colors.reset}\n`);

  // Run checks
  const svelteResult = runSvelteCheck();
  const tsResult = runTypeScriptCheck();

  // Combine all errors
  const allErrors = [...svelteResult.errors, ...tsResult.errors];

  log.info(`Found ${allErrors.length} total errors`);
  log.info(`  - Svelte Check: ${svelteResult.errors.length}`);
  log.info(`  - TypeScript: ${tsResult.errors.length}`);

  if (allErrors.length === 0) {
    log.success('No errors found! 🎉');
    return;
  }

  // Categorize
  log.step('Categorizing errors...');
  const categorized = categorizeErrors(allErrors);

  for (const [category, errors] of Object.entries(categorized)) {
    if (errors.length > 0) {
      log.info(`  - ${category}: ${errors.length} errors`);
    }
  }

  // Generate knowledge graph
  log.step('Generating knowledge graph entries...');
  const knowledge = generateKnowledgeGraph(categorized);
  log.success(`Generated ${knowledge.length} knowledge graph entries`);

  // Save results
  log.step('Saving results...');
  const files = saveResults(allErrors, categorized, knowledge);

  console.log(`\n${colors.green}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.green}  Analysis Complete!${colors.reset}`);
  console.log(`${colors.green}═══════════════════════════════════════════${colors.reset}\n`);

  log.info('Next steps:');
  log.info('  1. Review: ' + files.summaryFile);
  log.info('  2. Run: npm run phase78:insert (insert to PostgreSQL)');
  log.info('  3. Run: npm run phase78:suggest (get AI fix suggestions)');
}

main().catch(console.error);
