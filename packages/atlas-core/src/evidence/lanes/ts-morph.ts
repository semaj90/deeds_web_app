import ts from 'typescript';
import type { EvidenceItem } from '../trace-dynamic-context.types.js';

export interface TypeScriptAstEvidenceInput {
  filePath: string;
  sourceText: string;
  sourceRevision?: string;
  targetSymbol?: string;
}

function lineOf(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

function isExported(node: ts.Node): boolean {
  return Boolean((ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) || (node as any).modifiers?.some((m: ts.Modifier) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function declarationName(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isVariableStatement(node)) {
    if (ts.isVariableStatement(node)) {
      const decl = node.declarationList.declarations[0];
      return ts.isIdentifier(decl.name) ? decl.name.text : undefined;
    }
    return node.name?.getText();
  }
  return undefined;
}

export function collectTypeScriptAstEvidence(input: TypeScriptAstEvidenceInput): EvidenceItem[] {
  const sourceFile = ts.createSourceFile(input.filePath, input.sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const evidence: EvidenceItem[] = [];

  for (const statement of sourceFile.statements) {
    if (!isExported(statement)) continue;
    const symbol = declarationName(statement);
    if (!symbol) continue;

    evidence.push({
      kind: 'typescript_ast_export',
      lane: 'typescript_ast',
      status: 'PROVEN',
      source: 'typescript',
      path: input.filePath,
      symbol,
      line: lineOf(sourceFile, statement.getStart(sourceFile)),
      message: `exported ${ts.SyntaxKind[statement.kind]}`,
      revision: input.sourceRevision,
      score: 0.9,
    });
  }

  if (input.targetSymbol) {
    const found = evidence.find((item) => item.symbol === input.targetSymbol);
    if (found) {
      found.score = 1;
    }
  }

  return evidence;
}
