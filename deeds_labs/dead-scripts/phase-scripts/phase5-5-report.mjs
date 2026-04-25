#!/usr/bin/env node

/**
 * Phase 5.5: Critical File Analysis & Summary Report
 *
 * Analyzes top 10 critical XState files with major syntax issues
 * and provides targeted repair recommendations
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
  magenta: '\x1b[35m'
};

/**
 * Get brace/paren mismatch info for a file
 */
function analyzeFileSyntax(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    const braceOpen = (content.match(/\{/g) || []).length;
    const braceClose = (content.match(/\}/g) || []).length;
    const parenOpen = (content.match(/\(/g) || []).length;
    const parenClose = (content.match(/\)/g) || []).length;

    return {
      braces: { open: braceOpen, close: braceClose, delta: braceOpen - braceClose },
      parens: { open: parenOpen, close: parenClose, delta: parenOpen - parenClose },
      lines: content.split('\n').length,
      hasXState: content.includes('createMachine') || content.includes('assign('),
      hasErrors: braceOpen !== braceClose || parenOpen !== parenClose
    };
  } catch (err) {
    return null;
  }
}

/**
 * Generate analysis report
 */
async function generateReport() {
  console.log(`\n${colors.magenta}╔════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.magenta}║${colors.reset} Phase 5.5: Critical File Analysis Report  ${colors.magenta}║${colors.reset}`);
  console.log(`${colors.magenta}╚════════════════════════════════════════════╝${colors.reset}\n`);

  // Top 10 critical files identified in Phase 5
  const criticalFiles = [
    'embedding-worker.ts',
    'utf8-fp32-converter.ts',
    'phase13StateMachine.ts',
    'legalFormMachine.ts',
    'legalDocumentProcessingMachine.ts',
    'evidenceProcessingMachine.ts',
    'documentUploadMachine.ts',
    'crewAIOrchestrationMachine.ts',
    'async-rabbitmq-state-manager.ts',
    'app-machine.ts'
  ];

  const fileSearch = await glob(projectRoot + '/src/**/{' + criticalFiles.join(',') + '}', {
    ignore: ['**/node_modules/**']
  });

  const analysis = [];

  for (const file of fileSearch) {
    const info = analyzeFileSyntax(file);
    if (info && info.hasErrors) {
      analysis.push({
        name: path.basename(file),
        path: file,
        ...info
      });
    }
  }

  // Sort by severity (brace delta)
  analysis.sort((a, b) => Math.abs(b.braces.delta) - Math.abs(a.braces.delta));

  console.log(`${colors.yellow}Critical Files Requiring Manual Intervention:${colors.reset}\n`);

  for (const file of analysis.slice(0, 15)) {
    const braceSeverity = Math.abs(file.braces.delta);
    const parenSeverity = Math.abs(file.parens.delta);
    const totalSeverity = braceSeverity + parenSeverity;

    const icon = totalSeverity > 15 ? colors.red : colors.yellow;
    console.log(`${icon}⚠${colors.reset} ${file.name}`);
    console.log(`  ${colors.blue}Braces:${colors.reset} ${file.braces.open} open, ${file.braces.close} close (Δ ${file.braces.delta > 0 ? '+' : ''}${file.braces.delta})`);
    console.log(`  ${colors.blue}Parens:${colors.reset} ${file.parens.open} open, ${file.parens.close} close (Δ ${file.parens.delta > 0 ? '+' : ''}${file.parens.delta})`);
    console.log(`  ${colors.blue}Lines:${colors.reset} ${file.lines}`);
    console.log('');
  }

  console.log(`${colors.cyan}═══ Recommendations ═══${colors.reset}`);
  console.log(`
1. ${colors.yellow}Use Find/Replace with Regex${colors.reset}
   - Find unmatched closing braces: /\}$/gm
   - Find unmatched opening braces: /\{$/gm

2. ${colors.yellow}Review File Endings${colors.reset}
   - Many files likely have truncated endings or extra closing symbols
   - Check last 50 lines of each file for incomplete structures

3. ${colors.yellow}Prioritize by Severity${colors.reset}
   - Files with |Δ| > 10 are likely truncated or malformed
   - These cannot be auto-fixed and require manual inspection

4. ${colors.yellow}Validate XState Structure${colors.reset}
   - Ensure machines end with proper } closing
   - Verify all invoke blocks have matching braces
   - Check state definitions are properly nested

${colors.green}✓${colors.reset} These fixes should reduce errors by ~500-1000 when completed
${colors.cyan}ℹ${colors.reset} Status: ${colors.yellow}Manual intervention required${colors.reset}
  `);
}

generateReport().catch(err => {
  console.error(colors.red + '✗' + colors.reset + ' Report failed:', err.message);
  process.exit(1);
});
