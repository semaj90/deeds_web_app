#!/usr/bin/env node
// Inventory-bound AST observations for proposal-only directory ranking.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const inventoryPath = path.resolve(ROOT, process.env.ATLAS_INV ?? '.tmp/atlas/source_file_inventory-local-snapshot-20261027-v1.parquet');
const bindingsPath = process.env.ATLAS_WSB ? path.resolve(ROOT, process.env.ATLAS_WSB) : null;
const factsPath = path.resolve(ROOT, process.env.ATLAS_AST_OUT ?? '.tmp/atlas/file_ast_facts.jsonl');
const summaryPath = path.resolve(ROOT, process.env.ATLAS_AST_SUMMARY ?? '.tmp/atlas/file_ast_summary.jsonl');
const receiptPath = path.resolve(ROOT, process.env.ATLAS_AST_RECEIPT ?? '.tmp/atlas/file_ast_facts.receipt.json');
const requireFromFrontend = createRequire(path.join(FRONTEND, 'package.json'));
const ts = requireFromFrontend('typescript');
const svelte = requireFromFrontend('svelte/compiler');
const astGrepExe = process.env.ATLAS_AST_GREP_BIN ?? path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@ast-grep', 'cli', 'ast-grep.exe');
const sha = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const byteAt = (text, index) => Buffer.byteLength(text.slice(0, index), 'utf8');
const supported = /\.(?:[cm]?js|[cm]?ts|svelte)$/i;

