#!/usr/bin/env node
/**
 * Phase 43 — Comprehensive Error Analysis
 * Determines top error patterns from svelte-check output
 * Generates actionable fix recommendations
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseSvelteCheckLog(logPath) {
  const raw = fs.readFileSync(logPath, 'utf8');
  const lines = raw.split('\n');
  
  const errors = [];
  const summary = { errors: 0, warnings: 0, files: 0 };
  
  for (const line of lines) {
    // Parse summary line
    const summaryMatch = line.match(/found (\d+) errors? and (\d+) warnings? in (\d+) files?/);
    if (summaryMatch) {
      summary.errors = parseInt(summaryMatch[1]);
      summary.warnings = parseInt(summaryMatch[2]);
      summary.files = parseInt(summaryMatch[3]);
      continue;
    }
    
    // Parse error lines
    const errorMatch = line.match(/(.+?):(\d+):(\d+)\s+(Error|Warning):\s+(.+)/);
    if (errorMatch) {
      errors.push({
        file: errorMatch[1],
        line: parseInt(errorMatch[2]),
        col: parseInt(errorMatch[3]),
        severity: errorMatch[4],
        message: errorMatch[5],
      });
    }
  }
  
  return { summary, errors };
}

function categorizeErrors(errors) {
  const patterns = {
    'event-directive': {
      regex: /Using on:(click|input|change|submit|focus|blur|key|mouse)/,
      fix: 'scripts/fix-event-directives.mjs --apply',
      description: 'Deprecated event directives (on:click → onclick)',
    },
    'any-type': {
      regex: /Type '.*' is not assignable to type '.*any.*'/,
      fix: 'scripts/fix-any-types.mjs --apply',
      description: 'Any type usage',
    },
    'async-effect': {
      regex: /(onMount|effect).*async.*Promise/i,
      fix: 'scripts/phase43-async-effects.mjs --apply',
      description: 'Async effects/onMount patterns',
    },
    'missing-property': {
      regex: /Property '.*' does not exist on type/,
      fix: 'Manual review + type definitions',
      description: 'Missing type properties',
    },
    'type-assertion': {
      regex: /Conversion of type .* may be a mistake/,
      fix: 'Manual review + proper type guards',
      description: 'Unsafe type assertions',
    },
    'import-error': {
      regex: /Cannot find module|Module .* has no exported member/,
      fix: 'scripts/fix-imports.mjs --apply (create if needed)',
      description: 'Import/export issues',
    },
    'reactive-declaration': {
      regex: /\$:|reactive statement|reactive declaration/i,
      fix: 'Manual migration to $derived runes',
      description: 'Svelte 4 reactive statements',
    },
    'component-binding': {
      regex: /bind:|binding/i,
      fix: 'Manual review of bind: directives',
      description: 'Component binding issues',
    },
  };
  
  const categorized = new Map();
  const uncategorized = [];
  
  for (const error of errors) {
    let matched = false;
    
    for (const [category, pattern] of Object.entries(patterns)) {
      if (pattern.regex.test(error.message)) {
        if (!categorized.has(category)) {
          categorized.set(category, []);
        }
        categorized.get(category).push(error);
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      uncategorized.push(error);
    }
  }
  
  return { categorized, uncategorized, patterns };
}

function generateFixPlan(categorized, patterns, summary) {
  const plan = {
    totalErrors: summary.errors,
    totalWarnings: summary.warnings,
    affectedFiles: summary.files,
    phases: [],
  };
  
  const sorted = Array.from(categorized.entries())
    .sort((a, b) => b[1].length - a[1].length);
  
  let phaseNum = 1;
  let estimatedReduction = 0;
  
  for (const [category, categoryErrors] of sorted) {
    const pattern = patterns[category];
    const count = categoryErrors.length;
    const percentage = ((count / summary.errors) * 100).toFixed(1);
    
    plan.phases.push({
      phase: phaseNum++,
      category,
      description: pattern.description,
      errorCount: count,
      percentage: `${percentage}%`,
      command: pattern.fix,
      estimatedTime: count > 10000 ? '15-20 min' : count > 5000 ? '10-15 min' : count > 1000 ? '5-10 min' : '< 5 min',
      automated: !pattern.fix.includes('Manual'),
    });
    
    estimatedReduction += count;
  }
  
  plan.estimatedReduction = estimatedReduction;
  plan.estimatedRemaining = summary.errors - estimatedReduction;
  
  return plan;
}

// Main execution
const logPath = process.argv[2] || path.join(ROOT, 'svelte-check-errors.txt');

if (!fs.existsSync(logPath)) {
  console.error(`❌ Log file not found: ${logPath}`);
  console.log(`\n💡 First run: npx svelte-check --output machine > svelte-check-errors.txt`);
  process.exit(1);
}

console.log(`🔍 Analyzing errors from: ${logPath}\n`);

const { summary, errors } = parseSvelteCheckLog(logPath);
const { categorized, uncategorized, patterns } = categorizeErrors(errors);
const plan = generateFixPlan(categorized, patterns, summary);

console.log(`📊 Error Summary:`);
console.log(`   Total Errors: ${summary.errors.toLocaleString()}`);
console.log(`   Total Warnings: ${summary.warnings.toLocaleString()}`);
console.log(`   Affected Files: ${summary.files.toLocaleString()}`);
console.log(`   Categorized: ${(summary.errors - uncategorized.length).toLocaleString()}`);
console.log(`   Uncategorized: ${uncategorized.length.toLocaleString()}\n`);

console.log(`🎯 Fix Plan (Priority Order):\n`);

for (const phase of plan.phases) {
  const icon = phase.automated ? '🤖' : '👤';
  console.log(`${icon} Phase ${phase.phase}: ${phase.description}`);
  console.log(`   Errors: ${phase.errorCount.toLocaleString()} (${phase.percentage})`);
  console.log(`   Command: ${phase.command}`);
  console.log(`   Est. Time: ${phase.estimatedTime}`);
  console.log();
}

console.log(`📈 Projected Impact:`);
console.log(`   Errors to Fix: ${plan.estimatedReduction.toLocaleString()} (${((plan.estimatedReduction / summary.errors) * 100).toFixed(1)}%)`);
console.log(`   Remaining: ~${plan.estimatedRemaining.toLocaleString()}\n`);

// Save detailed report
const reportPath = path.join(ROOT, 'PHASE43-TOP-ERRORS.json');
const detailedReport = {
  timestamp: new Date().toISOString(),
  summary,
  plan,
  topErrorsByCategory: Object.fromEntries(
    Array.from(categorized.entries()).map(([cat, errs]) => [
      cat,
      {
        count: errs.length,
        samples: errs.slice(0, 5).map(e => ({
          file: e.file,
          line: e.line,
          message: e.message.slice(0, 100),
        })),
      },
    ])
  ),
};

fs.writeFileSync(reportPath, JSON.stringify(detailedReport, null, 2));
console.log(`✅ Detailed report saved: ${reportPath}\n`);

console.log(`🚀 Quick Start Commands:\n`);
console.log(`# 1. Fix event directives (~25k errors)`);
console.log(`node scripts/fix-event-directives.mjs --apply\n`);
console.log(`# 2. Fix any types (~40k errors)`);
console.log(`node scripts/fix-any-types.mjs --apply\n`);
console.log(`# 3. Fix async effects (~5k errors)`);
console.log(`node scripts/phase43-async-effects.mjs --apply\n`);
console.log(`# 4. Re-check progress`);
console.log(`npx svelte-check > svelte-check-after-fixes.txt 2>&1\n`);
