#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const CHECK_CMD = 'npm --prefix sveltekit-frontend run check';
const MODEL = 'gemma4-rotorquant';

const OUT = {
  log: '.tmp/svelte-check.log',
  jsonl: 'memory/diagnostics/svelte-check-errors.jsonl',
  ranked: 'memory/diagnostics/svelte-check-ranked.jsonl',
  md: '.opencode/recommendations/svelte-check-quick-wins.md',
  queue: '.opencode/recommendations/agentic-fix-queue.ndjson',
};

for (const d of ['.tmp', 'memory/diagnostics', '.opencode/recommendations']) {
  mkdirSync(d, { recursive: true });
}

function run(cmd) {
  const r = spawnSync(cmd, {
    shell: true,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 100,
  });
  return `${r.stdout || ''}${r.stderr || ''}`;
}

function bucket(message) {
  if (message.includes('explicit file extensions')) return 'nodenext-js-extension';
  if (message.includes('Cannot find module')) return 'missing-module-or-alias';
  if (message.includes('Cannot find name')) return 'missing-symbol-or-test-globals';
  if (message.includes('implicitly has an')) return 'implicit-any';
  if (message.includes('does not exist on type')) return 'type-contract-drift';
  if (message.includes('Error in svelte.config.js')) return 'svelte-config-dependency';
  return 'other';
}

function skillFor(b) {
  return (
    {
      'nodenext-js-extension': 'skill:nodenext-import-fixer',
      'missing-module-or-alias': 'skill:sveltekit-alias-resolver',
      'missing-symbol-or-test-globals': 'skill:vitest-migration-fixer',
      'implicit-any': 'skill:typescript-contract-fixer',
      'type-contract-drift': 'skill:api-contract-reconciler',
      'svelte-config-dependency': 'skill:dependency-gatekeeper',
      other: 'skill:general-ts-fixer',
    }[b] || 'skill:general-ts-fixer'
  );
}

function severityFor(b, message) {
  if (b === 'nodenext-js-extension') return 'P0';
  if (b === 'missing-module-or-alias') return 'P0';
  if (message.includes('synthesize') || message.includes('runId')) return 'P0';
  if (b === 'missing-symbol-or-test-globals') return 'P1';
  return 'P2';
}

function hash(row) {
  return crypto
    .createHash('sha256')
    .update(`${row.sourceRef}:${row.line}:${row.bucket}:${row.message}`)
    .digest('hex')
    .slice(0, 16);
}

function makeRow(file, lineNo, col, message) {
  const b = bucket(message);
  const row = {
    kind: 'svelte-check',
    sourceRef: file.replace(/\\/g, '/'),
    line: Number(lineNo),
    column: col ? Number(col) : null,
    bucket: b,
    severity: severityFor(b, message),
    message,
    skill: skillFor(b),
    model: MODEL,
    createdAt: new Date().toISOString(),
  };
  row.fingerprint = hash(row);
  return row;
}

function parseLog(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];

  let currentFile = null;
  let currentLine = null;
  let currentCol = null;

  for (const line of lines) {
    // Inline format:
    // file.ts:10:2 Error: message
    const inline = line.match(/^(.+\.(?:ts|js|svelte|mjs|cjs)):(\d+):(\d+)?.*?Error:\s+(.+)$/);
    if (inline) {
      rows.push(makeRow(inline[1], inline[2], inline[3], inline[4].trim()));
      continue;
    }

    // Location-only format:
    // file.ts:10:2
    const loc = line.match(/^(.+\.(?:ts|js|svelte|mjs|cjs)):(\d+):(\d+)?$/);
    if (loc) {
      currentFile = loc[1];
      currentLine = loc[2];
      currentCol = loc[3] || null;
      continue;
    }

    // Following line:
    // Error: message
    const err = line.match(/^Error:\s+(.+)$/);
    if (err && currentFile) {
      rows.push(makeRow(currentFile, currentLine, currentCol, err[1].trim()));
      continue;
    }
  }

  return rows;
}

function scoreRows(rows) {
  const bucketCounts = {};
  const fileCounts = {};

  for (const r of rows) {
    bucketCounts[r.bucket] = (bucketCounts[r.bucket] || 0) + 1;
    fileCounts[r.sourceRef] = (fileCounts[r.sourceRef] || 0) + 1;
  }

  return rows
    .map((r) => {
      const sev = r.severity === 'P0' ? 1000 : r.severity === 'P1' ? 500 : 100;
      return {
        ...r,
        bucketCount: bucketCounts[r.bucket],
        fileErrorCount: fileCounts[r.sourceRef],
        rankScore: sev + bucketCounts[r.bucket] * 5 + fileCounts[r.sourceRef] * 10,
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}

function group(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

console.log(`Running: ${CHECK_CMD}`);
const log = run(CHECK_CMD);
writeFileSync(OUT.log, log);

const rows = parseLog(log);
writeFileSync(OUT.jsonl, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

const ranked = scoreRows(rows);
writeFileSync(OUT.ranked, ranked.map((r) => JSON.stringify(r)).join('\n') + '\n');

const byBucket = [...group(ranked, 'bucket').entries()].sort((a, b) => b[1].length - a[1].length);
const byFile = [...group(ranked, 'sourceRef').entries()].sort((a, b) => b[1].length - a[1].length);

let md = `# Phase 100A Svelte-check Quick Wins

Generated: ${new Date().toISOString()}

Model: \`${MODEL}\`

Total diagnostics: **${ranked.length}**

## Top Buckets

| Rank | Bucket | Count | Skill |
|---:|---|---:|---|
`;

byBucket.forEach(([b, rs], i) => {
  md += `| ${i + 1} | ${b} | ${rs.length} | ${skillFor(b)} |\n`;
});

md += `

## Top Files

| Rank | File | Errors |
|---:|---|---:|
`;

byFile.slice(0, 40).forEach(([f, rs], i) => {
  md += `| ${i + 1} | \`${f}\` | ${rs.length} |\n`;
});

md += `

## Quick Wins

`;

ranked.slice(0, 40).forEach((r, i) => {
  md += `### ${i + 1}. ${r.bucket} — ${r.sourceRef}:${r.line}

- Severity: ${r.severity}
- Skill: ${r.skill}
- Rank: ${r.rankScore}
- Message: ${r.message}

`;
});

writeFileSync(OUT.md, md);

const queue = [];
const seen = new Set();

for (const r of ranked) {
  const k = `${r.sourceRef}:${r.bucket}`;
  if (seen.has(k)) continue;
  seen.add(k);

  queue.push({
    id: `repair:${r.fingerprint}`,
    sourceRef: r.sourceRef,
    filePath: r.sourceRef,
    lineStart: r.line,
    lineEnd: r.line,
    bucket: r.bucket,
    severity: r.severity,
    skill: r.skill,
    rankScore: r.rankScore,
    message: r.message,
    model: MODEL,
    applyMode: 'line-range-only',
    allowFullFileReplacement: false,
    validation: CHECK_CMD,
    status: 'queued',
  });
}

writeFileSync(OUT.queue, queue.map((r) => JSON.stringify(r)).join('\n') + '\n');

console.log(`Parsed: ${rows.length}`);
console.log(`Wrote: ${OUT.md}`);
console.log(`Wrote: ${OUT.queue}`);
