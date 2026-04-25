#!/usr/bin/env node
/**
 * 🔧 Phase 74.1c: Complete Import Fixer
 *
 * Fixes ALL 10 files with missing imports from Phase 74 route inventory
 * Handles both UI components and custom app components
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';

// Complete mapping from Phase 74 route inventory
const IMPORT_FIXES = {
  'src/routes/(app)/evidence-library/+page.svelte': [
    "import EvidenceFilters from '$lib/components/yorha/evidence/EvidenceFilters.svelte';",
    "import EvidenceGrid from '$lib/components/yorha/evidence/EvidenceGrid.svelte';",
    "import EvidenceStats from '$lib/components/yorha/evidence/EvidenceStats.svelte';",
    "import UploadZone from '$lib/components/yorha/evidence/UploadZone.svelte';"
  ],
  'src/routes/(app)/active-cases/+page.svelte': [
    "import CaseFilters from '$lib/components/yorha/cases/CaseFilters.svelte';",
    "import CasesList from '$lib/components/yorha/cases/CasesList.svelte';",
    "import CaseStats from '$lib/components/yorha/cases/CaseStats.svelte';"
  ],
  'src/routes/(app)/persons-of-interest/create/+page.svelte': [
    "import POIForm from '$lib/components/poi/POIForm.svelte';"
  ],
  'src/routes/(app)/evidence/manage/+page.svelte': [
    "import EvidenceFilesManager from '$lib/components/evidence/EvidenceFilesManager.svelte';"
  ],
  'src/routes/(app)/evidence/analyze/+page.svelte': [
    "import { DialogHeader } from '$lib/components/ui/dialog';",
    "import { DialogFooter } from '$lib/components/ui/dialog';",
    "import Button from '$lib/components/ui/button/button.svelte';",
    "import { Input } from '$lib/components/ui/input';",
    "import { Label } from '$lib/components/ui/label';",
    "import { Progress } from '$lib/components/ui/progress';"
  ],
  'src/routes/(app)/cases/[id]/+page.svelte': [
    "import CaseNotesEditor from '$lib/components/cases/CaseNotesEditor.svelte';",
    "import ContextualChatModal from '$lib/components/cases/ContextualChatModal.svelte';",
    "import EvidenceUploadPreview from '$lib/components/evidence/EvidenceUploadPreview.svelte';",
    "import SummaryReviewPanel from '$lib/components/evidence/SummaryReviewPanel.svelte';",
    "import NesModal from '$lib/components/nes/NesModal.svelte';"
  ],
  'src/routes/(app)/phase78/routes/[routePath]/+page.svelte': [
    "import ErrorEventsList from '$lib/components/phase78/ErrorEventsList.svelte';",
    "import SuggestionsList from '$lib/components/phase78/SuggestionsList.svelte';",
    "// Note: schema import may need adjustment based on actual file location"
  ],
  'src/routes/(app)/cases/[id]/chat/+page.svelte': [
    "import CaseChatPanel from '$lib/components/legal-ai/CaseChatPanel.svelte';",
    "import LegalAILayout from '$lib/components/legal-ai/LegalAILayout.svelte';"
  ],
  'src/routes/(app)/cases/[id]/board/+page.svelte': [
    "import CanvasBoard from '$lib/components/board/CanvasBoard.svelte';"
  ],
  'src/routes/+layout.svelte': [
    "import CommandCenterNav from '$lib/components/yorha/CommandCenterNav.svelte';",
    "import SystemStatus from '$lib/components/yorha/SystemStatus.svelte';"
  ]
};

async function applyCompleteFixes() {
  console.log(chalk.bold.cyan('\n🔧 Phase 74.1c: Complete Import Fixer\n'));
  console.log(chalk.gray(`Fixing ${Object.keys(IMPORT_FIXES).length} files with missing imports...\n`));

  const autoFix = process.argv.includes('--apply');
  const results = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    details: []
  };

  for (const [filePath, imports] of Object.entries(IMPORT_FIXES)) {
    results.attempted++;

    try {
      // Check if file exists
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      if (!exists) {
        console.log(chalk.yellow(`⚠️  ${filePath} - File not found, skipping`));
        results.skipped++;
        results.details.push({ file: filePath, status: 'skipped', reason: 'File not found' });
        continue;
      }

      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      // Check which imports are already present
      const missingImports = imports.filter(imp => {
        // Skip comments
        if (imp.startsWith('//')) return false;
        // Check if import already exists
        return !content.includes(imp.split('from')[0].trim());
      });

      if (missingImports.length === 0) {
        console.log(chalk.green(`✓ ${path.relative(process.cwd(), filePath)} - All imports already present`));
        results.succeeded++;
        results.details.push({ file: filePath, status: 'already-fixed', imports: [] });
        continue;
      }

      if (autoFix) {
        // Find script tag or create one
        const scriptIndex = lines.findIndex(l => l.trim().startsWith('<script'));

        if (scriptIndex >= 0) {
          // Insert after <script> tag
          const insertIndex = scriptIndex + 1;
          missingImports.forEach(imp => {
            lines.splice(insertIndex, 0, `  ${imp}`);
          });
        } else {
          // No script tag, create one at the top
          const moduleScript = [
            '<script>',
            ...missingImports.map(imp => `  ${imp}`),
            '</script>',
            ''
          ];
          lines.unshift(...moduleScript);
        }

        // Write back to file
        await fs.writeFile(filePath, lines.join('\n'));
        console.log(chalk.green(`✓ ${path.relative(process.cwd(), filePath)} - Added ${missingImports.length} imports`));
        results.succeeded++;
        results.details.push({
          file: filePath,
          status: 'fixed',
          imports: missingImports
        });
      } else {
        console.log(chalk.yellow(`⚠️  ${path.relative(process.cwd(), filePath)} - ${missingImports.length} imports needed`));
        results.details.push({
          file: filePath,
          status: 'needs-fix',
          imports: missingImports
        });
      }

    } catch (err) {
      console.log(chalk.red(`✗ ${path.relative(process.cwd(), filePath)} - Error: ${err.message}`));
      results.failed++;
      results.details.push({ file: filePath, status: 'error', error: err.message });
    }
  }

  // Generate report
  await fs.mkdir('reports/phase74', { recursive: true });
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: results.attempted,
      succeeded: results.succeeded,
      failed: results.failed,
      skipped: results.skipped,
      mode: autoFix ? 'auto-fix' : 'dry-run'
    },
    details: results.details
  };

  await fs.writeFile(
    'reports/phase74/complete-import-fix-report.json',
    JSON.stringify(report, null, 2)
  );

  // Summary
  console.log(chalk.cyan('\n📊 Summary:\n'));
  console.log(chalk.gray(`   Files attempted:  ${results.attempted}`));
  console.log(chalk.green(`   Succeeded:        ${results.succeeded}`));
  console.log(chalk.red(`   Failed:           ${results.failed}`));
  console.log(chalk.yellow(`   Skipped:          ${results.skipped}`));

  console.log(chalk.green(`\n✅ Report saved: reports/phase74/complete-import-fix-report.json`));

  if (autoFix) {
    console.log(chalk.bold.green(`\n✅ Applied fixes to ${results.succeeded} files!`));
  } else {
    const needsFix = results.details.filter(d => d.status === 'needs-fix').length;
    if (needsFix > 0) {
      console.log(chalk.yellow(`\n💡 Run with --apply to fix ${needsFix} files`));
    }
  }
}

applyCompleteFixes().catch(err => {
  console.error(chalk.red(`\n❌ Error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
