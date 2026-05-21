#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { OUT_DIR, stableHash, writeJson } from './shared.mjs';

function envInt(name, defaultValue) {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function readJsonl(fileName) {
  const full = path.join(OUT_DIR, fileName);
  if (!fs.existsSync(full)) return [];
  return fs.readFileSync(full, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const symbols = readJsonl('symbols.jsonl');
const lexical = readJsonl('lexical-hits.jsonl');

const staticImports = symbols.filter((row) => row.kind === 'import_static');
const dynamicImports = symbols.filter((row) => row.kind === 'import_dynamic');

const byFile = new Map();
for (const row of [...staticImports, ...dynamicImports]) {
  const existing = byFile.get(row.file) || { file: row.file, static_imports: 0, dynamic_imports: 0, targets: new Set(), parsers: new Set() };
  if (row.kind === 'import_static') existing.static_imports += 1;
  if (row.kind === 'import_dynamic') existing.dynamic_imports += 1;
  existing.targets.add(row.symbol);
  existing.parsers.add(row.parser || 'unknown');
  byFile.set(row.file, existing);
}

const lexicalSignals = lexical.filter((row) => /TODO|FIXME|not implemented|status:\s*501|status:\s*503|vi\.mock|jest\.mock|test\.todo/i.test(row.text || ''));

const hotspots = [...byFile.values()]
  .map((row) => ({
    file: row.file,
    dynamic_imports: row.dynamic_imports,
    static_imports: row.static_imports,
    total_imports: row.static_imports + row.dynamic_imports,
    dynamic_ratio: (row.static_imports + row.dynamic_imports) > 0
      ? Number((row.dynamic_imports / (row.static_imports + row.dynamic_imports)).toFixed(3))
      : 0,
    parser_modes: [...row.parsers].sort(),
    sample_targets: [...row.targets].sort().slice(0, 12),
    stable_id: stableHash(`${row.file}:${row.static_imports}:${row.dynamic_imports}`)
  }))
  .sort((a, b) => b.dynamic_imports - a.dynamic_imports || b.total_imports - a.total_imports || a.file.localeCompare(b.file))
  .slice(0, 80);

const report = {
  generated_by: 'scripts/index/dependency-audit.mjs',
  generated_at: new Date().toISOString(),
  totals: {
    files_with_imports: byFile.size,
    static_import_rows: staticImports.length,
    dynamic_import_rows: dynamicImports.length,
    lexical_stub_signals: lexicalSignals.length
  },
  interpretation: {
    static_vs_dynamic: dynamicImports.length > 0
      ? 'Dynamic imports detected; validate lazy-loading paths and runtime guards before production rollout.'
      : 'No dynamic imports detected in current scan.',
    note: 'Use this report alongside graphify topology and smoke gates for production readiness decisions.'
  },
  hotspots
};

const strictMode = /^(1|true|yes|on)$/i.test(String(process.env.DEP_AUDIT_STRICT || ''));
const minStatic = envInt('DEP_AUDIT_MIN_STATIC_IMPORT_ROWS', 1);
const minDynamic = envInt('DEP_AUDIT_MIN_DYNAMIC_IMPORT_ROWS', 1);
const minFiles = envInt('DEP_AUDIT_MIN_FILES_WITH_IMPORTS', 1);

const strictViolations = [];
if (report.totals.static_import_rows < minStatic) {
  strictViolations.push({ metric: 'static_import_rows', actual: report.totals.static_import_rows, min_expected: minStatic });
}
if (report.totals.dynamic_import_rows < minDynamic) {
  strictViolations.push({ metric: 'dynamic_import_rows', actual: report.totals.dynamic_import_rows, min_expected: minDynamic });
}
if (report.totals.files_with_imports < minFiles) {
  strictViolations.push({ metric: 'files_with_imports', actual: report.totals.files_with_imports, min_expected: minFiles });
}

report.strict_mode = {
  enabled: strictMode,
  thresholds: {
    min_static_import_rows: minStatic,
    min_dynamic_import_rows: minDynamic,
    min_files_with_imports: minFiles
  },
  violations: strictViolations
};

const out = writeJson('dependency-audit.json', report);
console.log(JSON.stringify({ ok: true, artifact: out, totals: report.totals }, null, 2));

if (strictMode && strictViolations.length > 0) {
  console.error(JSON.stringify({ ok: false, strict_mode: report.strict_mode }, null, 2));
  process.exit(1);
}
