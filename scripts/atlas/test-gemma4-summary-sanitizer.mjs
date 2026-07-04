#!/usr/bin/env node
/**
 * Hardened Gemma4 summary sanitizer gate.
 *
 * Verifies the shared sanitizer strips transport markers, whitespace noise,
 * and reasoning leakage from both synthetic edge cases and a live DB sample.
 *
 * Outputs:
 *   docs/reports/gemma4-summary-sanitizer-hardened.md
 *   docs/reports/gemma4-summary-sanitizer-hardened.json
 */

import pg from 'pg';
import path from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  hasGemma4ReasoningLeak,
  isUsableGemma4Summary,
  sanitizeGemma4Summary,
} from './lib/gemma4-summary-sanitizer.mjs';

const { Pool } = pg;
const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dir, '..', '..');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const OUT_JSON = path.join(OUT_DIR, 'gemma4-summary-sanitizer-hardened.json');
const OUT_MD = path.join(OUT_DIR, 'gemma4-summary-sanitizer-hardened.md');

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=(.*)$/);
  if (m) args.set(m[1], m[2]);
  else if (arg.startsWith('--')) args.set(arg.slice(2), 'true');
}

const sampleLimit = Number(args.get('sample-limit') ?? '200');
const minLength = Number(args.get('min-length') ?? '30');
const minUniqueWords = Number(args.get('min-unique-words') ?? '6');
const dryRun = args.has('dry-run');

const DB_URL =
  process.env.DATABASE_URL ??
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

function normalizeWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

const syntheticCases = [
  {
    name: 'transport markers',
    raw: '<start_of_turn>user\n<end_of_turn><start_of_turn>model\nThis module creates a shallow copy of the input object.<end_of_turn>',
  },
  {
    name: 'channel thought block',
    raw: '<|channel|>thought<|channel|>We need to think first. <|channel|>final<|channel|>This module validates packets.',
  },
  {
    name: 'space-delimited turn markers',
    raw: '< end of turn > < bos >  Packet summary should remain after stripping markers.',
  },
  {
    name: 'meta preamble and whitespace',
    raw: '  Here is a summary of the code.\n\n  This module builds an ACE packet envelope.  ',
  },
];

function evaluateCase(input) {
  const sanitized = sanitizeGemma4Summary(input.raw);
  return {
    ...input,
    raw_normalized: normalizeWhitespace(input.raw),
    summary: sanitized.summary,
    cleaned_normalized: normalizeWhitespace(sanitized.summary),
    changed: sanitized.changed,
    safe: sanitized.safe,
    raw_leaky: sanitized.leaky,
    usable: isUsableGemma4Summary(sanitized.summary, {
      minLength,
      minUniqueWords,
    }),
    hasLeak: hasGemma4ReasoningLeak(sanitized.summary),
  };
}

async function sampleLiveSummaries() {
  const pool = new Pool({ connectionString: DB_URL });
  try {
    const result = await pool.query(
      `
        SELECT packet_key, summary
        FROM atlas_packets
        WHERE summary IS NOT NULL AND btrim(summary) <> ''
        ORDER BY updated_at DESC NULLS LAST, packet_key
        LIMIT $1
      `,
      [sampleLimit]
    );
    return result.rows.map((row) => {
      const sanitized = sanitizeGemma4Summary(row.summary);
      return {
        packet_key: row.packet_key,
        raw: row.summary,
        summary: sanitized.summary,
        changed: sanitized.changed,
        safe: sanitized.safe,
        leaky: sanitized.leaky,
        usable: isUsableGemma4Summary(sanitized.summary, {
          minLength,
          minUniqueWords,
        }),
        hasLeak: hasGemma4ReasoningLeak(sanitized.summary),
      };
    });
  } finally {
    await pool.end();
  }
}

function countBy(values, key) {
  return values.reduce((acc, item) => {
    const bucket = item[key] ? 'true' : 'false';
    acc[bucket] = (acc[bucket] ?? 0) + 1;
    return acc;
  }, {});
}

