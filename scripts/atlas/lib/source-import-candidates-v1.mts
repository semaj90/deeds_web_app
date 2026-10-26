import { createHash } from 'node:crypto';
import path from 'node:path';
import ts from 'typescript';
import { resolveImportSpecifierV1 } from '../../../sveltekit-frontend/src/lib/server/atlas/indexing/graphify-import-target-resolver-v1.ts';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export function extractSourceImportCandidatesV1({ sources, workspaceRevision }: {
  sources: Array<{ sourceRef: string; sourceBytes: Buffer; sourceRevision: string; workspaceRevision: string }>;
  workspaceRevision: string;
}) {
  if (!Array.isArray(sources) || typeof workspaceRevision !== 'string' || !workspaceRevision) {
    throw new TypeError('IMPORT_SOURCE_INPUT_INVALID');
  }
  const byRef = new Map(sources.map(source => [source.sourceRef, source]));
  if (byRef.size !== sources.length) throw new Error('IMPORT_SOURCE_REF_DUPLICATE');
  const knownSourceRefs = new Set(byRef.keys());
  const edges: Array<Record<string, unknown>> = [];
  const unresolved: Array<Record<string, unknown>> = [];
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

  for (const source of [...sources].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef))) {
    if (path.isAbsolute(source.sourceRef) || source.sourceRef.split(/[\\/]/).includes('..')) {
      throw new Error('IMPORT_SOURCE_REF_INVALID');
    }
    const actualRevision = sha256(source.sourceBytes);
    if (actualRevision !== source.sourceRevision.replace(/^sha256:/, '')
      || source.workspaceRevision !== workspaceRevision) throw new Error('IMPORT_SOURCE_REVISION_MISMATCH');
    const extension = path.posix.extname(source.sourceRef).toLowerCase();
    const scriptKind = new Map<string, ts.ScriptKind>([
      ['.ts', ts.ScriptKind.TS], ['.tsx', ts.ScriptKind.TSX], ['.mts', ts.ScriptKind.TS],
      ['.cts', ts.ScriptKind.TS], ['.js', ts.ScriptKind.JS], ['.jsx', ts.ScriptKind.JSX],
      ['.mjs', ts.ScriptKind.JS], ['.cjs', ts.ScriptKind.JS],
    ]).get(extension);
    if (scriptKind === undefined) {
      unresolved.push({ sourceRef: source.sourceRef, status: 'PARSER_UNAVAILABLE_FOR_IMPORT_SCAN', importSpecifier: '', startByte: null, endByte: null });
      continue;
    }
    const text = decoder.decode(source.sourceBytes);
    const sourceFile = ts.createSourceFile(source.sourceRef, text, ts.ScriptTarget.Latest, true, scriptKind);
    const parseDiagnostics = (sourceFile as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
    if (parseDiagnostics.length) {
      unresolved.push({ sourceRef: source.sourceRef, status: 'IMPORT_PARSE_FAILED', diagnosticCount: parseDiagnostics.length, importSpecifier: '', startByte: null, endByte: null });
      continue;
    }
    const visit = (node: ts.Node) => {
      let moduleSpecifier: ts.Expression | undefined;
      let relationKind: 'STATIC_IMPORT' | 'STATIC_REEXPORT' | undefined;
      let typeOnlyClause = false;
      let specifiers: ReadonlyArray<{ isTypeOnly?: boolean }> = [];
      let sideEffectImport = false;
      if (ts.isImportDeclaration(node)) {
        moduleSpecifier = node.moduleSpecifier;
        relationKind = 'STATIC_IMPORT';
        typeOnlyClause = node.importClause?.isTypeOnly === true;
        sideEffectImport = node.importClause === undefined;
        const namedBindings = node.importClause?.namedBindings;
        if (namedBindings && ts.isNamedImports(namedBindings)) specifiers = namedBindings.elements;
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined) {
        moduleSpecifier = node.moduleSpecifier;
        relationKind = 'STATIC_REEXPORT';
        typeOnlyClause = node.isTypeOnly;
        if (node.exportClause && ts.isNamedExports(node.exportClause)) specifiers = node.exportClause.elements;
      }
      if (relationKind && moduleSpecifier && ts.isStringLiteralLike(moduleSpecifier)) {
        const specifier = moduleSpecifier.text;
        const startChar = moduleSpecifier.getStart(sourceFile);
        const endChar = moduleSpecifier.getEnd();
        const startByte = Buffer.byteLength(text.slice(0, startChar), 'utf8');
        const endByte = Buffer.byteLength(text.slice(0, endChar), 'utf8');
        const spanText = text.slice(startChar, endChar);
        if (source.sourceBytes.subarray(startByte, endByte).toString('utf8') !== spanText) {
          throw new Error('IMPORT_SPAN_UTF8_MISMATCH');
        }
        const resolution = resolveImportSpecifierV1(source.sourceRef, specifier, knownSourceRefs);
        if (resolution.status === 'RESOLVED' && resolution.sourceRef) {
          const target = byRef.get(resolution.sourceRef);
          if (!target || target.workspaceRevision !== source.workspaceRevision) throw new Error('IMPORT_TARGET_REVISION_MISMATCH');
          const explicitTypeOnlyCount = specifiers.filter(specifier => specifier.isTypeOnly).length;
          const typeOnlyStatus = typeOnlyClause || (specifiers.length > 0 && explicitTypeOnlyCount === specifiers.length)
            ? 'EXPLICIT_TYPE_ONLY'
            : explicitTypeOnlyCount > 0 ? 'MIXED_TYPE_AND_VALUE' : 'NO_EXPLICIT_TYPE_MODIFIER';
          edges.push({
            sourceNodeKey: `file:${source.sourceRef}`,
            targetNodeKey: `file:${target.sourceRef}`,
            edgeType: relationKind === 'STATIC_IMPORT' ? 'IMPORTS_SOURCE_CANDIDATE' : 'REEXPORTS_SOURCE_CANDIDATE',
            relationKind,
            typeOnlyStatus: sideEffectImport ? 'SIDE_EFFECT_IMPORT' : typeOnlyStatus,
            evidenceStatus: 'EXACT_SOURCE_SPAN_AND_REVISION; STATIC_MODULE_REFERENCE_ONLY; NONCANONICAL',
            sourcePath: source.sourceRef,
            sourceSha256: actualRevision,
            sourceRevision: actualRevision,
            workspaceRevision: source.workspaceRevision,
            targetSourcePath: target.sourceRef,
            targetSourceSha256: target.sourceRevision.replace(/^sha256:/, ''),
            targetWorkspaceRevision: target.workspaceRevision,
            importSpecifier: specifier,
            importSpanText: spanText,
            startByte,
            endByte,
            line1: sourceFile.getLineAndCharacterOfPosition(startChar).line + 1,
            installedVersion: '',
            installedVersionStatus: '',
          });
        } else {
          unresolved.push({
            sourceRef: source.sourceRef,
            status: resolution.status,
            candidates: resolution.candidates,
            importSpecifier: specifier,
            startByte,
            endByte,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  edges.sort((a, b) => String(a.sourcePath).localeCompare(String(b.sourcePath))
    || Number(a.startByte) - Number(b.startByte) || String(a.targetSourcePath).localeCompare(String(b.targetSourcePath)));
  unresolved.sort((a, b) => String(a.sourceRef).localeCompare(String(b.sourceRef))
    || Number(a.startByte ?? -1) - Number(b.startByte ?? -1) || String(a.importSpecifier).localeCompare(String(b.importSpecifier)));
  return { parser: `typescript@${ts.version}`, edges, unresolved };
}
