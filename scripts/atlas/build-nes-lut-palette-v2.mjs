#!/usr/bin/env node
/**
 * Candidate-only, additive extension of Parent Atlas NES domain palette.
 * DO NOT modify nes-domain-palette-v1.json or the generated .okf ontology YAML.
 * No PostgreSQL, Valkey, classifier, or inference writes.
 *
 * Usage from repo root:
 *   node scripts/atlas/build-nes-lut-palette-v2.mjs            # verify existing candidate
 *   node scripts/atlas/build-nes-lut-palette-v2.mjs --write    # create candidate only, refuses overwrite
 *   node scripts/atlas/build-nes-lut-palette-v2.mjs --root <repo>
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED_V1_CHECKSUM = 'sha256:e1b8ccdc6661a3faed3316cf276f01dd16a1edf80a9aba2d465def40461b9b0f';
const hash = (v) => `sha256:${createHash('sha256').update(v).digest('hex')}`;
const assert = (ok, code) => { if (!ok) throw new Error(code); };

export const EXTENSIONS = Object.freeze({
  compiler: { lutByte: 0x0B, nesHex: '0x17', label: 'DOM_COMPILER_AST_TOOLING', priorWeight: 0.5 },
  devops: { lutByte: 0x0C, nesHex: '0x28', label: 'DOM_DEVOPS_INFRA_RUNTIME', priorWeight: 0.5 },
  'error-handling': { lutByte: 0x0D, nesHex: '0x26', label: 'DOM_ERROR_RECOVERY', priorWeight: 0.5 },
  test: { lutByte: 0x0E, nesHex: '0x2B', label: 'DOM_TEST_VERIFICATION', priorWeight: 0.5 },
});

/** All 17 ontology IDs from .okf YAML, including four children. */
export const GROUP_TO_DOMAIN = Object.freeze({
  api: ['network', 'OPERATOR_APPROVED_ROLLUP'],
  auth: ['auth', 'EXACT_NAME'],
  cache: ['cache', 'EXACT_NAME'],
  compiler: ['compiler', 'NEW_DOMAIN_CANDIDATE'],
  database: ['database', 'EXACT_NAME'],
  'database.postgresql': ['database', 'PARENT_INHERITED'],
  devops: ['devops', 'NEW_DOMAIN_CANDIDATE'],
  'devops.env-config': ['devops', 'PARENT_INHERITED'],
  'devops.process-mgmt': ['devops', 'PARENT_INHERITED'],
  'error-handling': ['error-handling', 'NEW_DOMAIN_CANDIDATE'],
  frontend: ['ui', 'OPERATOR_APPROVED_ROLLUP'],
  'frontend.sveltekit': ['ui', 'PARENT_INHERITED'],
  gpu: ['ml', 'OPERATOR_APPROVED_LOSSY'],
  graph: ['graph', 'EXACT_NAME'],
  'machine-learning': ['ml', 'OPERATOR_APPROVED_ROLLUP'],
  retrieval: ['retrieval', 'EXACT_NAME'],
  test: ['test', 'NEW_DOMAIN_CANDIDATE'],
});

export function validateV1(v1) {
  assert(v1?.schema === 'atlas.nes-domain-palette.v1' && v1?.revision === 'nes-domain-palette-v1', 'V1_SCHEMA_INVALID');
  const { checksum, ...unsigned } = v1;
  assert(checksum === hash(JSON.stringify(unsigned)), 'V1_CHECKSUM_INVALID');
  assert(checksum === EXPECTED_V1_CHECKSUM, 'V1_BASELINE_DRIFT');
  assert(v1.unresolved?.lutByte === 0, 'UNRESOLVED_MUST_BE_ZERO');
  const domains = v1.domains;
  assert(domains && Object.keys(domains).length === 10, 'V1_DOMAIN_COUNT_MISMATCH');
  const values = Object.values(domains).map((d) => d.lutByte);
  assert(values.every((b) => Number.isInteger(b) && b >= 1 && b <= 10) && new Set(values).size === 10, 'V1_DOMAIN_BYTES_INVALID');
  assert(domains.ui?.lutByte === 2 && domains.ui?.nesHex === '0x2A', 'UI_DOMAIN_COLOR_DRIFT');
  return v1;
}

export function buildPaletteV2(v1) {
  validateV1(v1);
  const domains = { ...v1.domains };
  for (const [name, info] of Object.entries(EXTENSIONS)) {
    assert(!Object.hasOwn(domains, name), 'EXTENSION_COLLIDES_WITH_BASELINE');
    domains[name] = { ...info };
  }
  const bytes = Object.values(domains).map((d) => d.lutByte);
  const colors = Object.values(domains).map((d) => d.nesHex);
  assert(bytes.length === 14 && new Set(bytes).size === 14, 'DOMAIN_BYTES_NOT_UNIQUE');
  assert(colors.length === 14 && new Set(colors).size === 14, 'PALETTE_COLORS_NOT_UNIQUE');
  assert(bytes.every((b) => Number.isInteger(b) && b >= 1 && b <= 0xFF), 'DOMAIN_BYTE_OUT_OF_RANGE');
  assert(colors.every((c) => /^0x(?:[0-2][0-9a-fA-F]|3[0-9a-fA-F])$/.test(c)), 'NES_COLOR_INVALID');
  const unsigned = {
    schema: 'atlas.nes-domain-palette.v2',
    revision: 'nes-domain-palette-v2-candidate',
    status: 'CANDIDATE_NOT_APPLIED',
    canonicalAuthority: false,
    baselineV1Checksum: v1.checksum,
    unresolved: { ...v1.unresolved },
    domains,
    subLabels: { ...v1.subLabels },
  };
  return { ...unsigned, checksum: hash(JSON.stringify(unsigned)) };
}

