#!/usr/bin/env node
/**
 * 🚀 Phase 74.1b: Quick Import Fixer
 *
 * Fast grep-based approach for the 10 known missing imports
 * Uses pattern matching instead of full AST analysis
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';

// Known missing imports from Phase 74 analysis
const KNOWN_ISSUES = [
  { pattern: /(?<!import.*)\bButton\b/, fix: "import Button from '$lib/components/ui/button/button.svelte';" },
  { pattern: /(?<!import.*)\bCard\b/, fix: "import { Card } from '$lib/components/ui/card';" },
  { pattern: /(?<!import.*)\bInput\b/, fix: "import { Input } from '$lib/components/ui/input';" },
  { pattern: /(?<!import.*)\bLabel\b/, fix: "import { Label } from '$lib/components/ui/label';" },
  { pattern: /(?<!import.*)\bTextarea\b/, fix: "import { Textarea } from '$lib/components/ui/textarea';" },
  { pattern: /(?<!import.*)\bTooltip\b/, fix: "import { Tooltip } from '$lib/components/ui/tooltip';" },
  { pattern: /(?<!import.*)\bBadge\b/, fix: "import { Badge } from '$lib/components/ui/badge';" },
  { pattern: /(?<!import.*)\bAvatar\b/, fix: "import { Avatar } from '$lib/components/ui/avatar';" },
];

async function quickFix() {
  console.log(chalk.bold.cyan('\n🚀 Phase 74.1b: Quick Import Fixer\n'));

  // Find all route files
  const files = await glob('src/routes/**/*.{svelte,ts}');
  console.log(chalk.gray(`📁 Scanning ${files.length} route files...\n`));

  const fixes = [];
  const autoFix = process.argv.includes('--apply');

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    const lines = content.split('\n');

    // Check for missing imports
    for (const { pattern, fix } of KNOWN_ISSUES) {
      // Check if component is used but not imported
      const componentUsed = pattern.test(content);
      const alreadyImported = content.includes(fix);

      if (componentUsed && !alreadyImported) {
        fixes.push({ file, component: fix.match(/import.*from/)?.[0] || fix, fix });

        if (autoFix) {
          // Find script tag or create one
          const scriptIndex = lines.findIndex(l => l.includes('<script'));
          if (scriptIndex >= 0) {
            lines.splice(scriptIndex + 1, 0, `  ${fix}`);
          } else {
            lines.unshift('<script>', `  ${fix}`, '</script>', '');
          }
        }
      }
    }

    // Write fixes if --apply flag
    if (autoFix && fixes.some(f => f.file === file)) {
      await fs.writeFile(file, lines.join('\n'));
    }
  }

  // Generate report
  console.log(chalk.cyan('📊 Results:\n'));
  console.log(chalk.yellow(`   Files with issues: ${new Set(fixes.map(f => f.file)).size}`));
  console.log(chalk.red(`   Missing imports: ${fixes.length}`));

  if (fixes.length > 0) {
    console.log(chalk.cyan('\n🔍 Details:\n'));
    const grouped = fixes.reduce((acc, f) => {
      if (!acc[f.file]) acc[f.file] = [];
      acc[f.file].push(f.component);
      return acc;
    }, {});

    Object.entries(grouped).slice(0, 10).forEach(([file, comps]) => {
      console.log(chalk.yellow(`   ${path.relative(process.cwd(), file)}:`));
      comps.forEach(c => console.log(chalk.gray(`      • ${c}`)));
    });

    if (Object.keys(grouped).length > 10) {
      console.log(chalk.gray(`   ... and ${Object.keys(grouped).length - 10} more files`));
    }
  }

  // Save report
  await fs.mkdir('reports/phase74', { recursive: true });
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: files.length,
      filesWithIssues: new Set(fixes.map(f => f.file)).size,
      totalMissingImports: fixes.length,
      fixableImports: fixes.length,
    },
    issues: Array.from(new Set(fixes.map(f => f.file))).map(file => ({
      file: path.relative(process.cwd(), file),
      missingImports: fixes.filter(f => f.file === file).map(f => f.component),
    })),
    fixes: fixes.map(f => ({
      file: path.relative(process.cwd(), f.file),
      import: f.fix,
    })),
  };

  await fs.writeFile(
    'reports/phase74/quick-import-fix-report.json',
    JSON.stringify(report, null, 2)
  );

  console.log(chalk.green(`\n✅ Report saved: reports/phase74/quick-import-fix-report.json`));

  if (autoFix) {
    console.log(chalk.bold.green(`\n✅ Applied ${fixes.length} fixes!`));
  } else {
    console.log(chalk.yellow(`\n💡 Run with --apply to auto-fix ${fixes.length} imports`));
  }
}

quickFix().catch(err => {
  console.error(chalk.red(`\n❌ Error: ${err.message}`));
  process.exit(1);
});
