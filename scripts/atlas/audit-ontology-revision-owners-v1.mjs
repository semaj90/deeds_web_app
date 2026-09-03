import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const reportPath = path.join(root, 'docs/reports/ontology-revision-owner-audit-v1.json');
const files = [
  'packages/parent-atlas/src/core/external-doc-knowledge-fabric.ts',
  'packages/parent-atlas/src/core/ontology-vocabulary-map-v1.ts',
  'sveltekit-frontend/src/lib/server/atlas/okf-topic-ingestion.ts',
  'sveltekit-frontend/src/lib/server/atlas/contracts/ontology-linked-tuple-v1.ts',
  'python/parent_atlas_ontology/domain_mapping.py',
];

const patterns = [
  { name: 'ontologyVersion', regex: /ontology_version:\s*['"]([^'"]+)['"]/g },
  { name: 'ontologyRevision', regex: /ontologyRevision:\s*['"]([^'"]+)['"]/g },
  { name: 'mappingRevision', regex: /mappingRevision:\s*['"]([^'"]+)['"]/g },
  { name: 'sourceRevision', regex: /sourceRevision:\s*[^,\n]+/g },
  { name: 'producerRevision', regex: /producerRevision:\s*[^,\n]+/g },
];

const observations = [];
for (const relativePath of files) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) continue;
  const text = fs.readFileSync(absolutePath, 'utf8');
  const fileChecksum = crypto.createHash('sha256').update(text).digest('hex');
  for (const { name, regex } of patterns) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      observations.push({
        file: relativePath,
        field: name,
        value: match[1] ?? match[0].trim(),
        fileChecksum,
      });
    }
  }
}

const canonicalOntologyRevision = observations.filter(
  (item) => item.field === 'ontologyRevision' && /^sha256:[a-f0-9]{64}$/.test(item.value),
);
const producerLabels = observations.filter(
  (item) => item.field === 'ontologyVersion' || item.value === 'okf-ontology-v1',
);

const report = {
  schema: 'atlas.ontology-revision-owner-audit.v1',
  status: canonicalOntologyRevision.length > 0 ? 'OWNER_CANDIDATE_FOUND' : 'ONTOLOGY_REVISION_OWNER_UNPROVEN',
  readOnly: true,
  canonicalAuthority: false,
  writesPerformed: false,
  scannedFiles: files,
  canonicalOntologyRevisionObservations: canonicalOntologyRevision,
  producerLabelObservations: producerLabels,
  allRevisionObservations: observations,
  admissionDecision: 'EXTERNAL_VOCABULARY_MATCHES_REMAIN_DIAGNOSTIC',
  reason: canonicalOntologyRevision.length > 0
    ? 'A checksum-shaped ontology revision was observed; it still requires owner and evidence validation.'
    : 'Observed ontology version/producer labels do not establish a checksum-sealed ontology revision owner.',
  reportPath: 'docs/reports/ontology-revision-owner-audit-v1.json',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  canonicalOntologyRevisionCount: canonicalOntologyRevision.length,
  producerLabelCount: producerLabels.length,
  writesPerformed: false,
  reportPath: report.reportPath,
}, null, 2));