function readInventory() {
  const sqlPath = inventoryPath.replace(/\\/g, '/').replaceAll("'", "''");
  const output = execFileSync('duckdb', ['-json', '-c', `SELECT source_ref, extension, byte_length, source_digest FROM read_parquet('${sqlPath}') ORDER BY source_ref`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(output);
}

function readBindings() {
  if (!bindingsPath) return new Map();
  const lines = fs.readFileSync(bindingsPath, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const result = new Map();
  for (const line of lines.slice(1)) {
    const [workspace, source, digest] = line.split(',');
    if (workspace && source && digest) result.set(`${source}\0${shaText(digest)}`, workspace);
  }
  return result;
}
const shaText = (hex) => hex.startsWith('sha256:') ? hex : `sha256:${hex}`;

function factBase(file, digest, workspaceRevision, parserOwner, parserVersion, kind, text, start, end, status) {
  const startByte = start == null ? null : byteAt(text, start);
  const endByte = end == null ? null : byteAt(text, end);
  return {
    schema: 'atlas.file-ast-fact.v1', source_ref: file, source_revision: digest,
    workspace_revision: workspaceRevision ?? null, source_digest: digest,
    fact_kind: kind, start_byte: startByte, end_byte: endByte,
    evidence_digest: startByte == null ? digest : sha(Buffer.from(text).subarray(startByte, endByte)),
    parser_owner: parserOwner, parser_version: parserVersion,
    verification_status: status, symbol_resolution: 'NOT_VERIFIED', canonical_authority: false,
  };
}

function scriptFacts(file, digest, workspaceRevision, text) {
  const facts = [];
  const isJs = /\.[cm]?js$/i.test(file);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, isJs ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const add = (kind, node, status = 'OBSERVED_SYNTAX', extra = {}) => facts.push({
    ...factBase(file, digest, workspaceRevision, 'typescript-compiler', ts.version, kind, text, node.getStart(source), node.end, status), ...extra,
  });
  const requestCalls = [];
  const visit = (node) => {
    const receiver = ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) ? node.expression.expression : null;
    const isRequestReceiver = receiver && ((ts.isIdentifier(receiver) && receiver.text === 'request') || (ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'request'));
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'json' && isRequestReceiver) {
      requestCalls.push(node);
      const chainedCatch = ts.isPropertyAccessExpression(node.parent) && node.parent.name.text === 'catch';
      add('REQUEST_BODY_READ', node, 'OBSERVED_SYNTAX', { ast_grep_coverage: chainedCatch ? 'NESTED_CATCH_SELECTOR_NOT_COVERED' : 'DIRECT_SELECTOR_EXPECTED' });
    }
    if (ts.isStringLiteralLike(node) && /(?:https?:\/\/|localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?)/i.test(node.text)) add('URL_LITERAL', node, 'OBSERVED_LITERAL', { literal: node.text });
    if (ts.isTemplateExpression(node) && /(?:https?:\/\/|localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?)/i.test(node.head.text)) add('URL_LITERAL', node, 'OBSERVED_LITERAL', { literal: node.getText(source) });
    ts.forEachChild(node, visit);
  };
  visit(source);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, isJs ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, text);
  let token;
  while ((token = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const start = scanner.getTokenPos(); const end = scanner.getTextPos(); const comment = text.slice(start, end);
    const match = /\b(TODO|FIXME|HACK|XXX)\b/i.exec(comment);
    if (match) facts.push({ ...factBase(file, digest, workspaceRevision, 'typescript-scanner', ts.version, 'TODO_COMMENT', text, start + match.index, start + match.index + match[0].length, 'OBSERVED_COMMENT'), marker: match[0].toUpperCase() });
  }
  for (const call of requestCalls) {
    const containing = (node) => {
      for (let current = node.parent; current; current = current.parent) if (ts.isFunctionLike(current)) return current;
      return source;
    };
    const scope = containing(call);
    const variable = (node) => {
      if (ts.isVariableDeclaration(node) && node.initializer && node.initializer.pos <= call.pos && node.initializer.end >= call.end && ts.isIdentifier(node.name)) return node.name.text;
      let found;
      ts.forEachChild(node, (child) => { if (!found) found = variable(child); });
      return found;
    };
    const payloadName = variable(scope);
    let validator = null;
    const containsRequestRead = (node) => {
      if (node === call) return true;
      let found = false;
      ts.forEachChild(node, (child) => { if (!found) found = containsRequestRead(child); });
      return found;
    };
    const findDirectValidator = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && /^(?:safeParse|parse|safeParseAsync|parseAsync)$/.test(node.expression.name.text) && node.arguments.some(containsRequestRead)) validator = node;
      ts.forEachChild(node, findDirectValidator);
    };
    findDirectValidator(scope);
    if (payloadName) {
      const findValidator = (node) => {
        if (!validator && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && /^(?:safeParse|parse|safeParseAsync|parseAsync)$/.test(node.expression.name.text) && node.arguments.some((arg) => ts.isIdentifier(arg) && arg.text === payloadName)) validator = node;
        ts.forEachChild(node, findValidator);
      };
      findValidator(scope);
    }
    if (validator) add('REQUEST_BODY_VALIDATED', validator, 'REVIEW_REQUIRED_VALIDATOR_CALL_ONLY', { payload_binding: payloadName ?? null, flow_status: payloadName ? 'TEXTUAL_NAME_MATCH_ONLY' : 'DIRECT_CALL_CONTAINS_REQUEST_READ' });
    else add('REQUEST_BODY_VALIDATION_UNRESOLVED', call, 'REVIEW_REQUIRED', { payload_binding: payloadName ?? null, reason: 'BOUNDED_ANALYSIS_DID_NOT_PROVE_VALIDATOR_FLOW' });
  }
  return facts;
}

