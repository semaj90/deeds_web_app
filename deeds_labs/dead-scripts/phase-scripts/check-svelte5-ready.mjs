#!/usr/bin/env node
/**
 * Svelte 5 Migration Readiness Checker
 *
 * Analyzes backup files to determine if current versions are Svelte 5 compatible
 * before deleting legacy backups.
 *
 * Usage:
 *   node scripts/check-svelte5-ready.mjs
 *   node scripts/check-svelte5-ready.mjs --file src/lib/components/MyComponent.svelte
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Svelte 4 patterns (legacy)
const svelte4Patterns = [
  { pattern: /export\s+let\s+\w+/, name: 'export let (props)' },
  { pattern: /\$:\s*\w+\s*=/, name: 'reactive statements ($:)' },
  { pattern: /on:\w+=/, name: 'on:event handlers' },
  { pattern: /bind:this=/, name: 'bind:this' },
  { pattern: /new\s+\w+Component\(/, name: 'new Component()' },
  { pattern: /createEventDispatcher/, name: 'createEventDispatcher' },
];

// Svelte 5 patterns (modern)
const svelte5Patterns = [
  { pattern: /\$props\(\)/, name: '$props()' },
  { pattern: /\$state\(/, name: '$state()' },
  { pattern: /\$derived\(/, name: '$derived()' },
  { pattern: /\$effect\(/, name: '$effect()' },
  { pattern: /let\s+\{\s*\w+.*\}\s*=\s*\$props\(/, name: 'destructured $props()' },
  { pattern: /onclick=\{/, name: 'onclick={} (Svelte 5 style)' },
  { pattern: /\$bindable\(/, name: '$bindable()' },
];

// Code quality patterns
const qualityPatterns = [
  { pattern: /@ts-ignore/, name: '@ts-ignore', severity: 'warning' },
  { pattern: /@ts-expect-error/, name: '@ts-expect-error', severity: 'warning' },
  { pattern: /\/\/ TODO:/, name: 'TODO comments', severity: 'info' },
  { pattern: /console\.log\(/, name: 'console.log', severity: 'info' },
  { pattern: /debugger;/, name: 'debugger statements', severity: 'warning' },
];

function analyzeSvelteFile(filePath, content) {
  const results = {
    file: relative(rootDir, filePath),
    svelte4Features: [],
    svelte5Features: [],
    qualityIssues: [],
    version: 'UNKNOWN',
    migratable: false,
    recommendation: 'REVIEW',
  };

  // Detect Svelte 4 patterns
  svelte4Patterns.forEach(({ pattern, name }) => {
    if (pattern.test(content)) {
      results.svelte4Features.push(name);
    }
  });

  // Detect Svelte 5 patterns
  svelte5Patterns.forEach(({ pattern, name }) => {
    if (pattern.test(content)) {
      results.svelte5Features.push(name);
    }
  });

  // Detect quality issues
  qualityPatterns.forEach(({ pattern, name, severity }) => {
    const matches = content.match(new RegExp(pattern, 'g'));
    if (matches) {
      results.qualityIssues.push({ name, count: matches.length, severity });
    }
  });

  // Determine version
  const hasSvelte4 = results.svelte4Features.length > 0;
  const hasSvelte5 = results.svelte5Features.length > 0;

  if (hasSvelte5 && !hasSvelte4) {
    results.version = 'SVELTE_5';
    results.migratable = false; // Already migrated
    results.recommendation = 'KEEP_CURRENT';
  } else if (hasSvelte4 && !hasSvelte5) {
    results.version = 'SVELTE_4';
    results.migratable = true; // Can be migrated
    results.recommendation = 'NEEDS_MIGRATION';
  } else if (hasSvelte5 && hasSvelte4) {
    results.version = 'HYBRID';
    results.migratable = false; // Mixed state, needs manual review
    results.recommendation = 'MANUAL_REVIEW';
  } else {
    results.version = 'UNKNOWN';
    results.migratable = false;
    results.recommendation = 'MANUAL_REVIEW';
  }

  // Override if quality issues are severe
  const hasTypeSuppressions = results.qualityIssues.some(
    issue => issue.name.includes('@ts-') && issue.count > 5
  );
  if (hasTypeSuppressions) {
    results.recommendation = 'MANUAL_REVIEW';
  }

  return results;
}

function analyzeTypeScriptFile(filePath, content) {
  const results = {
    file: relative(rootDir, filePath),
    qualityIssues: [],
    recommendation: 'REVIEW',
  };

  // Detect quality issues
  qualityPatterns.forEach(({ pattern, name, severity }) => {
    const matches = content.match(new RegExp(pattern, 'g'));
    if (matches) {
      results.qualityIssues.push({ name, count: matches.length, severity });
    }
  });

  // TypeScript-specific checks
  const hasImportErrors = /import.*from ['"]@\//.test(content); // Wrong alias
  const hasAnyTypes = /:\s*any(?:\s|,|;|\))/g.test(content);

  if (hasImportErrors) {
    results.qualityIssues.push({ name: 'Wrong import alias (@/)', count: 1, severity: 'warning' });
  }

  if (hasAnyTypes) {
    const count = (content.match(/:\s*any(?:\s|,|;|\))/g) || []).length;
    results.qualityIssues.push({ name: 'any types', count, severity: 'info' });
  }

  // Determine recommendation
  const hasWarnings = results.qualityIssues.some(i => i.severity === 'warning');
  results.recommendation = hasWarnings ? 'MANUAL_REVIEW' : 'LIKELY_SAFE';

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const singleFile = args.find(arg => arg.startsWith('--file='))?.replace('--file=', '');

  console.log('🔍 Svelte 5 Migration Readiness Checker');
  console.log('═'.repeat(60));

  // Load CSV
  const csvPath = resolve(rootDir, 'reports', 'backup-analysis.csv');
  if (!existsSync(csvPath)) {
    console.error('❌ Error: reports/backup-analysis.csv not found!');
    console.error('   Run: node scripts/analyze-backups.mjs');
    process.exit(1);
  }

  const csvContent = readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').slice(1).filter(Boolean); // Skip header

  // Parse CSV manually (simple approach)
  const backupFiles = lines.map(line => {
    const [backupPath, currentPath, exists, recommendation] = line.split(',');
    return { backupPath, currentPath, exists, recommendation };
  }).filter(item =>
    item.recommendation === 'DELETE_BACKUP' &&
    (item.currentPath.endsWith('.svelte') || item.currentPath.endsWith('.ts'))
  );

  console.log(`📊 Found ${backupFiles.length} backup files to analyze\n`);

  const results = {
    svelte5_ready: [],
    svelte4_needs_migration: [],
    hybrid_manual_review: [],
    typescript_likely_safe: [],
    typescript_manual_review: [],
  };

  let analyzed = 0;
  for (const item of backupFiles) {
    const currentPath = resolve(rootDir, item.currentPath.trim());

    if (!existsSync(currentPath)) {
      continue; // Current file doesn't exist, skip
    }

    const content = readFileSync(currentPath, 'utf-8');

    if (currentPath.endsWith('.svelte')) {
      const analysis = analyzeSvelteFile(currentPath, content);

      if (analysis.version === 'SVELTE_5') {
        results.svelte5_ready.push(analysis);
      } else if (analysis.version === 'SVELTE_4') {
        results.svelte4_needs_migration.push(analysis);
      } else {
        results.hybrid_manual_review.push(analysis);
      }
    } else if (currentPath.endsWith('.ts')) {
      const analysis = analyzeTypeScriptFile(currentPath, content);

      if (analysis.recommendation === 'LIKELY_SAFE') {
        results.typescript_likely_safe.push(analysis);
      } else {
        results.typescript_manual_review.push(analysis);
      }
    }

    analyzed++;
    if (analyzed % 50 === 0) {
      console.log(`   Analyzed ${analyzed}/${backupFiles.length} files...`);
    }
  }

  console.log(`\n✅ Analysis complete! Processed ${analyzed} files\n`);

  // Summary
  console.log('📊 Summary:');
  console.log('═'.repeat(60));
  console.log(`\nSvelte Components:`);
  console.log(`   ✅ Svelte 5 (current good, safe to delete backup): ${results.svelte5_ready.length}`);
  console.log(`   ⚠️  Svelte 4 (needs migration before deletion): ${results.svelte4_needs_migration.length}`);
  console.log(`   👀 Hybrid/Unknown (manual review): ${results.hybrid_manual_review.length}`);

  console.log(`\nTypeScript Files:`);
  console.log(`   ✅ Likely safe to delete backup: ${results.typescript_likely_safe.length}`);
  console.log(`   👀 Manual review needed: ${results.typescript_manual_review.length}`);

  // Generate detailed report
  const reportPath = resolve(rootDir, 'reports', 'svelte5-migration-analysis.md');
  let report = `# Svelte 5 Migration Analysis\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;
  report += `---\n\n`;

  report += `## Summary\n\n`;
  report += `| Category | Count | Action |\n`;
  report += `|----------|-------|--------|\n`;
  report += `| Svelte 5 (ready) | ${results.svelte5_ready.length} | Safe to delete backups |\n`;
  report += `| Svelte 4 (legacy) | ${results.svelte4_needs_migration.length} | Migrate before deletion |\n`;
  report += `| Hybrid/Unknown | ${results.hybrid_manual_review.length} | Manual review required |\n`;
  report += `| TypeScript (safe) | ${results.typescript_likely_safe.length} | Safe to delete backups |\n`;
  report += `| TypeScript (review) | ${results.typescript_manual_review.length} | Manual review required |\n\n`;

  // Svelte 5 Ready (safe to delete)
  if (results.svelte5_ready.length > 0) {
    report += `## ✅ Svelte 5 Ready (${results.svelte5_ready.length} files)\n\n`;
    report += `**Action:** Safe to delete backup files. Current versions use Svelte 5 runes.\n\n`;
    results.svelte5_ready.forEach(r => {
      report += `### ${r.file}\n`;
      report += `- **Version:** ${r.version}\n`;
      report += `- **Svelte 5 Features:** ${r.svelte5Features.join(', ')}\n`;
      if (r.qualityIssues.length > 0) {
        report += `- **Quality Issues:** ${r.qualityIssues.map(i => `${i.name} (${i.count})`).join(', ')}\n`;
      }
      report += `\n`;
    });
  }

  // Svelte 4 (needs migration)
  if (results.svelte4_needs_migration.length > 0) {
    report += `## ⚠️ Svelte 4 Legacy (${results.svelte4_needs_migration.length} files)\n\n`;
    report += `**Action:** Migrate to Svelte 5 before deleting backups.\n\n`;
    results.svelte4_needs_migration.slice(0, 20).forEach(r => {
      report += `### ${r.file}\n`;
      report += `- **Version:** ${r.version}\n`;
      report += `- **Svelte 4 Features:** ${r.svelte4Features.join(', ')}\n`;
      if (r.qualityIssues.length > 0) {
        report += `- **Quality Issues:** ${r.qualityIssues.map(i => `${i.name} (${i.count})`).join(', ')}\n`;
      }
      report += `\n`;
    });
    if (results.svelte4_needs_migration.length > 20) {
      report += `\n... and ${results.svelte4_needs_migration.length - 20} more files\n\n`;
    }
  }

  // Hybrid/Unknown (manual review)
  if (results.hybrid_manual_review.length > 0) {
    report += `## 👀 Manual Review Required (${results.hybrid_manual_review.length} files)\n\n`;
    report += `**Action:** Review each file individually. Mixed Svelte 4/5 patterns detected.\n\n`;
    results.hybrid_manual_review.forEach(r => {
      report += `### ${r.file}\n`;
      report += `- **Version:** ${r.version}\n`;
      if (r.svelte4Features.length > 0) {
        report += `- **Svelte 4 Features:** ${r.svelte4Features.join(', ')}\n`;
      }
      if (r.svelte5Features.length > 0) {
        report += `- **Svelte 5 Features:** ${r.svelte5Features.join(', ')}\n`;
      }
      if (r.qualityIssues.length > 0) {
        report += `- **Quality Issues:** ${r.qualityIssues.map(i => `${i.name} (${i.count})`).join(', ')}\n`;
      }
      report += `\n`;
    });
  }

  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\n📄 Detailed report saved to: ${relative(rootDir, reportPath)}`);

  // Generate safe-to-delete list
  const safeToDelete = [
    ...results.svelte5_ready.map(r => r.file),
    ...results.typescript_likely_safe.map(r => r.file),
  ];

  if (safeToDelete.length > 0) {
    const safeListPath = resolve(rootDir, 'reports', 'safe-to-delete-backups.txt');
    const safeList = safeToDelete.map(file => {
      // Find corresponding backup path
      const item = backupFiles.find(b => b.currentPath.trim() === file);
      return item?.backupPath.trim();
    }).filter(Boolean).join('\n');

    writeFileSync(safeListPath, safeList, 'utf-8');
    console.log(`📄 Safe deletion list saved to: ${relative(rootDir, safeListPath)}`);
    console.log(`   (${safeToDelete.length} backup files can be safely deleted)\n`);
  }

  // Next steps
  console.log('🔄 Next Steps:');
  console.log('═'.repeat(60));
  console.log('1. Review the generated report:');
  console.log('   code reports/svelte5-migration-analysis.md');
  console.log('');
  console.log('2. Migrate Svelte 4 files to Svelte 5:');
  console.log('   npx sv migrate svelte-5');
  console.log('');
  console.log('3. Delete safe backups:');
  console.log('   node scripts/delete-safe-backups.mjs');
  console.log('');
}

main().catch(console.error);
