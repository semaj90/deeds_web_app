#!/usr/bin/env node
/**
 * Runes Migration Blockers Report
 *
 * Scans for Svelte 4 patterns that block Svelte 5 runes mode:
 * - $: reactive statements
 * - export let (legacy props)
 * - <slot> usage (should be {@render})
 *
 * Outputs: reports/error_<timestamp>_runes-blockers.md
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const reportPath = path.join(__dirname, '..', 'reports', `error_${timestamp}_runes-blockers.md`);

// Ensure reports directory exists
const reportsDir = path.join(__dirname, '..', 'reports');
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

console.log('🔍 Scanning for Svelte 5 runes migration blockers...\n');

const scanPatterns = [
  {
    name: 'Reactive Statements ($:)',
    pattern: /\$:\s/,
    regex: '\\$:\\s',
    severity: 'HIGH',
    fix: 'Replace with $derived(...) or $effect(...)',
  },
  {
    name: 'Legacy Props (export let)',
    pattern: /export let /,
    regex: 'export let ',
    severity: 'HIGH',
    fix: 'Replace with $props() syntax',
  },
  {
    name: 'Legacy Slots (<slot>)',
    pattern: /<slot\s*\/?>/,
    regex: '<slot\\s*/?'>',
    severity: 'MEDIUM',
    fix: 'Replace with {@render children?.()}',
  },
  {
    name: 'State Updates (non-reactive)',
    pattern: /let\s+\w+\s*=\s*\[/,
    regex: 'let\\s+\\w+\\s*=\\s*\\[',
    severity: 'MEDIUM',
    fix: 'Wrap mutable state with $state(...)',
  },
];

const results = {
  totalFiles: 0,
  totalIssues: 0,
  byPattern: {},
  byFile: {},
};

// Scan each pattern
for (const pattern of scanPatterns) {
  console.log(`📊 Scanning: ${pattern.name}...`);

  try {
    const output = execSync(
      `rg -n "${pattern.regex}" src/lib src/routes --type svelte -g "*.svelte" 2>&1`,
      { encoding: 'utf-8', cwd: path.join(__dirname, '..'), maxBuffer: 10 * 1024 * 1024 }
    ).trim();

    if (output && !output.includes('No matches found')) {
      const lines = output.split('\n');
      const matches = [];

      for (const line of lines) {
        const match = line.match(/^([^:]+):(\d+):(.*)/);
        if (match) {
          const [, file, lineNum, content] = match;
          matches.push({ file, lineNum: parseInt(lineNum), content: content.trim() });

          if (!results.byFile[file]) {
            results.byFile[file] = [];
          }
          results.byFile[file].push({
            pattern: pattern.name,
            lineNum,
            content: content.trim(),
            severity: pattern.severity,
            fix: pattern.fix,
          });
        }
      }

      results.byPattern[pattern.name] = {
        count: matches.length,
        severity: pattern.severity,
        fix: pattern.fix,
        matches,
      };
      results.totalIssues += matches.length;
      console.log(`  ✅ Found ${matches.length} occurrences`);
    } else {
      results.byPattern[pattern.name] = { count: 0, severity: pattern.severity, fix: pattern.fix, matches: [] };
      console.log(`  ✅ No occurrences found`);
    }
  } catch (error) {
    // ripgrep returns exit code 1 when no matches found
    if (error.status === 1) {
      results.byPattern[pattern.name] = { count: 0, severity: pattern.severity, fix: pattern.fix, matches: [] };
      console.log(`  ✅ No occurrences found`);
    } else {
      console.error(`  ❌ Error scanning: ${error.message}`);
    }
  }
}

results.totalFiles = Object.keys(results.byFile).length;

// Generate Markdown report
let report = `# Svelte 5 Runes Migration Blockers Report

**Generated**: ${new Date().toISOString()}
**Total Files**: ${results.totalFiles}
**Total Issues**: ${results.totalIssues}

## Summary by Pattern

| Pattern | Count | Severity | Fix |
|---------|-------|----------|-----|
`;

for (const [name, data] of Object.entries(results.byPattern)) {
  const badge = data.severity === 'HIGH' ? '🔴' : data.severity === 'MEDIUM' ? '🟡' : '🟢';
  report += `| ${badge} ${name} | **${data.count}** | ${data.severity} | ${data.fix} |\n`;
}

report += `\n## Issues by File\n\n`;

if (results.totalFiles === 0) {
  report += `✅ **No migration blockers found!** All files are Svelte 5 ready.\n\n`;
} else {
  const sortedFiles = Object.entries(results.byFile).sort((a, b) => b[1].length - a[1].length);

  for (const [file, issues] of sortedFiles) {
    report += `### \`${file}\` (${issues.length} issue${issues.length > 1 ? 's' : ''})\n\n`;

    const highSeverity = issues.filter(i => i.severity === 'HIGH');
    const mediumSeverity = issues.filter(i => i.severity === 'MEDIUM');

    if (highSeverity.length > 0) {
      report += `#### 🔴 High Severity\n\n`;
      for (const issue of highSeverity) {
        report += `- **Line ${issue.lineNum}**: ${issue.pattern}\n`;
        report += `  \`\`\`svelte\n  ${issue.content}\n  \`\`\`\n`;
        report += `  **Fix**: ${issue.fix}\n\n`;
      }
    }

    if (mediumSeverity.length > 0) {
      report += `#### 🟡 Medium Severity\n\n`;
      for (const issue of mediumSeverity) {
        report += `- **Line ${issue.lineNum}**: ${issue.pattern}\n`;
        report += `  \`\`\`svelte\n  ${issue.content}\n  \`\`\`\n`;
        report += `  **Fix**: ${issue.fix}\n\n`;
      }
    }
  }
}

report += `## Next Steps\n\n`;

if (results.totalIssues > 0) {
  report += `1. **Priority**: Fix HIGH severity issues first (blocks compilation)\n`;
  report += `2. **Review**: Check each file for context before applying fixes\n`;
  report += `3. **Test**: Run \`npm run check\` after each fix batch\n`;
  report += `4. **Verify**: Ensure tests pass after migration\n\n`;

  report += `## Quick Fix Commands\n\n`;
  report += `\`\`\`bash\n`;
  report += `# Fix reactive statements\n`;
  report += `rg -l "\\$:\\s" src/lib src/routes --type svelte\n\n`;
  report += `# Fix legacy props\n`;
  report += `rg -l "export let " src/lib src/routes --type svelte\n\n`;
  report += `# Fix slots\n`;
  report += `rg -l "<slot" src/lib src/routes --type svelte\n`;
  report += `\`\`\`\n\n`;
} else {
  report += `✅ No migration blockers found! Your codebase is ready for Svelte 5 runes mode.\n\n`;
}

report += `---\n*Generated by \`scripts/runes-blockers-report.mjs\`*\n`;

// Write report
fs.writeFileSync(reportPath, report, 'utf-8');

console.log(`\n📄 Report saved: ${reportPath}`);
console.log(`\n📊 Summary:`);
console.log(`   Files with issues: ${results.totalFiles}`);
console.log(`   Total issues: ${results.totalIssues}`);

if (results.totalIssues > 0) {
  console.log(`\n🔴 High priority fixes needed!`);
  process.exit(1);
} else {
  console.log(`\n✅ All clear! No blockers found.`);
  process.exit(0);
}
