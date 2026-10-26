import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';
import { parse } from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORPUS_PATH = path.join(ROOT, '.okf/corpora/keyword-corpus.yaml');
const SCHEMA_PATH = path.join(ROOT, '.okf/corpora/keyword-corpus.schema.json');
const REPORT_PATH = path.join(ROOT, 'docs/reports/atlas-taxonomy-glossary-alignment-v1.json');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeSurface(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function buildKeywordTaxonomyCrosswalkV1({ corpus, corpusSha256, schemaSha256, mapping }) {
  assert.equal(corpus.canonical_authority, false);
  assert.equal(corpus.indexing.populated, false);
  assert.equal(corpus.indexing.searchable, false);
  assert.equal(corpus.indexing.qdrant_written, false);

  const rows = corpus.entries.flatMap((entry) => entry.terms.map((term) => {
    const admission = mapping.admissionsByTerm.get(term);
    const mappingStatus = admission?.status ?? 'NO_EXACT_DOMAIN_ALIAS_MATCH';
    const localMatch = mappingStatus === 'ADMITTED';
    return {
      topicKey: entry.id,
      term,
      normalizedTerm: normalizeSurface(term),
      evidenceStatus: entry.evidence_status,
      sourceRefs: [...entry.source_refs].sort(),
      topicMembership: 'REFERENCE_CORPUS_ENTRY',
      exactDomainAliasComparison: localMatch ? 'LOCAL_ALIAS_MATCH_CANDIDATE'
        : mappingStatus === 'AMBIGUOUS' ? 'AMBIGUOUS_DOMAIN_ALIAS_CANDIDATE'
          : 'NO_EXACT_DOMAIN_ALIAS_MATCH',
      localMappingClassId: localMatch ? admission.classId : null,
      conceptResolution: 'NOT_ATTEMPTED_CORPUS_HAS_NO_CANONICAL_CONCEPT_FIELD',
      entityResolution: 'NOT_ATTEMPTED_CORPUS_HAS_NO_CANONICAL_ENTITY_FIELD',
      canonicalAuthority: false,
    };
  })).sort((left, right) => compareText(left.topicKey, right.topicKey)
    || compareText(left.normalizedTerm, right.normalizedTerm)
    || compareText(left.term, right.term));

  const uniqueTerms = new Set(rows.map((row) => row.normalizedTerm));
  const missingSourceRefs = [...new Set(rows.flatMap((row) => row.sourceRefs))]
    .filter((sourceRef) => !fs.existsSync(path.resolve(ROOT, sourceRef)))
    .sort();
  const matched = rows.filter((row) => row.exactDomainAliasComparison === 'LOCAL_ALIAS_MATCH_CANDIDATE').length;
  const ambiguous = rows.filter((row) => row.exactDomainAliasComparison === 'AMBIGUOUS_DOMAIN_ALIAS_CANDIDATE').length;
  const body = {
    schema: 'atlas.okf-keyword-taxonomy-crosswalk.v1',
    status: 'PARTIAL',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_DERIVATION',
    authority: 'DERIVED_REFERENCE_ONLY',
    inputs: {
      corpusPath: '.okf/corpora/keyword-corpus.yaml',
      corpusSha256,
      schemaPath: '.okf/corpora/keyword-corpus.schema.json',
      schemaSha256,
      mappingOwner: 'python/parent_atlas_ontology/domain_mapping.py',
      mappingRevision: mapping.mappingRevision,
    },
    corpusSchemaValidation: 'VALID',
    counts: {
      corpusEntries: corpus.entries.length,
      termOccurrences: rows.length,
      uniqueNormalizedTerms: uniqueTerms.size,
      exactDomainAliasCandidates: matched,
      ambiguousDomainAliasCandidates: ambiguous,
      termsWithoutExactDomainAliasMatch: rows.length - matched - ambiguous,
      missingSourceRefs: missingSourceRefs.length,
    },
    termToTopicStatus: 'DERIVED_FROM_REFERENCE_CORPUS_ENTRY_IDS',
    exactDomainAliasScan: 'CANDIDATE_DISCOVERY_ONLY_NOT_TAXONOMY_RESOLUTION',
    keywordClusteringStatus: 'NOT_RUN_NO_REVIEWED_CLUSTERING_POLICY',
    canonicalResolutionStatus: 'NOT_RUN',
    canonicalEntityResolutionStatus: 'NOT_RUN',
    sourceReferenceCheck: 'PATH_EXISTS_ONLY_NOT_SOURCE_LINEAGE_PROOF',
    corpusIndexingStatus: corpus.indexing.searchable ? 'SEARCHABLE' : 'REFERENCE_ONLY_NOT_SEARCHABLE',
    missingSourceRefs,
    rows,
    repositoryDataWritesPerformed: false,
    reportArtifactWritten: true,
    canonicalAuthority: false,
    nextGate: 'REVIEW_LOCAL_MATCHES_THEN_RESOLVE_CANONICAL_CONCEPTS_WITH_LIVE_POSTGRESQL_OAK_OWNER',
  };
  const checksumBody = { ...body };
  delete checksumBody.generatedAt;
  body.snapshotChecksum = `sha256:${sha256(JSON.stringify(checksumBody))}`;
  return body;
}

function readMappingFromOwner(terms) {
  const pythonRoot = path.join(ROOT, 'python').replaceAll('\\', '/');
  const pythonScript = [
    'import json, sys',
    `sys.path.insert(0, ${JSON.stringify(pythonRoot)})`,
    'from parent_atlas_ontology.domain_mapping import admit_domain_classifications, mapping_revision',
    'terms = json.load(sys.stdin)',
    'admissions = admit_domain_classifications({term: 1.0 for term in terms})',
    'print(json.dumps({"mappingRevision": mapping_revision(), "admissions": [item.to_dict() for item in admissions]}))',
  ].join('\n');
  const output = execFileSync('python', ['-c', pythonScript], {
    cwd: ROOT,
    encoding: 'utf8',
    input: JSON.stringify(terms),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(output);
  return {
    mappingRevision: parsed.mappingRevision,
    admissionsByTerm: new Map(parsed.admissions.map((admission) => [admission.domainLabel, admission])),
  };
}

function loadValidatedCorpus() {
  const corpusBytes = fs.readFileSync(CORPUS_PATH);
  const schemaBytes = fs.readFileSync(SCHEMA_PATH);
  const corpus = parse(corpusBytes.toString('utf8'));
  const schema = JSON.parse(schemaBytes.toString('utf8'));
  const ajv = new Ajv({ allErrors: true, unknownFormats: 'ignore' });
  const validate = ajv.compile(schema);
  if (!validate(corpus)) {
    throw new Error(`KEYWORD_CORPUS_SCHEMA_INVALID:${JSON.stringify(validate.errors)}`);
  }
  return {
    corpus,
    corpusSha256: sha256(corpusBytes),
    schemaSha256: sha256(schemaBytes),
  };
}

async function main() {
  const { corpus, corpusSha256, schemaSha256 } = loadValidatedCorpus();
  const terms = [...new Set(corpus.entries.flatMap((entry) => entry.terms))].sort();
  const mapping = readMappingFromOwner(terms);
  const report = buildKeywordTaxonomyCrosswalkV1({ corpus, corpusSha256, schemaSha256, mapping });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8' });
  process.stdout.write(`${JSON.stringify({
    status: report.status,
    counts: report.counts,
    mappingRevision: report.inputs.mappingRevision,
    snapshotChecksum: report.snapshotChecksum,
    reportPath: path.relative(ROOT, REPORT_PATH).replaceAll('\\', '/'),
    repositoryDataWritesPerformed: report.repositoryDataWritesPerformed,
    reportArtifactWritten: report.reportArtifactWritten,
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
