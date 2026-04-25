#!/usr/bin/env node
/**
 * Phase 80: Error Stratification Engine
 *
 * Parses svelte-check machine output, clusters by signature,
 * ranks by impact, and generates actionable codemod reports.
 *
 * Usage: node scripts/phase80-stratify-errors.mjs [input-file]
 * Default input: svelte-errors-machine.txt
 */

import fs from 'fs/promises';

const INPUT_FILE = process.argv[2] || 'svelte-errors-machine.txt';
const OUTPUT_REPORT = 'phase80-stratification-report.json';

/**
 * Parse a single line of svelte-check machine output.
 * Actual format: TIMESTAMP ERROR "FILE" LINE:COL "MESSAGE"
 * Example: 1766711507096 ERROR "src\\lib\\server\\db\\schema.ts" 1123:14 "Cannot redeclare..."
 */
function parseMachineLine(line) {
  // Match: TIMESTAMP TYPE "FILE" LINE:COL "MESSAGE"
  const match = line.match(/^\d+\s+(ERROR|WARNING)\s+"([^"]+)"\s+(\d+):(\d+)\s+"(.+)"$/);
  if (!match) return null;

  const [, type, file, lineNum, col, message] = match;

  // Extract error code from message if present
  let code = 'unknown';
  if (message.includes('Cannot find name')) code = 'ts(2304)';
  else if (message.includes('is not assignable to type')) code = 'ts(2322)';
  else if (message.includes("';' expected")) code = 'ts(1005)';
  else if (message.includes('Cannot redeclare')) code = 'ts(2451)';
  else if (message.includes('Property or signature expected')) code = 'ts(1131)';
  else if (message.includes('Declaration or statement expected')) code = 'ts(1128)';
  else if (message.includes('export') && message.includes('let')) code = 'svelte(export-let)';
  else if (message.includes('$props')) code = 'svelte($props)';
  else if (message.includes('$derived')) code = 'svelte($derived)';
  else if (message.includes('has no exported member')) code = 'ts(2305)';
  else if (message.includes('Module')) code = 'ts(2307)';
  else if (message.includes('Argument of type')) code = 'ts(2345)';
  else if (message.includes('Property')) code = 'ts(2339)';

  return {
    file: file.replace(/\\\\/g, '/'),  // Normalize path
    line: parseInt(lineNum, 10),
    col: parseInt(col, 10),
    type: type.toLowerCase(),
    code,
    message: message.trim(),
    // Signature for clustering
    signature: `${code}::${normalizeMessage(message)}`
  };
}


/**
 * Normalize error messages for clustering.
 * Strips variable names, paths, and specific identifiers.
 */
function normalizeMessage(msg) {
  return msg
    .replace(/'[^']+'/g, "'X'")      // Replace quoted strings
    .replace(/"[^"]+"/g, '"X"')      // Replace double-quoted strings
    .replace(/\d+/g, 'N')            // Replace numbers
    .replace(/\s+/g, ' ')            // Normalize whitespace
    .substring(0, 100);              // Truncate for clustering
}

