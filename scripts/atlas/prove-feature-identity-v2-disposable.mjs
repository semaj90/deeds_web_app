import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = 'sveltekit-frontend/drizzle/manual/20261021_feature_identity_v2.sql';
const rollbackPath = 'sveltekit-frontend/drizzle/manual/20261021_feature_identity_v2.rollback.sql';
const migration = fs.readFileSync(path.join(root, migrationPath), 'utf8');
const rollback = fs.readFileSync(path.join(root, rollbackPath), 'utf8');
const container = `atlas-feature-identity-proof-${process.pid}-${Date.now()}`;
const database = 'atlas_feature_identity_proof';
const image = 'pgvector-pgsearch:pg18-local';
const execute = promisify(execFile);
const checks = [];
const digest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const docker = (args, input) => execFileSync('docker', args, {
  input, encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
  stdio: ['pipe', 'pipe', 'pipe'],
});
const psqlArgs = ['exec', '-i', container, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'atlas_proof', '-d', database];
const sql = statement => docker(psqlArgs, statement).trim();
const check = (name, statement, expected) => {
  assert.equal(sql(statement), expected, name);
  checks.push({ name, status: 'PASS' });
};
function rejects(name, statement, pattern) {
  assert.throws(() => sql(statement), pattern, name);
  checks.push({ name, status: 'PASS' });
}
async function race(name, statement) {
  const results = await Promise.allSettled([0, 1].map(() => execute('docker', [...psqlArgs, '-c', statement], {
    encoding: 'utf8', timeout: 15_000, windowsHide: true,
  })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1, name);
  const failure = results.find(result => result.status === 'rejected');
  assert.match(failure.reason.stderr, /duplicate key value violates unique constraint/, name);
  checks.push({ name, status: 'PASS', successfulSessions: 1, rejectedSessions: 1 });
}

let started = false;
try {
  docker(['run', '-d', '--name', container, '--network', 'none', '--tmpfs', '/var/lib/postgresql:rw,size=256m',
    '-e', 'POSTGRES_USER=atlas_proof', '-e', `POSTGRES_DB=${database}`,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  started = true;
  const mounts = JSON.parse(docker(['inspect', '--format', '{{json .Mounts}}', container]));
  assert.equal(mounts.some(mount => mount.Type === 'volume' || mount.Type === 'bind'), false);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { docker(['exec', container, 'pg_isready', '-U', 'atlas_proof', '-d', database]); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert.equal(ready, true, 'disposable PostgreSQL ready');
  const version = sql('SHOW server_version;');
  assert.match(version, /^18\./);
  sql(migration);
  sql(migration);
  checks.push({ name: 'migration applies twice', status: 'PASS' });
  const catalog = JSON.parse(sql(`SELECT json_object_agg(table_name, columns) FROM (
    SELECT table_name, json_agg(json_build_object('name', column_name, 'notNull', is_nullable = 'NO') ORDER BY ordinal_position) AS columns
    FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name IN ('atlas_feature_concepts','atlas_feature_source_identities','atlas_feature_concept_crosswalk','atlas_feature_labels')
    GROUP BY table_name) tables;`));
  await race('concurrent concept mint', `INSERT INTO atlas_feature_concepts(canonical_feature_id,concept_status,minted_by,minted_at)
    VALUES ('fixture:concept','APPROVED','fixture-reviewer',now());`);
  sql(`INSERT INTO atlas_feature_source_identities(source_namespace,local_feature_id)
    VALUES ('fixture:one','shared'),('fixture:two','shared');`);
  check('same local ID in distinct namespaces', 'SELECT count(*) FROM atlas_feature_source_identities;', '2');
  const revision = `sha256:${'a'.repeat(64)}`;
  const crosswalk = (number, status) => `INSERT INTO atlas_feature_concept_crosswalk
    (source_namespace,local_feature_id,crosswalk_revision,canonical_feature_id,crosswalk_status,source_ref,source_revision,workspace_revision,reviewed_by,reviewed_at)
    VALUES ('fixture:one','shared',${number},'fixture:concept','${status}','src/fixture.ts','${revision}','${revision}','fixture-reviewer',now());`;
  const label = (number, status) => `INSERT INTO atlas_feature_labels
    (canonical_feature_id,label_revision,feature_label,label_source,label_status,reviewed_by,reviewed_at)
    VALUES ('fixture:concept',${number},'Fixture','fixture','${status}','fixture-reviewer',now());`;
  await race('concurrent crosswalk revision', crosswalk(1, 'REVIEWED'));
  await race('concurrent label revision', label(1, 'REVIEWED'));
  sql(crosswalk(2, 'PROPOSED') + label(2, 'PROPOSED'));
  check('proposal preserves current crosswalk', 'SELECT crosswalk_revision FROM atlas_feature_concept_crosswalk_current;', '1');
  check('proposal preserves current label', 'SELECT label_revision FROM atlas_feature_labels_current;', '1');
  sql(crosswalk(3, 'WITHDRAWN') + label(3, 'WITHDRAWN'));
  check('withdrawal suppresses crosswalk', 'SELECT count(*) FROM atlas_feature_concept_crosswalk_current;', '0');
  check('withdrawal suppresses label', 'SELECT count(*) FROM atlas_feature_labels_current;', '0');
  sql(crosswalk(4, 'REVIEWED') + label(4, 'REVIEWED'));
  check('restoration returns latest crosswalk', 'SELECT crosswalk_revision FROM atlas_feature_concept_crosswalk_current;', '4');
  check('restoration returns latest label', 'SELECT label_revision FROM atlas_feature_labels_current;', '4');
  sql('BEGIN;' + crosswalk(5, 'REVIEWED') + label(5, 'REVIEWED') + 'ROLLBACK;');
  check('transaction rollback preserves crosswalk', 'SELECT crosswalk_revision FROM atlas_feature_concept_crosswalk_current;', '4');
  check('transaction rollback preserves label', 'SELECT label_revision FROM atlas_feature_labels_current;', '4');
  rejects('unreviewed approval rejected', `INSERT INTO atlas_feature_concepts(canonical_feature_id,concept_status) VALUES ('fixture:bad','APPROVED');`, /approved_consistent/);
  rejects('label orphan rejected', `INSERT INTO atlas_feature_labels(canonical_feature_id,feature_label,label_source) VALUES ('fixture:missing','Orphan','fixture');`, /foreign key constraint/);
  rejects('review without reviewer rejected', `INSERT INTO atlas_feature_labels(canonical_feature_id,label_revision,feature_label,label_source,label_status) VALUES ('fixture:concept',6,'No reviewer','fixture','REVIEWED');`, /reviewed_consistent/);
  rejects('populated rollback refused', rollback, /ROLLBACK_REFUSED/);
  check('failed rollback preserves records', 'SELECT count(*) FROM atlas_feature_concepts;', '1');
  sql('TRUNCATE atlas_feature_labels, atlas_feature_concept_crosswalk, atlas_feature_source_identities, atlas_feature_concepts;');
  sql(rollback);
  check('empty rollback removes schema', "SELECT to_regclass('public.atlas_feature_concepts') IS NULL AND to_regclass('public.atlas_feature_labels') IS NULL;", 't');
  const receipt = {
    schema: 'atlas.feature-identity-v2-disposable.v1', observedAt: new Date().toISOString(),
    status: 'DISPOSABLE_READBACK_PROVEN_NOT_APPLIED', image, version, storage: 'TMPFS',
    migrationPath, migrationChecksum: digest(migration), rollbackPath, rollbackChecksum: digest(rollback),
    catalog, checks, productionWritesPerformed: 0, canonicalIdsMintedInProduction: 0,
  };
  const output = path.join(root, '.tmp/atlas/feature-identity-v2-disposable-proof-v1.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ status: receipt.status, version, checks: checks.length, reportPath: output }));
} finally {
  if (started) docker(['rm', '-f', '-v', container]);
}
