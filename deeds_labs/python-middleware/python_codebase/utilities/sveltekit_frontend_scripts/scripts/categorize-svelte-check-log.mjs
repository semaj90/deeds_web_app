#!/usr/bin/env node
/**
 * Chunked Svelte-Check Log Analyzer
 * 
 * Analyzes large diagnostic logs in manageable chunks (default 10k errors).
 * Strips ANSI codes, normalizes paths/line numbers, and buckets by error message.
 * 
 * Usage:
 *   node scripts/categorize-svelte-check-log.mjs --log <file> [--skip 0] [--limit 10000] [--json]
 * 
 * Examples:
 *   # First 10k errors
 *   node scripts/categorize-svelte-check-log.mjs --log svelte-check.log
 * 
 *   # Next 10k errors
 *   node scripts/categorize-svelte-check-log.mjs --log svelte-check.log --skip 10000
 * 
 *   # Export as JSON for analysis
 *   node scripts/categorize-svelte-check-log.mjs --log svelte-check.log --json > analysis.json
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { argv } from 'process';

// Parse command-line arguments
function parseArgs() {
  const args = {
    log: null,
    skip: 0,
    limit: 10000,
    json: false
  };

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--log' && argv[i + 1]) {
      args.log = argv[++i];
    } else if (argv[i] === '--skip' && argv[i + 1]) {
      args.skip = parseInt(argv[++i], 10);
    } else if (argv[i] === '--limit' && argv[i + 1]) {
      args.limit = parseInt(argv[++i], 10);
    } else if (argv[i] === '--json') {
      args.json = true;
    }
  }

  if (!args.log) {
    console.error('Error: --log parameter is required');
    console.log('\nUsage:');
    console.log('  node scripts/categorize-svelte-check-log.mjs --log <file> [--skip 0] [--limit 10000] [--json]');
    process.exit(1);
  }

  return args;
}

// Strip ANSI color codes
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// Normalize file paths and line numbers
function normalizePath(line) {
  // Remove specific line/column numbers: file.ts:123:45 -> file.ts:LINE:COL
  return line.replace(/\.ts:(\d+):(\d+)/g, '.ts:LINE:COL')
             .replace(/\.svelte:(\d+):(\d+)/g, '.svelte:LINE:COL')
             .replace(/\.js:(\d+):(\d+)/g, '.js:LINE:COL')
             .replace(/\.mjs:(\d+):(\d+)/g, '.mjs:LINE:COL');
}

// Extract error message from diagnostic line
function extractErrorMessage(line) {
  // Common patterns:
  // "Error: ',' expected. (ts)"
  // "Warning: Unused variable 'foo'"
  // "src/file.ts:10:5 - error TS1005: ';' expected."
  
  const cleaned = stripAnsi(line);
  
  // Pattern: "error TS1005: message"
  const tsErrorMatch = cleaned.match(/error TS\d+:\s*(.+?)(?:\s*\(|$)/);
  if (tsErrorMatch) {
    return tsErrorMatch[1].trim();
  }
  
  // Pattern: "Error: message (ts)"
  const errorMatch = cleaned.match(/Error:\s*(.+?)(?:\s*\(|$)/);
  if (errorMatch) {
    return errorMatch[1].trim();
  }
  
  // Pattern: "Warning: message"
  const warningMatch = cleaned.match(/Warning:\s*(.+?)(?:\s*\(|$)/);
  if (warningMatch) {
    return warningMatch[1].trim();
  }
  
  // Fallback: use the whole cleaned line
  return cleaned.trim();
}

// Determine if line is an error/warning diagnostic
function isDiagnostic(line) {
  const cleaned = stripAnsi(line);
  return /error|warning|Error|Warning|TS\d{4}/i.test(cleaned);
}

// Main analyzer
async function analyzeLog(args) {
  const buckets = new Map(); // message -> { count, samples[] }
  let totalProcessed = 0;
  let skipped = 0;
  let processed = 0;
  
  const fileStream = createReadStream(args.log, { encoding: 'utf8' });
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  if (!args.json) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         CHUNKED SVELTE-CHECK LOG ANALYZER                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log(`Analyzing: ${args.log}`);
    console.log(`Skip: ${args.skip} errors`);
    console.log(`Limit: ${args.limit} errors`);
    console.log(`Processing chunk: errors ${args.skip + 1} to ${args.skip + args.limit}\n`);
  }

  for await (const line of rl) {
    if (!isDiagnostic(line)) continue;
    
    totalProcessed++;
    
    // Skip until we reach the desired start position
    if (totalProcessed <= args.skip) {
      skipped++;
      continue;
    }
    
    // Stop once we've processed the limit
    if (processed >= args.limit) {
      break;
    }
    
    processed++;
    
    const message = extractErrorMessage(line);
    const normalizedLine = normalizePath(stripAnsi(line));
    
    if (!buckets.has(message)) {
      buckets.set(message, {
        count: 0,
        samples: []
      });
    }
    
    const bucket = buckets.get(message);
    bucket.count++;
    
    // Keep only first 3 samples to avoid memory bloat
    if (bucket.samples.length < 3) {
      bucket.samples.push(normalizedLine.substring(0, 200)); // Limit sample length
    }
  }

  // Sort buckets by count (descending)
  const sortedBuckets = Array.from(buckets.entries())
    .map(([message, data]) => ({ message, ...data }))
    .sort((a, b) => b.count - a.count);

  // Output results
  if (args.json) {
    console.log(JSON.stringify({
      metadata: {
        logFile: args.log,
        skip: args.skip,
        limit: args.limit,
        totalProcessed,
        skipped,
        processed,
        uniqueMessages: sortedBuckets.length
      },
      buckets: sortedBuckets
    }, null, 2));
  } else {
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`Total diagnostics in file: ${totalProcessed}+`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Processed in this chunk: ${processed}`);
    console.log(`Unique error messages: ${sortedBuckets.length}\n`);
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('TOP ERROR CATEGORIES:\n');
    
    sortedBuckets.slice(0, 20).forEach((bucket, index) => {
      console.log(`${index + 1}. ${bucket.message}`);
      console.log(`   Count: ${bucket.count} occurrences`);
      console.log(`   Samples:`);
      bucket.samples.forEach(sample => {
        console.log(`     ${sample}`);
      });
      console.log('');
    });
    
    if (sortedBuckets.length > 20) {
      console.log(`... and ${sortedBuckets.length - 20} more error types\n`);
    }
    
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('SUMMARY BY COUNT:\n');
    sortedBuckets.slice(0, 10).forEach((bucket, index) => {
      const percentage = ((bucket.count / processed) * 100).toFixed(1);
      console.log(`${index + 1}. [${bucket.count.toString().padStart(5)}] ${percentage}% - ${bucket.message}`);
    });
    
    console.log('\n═══════════════════════════════════════════════════════════\n');
    console.log('NEXT STEPS:\n');
    console.log(`1. Analyze next chunk:`);
    console.log(`   node scripts/categorize-svelte-check-log.mjs --log ${args.log} --skip ${args.skip + args.limit} --limit ${args.limit}\n`);
    console.log(`2. Export to JSON for tracking:`);
    console.log(`   node scripts/categorize-svelte-check-log.mjs --log ${args.log} --skip ${args.skip} --limit ${args.limit} --json > analysis_${args.skip}_${args.skip + args.limit}.json\n`);
    console.log(`3. Fix top errors first (highest ROI):`);
    if (sortedBuckets[0]) {
      console.log(`   Focus on: "${sortedBuckets[0].message}" (${sortedBuckets[0].count} instances)\n`);
    }
  }
}

// Run
const args = parseArgs();
analyzeLog(args).catch(err => {
  console.error('Error analyzing log:', err);
  process.exit(1);
});
