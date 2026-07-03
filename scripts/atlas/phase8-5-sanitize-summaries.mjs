#!/usr/bin/env node
/**
 * Phase 8.5: Summary Sanitation
 *
 * Cleans contaminated Gemma4 summaries before ACE label extraction.
 * Does NOT regenerate or delete rows — only sanitizes existing content.
 *
 * Blockers detected:
 * - Thinking block markers: <|channel>, <|endthinking>, <thinking>
 * - Meta-commentary: "The user wants", "Analyze the code", "Plan:"
 * - Self-correction: "Self-Correction/Refinement:", "Final Plan:"
 * - Planning steps: numbered lists, "1. Identify", etc.
 *
 * Usage:
 *   node scripts/atlas/phase8-5-sanitize-summaries.mjs --dry-run
 *   node scripts/atlas/phase8-5-sanitize-summaries.mjs --dry-run --limit=100
 *   node scripts/atlas/phase8-5-sanitize-summaries.mjs --apply
 *   node scripts/atlas/phase8-5-sanitize-summaries.mjs --apply --limit=1000
 */

import pg from 'pg';
import { createHash } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const { Pool } = pg;

const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';
const limit = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '100000');
const dryRun = mode === 'dry-run';

const DB_HOST = process.env.DATABASE_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DATABASE_PORT || '5434');
const DB_USER = process.env.DATABASE_USER || 'legal_admin';
const DB_PASSWORD = process.env.DATABASE_PASSWORD || '123456';
const DB_NAME = process.env.DATABASE_NAME || 'legal_ai_db';

const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
});

// ────────────────────────────────────────────────────────────────────
// Contamination Patterns
// ────────────────────────────────────────────────────────────────────

const PATTERNS = {
  thinking_markers: [
    { pattern: /<\|channel\>thought<channel\|>/g, name: '<|channel>thought<channel|>' },
    { pattern: /<\|endthinking\>/g, name: '<|endthinking>' },
    { pattern: /<\|thinking\>/g, name: '<|thinking>' },
    { pattern: /<thinking>[\s\S]*?<\/thinking>/g, name: '<thinking>...</thinking>' },
    { pattern: /<\|channel\>/g, name: '<|channel>' },
  ],

  meta_preambles: [
    { pattern: /^(here'?s|here'?is)\s+a\s+(thinking|summary|breakdown)/im, name: "Here's a thinking..." },
    { pattern: /^(the\s+)?(user\s+)?(wants|is\s+asking|is\s+looking|wants\s+a)/im, name: 'The user wants...' },
    { pattern: /^(the|this)\s+(user|code|snippet|object|component)\s+/im, name: 'The code...' },
  ],

  self_correction: [
    { pattern: /\*?self-correction/im, name: 'Self-Correction' },
    { pattern: /\*?refinement:/im, name: 'Refinement:' },
    { pattern: /^\*?final\s+(plan|summary):/im, name: 'Final Plan/Summary:' },
    { pattern: /^\s*\*self-/im, name: '*Self-...' },
  ],

  planning_steps: [
    { pattern: /^(plan|output|note):/im, name: 'Plan:/Output:/Note:' },
    { pattern: /^(1|2|3)\.\s+(identify|analyze|break|define|note|step)/im, name: '1. Identify/Analyze...' },
    { pattern: /^(1|2|3)\.\s+\*\*/m, name: '1. **...' },
  ],
};

// ────────────────────────────────────────────────────────────────────
// Sanitation Functions
// ────────────────────────────────────────────────────────────────────

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function detectContaminations(summary) {
  const detected = {
    has_thinking_markers: false,
    has_meta_preamble: false,
    has_self_correction: false,
    has_planning_steps: false,
    markers_found: [],
    preamble_patterns: [],
  };

  // Check thinking markers
  for (const { pattern, name } of PATTERNS.thinking_markers) {
    if (pattern.test(summary)) {
      detected.has_thinking_markers = true;
      detected.markers_found.push(name);
    }
  }

  // Check meta preambles
  for (const { pattern, name } of PATTERNS.meta_preambles) {
    if (pattern.test(summary)) {
      detected.has_meta_preamble = true;
      detected.preamble_patterns.push(name);
    }
  }

  // Check self-correction
  for (const { pattern } of PATTERNS.self_correction) {
    if (pattern.test(summary)) {
      detected.has_self_correction = true;
    }
  }

  // Check planning steps
  for (const { pattern } of PATTERNS.planning_steps) {
    if (pattern.test(summary)) {
      detected.has_planning_steps = true;
    }
  }

  return detected;
}

