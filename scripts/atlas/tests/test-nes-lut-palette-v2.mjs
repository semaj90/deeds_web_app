import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_V1_CHECKSUM,
  GROUP_TO_DOMAIN,
  EXTENSIONS,
  validateV1,
  buildPaletteV2,
  extractOntologyGroupIds,
  buildOntologyCrosswalkV2,
} from '../build-nes-lut-palette-v2.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sourcePath = (repoPath, fixturePath) => existsSync(resolve(root, repoPath)) ? resolve(root, repoPath) : resolve(root, fixturePath);
const v1 = JSON.parse(readFileSync(sourcePath('scripts/atlas/data/nes-domain-palette-v1.json','fixtures/nes-domain-palette-v1.json'), 'utf8'));
const yaml = readFileSync(sourcePath('.okf/domains/atlas-domain-taxonomy.yaml','fixtures/atlas-domain-taxonomy.yaml'), 'utf8');
const v2 = buildPaletteV2(v1);
const crosswalk = buildOntologyCrosswalkV2(yaml, v2);

test('v1 baseline checksum, 10 domains, UI color and unknown byte are pinned', () => {
  assert.equal(validateV1(v1).checksum, EXPECTED_V1_CHECKSUM);
  assert.equal(v1.domains.ui.lutByte, 2);
  assert.equal(v1.domains.ui.nesHex, '0x2A');
  assert.equal(v1.unresolved.lutByte, 0);
});

test('v2 is strictly additive: 10 old bytes and colors are bit-identical, four new unique IDs', () => {
  assert.equal(Object.keys(v2.domains).length, 14);
  for (const [domain, entry] of Object.entries(v1.domains)) assert.deepEqual(v2.domains[domain], entry);
  assert.deepEqual(Object.fromEntries(Object.entries(EXTENSIONS).map(([k,v])=>[k,v.lutByte])), {
    compiler: 11, devops: 12, 'error-handling': 13, test: 14,
  });
  assert.equal(new Set(Object.values(v2.domains).map((d)=>d.lutByte)).size, 14);
  assert.equal(new Set(Object.values(v2.domains).map((d)=>d.nesHex)).size, 14);
  assert.equal(v2.status, 'CANDIDATE_NOT_APPLIED');
  assert.equal(v2.canonicalAuthority, false);
});

test('every one of 17 ontology IDs maps to existing v2 domain; children inherit parents', () => {
  assert.equal(extractOntologyGroupIds(yaml).length, 17);
  assert.equal(Object.keys(GROUP_TO_DOMAIN).length, 17);
  assert.equal(crosswalk.rows.length, 17);
  assert.equal(crosswalk.rows.find(r=>r.groupId==='database.postgresql').domain, 'database');
  assert.equal(crosswalk.rows.find(r=>r.groupId==='devops.env-config').domain, 'devops');
  assert.equal(crosswalk.rows.find(r=>r.groupId==='devops.process-mgmt').domain, 'devops');
  assert.equal(crosswalk.rows.find(r=>r.groupId==='frontend.sveltekit').domain, 'ui');
});

test('operator-approved mappings and targeted agent behavior preserved', () => {
  for (const [groupId,domain] of Object.entries({frontend:'ui','machine-learning':'ml',gpu:'ml',api:'network'})) {
    const row=crosswalk.rows.find((r)=>r.groupId===groupId);
    assert.equal(row.domain,domain);
    assert.equal(row.mappingReason.startsWith('OPERATOR_APPROVED'),true);
    assert.equal(row.authoritativeLabel,false);
  }
  assert.equal(crosswalk.rows.some(r=>r.groupId==='agent'),false);
  assert.equal(crosswalk.decision.agent,'TARGETED_REVIEW_CANDIDATES_ONLY');
  assert.equal(crosswalk.decision.unknown,'UNRESOLVED_0x00_NOT_GENERAL');
  assert.equal(v2.domains.general.lutByte,10);
});

test('tampered baseline and unexpected taxonomy fail closed', () => {
  const mutated=structuredClone(v1);
  mutated.domains.ui.nesHex='0x2B';
  assert.throws(()=>validateV1(mutated),/V1_CHECKSUM_INVALID/);
  assert.throws(()=>extractOntologyGroupIds(yaml+'\n- group_id: never-approved\n'),/ONTOLOGY_GROUP_COUNT_OR_DUPLICATE/);
  assert.throws(()=>extractOntologyGroupIds(yaml.replace('- group_id: test', '- group_id: unsupported')),/ONTOLOGY_GROUP_DRIFT/);
});

test('candidate outputs are checksummed and carry no DB or training admission authority', () => {
  assert.match(v2.checksum,/^sha256:[a-f0-9]{64}$/);
  assert.match(crosswalk.checksum,/^sha256:[a-f0-9]{64}$/);
  assert.equal(crosswalk.paletteChecksum,v2.checksum);
  assert.equal(crosswalk.writesPerformed,false);
  assert.equal(crosswalk.canonicalAuthority,false);
  assert.equal(crosswalk.status,'CANDIDATE_NOT_APPLIED');
});
