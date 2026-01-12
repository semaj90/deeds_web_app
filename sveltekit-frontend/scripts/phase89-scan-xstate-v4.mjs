#!/usr/bin/env node
/**
 * Phase 89: XState v4 Pattern Scanner
 *
 * Scan codebase for XState v4 patterns that need migration to v5.
 * Generates a report of files needing updates.
 *
 * Usage:
 *   node scripts/phase89-scan-xstate-v4.mjs
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SRC_DIR = 'src';
const REPORT_DIR = 'reports/xstate-migration';

// XState v4 patterns to detect
const patterns = [
  {
    id: 'frompromise-inline-types',
    name: 'fromPromise with inline types',
    regex: /fromPromise\s*\(\s*async\s*\(\s*\{\s*[^}]*\}\s*:\s*\{/g,
    severity: 'high',
    description: 'XState v5 requires explicit type parameters, no inline types'
  },
  {
    id: 'invoke-data',
    name: 'invoke.data (should be invoke.input)',
    regex: /invoke:\s*\{[^}]*\bdata:/g,
    severity: 'medium',
    description: 'XState v5 renamed invoke.data to invoke.input'
  },
  {
    id: 'send-action',
    name: 'send() action (should be raise/sendTo)',
    regex: /\bsend\s*\(/g,
    severity: 'medium',
    description: 'XState v5 split send() into raise() and sendTo()'
  },
  {
    id: 'spawn-function',
    name: 'spawn() function (should be spawnChild)',
    regex: /\bspawn\s*\(/g,
    severity: 'medium',
    description: 'XState v5 removed global spawn(), use spawnChild()'
  },
  {
    id: 'machine-function',
    name: 'Machine() constructor (should be createMachine)',
    regex: /\bMachine\s*\(/g,
    severity: 'low',
    description: 'XState v5 removed Machine(), use createMachine()'
  },
  {
    id: 'interpret-function',
    name: 'interpret() (should be createActor)',
    regex: /\binterpret\s*\(/g,
    severity: 'low',
    description: 'XState v5 renamed interpret() to createActor()'
  },
  {
    id: 'pure-action',
    name: 'pure() action (should be enqueueActions)',
    regex: /\bpure\s*\(/g,
    severity: 'low',
    description: 'XState v5 replaced pure() with enqueueActions()'
  },
  {
    id: 'choose-action',
    name: 'choose() action (should be enqueueActions)',
    regex: /\bchoose\s*\(/g,
    severity: 'low',
    description: 'XState v5 replaced choose() with enqueueActions()'
  },
  {
    id: 'cond-guard',
    name: 'cond guard (should be guard)',
    regex: /\bcond:\s*['"`]/g,
    severity: 'low',
    description: 'XState v5 renamed cond to guard'
  },
  {
    id: 'in-guard',
    name: 'in: state guard (should be guard: stateIn)',
    regex: /\bin:\s*['"`]/g,
    severity: 'low',
    description: 'XState v5 replaced in with guard: stateIn(...)'
  }
];

/**
 * Find all TypeScript/TSX files in src directory
 */
