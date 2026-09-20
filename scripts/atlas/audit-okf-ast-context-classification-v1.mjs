#!/usr/bin/env node

/**
 * Read-only OKF Slice 3 audit.
 *
 * This classifies placeholder/mock signals with syntax context so the raw
 * grep census is reviewable. It is deliberately advisory: no task, source,
 * database, cache, graph, or model state is changed.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const repoRoot = process.cwd();
const reportPath = path.resolve(repoRoot, process.argv[2] ?? 'docs/reports/okf-ast-context-classification-v1.json');
const markdownPath = reportPath.replace(/\.json$/i, '.md');

const roots = ['sveltekit-frontend/src', 'scripts/atlas'];
const extensions = new Set(['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs']);
const ignored = new Set(['node_modules', '.svelte-kit', 'dist', 'build', 'coverage']);
const signalPattern = /TODO|NOT_IMPLEMENTED|throw\s+new\s+Error\s*\([^\n]*(?:not implemented|unavailable|unsupported|placeholder)/i;
const syntheticPattern = /Math\.random\s*\([^\n]*\b(?:mock|stub|simulate|placeholder|demo)\b|\b(?:mock|stub|placeholder|simulat(?:e|ed|ion))\b/i;

function walk(directory, result = []) {
  if (!fs.existsSync(directory)) return result;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, result);
    else if (extensions.has(path.extname(entry.name).toLowerCase())) result.push(absolute);
  }
  return result;
}

function lineNumber(sourceFile, position) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function syntaxContext(sourceFile, position) {
  const chain = [];
  function visit(node) {
    if (position < node.getFullStart() || position > node.getEnd()) return;
    chain.push(ts.SyntaxKind[node.kind] ?? String(node.kind));
    node.forEachChild(visit);
  }
  visit(sourceFile);
  return chain.slice(-5);
}

function classify({ relativePath, line, sourceText, sourceFile, position }) {
  const lowerPath = relativePath.toLowerCase();
  const lowerLine = line.toLowerCase();
  const context = syntaxContext(sourceFile, position);
  const testOrFixture = /(?:test|spec|fixture|__tests__|mock-data)/i.test(relativePath);
  const demoGated = /(?:process\.env|import\.meta\.env|feature.?flag|allow_.*demo|if\s*\([^)]*(?:demo|fixture|mock|stub))/i.test(line)
    && /(?:demo|fixture|mock|stub|simulate|placeholder)/i.test(lowerLine);
  const throwingStub = /throw\s+new\s+Error\s*\([^\n]*(?:not implemented|unavailable|unsupported|placeholder)/i.test(line);
  const synthetic = syntheticPattern.test(line) || /\b(?:mock|stub|placeholder|simulat(?:e|ed|ion))\b/i.test(line);
  const filenameStub = /(?:mock|stub|fixture|demo)/i.test(path.basename(relativePath));

  let disposition = 'PRODUCTION_REVIEW_REQUIRED';
  if (testOrFixture) disposition = 'TEST_FIXTURE_ACCEPTABLE';
  else if (demoGated) disposition = 'DEMO_FLAG_GATED_REVIEW';
  else if (throwingStub) disposition = 'THROWING_STUB_REVIEW';
  else if (filenameStub && synthetic) disposition = 'UNREFERENCED_OR_SYNTHETIC_STUB_REVIEW';
  else if (synthetic) disposition = 'UNLABELED_SYNTHETIC_PRODUCTION_REVIEW';

  return {
    disposition,
    contextMethod: 'typescript-syntax-context-v1',
    syntaxContext: context,
    isTestOrFixture: testOrFixture,
    isDemoGated: demoGated,
    isThrowingStub: throwingStub,
    isSynthetic: synthetic,
    filenameLooksLikeStub: filenameStub,
    pathKind: lowerPath.includes('/server/') ? 'SERVER' : 'SOURCE',
  };
}

function auditFile(absolutePath) {
  const sourceText = fs.readFileSync(absolutePath, 'utf8');
  const relativePath = path.relative(repoRoot, absolutePath).replaceAll('\\', '/');
  const lines = sourceText.split(/\r?\n/);
  const candidateLines = lines.filter((line) => signalPattern.test(line) || syntheticPattern.test(line));
  if (candidateLines.length === 0) return [];
  const scriptKind = /\.m?tsx?$/.test(absolutePath) ? ts.ScriptKind.TSX : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const rows = [];
  let position = 0;
  for (const [index, line] of lines.entries()) {
    if (signalPattern.test(line) || syntheticPattern.test(line)) {
      const classification = classify({ relativePath, line, sourceText, sourceFile, position });
      rows.push({
        path: relativePath,
        line: index + 1,
        text: line.trim().slice(0, 320),
        ast: classification,
      });
    }
    position += line.length + 1;
  }
  return rows;
}

const files = roots.flatMap((root) => walk(path.resolve(repoRoot, root))).sort();
const findings = files.flatMap(auditFile);
const counts = Object.fromEntries([...new Set(findings.map((row) => row.ast.disposition))].sort().map((key) => [key, findings.filter((row) => row.ast.disposition === key).length]));
const report = {
  schema: 'atlas.okf-ast-context-classification.v1',
  status: 'READ_ONLY_AST_CONTEXT_AUDIT',
  generatedAt: new Date().toISOString(),
  roots,
  filesScanned: files.length,
  findings: findings.length,
  dispositionCounts: counts,
  items: findings,
  policy: {
    astContextIsAdvisory: true,
    llmVerdictRequiredForSummaryOnly: true,
    canonicalAuthority: false,
    promotionAuthorized: false,
    writesPerformed: false,
  },
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
const markdown = [
  '# OKF AST-context classification audit',
  '',
  `Status: ${report.status}`,
  `Files scanned: ${report.filesScanned}`,
  `Findings: ${report.findings}`,
  '',
  '## Dispositions',
  '',
  ...Object.entries(counts).map(([key, value]) => `- ${key}: ${value}`),
  '',
  'This is syntax-context navigation evidence only. It does not establish canonical ownership or authorize mutation.',
  '',
];
fs.writeFileSync(markdownPath, markdown.join('\n'));
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  filesScanned: report.filesScanned,
  findings: report.findings,
  dispositionCounts: counts,
  canonicalAuthority: false,
  writesPerformed: false,
  reportPath: path.relative(repoRoot, reportPath),
}, null, 2));