function makeMarkdown(report) {
  const lines = [];
  lines.push('# Gemma4 Summary Sanitizer Hardened Report');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- DB sample size: ${report.live_sample.total}`);
  lines.push(`- Synthetic cases: ${report.synthetic.total}`);
  lines.push(`- Gate: ${report.gate}`);
  lines.push('');
  lines.push('## Synthetic Cases');
  lines.push('');
  lines.push('| Case | Safe | Usable | Changed | Raw Leak | Leak After | Summary |');
  lines.push('|---|---:|---:|---:|---:|---:|---|');
  for (const item of report.synthetic.cases) {
    lines.push(`| ${item.name} | ${item.safe ? 'yes' : 'no'} | ${item.usable ? 'yes' : 'no'} | ${item.changed ? 'yes' : 'no'} | ${item.raw_leaky ? 'yes' : 'no'} | ${item.hasLeak ? 'yes' : 'no'} | ${item.summary.replace(/\|/g, '\\|').slice(0, 120)} |`);
  }
  lines.push('');
  lines.push('## Live Sample');
  lines.push('');
  lines.push(`- Safe after sanitize: ${report.live_sample.safe_after}`);
  lines.push(`- Usable after sanitize: ${report.live_sample.usable_after}`);
  lines.push(`- Changed: ${report.live_sample.changed}`);
  lines.push(`- Leaky after sanitize: ${report.live_sample.leaky_after}`);
  lines.push(`- Markers before: ${JSON.stringify(report.live_sample.before_counts)}`);
  lines.push(`- Markers after: ${JSON.stringify(report.live_sample.after_counts)}`);
  lines.push('');
  lines.push('## Gaps');
  lines.push('');
  if (report.gaps.length === 0) {
    lines.push('- None detected in this run.');
  } else {
    for (const gap of report.gaps) lines.push(`- ${gap}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const synthetic = syntheticCases.map(evaluateCase);
  const live = await sampleLiveSummaries();

  const beforeCounts = {
    channel: live.filter((row) => /<\|channel\|>|<channel\|>/i.test(row.raw)).length,
    turns: live.filter((row) => /<\s*start\s+of\s+turn\s*>|<\s*end\s+of\s+turn\s*>|<start_of_turn>|<end_of_turn>/i.test(row.raw)).length,
    bos: live.filter((row) => /<\s*bos\s*>/i.test(row.raw)).length,
    eos: live.filter((row) => /<\s*eos\s*>/i.test(row.raw)).length,
    thought: live.filter((row) => /<think\b|<thinking\b|<\|endthinking\|?>/i.test(row.raw)).length,
  };
  const afterCounts = {
    channel: live.filter((row) => /<\|channel\|>|<channel\|>/i.test(row.summary)).length,
    turns: live.filter((row) => /<\s*start\s+of\s+turn\s*>|<\s*end\s+of\s+turn\s*>|<start_of_turn>|<end_of_turn>/i.test(row.summary)).length,
    bos: live.filter((row) => /<\s*bos\s*>/i.test(row.summary)).length,
    eos: live.filter((row) => /<\s*eos\s*>/i.test(row.summary)).length,
    thought: live.filter((row) => /<think\b|<thinking\b|<\|endthinking\|?>/i.test(row.summary)).length,
  };

  const syntheticPass = synthetic.every((item) => item.safe && !item.hasLeak);
  const liveSafeAfter = live.filter((row) => row.safe).length;
  const liveUsableAfter = live.filter((row) => row.usable).length;
  const liveLeakAfter = live.filter((row) => row.hasLeak).length;
  const liveChanged = live.filter((row) => row.changed).length;

  const gaps = [];
  if (!syntheticPass) gaps.push('At least one synthetic marker case still leaks markers after sanitize.');
  if (liveLeakAfter > 0) gaps.push(`Live sample still leaks reasoning markers after sanitize in ${liveLeakAfter} rows.`);
  if (Object.values(afterCounts).some((count) => count > 0)) gaps.push('At least one turn/bos/eos marker remains after sanitize in live sample.');

  const report = {
    timestamp: new Date().toISOString(),
    gate: syntheticPass && liveLeakAfter === 0 && Object.values(afterCounts).every((count) => count === 0)
      ? 'PASS'
      : 'WARN',
    synthetic: {
      total: synthetic.length,
      pass: syntheticPass,
      cases: synthetic,
    },
    live_sample: {
      total: live.length,
      changed: liveChanged,
      safe_after: liveSafeAfter,
      usable_after: liveUsableAfter,
      leaky_after: liveLeakAfter,
      before_counts: beforeCounts,
      after_counts: afterCounts,
      samples: live.slice(0, 10),
    },
    gaps,
  };

  writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
  writeFileSync(OUT_MD, makeMarkdown(report));

  console.log(JSON.stringify({
    gate: report.gate,
    synthetic_pass: report.synthetic.pass,
    live_total: report.live_sample.total,
    live_changed: report.live_sample.changed,
    live_leaky_after: report.live_sample.leaky_after,
    outputs: [OUT_JSON, OUT_MD],
  }, null, 2));

  if (report.gate !== 'PASS' && !dryRun) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