function svelteFacts(file, digest, workspaceRevision, text) {
  const facts = [];
  let ast;
  try { ast = svelte.parse(text, { modern: true }); }
  catch (error) {
    return [{ ...factBase(file, digest, workspaceRevision, 'svelte-compiler', requireFromFrontend('svelte/package.json').version, 'PARSE_ERROR', text, null, null, 'REVIEW_REQUIRED'), reason: String(error.message).slice(0, 300) }];
  }
  const version = requireFromFrontend('svelte/package.json').version;
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const child of node) visit(child); return; }
    const add = (kind) => {
      if (Number.isInteger(node.start) && Number.isInteger(node.end)) facts.push(factBase(file, digest, workspaceRevision, 'svelte-compiler', version, kind, text, node.start, node.end, 'COMPILER_AST_OBSERVED'));
    };
    if (node.type === 'Comment' && Number.isInteger(node.start) && Number.isInteger(node.end)) {
      const comment = text.slice(node.start, node.end);
      const match = /\b(TODO|FIXME|HACK|XXX)\b/i.exec(comment);
      if (match) facts.push({ ...factBase(file, digest, workspaceRevision, 'svelte-compiler', version, 'TODO_COMMENT', text, node.start + match.index, node.start + match.index + match[0].length, 'OBSERVED_COMMENT'), marker: match[0].toUpperCase() });
    }
    if (node.type === 'OnDirective') add('LEGACY_SVELTE_SYNTAX');
    if (node.type === 'SlotElement' || (node.type === 'RegularElement' && node.name === 'slot')) add('LEGACY_SVELTE_SYNTAX');
    if (node.type === 'LabeledStatement' && node.label?.name === '$') add('LEGACY_SVELTE_SYNTAX');
    if (node.type === 'ExportNamedDeclaration' && node.declaration?.kind === 'let') add('LEGACY_SVELTE_SYNTAX');
    for (const [key, value] of Object.entries(node)) if (key !== 'parent') visit(value);
  };
  visit(ast);
  return facts;
}

