#!/usr/bin/env node
/**
 * MCP Tool Registry Parity Audit (Phase 4 of the Parent Atlas integration audit).
 *
 * Real TypeScript-AST-based (not regex) inventory of every MCP server in this
 * repo, computing LISTED_TOOLS vs DISPATCHED_TOOLS vs registration parity, and
 * flagging LISTED_WITHOUT_HANDLER / HANDLER_WITHOUT_LISTING / DUPLICATE_TOOL_NAME
 * / cross-file identifier-resolved dispatch conditions that could not be
 * resolved without deeper tracing.
 *
 * This script produces evidence, not a verdict — every finding cites file:line.
 * It does not run anything, connect to any service, or modify any file.
 *
 * Usage:
 *   node scripts/atlas/validate-mcp-tool-registry-parity.mjs [--json]
 *
 * Output: writes
 *   docs/reports/parent-atlas-mcp-tool-registry-parity.json
 *   docs/reports/parent-atlas-mcp-tool-registry-parity.md
 * and exits non-zero if LISTED_WITHOUT_HANDLER or HANDLER_WITHOUT_LISTING is
 * non-empty for any array-literal-based server (registerTool-based servers
 * cannot have this class of gap by construction — see NOTE in the report).
 */

import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const JSON_ONLY = process.argv.includes('--json');

const TARGET_FILES = [
{
    id: 'mcp-server',
    relPath: 'sveltekit-frontend/src/mcp/server.ts',
    shape: 'array-literal + switch',
  },
  {
    id: 'trace-mcp-server',
    relPath: 'sveltekit-frontend/src/mcp/trace-mcp-server.ts',
    shape: 'registerTool() calls',
  },
];

function loadSourceFile(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  return ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
}

function stringLiteralValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/** Object literals shaped like a tool definition: { name: '...', description: '...', inputSchema: ... } */
function extractArrayLiteralTools(sourceFile) {
  const found = [];
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      let name = null;
      let hasDescription = false;
      let hasInputSchema = false;
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const propName = prop.name && ts.isIdentifier(prop.name) ? prop.name.text : null;
        if (propName === 'name') name = stringLiteralValue(prop.initializer);
        if (propName === 'description') hasDescription = true;
        if (propName === 'inputSchema') hasInputSchema = true;
      }
      if (name && hasDescription && hasInputSchema) {
        found.push({ name, line: lineOf(sourceFile, node), kind: 'array-literal' });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

/** server.registerTool(name, options, handler) or (server as any).registerTool(...) calls */
function extractRegisterToolCalls(sourceFile) {
  const found = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      let calleeName = null;
      if (ts.isPropertyAccessExpression(expr)) calleeName = expr.name.text;
      if (calleeName === 'registerTool' && node.arguments.length >= 1) {
        const nameArg = node.arguments[0];
        const name = stringLiteralValue(nameArg);
        const handlerArg = node.arguments[node.arguments.length - 1];
        const handlerIsFunction =
          handlerArg &&
          (ts.isArrowFunction(handlerArg) || ts.isFunctionExpression(handlerArg) || ts.isIdentifier(handlerArg));
        found.push({
          name: name ?? `<non-literal:${nameArg.getText(sourceFile)}>`,
          resolved: name !== null,
          line: lineOf(sourceFile, node),
          argCount: node.arguments.length,
          handlerIsFunction: Boolean(handlerIsFunction),
          kind: 'registerTool',
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

/** case 'literal': inside a switch whose discriminant looks like a tool name variable */
function extractSwitchCaseDispatch(sourceFile) {
  const found = [];
  function visit(node) {
    if (ts.isSwitchStatement(node)) {
      const discriminantText = node.expression.getText(sourceFile);
      if (/name|toolname/i.test(discriminantText)) {
        for (const clause of node.caseBlock.clauses) {
          if (ts.isCaseClause(clause)) {
            const value = stringLiteralValue(clause.expression);
            found.push({
              name: value ?? `<non-literal:${clause.expression.getText(sourceFile)}>`,
              resolved: value !== null,
              line: lineOf(sourceFile, clause),
              kind: 'switch-case',
              discriminant: discriminantText,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

/** name === 'literal' / name === Identifier.name / name === Identifier, including ||-chains, inside if conditions */
function extractIfChainDispatch(sourceFile) {
  const found = [];

  function collectEqualityTerms(expr, out) {
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      collectEqualityTerms(expr.left, out);
      collectEqualityTerms(expr.right, out);
      return;
    }
    if (ts.isParenthesizedExpression(expr)) {
      collectEqualityTerms(expr.expression, out);
      return;
    }
    if (
      ts.isBinaryExpression(expr) &&
      (expr.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        expr.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken)
    ) {
      const left = expr.left.getText(sourceFile);
      const right = expr.right;
      if (/name/i.test(left)) {
        out.push(right);
      }
    }
  }

  function visit(node) {
    if (ts.isIfStatement(node)) {
      const terms = [];
      collectEqualityTerms(node.expression, terms);
      for (const term of terms) {
        const literal = stringLiteralValue(term);
        if (literal !== null) {
          found.push({ name: literal, resolved: true, line: lineOf(sourceFile, node), kind: 'if-chain' });
        } else {
          // e.g. LDR_RESEARCH_TOOL.name or a bare identifier — needs cross-file resolution
          found.push({
            name: `<identifier:${term.getText(sourceFile)}>`,
            resolved: false,
            rawExpr: term.getText(sourceFile),
            line: lineOf(sourceFile, node),
            kind: 'if-chain',
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

/** Best-effort: resolve `Identifier.name` or `Identifier` string constants declared as
 *  `export const Identifier = { name: 'literal', ... }` — searches the same file first,
 *  then each statically-imported module path (one hop only; deeper chains are reported
 *  as UNRESOLVED, not guessed). */
function resolveIdentifierDispatchTerms(sourceFile, unresolvedTerms, fileDir) {
  const resolved = [];
  const stillUnresolved = [];

  // Map import specifiers -> local names declared in this file
  const importedFrom = new Map(); // localName -> module specifier
  function collectImports(node) {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      const spec = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
      for (const el of node.importClause.namedBindings.elements) {
        importedFrom.set(el.name.text, spec);
      }
    }
    ts.forEachChild(node, collectImports);
  }
  collectImports(sourceFile);

  // Local top-level const declarations in this same file
  const localConsts = new Map(); // name -> ObjectLiteralExpression
  function collectLocals(node) {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
          localConsts.set(decl.name.text, decl.initializer);
        }
      }
    }
    ts.forEachChild(node, collectLocals);
  }
  collectLocals(sourceFile);

  function nameFromObjectLiteral(obj) {
    for (const prop of obj.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'name') {
        return stringLiteralValue(prop.initializer);
      }
    }
    return null;
  }

  for (const term of unresolvedTerms) {
    const raw = term.rawExpr;
    const rootIdentifier = raw.split('.')[0];
    if (localConsts.has(rootIdentifier)) {
      const value = nameFromObjectLiteral(localConsts.get(rootIdentifier));
      if (value) {
        resolved.push({ ...term, name: value, resolved: true, resolvedVia: 'local-const' });
        continue;
      }
    }
    if (importedFrom.has(rootIdentifier)) {
      const spec = importedFrom.get(rootIdentifier);
      if (spec.startsWith('.')) {
        const candidatePaths = [
          path.resolve(fileDir, spec + '.ts'),
          path.resolve(fileDir, spec.replace(/\.js$/, '.ts')),
          path.resolve(fileDir, spec),
        ];
        let importedFile = candidatePaths.find((p) => fs.existsSync(p));
        if (importedFile) {
          const importedSrc = loadSourceFile(importedFile);
          let value = null;
          function scan(node) {
            if (
              ts.isVariableStatement(node) &&
              node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
            ) {
              for (const decl of node.declarationList.declarations) {
                if (
                  ts.isIdentifier(decl.name) &&
                  decl.name.text === rootIdentifier &&
                  decl.initializer &&
                  ts.isObjectLiteralExpression(decl.initializer)
                ) {
                  value = nameFromObjectLiteral(decl.initializer);
                }
              }
            }
            ts.forEachChild(node, scan);
          }
          scan(importedSrc);
          if (value) {
            resolved.push({
              ...term,
              name: value,
              resolved: true,
              resolvedVia: `imported:${path.relative(REPO_ROOT, importedFile)}`,
            });
            continue;
          }
        }
      }
    }
    stillUnresolved.push(term);
  }
  return { resolved, stillUnresolved };
}

function dedupeCount(entries) {
  const counts = new Map();
  for (const e of entries) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
  return counts;
}

function auditFile(target) {
  const absPath = path.join(REPO_ROOT, target.relPath);
  if (!fs.existsSync(absPath)) {
    return { ...target, error: 'FILE_NOT_FOUND' };
  }
  const sourceFile = loadSourceFile(absPath);
  const fileDir = path.dirname(absPath);

  const arrayLiteralTools = extractArrayLiteralTools(sourceFile);
  const registerToolCalls = extractRegisterToolCalls(sourceFile);
  const switchCases = extractSwitchCaseDispatch(sourceFile);
  const ifChainRaw = extractIfChainDispatch(sourceFile);

  const unresolvedIfTerms = ifChainRaw.filter((t) => !t.resolved);
  const { resolved: newlyResolved, stillUnresolved } = resolveIdentifierDispatchTerms(
    sourceFile,
    unresolvedIfTerms,
    fileDir
  );
  const ifChainDispatch = [...ifChainRaw.filter((t) => t.resolved), ...newlyResolved, ...stillUnresolved];

  // LISTED = array-literal tool defs (Shapes A/B). registerTool calls are both
  // listed AND dispatched simultaneously (Shape C) — they don't participate in
  // the listed/dispatch-gap analysis the same way.
  const listedNames = new Set(arrayLiteralTools.map((t) => t.name));
  const dispatchedEntries = [...switchCases, ...ifChainDispatch].filter((e) => e.resolved);
  const dispatchedNames = new Set(dispatchedEntries.map((e) => e.name));
  const unresolvedDispatchTerms = [...switchCases, ...ifChainDispatch].filter((e) => !e.resolved);

  const listedWithoutHandler = [...listedNames].filter((n) => !dispatchedNames.has(n));
  const handlerWithoutListing = [...dispatchedNames].filter((n) => !listedNames.has(n));

  const listedDupeCounts = dedupeCount(arrayLiteralTools);
  const duplicateListedNames = [...listedDupeCounts.entries()].filter(([, c]) => c > 1);

  const registerToolNames = registerToolCalls.map((c) => c.name);
  const registerToolDupeCounts = dedupeCount(registerToolCalls.filter((c) => c.resolved));
  const duplicateRegisterToolNames = [...registerToolDupeCounts.entries()].filter(([, c]) => c > 1);
  const registerToolMissingHandler = registerToolCalls.filter((c) => c.resolved && !c.handlerIsFunction);
  const registerToolUnresolvedNames = registerToolCalls.filter((c) => !c.resolved);

  return {
    ...target,
    absPath: path.relative(REPO_ROOT, absPath),
    counts: {
      arrayLiteralToolsListed: arrayLiteralTools.length,
      uniqueListedNames: listedNames.size,
      switchCaseDispatch: switchCases.length,
      ifChainDispatch: ifChainRaw.length,
      registerToolCalls: registerToolCalls.length,
      uniqueRegisterToolNames: new Set(registerToolNames).size,
    },
    listedWithoutHandler,
    handlerWithoutListing,
    duplicateListedNames: duplicateListedNames.map(([name, count]) => ({ name, count })),
    duplicateRegisterToolNames: duplicateRegisterToolNames.map(([name, count]) => ({ name, count })),
    registerToolMissingHandler: registerToolMissingHandler.map((c) => ({ name: c.name, line: c.line })),
    registerToolUnresolvedNames: registerToolUnresolvedNames.map((c) => ({ rawExpr: c.name, line: c.line })),
    unresolvedDispatchTerms: unresolvedDispatchTerms.map((t) => ({
      rawExpr: t.rawExpr ?? t.name,
      line: t.line,
      kind: t.kind,
    })),
  };
}

async function main() {
  const results = TARGET_FILES.map((t) => auditFile(t));

  // Cross-file duplicate tool names (a tool name registered/listed in >1 server).
  // Re-run the lightweight name extraction per file (cheap — same files already parsed once).
  const perFileNames = TARGET_FILES.map((t) => {
    const absPath = path.join(REPO_ROOT, t.relPath);
    if (!fs.existsSync(absPath)) return { id: t.id, names: [] };
    const sf = loadSourceFile(absPath);
    const arr = extractArrayLiteralTools(sf).map((x) => x.name);
    const reg = extractRegisterToolCalls(sf)
      .filter((x) => x.resolved)
      .map((x) => x.name);
    return { id: t.id, names: [...new Set([...arr, ...reg])] };
  });
  const crossFileNameMap = new Map();
  for (const { id, names } of perFileNames) {
    for (const n of names) {
      if (!crossFileNameMap.has(n)) crossFileNameMap.set(n, []);
      crossFileNameMap.get(n).push(id);
    }
  }
  const crossFileDuplicateNames = [...crossFileNameMap.entries()]
    .filter(([, files]) => new Set(files).size > 1)
    .map(([name, files]) => ({ name, files: [...new Set(files)] }));

  const report = {
    generatedAt: new Date(0).toISOString().replace(/^[\d-]+T[\d:.]+Z$/, '<not-timestamped-see-git-commit>'),
    scope: 'Phase 4: MCP tool list <-> handler <-> import parity audit',
    method:
      'TypeScript compiler API AST parse of each target file. Not regex-based. ' +
      'Identifier-based dispatch conditions (e.g. name === SOME_CONST.name) resolved ' +
      'one import-hop where possible; unresolved ones are reported explicitly, not guessed.',
    files: results,
    crossFileDuplicateNames,
  };

  const outDir = path.join(REPO_ROOT, 'docs', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'parent-atlas-mcp-tool-registry-parity.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const mdLines = [];
  mdLines.push('# Parent Atlas — MCP Tool Registry Parity Audit');
  mdLines.push('');
  mdLines.push(`Method: ${report.method}`);
  mdLines.push('');
  for (const r of results) {
    mdLines.push(`## ${r.relPath} (${r.shape})`);
    if (r.error) {
      mdLines.push(`- **${r.error}**`);
      mdLines.push('');
      continue;
    }
    mdLines.push('');
    mdLines.push('| Metric | Count |');
    mdLines.push('|---|---|');
    for (const [k, v] of Object.entries(r.counts)) mdLines.push(`| ${k} | ${v} |`);
    mdLines.push('');
    if (r.listedWithoutHandler.length) {
      mdLines.push(`### LISTED_WITHOUT_HANDLER (${r.listedWithoutHandler.length})`);
      r.listedWithoutHandler.forEach((n) => mdLines.push(`- \`${n}\``));
      mdLines.push('');
    }
    if (r.handlerWithoutListing.length) {
      mdLines.push(`### HANDLER_WITHOUT_LISTING (${r.handlerWithoutListing.length})`);
      r.handlerWithoutListing.forEach((n) => mdLines.push(`- \`${n}\``));
      mdLines.push('');
    }
    if (r.duplicateListedNames.length) {
      mdLines.push(`### DUPLICATE_TOOL_NAME in listing (${r.duplicateListedNames.length})`);
      r.duplicateListedNames.forEach(({ name, count }) => mdLines.push(`- \`${name}\` x${count}`));
      mdLines.push('');
    }
    if (r.duplicateRegisterToolNames.length) {
      mdLines.push(`### DUPLICATE_TOOL_NAME in registerTool() calls (${r.duplicateRegisterToolNames.length})`);
      r.duplicateRegisterToolNames.forEach(({ name, count }) => mdLines.push(`- \`${name}\` x${count}`));
      mdLines.push('');
    }
    if (r.registerToolMissingHandler.length) {
      mdLines.push(`### registerTool() call with non-function handler arg (${r.registerToolMissingHandler.length})`);
      r.registerToolMissingHandler.forEach(({ name, line }) => mdLines.push(`- \`${name}\` at line ${line}`));
      mdLines.push('');
    }
    if (r.unresolvedDispatchTerms.length) {
      mdLines.push(`### UNRESOLVED dispatch conditions — needs manual/deeper trace (${r.unresolvedDispatchTerms.length})`);
      r.unresolvedDispatchTerms.forEach(({ rawExpr, line }) => mdLines.push(`- \`${rawExpr}\` at line ${line}`));
      mdLines.push('');
    }
    if (r.registerToolUnresolvedNames.length) {
      mdLines.push(`### registerTool() with non-literal name — needs manual/deeper trace (${r.registerToolUnresolvedNames.length})`);
      r.registerToolUnresolvedNames.forEach(({ rawExpr, line }) => mdLines.push(`- \`${rawExpr}\` at line ${line}`));
      mdLines.push('');
    }
  }
  if (crossFileDuplicateNames.length) {
    mdLines.push(`## Cross-file DUPLICATE_TOOL_NAME (${crossFileDuplicateNames.length})`);
    crossFileDuplicateNames.forEach(({ name, files }) => mdLines.push(`- \`${name}\` in: ${files.join(', ')}`));
    mdLines.push('');
  }
  mdLines.push('## NOTE on registerTool()-based servers');
  mdLines.push(
    '`src/mcp/trace-mcp-server.ts` uses the MCP SDK high-level `registerTool(name, options, handler)` ' +
      'API, where listing and dispatch are the same call — LISTED_WITHOUT_HANDLER / HANDLER_WITHOUT_LISTING ' +
      'cannot occur for these entries by construction. The relevant risk classes for this file instead are: ' +
      'duplicate registrations (later one silently wins), a non-function handler argument, and unresolved ' +
      '(non-literal) tool names — all reported above where found.'
  );
  fs.writeFileSync(path.join(outDir, 'parent-atlas-mcp-tool-registry-parity.md'), mdLines.join('\n') + '\n');

  if (!JSON_ONLY) {
    console.log(mdLines.join('\n'));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  const hasArrayLiteralGaps = results.some(
    (r) => !r.error && (r.listedWithoutHandler.length > 0 || r.handlerWithoutListing.length > 0)
  );
  process.exitCode = hasArrayLiteralGaps ? 1 : 0;
}

main();