async function findTSFiles() {
  try {
    const output = execSync(`rg --files --type ts --type tsx ${SRC_DIR}`, { encoding: 'utf8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    // Fallback if ripgrep not available
    console.warn('⚠️  ripgrep not found, using slower file search...');
    const { globSync } = await import('glob');
    return globSync(`${SRC_DIR}/**/*.{ts,tsx}`, { ignore: ['**/*.d.ts', '**/node_modules/**'] });
  }
}

/**
 * Scan file for XState v4 patterns
 */
function scanFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const matches = [];

    // Skip if no XState imports
    if (!content.includes('xstate') && !content.includes('fromPromise') && !content.includes('createMachine')) {
      return null;
    }

    for (const pattern of patterns) {
      const found = content.match(pattern.regex);
      if (found) {
        matches.push({
          patternId: pattern.id,
          patternName: pattern.name,
          severity: pattern.severity,
          description: pattern.description,
          count: found.length
        });
      }
    }

    return matches.length > 0 ? matches : null;
  } catch (error) {
    console.error(`❌ Error scanning ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Generate migration report
 */
function generateReport(results) {
  const timestamp = new Date().toISOString();

  // Summary statistics
  const totalFiles = results.length;
  const byPattern = {};
  let totalIssues = 0;

  for (const result of results) {
    for (const match of result.matches) {
      if (!byPattern[match.patternId]) {
        byPattern[match.patternId] = {
          name: match.patternName,
          severity: match.severity,
          description: match.description,
          files: 0,
          occurrences: 0
        };
      }
      byPattern[match.patternId].files++;
      byPattern[match.patternId].occurrences += match.count;
      totalIssues += match.count;
    }
  }

  // Generate Markdown report
  let report = `# XState v4 Migration Scan Report\n\n`;
  report += `**Generated:** ${timestamp}\n`;
  report += `**Scanned:** ${SRC_DIR} directory\n\n`;
  report += `## Summary\n\n`;
  report += `- **Total Files with Issues:** ${totalFiles}\n`;
  report += `- **Total Pattern Matches:** ${totalIssues}\n\n`;
  report += `## Patterns Detected\n\n`;
  report += `| Pattern | Severity | Files | Occurrences | Description |\n`;
  report += `|---------|----------|-------|-------------|-------------|\n`;

  for (const [id, data] of Object.entries(byPattern).sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a[1].severity] - severityOrder[b[1].severity];
  })) {
    const emoji = data.severity === 'high' ? '🔴' : data.severity === 'medium' ? '🟡' : '🟢';
    report += `| ${data.name} | ${emoji} ${data.severity} | ${data.files} | ${data.occurrences} | ${data.description} |\n`;
  }

  report += `\n## Files Needing Migration\n\n`;

  // Group by severity
  const high = results.filter(r => r.matches.some(m => m.severity === 'high'));
  const medium = results.filter(r => r.matches.some(m => m.severity === 'medium') && !r.matches.some(m => m.severity === 'high'));
  const low = results.filter(r => r.matches.every(m => m.severity === 'low'));

  if (high.length > 0) {
    report += `### 🔴 High Priority (${high.length} files)\n\n`;
    for (const result of high) {
      report += `#### \`${result.file}\`\n\n`;
      for (const match of result.matches.filter(m => m.severity === 'high')) {
        report += `- **${match.patternName}**: ${match.count} occurrence(s)\n`;
        report += `  - ${match.description}\n`;
      }
      report += `\n`;
    }
  }

  if (medium.length > 0) {
    report += `### 🟡 Medium Priority (${medium.length} files)\n\n`;
    for (const result of medium) {
      report += `#### \`${result.file}\`\n\n`;
      for (const match of result.matches.filter(m => m.severity === 'medium')) {
        report += `- **${match.patternName}**: ${match.count} occurrence(s)\n`;
      }
      report += `\n`;
    }
  }

  if (low.length > 0) {
    report += `### 🟢 Low Priority (${low.length} files)\n\n`;
    report += `<details>\n<summary>Click to expand (${low.length} files)</summary>\n\n`;
    for (const result of low) {
      report += `- \`${result.file}\`\n`;
      for (const match of result.matches) {
        report += `  - ${match.patternName}: ${match.count} occurrence(s)\n`;
      }
    }
    report += `\n</details>\n\n`;
  }

  report += `## Next Steps\n\n`;
  report += `1. **Ingest patterns into knowledge base:**\n`;
  report += `   \`\`\`bash\n`;
  report += `   node scripts/phase89-ingest-xstate-patterns.mjs\n`;
  report += `   \`\`\`\n\n`;
  report += `2. **Fix high-priority files first** (fromPromise inline types)\n\n`;
  report += `3. **Run tests after each batch:**\n`;
  report += `   \`\`\`bash\n`;
  report += `   npx tsc --noEmit\n`;
  report += `   npm test\n`;
  report += `   \`\`\`\n\n`;
  report += `4. **Update knowledge base** with successful fix patterns\n\n`;

  return report;
}

/**
 * Main scan process
 */
async function main() {
  console.log('🔍 Phase 89: XState v4 Pattern Scanner');
  console.log('═'.repeat(60));
  console.log('');

  // Find all TS files
  console.log(`📂 Scanning ${SRC_DIR} directory for TypeScript files...`);
  const files = await findTSFiles();
  console.log(`   Found ${files.length} files`);
  console.log('');

  // Scan each file
  console.log('🔍 Scanning for XState v4 patterns...');
  const results = [];
  let scanned = 0;

  for (const file of files) {
    scanned++;
    if (scanned % 50 === 0) {
      process.stdout.write(`\r   Progress: ${scanned}/${files.length} files`);
    }

    const matches = scanFile(file);
    if (matches) {
      results.push({ file, matches });
    }
  }

  console.log(`\r   Progress: ${scanned}/${files.length} files ✅`);
  console.log('');

  if (results.length === 0) {
    console.log('✅ No XState v4 patterns detected!');
    console.log('   Codebase appears to be XState v5 compatible.');
    return;
  }

  // Generate report
  console.log(`📊 Generating migration report...`);
  const report = generateReport(results);

  // Save report
  const { mkdirSync } = await import('fs');
  mkdirSync(REPORT_DIR, { recursive: true });

  const reportPath = join(REPORT_DIR, `scan-${new Date().toISOString().split('T')[0]}.md`);
  const latestPath = join(REPORT_DIR, 'latest.md');

  writeFileSync(reportPath, report);
  writeFileSync(latestPath, report);

  console.log(`   ✅ Report saved: ${reportPath}`);
  console.log(`   ✅ Latest: ${latestPath}`);
  console.log('');

  // Print summary
  console.log('═'.repeat(60));
  console.log('📊 Scan Summary');
  console.log('═'.repeat(60));
  console.log(`Files with issues: ${results.length}`);
  console.log(`Total patterns: ${results.reduce((sum, r) => sum + r.matches.reduce((s, m) => s + m.count, 0), 0)}`);
  console.log('');
  console.log('🔴 High priority patterns:');
  const highCount = results.filter(r => r.matches.some(m => m.severity === 'high')).length;
  console.log(`   ${highCount} files need fromPromise type extraction`);
  console.log('');
  console.log('📖 View full report:');
  console.log(`   ${latestPath}`);
  console.log('');
  console.log('🔄 Next: Run pattern ingestion to enable RAG-enhanced fixes');
  console.log('   node scripts/phase89-ingest-xstate-patterns.mjs');
}

main().catch(error => {
  console.error('❌ Scan failed:', error);
  process.exit(1);
});
