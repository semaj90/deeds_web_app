#!/usr/bin/env node

/**
 * Batch XState Fixer with Approval Workflow
 *
 * Automatically detects and fixes common syntax issues
 * Shows diffs and requires approval before applying
 */

import fs from 'fs';
import { glob } from 'glob';
import path from 'path';
import { createInterface } from 'readline';
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
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

/**
 * Analyze and auto-fix common issues
 */
function analyzeAndFix(content) {
  let fixed = content;
  const fixes = [];
  const originalLines = content.split('\n');
  let lineNum = 1;

  // Fix 1: Missing comma between onDone and onError
  const onDoneErrorPattern = /onDone:\s*\{[^}]+\}\s*onError:/g;
  const fix1 = fixed.replace(onDoneErrorPattern, (match) => {
    fixes.push(`Line ~${lineNum}: Added comma between onDone and onError`);
    return match.replace('}onError', '},\nonError');
  });
  if (fix1 !== fixed) fixed = fix1;

  // Fix 2: Missing closing parens in assign()
  const assignPattern = /assign\(\{\s*([^}]+)\}\s*([,\n])/g;
  const fix2 = fixed.replace(assignPattern, (match, content, suffix) => {
    if (match.includes('=>')) {
      fixes.push(`Line ~${lineNum}: Validated assign() closure`);
      return match;
    }
    return match;
  });
  if (fix2 !== fixed) fixed = fix2;

  // Fix 3: Missing closing braces at EOF
  if (fixed.includes('createMachine')) {
    const analysis = analyzeBrackets(fixed);
    if (analysis.finalBraces > 0) {
      fixed = fixed.trimEnd() + '\n' + '}'.repeat(analysis.finalBraces) + ';\n';
      fixes.push(`EOF: Added ${analysis.finalBraces} closing brace(s)`);
    }
  }

  // Fix 4: Orphaned pipes in type definitions
  const orphanedPipePattern = /(\|)\s*\n\s*([};,])/g;
  const fix4 = fixed.replace(orphanedPipePattern, (match) => {
    fixes.push(`Line ~${lineNum}: Removed orphaned pipe operator`);
    return match.replace('|', '');
  });
  if (fix4 !== fixed) fixed = fix4;

  // Fix 5: Missing commas in object literals
  const noCommaPattern = /(\})\s*\n\s*([a-zA-Z])/g;
  let fix5 = fixed;
  const matches = [...fixed.matchAll(noCommaPattern)];
  if (matches.length > 0) {
    fix5 = fixed.replace(noCommaPattern, (match) => {
      if (!match.includes(',')) {
        fixes.push(`Line ~${lineNum}: Added missing comma between properties`);
        return '},\n';
      }
      return match;
    });
  }
  if (fix5 !== fixed) fixed = fix5;

  return { fixed, fixes };
}

/**
 * Analyze bracket balance
 */
function analyzeBrackets(content) {
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;

  for (const char of content) {
    switch(char) {
      case '{': braceDepth++; break;
      case '}': braceDepth--; break;
      case '(': parenDepth++; break;
      case ')': parenDepth--; break;
      case '[': bracketDepth++; break;
      case ']': bracketDepth--; break;
    }
  }

  return {
    finalBraces: braceDepth,
    finalParens: parenDepth,
    finalBrackets: bracketDepth,
    isValid: braceDepth === 0 && parenDepth === 0 && bracketDepth === 0
  };
}

/**
 * Show diff between original and fixed
 */
