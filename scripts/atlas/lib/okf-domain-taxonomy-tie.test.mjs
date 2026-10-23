// Ties .okf/domains/atlas-domain-taxonomy.yaml to .okf/schemas/domain-taxonomy-v1.schema.json,
// the registry in .okf/manifest.yaml, and the checksummed groups snapshot it cites.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(root, 'sveltekit-frontend/package.json'));
const yaml = require('js-yaml');
const Ajv2020 = require('ajv/dist/2020');

const taxonomy = yaml.load(readFileSync(path.join(root, '.okf/domains/atlas-domain-taxonomy.yaml'), 'utf8'));
const schema = JSON.parse(readFileSync(path.join(root, '.okf/schemas/domain-taxonomy-v1.schema.json'), 'utf8'));
const manifest = readFileSync(path.join(root, '.okf/manifest.yaml'), 'utf8');

test('taxonomy YAML validates against its .okf schema', () => {
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  assert.equal(validate(taxonomy), true, JSON.stringify(validate.errors?.slice(0, 5)));
});

test('manifest registers the taxonomy under the domains registry', () => {
  const domains = manifest.slice(manifest.indexOf('  domains:'), manifest.indexOf('  corpora:'));
  assert.match(domains, /- atlas-domain-taxonomy\.yaml/);
});

test('recorded source_checksum equals the digest of the snapshot groups array', () => {
  const snapshotPath = path.join(root, taxonomy.snapshot.source_file);
  assert.ok(existsSync(snapshotPath), 'cited snapshot must exist');
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const digest = `sha256:${createHash('sha256').update(JSON.stringify(snapshot.groups)).digest('hex')}`;
  assert.equal(taxonomy.snapshot.source_checksum, digest);
  assert.equal(snapshot.checksum, digest);
});

test('group hierarchy is closed: unique ids and no dangling parents', () => {
  const ids = taxonomy.groups.map((group) => group.group_id);
  assert.equal(new Set(ids).size, ids.length);
  for (const group of taxonomy.groups) {
    if (group.parent_group_id !== null) assert.ok(ids.includes(group.parent_group_id), `${group.group_id} parent`);
  }
});