export function extractOntologyGroupIds(yaml) {
  const found = [...yaml.matchAll(/^\s*- group_id: ([a-z]+(?:-[a-z]+)*(?:\.[a-z]+(?:-[a-z]+)*)?)\s*$/gm)].map((m) => m[1]);
  assert(found.length === 17 && new Set(found).size === 17, 'ONTOLOGY_GROUP_COUNT_OR_DUPLICATE');
  const expected = Object.keys(GROUP_TO_DOMAIN).sort();
  assert(JSON.stringify(found.sort()) === JSON.stringify(expected), 'ONTOLOGY_GROUP_DRIFT');
  return found;
}

export function buildOntologyCrosswalkV2(yaml, v2) {
  const sourceGroups = extractOntologyGroupIds(yaml);
  assert(v2?.schema === 'atlas.nes-domain-palette.v2' && v2?.status === 'CANDIDATE_NOT_APPLIED', 'PALETTE_V2_NOT_CANDIDATE');
  const rows = sourceGroups.map((groupId) => {
    const [domain, reason] = GROUP_TO_DOMAIN[groupId];
    const entry = v2.domains[domain];
    assert(entry, `MISSING_DOMAIN:${domain}`);
    return {
      groupId, domain, lutByte: entry.lutByte, nesHex: entry.nesHex,
      mappingReason: reason, authoritativeLabel: false,
    };
  });
  const unsigned = {
    schema: 'atlas.domain-ontology-nes-crosswalk.v2-candidate',
    status: 'CANDIDATE_NOT_APPLIED',
    canonicalAuthority: false,
    writesPerformed: false,
    sourceTaxonomyYamlSha256: hash(Buffer.from(yaml, 'utf8')),
    paletteRevision: v2.revision,
    paletteChecksum: v2.checksum,
    decision: {
      approvedRollups: ['frontend->ui', 'machine-learning->ml', 'gpu->ml', 'api->network'],
      requestedNewDomains: ['compiler', 'devops', 'error-handling', 'test'],
      agent: 'TARGETED_REVIEW_CANDIDATES_ONLY',
      unknown: 'UNRESOLVED_0x00_NOT_GENERAL',
      note: 'Operator decisions captured as candidate; exact group names are vocabulary matches, not human-reviewed row labels.',
    },
    rows,
    sourceGroupCount: rows.length,
    paletteDomainCount: Object.keys(v2.domains).length,
  };
  return { ...unsigned, checksum: hash(JSON.stringify(unsigned)) };
}

export function generate(root) {
  const v1 = JSON.parse(readFileSync(resolve(root, 'scripts/atlas/data/nes-domain-palette-v1.json'), 'utf8'));
  const yaml = readFileSync(resolve(root, '.okf/domains/atlas-domain-taxonomy.yaml'), 'utf8');
  const palette = buildPaletteV2(v1);
  const crosswalk = buildOntologyCrosswalkV2(yaml, palette);
  return { palette, crosswalk };
}

function asCanonicalJson(obj) { return JSON.stringify(obj, null, 2) + '\n'; }
function safeWriteOrVerify(path, data, write) {
  if (write) {
    assert(!existsSync(path), `REFUSE_OVERWRITE:${path}`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data, { encoding: 'utf8', flag: 'wx' });
  } else {
    assert(existsSync(path), `CANDIDATE_FILE_MISSING:${path}`);
    assert(readFileSync(path, 'utf8') === data, `CANDIDATE_FILE_DRIFT:${path}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--root');
  const root = i >= 0 ? resolve(args[i+1]) : resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const write = args.includes('--write');
  const { palette, crosswalk } = generate(root);
  safeWriteOrVerify(resolve(root, 'scripts/atlas/data/nes-domain-palette-v2.candidate.json'), asCanonicalJson(palette), write);
  safeWriteOrVerify(resolve(root, 'docs/reports/domain-ontology-nes-v2-crosswalk.candidate.json'), asCanonicalJson(crosswalk), write);
  process.stdout.write(JSON.stringify({status:'PASS',mode:write?'CANDIDATE_WRITE':'READ_ONLY_VERIFY',paletteChecksum:palette.checksum,sourceGroups:crosswalk.sourceGroupCount,paletteDomains:crosswalk.paletteDomainCount,canonicalAuthority:false,postgresWrites:0})+'\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch(e) { console.error(String(e?.message??e)); process.exitCode = 1; }
}
