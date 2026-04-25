#!/usr/bin/env node

/**
 * Interactive XState File Repair Assistant
 *
 * Guides users through fixing syntax issues one file at a time
 * with validation and diff preview
 */

import { execSync } from 'child_process';
import fs from 'fs';
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
 * Analyze file syntax
 */
function analyzeSyntax(content) {
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  const issues = [];

  const lines = content.split('\n');
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

      if (braceDepth < 0 || parenDepth < 0 || bracketDepth < 0) {
        issues.push({
          line: i + 1,
          type: braceDepth < 0 ? 'brace' : parenDepth < 0 ? 'paren' : 'bracket',
          context: line.trim()
        });
        if (braceDepth < 0) braceDepth = 0;
        if (parenDepth < 0) parenDepth = 0;
        if (bracketDepth < 0) bracketDepth = 0;
      }
    }
  }

  return {
    braces: { delta: braceDepth },
    parens: { delta: parenDepth },
    brackets: { delta: bracketDepth },
    issues,
    isValid: braceDepth === 0 && parenDepth === 0 && bracketDepth === 0
  };
}

/**
 * Show file context
 */
function showFileContext(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const analysis = analyzeSyntax(content);

    console.log(`\n${colors.cyan}═══ File Analysis ═══${colors.reset}`);
    console.log(`${colors.bold}File:${colors.reset} ${path.basename(filePath)}`);
    console.log(`${colors.bold}Lines:${colors.reset} ${lines.length}`);
    console.log(`${colors.bold}Braces:${colors.reset} Δ ${analysis.braces.delta > 0 ? '+' : ''}${analysis.braces.delta}`);
    console.log(`${colors.bold}Parens:${colors.reset} Δ ${analysis.parens.delta > 0 ? '+' : ''}${analysis.parens.delta}`);
    console.log(`${colors.bold}Status:${colors.reset} ${analysis.isValid ? colors.green + '✓ Valid' : colors.red + '✗ Invalid'} ${colors.reset}`);

    if (analysis.issues.length > 0) {
      console.log(`\n${colors.yellow}⚠ Issues Found:${colors.reset}`);
      for (const issue of analysis.issues.slice(0, 3)) {
        console.log(`  Line ${issue.line}: ${issue.context.substring(0, 60)}`);
      }
    }

    // Show last 15 lines
    console.log(`\n${colors.gray}═ Last 15 Lines ═${colors.reset}`);
    const startLine = Math.max(0, lines.length - 15);
    for (let i = startLine; i < lines.length; i++) {
      const lineNum = String(i + 1).padStart(4);
      const marker = i === lines.length - 1 ? colors.red + '→' : ' ';
      console.log(`${marker} ${colors.gray}${lineNum}${colors.reset} ${lines[i]}`);
    }

    return { content, analysis };
  } catch (err) {
    console.error(`${colors.red}✗${colors.reset} Error reading file: ${err.message}`);
    return null;
  }
}

/**
 * Suggest fixes
 */
function suggestFixes(analysis) {
  const suggestions = [];

  if (analysis.braces.delta > 0) {
    suggestions.push(`Add ${analysis.braces.delta} closing brace(s): ${'}'.repeat(analysis.braces.delta)}`);
  }
  if (analysis.braces.delta < 0) {
    suggestions.push(`Remove ${Math.abs(analysis.braces.delta)} closing brace(s)`);
  }
  if (analysis.parens.delta > 0) {
    suggestions.push(`Add ${analysis.parens.delta} closing paren(s): ${''.repeat(analysis.parens.delta)}`);
  }
  if (analysis.parens.delta < 0) {
    suggestions.push(`Remove ${Math.abs(analysis.parens.delta)} closing paren(s)`);
  }

  return suggestions;
}

/**
 * Interactive repair loop
 */
async function startInteractiveRepair() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  console.log(`\n${colors.magenta}╔═════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.magenta}║${colors.reset}  Interactive XState File Repair Assistant      ${colors.magenta}║${colors.reset}`);
  console.log(`${colors.magenta}╚═════════════════════════════════════════════════╝${colors.reset}\n`);

  let continueRepair = true;

  while (continueRepair) {
    const filePath = await question(`\n${colors.cyan}Enter file path (or 'quit' to exit):${colors.reset} `);

    if (filePath.toLowerCase() === 'quit') {
      continueRepair = false;
      break;
    }

    if (!fs.existsSync(filePath)) {
      console.log(`${colors.red}✗${colors.reset} File not found`);
      continue;
    }

    const fileData = showFileContext(filePath);
    if (!fileData) continue;

    const { content, analysis } = fileData;

    if (analysis.isValid) {
      console.log(`${colors.green}✓${colors.reset} File is already valid!`);
      continue;
    }

    const suggestions = suggestFixes(analysis);
    console.log(`\n${colors.yellow}Suggestions:${colors.reset}`);
    suggestions.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

    const manualEdit = await question(`\n${colors.cyan}Open in VS Code for manual editing? (y/n):${colors.reset} `);
    if (manualEdit.toLowerCase() === 'y') {
      try {
        execSync(`code "${filePath}"`);
        console.log(`${colors.gray}VS Code opened. Press Enter when done editing...${colors.reset}`);
        await question('');
      } catch (err) {
        console.log(`${colors.yellow}Could not open VS Code${colors.reset}`);
      }
    }

    // Re-check file
    const updatedContent = fs.readFileSync(filePath, 'utf-8');
    const updatedAnalysis = analyzeSyntax(updatedContent);

    if (updatedAnalysis.isValid) {
      console.log(`${colors.green}✓ File is now valid!${colors.reset}`);

      // Validate with TypeScript
      try {
        execSync(`npx tsc --noEmit --skipLibCheck "${filePath}"`, { stdio: 'pipe' });
        console.log(`${colors.green}✓ TypeScript check passed!${colors.reset}`);
      } catch (err) {
        console.log(`${colors.yellow}⚠ TypeScript check failed:${colors.reset}`);
        console.log(err.stderr?.toString() || err.message);
      }
    } else {
      console.log(`${colors.yellow}⚠ File still has issues:${colors.reset}`);
      console.log(`  Braces: Δ ${updatedAnalysis.braces.delta}`);
      console.log(`  Parens: Δ ${updatedAnalysis.parens.delta}`);
    }

    const continueQuestion = await question(`\n${colors.cyan}Continue with next file? (y/n):${colors.reset} `);
    continueRepair = continueQuestion.toLowerCase() === 'y';
  }

  rl.close();
  console.log(`\n${colors.green}✓ Repair session complete${colors.reset}`);
}

// Main
startInteractiveRepair().catch(err => {
  console.error(`${colors.red}✗ Error:${colors.reset}`, err.message);
  process.exit(1);
});
