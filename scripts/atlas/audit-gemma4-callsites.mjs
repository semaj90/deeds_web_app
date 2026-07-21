#!/usr/bin/env node
/**
 * audit-gemma4-callsites.mjs
 *
 * Identify all Gemma4 callsites in the ingestion pipeline.
 * Categorize each as essential, nice-to-have, or removable.
 * Recommend optimization: replace Gemma4 with regex/jq where possible.
 *
 * Run: node scripts/atlas/audit-gemma4-callsites.mjs [--verbose]
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const SEARCH_DIRS = [
  'scripts/atlas',
  'sveltekit-frontend/src/lib/server/atlas',
  'sveltekit-frontend/src/lib/server/ingest'
];

const PATTERNS = [
  { pattern: 'bifrostChat', description: 'Bifrost chat completion call' },
  { pattern: 'ollama.*chat', description: 'Direct Ollama chat call' },
  { pattern: 'gemma4', description: 'Direct Gemma4 reference' },
  { pattern: 'generateSummary', description: 'Summary generation (likely Gemma4 dependent)' },
  { pattern: 'synthesize', description: 'Synthesis call (likely Gemma4 dependent)' }
];

function searchCallsites() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`GEMMA4 CALLSITE AUDIT`);
  console.log(`Searching: ${SEARCH_DIRS.join(', ')}`);
  console.log(`${'═'.repeat(70)}\n`);

  const callsites = [];

  for (const pattern of PATTERNS) {
    console.log(`Searching for: ${pattern.description} (${pattern.pattern})`);

    for (const dir of SEARCH_DIRS) {
      try {
        const output = execSync(`rg "${pattern.pattern}" ${dir} -l --type ts --type mjs --type js 2>/dev/null || true`, {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024
        });

        const files = output.trim().split('\n').filter(f => f.length > 0);

        for (const file of files) {
          const content = fs.readFileSync(file, 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.match(new RegExp(pattern.pattern, 'i'))) {
              // Extract context (line before and after)
              const before = i > 0 ? lines[i - 1].trim() : '';
              const after = i < lines.length - 1 ? lines[i + 1].trim() : '';

              callsites.push({
                file: file.replace(process.cwd(), '.'),
                line: i + 1,
                code: line.trim(),
                pattern: pattern.pattern,
                description: pattern.description,
                context: { before, after }
              });
            }
          }
        }
      } catch (err) {
        // rg not found or no matches
      }
    }
  }

  return callsites;
}

function categorizeCallsite(site) {
  const code = site.code.toLowerCase();
  const file = site.file.toLowerCase();
  const desc = site.description.toLowerCase();

  // Essential: Final summaries, ACE context synthesis
  if (code.includes('final') || code.includes('summary') || code.includes('synthesis')) {
    if (file.includes('ace') || file.includes('context-assembler')) {
      return 'essential';
    }
  }

  // Removable: Payload extraction, path derivation
  if (code.includes('extractPath') || code.includes('parsePayload') || code.includes('deriveSource')) {
    return 'removable';
  }

  // Removable: Format validation (use jq instead)
  if (code.includes('validate') && !code.includes('schema')) {
    return 'removable';
  }

  // Nice-to-have: Optional quality scoring
  if (code.includes('quality') || code.includes('score') || code.includes('grade')) {
    return 'nice_to_have';
  }

  // Default: assume nice-to-have
  return 'nice_to_have';
}

function formatOutput(callsites) {
  const categories = {
    essential: [],
    nice_to_have: [],
    removable: []
  };

  for (const site of callsites) {
    const category = categorizeCallsite(site);
    if (!categories[category]) categories[category] = [];
    categories[category].push(site);
  }

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`RESULTS BY CATEGORY`);
  console.log(`${'─'.repeat(70)}\n`);

  // Essential
  console.log(`🔴 ESSENTIAL (keep as-is):`);
  if (categories.essential.length === 0) {
    console.log(`   No essential Gemma4 calls identified`);
  } else {
    categories.essential.forEach((site, i) => {
      console.log(`\n   [${i + 1}] ${site.file}:${site.line}`);
      console.log(`       Pattern: ${site.pattern}`);
      console.log(`       Code: ${site.code}`);
      console.log(`       Action: Keep. This is critical for synthesis quality.`);
    });
  }

  // Nice-to-have
  console.log(`\n🟡 NICE-TO-HAVE (consider deferring):`);
  if (categories.nice_to_have.length === 0) {
    console.log(`   No nice-to-have Gemma4 calls identified`);
  } else {
    categories.nice_to_have.forEach((site, i) => {
      console.log(`\n   [${i + 1}] ${site.file}:${site.line}`);
      console.log(`       Pattern: ${site.pattern}`);
      console.log(`       Code: ${site.code}`);
      console.log(`       Action: Defer to Phase 4 (batch quality scoring). Not critical for Phase 1-3.`);
    });
  }

  // Removable
  console.log(`\n🟢 REMOVABLE (optimize away):`);
  if (categories.removable.length === 0) {
    console.log(`   No removable Gemma4 calls identified`);
  } else {
    categories.removable.forEach((site, i) => {
      console.log(`\n   [${i + 1}] ${site.file}:${site.line}`);
      console.log(`       Pattern: ${site.pattern}`);
      console.log(`       Code: ${site.code}`);
      console.log(`       Recommended optimization:`);
      if (site.code.includes('extractPath') || site.code.includes('payload')) {
        console.log(`         • Use jq filter: jq 'try .source_ref // .file_path // .packet_id'`);
        console.log(`         • Or regex: /^(task:|src\\/|docs\\/)/ for validation`);
        console.log(`         • Removes 100ms+ latency per extraction`);
      } else if (site.code.includes('validate')) {
        console.log(`         • Use JSON Schema validation (ajv) instead of LLM`);
        console.log(`         • 10× faster, deterministic, no token cost`);
      } else {
        console.log(`         • Replace with deterministic parsing (regex, jq, tree-sitter)`);
      }
    });
  }

  // Summary
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`AUDIT SUMMARY`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`Total callsites: ${callsites.length}`);
  console.log(`  Essential:    ${categories.essential.length} (keep)`);
  console.log(`  Nice-to-have: ${categories.nice_to_have.length} (defer to Phase 4)`);
  console.log(`  Removable:    ${categories.removable.length} (optimize)`);

  const estimatedTokenSavings = categories.removable.length * 5000; // ~5K tokens per Gemma4 call
  console.log(`\nEstimated token savings from removable calls: ~${estimatedTokenSavings.toLocaleString()} tokens`);
  console.log(`Latency savings: ~${categories.removable.length * 100}ms per run`);

  return {
    total: callsites.length,
    essential: categories.essential.length,
    nice_to_have: categories.nice_to_have.length,
    removable: categories.removable.length,
    token_savings: estimatedTokenSavings,
    latency_savings_ms: categories.removable.length * 100
  };
}

const callsites = searchCallsites();
console.log(`\nFound ${callsites.length} Gemma4 references\n`);

if (callsites.length === 0) {
  console.log('No Gemma4 callsites found in ingestion pipeline');
  process.exit(0);
}

const summary = formatOutput(callsites);
console.log(`\n`);
process.exit(0);
