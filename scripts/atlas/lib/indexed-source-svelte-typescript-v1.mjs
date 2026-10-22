import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';

const SHA256 = /^sha256:[0-9a-f]{64}$/;

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function scriptLanguage(script) {
  const attribute = (script.attributes ?? []).find((item) => item.name === 'lang');
  const value = attribute?.value?.map((part) => part.data ?? part.raw ?? '').join('') ?? 'js';
  return value.toLowerCase();
}

function statementKind(ts, statement) {
  if (ts.isVariableStatement(statement)) return 'VariableStatement';
  if (ts.isImportDeclaration(statement)) return 'ImportDeclaration';
  if (ts.isExportDeclaration(statement)) return 'ExportDeclaration';
  if (ts.isFunctionDeclaration(statement)) return 'FunctionDeclaration';
  if (ts.isClassDeclaration(statement)) return 'ClassDeclaration';
  if (ts.isInterfaceDeclaration(statement)) return 'InterfaceDeclaration';
  if (ts.isTypeAliasDeclaration(statement)) return 'TypeAliasDeclaration';
  if (ts.isEnumDeclaration(statement)) return 'EnumDeclaration';
  return ts.SyntaxKind[statement.kind];
}

function statementSymbols(ts, statement, sourceFile) {
  if (ts.isImportDeclaration(statement)) return [statement.moduleSpecifier.text];
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.map((item) => item.name.getText(sourceFile));
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement)) return statement.name ? [statement.name.text] : [];
  if (ts.isExportAssignment(statement)) return ['default'];
  return [];
}

export function analyzeIndexedSvelteTypeScriptV1({ repoRoot, sourceRef, sourceText, sourceBytes, expectedRevision }) {
  if (typeof sourceText !== 'string' || !Buffer.isBuffer(sourceBytes) || !SHA256.test(expectedRevision ?? '') ||
      !sourceRef?.endsWith('.svelte')) throw new Error('SVELTE_SOURCE_INPUT_INVALID');
  if (sha256(sourceBytes) !== expectedRevision) throw new Error('SVELTE_SOURCE_REVISION_MISMATCH');
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
  if (decoded !== sourceText || Buffer.byteLength(sourceText, 'utf8') !== sourceBytes.length) throw new Error('SVELTE_SOURCE_UTF8_MISMATCH');

  const require = createRequire(path.join(repoRoot, 'sveltekit-frontend', 'package.json'));
  const { parse } = require('svelte/compiler');
  const ts = require('typescript');
  const component = parse(sourceText, { modern: true });
  const scripts = [component.module, component.instance].filter(Boolean);
  const toByte = (offset) => Buffer.byteLength(sourceText.slice(0, offset), 'utf8');
  const facts = [];
  const unsupportedLanguages = [];

  for (const [scriptIndex, script] of scripts.entries()) {
    const language = scriptLanguage(script);
    if (!['js', 'javascript', 'ts', 'typescript', 'tsx'].includes(language)) {
      unsupportedLanguages.push(language);
      continue;
    }
    const content = script.content;
    const code = sourceText.slice(content.start, content.end);
    const scriptKind = language === 'tsx' ? ts.ScriptKind.TSX :
      (language === 'ts' || language === 'typescript') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const sourceFile = ts.createSourceFile(`${sourceRef}#script-${scriptIndex}`, code, ts.ScriptTarget.Latest, true, scriptKind);
    if (sourceFile.parseDiagnostics.length > 0) throw new Error(`SVELTE_EMBEDDED_SCRIPT_PARSE_FAILED:${language}`);

    for (const statement of sourceFile.statements) {
      for (const symbol of statementSymbols(ts, statement, sourceFile)) {
        const start = content.start + statement.getStart(sourceFile);
        const end = content.start + statement.end;
        const byteStart = toByte(start);
        const byteEnd = toByte(end);
        if (byteStart < 0 || byteEnd > sourceBytes.length || byteStart >= byteEnd ||
            sourceBytes.subarray(byteStart, byteEnd).toString('utf8') !== sourceText.slice(start, end)) {
          throw new Error('SVELTE_EMBEDDED_SCRIPT_BYTE_SPAN_MISMATCH');
        }
        facts.push({
          scriptIndex,
          scriptContext: script.context,
          language,
          kind: statementKind(ts, statement),
          symbol,
          byteStart,
          byteEnd,
          sourceSpanSha256: sha256(sourceBytes.subarray(byteStart, byteEnd)),
        });
      }
    }
  }

  return {
    status: unsupportedLanguages.length === 0 ? 'OBSERVED' : 'PARTIAL_UNSUPPORTED_SCRIPT_LANGUAGE',
    sourceRef,
    sourceRevision: expectedRevision,
    sourceByteLength: sourceBytes.length,
    svelteCompilerRevision: require('svelte/package.json').version,
    typescriptCompilerRevision: ts.version,
    scriptBlockCount: scripts.length,
    analyzedScriptBlockCount: scripts.length - unsupportedLanguages.length,
    unsupportedLanguages,
    symbolFactCount: facts.length,
    symbolFacts: facts,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
