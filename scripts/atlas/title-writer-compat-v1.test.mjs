import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseTitleWriterV1, extractTitleWriterFactsV1 } from './lib/title-writer-compat-v1.mjs';
import { runTitleWriterAuditV1 } from './audit-title-writers-v1.mjs';

const d = (role, text, opts) => diagnoseTitleWriterV1({ id: 'x', role, file: 'x' }, text, opts);

test('createHash().update() is not a database write', () => {
  assert.equal(extractTitleWriterFactsV1("createHash('sha256').update(`${a}`).digest('hex')").writesDatabase, false);
  assert.equal(extractTitleWriterFactsV1('UPDATE atlas_packets SET title_id = $1 WHERE packet_key = $2').writesDatabase, true);
});
test('label-keyed UPDATE is BLOCKED_AUTHORITY even with a valid format', () => {
  const r = d('LABEL_JOIN_WRITER', 'await c.query(`UPDATE atlas_packets\n SET openspec_id = $1\n WHERE title_id = $2`)');
  assert.equal(r.verdict, 'BLOCKED_AUTHORITY');
  assert.ok(r.findings.some((f) => f.code === 'WRITE_KEYED_BY_TITLE_LABEL_NOT_PACKET_KEY'));
});
test('a WHERE title_id in a separate SELECT string does not flag the UPDATE as label-keyed', () => {
  const text = 'q(`SELECT 1 FROM atlas_packets WHERE title_id = ANY($1)`); q(`UPDATE atlas_packets SET title_id = $1 WHERE packet_key = $2`)';
  assert.equal(extractTitleWriterFactsV1(text).writeKeyedByTitleId, false);
});
test('loose validator and non-collapsing slug are format blocks', () => {
  const r = d('BACKFILL', "const RE=/^title:[a-z0-9-]{0,64}:[0-9a-f]{8}$/; s.replace(/[^a-z0-9]/g, '-'); UPDATE atlas_packets SET title_id=$1 WHERE packet_key=$2; // deterministic-title-v1");
  assert.equal(r.verdict, 'BLOCKED_FORMAT_OR_DERIVATION');
});
test('unknown generator versions block on derivation', () => {
  assert.equal(d('BACKFILL', "const V='deterministic-title-v9'").verdict, 'BLOCKED_FORMAT_OR_DERIVATION');
});
test('a pure generator of a recognized shape is COMPATIBLE_READ_ONLY and never persistence-eligible', () => {
  const r = d('GENERATOR', "export const TITLE_GENERATOR_VERSION = 'semantic-title-v2'; return { titleId: `title:${suffix}` }");
  assert.equal(r.verdict, 'COMPATIBLE_READ_ONLY');
  assert.equal(r.persistenceEligible, false);
  assert.equal(r.writesPerformed, false);
});
test('consumer that regenerates a 2-part id then validates 3-part without recheck is blocked', () => {
  const text = "const CANONICAL_TITLE_RE = /^title:[a-z0-9]+(?:-[a-z0-9]+)*:[a-f0-9]{8}$/;\nif (!CANONICAL_TITLE_RE.test(x)) { y = generateTitleIdentity(k, {}).titleId; }";
  assert.equal(d('CONSUMER', text).verdict, 'BLOCKED_FORMAT_OR_DERIVATION');
});
test('registry version is resolved for files that import it', () => {
  const text = "import { TITLE_GENERATOR_VERSION } from '../../packages/atlas/lib/packet-registry.mjs';\nUPDATE atlas_packets SET title_id=$1 WHERE packet_key=$2";
  const r = d('BACKFILL', text, { registryVersion: 'semantic-title-v1' });
  assert.ok(r.facts.versions.includes('semantic-title-v1'));
  assert.ok(r.findings.some((f) => f.code === 'BACKFILL_VERSION_DIFFERS_FROM_STORED_POPULATION_WOULD_CHANGE_SUFFIXES'));
});

// Regression PIN of the CURRENT repository state (2026-10-11). It is expected to change as writers are fixed;
// update it deliberately, never to make a failing writer look compatible.
test('live pin: every known writer is classified; none is persistence-eligible; counts match', () => {
  const report = runTitleWriterAuditV1();
  const by = Object.fromEntries(report.results.map((r) => [r.id, r.verdict]));
  assert.deepEqual(by, {
    'generator.ace.title-id-generator': 'COMPATIBLE_READ_ONLY',
    'declaration.atlas.packet-registry': 'COMPATIBLE_READ_ONLY',
    'consumer.acp.packet-assembler': 'BLOCKED_FORMAT_OR_DERIVATION',
    'consumer.acp.packet-materializer-pipeline': 'BLOCKED_FORMAT_OR_DERIVATION',
    'backfill.atlas.backfill-title-identity': 'BLOCKED_FORMAT_OR_DERIVATION',
    'backfill.phase-1-title-id-backfill': 'BLOCKED_FORMAT_OR_DERIVATION',
    'promotion.phase-1-promotion-batch': 'BLOCKED_FORMAT_OR_DERIVATION',
    'label-join.derive-openspec-ids': 'BLOCKED_AUTHORITY',
    'label-join.derive-gsd-ids': 'BLOCKED_AUTHORITY',
    'consumer.ace.promotion-enrichment-service': 'BLOCKED_FORMAT_OR_DERIVATION',
    'consumer.retrieval.hydrate-candidates': 'BLOCKED_FORMAT_OR_DERIVATION',
    'reexport.ace.packet-io': 'COMPATIBLE_READ_ONLY',
  });
  assert.ok(report.results.every((r) => r.persistenceEligible === false));
  assert.equal(report.crossChecks[0]?.code, 'REGISTRY_VERSION_DIFFERS_FROM_RUNTIME_GENERATOR');
  assert.equal(report.unclassified.length, 0);
});
