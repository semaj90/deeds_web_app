#!/usr/bin/env node
/**
 * build-afc-keyword-vocabulary-v1 (AFC-RADIX-LIVE-01, owner decision: AFC-owned pinned artifact)
 *
 * Builds the revisioned KeywordVocabularySourceV1 from reviewed seeds (afc-keyword-vocabulary-seeds-v1.json),
 * resolves every domainRef against the ACTIVE domain_taxonomy_v1 (read-only SELECT, always rolled back), validates
 * helperRefs against the verified helper registry, compiles the radix index as a smoke check, and fails closed.
 * Postgres is an INPUT here (taxonomy); it is not the truth for this artifact (helperRefs have no DB home).
 *
 *   npx tsx scripts/atlas/build-afc-keyword-vocabulary-v1.mts            dry-run: build + validate, write nothing
 *   npx tsx scripts/atlas/build-afc-keyword-vocabulary-v1.mts --write     also write the immutable artifact (create-only)
 *
 * The revision is deterministic: afc-keyword-vocabulary:tax-v<version(s)>:<first 12 hex of sha256(seeds)>.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { buildKeywordVocabularyV1, assertKeywordVocabularyV1 } from '../../sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/vocabulary-v1.js';
import { compileKeywordRadixIndexV1, assertKeywordRadixIndexV1, lookupControlledPrefixV1 } from '../../sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/radix-index-v1.js';
import { HELPER_REGISTRY_V1 } from '../../sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/helper-registry-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WRITE = process.argv.includes('--write');
const seedsArg = process.argv.find((a) => a.startsWith('--seeds='));
const SEEDS_PATH = seedsArg ? path.resolve(seedsArg.slice('--seeds='.length)) : path.join(ROOT, 'scripts', 'atlas', 'afc-keyword-vocabulary-seeds-v1.json');
const sha = (b: string | Buffer) => crypto.createHash('sha256').update(b).digest('hex');

const seedBytes = fs.readFileSync(SEEDS_PATH);
const seeds = JSON.parse(seedBytes.toString('utf8'));
if (seeds.schema !== 'atlas.afc-keyword-vocabulary-seeds.v1') throw new Error('SEEDS_SCHEMA_MISMATCH');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 30000 });
const client = await pool.connect();
let taxonomy: Array<{ domain_id: string; version: number; is_active: boolean }>;
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  taxonomy = (await client.query('SELECT domain_id, version, is_active FROM domain_taxonomy_v1 ORDER BY domain_id')).rows;
  await client.query('ROLLBACK');
} finally { client.release(); await pool.end().catch(() => {}); }

const active = new Map(taxonomy.filter((t) => t.is_active).map((t) => [t.domain_id, t.version]));
const unknownDomains = new Set<string>();
const usedVersions = new Set<number>();
for (const e of seeds.entries) for (const d of e.domainRefs) {
  if (!active.has(d)) unknownDomains.add(d); else usedVersions.add(active.get(d)!);
}
if (unknownDomains.size) throw new Error(`UNKNOWN_OR_INACTIVE_TAXONOMY_DOMAIN:${[...unknownDomains].sort().join(',')}`);

const seedsSha = sha(seedBytes);
const versionTag = usedVersions.size ? [...usedVersions].sort((a, b) => a - b).join('+') : 'none';
const revision = `afc-keyword-vocabulary:tax-v${versionTag}:${seedsSha.slice(0, 12)}`;

const vocabulary = assertKeywordVocabularyV1(buildKeywordVocabularyV1({ revision, entries: seeds.entries, prefixRules: seeds.prefixRules }));
const radix = assertKeywordRadixIndexV1(compileKeywordRadixIndexV1(vocabulary));
const lookups = vocabulary.prefixRules.map((r) => {
  const l = lookupControlledPrefixV1(radix, vocabulary, r.prefix);
  return { prefix: r.prefix, matched: (l as any).expansions?.map?.((x: any) => x.term ?? x) ?? (l as any).matches ?? null };
});

const receipt = {
  schema: 'atlas.afc-keyword-vocabulary-build.v1', generatedAt: new Date().toISOString(), mode: WRITE ? 'write' : 'dry-run',
  reviewStatus: seeds.reviewStatus, canonicalAuthority: false, writesToDatastores: 0,
  seeds: { path: path.relative(ROOT, SEEDS_PATH).split(path.sep).join('/'), sha256: seedsSha, entries: seeds.entries.length, prefixRules: seeds.prefixRules.length },
  taxonomy: { table: 'domain_taxonomy_v1', activeDomains: active.size, versionsUsed: [...usedVersions], domainsReferenced: [...new Set(seeds.entries.flatMap((e: any) => e.domainRefs))].sort() },
  helperRegistry: { revision: HELPER_REGISTRY_V1.revision, checksum: HELPER_REGISTRY_V1.checksum },
  vocabulary: { revision: vocabulary.revision, checksum: vocabulary.checksum, entries: vocabulary.entries.length, prefixRules: vocabulary.prefixRules.length },
  radixIndex: { schema: radix.schema, checksum: (radix as any).checksum },
  prefixLookupSmoke: lookups,
  termsWithEmptyDomainRefs: seeds.entries.filter((e: any) => e.domainRefs.length === 0).map((e: any) => e.term),
};

console.log(JSON.stringify(receipt, null, 2));
if (WRITE) {
  const outDir = path.join(ROOT, '.tmp', 'atlas', 'afc-keyword-vocabulary-v1');
  fs.mkdirSync(outDir, { recursive: true });
  const base = vocabulary.checksum.slice(0, 16);
  fs.writeFileSync(path.join(outDir, `vocabulary.${base}.json`), JSON.stringify(vocabulary, null, 2), { flag: 'wx' });
  fs.writeFileSync(path.join(outDir, `build-receipt.${base}.json`), JSON.stringify(receipt, null, 2), { flag: 'wx' });
  console.log(`written (create-only): ${path.relative(ROOT, outDir)}/vocabulary.${base}.json`);
}
