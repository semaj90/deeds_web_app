import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { classifyDomainTaxonomy, DOMAIN_TAXONOMY_VERSION } from '../../sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts';

const root = resolve(import.meta.dirname, '../..');
const inputPath = resolve(root, '.tmp/atlas/graphify-file-index-v1/ast-entity-identity.jsonl');
const outputPath = resolve(root, '.tmp/atlas/graphify-file-index-v1/ast-entity-okf-domain.jsonl');
const reportPath = resolve(root, 'docs/reports/ast-entity-okf-domain-dry-run-v1.json');

const lines = (await readFile(inputPath, 'utf8')).split(/\r?\n/).filter(Boolean);
const rows = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
const output: Record<string, unknown>[] = [];
const counts = { total: 0, classified: 0, fallback: 0, noEvidence: 0, identityResolved: 0 };

for (const row of rows) {
  const sourceRef = String(row.source_ref ?? '');
  const symbolName = String(row.symbol_name ?? '');
  const classification = classifyDomainTaxonomy({
    sourceRef,
    featureId: String(row.feature_id ?? ''),
    symbol: `${symbolName} ${String(row.symbol_kind ?? '')}`,
    metadata: [String(row.language ?? ''), String(row.primary_domain ?? ''), String(row.domain_class ?? '')].filter(Boolean),
  });
  const subjectRef = `${String(row.packet_key ?? 'packet:unresolved')}#${String(row.entity_id ?? `${row.symbol_kind}:${symbolName}:${row.start_byte}`)}`;
  const classificationId = `classification:${createHash('sha256').update(`${subjectRef}|${DOMAIN_TAXONOMY_VERSION}|${classification.primary_domain ?? 'general'}`).digest('hex').slice(0, 32)}`;
  counts.total += 1;
  if (row.packet_key) counts.identityResolved += 1;
  if (classification.primary_domain) counts.classified += 1;
  else counts.fallback += 1;
  if (classification.evidence.length === 0) counts.noEvidence += 1;
  output.push({
    schema: 'atlas.ast-entity-okf-domain-candidate.v1',
    classification_id: classificationId,
    subject_ref: subjectRef,
    packet_key: row.packet_key ?? null,
    source_ref: sourceRef,
    source_revision: row.source_revision ?? null,
    symbol_name: symbolName,
    symbol_kind: row.symbol_kind ?? null,
    identity_status: row.identity_status ?? 'CANDIDATE',
    domain_id: classification.primary_domain,
    secondary_domains: classification.secondary_domains,
    confidence: classification.confidence,
    evidence: classification.evidence,
    taxonomy_revision: classification.classifier_version,
    validation_status: 'CANDIDATE_ONLY',
    canonical_writes: false,
  });
}

await mkdir(dirname(outputPath), { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(outputPath, output.map((row) => JSON.stringify(row)).join('\n') + (output.length ? '\n' : ''), 'utf8');
const report = {
  schema: 'atlas.ast-entity-okf-domain-dry-run-receipt.v1',
  status: 'READ_ONLY_COMPLETE',
  input: inputPath,
  output: outputPath,
  taxonomy_revision: DOMAIN_TAXONOMY_VERSION,
  counts,
  coverage: {
    identity: counts.total ? counts.identityResolved / counts.total : 0,
    classified: counts.total ? counts.classified / counts.total : 0,
    evidence: counts.total ? (counts.total - counts.noEvidence) / counts.total : 0,
  },
  canonical_writes: false,
  database_writes: false,
  ontology_tuple_writes: false,
};
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 2));
