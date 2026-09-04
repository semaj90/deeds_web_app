/**
 * DOC-12 read-only live proof. Exercises the existing 8095 documentation-facts
 * endpoint and verifies API-rule admission/negative behavior without persistence.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-12-api-rule-negative-matrix-v1.json');
const endpoint = process.env.ATLAS_NLP_URL ?? 'http://127.0.0.1:8095';
const sha = (text) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;

async function call(text, sourceRevision = sha(text), extra = {}) {
  const response = await fetch(`${endpoint}/extract/documentation-facts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      sourceUrl: 'https://example.invalid/doc-12-matrix',
      sourceRevision,
      productVersion: '1.0',
      ...extra,
    }),
  });
  let body;
  try { body = await response.json(); } catch { body = null; }
  return { status: response.status, body };
}

const ruleText = 'cudaMalloc(size_t size) allocates size bytes on the device. Deprecated since CUDA 11: use cudaMallocAsync instead.';
const structureText = '# cudaMalloc\n\n```cpp\nvoid cudaMalloc(void** ptr, size_t size);\n```';
const cases = [];

const valid = await call(ruleText);
const rules = Array.isArray(valid.body?.apiRules) ? valid.body.apiRules : [];
const validRule = rules[0] ?? null;
const validSpan = validRule?.evidenceSpan ?? null;
const validEvidence = validSpan && Number.isInteger(validSpan.startByte) && Number.isInteger(validSpan.endByte)
  ? Buffer.from(ruleText, 'utf8').subarray(validSpan.startByte, validSpan.endByte).toString('utf8')
  : null;
cases.push({
  name: 'grounded_api_rule',
  passed: valid.status === 200 && rules.length >= 1 && validRule.apiSymbol === 'cudaMalloc'
    && validRule.versionRange && validRule.condition && validRule.recommendation
    && validSpan?.alignmentStatus === 'MATCH_EXACT' && validEvidence === validText(ruleText, validSpan),
  status: valid.status,
  apiRuleCount: rules.length,
  alignmentStatus: validSpan?.alignmentStatus ?? null,
  evidenceBytesMatch: validEvidence === validText(ruleText, validSpan),
});

const stale = await call(ruleText, 'sha256:stale-source-revision');
cases.push({ name: 'wrong_source_revision_rejected', passed: stale.status === 422, status: stale.status });

const structural = await call(structureText);
const structuralRules = Array.isArray(structural.body?.apiRules) ? structural.body.apiRules : [];
cases.push({ name: 'structure_only_not_api_rule', passed: structural.status === 200 && structuralRules.length === 0, status: structural.status, apiRuleCount: structuralRules.length });

const missing = await call(ruleText, undefined, { sourceRevision: undefined });
cases.push({ name: 'missing_source_revision_rejected', passed: missing.status === 422, status: missing.status });

function validText(text, span) {
  if (!span || !Number.isInteger(span.startByte) || !Number.isInteger(span.endByte)) return null;
  return Buffer.from(text, 'utf8').subarray(span.startByte, span.endByte).toString('utf8');
}

const report = {
  schema: 'parent-atlas.doc-12-api-rule-negative-matrix.v1',
  gate: 'DOC-12',
  status: cases.every((item) => item.passed) ? 'DOC_12_NEGATIVE_MATRIX_PROVEN' : 'DOC_12_NEGATIVE_MATRIX_FAILED',
  endpoint,
  modelId: valid.body?.modelId ?? null,
  cases,
  canonicalAuthority: valid.body?.canonicalAuthority ?? null,
  writesPerformed: false,
  datastoreWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, modelId: report.modelId, cases }, null, 2));
if (report.status !== 'DOC_12_NEGATIVE_MATRIX_PROVEN') process.exitCode = 1;
