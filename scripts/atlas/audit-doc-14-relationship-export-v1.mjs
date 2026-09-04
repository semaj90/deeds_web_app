/** Read-only DOC-14 audit over the bounded Neo4j -> NetworkX export. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inputPath = path.resolve(root, 'docs/reports/parent-atlas/doc-14-neo4j-networkx-export-v1.json');
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-14-relationship-export-audit-v1.json');
const expected = ['DOCUMENTED_BY', 'REQUIRES', 'SUPPORTS', 'USES', 'RELATED_TO'];
const input = JSON.parse(await fs.readFile(inputPath, 'utf8'));
const edges = input.graph?.links ?? input.links ?? [];
const relationCounts = Object.fromEntries(expected.map((name) => [name, edges.filter((edge) => edge.relation_type === name).length]));
const observedTypes = [...new Set(edges.map((edge) => edge.relation_type).filter(Boolean))].sort();
const report = {
  schema: 'atlas.doc-14-relationship-export-audit.v1',
  gate: 'DOC-14',
  status: expected.every((name) => relationCounts[name] > 0) ? 'DOC_14_RELATION_TYPES_OBSERVED' : 'DOC_14_RELATION_TYPES_NOT_PROVEN',
  inputPath: 'docs/reports/parent-atlas/doc-14-neo4j-networkx-export-v1.json',
  graphRevision: input.graphRevision ?? null,
  projectionChecksum: input.projectionChecksum ?? null,
  observedTypes,
  expectedRelationCounts: relationCounts,
  revisionCoverage: input.coverage ?? null,
  canonicalAuthority: false,
  writesPerformed: false,
  nextGate: 'DOC_14_BOUNDED_DOCUMENT_RELATION_ADMISSION',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'DOC_14_RELATION_TYPES_OBSERVED') process.exitCode = 2;
