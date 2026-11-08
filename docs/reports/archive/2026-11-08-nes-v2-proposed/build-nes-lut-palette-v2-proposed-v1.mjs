#!/usr/bin/env node
// Rebuilds scripts/atlas/data/nes-domain-palette-v2-PROPOSED.json from the v1 palette (restored from the one-off generator, which had been removed).
// Default = verify: rebuild in memory and compare with the committed file. --write only creates a file that does not exist (never overwrites).
// The four new domains' lutByte (11-14), nesHex, label and weight are PROPOSALS pending operator confirmation; v1 domains are copied unchanged.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const V1 = path.join(HERE, 'data', 'nes-domain-palette-v1.json');
const OUT = path.join(HERE, 'data', 'nes-domain-palette-v2-PROPOSED.json');
const DNS_NS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
export const NEW_DOMAINS = {
  compiler: [11, '0x19', 'DOM_COMPILER_TOOLING', 0.7],
  devops: [12, '0x28', 'DOM_DEVOPS_PROCESS', 0.6],
  'error-handling': [13, '0x06', 'DOM_ERROR_RECOVERY', 0.6],
  test: [14, '0x2B', 'DOM_TEST_HARNESS', 0.5],
};

export function uuidV5(ns, name) {
  const h = crypto.createHash('sha1').update(Buffer.from(ns.replace(/-/g, ''), 'hex')).update(name).digest();
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export function buildV2(v1) {
  const { checksum: _c, ...body } = JSON.parse(JSON.stringify(v1));
  const used = new Set(Object.values(body.domains).map((d) => d.nesHex));
  const usedBytes = new Set(Object.values(body.domains).map((d) => d.lutByte));
  for (const [k, [b, h]] of Object.entries(NEW_DOMAINS)) {
    if (used.has(h)) throw new Error(`HEX_COLLISION:${k}`);
    if (usedBytes.has(b)) throw new Error(`BYTE_COLLISION:${k}`);
  }
  const ns = uuidV5(DNS_NS, 'parent-atlas.nes-lut.v1');
  body.revision = 'nes-domain-palette-v2-PROPOSED';
  body.supersedes = 'nes-domain-palette-v1';
  body.status = 'PROPOSED_NOT_APPLIED';
  body.note = 'v1 domains unchanged (same lutByte/nesHex). lutByte 11-14 and nesHex values for the four new domains are PROPOSED by the assistant; operator may change them before apply. general keeps lutByte 10.';
  for (const [k, [b, h, l, w]] of Object.entries(NEW_DOMAINS)) body.domains[k] = { lutByte: b, nesHex: h, label: l, priorWeight: w, proposed: true };
  body.derivedUuid = { algorithm: 'uuidv5', namespace: ns, name: '<revision>|<domain_key>|<lutByte>|<nesHex>', canonicalIdentity: false, note: 'lookup key only; never replaces domain_key/lut_byte' };
  body.domainUuids = {};
  for (const [k, d] of Object.entries(body.domains)) body.domainUuids[k] = uuidV5(ns, `${body.revision}|${k}|${d.lutByte}|${d.nesHex}`);
  const checksum = 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return { ...body, checksum };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const built = JSON.stringify(buildV2(JSON.parse(fs.readFileSync(V1, 'utf8'))), null, 2) + '\n';
  if (process.argv.includes('--write')) { fs.writeFileSync(OUT, built, { flag: 'wx' }); console.log(`created ${OUT}`); }
  else {
    const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') === built;
    console.log(same ? 'VERIFIED: committed v2 matches a rebuild from v1' : 'DRIFT: committed v2 differs from a rebuild');
    process.exit(same ? 0 : 1);
  }
}
