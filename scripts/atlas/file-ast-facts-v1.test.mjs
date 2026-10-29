import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scratch = path.join(root, '.tmp', 'atlas', 'ast-fact-fixture-test');
const digest = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const sqlQuote = (value) => `'${value.replaceAll("'", "''")}'`;

test('inventory-bound facts preserve spans, distinguish review from defects, and replay deterministically', () => {
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.mkdirSync(scratch, { recursive: true });
  const fixtureRoot = path.join(scratch, 'src');
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const files = new Map([
    ['src/routes/api/fixture/+server.ts', `// https://comment.invalid/TODO\nconst schema = { safeParse: (x: unknown) => ({ success: true, data: x }) };\nexport async function POST({ request }: { request: Request }) {\n  const raw = await request.json();\n  const checked = schema.safeParse(raw);\n  return Response.json(checked);\n}\nexport async function GET({ request }: { request: Request }) {\n  const raw = await request.json();\n  return Response.json(raw);\n}\n`],
    ['src/routes/api/assignment/+server.ts', `const schema = { safeParse: (x: unknown) => ({ success: true, data: x }) };\nexport async function PUT({ request }: { request: Request }) {\n  let raw: unknown;\n  raw = await request.json();\n  const checked = schema.safeParse(raw);\n  return Response.json(checked);\n}\n`],
    ['src/client.ts', `const endpoint = 'https://api.example.test/items';\nexport const load = () => fetch(endpoint);\n`],
    ['src/Widget.svelte', `<!-- TODO: migrate old slot -->\n<script lang="ts">\n  let count = 0;\n</script>\n<button on:click={() => count++}>{count}</button><slot />\n`],
  ]);
  const inventoryRows = [];
  for (const [relative, content] of files) {
    const sourceRef = `sveltekit-frontend/${relative}`;
    const fullPath = path.join(root, sourceRef);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    const bytes = fs.readFileSync(fullPath);
    inventoryRows.push({ source_ref: sourceRef, extension: path.extname(relative), byte_length: bytes.length, source_digest: digest(bytes) });
  }
  const invalidUtf8Ref = 'sveltekit-frontend/src/invalid-utf8.ts';
  const invalidUtf8Path = path.join(root, invalidUtf8Ref);
  const invalidUtf8Bytes = Buffer.from([0x63, 0x6f, 0x6e, 0x73, 0x74, 0x20, 0xff, 0x3b]);
  fs.writeFileSync(invalidUtf8Path, invalidUtf8Bytes);
  inventoryRows.push({ source_ref: invalidUtf8Ref, extension: '.ts', byte_length: invalidUtf8Bytes.length, source_digest: digest(invalidUtf8Bytes) });
  inventoryRows.push({ source_ref: '../../outside.ts', extension: '.ts', byte_length: 0, source_digest: digest(Buffer.alloc(0)) });
  const inventoryPath = path.join(scratch, 'inventory.parquet');
  const values = inventoryRows.map((row) => `(${sqlQuote(row.source_ref)}, ${sqlQuote(row.extension)}, ${row.byte_length}, ${sqlQuote(row.source_digest)})`).join(',');
  execFileSync('duckdb', ['-c', `COPY (SELECT * FROM (VALUES ${values}) AS t(source_ref, extension, byte_length, source_digest)) TO '${inventoryPath.replace(/\\/g, '/')}' (FORMAT parquet)`], { cwd: root, stdio: 'pipe' });
  const bound = inventoryRows[0];
  const bindingsPath = path.join(scratch, 'bindings.csv');
  fs.writeFileSync(bindingsPath, `workspace_revision,canonical_source_ref,content_digest\nsha256:${'a'.repeat(64)},${bound.source_ref},${bound.source_digest.slice(7)}\n`);
  const run = (label) => {
    const factsPath = path.join(scratch, `facts-${label}.jsonl`);
    const summaryPath = path.join(scratch, `summary-${label}.jsonl`);
    const receiptPath = path.join(scratch, `receipt-${label}.json`);
    execFileSync(process.execPath, ['scripts/atlas/file-ast-facts-v1.mjs'], { cwd: root, stdio: 'pipe', env: { ...process.env, ATLAS_INV: inventoryPath, ATLAS_WSB: bindingsPath, ATLAS_AST_OUT: factsPath, ATLAS_AST_SUMMARY: summaryPath, ATLAS_AST_RECEIPT: receiptPath } });
    return { factsPath, summaryPath, facts: fs.readFileSync(factsPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse), summaries: fs.readFileSync(summaryPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse) };
  };
  const first = run('one');
  const second = run('two');
  assert.equal(digest(fs.readFileSync(first.factsPath)), digest(fs.readFileSync(second.factsPath)));
  assert.equal(digest(fs.readFileSync(first.summaryPath)), digest(fs.readFileSync(second.summaryPath)));
  const routeFacts = first.facts.filter((fact) => fact.source_ref === bound.source_ref);
  assert.equal(routeFacts.filter((fact) => fact.fact_kind === 'REQUEST_BODY_READ').length, 2);
  assert.equal(routeFacts.filter((fact) => fact.fact_kind === 'REQUEST_BODY_VALIDATED').length, 1);
  assert.equal(routeFacts.filter((fact) => fact.fact_kind === 'REQUEST_BODY_VALIDATION_UNRESOLVED').length, 1);
  assert.ok(routeFacts.filter((fact) => fact.fact_kind === 'REQUEST_BODY_READ').every((fact) => fact.ast_grep_agrees === true));
  const assignmentFacts = first.facts.filter((fact) => fact.source_ref.endsWith('/assignment/+server.ts'));
  assert.equal(assignmentFacts.filter((fact) => fact.fact_kind === 'REQUEST_BODY_READ').length, 1);
  assert.equal(assignmentFacts.filter((fact) => fact.fact_kind === 'REQUEST_BODY_VALIDATED').length, 1);
  assert.equal(assignmentFacts.filter((fact) => fact.fact_kind === 'REQUEST_BODY_VALIDATION_UNRESOLVED').length, 0);
  assert.equal(routeFacts.some((fact) => fact.fact_kind === 'URL_LITERAL' && fact.literal?.includes('comment.invalid')), false);
  assert.equal(routeFacts[0].workspace_revision, `sha256:${'a'.repeat(64)}`);
  assert.ok(routeFacts.every((fact) => fact.symbol_resolution === 'NOT_VERIFIED'));
  for (const fact of first.facts.filter((entry) => entry.start_byte != null)) {
    const source = fs.readFileSync(path.join(root, fact.source_ref));
    const slice = source.subarray(fact.start_byte, fact.end_byte);
    assert.equal(digest(slice), fact.evidence_digest, `${fact.source_ref}:${fact.start_byte}`);
  }
  const clientSummary = first.summaries.find((row) => row.source_ref.endsWith('/client.ts'));
  assert.equal(clientSummary.REQUEST_BODY_READ, 0);
  assert.equal(clientSummary.unvalidated_request_json, false);
  const svelteSummary = first.summaries.find((row) => row.source_ref.endsWith('/Widget.svelte'));
  assert.equal(svelteSummary.LEGACY_SVELTE_SYNTAX, 2);
  assert.equal(svelteSummary.TODO_COMMENT, 1);
  const invalidSummary = first.summaries.find((row) => row.source_ref === invalidUtf8Ref);
  assert.equal(invalidSummary.analysis_status, 'SOURCE_UTF8_ROUNDTRIP_MISMATCH');
  assert.equal(first.facts.some((fact) => fact.source_ref === invalidUtf8Ref), false);
  const outsideSummary = first.summaries.find((row) => row.source_ref === '../../outside.ts');
  assert.equal(outsideSummary.analysis_status, 'SOURCE_REF_OUTSIDE_REPOSITORY');
  assert.equal(first.facts.some((fact) => fact.source_ref === '../../outside.ts'), false);
  for (const [relative] of files) fs.rmSync(path.join(root, 'sveltekit-frontend', relative), { force: true });
  fs.rmSync(invalidUtf8Path, { force: true });
});
