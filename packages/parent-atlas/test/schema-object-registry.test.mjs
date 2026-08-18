import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveSchemaObjectKey,
  deriveSchemaObjectNominationId,
  schemaObjectNominationSchema,
  schemaObjectVersionSchema,
} from '../dist/core/schema-object-registry.js';

const definitionHash = 'a'.repeat(64);

test('schema nomination key is stable across catalog OID changes', () => {
  const first = deriveSchemaObjectKey({
    database_key: 'database:legal_ai_db',
    schema_name: 'public',
    kind: 'table',
    qualified_name: 'public.cases',
  });
  const second = deriveSchemaObjectKey({
    database_key: 'database:legal_ai_db',
    schema_name: 'public',
    kind: 'table',
    qualified_name: 'public.cases',
  });
  assert.equal(first, second);
});

test('catalog OID is revision-local nomination provenance, not part of stable object key', () => {
  const objectKey = deriveSchemaObjectKey({
    database_key: 'database:legal_ai_db', schema_name: 'public', kind: 'table', qualified_name: 'public.cases',
  });
  const first = schemaObjectNominationSchema.parse({
    nomination_id: deriveSchemaObjectNominationId({ object_key: objectKey, schema_revision: 'schema-r1', definition_hash: definitionHash }),
    object_key: objectKey,
    kind: 'table', database_key: 'database:legal_ai_db', schema_name: 'public', object_name: 'cases', qualified_name: 'public.cases',
    source_ref: 'postgres://legal_ai_db/public.cases', source_revision: 'catalog-r1', schema_revision: 'schema-r1',
    catalog_oid: 16384, definition_hash: definitionHash, extractor_revision: 'schema-introspector-r1', canonical_authority: false,
  });
  const second = schemaObjectNominationSchema.parse({
    ...first,
    nomination_id: deriveSchemaObjectNominationId({ object_key: objectKey, schema_revision: 'schema-r2', definition_hash: definitionHash }),
    source_revision: 'catalog-r2', schema_revision: 'schema-r2', catalog_oid: 99123,
  });

  assert.equal(first.object_key, second.object_key);
  assert.notEqual(first.nomination_id, second.nomination_id);
  assert.notEqual(first.catalog_oid, second.catalog_oid);
  assert.equal(first.canonical_authority, false);
});

test('schema version may retain an OID but requires stable registry identity separately', () => {
  const version = schemaObjectVersionSchema.parse({
    schema_object_version_id: 'schema-object-version:1',
    stable_schema_object_id: 'schema-object:cases',
    object_key: 'schema-key:cases',
    kind: 'table', qualified_name: 'public.cases',
    source_ref: 'postgres://legal_ai_db/public.cases', source_revision: 'catalog-r1', schema_revision: 'schema-r1',
    catalog_oid: 16384, definition_hash: definitionHash, producer_revision: 'schema-registry-r1',
  });
  assert.equal(version.stable_schema_object_id, 'schema-object:cases');
  assert.equal(version.catalog_oid, 16384);
});
