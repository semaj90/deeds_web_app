#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { walkFiles, readTextSafe, directoryOf } from './lib/repo-walk.mjs';
import { buildImportGraph, graphDegrees } from './lib/import-graph.mjs';
import { classifyText, ATLAS_TAXONOMY_V2 } from './lib/taxonomy.mjs';
import { semanticChecksum } from './lib/stable-json.mjs';
import { readGraphifyEvidence } from './lib/graphify-evidence.mjs';

const root = path.resolve(process.argv[2] ?? process.cwd());
const outputPath = path.resolve(process.argv[3] ?? path.join(root, 'docs/reports/openspec-directory-graph-v1.json'));
const maxFiles = Number(process.env.ATLAS_AUDIT_MAX_FILES ?? 150000);

const files = walkFiles(root, { maxFiles });
const { edges, externalImports } = buildImportGraph(files);
const degree = graphDegrees(files, edges);
const graphify = readGraphifyEvidence(root, files.map((f) => f.path));
const graphifyFiles = new Set(graphify.edges.flatMap((e) => [e.from, e.to]));
const byDirectory = new Map();
const topicCounts = new Map();

const fileNodes = files.map((file) => {
  const text = readTextSafe(file.fullPath, 300_000) ?? '';
  const classification = classifyText(`${file.path}\n${text.slice(0, 80_000)}`);
  topicCounts.set(classification.primary, (topicCounts.get(classification.primary) ?? 0) + 1);
  const dir = directoryOf(file.path);
  const d = byDirectory.get(dir) ?? { directory: dir, files: 0, bytes: 0, topics: new Map(), inbound: 0, outbound: 0 };
  d.files++;
  d.bytes += file.bytes;
  d.topics.set(classification.primary, (d.topics.get(classification.primary) ?? 0) + 1);
  byDirectory.set(dir, d);
  const g = degree.get(file.path) ?? { in: 0, out: 0 };
  return {
    path: file.path,
    directory: dir,
    extension: file.extension,
    bytes: file.bytes,
    primaryTopic: classification.primary,
    secondaryTopics: classification.secondary,
    concepts: classification.concepts.slice(0, 20),
    graph: { inboundImports: g.in, outboundImports: g.out },
    treeNodeEvidence: /\b(tree[_ -]?node|treeNodeId|node_id|ast_path|parent_ast_path)\b/i.test(text) || Number(graphify.treeNodes[file.path] ?? 0) > 0,
    graphifyTreeNodeCount: Number(graphify.treeNodes[file.path] ?? 0),
    openspecEvidence: /\bopenspec\b/i.test(text),
    graphifyEvidence: /\bgraphify\b/i.test(text) || graphifyFiles.has(file.path)
  };
});

for (const edge of edges) {
  const from = directoryOf(edge.from), to = directoryOf(edge.to);
  const a = byDirectory.get(from), b = byDirectory.get(to);
  if (a) a.outbound++;
  if (b) b.inbound++;
}

const directories = [...byDirectory.values()].map((d) => ({
  directory: d.directory,
  files: d.files,
  bytes: d.bytes,
  inboundEdges: d.inbound,
  outboundEdges: d.outbound,
  topics: [...d.topics.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).map(([topic,count]) => ({ topic, count }))
})).sort((a,b) => b.files-a.files || a.directory.localeCompare(b.directory));

const crossDirectoryEdges = new Map();
for (const edge of edges) {
  const from = directoryOf(edge.from), to = directoryOf(edge.to);
  if (from === to) continue;
  const key = `${from}\u0000${to}`;
  crossDirectoryEdges.set(key, (crossDirectoryEdges.get(key) ?? 0) + 1);
}

const report = {
  schema: 'atlas.openspec-directory-graph.v1',
  root,
  generatedAt: new Date().toISOString(),
  summary: {
    files: fileNodes.length,
    directories: directories.length,
    importEdges: edges.length,
    crossDirectoryEdges: crossDirectoryEdges.size,
    treeNodeEvidenceFiles: fileNodes.filter((x) => x.treeNodeEvidence).length,
    graphifyEvidenceFiles: fileNodes.filter((x) => x.graphifyEvidence).length,
    graphifyArtifacts: graphify.artifacts.length,
    graphifyArtifactsSkipped: graphify.skippedArtifacts.length,
    graphifyRelationEdges: graphify.edges.length,
    openspecEvidenceFiles: fileNodes.filter((x) => x.openspecEvidence).length
  },
  taxonomy: ATLAS_TAXONOMY_V2.map(({id,label,concepts}) => ({ id,label,concepts })),
  topicCounts: [...topicCounts.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).map(([topic,count]) => ({topic,count})),
  directories,
  graphify: { artifacts: graphify.artifacts, skippedArtifacts: graphify.skippedArtifacts, relationEdges: graphify.edges, treeNodeCounts: graphify.treeNodes },
  directoryEdges: [...crossDirectoryEdges.entries()].map(([key,count]) => {
    const [from,to] = key.split('\u0000'); return { from,to,count,relation:'imports' };
  }).sort((a,b) => b.count-a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
  files: fileNodes,
  fileEdges: edges,
  externalImports: externalImports.slice(0, 250),
  caveats: [
    'Import edges are lexical resolution, not AST call/reference authority.',
    'Graphify edges/tree nodes are included only when explicit fields match repository files; artifact presence alone does not make them canonical authority.',
    'treeNodeEvidence only records fields/text observed in files; it does not prove canonical tree-node ownership.',
    'Taxonomy labels are deterministic navigation metadata and do not alter OpenSpec execution state.'
  ],
  writesPerformed: false
};
report.semanticChecksum = semanticChecksum(report);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ outputPath, ...report.summary, semanticChecksum: report.semanticChecksum }, null, 2));