const inventory = readInventory();
const bindings = readBindings();
const rows = [];
const summaries = [];
for (const item of inventory) {
  const file = item.source_ref;
  if (!supported.test(file)) continue;
  const fullPath = path.resolve(ROOT, file);
  let status = 'ANALYZED';
  let facts = [];
  if (!fs.existsSync(fullPath)) status = 'SOURCE_MISSING';
  else {
    const bytes = fs.readFileSync(fullPath);
    const digest = sha(bytes);
    if (digest !== shaText(item.source_digest) || bytes.length !== Number(item.byte_length)) status = 'SOURCE_DIGEST_MISMATCH';
    else {
      const text = bytes.toString('utf8');
      const workspaceRevision = bindings.get(`${file}\0${digest}`) ?? null;
      if (!Buffer.from(text, 'utf8').equals(bytes)) status = 'SOURCE_UTF8_ROUNDTRIP_MISMATCH';
      else {
        facts = file.endsWith('.svelte') ? svelteFacts(file, digest, workspaceRevision, text) : scriptFacts(file, digest, workspaceRevision, text);
        if (!facts.length) facts.push(factBase(file, digest, workspaceRevision, file.endsWith('.svelte') ? 'svelte-compiler' : 'typescript-compiler', file.endsWith('.svelte') ? requireFromFrontend('svelte/package.json').version : ts.version, 'NO_MATCHING_FACT', text, null, null, 'ANALYZED_NO_MATCH'));
        rows.push(...facts);
      }
    }
  }
  const digest = item.source_digest;
  const counts = Object.fromEntries(['REQUEST_BODY_READ','REQUEST_BODY_VALIDATED','REQUEST_BODY_VALIDATION_UNRESOLVED','URL_LITERAL','TODO_COMMENT','LEGACY_SVELTE_SYNTAX','PARSE_ERROR'].map((kind) => [kind, facts.filter((fact) => fact.fact_kind === kind).length]));
  summaries.push({ schema: 'atlas.file-ast-summary.v1', source_ref: file, source_revision: digest, source_digest: digest, workspace_revision: bindings.get(`${file}\0${digest}`) ?? null, extension: item.extension, byte_length: Number(item.byte_length), analysis_status: status, is_test: /(?:\.spec|\.test)\.[cm]?ts$/i.test(file), is_route_server: file.endsWith('/+server.ts'), ...counts, unvalidated_request_json: false, review_required_request_json: counts.REQUEST_BODY_VALIDATION_UNRESOLVED });
}
const requestFiles = [...new Set(rows.filter((row) => row.fact_kind === 'REQUEST_BODY_READ' && row.source_ref.endsWith('.ts')).map((row) => row.source_ref))];
const grepMatches = new Set();
for (let offset = 0; offset < requestFiles.length; offset += 80) {
  const batch = requestFiles.slice(offset, offset + 80).map((file) => path.relative(FRONTEND, path.resolve(ROOT, file)).split(path.sep).join('/'));
  for (const pattern of ['request.json()', '$RECEIVER.request.json()']) {
    const result = spawnSync(astGrepExe, ['run', '--pattern', pattern, '--lang', 'ts', '--json=stream', ...batch], { cwd: FRONTEND, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0 && !(result.status === 1 && !result.stderr)) throw new Error(`ast-grep failed (${result.status}): ${String(result.stderr).slice(0, 300)}`);
    for (const line of String(result.stdout).split(/\r?\n/)) {
      if (!line.trim()) continue;
      const match = JSON.parse(line);
      grepMatches.add(`sveltekit-frontend/${match.file.replace(/\\/g, '/')}\0${match.range.byteOffset.start}\0${match.range.byteOffset.end}`);
    }
  }
}
for (const row of rows) if (row.fact_kind === 'REQUEST_BODY_READ' && row.source_ref.endsWith('.ts')) {
  const matched = grepMatches.has(`${row.source_ref}\0${row.start_byte}\0${row.end_byte}`);
  row.ast_grep_agrees = matched ? true : row.ast_grep_coverage === 'NESTED_CATCH_SELECTOR_NOT_COVERED' ? null : false;
  row.ast_grep_check_status = matched ? 'AGREED' : row.ast_grep_coverage === 'NESTED_CATCH_SELECTOR_NOT_COVERED' ? 'SELECTOR_SHAPE_NOT_COVERED' : 'DISAGREEMENT';
  row.independent_parser = 'ast-grep/tree-sitter-typescript';
}
rows.sort((a, b) => a.source_ref.localeCompare(b.source_ref) || a.fact_kind.localeCompare(b.fact_kind) || (a.start_byte ?? -1) - (b.start_byte ?? -1) || (a.end_byte ?? -1) - (b.end_byte ?? -1));
summaries.sort((a, b) => a.source_ref.localeCompare(b.source_ref));
for (const row of rows) if (row.start_byte != null && (row.start_byte < 0 || row.end_byte < row.start_byte)) throw new Error(`invalid UTF-8 span: ${row.source_ref}`);
fs.mkdirSync(path.dirname(factsPath), { recursive: true });
fs.writeFileSync(factsPath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
fs.writeFileSync(summaryPath, summaries.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
const factsBytes = fs.readFileSync(factsPath); const summaryBytes = fs.readFileSync(summaryPath);
const requestReadFacts = rows.filter((row) => row.fact_kind === 'REQUEST_BODY_READ');
const receipt = { schema: 'atlas.file-ast-facts-receipt.v1', inventory: path.relative(ROOT, inventoryPath).replace(/\\/g, '/'), inventory_digest: sha(fs.readFileSync(inventoryPath)), files_considered: summaries.length, facts: rows.length, analyzed_files: summaries.filter((row) => row.analysis_status === 'ANALYZED').length, digest_mismatches: summaries.filter((row) => row.analysis_status === 'SOURCE_DIGEST_MISMATCH').length, utf8_unroundtrippable_files: summaries.filter((row) => row.analysis_status === 'SOURCE_UTF8_ROUNDTRIP_MISMATCH').length, missing_files: summaries.filter((row) => row.analysis_status === 'SOURCE_MISSING').length, workspace_bound_files: summaries.filter((row) => row.workspace_revision).length, request_ast_grep_agreed: requestReadFacts.filter((row) => row.ast_grep_check_status === 'AGREED').length, request_ast_grep_selector_uncovered: requestReadFacts.filter((row) => row.ast_grep_check_status === 'SELECTOR_SHAPE_NOT_COVERED').length, request_ast_grep_disagreements: requestReadFacts.filter((row) => row.ast_grep_check_status === 'DISAGREEMENT').length, facts_path: path.relative(ROOT, factsPath).replace(/\\/g, '/'), facts_digest: sha(factsBytes), summary_path: path.relative(ROOT, summaryPath).replace(/\\/g, '/'), summary_digest: sha(summaryBytes), canonical_authority: false, canonical_store_writes_performed: false, local_artifacts_written: true };
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(receipt, null, 2));