function sanitizeSummary(summary) {
  let cleaned = summary;
  const steps = [];
  let before;

  // 1. Strip thinking block markers
  for (const { pattern, name } of PATTERNS.thinking_markers) {
    before = cleaned;
    cleaned = cleaned.replace(pattern, '');
    if (cleaned !== before) {
      steps.push({
        step: 'strip_thinking_markers',
        pattern_matched: name,
        length_before: before.length,
        length_after: cleaned.length,
      });
    }
  }

  // 2. Remove full lines that are preambles
  const lines = cleaned.split('\n');
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // Filter out meta-commentary lines
    for (const { pattern } of PATTERNS.meta_preambles) {
      if (pattern.test(trimmed)) return false;
    }

    for (const { pattern } of PATTERNS.self_correction) {
      if (pattern.test(trimmed)) return false;
    }

    for (const { pattern } of PATTERNS.planning_steps) {
      if (pattern.test(trimmed)) return false;
    }

    return true;
  });

  before = cleaned;
  cleaned = filteredLines.join('\n').trim();

  if (cleaned !== before) {
    steps.push({
      step: 'remove_meta_lines',
      pattern_matched: 'various preamble/planning lines',
      length_before: before.length,
      length_after: cleaned.length,
    });
  }

  // 3. Normalize whitespace (collapse multiple newlines)
  before = cleaned;
  cleaned = cleaned.replace(/\n\s*\n+/g, '\n\n').trim();

  if (cleaned !== before) {
    steps.push({
      step: 'normalize_whitespace',
      pattern_matched: 'multiple newlines',
      length_before: before.length,
      length_after: cleaned.length,
    });
  }

  return { cleaned, steps };
}

function scoreQuality(original, cleaned, contaminations) {
  let score = 1.0;
  let status = 'PASS';
  let reason = 'Clean summary, no contamination detected.';

  const contaminationCount =
    (contaminations.has_thinking_markers ? 1 : 0) +
    (contaminations.has_meta_preamble ? 1 : 0) +
    (contaminations.has_self_correction ? 1 : 0) +
    (contaminations.has_planning_steps ? 1 : 0);

  // Penalty for contaminations
  if (contaminationCount > 0) {
    score -= contaminationCount * 0.15;
  }

  // Penalty for truncation (ends abruptly or has unmatched brackets)
  if (
    cleaned &&
    (cleaned.match(/\.\.\.$|\.\.\.$/m) ||
      cleaned.length < original.length * 0.2 ||
      (cleaned.match(/[\(\[\{]/g) || []).length > (cleaned.match(/[\)\]\}]/g) || []).length + 1)
  ) {
    score -= 0.1;
    reason = 'Content appears truncated or structurally incomplete.';
  }

  // Ensure minimum length for valid summary
  if (!cleaned || cleaned.length < 20) {
    status = 'FAIL';
    reason = 'Cleaned summary too short or empty.';
    score = 0;
  } else if (score < 0.6) {
    status = 'FAIL';
    reason = 'Too many contaminations detected; semantic content unclear.';
  } else if (score < 0.8) {
    status = 'WARN';
    reason = 'Minor contaminations remain; usable but not ideal.';
  } else {
    status = 'PASS';
    reason = 'Summary clean and ready for ACE extraction.';
  }

  return { score: Math.max(0, score), status, reason, contaminationCount };
}

// ────────────────────────────────────────────────────────────────────
// Main Sanitation Pipeline
// ────────────────────────────────────────────────────────────────────

