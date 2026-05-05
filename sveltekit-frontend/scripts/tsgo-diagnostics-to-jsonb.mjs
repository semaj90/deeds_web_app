#!/usr/bin/env node
/**
 * tsgo-diagnostics-to-jsonb.mjs
 *
 * Run TypeScript 7 native-preview type-check (`tsgo --noEmit`), parse the
 * pretty=false output into structured records, and write a JSONB-shaped
 * report to scratch/audits/tsgo-diagnostics.json.
 *
 * Each diagnostic becomes a metadata-envelope record:
 *   {
 *     source_type:   'diagnostic',
 *     tool:          'tsgo',
 *     stable_key:    'diagnostic:tsgo:<sha1(file:line:col:code:msg)>',
 *     file_path:     'src/lib/foo.ts',
 *     line, column, code, message, severity,
 *     metadata:      { compiler: 'tsgo', native_preview: true, version: '...' }
 *   }
 *
 * Output flows naturally into:
 *   - metadata_envelopes(source_type='diagnostic')
 *   - code_relations(DIAGNOSTIC_IN_FILE)
 *   - ace_context_sources(source_kind='tsgo_diagnostic')
 *
 * Used by:
 *   - npm run audit:tsgo:json    — manual or CI run
 *   - the eventual nightly /audit/tsgo cron route
 *
 * Exits with the same status code as tsgo (0 = clean, !0 = errors).
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT     = process.cwd();
const OUT_DIR  = resolve(ROOT, 'scratch/audits');
const OUT_FILE = resolve(OUT_DIR, 'tsgo-diagnostics.json');

// pretty=false yields lines like:
//   src/foo.ts(12,34): error TS2304: Cannot find name 'foo'.
const TSGO_LINE_RE = /^(.+?)\((\d+),(\d+)\):\s+(error|warning|info)\s+(TS\d+):\s+(.+)$/;

const run = spawnSync('npx', ['tsgo', '--noEmit', '--pretty', 'false'], {
  encoding: 'utf8',
  shell:    true,
  cwd:      ROOT,
});

const stdout = run.stdout ?? '';
const stderr = run.stderr ?? '';
const output = `${stdout}\n${stderr}`.trim();

// Pull tsgo version (best-effort)
const versionRun = spawnSync('npx', ['tsgo', '--version'], {
  encoding: 'utf8',
  shell:    true,
  cwd:      ROOT,
});
const version = (versionRun.stdout ?? '').trim().replace(/^Version\s+/i, '') || 'unknown';

const diagnostics = output
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const m = TSGO_LINE_RE.exec(line);
    if (!m) {
      return { parsed: false, raw: line.slice(0, 500) };
    }
    const [, filePath, lineNo, colNo, sevWord, code, message] = m;
    const severity =
      sevWord === 'error'   ? 'error'   :
      sevWord === 'warning' ? 'warning' :
                              'info';
    const stableKey = 'diagnostic:tsgo:' + createHash('sha1')
      .update(`${filePath}:${lineNo}:${colNo}:${code}:${message}`)
      .digest('hex');

    return {
      parsed:      true,
      source_type: 'diagnostic',
      tool:        'tsgo',
      stable_key:  stableKey,
      file_path:   filePath.replace(/\\/g, '/'),
      line:        Number(lineNo),
      column:      Number(colNo),
      code,
      message,
      severity,
      metadata: {
        compiler:        'tsgo',
        native_preview:  true,
        version,
      },
    };
  });

const errorCount   = diagnostics.filter((d) => d.parsed && d.severity === 'error').length;
const warningCount = diagnostics.filter((d) => d.parsed && d.severity === 'warning').length;
const unparsed     = diagnostics.filter((d) => !d.parsed).length;

const report = {
  tool:         'tsgo',
  version,
  generated_at: new Date().toISOString(),
  exit_code:    run.status ?? 1,
  totals: {
    errors:   errorCount,
    warnings: warningCount,
    unparsed,
    total:    diagnostics.length,
  },
  diagnostics,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));

console.log(`tsgo v${version} → ${errorCount} errors, ${warningCount} warnings`);
console.log(`Report: ${OUT_FILE}`);

process.exit(run.status ?? 0);
