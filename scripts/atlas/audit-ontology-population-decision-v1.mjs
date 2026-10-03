#!/usr/bin/env node

/**
 * Read-only 14.3b ontology population decision.
 * No tuple, concept, relation, packet, or source writes are permitted here.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const ROOT = process.cwd();
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const outputPath = path.join(ROOT, 'docs/reports/ontology-population-decision-v1.json');
const lineagePath = path.join(ROOT, '.tmp/knowledge-source-snapshot-live-v1.json');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const rel = (filePath) => path.relative(ROOT, filePath).replaceAll('\\', '/');

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  const scalar = async (sql) => Number((await client.query(sql)).rows[0].n);
  const concepts = await scalar('SELECT count(*) AS n FROM atlas_ontology_concepts');
  const relations = await scalar('SELECT count(*) AS n FROM atlas_ontology_relations');
  const tuples = await scalar('SELECT count(*) AS n FROM feature_ontology_tuples');
  const unresolved = await scalar("SELECT count(*) AS n FROM feature_ontology_tuples WHERE resolution_state = 'UNRESOLVED'");
  const unresolvedDomains = await scalar("SELECT count(*) AS n FROM feature_ontology_tuples WHERE predicate IN ('CLASSIFIED_AS','BELONGS_TO_DOMAIN') AND object_type = 'domain' AND resolution_state = 'UNRESOLVED'");
  const unresolvedConceptTags = await scalar("SELECT count(*) AS n FROM feature_ontology_tuples WHERE predicate = 'USES_CONCEPT' AND object_type = 'concept' AND resolution_state = 'UNRESOLVED'");
  const predicates = (await client.query('SELECT predicate, object_type, count(*)::int AS count FROM feature_ontology_tuples GROUP BY predicate, object_type ORDER BY predicate, object_type')).rows;
  const states = (await client.query('SELECT resolution_state, count(*)::int AS count FROM feature_ontology_tuples GROUP BY resolution_state ORDER BY resolution_state')).rows;
  const domains = await scalar('SELECT count(*) AS n FROM atlas_domain_ontology');
  const lineage = JSON.parse(fs.readFileSync(lineagePath, 'utf8'));
  const lineageBlocked = lineage.status === 'BLOCKED' || lineage.worktreeFingerprintParity !== true;

  const receipt = {
    schema: 'atlas.ontology-population-decision.v1',
    generatedAt: new Date().toISOString(),
    gate: '14.3b_ONTOLOGY_POPULATION_DECISION',
    readback: {
      ontologyConceptRows: concepts,
      ontologyRelationRows: relations,
      domainOntologyRows: domains,
      featureOntologyTupleRows: tuples,
      unresolvedTupleRows: unresolved,
      unresolvedDomainTupleRows: unresolvedDomains,
      unresolvedLexicalConceptTagRows: unresolvedConceptTags,
      predicates,
      resolutionStates: states,
    },
    decisions: {
      conceptPopulation: concepts === 0
        ? 'DEFERRED_NO_CANONICAL_CONCEPT_VOCABULARY'
        : 'EXISTS_REQUIRES_LINEAGE_AND_SCHEMA_REVIEW',
      relationPopulation: relations === 0
        ? 'DEFERRED_NO_CANONICAL_CONCEPT_EDGES'
        : 'EXISTS_REQUIRES_LINEAGE_AND_SCHEMA_REVIEW',
      lexicalUsesConcept: unresolvedConceptTags > 0
        ? 'LEXICAL_TAG_EVIDENCE_ONLY'
        : 'NONE',
      exactDomainResolution: unresolvedDomains > 0
        ? 'REHEARSAL_ONLY_LINEAGE_GATE_REQUIRED'
        : 'NO_UNRESOLVED_DOMAIN_TUPLES',
    },
    reasons: [
      'USES_CONCEPT rows are extractor-produced lexical/path tokens and cannot be promoted by renaming them into ontology concepts.',
      'No canonical concept vocabulary or relation edge set currently exists to populate atlas_ontology_concepts or atlas_ontology_relations.',
      'Current source/workspace authority remains blocked, so tuple resolution cannot become canonical even where an exact domain join is mechanically possible.',
      'OAK remains a derived resolver/projection and must not invent packet, source, symbol, or ontology identity.',
    ],
    lineage: {
      source: rel(lineagePath),
      status: lineage.status ?? 'UNKNOWN',
      worktreeFingerprintParity: lineage.worktreeFingerprintParity ?? false,
      blocked: lineageBlocked,
    },
    nextGate: lineageBlocked
      ? 'KNOW-09_SOURCE_AUTHORITY_RECONCILIATION_BEFORE_TUPLE_PROMOTION'
      : 'REVIEW_CANONICAL_DOMAIN_RESOLUTION_AND_CONCEPT_VOCABULARY',
    canonicalAuthority: false,
    writesPerformed: false,
  };
  receipt.checksum = sha256(JSON.stringify({ ...receipt, generatedAt: undefined, checksum: undefined }));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(receipt, null, 2)}\n`);
  fs.renameSync(tempPath, outputPath);
  console.log(JSON.stringify({
    reportPath: outputPath,
    status: receipt.nextGate,
    ontologyConceptRows: concepts,
    ontologyRelationRows: relations,
    unresolvedTuples: unresolved,
    writesPerformed: false,
  }, null, 2));
} finally {
  client.release();
  await pool.end();
}