function showDiff(original, fixed, filename) {
  const origLines = original.split('\n');
  const fixedLines = fixed.split('\n');

  console.log(`\n${colors.cyan}╔═══ Diff for ${filename} ═══╗${colors.reset}`);

  // Find first difference
  for (let i = 0; i < Math.max(origLines.length, fixedLines.length); i++) {
    const o = origLines[i] || '';
    const f = fixedLines[i] || '';

    if (o !== f) {
      const startIdx = Math.max(0, i - 2);
      const endIdx = Math.min(Math.max(origLines.length, fixedLines.length), i + 5);

      console.log(`${colors.gray}... context ...${colors.reset}`);

      for (let j = startIdx; j < endIdx; j++) {
        const origLine = origLines[j] || '';
        const fixedLine = fixedLines[j] || '';

        if (origLine === fixedLine) {
          console.log(`  ${colors.gray}${origLine.substring(0, 70)}${colors.reset}`);
        } else {
          console.log(`${colors.red}─ ${origLine.substring(0, 70)}${colors.reset}`);
          console.log(`${colors.green}+ ${fixedLine.substring(0, 70)}${colors.reset}`);
        }
      }

      console.log(`${colors.gray}... rest of file ...${colors.reset}`);
      break;
    }
  }

  console.log(`${colors.cyan}╚═══════════════════════╝${colors.reset}`);
}

/**
 * Interactive approval
 */
async function askApproval(filename) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise(resolve => {
    rl.question(`\n${colors.yellow}Apply fixes to ${filename}? (y/n/skip):${colors.reset} `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase());
    });
  });
}

/**
 * Main batch process
 */
async function batchProcess() {
  console.log(`\n${colors.magenta}╔════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.magenta}║${colors.reset}  Batch XState Fixer (Approval Workflow)     ${colors.magenta}║${colors.reset}`);
  console.log(`${colors.magenta}╚════════════════════════════════════════════╝${colors.reset}\n`);

  // Find critical files
  const criticalNames = [
    'embedding-worker.ts',
    'utf8-fp32-converter.ts',
    'phase13StateMachine.ts',
    'legalFormMachine.ts',
    'legalDocumentProcessingMachine.ts'
  ];

  let approved = 0;
  let fixed = 0;
  let skipped = 0;

  // Process Tier 1 critical files first
  for (const filename of criticalNames) {
    const files = await glob(projectRoot + `/**/src/**/${filename}`, {
      ignore: ['**/node_modules/**']
    });

    for (const file of files) {
      try {
        const original = fs.readFileSync(file, 'utf-8');
        const { fixed: fixedContent, fixes: appliedFixes } = analyzeAndFix(original);
        const bracket = analyzeBrackets(fixedContent);

        console.log(`\n${colors.bold}${path.basename(file)}${colors.reset}`);
        console.log(`Status: ${bracket.isValid ? colors.green + '✓ Valid' : colors.red + '✗ Invalid'} ${colors.reset}`);

        if (appliedFixes.length > 0) {
          console.log(`${colors.yellow}Suggested fixes:${colors.reset}`);
          appliedFixes.forEach(f => console.log(`  • ${f}`));

          showDiff(original, fixedContent, filename);

          const approval = await askApproval(filename);

          if (approval === 'y') {
            fs.writeFileSync(file, fixedContent, 'utf-8');
            console.log(`${colors.green}✓ Applied fixes${colors.reset}`);
            approved++;
            fixed++;
          } else if (approval === 'skip') {
            skipped++;
          }
        } else if (bracket.isValid) {
          console.log(`${colors.green}✓ No fixes needed${colors.reset}`);
        }
      } catch (err) {
        console.log(`${colors.red}✗ Error:${colors.reset} ${err.message}`);
      }
    }
  }

  // Summary
  console.log(`\n${colors.cyan}═══ Session Summary ═══${colors.reset}`);
  console.log(`${colors.green}✓ Approved:${colors.reset} ${approved}`);
  console.log(`${colors.green}✓ Applied:${colors.reset} ${fixed}`);
  console.log(`${colors.yellow}⊘ Skipped:${colors.reset} ${skipped}`);
  console.log(`\n${colors.cyan}ℹ Next: Run npm run check:svelte to verify${colors.reset}`);
}

batchProcess().catch(err => {
  console.error(`${colors.red}✗${colors.reset} Error:`, err.message);
  process.exit(1);
});
