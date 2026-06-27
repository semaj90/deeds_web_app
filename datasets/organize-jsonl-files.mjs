#!/usr/bin/env node
/**
 * organize-jsonl-files.mjs — Organize 1000+ JSONL files into datasets/
 *
 * Categories:
 * - training-pairs: SFT/DPO training data
 * - embeddings: Pre-computed vector data
 * - traces: Execution traces & telemetry
 * - rag-metrics: RAG evaluation metrics
 * - atlas: Packet snapshots & state
 * - opencode: ACE packet registry
 * - audit: AST analysis & temporary results
 *
 * Usage:
 *   npm run dataset:organize (dry-run)
 *   npm run dataset:organize:apply (execute)
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const CATEGORIES = {
  'training-pairs': [
    /training.?pairs/i,
    /sft/i,
    /dpo/i,
    /summaries\.jsonl$/,
    /enriched.?ledger/i,
    /cluster.?summar/i,
  ],
  embeddings: [
    /embedding/i,
    /vector/i,
    /\.embeddings\.jsonl$/,
  ],
  traces: [
    /trace/i,
    /telemetry/i,
    /\.log\.ndjson$/,
    /outcomes?/i,
    /checkpoint/i,
  ],
  'rag-metrics': [
    /rag.?metric/i,
    /chunk/i,
    /retrieval/i,
  ],
  atlas: [
    /atlas/i,
    /addressable.?packet/i,
    /snapshot/i,
    /temporal/i,
    /graph.?edge/i,
    /node.?author/i,
  ],
  opencode: [
    /ace.?packet/i,
    /gemma4.?candid/i,
    /recommendation/i,
    /outcome.?ledger/i,
    /card/i,
  ],
  audit: [
    /ast./i,
    /analysis/i,
    /unresolved/i,
    /import.?edge/i,
  ],
};

/**
 * Categorize a file by checking patterns
 */
function categorizeFile(fileName) {
  for (const [category, patterns] of Object.entries(CATEGORIES)) {
    for (const pattern of patterns) {
      if (pattern.test(fileName)) {
        return category;
      }
    }
  }
  return 'uncategorized';
}

/**
 * Find all JSONL/NDJSON files (excluding worktrees)
 */
async function findJsonlFiles() {
  try {
    const { stdout } = await execAsync(
      `find . -path './.claude/worktrees' -prune -o \\( -name "*.jsonl" -o -name "*.ndjson" \\) -print 2>/dev/null | grep -v ".claude/worktrees"`
    );
    return stdout
      .trim()
      .split('\n')
      .filter((f) => f && !f.includes('.claude/worktrees'));
  } catch (err) {
    console.error('Error finding files:', err);
    return [];
  }
}

/**
 * Get file size in bytes
 */
async function getFileSize(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

/**
 * Generate organization report
 */
async function generateReport(files) {
  const report = {
    timestamp: new Date().toISOString(),
    total_files: files.length,
    by_category: {},
    by_category_size: {},
    uncategorized: [],
  };

  for (const file of files) {
    const category = categorizeFile(path.basename(file));
    const size = await getFileSize(file);

    report.by_category[category] = (report.by_category[category] || 0) + 1;
    report.by_category_size[category] = (report.by_category_size[category] || 0) + size;

    if (category === 'uncategorized') {
      report.uncategorized.push(file);
    }
  }

  return report;
}

/**
 * Plan moves (dry-run output)
 */
async function planMoves(files) {
  const moves = {};

  for (const file of files) {
    const category = categorizeFile(path.basename(file));
    const destDir = `datasets/${category}`;
    const destFile = path.join(destDir, path.basename(file));

    if (!moves[category]) {
      moves[category] = [];
    }
    moves[category].push({ src: file, dest: destFile });
  }

  return moves;
}

/**
 * Execute moves (requires --apply flag)
 */
async function executeMoves(moves, dryRun = true) {
  const results = {
    success: 0,
    failure: 0,
    errors: [],
  };

  for (const [category, fileMoves] of Object.entries(moves)) {
    const destDir = `datasets/${category}`;

    // Ensure directory exists
    if (!dryRun) {
      try {
        await fs.mkdir(destDir, { recursive: true });
      } catch (err) {
        console.error(`Failed to create ${destDir}:`, err);
        results.errors.push(`mkdir ${destDir}: ${err.message}`);
        continue;
      }
    }

    // Move files
    for (const { src, dest } of fileMoves) {
      if (dryRun) {
        console.log(`  mv ${src} ${dest}`);
      } else {
        try {
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.rename(src, dest);
          results.success++;
        } catch (err) {
          results.failure++;
          results.errors.push(`mv ${src}: ${err.message}`);
        }
      }
    }
  }

  return results;
}

/**
 * Main
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');

  console.log(
    `\n🔍 Scanning for JSONL/NDJSON files (excluding worktrees)...`
  );
  const files = await findJsonlFiles();
  console.log(`✅ Found ${files.length} files\n`);

  console.log('📊 Generating report...');
  const report = await generateReport(files);
  console.log(
    `\nSummary by category:`
  );
  for (const [category, count] of Object.entries(report.by_category)) {
    const sizeKb = (report.by_category_size[category] / 1024).toFixed(1);
    console.log(
      `  ${category.padEnd(20)} ${count.toString().padStart(4)} files (${sizeKb} KB)`
    );
  }

  console.log(`\n📋 Planning moves...`);
  const moves = await planMoves(files);

  if (dryRun) {
    console.log(
      `\n(DRY-RUN mode — use --apply to execute)\n`
    );
  }

  for (const [category, fileMoves] of Object.entries(moves)) {
    console.log(`\n${category} (${fileMoves.length} files):`);
    for (const { src, dest } of fileMoves.slice(0, 3)) {
      console.log(`  ${src} → ${dest}`);
    }
    if (fileMoves.length > 3) {
      console.log(`  ... and ${fileMoves.length - 3} more`);
    }
  }

  if (!dryRun) {
    console.log(`\n⚙️  Executing moves...`);
    const results = await executeMoves(moves, false);
    console.log(`\nResults:`);
    console.log(`  ✅ Success: ${results.success}`);
    console.log(`  ❌ Failure: ${results.failure}`);
    if (results.errors.length > 0) {
      console.log(`\nErrors:`);
      for (const err of results.errors.slice(0, 5)) {
        console.log(`  - ${err}`);
      }
      if (results.errors.length > 5) {
        console.log(`  ... and ${results.errors.length - 5} more`);
      }
    }
  }

  // Save report
  const reportPath = 'datasets/JSONL-ORGANIZATION-REPORT.json';
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved to ${reportPath}`);
}

main().catch(console.error);
