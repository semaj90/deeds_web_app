#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UUID_DERIVATION_REVISION, uuid } from '../../src/lib/utils/uuid.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const ROOT = path.resolve(FRONTEND, '..');
const REPORT = path.resolve(ROOT, 'docs/reports/openspec-id-derivation.json');
const PLACEHOLDER_UUID = 'fff92e30-ab3b-508b-ba45-a9ef1e88c068';
const ATTRIBUTES = Object.freeze({
  identityKind: 'openspec-domain-class',
  namespace: 'parent-atlas',
});

const parsed = JSON.parse(await readFile(REPORT, 'utf8')) as {
  domainClassCounts?: Record<string, number>;
  derivedMappings?: Record<string, string>;
  derivedMappingDerivation?: {
    revision?: string;
    placeholderUuidRemaining?: boolean;
  };
};

const domainClasses = Object.keys(parsed.domainClassCounts ?? {});
const mappings = parsed.derivedMappings ?? {};
const mappedClasses = Object.keys(mappings);

if (domainClasses.length === 0) throw new Error('OPENSPEC_DOMAIN_CLASSES_REQUIRED');
if (domainClasses.length !== mappedClasses.length) {
  throw new Error(`OPENSPEC_DOMAIN_MAPPING_COUNT_MISMATCH:${domainClasses.length}:${mappedClasses.length}`);
}
if (parsed.derivedMappingDerivation?.revision !== UUID_DERIVATION_REVISION) {
  throw new Error('OPENSPEC_DOMAIN_UUID_DERIVATION_REVISION_MISMATCH');
}

const expected = new Map<string, string>();
for (const domainClass of domainClasses) {
  expected.set(domainClass, await uuid.derive(domainClass, ATTRIBUTES));
}

for (const domainClass of domainClasses) {
  const actual = mappings[domainClass];
  if (!actual) throw new Error(`OPENSPEC_DOMAIN_MAPPING_MISSING:${domainClass}`);
  if (actual === PLACEHOLDER_UUID) throw new Error(`OPENSPEC_DOMAIN_PLACEHOLDER_REMAINING:${domainClass}`);
  if (actual !== expected.get(domainClass)) throw new Error(`OPENSPEC_DOMAIN_MAPPING_DRIFT:${domainClass}`);
}

for (const mappedClass of mappedClasses) {
  if (!(mappedClass in (parsed.domainClassCounts ?? {}))) {
    throw new Error(`OPENSPEC_DOMAIN_MAPPING_ORPHAN:${mappedClass}`);
  }
}

const unique = new Set(Object.values(mappings));
if (unique.size !== domainClasses.length) {
  throw new Error(`OPENSPEC_DOMAIN_UUID_COLLISION:${unique.size}:${domainClasses.length}`);
}
if (parsed.derivedMappingDerivation?.placeholderUuidRemaining !== false) {
  throw new Error('OPENSPEC_DOMAIN_PLACEHOLDER_STATUS_INCORRECT');
}

console.log(JSON.stringify({
  status: 'OPENSPEC_DOMAIN_UUID_DERIVATION_VERIFIED',
  report: REPORT,
  derivationRevision: UUID_DERIVATION_REVISION,
  domainClassCount: domainClasses.length,
  uniqueDerivedUuidCount: unique.size,
  placeholderUuidRemaining: false,
  canonicalWritesPerformed: false,
}, null, 2));
