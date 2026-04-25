#!/usr/bin/env node
/**
 * Error-Brain Diff Dry-Run Script
 *
 * Generates diffs for proposed fixes without applying them.
 * Writes to reports/patches/<stamp>/<safeFile>.diff
 *
 * Usage:
 *   node scripts/error-brain-diff-dryrun.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

// Import diff generator (adjust path as needed)
const { DiffGenerator } = await import('../src/lib/services/error-analysis/diffs/DiffGenerator.js');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.join(repoRoot, 'reports', 'patches', stamp);

fs.mkdirSync(outputDir, { recursive: true });

console.log(`\n🧪 Error-Brain Diff Dry-Run`);
console.log(`📁 Output: ${outputDir}\n`);

const generator = new DiffGenerator(repoRoot);

// Example: Generate a diff for a proposed fix
const proposals = [
  {
    filePath: 'sveltekit-frontend/src/lib/ui/SentencingWorksheet.svelte',
    afterText: `<script lang="ts">
  // Example fix: convert to $state
  let offenseLevel = $state(24);
  let criminalHistory = $state(3);
</script>`,
    reason: 'Convert mutable state to $state() for Svelte 5 runes',
    confidence: 0.9,
  },
];

let successCount = 0;
let errorCount = 0;

for (const proposal of proposals) {
  try {
    const patch = generator.createPatchCandidate({
      runId: `dryrun-${stamp}`,
      filePath: proposal.filePath,
      afterText: proposal.afterText,
      reason: proposal.reason,
      confidence: proposal.confidence,
    });

    // Write diff to file
    const safeName = proposal.filePath.replace(/[\/\\:]/g, '__');
    const diffPath = path.join(outputDir, `${safeName}.diff`);
    fs.writeFileSync(diffPath, patch.diffText, 'utf8');

    // Write metadata
    const metaPath = path.join(outputDir, `${safeName}.meta.json`);
    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          runId: patch.runId,
          filePath: patch.filePath,
          reason: patch.reason,
          confidence: patch.confidence,
          beforeSha256: patch.beforeSha256,
          afterSha256: patch.afterSha256,
          contextLines: patch.contextLines,
          createdAt: patch.createdAt,
        },
        null,
        2
      ),
      'utf8'
    );

    console.log(`✅ ${proposal.filePath}`);
    console.log(`   Confidence: ${(proposal.confidence * 100).toFixed(0)}%`);
    console.log(`   Reason: ${proposal.reason}`);
    console.log(`   Diff: ${diffPath}`);
    console.log();

    successCount++;
  } catch (error) {
    console.error(`❌ ${proposal.filePath}`);
    console.error(`   Error: ${error.message}`);
    console.log();
    errorCount++;
  }
}

// Write summary
const summaryPath = path.join(outputDir, 'summary.json');
fs.writeFileSync(
  summaryPath,
  JSON.stringify(
    {
      stamp,
      mode: 'dry-run',
      successCount,
      errorCount,
      totalProposals: proposals.length,
      outputDir,
    },
    null,
    2
  ),
  'utf8'
);

console.log(`\n📊 Summary:`);
console.log(`   ✅ Success: ${successCount}`);
console.log(`   ❌ Errors: ${errorCount}`);
console.log(`   📄 Total: ${proposals.length}`);
console.log(`\n💾 Output: ${outputDir}\n`);

process.exit(errorCount > 0 ? 1 : 0);
