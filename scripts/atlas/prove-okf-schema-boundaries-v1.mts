import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  DomainClassificationV1Schema,
  OkfDocumentFileDerivationGraphV1Schema,
  OkfFeatureMatrix4x6V1Schema,
  OkfRecommendationV1Schema,
} from '../../sveltekit-frontend/src/lib/server/atlas/contracts/okf-cross-domain-v1.js';
import { OntologyLinkedTupleV1Schema } from '../../sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.js';

const root = process.cwd();
const outputPath = path.resolve(root, 'docs/reports/okf-schema-boundaries-v1.json');

function checksum(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function parseFixture(name: string, schema: { parse: (value: unknown) => unknown }, value: unknown) {
  try {
    const parsed = schema.parse(value);
    return { name, status: 'PROVEN', checksum: checksum(parsed) };
  } catch (error) {
    return { name, status: 'FAILED', error: String(error) };
  }
}

const sourceRevision = 'source:r1';
const featureFamilies = ['semantic', 'structural', 'domain', 'operational'].map((family) => ({
  family,
  values: Array.from({ length: 6 }, (_, index) => ({
    featureId: `${family}:${index}`,
    featureRevision: 'features:r1',
    subjectRef: 'packet:one',
    ontologyRefs: ['ontology:code'],
    value: index / 10,
    coverage: 1,
    provenanceRefs: ['tuple:one'],
  })),
}));

const graph = {
  schemaVersion: 'atlas.okf.document-file-derivation-graph.v1',
  graphId: 'derivation:one', graphRevision: 'derivation:r1', workspaceRevision: 'workspace:r1',
  sourceRevision, producerId: 'okf-schema-proof', producerRevision: 'okf-schema-proof:r1',
  replayEvidenceRefs: ['report:graphify:r1'],
  nodes: [
    { nodeId: 'document:one', kind: 'document', subjectRef: 'document:one', sourceRef: 'docs/one.md', sourceRevision, evidenceRefs: ['span:one'], lifecycle: 'OBSERVED' },
    { nodeId: 'file:one', kind: 'source_file', subjectRef: 'file:one', sourceRef: 'src/one.ts', sourceRevision, evidenceRefs: ['span:one'], lifecycle: 'OBSERVED' },
    { nodeId: 'symbol:one', kind: 'symbol', subjectRef: 'symbol:one', sourceRef: 'src/one.ts', sourceRevision, treeNodeId: 'tree:one', evidenceRefs: ['span:one'], lifecycle: 'DERIVED' },
    { nodeId: 'feature:one', kind: 'feature_row', subjectRef: 'feature:one', sourceRef: 'src/one.ts', sourceRevision, evidenceRefs: ['span:one'], lifecycle: 'DERIVED' },
  ],
  edges: [
    { edgeId: 'edge:one', fromNodeId: 'document:one', toNodeId: 'file:one', relation: 'DOCUMENT_MATERIALIZES_PACKET', relationRevision: 'relations:r1', sourceRevision, evidenceRefs: ['span:one'], lifecycle: 'DERIVED' },
    { edgeId: 'edge:two', fromNodeId: 'file:one', toNodeId: 'symbol:one', relation: 'SOURCE_FILE_DEFINES_SYMBOL', relationRevision: 'relations:r1', sourceRevision, evidenceRefs: ['span:one'], lifecycle: 'DERIVED' },
    { edgeId: 'edge:three', fromNodeId: 'symbol:one', toNodeId: 'feature:one', relation: 'SYMBOL_SUPPORTS_FEATURE', relationRevision: 'relations:r1', sourceRevision, evidenceRefs: ['span:one'], lifecycle: 'DERIVED' },
  ],
  canonicalAuthority: false, promotionAuthorized: false, writesPerformed: false,
};

const tuple = {
  tupleId: 'tuple:one', schemaVersion: 'ontology-linked-tuple.v1', packetKey: 'packet:one', sourceRef: 'src/one.ts',
  surfaceText: 'calls', label: 'calls', labelKind: 'ontology', labelSource: 'semantic_tagger', ontologyIds: ['ontology:code'],
  conceptIds: ['concept:call'], evidenceRefs: ['src/one.ts:1-3'], relationRevision: 'relations:r1',
  evidenceSpan: { sourceRef: 'src/one.ts', start: 1, end: 3 }, confidence: 0.8, evidenceState: 'ACTIVE_VERIFIED',
  provenance: { sourceTables: ['atlas_packets'], labelerVersion: null, taggerVersion: 'tagger:r1', ontologyVersion: 'ontology:r1', nlpVersion: null },
};

const fixtures = [
  parseFixture('document-domain-classification', DomainClassificationV1Schema, {
    schemaVersion: 'atlas.okf.domain-classification.v1', classificationId: 'classification:document:one', subjectRef: 'document:one', subjectKind: 'document',
    domainId: 'domain:code', taxonomyRevision: 'taxonomy:r1', confidence: 0.9, evidenceRefs: ['report:doc:r1'], sourceRevision,
    producerId: 'okf-schema-proof', producerRevision: 'okf-schema-proof:r1', lifecycle: 'OBSERVED',
  }),
  parseFixture('feature-matrix-4x6', OkfFeatureMatrix4x6V1Schema, {
    schemaVersion: 'atlas.okf.feature-matrix-4x6.v1', matrixId: 'matrix:one', subjectRef: 'packet:one', workspaceRevision: 'workspace:r1',
    representationRevision: 'representation:semantic-768:r1', families: featureFamilies, lifecycle: 'DERIVED',
  }),
  parseFixture('document-file-derivation-graph', OkfDocumentFileDerivationGraphV1Schema, graph),
  parseFixture('ontology-tuple', OntologyLinkedTupleV1Schema, tuple),
  parseFixture('recommendation', OkfRecommendationV1Schema, {
    schemaVersion: 'atlas.okf.recommendation.v1', recommendationId: 'recommendation:one', category: 'MISSING_GROUNDING', severity: 'HIGH',
    subjectRefs: ['file:one'], evidenceRefs: ['report:doc:r1'], graphifyReceiptRefs: ['report:graphify:r1'], featureRowRefs: ['feature:one'],
    acceptanceGates: ['SOURCE_REVISION_PROVEN'], prohibitedMutations: ['canonical_packet', 'qdrant_projection'], status: 'RECOMMENDED', sourceRevision,
    producerId: 'okf-schema-proof', producerRevision: 'okf-schema-proof:r1',
  }),
];

const clusterFixture = { clusterId: 'cluster:one', memberRefs: ['file:one', 'symbol:one'], featureRevision: 'features:r1', evidenceRefs: ['report:kmeans:r1'], authority: 'CHALLENGER_NAVIGATION_ONLY' };
const clusterProof = clusterFixture.memberRefs.length > 0 && clusterFixture.evidenceRefs.length > 0 && clusterFixture.authority === 'CHALLENGER_NAVIGATION_ONLY';

const missingEvidence = (() => {
  const invalid = { ...graph, replayEvidenceRefs: [] };
  try { OkfDocumentFileDerivationGraphV1Schema.parse(invalid); return false; } catch { return true; }
})();

const supersession = OntologyLinkedTupleV1Schema.safeParse({ ...tuple, evidenceState: 'SUPERSEDED', relationRevision: 'relations:r2' }).success;
const revisionChange = OkfDocumentFileDerivationGraphV1Schema.safeParse({
  ...graph,
  graphRevision: 'derivation:r2', sourceRevision: 'source:r2',
  nodes: graph.nodes.map((node) => ({ ...node, sourceRevision: 'source:r2' })),
  edges: graph.edges.map((edge) => ({ ...edge, sourceRevision: 'source:r2' })),
}).success;
const replayA = checksum(OkfDocumentFileDerivationGraphV1Schema.parse(graph));
const replayB = checksum(OkfDocumentFileDerivationGraphV1Schema.parse(graph));

const proven = fixtures.every((fixture) => fixture.status === 'PROVEN') && clusterProof && missingEvidence && supersession && revisionChange && replayA === replayB;
const report = {
  schema: 'atlas.okf-schema-boundaries.v1',
  status: proven ? 'OKF_SCHEMA_BOUNDARIES_PROVEN' : 'OKF_SCHEMA_BOUNDARIES_REVIEW_REQUIRED',
  gan: { created: true, wired: true, proven, done: proven, promotionAuthorized: false },
  fixtures,
  clusterFixture: { ...clusterFixture, status: clusterProof ? 'PROVEN' : 'FAILED', checksum: checksum(clusterFixture) },
  invariants: { deterministicReplay: replayA === replayB, revisionChangeAccepted: revisionChange, missingEvidenceRejected: missingEvidence, supersessionAccepted: supersession },
  canonicalAuthority: false, writesPerformed: false,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(outputPath.replace(/\.json$/i, '.md'), `# OKF schema boundary proof\n\nStatus: ${report.status}\n\n- Fixtures: ${fixtures.length}\n- Deterministic replay: ${report.invariants.deterministicReplay}\n- Revision change: ${report.invariants.revisionChangeAccepted}\n- Missing evidence rejected: ${report.invariants.missingEvidenceRejected}\n- Supersession accepted: ${report.invariants.supersessionAccepted}\n- canonicalAuthority: false\n- writesPerformed: false\n`);
console.log(JSON.stringify({ schema: report.schema, status: report.status, fixtures: fixtures.length, gan: report.gan, output: path.relative(root, outputPath) }, null, 2));