async function main() {
  console.log('📊 Phase 80: Error Stratification Engine\n');

  // Read input
  let content;
  try {
    content = await fs.readFile(INPUT_FILE, 'utf-8');
  } catch (e) {
    console.error(`❌ Could not read ${INPUT_FILE}: ${e.message}`);
    console.log('   Run: npx svelte-check --output machine --threshold error > svelte-errors-machine.txt');
    process.exit(1);
  }

  const lines = content.split('\n').filter(l => l.trim());
  console.log(`   📥 Read ${lines.length} lines from ${INPUT_FILE}`);

  // Parse errors
  const errors = lines.map(l => parseMachineLine(l.trim())).filter(Boolean);
  console.log(`   ✅ Parsed ${errors.length} errors\n`);

  // Cluster by signature
  const clusters = new Map();
  const fileStats = new Map();

  for (const err of errors) {
    // Cluster by signature
    if (!clusters.has(err.signature)) {
      clusters.set(err.signature, {
        code: err.code,
        exampleMessage: err.message,
        files: new Set(),
        count: 0
      });
    }
    const cluster = clusters.get(err.signature);
    cluster.count++;
    cluster.files.add(err.file);

    // Track file stats
    if (!fileStats.has(err.file)) {
      fileStats.set(err.file, 0);
    }
    fileStats.set(err.file, fileStats.get(err.file) + 1);
  }

  // Sort clusters by count (descending)
  const sortedClusters = [...clusters.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50);  // Top 50 patterns

  // Sort files by error count
  const sortedFiles = [...fileStats.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);  // Top 30 files

  // Generate report
  const report = {
    generated: new Date().toISOString(),
    totalErrors: errors.length,
    uniquePatterns: clusters.size,
    topPatterns: sortedClusters.map(([sig, data]) => ({
      signature: sig,
      code: data.code,
      exampleMessage: data.exampleMessage,
      count: data.count,
      filesAffected: data.files.size,
      impactScore: data.count * data.files.size  // Higher = more impactful to fix
    })),
    topFiles: sortedFiles.map(([file, count]) => ({ file, errorCount: count })),
    codemodOpportunities: identifyCodemodOpportunities(sortedClusters)
  };

  // Write report
  await fs.writeFile(OUTPUT_REPORT, JSON.stringify(report, null, 2));
  console.log(`   💾 Wrote report to ${OUTPUT_REPORT}\n`);

  // Display summary
  console.log('🔥 TOP 10 ERROR PATTERNS (by impact):');
  console.log('─'.repeat(80));
  report.topPatterns.slice(0, 10).forEach((p, i) => {
    console.log(`${i + 1}. [${p.code}] (${p.count} errors, ${p.filesAffected} files)`);
    console.log(`   "${p.exampleMessage.substring(0, 70)}..."`);
    console.log('');
  });

  console.log('📁 TOP 10 BROKEN FILES:');
  console.log('─'.repeat(80));
  report.topFiles.slice(0, 10).forEach((f, i) => {
    console.log(`${i + 1}. ${f.file} (${f.errorCount} errors)`);
  });

  console.log('\n🛠️ CODEMOD OPPORTUNITIES:');
  console.log('─'.repeat(80));
  report.codemodOpportunities.forEach(opp => {
    console.log(`   • ${opp.description} (${opp.estimatedFixes} fixes)`);
  });

  console.log('\n✅ Stratification complete. Feed this to embeddinggemma for pattern learning.');
}

/**
 * Identify patterns that can be fixed with automated codemods.
 */
function identifyCodemodOpportunities(clusters) {
  const opportunities = [];

  for (const [sig, data] of clusters) {
    // Svelte 5 migration patterns
    if (data.code.includes('svelte') && data.exampleMessage.includes('$props')) {
      opportunities.push({
        type: 'svelte5-props',
        description: 'Migrate export let to $props()',
        signature: sig,
        estimatedFixes: data.count
      });
    }
    if (data.exampleMessage.includes('$derived') || data.exampleMessage.includes('$:')) {
      opportunities.push({
        type: 'svelte5-derived',
        description: 'Migrate $: to $derived',
        signature: sig,
        estimatedFixes: data.count
      });
    }
    // TypeScript patterns
    if (data.code === 'ts(2304)' || data.code === 'ts(2305)') {
      opportunities.push({
        type: 'missing-import',
        description: 'Add missing imports',
        signature: sig,
        estimatedFixes: data.count
      });
    }
    if (data.code === 'ts(2345)' || data.code === 'ts(2322)') {
      opportunities.push({
        type: 'type-mismatch',
        description: 'Fix type mismatches',
        signature: sig,
        estimatedFixes: data.count
      });
    }
  }

  return opportunities.slice(0, 10);  // Top 10 opportunities
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
