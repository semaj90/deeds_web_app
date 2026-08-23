import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const REPORT_DIR = path.resolve(REPO_ROOT, 'docs/reports');
const INPUT = path.resolve(REPORT_DIR, 'node-tree-sitter-provider-parity-corpus-v2.json');
const OUTPUT_JSON = path.resolve(REPORT_DIR, 'node-tree-sitter-semantic-mismatches-v2.json');
const OUTPUT_MD = path.resolve(REPORT_DIR, 'node-tree-sitter-semantic-mismatches-v2.md');

type Observation = {
  provider: string;
  rawNodeType: string;
  rawKind: string;
  symbolKind: string;
  name: string | null;
  startByte: number;
  endByte: number;
  parentRoute: string[];
  parentContext: string | null;
};

type Pair = {
  name: string;
  left: Observation;
  right: Observation;
  mismatchClasses: string[];
  semanticKindComparable: boolean;
  semanticKindMatch: boolean;
  exactSpanMatch: boolean;
  startByteDelta: number;
  endByteDelta: number;
};

type CorpusFile = {
  sourceRef: string;
  language: string;
  comparison: {
    pairs: Pair[];
  };
};

type CorpusReport = {
  schema: string;
  generatedAt: string;
  status: string;
  gates: Record<string, string>;
  files: CorpusFile[];
};

function route(value: string[] | undefined): string {
  return (value ?? []).join(' > ') || '(root)';
}

const source = JSON.parse(await readFile(INPUT, 'utf8')) as CorpusReport;
const mismatches = source.files.flatMap((file) =>
  file.comparison.pairs
    .filter((pair) => pair.mismatchClasses.some((kind) => kind.startsWith('SEMANTIC_KIND_')))
    .map((pair) => ({
      sourceRef: file.sourceRef,
      language: file.language,
      name: pair.name,
      mismatchClasses: pair.mismatchClasses.filter((kind) => kind.startsWith('SEMANTIC_KIND_')),
      node: {
        provider: pair.left.provider,
        rawNodeType: pair.left.rawNodeType,
        rawKind: pair.left.rawKind,
        symbolKind: pair.left.symbolKind,
        startByte: pair.left.startByte,
        endByte: pair.left.endByte,
        parentContext: pair.left.parentContext,
        parentRoute: pair.left.parentRoute,
      },
      sidecar: {
        provider: pair.right.provider,
        rawNodeType: pair.right.rawNodeType,
        rawKind: pair.right.rawKind,
        symbolKind: pair.right.symbolKind,
        startByte: pair.right.startByte,
        endByte: pair.right.endByte,
        parentContext: pair.right.parentContext,
        parentRoute: pair.right.parentRoute,
      },
      exactSpanMatch: pair.exactSpanMatch,
      startByteDelta: pair.startByteDelta,
      endByteDelta: pair.endByteDelta,
    })),
);

const byShape = new Map<string, number>();
for (const item of mismatches) {
  const key = [
    `${item.node.rawNodeType}/${item.node.rawKind}/${item.node.symbolKind}`,
    '=>',
    `${item.sidecar.rawNodeType}/${item.sidecar.rawKind}/${item.sidecar.symbolKind}`,
    `nodeParent=${item.node.parentContext ?? 'null'}`,
    `sidecarParent=${item.sidecar.parentContext ?? 'null'}`,
  ].join(' ');
  byShape.set(key, (byShape.get(key) ?? 0) + 1);
}

const report = {
  schema: 'atlas.node-tree-sitter-semantic-mismatch-diagnostics.v2',
  sourceReportSchema: source.schema,
  sourceGeneratedAt: source.generatedAt,
  sourceStatus: source.status,
  sourceGates: source.gates,
  mode: 'READ_ONLY_DIAGNOSTIC_NO_GATE_CHANGE',
  semanticMismatchCount: mismatches.length,
  shapeCounts: [...byShape.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([shape, count]) => ({ shape, count })),
  interpretation: {
    canonicalOwnerChanged: false,
    normalizationChanged: false,
    parityGateChanged: false,
    promotionAllowed: false,
    purpose: 'Expose raw provider node kinds and ancestry before deciding whether a provider-neutral declaration class is justified.',
  },
  mismatches,
};

await mkdir(REPORT_DIR, { recursive: true });
await writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(OUTPUT_MD, [
  '# Node Tree-sitter vs 8095 semantic mismatch diagnostics v2',
  '',
  `- source status: **${source.status}**`,
  `- semantic mismatch pairs: ${mismatches.length}`,
  '- mode: `READ_ONLY_DIAGNOSTIC_NO_GATE_CHANGE`',
  '- normalization changed: **false**',
  '- parity gate changed: **false**',
  '- promotion allowed: **false**',
  '',
  '## Mismatch shapes',
  '',
  ...report.shapeCounts.map(({ shape, count }) => `- ${count} × ${shape}`),
  '',
  '## Individual mismatches',
  '',
  ...mismatches.flatMap((item, index) => [
    `### ${index + 1}. ${item.sourceRef} — ${item.name}`,
    '',
    `- mismatch: ${item.mismatchClasses.join(', ')}`,
    `- Node: \`${item.node.rawNodeType}\` / \`${item.node.rawKind}\` → **${item.node.symbolKind}**`,
    `- Node parent: \`${item.node.parentContext ?? 'null'}\`; route: \`${route(item.node.parentRoute)}\``,
    `- 8095: \`${item.sidecar.rawNodeType}\` / \`${item.sidecar.rawKind}\` → **${item.sidecar.symbolKind}**`,
    `- 8095 parent: \`${item.sidecar.parentContext ?? 'null'}\`; route: \`${route(item.sidecar.parentRoute)}\``,
    `- exact span match: ${item.exactSpanMatch}`,
    `- span delta: start ${item.startByteDelta}, end ${item.endByteDelta}`,
    '',
  ]),
  'This report is diagnostic only. Do not promote either provider or relax the corpus parity gate from this output alone.',
  '',
].join('\n'), 'utf8');

console.log(JSON.stringify({
  status: 'SEMANTIC_MISMATCH_DIAGNOSTICS_WRITTEN',
  semanticMismatchCount: mismatches.length,
  outputJson: OUTPUT_JSON,
  outputMarkdown: OUTPUT_MD,
  shapeCounts: report.shapeCounts,
}, null, 2));
