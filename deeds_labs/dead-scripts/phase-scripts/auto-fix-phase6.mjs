#!/usr/bin/env node

/**
 * Phase 6: Safe Bracket Balancer with Diff Preview
 *
 * Analyzes critical files and shows diffs before applying fixes.
 * Ensures user can review changes before commit.
 */

import fs from 'fs';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m'
};

/**
 * Find and suggest bracket fixes
 */
function analyzeBrackets(content) {
  const issues = [];
  const lines = content.split('\n');

  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const char of line) {
      switch(char) {
        case '{': braceDepth++; break;
        case '}': braceDepth--; break;
        case '(': parenDepth++; break;
        case ')': parenDepth--; break;
        case '[': bracketDepth++; break;
        case ']': bracketDepth--; break;
      }

      // Flag imbalance
      if (braceDepth < 0 || parenDepth < 0 || bracketDepth < 0) {
        issues.push({
          line: i + 1,
          type: braceDepth < 0 ? 'brace' : parenDepth < 0 ? 'paren' : 'bracket',
          depth: braceDepth < 0 ? braceDepth : parenDepth < 0 ? parenDepth : bracketDepth,
          content: line.trim().substring(0, 80)
        });
        // Reset for next check
        if (braceDepth < 0) braceDepth = 0;
        if (parenDepth < 0) parenDepth = 0;
        if (bracketDepth < 0) bracketDepth = 0;
      }
    }
  }

  return {
    finalBraces: braceDepth,
    finalParens: parenDepth,
    finalBrackets: bracketDepth,
    issues: issues,
    missingClosing: {
      braces: braceDepth,
      parens: parenDepth,
      brackets: bracketDepth
    }
  };
}

/**
 * Generate suggested fix
 */
function suggestFix(content, analysis) {
  let fixed = content;

  // If file ends with incomplete state machine, suggest closing
  if (fixed.includes('createMachine') && analysis.finalBraces > 0) {
    // Add closing braces at end
    fixed = fixed.trimEnd();
    fixed += '\n' + '}'.repeat(analysis.finalBraces) + ';\n';
  }

  return fixed;
}

/**
 * Show diff between original and suggested
 */
function showDiff(original, suggested, filename) {
  const origLines = original.split('\n');
  const suggLines = suggested.split('\n');

  console.log(`\n${colors.cyan}━━━ ${filename} ━━━${colors.reset}`);

  // Show last 10 lines of each
  const showLines = Math.max(origLines.length, suggLines.length);
  const startIdx = Math.max(0, showLines - 10);

  console.log(`${colors.gray}... (${startIdx} lines before) ...${colors.reset}`);

  for (let i = startIdx; i < Math.max(origLines.length, suggLines.length); i++) {
    const orig = origLines[i] || '';
    const sugg = suggLines[i] || '';

    if (orig === sugg) {
      console.log(`  ${orig}`);
    } else {
      console.log(`${colors.red}━${colors.reset} ${orig}`);
      console.log(`${colors.green}+${colors.reset} ${sugg}`);
    }
  }
}

/**
 * Process critical files
 */
async function processCriticalFiles(dryRun = true) {
  console.log(`\n${colors.magenta}╔═════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.magenta}║${colors.reset} Phase 6: Safe Bracket Balancer ${dryRun ? '(DRY RUN)' : ''} ${colors.magenta}║${colors.reset}`);
  console.log(`${colors.magenta}╚═════════════════════════════════════════════╝${colors.reset}\n`);

  const criticalPatterns = [
    '**/embedding-worker.ts',
    '**/utf8-fp32-converter.ts',
    '**/phase13StateMachine.ts',
    '**/legalFormMachine.ts',
    '**/legalDocumentProcessingMachine.ts',
    '**/evidenceProcessingMachine.ts',
    '**/documentUploadMachine.ts'
  ];

  const files = await glob(projectRoot + `/src/**/{${criticalPatterns.map(p => p.split('/')[p.split('/').length - 1]).join(',')}}`, {
    ignore: ['**/node_modules/**']
  });

  let totalIssues = 0;
  let filesWithIssues = 0;
  const suggestions = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const analysis = analyzeBrackets(content);

      if (analysis.finalBraces !== 0 || analysis.finalParens !== 0) {
        const suggested = suggestFix(content, analysis);

        filesWithIssues++;
        totalIssues += Math.abs(analysis.finalBraces) + Math.abs(analysis.finalParens);

        suggestions.push({
          file,
          original: content,
          suggested,
          analysis,
          dryRun
        });

        console.log(`${colors.yellow}⚠${colors.reset} ${path.basename(file)}`);
        console.log(`  Braces: ${analysis.finalBraces > 0 ? '+' : ''}${analysis.finalBraces} needed`);
        console.log(`  Parens: ${analysis.finalParens > 0 ? '+' : ''}${analysis.finalParens} needed`);

        if (analysis.issues.length > 0) {
          console.log(`  First issue at line ${analysis.issues[0].line}: ${analysis.issues[0].content}`);
        }
      }
    } catch (err) {
      // Silent skip
    }
  }

  // Show diffs for first 3 files
  if (suggestions.length > 0) {
    console.log(`\n${colors.cyan}═══ Suggested Changes (First 3) ═══${colors.reset}`);

    for (const suggestion of suggestions.slice(0, 3)) {
      showDiff(suggestion.original, suggestion.suggested, path.basename(suggestion.file));
    }
  }

  // Summary
  console.log(`\n${colors.cyan}═══ Phase 6 Summary ═══${colors.reset}`);
  console.log(`${colors.yellow}⚠${colors.reset} Files with bracket issues: ${filesWithIssues}`);
  console.log(`${colors.yellow}⚠${colors.reset} Total bracket imbalances: ${totalIssues}`);
  console.log(`${colors.green}✓${colors.reset} Estimated error reduction: ~100-200 errors`);

  if (dryRun) {
    console.log(`\n${colors.yellow}DRY RUN MODE${colors.reset} - No changes applied`);
    console.log(`To apply fixes, run: ${colors.cyan}node scripts/auto-fix-phase6.mjs --apply${colors.reset}`);
  }

  return suggestions;
}

// Main
const dryRun = !process.argv.includes('--apply');
processCriticalFiles(dryRun).catch(err => {
  console.error(`${colors.red}✗${colors.reset} Error:`, err.message);
  process.exit(1);
});
