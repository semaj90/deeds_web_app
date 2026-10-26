import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NES_LUT_DOMAIN_PALETTE } from './lib/domain-taxonomy-nes-lut-batch-gemm-v1.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = resolve(root, 'scripts/atlas/data/nes-domain-palette-v1.json');
const domainEntries = Object.fromEntries(Object.entries(NES_LUT_DOMAIN_PALETTE));
const payload = {
  schema: 'atlas.nes-domain-palette.v1',
  revision: 'nes-domain-palette-v1',
  unresolved: { lutByte: 0x00, status: 'UNRESOLVED' },
  domains: domainEntries,
  subLabels: { svelte5_runes: { domain: 'ui', nesHex: '0x2A' } },
};
const checksum = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const canonicalPayload = JSON.stringify({ ...payload, checksum: `sha256:${checksum}` }, null, 2) + '\n';

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, canonicalPayload, 'utf8');
const artifactDigest = createHash('sha256').update(readFileSync(outputPath)).digest('hex');
process.stdout.write(JSON.stringify({ outputPath, checksum: `sha256:${checksum}`, artifactSha256: artifactDigest, domainCount: Object.keys(domainEntries).length }));
