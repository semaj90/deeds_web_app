/**
 * P13 & P17 Stratified 50-File AST & CandidateFeatureMatrix Proof
 *
 * Stratifies 50 real repository files across 5 architectural strata (10 files each):
 *  1. UI_SVELTE5       (.svelte components in sveltekit-frontend/src/lib/components)
 *  2. API_ROUTES       (+server.ts routes in sveltekit-frontend/src/routes/api)
 *  3. RETRIEVAL_SEARCH (.ts modules in sveltekit-frontend/src/lib/server/retrieval & search)
 *  4. DB_SCHEMA_VECTOR (.ts modules in sveltekit-frontend/src/lib/server/db & vector)
 *  5. MCP_ATLAS_TOOLS  (.ts/.mjs modules in sveltekit-frontend/src/mcp & scripts/atlas)
 *
 * Verifies:
 *  - Revision-qualified `tree_node_id` (`tn_v1_<32hex>`) failing closed on missing `sha256:` revision
 *  - Exact UTF-8 boundary validation on every extracted symbol/element span
 *  - `CandidateOrdinalMapV1` (50 ordinals, 0..49) + 50x8 `CandidateFeatureMatrix` with explicit presence masks
 *  - Writes: 0 to canonical stores; emits `docs/reports/p13-p17-stratified-feature-cohort-receipt-v1.json`
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { extractSvelteSymbols } from '../graphify/lib/svelte-ast-extractor.mjs';
import { extractSymbolsFromSource } from '../graphify/lib/ts-ast-extractor.mjs';

const ROOT = process.cwd().endsWith('sveltekit-frontend')
  ? path.resolve(process.cwd(), '..')
  : process.cwd();

function collectFiles(dirRel, predicate, limit = 10) {
  const results = [];
  function walk(currRel) {
    if (results.length >= limit) return;
    const abs = path.join(ROOT, currRel);
    if (!fs.existsSync(abs)) return;
    const entries = fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const entry of entries) {
      if (results.length >= limit) break;
      const childRel = path.posix.join(currRel.replace(/\\/g, '/'), entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.svelte-kit') continue;
        walk(childRel);
      } else if (entry.isFile() && predicate(childRel)) {
        results.push(childRel);
      }
    }
  }
  walk(dirRel);
  return results;
}

function mintRevisionQualifiedTreeNodeId({
  sourceRef,
  sourceRevision,
  nodeKind,
  startByte,
  endByte,
  symbolOrTagName,
}) {
  if (!/^sha256:[0-9a-f]{64}$/.test(sourceRevision)) {
    throw new Error(`Invalid sourceRevision for ${sourceRef}: ${sourceRevision}`);
  }
  if (!Number.isInteger(startByte) || !Number.isInteger(endByte) || startByte < 0 || endByte < startByte) {
    throw new Error(`Invalid byte span [${startByte}, ${endByte}] for ${sourceRef}`);
  }
  const canonical = JSON.stringify([
    sourceRef,
    sourceRevision,
    nodeKind,
    startByte,
    endByte,
    symbolOrTagName || '<anonymous>',
  ]);
  const digest = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 32);
  return `tn_v1_${digest}`;
}

function verifyUtf8Span(buf, startByte, endByte) {
  if (startByte < 0 || endByte > buf.byteLength || startByte > endByte) {
    return false;
  }
  if (startByte < buf.byteLength && (buf[startByte] & 0xc0) === 0x80) {
    return false;
  }
  if (endByte < buf.byteLength && (buf[endByte] & 0xc0) === 0x80) {
    return false;
  }
  return true;
}

function extractImportsAndCalls(sourceText) {
  const imports = [];
  const importRe = /import\s+(?:type\s+)?(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(sourceText)) !== null) {
    imports.push(m[1]);
  }
  const calls = [];
  const callRe = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  const keywords = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'import']);
  while ((m = callRe.exec(sourceText)) !== null) {
    if (!keywords.has(m[1])) {
      calls.push(m[1]);
    }
  }
  return { imports, calls };
}

const strataSpecs = [
  {
    stratum: 'UI_SVELTE5',
    weight: 1.0,
    files: collectFiles(
      'sveltekit-frontend/src/lib/components',
      (p) => p.endsWith('.svelte'),
      10
    ),
  },
  {
    stratum: 'API_ROUTES',
    weight: 0.9,
    files: collectFiles(
      'sveltekit-frontend/src/routes/api',
      (p) => p.endsWith('+server.ts'),
      10
    ),
  },
  {
    stratum: 'RETRIEVAL_SEARCH',
    weight: 0.95,
    files: [
      ...collectFiles(
        'sveltekit-frontend/src/lib/server/retrieval',
        (p) => p.endsWith('.ts') && !p.endsWith('.spec.ts') && !p.endsWith('.test.ts'),
        7
      ),
      ...collectFiles(
        'sveltekit-frontend/src/lib/server/search',
        (p) => p.endsWith('.ts') && !p.endsWith('.spec.ts') && !p.endsWith('.test.ts'),
        3
      ),
    ].slice(0, 10),
  },
  {
    stratum: 'DB_SCHEMA_VECTOR',
    weight: 0.85,
    files: [
      ...collectFiles(
        'sveltekit-frontend/src/lib/server/db',
        (p) => p.endsWith('.ts') && !p.endsWith('.spec.ts') && !p.endsWith('.test.ts'),
        7
      ),
      ...collectFiles(
        'sveltekit-frontend/src/lib/server/vector',
        (p) => p.endsWith('.ts') && !p.endsWith('.spec.ts') && !p.endsWith('.test.ts'),
        3
      ),
    ].slice(0, 10),
  },
  {
    stratum: 'MCP_ATLAS_TOOLS',
    weight: 0.8,
    files: [
      ...collectFiles(
        'sveltekit-frontend/src/mcp',
        (p) => p.endsWith('.ts') && !p.endsWith('.spec.ts') && !p.endsWith('.test.ts'),
        4
      ),
      ...collectFiles(
        'scripts/atlas',
        (p) => (p.endsWith('.mjs') || p.endsWith('.mts')) && !p.includes('prove-p13-p17'),
        10
      ),
    ].slice(0, 10),
  },
];

const candidateOrdinals = [];
const featureMatrixRows = [];
const allEdges = [];
let totalNodesMinted = 0;
let spanValidationFailures = 0;

let ordinal = 0;
for (const group of strataSpecs) {
  for (const relPath of group.files) {
    const absPath = path.join(ROOT, relPath);
    const buf = fs.readFileSync(absPath);
    const sourceText = buf.toString('utf8');
    const sourceRevision = `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`;

    const rootTreeNodeId = mintRevisionQualifiedTreeNodeId({
      sourceRef: relPath,
      sourceRevision,
      nodeKind: 'DOCUMENT_ROOT',
      startByte: 0,
      endByte: buf.byteLength,
      symbolOrTagName: path.basename(relPath),
    });
    totalNodesMinted++;

    const { imports, calls } = extractImportsAndCalls(sourceText);
    const importCount = imports.length;
    const callCount = calls.length;

    let symbolCount = 0;
    let runeCount = 0;
    let handlerCount = 0;
    let elementCount = 0;

    if (relPath.endsWith('.svelte')) {
      const svelteSyms = extractSvelteSymbols(sourceText, relPath);
      symbolCount = svelteSyms.length;
      runeCount = svelteSyms.filter((s) => s.kind === 'svelte_rune').length;
      handlerCount = svelteSyms.filter((s) => s.kind === 'svelte_handler').length;
      const htmlTagMatches = sourceText.match(/<[a-zA-Z][a-zA-Z0-9:-]*\b/g) ?? [];
      elementCount = htmlTagMatches.length;

      for (const sym of svelteSyms) {
        const startByte = sym.start_byte;
        const endByte = sym.end_byte;
        if (!verifyUtf8Span(buf, startByte, endByte)) {
          spanValidationFailures++;
        }
        mintRevisionQualifiedTreeNodeId({
          sourceRef: relPath,
          sourceRevision,
          nodeKind: sym.kind,
          startByte,
          endByte,
          symbolOrTagName: sym.name,
        });
        totalNodesMinted++;

        if (sym.kind === 'svelte_rune') {
          allEdges.push({
            sourceFile: relPath,
            targetSpec: `rune:${sym.name.split('(')[0]}`,
            edgeType: 'RUNE_DEPENDENCY',
          });
        } else if (sym.kind === 'svelte_handler') {
          allEdges.push({
            sourceFile: relPath,
            targetSpec: `event:${sym.name}`,
            edgeType: 'EVENT_DISPATCH',
          });
        }
      }
    } else {
      const tsSyms = extractSymbolsFromSource(sourceText, relPath);
      symbolCount = tsSyms.length;

      for (const sym of tsSyms) {
        // ts-ast-extractor uses character offsets in start_byte/end_byte; convert to exact UTF-8 byte offsets
        const startChar = Math.max(0, Math.min(sym.start_byte ?? 0, sourceText.length));
        const endChar = Math.max(startChar, Math.min(sym.end_byte ?? startChar, sourceText.length));
        const startByte = Buffer.byteLength(sourceText.slice(0, startChar), 'utf8');
        const endByte = Buffer.byteLength(sourceText.slice(0, endChar), 'utf8');
        if (!verifyUtf8Span(buf, startByte, endByte)) {
          spanValidationFailures++;
        }
        mintRevisionQualifiedTreeNodeId({
          sourceRef: relPath,
          sourceRevision,
          nodeKind: sym.kind || 'SYMBOL',
          startByte,
          endByte,
          symbolOrTagName: sym.name,
        });
        totalNodesMinted++;
      }
    }

    for (const imp of imports) {
      allEdges.push({
        sourceFile: relPath,
        targetSpec: imp,
        edgeType: 'IMPORTS',
      });
    }
    for (const callee of calls.slice(0, 15)) {
      allEdges.push({
        sourceFile: relPath,
        targetSpec: `call:${callee}`,
        edgeType: 'CALLS',
      });
    }

    const kb = Math.max(buf.byteLength / 1024, 0.1);
    const features = [
      Number(Math.min(kb / 64, 1.0).toFixed(6)),
      Number(Math.min(symbolCount / 25, 1.0).toFixed(6)),
      Number(Math.min(importCount / 20, 1.0).toFixed(6)),
      Number(Math.min(callCount / 50, 1.0).toFixed(6)),
      Number(Math.min(runeCount / 15, 1.0).toFixed(6)),
      Number(Math.min(handlerCount / 15, 1.0).toFixed(6)),
      Number(Math.min(elementCount / 80, 1.0).toFixed(6)),
      group.weight,
    ];

    if (features.some((v) => !Number.isFinite(v))) {
      throw new Error(`Non-finite feature value for ${relPath}`);
    }

    let presenceMask = 0;
    for (let i = 0; i < features.length; i++) {
      if (features[i] > 0) presenceMask |= 1 << i;
    }

    candidateOrdinals.push({
      ordinal,
      stratum: group.stratum,
      sourceRef: relPath,
      sourceRevision,
      rootTreeNodeId,
      bytes: buf.byteLength,
      counts: {
        symbols: symbolCount,
        imports: importCount,
        calls: callCount,
        runes: runeCount,
        handlers: handlerCount,
        elements: elementCount,
      },
      presenceMask,
      missingnessReason: relPath.endsWith('.svelte')
        ? 'NONE'
        : 'NOT_APPLICABLE_NON_SVELTE_TEMPLATE_LANES',
    });

    featureMatrixRows.push({
      ordinal,
      rootTreeNodeId,
      presenceMask,
      features,
    });

    ordinal++;
  }
}

const ordinalMapCanonical = JSON.stringify(
  candidateOrdinals.map((c) => [c.ordinal, c.sourceRef, c.sourceRevision, c.rootTreeNodeId])
);
const ordinalMapChecksum = `sha256:${crypto.createHash('sha256').update(ordinalMapCanonical).digest('hex')}`;

const matrixCanonical = JSON.stringify(featureMatrixRows);
const featureMatrixChecksum = `sha256:${crypto.createHash('sha256').update(matrixCanonical).digest('hex')}`;

const receipt = {
  schema: 'atlas.p13-p17-stratified-feature-cohort-receipt.v1',
  generatedAt: new Date().toISOString(),
  writesPerformed: false,
  cohortSize: candidateOrdinals.length,
  strataCounts: Object.fromEntries(
    strataSpecs.map((s) => [s.stratum, s.files.length])
  ),
  totalRevisionQualifiedTreeNodesMinted: totalNodesMinted,
  utf8SpanValidationFailures: spanValidationFailures,
  ordinalMapChecksum,
  featureMatrixShape: [featureMatrixRows.length, 8],
  featureColumns: [
    'normalizedByteLength',
    'symbolDensity',
    'importDensity',
    'callEdgeDensity',
    'runeDensity',
    'handlerDensity',
    'elementDensity',
    'stratumWeight',
  ],
  featureMatrixChecksum,
  typedEdgeSummary: {
    totalEdgesExtracted: allEdges.length,
    byType: {
      IMPORTS: allEdges.filter((e) => e.edgeType === 'IMPORTS').length,
      CALLS: allEdges.filter((e) => e.edgeType === 'CALLS').length,
      RUNE_DEPENDENCY: allEdges.filter((e) => e.edgeType === 'RUNE_DEPENDENCY').length,
      EVENT_DISPATCH: allEdges.filter((e) => e.edgeType === 'EVENT_DISPATCH').length,
    },
  },
  candidateOrdinals,
  featureMatrixRows,
  admittedEdges: allEdges,
  status:
    candidateOrdinals.length === 50 && spanValidationFailures === 0
      ? 'PASS'
      : 'FAIL',
};

fs.mkdirSync(path.join(ROOT, 'docs/reports'), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, 'docs/reports/p13-p17-stratified-feature-cohort-receipt-v1.json'),
  JSON.stringify(receipt, null, 2) + '\n',
  'utf8'
);

console.log(
  JSON.stringify(
    {
      status: receipt.status,
      cohortSize: receipt.cohortSize,
      strataCounts: receipt.strataCounts,
      totalRevisionQualifiedTreeNodesMinted: receipt.totalRevisionQualifiedTreeNodesMinted,
      utf8SpanValidationFailures: receipt.utf8SpanValidationFailures,
      ordinalMapChecksum: receipt.ordinalMapChecksum,
      featureMatrixChecksum: receipt.featureMatrixChecksum,
      typedEdgeSummary: receipt.typedEdgeSummary,
    },
    null,
    2
  )
);
