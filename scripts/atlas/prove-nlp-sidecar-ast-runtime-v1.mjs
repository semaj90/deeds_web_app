#!/usr/bin/env node

/**
 * Read-only live proof for the NLP sidecar structural pass.
 *
 * This proves the sidecar can analyze a real repository file and preserve
 * source/revision/parser metadata. It does not write atlas_ast_nodes or any
 * other canonical store.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const SOURCE_RELATIVE = 'scripts/atlas/audit-pgvector-schema.mjs';
const REPORT = resolve(ROOT, 'docs/reports/nlp-sidecar-ast-runtime-v1.json');
const BASE_URL = (process.env.ATLAS_NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095').replace(/\/$/, '');

const text = await readFile(resolve(ROOT, SOURCE_RELATIVE), 'utf8');
const sourceRevision = `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
const payload = {
  text,
  source_type: 'codebase',
  source_ref: SOURCE_RELATIVE,
  source_revision: sourceRevision,
  workspace_revision: 'sha256:runtime-fixture-workspace-v1',
  language: 'javascript',
  passes: ['structural'],
};

const report = {
  schema: 'atlas.nlp-sidecar-ast-runtime.v1',
  generatedAt: new Date().toISOString(),
  endpoint: `${BASE_URL}/analyze`,
  sourceRef: SOURCE_RELATIVE,
  sourceRevision,
  canonicalAuthority: false,
  promotionAuthorized: false,
  writesPerformed: false,
  checks: [],
};

const check = (id, pass, details = {}) => {
  report.checks.push({ id, status: pass ? 'PASS' : 'FAIL', ...details });
  return pass;
};

try {
  const response = await fetch(`${BASE_URL}/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  check('http', response.ok, { statusCode: response.status });
  const structural = body?.pass_results?.find((pass) => pass.family === 'structural');
  const units = structural?.artifacts?.ast_units ?? [];
  const first = units[0] ?? {};
  check('structural-pass-present', Boolean(structural));
  check('source-reference-preserved', structural?.source_ref === SOURCE_RELATIVE, {
    observed: structural?.source_ref ?? null,
  });
  check('source-revision-preserved', structural?.source_revision === sourceRevision, {
    observed: structural?.source_revision ?? null,
  });
  check('ast-units-emitted', units.length > 0, { count: units.length });
  check('parser-revision-populated', units.every((unit) => typeof unit.parser_revision === 'string' && unit.parser_revision.length > 0), {
    values: [...new Set(units.map((unit) => unit.parser_revision))],
  });
  check('grammar-revision-populated', units.every((unit) => typeof unit.grammar_revision === 'string' && unit.grammar_revision.length > 0), {
    values: [...new Set(units.map((unit) => unit.grammar_revision))],
  });
  check('packet-key-not-emitted', structural?.packet_key == null, { observed: structural?.packet_key ?? null });
  check('canonical-promotion-closed', units.every((unit) => unit.canonical_authority === false));
  report.observed = {
    engine: body?.provider_revision ?? null,
    astUnitCount: units.length,
    firstNodeKind: first.node_kind ?? null,
    parserRevision: first.parser_revision ?? null,
    grammarRevision: first.grammar_revision ?? null,
  };
} catch (error) {
  report.checks.push({ id: 'runtime-request', status: 'FAIL', error: String(error?.message ?? error) });
}

report.status = report.checks.every((item) => item.status === 'PASS') ? 'NLP_SIDECAR_AST_RUNTIME_PROVEN' : 'NLP_SIDECAR_AST_RUNTIME_REVIEW_REQUIRED';
report.passCount = report.checks.filter((item) => item.status === 'PASS').length;
report.failCount = report.checks.filter((item) => item.status === 'FAIL').length;
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ report: 'docs/reports/nlp-sidecar-ast-runtime-v1.json', status: report.status, passCount: report.passCount, failCount: report.failCount, writesPerformed: false }, null, 2));
if (report.failCount > 0) process.exitCode = 1;
