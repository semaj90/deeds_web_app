#!/usr/bin/env node
// LSP confirmation of SYMBOL_VERSION_VERIFIED import bindings (read-only). Uses the existing compiler-semantic-resolver (typescript-language-server).
// For each verified binding: query textDocument/definition from the import specifier, convert the returned range with the negotiated encoding,
// and compare the target FILE and declared NAME with the defining file/symbol from ImportResolutionV1. Disagreement is a typed failure.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCompilerSemanticResolver } from './lib/compiler-semantic-resolver-v1.mjs';
import { buildLineIndex, rangeToVerifiedByteSpan } from './lib/lsp-position-v1.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const frontendRoot = path.join(root, 'sveltekit-frontend');
const arg = (n, f) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? f;
const resolutions = JSON.parse(fs.readFileSync(path.resolve(root, arg('resolutions', '.tmp/atlas/import-resolution-contract-smoke-20261027.json')), 'utf8'));
const out = path.resolve(root, arg('out', '.tmp/atlas/lsp-import-confirmation-20261027.json'));
if (!out.startsWith(`${path.resolve(root, '.tmp/atlas')}${path.sep}`)) { console.error('OUTPUT_MUST_STAY_UNDER_TMP_ATLAS'); process.exit(2); }
const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const verified = resolutions.records.filter((r) => r.resolution === 'SYMBOL_VERSION_VERIFIED');
const resolver = createCompilerSemanticResolver({ workspaceRoot: frontendRoot, serverBinaryRoot: frontendRoot });
const results = [];
try {
  for (const r of verified) {
    const abs = path.join(root, r.importerSourceRef);
    const buffer = fs.readFileSync(abs); const text = buffer.toString('utf8');
    const rec = { importer: r.importerSourceRef, local: r.localName, imported: r.importedName, expectedFile: r.targetSourceRef, expectedSymbolId: r.targetSymbolId };
    if (sha(buffer) !== r.importerSourceRevision) { results.push({ ...rec, verdict: 'STALE_SOURCE' }); continue; }
    const stmt = new RegExp(`import[^;]*?\\b${r.importedName}\\b[^;]*?from\\s+['"]${r.moduleSpecifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 's').exec(text);
    if (!stmt) { results.push({ ...rec, verdict: 'IMPORT_SITE_NOT_FOUND' }); continue; }
    const nameIdxInStmt = new RegExp(`\\b${r.importedName}\\b`).exec(stmt[0]).index;
    const byteOffset = Buffer.byteLength(text.slice(0, stmt.index + nameIdxInStmt), 'utf8');
    if (buffer.subarray(byteOffset, byteOffset + Buffer.byteLength(r.importedName)).toString('utf8') !== r.importedName) { results.push({ ...rec, verdict: 'SOURCE_OFFSET_MISALIGNED' }); continue; }
    let resolution;
    try {
      resolution = await resolver.resolveDefinition({ requestId: `lsp-confirm:${r.importerSourceRef}:${r.importedName}`, sourceRef: r.importerSourceRef, sourceRevision: r.importerSourceRevision, sourceAbsolutePath: abs, sourceText: text, sourceBuffer: buffer, byteOffset, language: 'typescript', timeoutMs: 45000 });
    } catch (error) { results.push({ ...rec, verdict: 'LSP_ERROR', error: String(error.message).slice(0, 160) }); continue; }
    const status = resolution.result.status;
    const target = resolution.result.targets?.[0];
    if (status !== 'RESOLVED_IN_REPO' || !target?.targetUri) { results.push({ ...rec, verdict: `LSP_${status}` }); continue; }
    const targetPath = fileURLToPath(target.targetUri);
    const targetRel = path.relative(root, targetPath).replaceAll('\\', '/');
    const encoding = resolution.resolver?.negotiatedPositionEncoding === 'utf-8' ? 'utf-8' : 'utf-16';
    let spanText = null; let spanError = null;
    try { spanText = rangeToVerifiedByteSpan(buildLineIndex(fs.readFileSync(targetPath)), target.targetSelectionRange ?? target.targetRange, { encoding }).text; } catch (error) { spanError = error.code ?? String(error.message); }
    const sameFile = targetRel.toLowerCase() === r.targetSourceRef.toLowerCase();
    const nameMatch = spanText !== null && spanText.includes(r.importedName);
    results.push({ ...rec, verdict: sameFile && nameMatch ? 'LSP_CONFIRMS_FILE_AND_NAME' : sameFile ? 'LSP_FILE_MATCH_NAME_MISMATCH' : 'LSP_FILE_DISAGREES', lspTargetFile: targetRel, encoding, spanError, spanTextHead: spanText?.slice(0, 60) ?? null });
  }
} finally { await resolver.dispose(); }
const tally = results.reduce((m, x) => ((m[x.verdict] = (m[x.verdict] ?? 0) + 1), m), {});
const body = { schema: 'atlas.lsp-import-confirmation.v1', mode: 'READ_ONLY', server: 'typescript-language-server via compiler-semantic-resolver-v1', checked: verified.length, byVerdict: tally, results, canonicalAuthority: false, writesPerformed: false };
const receiptSha256 = sha(JSON.stringify(body));
fs.writeFileSync(out, `${JSON.stringify({ ...body, receiptSha256 }, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ checked: body.checked, byVerdict: tally, results: results.map((x) => [x.local, x.verdict, x.lspTargetFile ?? null]), receiptSha256, output: path.relative(root, out), importUrl: pathToFileURL(out).href.length > 0 }, null, 1));
