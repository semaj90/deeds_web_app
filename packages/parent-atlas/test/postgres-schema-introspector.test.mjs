import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compilePostgresCatalogRows,
} from '../dist/core/postgres-schema-introspector.js';

const base = {
  database_key: 'database:legal_ai_db',
  source_ref: 'postgres://legal_ai_db/catalog',
  source_revision: 'catalog-r1',
  schema_revision: 'schema-r1',
  producer_revision: 'postgres-schema-introspector-r1',
};

test('catalog OID changes do not change schema object key or semantic definition hash', () => {
  const first = compilePostgresCatalogRows({
    ...base,
    rows: [{
      kind: 'table',
      schema_name: 'public',
      object_name: 'cases',
      qualified_name: 'public.cases',
      parent_qualified_name: 'public',
      parent_kind: 'schema',
      catalog_oid: 16384,
      definition: { relkind: 'r', rowsecurity: true, forcerowsecurity: false, partitioned: false },
    }],
  })[0];
  const second = compilePostgresCatalogRows({
    ...base,
    source_revision: 'catalog-r2',
    rows: [{
      kind: 'table',
      schema_name: 'public',
      object_name: 'cases',
      qualified_name: 'public.cases',
      parent_qualified_name: 'public',
      parent_kind: 'schema',
      catalog_oid: 99123,
      definition: { relkind: 'r', rowsecurity: true, forcerowsecurity: false, partitioned: false },
    }],
  })[0];

  assert.equal(first.object_key, second.object_key);
  assert.equal(first.definition_hash, second.definition_hash);
  assert.equal(first.nomination_id, second.nomination_id);
  assert.notEqual(first.catalog_oid, second.catalog_oid);
  assert.equal(first.canonical_authority, false);
});

test('semantic definition changes create a new nomination revision without changing object key', () => {
  const first = compilePostgresCatalogRows({
    ...base,
    rows: [{
      kind: 'column',
      schema_name: 'public',
      object_name: 'status',
      qualified_name: 'public.cases.status',
      parent_qualified_name: 'public.cases',
      parent_kind: 'table',
      catalog_oid: 16384,
      definition: { attnum: 5, type: 'text', not_null: false, identity: '', generated: '', default: null },
    }],
  })[0];
  const changed = compilePostgresCatalogRows({
    ...base,
    rows: [{
      kind: 'column',
      schema_name: 'public',
      object_name: 'status',
      qualified_name: 'public.cases.status',
      parent_qualified_name: 'public.cases',
      parent_kind: 'table',
      catalog_oid: 16384,
      definition: { attnum: 5, type: 'text', not_null: true, identity: '', generated: '', default: null },
    }],
  })[0];

  assert.equal(first.object_key, changed.object_key);
  assert.notEqual(first.definition_hash, changed.definition_hash);
  assert.notEqual(first.nomination_id, changed.nomination_id);
});

test('indexes and policies attach to the parent table key rather than schema key', () => {
  const rows = compilePostgresCatalogRows({
    ...base,
    rows: [
      {
        kind: 'index', schema_name: 'public', object_name: 'cases_status_idx',
        qualified_name: 'public.cases_status_idx', parent_qualified_name: 'public.cases', parent_kind: 'table',
        catalog_oid: 20001, definition: { definition: 'CREATE INDEX cases_status_idx ON public.cases USING btree (status)', unique: false },
      },
      {
        kind: 'database_policy', schema_name: 'public', object_name: 'cases_owner',
        qualified_name: 'public.cases.cases_owner', parent_qualified_name: 'public.cases', parent_kind: 'table',
        catalog_oid: 20002, definition: { command: '*', permissive: true, roles: ['authenticated'], using: '(owner_id = auth.uid())' },
      },
    ],
  });

  assert.ok(rows[0].parent_object_key);
  assert.equal(rows[0].parent_object_key, rows[1].parent_object_key);
});