async function runSanitation() {
  console.log(`\n🧹 Phase 8.5: Summary Sanitation (${mode})\n`);

  try {
    // Fetch contaminated summaries
    console.log(`  📊 Scanning for contaminated summaries (limit: ${limit})...\n`);

    const result = await pool.query(`
      SELECT id, relative_path, summary
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL AND summary != ''
      LIMIT $1
    `, [limit]);

    const rows = result.rows;
    console.log(`  Found ${rows.length} summaries to evaluate.\n`);

    const stats = {
      total_scanned: rows.length,
      total_contaminated: 0,
      total_cleaned: 0,
      total_skipped: 0,
      total_failed: 0,
      pass_count: 0,
      warn_count: 0,
      fail_count: 0,
      contamination_patterns: {},
      results: [],
    };

    let avg_length_before = 0;
    let avg_length_after = 0;

    for (const row of rows) {
      const original = row.summary;
      const original_hash = sha256(original);

      // Detect contaminations
      const contaminations = detectContaminations(original);
      const is_contaminated =
        contaminations.has_thinking_markers ||
        contaminations.has_meta_preamble ||
        contaminations.has_self_correction ||
        contaminations.has_planning_steps;

      if (is_contaminated) {
        stats.total_contaminated++;

        // Sanitize
        const { cleaned, steps } = sanitizeSummary(original);

        // Score quality
        const { score, status, reason, contaminationCount } = scoreQuality(
          original,
          cleaned,
          contaminations
        );

        avg_length_before += original.length;
        avg_length_after += cleaned.length;

        stats.results.push({
          chunk_id: row.id,
          relative_path: row.relative_path,
          original_length: original.length,
          original_hash,
          cleaned_summary: cleaned,
          cleaned_length: cleaned.length,
          quality_score: score,
          quality_status: status,
          contaminations_detected: contaminations,
          contamination_count: contaminationCount,
          removal_steps: steps,
        });

        if (status === 'PASS') stats.pass_count++;
        else if (status === 'WARN') stats.warn_count++;
        else stats.fail_count++;

        if (status !== 'FAIL') stats.total_cleaned++;
        else stats.total_skipped++;

        // Track patterns
        for (const marker of contaminations.markers_found) {
          stats.contamination_patterns[marker] = (stats.contamination_patterns[marker] || 0) + 1;
        }
        for (const pattern of contaminations.preamble_patterns) {
          stats.contamination_patterns[pattern] = (stats.contamination_patterns[pattern] || 0) + 1;
        }
      }
    }

    avg_length_before = stats.total_contaminated > 0 ? avg_length_before / stats.total_contaminated : 0;
    avg_length_after = stats.total_contaminated > 0 ? avg_length_after / stats.total_contaminated : 0;

    const contamination_rate_before = (stats.total_contaminated / stats.total_scanned) * 100;
    const contamination_rate_after = ((stats.total_contaminated - stats.total_cleaned) / stats.total_scanned) * 100;

    // Acceptance gates
    const gates = {
      contamination_rate_acceptable: contamination_rate_after < 2,
      avg_quality_score_acceptable:
        stats.total_cleaned > 0
          ? stats.results.filter(r => r.quality_status !== 'FAIL').reduce((sum, r) => sum + r.quality_score, 0) /
              (stats.total_cleaned || 1) >
            0.8
          : true,
      all_pass_or_warn: stats.fail_count === 0,
      ready_for_phase_9:
        contamination_rate_after < 2 &&
        stats.fail_count === 0 &&
        stats.pass_count + stats.warn_count >= stats.total_cleaned,
    };

    // Report
    console.log(`\n📈 Sanitation Results\n`);
    console.log(`  Total scanned:           ${stats.total_scanned}`);
    console.log(`  Total contaminated:      ${stats.total_contaminated}`);
    console.log(`  Total cleanable:         ${stats.total_cleaned}`);
    console.log(`  Total failed (skipped):  ${stats.total_skipped}\n`);
    console.log(`  Contamination rate (before): ${contamination_rate_before.toFixed(1)}%`);
    console.log(`  Contamination rate (after):  ${contamination_rate_after.toFixed(1)}%`);
    console.log(`  Avg length (before): ${avg_length_before.toFixed(0)} chars`);
    console.log(`  Avg length (after):  ${avg_length_after.toFixed(0)} chars\n`);

    console.log(`  Quality breakdown:`);
    console.log(`    ✅ PASS:  ${stats.pass_count}`);
    console.log(`    ⚠️  WARN:  ${stats.warn_count}`);
    console.log(`    ❌ FAIL:  ${stats.fail_count}\n`);

    console.log(`  Acceptance gates:`);
    console.log(`    ${gates.contamination_rate_acceptable ? '✅' : '❌'} Contamination rate < 2% (${contamination_rate_after.toFixed(1)}%)`);
    console.log(`    ${gates.avg_quality_score_acceptable ? '✅' : '❌'} Avg quality score > 0.8`);
    console.log(`    ${gates.all_pass_or_warn ? '✅' : '❌'} No FAIL status entries`);
    console.log(`    ${gates.ready_for_phase_9 ? '✅' : '❌'} Ready for Phase 9\n`);

    // Top patterns
    const topPatterns = Object.entries(stats.contamination_patterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern, count]) => ({
        pattern,
        count,
        pct_of_contaminated: ((count / stats.total_contaminated) * 100).toFixed(1),
      }));

    if (topPatterns.length > 0) {
      console.log(`  Top contamination patterns:`);
      for (const { pattern, count, pct_of_contaminated } of topPatterns) {
        console.log(`    ${pattern}: ${count} (${pct_of_contaminated}%)`);
      }
      console.log();
    }

    // Apply if requested
    if (!dryRun && stats.total_cleaned > 0) {
      console.log(`\n📝 Applying sanitation to database...\n`);

      for (const result of stats.results) {
        if (result.quality_status !== 'FAIL') {
          await pool.query(
            `UPDATE codebase_chunk_index
             SET summary = $1, updated_at = NOW()
             WHERE id = $2`,
            [result.cleaned_summary, result.chunk_id]
          );
        }
      }

      console.log(`  ✅ Updated ${stats.total_cleaned} summaries in Postgres.\n`);
    } else if (dryRun) {
      console.log(`  [DRY-RUN] Would update ${stats.total_cleaned} summaries if --apply was used.\n`);
    }

    // Write reports
    mkdirSync('docs/reports', { recursive: true });
    mkdirSync('.tmp', { recursive: true });

    const jsonReport = {
      phase: '8.5',
      mode,
      timestamp: new Date().toISOString(),
      ...stats,
      contamination_rate_before: contamination_rate_before.toFixed(1),
      contamination_rate_after: contamination_rate_after.toFixed(1),
      avg_length_before: avg_length_before.toFixed(0),
      avg_length_after: avg_length_after.toFixed(0),
      gates,
      examples: stats.results.slice(0, 3).map(r => ({
        relative_path: r.relative_path,
        before_len: r.original_length,
        after_len: r.cleaned_length,
        quality_status: r.quality_status,
      })),
    };

    writeFileSync('docs/reports/phase-8-5-summary-sanitation.json', JSON.stringify(jsonReport, null, 2));

    // Markdown report
    const mdReport = `# Phase 8.5: Summary Sanitation Report

**Mode**: ${mode}
**Timestamp**: ${new Date().toISOString()}

## Summary

- **Total scanned**: ${stats.total_scanned}
- **Total contaminated**: ${stats.total_contaminated} (${contamination_rate_before.toFixed(1)}%)
- **Cleanable**: ${stats.total_cleaned}
- **Failed/Skipped**: ${stats.total_skipped}

## Quality Results

| Status | Count | % |
|--------|-------|---|
| ✅ PASS | ${stats.pass_count} | ${((stats.pass_count / stats.total_cleaned) * 100).toFixed(1)}% |
| ⚠️ WARN | ${stats.warn_count} | ${((stats.warn_count / stats.total_cleaned) * 100).toFixed(1)}% |
| ❌ FAIL | ${stats.fail_count} | ${((stats.fail_count / stats.total_cleaned) * 100).toFixed(1)}% |

## Acceptance Gates

| Gate | Status | Details |
|------|--------|---------|
| Contamination rate < 2% | ${gates.contamination_rate_acceptable ? '✅' : '❌'} | ${contamination_rate_after.toFixed(1)}% |
| Quality score > 0.8 | ${gates.avg_quality_score_acceptable ? '✅' : '❌'} | Average quality score |
| No FAIL entries | ${gates.all_pass_or_warn ? '✅' : '❌'} | ${stats.fail_count} failures |
| **Ready for Phase 9** | ${gates.ready_for_phase_9 ? '✅ YES' : '❌ NO'} | All gates pass |

## Metrics

- **Before**: ${avg_length_before.toFixed(0)} chars avg, ${contamination_rate_before.toFixed(1)}% contaminated
- **After**: ${avg_length_after.toFixed(0)} chars avg, ${contamination_rate_after.toFixed(1)}% contaminated

## Top Contamination Patterns

${topPatterns.map(p => `- **${p.pattern}**: ${p.count} occurrences (${p.pct_of_contaminated}%)`).join('\n')}

---

**Recommendation**: Phase 9 ACE extraction is ${gates.ready_for_phase_9 ? '✅ SAFE TO START' : '⚠️ BLOCKED'}.

Next steps:
1. ${gates.ready_for_phase_9 ? 'Run npm run atlas:phase102:step9:ace:extract' : 'Fix remaining contaminations and rerun sanitation'}
2. Materialize feature envelopes: \`npm run atlas:materialize-envelopes:apply\`
3. Warm Qdrant/Neo4j/Redis payloads
`;

    writeFileSync('docs/reports/phase-8-5-summary-sanitation.md', mdReport);

    console.log(`\n📄 Reports written:`);
    console.log(`  docs/reports/phase-8-5-summary-sanitation.json`);
    console.log(`  docs/reports/phase-8-5-summary-sanitation.md\n`);

    const exitCode = gates.ready_for_phase_9 ? 0 : 1;
    process.exit(exitCode);
  } catch (err) {
    console.error(`\n❌ Error:`, err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSanitation();
