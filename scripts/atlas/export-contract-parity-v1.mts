#!/usr/bin/env node
/**
 * Contract parity exporter (CONTRACT-PARITY-HARNESS-01). Registry-driven: for one --contract <schemaId> it writes a SEALED bundle
 *   <schemaId>.schema.json   canonical JSON Schema (sorted keys, no whitespace)
 *   fixtures.json            [{id, value, crossField, zodAccepts}] — verdicts recorded FROM ZOD
 *   manifest.json            schemaId, schemaVersion, schemaChecksum (sha256 of the canonical schema), fixtureManifestChecksum,
 *                            producerRevision, crossFieldFixtureIds
 * The Python runner takes the manifest path plus the expected schema id / version / checksum explicitly. It never picks "latest".
 * Artifact-only: writes only under --out (default .tmp/atlas/contract-parity-v1/<schemaId>/<timestamp>).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACT_PARITY_REGISTRY } from './lib/contract-parity-registry-v1.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = (b: string | Buffer) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
/** Canonical JSON: keys sorted, no whitespace. Independent of any pretty-printer or key-order the producing tool used. */
const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`).join(',')}}` : JSON.stringify(v);

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const schemaId = arg('contract');
if (!schemaId) { console.error(`--contract <schemaId> required. Registered: ${Object.keys(CONTRACT_PARITY_REGISTRY).join(', ')}`); process.exit(1); }
const entry = CONTRACT_PARITY_REGISTRY[schemaId];
if (!entry) { console.error(`UNREGISTERED_CONTRACT:${schemaId}`); process.exit(1); }

const raw = entry.fixtures();
const ids = raw.map((f) => f.id);
if (new Set(ids).size !== ids.length) { console.error('DUPLICATE_FIXTURE_ID'); process.exit(1); }
const fixtures = raw.map((f) => ({ id: f.id, crossField: f.crossField === true, value: f.value, zodAccepts: entry.safeParse(f.value).success }));

const schemaCanonical = canonical(entry.jsonSchema());
const fixturesCanonical = canonical(fixtures);
const readRoot = (rel: string) => fs.readFileSync(path.join(ROOT, rel));
const producerRevision = sha(Buffer.concat([
  fs.readFileSync(fileURLToPath(import.meta.url)), readRoot('scripts/atlas/lib/contract-parity-registry-v1.mts'), readRoot(entry.contractFile),
]));
const manifest = {
  schema: 'atlas.contract-parity-manifest.v1', schemaId: entry.schemaId, schemaVersion: entry.schemaVersion,
  schemaChecksum: sha(schemaCanonical), schemaFile: `${entry.schemaId}.schema.json`,
  fixtureManifestChecksum: sha(fixturesCanonical), fixturesFile: 'fixtures.json', fixtureCount: fixtures.length,
  crossFieldFixtureIds: fixtures.filter((f) => f.crossField).map((f) => f.id), producerRevision,
};

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = path.resolve(arg('out') ?? path.join(ROOT, '.tmp/atlas/contract-parity-v1', entry.schemaId, stamp));
fs.mkdirSync(outDir, { recursive: true });
const write = (name: string, body: string) => fs.writeFileSync(path.join(outDir, name), body, { flag: 'wx' }); // never overwrite a sealed bundle
write(manifest.schemaFile, schemaCanonical);
write('fixtures.json', fixturesCanonical);
write('manifest.json', JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ dir: path.relative(ROOT, outDir), manifest: path.relative(ROOT, path.join(outDir, 'manifest.json')), schemaId: manifest.schemaId, schemaVersion: manifest.schemaVersion, schemaChecksum: manifest.schemaChecksum,
  fixtures: fixtures.length, zodAccepts: fixtures.filter((f) => f.zodAccepts).length, zodRejects: fixtures.filter((f) => !f.zodAccepts).length, crossFieldFixtures: manifest.crossFieldFixtureIds.length }, null, 2));
