import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  adaptToolTrainingExampleToClassificationExample,
} from '../../src/lib/server/atlas/neural-routing/dataset-export.js';
import { stableRoutingChecksum } from '../../src/lib/server/atlas/neural-routing/contracts.js';

const root = path.basename(process.cwd()) === 'sveltekit-frontend'
  ? path.resolve(process.cwd(), '..')
  : process.cwd();
const reportPath = path.join(root, 'docs', 'reports', 'query-routing-classification-export-proof.json');
const exampleBase = {
  schemaVersion: 'atlas.tool-training-example.v1' as const,
  exampleId: 'fixture:query-routing:classification:1',
  requestId: 'fixture-request-1',
  snapshotChecksum: 'a'.repeat(64),
  routingReceiptChecksum: 'b'.repeat(64),
  queryText: 'inspect the Graphify parser failure',
  toolId: 'ast.inspect',
  featureValues: new Array(18).fill(0.1),
  selected: true,
  label: 1,
  utility: 0.8,
  verified: true,
  evidenceRefs: ['fixture:execution-receipt:1'],
};
const example = {
  ...exampleBase,
  checksum: stableRoutingChecksum(exampleBase),
};
const row = adaptToolTrainingExampleToClassificationExample({
  example,
  featureRevision: 'fixture.query-routing-features.r1',
  embedding: null,
  embeddingModelRevision: 'embeddinggemma-300m:r1',
  promptRevision: 'embeddinggemma-classification:p1',
  domainLabel: 'ast',
  operationLabel: 'inspect',
  retrievalNeeds: ['structural', 'semantic'],
  candidateBudget: 128,
  labelRevision: 'fixture.labels.r1',
});
const report = {
  schema: 'atlas.query-routing.classification-export.proof.v1',
  generatedAt: new Date().toISOString(),
  status: 'FIXTURE_PROVEN_LIVE_PRODUCER_NOT_WIRED',
  rows: 1,
  trainingReadyRows: row.status === 'TRAINING_READY' ? 1 : 0,
  featuresOnlyRows: row.status === 'FEATURES_ONLY' ? 1 : 0,
  row,
  liveProducer: 'NOT_PROVEN',
  trainingRun: false,
  canonicalWrites: false,
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, reportPath: path.relative(root, reportPath), canonicalWrites: false }, null, 2));
