import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import {
  deriveSchemaObjectKey,
  deriveSchemaObjectNominationId,
  schemaObjectNominationSchema,
  type SchemaCatalogLocatorV1,
  type SchemaObjectNominationV1,
} from './schema-object-registry.js';

const revision = z.string().min(1);

export const postgresSchemaIntrospectionReceiptSchema = z.object({
  schema: z.literal('atlas.postgres-schema-introspection-receipt.v1').default('atlas.postgres-schema-introspection-receipt.v1'),
  database_key: z.string().min(1),
  source_revision: revision,
  schema_revision: revision,
  schema_names: z.array(z.string().min(1)),
  server_version_num: z.number().int().positive(),
  transaction_isolation: z.literal('repeatable read').default('repeatable read'),
  transaction_read_only: z.literal(true).default(true),
  search_path: z.literal('pg_catalog').default('pg_catalog'),
  nomination_count: z.number().int().nonnegative(),
  counts_by_kind: z.record(z.string(), z.number().int().nonnegative()),
  catalog_oids_recorded: z.number().int().nonnegative(),
  catalog_locators_recorded: z.number().int().nonnegative(),
  input_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  output_checksum: z.string().regex(/^[a-f0-9]{64}$/),
  producer_revision: revision,
  canonical_identity_created: z.literal(false).default(false),
}).strict();

export type PostgresSchemaIntrospectionReceiptV1 = z.infer<typeof postgresSchemaIntrospectionReceiptSchema>;

export type PostgresCatalogNominationRowV1 = {
  kind: SchemaObjectNominationV1['kind'];
  schema_name: string;
  object_name: string;
  qualified_name: string;
  parent_qualified_name: string | null;
  parent_kind: SchemaObjectNominationV1['kind'] | null;
  catalog_oid: number | string | null;
  locator_class_oid: number | string | null;
  locator_object_oid: number | string | null;
  locator_object_sub_id: number | string | null;
  /** Semantic/deparsed definition only. Do not put catalog OIDs here. */
  definition: unknown;
};

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function normalizeCatalogNumber(value: number | string | null, label: string): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label}:${String(value)}`);
  }
  return parsed;
}

function normalizeCatalogOid(value: number | string | null): number | null {
  return normalizeCatalogNumber(value, 'POSTGRES_CATALOG_OID_INVALID');
}

function normalizeCatalogLocator(row: PostgresCatalogNominationRowV1): SchemaCatalogLocatorV1 | null {
  const objectOid = normalizeCatalogNumber(row.locator_object_oid, 'POSTGRES_CATALOG_LOCATOR_OBJECT_OID_INVALID');
  if (objectOid == null) return null;
  return {
    class_oid: normalizeCatalogNumber(row.locator_class_oid, 'POSTGRES_CATALOG_LOCATOR_CLASS_OID_INVALID'),
    object_oid: objectOid,
    object_sub_id: normalizeCatalogNumber(row.locator_object_sub_id, 'POSTGRES_CATALOG_LOCATOR_SUB_ID_INVALID') ?? 0,
  };
}

function definitionHash(value: unknown): string {
  return sha256(value);
}

function nomination(input: Omit<z.input<typeof schemaObjectNominationSchema>, 'nomination_id' | 'object_key' | 'definition_hash'> & {
  definition: unknown;
}): SchemaObjectNominationV1 {
  const { definition, ...nominationFields } = input;
  const objectKey = deriveSchemaObjectKey({
    database_key: nominationFields.database_key,
    schema_name: nominationFields.schema_name,
    kind: nominationFields.kind,
    qualified_name: nominationFields.qualified_name,
  });
  const hash = definitionHash(definition);
  return schemaObjectNominationSchema.parse({
    ...nominationFields,
    object_key: objectKey,
    nomination_id: deriveSchemaObjectNominationId({
      object_key: objectKey,
      schema_revision: nominationFields.schema_revision,
      definition_hash: hash,
    }),
    definition_hash: hash,
    canonical_authority: false,
  });
}

async function withClient<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { return await fn(client); } finally { client.release(); }
}

/**
 * Pure compiler used by tests and by the live catalog query.
 * Changing catalog OID/locator alone MUST NOT change object_key or definition_hash.
 */
export function compilePostgresCatalogRows(input: {
  database_key: string;
  source_ref: string;
  source_revision: string;
  schema_revision: string;
  producer_revision: string;
  rows: PostgresCatalogNominationRowV1[];
}): SchemaObjectNominationV1[] {
  return input.rows.map((row) => nomination({
    database_key: input.database_key,
    schema_name: row.schema_name,
    kind: row.kind,
    object_name: row.object_name,
    parent_object_key: row.parent_qualified_name && row.parent_kind
      ? deriveSchemaObjectKey({
        database_key: input.database_key,
        schema_name: row.schema_name,
        kind: row.parent_kind,
        qualified_name: row.parent_qualified_name,
      })
      : null,
    qualified_name: row.qualified_name,
    source_ref: input.source_ref,
    source_revision: input.source_revision,
    schema_revision: input.schema_revision,
    catalog_oid: normalizeCatalogOid(row.catalog_oid),
    catalog_locator: normalizeCatalogLocator(row),
    extractor_revision: input.producer_revision,
    definition: row.definition,
  }));
}

/**
 * PostgreSQL 18 catalog introspector. The entire read occurs in one
 * REPEATABLE READ, READ ONLY transaction with search_path pinned to pg_catalog.
 * Supported pg_get_* deparsers produce revision evidence while catalog
 * OIDs/subobject locators remain version provenance only.
 */
export async function introspectPostgresSchema(pool: Pool, input: {
  database_key: string;
  source_ref: string;
  source_revision: string;
  schema_revision: string;
  schema_names?: string[];
  producer_revision: string;
}): Promise<{ nominations: SchemaObjectNominationV1[]; receipt: PostgresSchemaIntrospectionReceiptV1 }> {
  const schemaNames = [...new Set((input.schema_names?.length ? input.schema_names : ['public']).map((value) => value.trim()).filter(Boolean))].sort();
  if (schemaNames.length === 0) throw new Error('POSTGRES_SCHEMA_NAMES_REQUIRED');

  return withClient(pool, async (client) => {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      await client.query('SET LOCAL search_path = pg_catalog');
      const versionResult = await client.query<{ server_version_num: string }>(`SELECT current_setting('server_version_num') AS server_version_num`);
      const serverVersionNum = Number(versionResult.rows[0]?.server_version_num);
      if (!Number.isSafeInteger(serverVersionNum) || serverVersionNum <= 0) {
        throw new Error(`POSTGRES_SERVER_VERSION_NUM_INVALID:${versionResult.rows[0]?.server_version_num ?? ''}`);
      }

      const result = await client.query<PostgresCatalogNominationRowV1>(`
        WITH target_namespaces AS (
          SELECT oid, nspname FROM pg_namespace WHERE nspname = ANY($1::text[])
        ), schema_rows AS (
          SELECT 'schema'::text AS kind, n.nspname::text AS schema_name,
            n.nspname::text AS object_name, n.nspname::text AS qualified_name,
            NULL::text AS parent_qualified_name, NULL::text AS parent_kind,
            n.oid::bigint AS catalog_oid,
            'pg_namespace'::regclass::oid::bigint AS locator_class_oid,
            n.oid::bigint AS locator_object_oid, 0::bigint AS locator_object_sub_id,
            jsonb_build_object('name', n.nspname) AS definition
          FROM target_namespaces n
        ), relation_rows AS (
          SELECT CASE c.relkind WHEN 'v' THEN 'view' ELSE 'table' END::text AS kind,
            n.nspname::text AS schema_name, c.relname::text AS object_name,
            (n.nspname || '.' || c.relname)::text AS qualified_name,
            n.nspname::text AS parent_qualified_name, 'schema'::text AS parent_kind,
            c.oid::bigint AS catalog_oid,
            'pg_class'::regclass::oid::bigint AS locator_class_oid,
            c.oid::bigint AS locator_object_oid, 0::bigint AS locator_object_sub_id,
            jsonb_build_object('relkind', c.relkind, 'rowsecurity', c.relrowsecurity,
              'forcerowsecurity', c.relforcerowsecurity, 'partitioned', c.relkind = 'p') AS definition
          FROM pg_class c JOIN target_namespaces n ON n.oid = c.relnamespace
          WHERE c.relkind IN ('r','p','v')
        ), column_rows AS (
          SELECT 'column'::text AS kind, n.nspname::text AS schema_name,
            a.attname::text AS object_name,
            (n.nspname || '.' || c.relname || '.' || a.attname)::text AS qualified_name,
            (n.nspname || '.' || c.relname)::text AS parent_qualified_name,
            CASE c.relkind WHEN 'v' THEN 'view' ELSE 'table' END::text AS parent_kind,
            NULL::bigint AS catalog_oid,
            'pg_class'::regclass::oid::bigint AS locator_class_oid,
            a.attrelid::bigint AS locator_object_oid, a.attnum::bigint AS locator_object_sub_id,
            jsonb_build_object('attnum', a.attnum, 'type', format_type(a.atttypid, a.atttypmod),
              'not_null', a.attnotnull, 'identity', a.attidentity, 'generated', a.attgenerated,
              'default', pg_get_expr(d.adbin, d.adrelid, false)) AS definition
          FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          JOIN target_namespaces n ON n.oid = c.relnamespace
          LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
          WHERE c.relkind IN ('r','p','v') AND a.attnum > 0 AND NOT a.attisdropped
        ), constraint_rows AS (
          SELECT CASE WHEN con.contype = 'f' THEN 'foreign_key' ELSE 'constraint' END::text AS kind,
            n.nspname::text AS schema_name, con.conname::text AS object_name,
            (n.nspname || '.' || c.relname || '.' || con.conname)::text AS qualified_name,
            (n.nspname || '.' || c.relname)::text AS parent_qualified_name,
            'table'::text AS parent_kind, con.oid::bigint AS catalog_oid,
            'pg_constraint'::regclass::oid::bigint AS locator_class_oid,
            con.oid::bigint AS locator_object_oid, 0::bigint AS locator_object_sub_id,
            jsonb_build_object('contype', con.contype, 'definition', pg_get_constraintdef(con.oid, false),
              'validated', con.convalidated, 'enforced', con.conenforced,
              'deferrable', con.condeferrable, 'deferred', con.condeferred) AS definition
          FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
          JOIN target_namespaces n ON n.oid = c.relnamespace WHERE con.conrelid <> 0
        ), index_rows AS (
          SELECT 'index'::text AS kind, n.nspname::text AS schema_name,
            idx.relname::text AS object_name, (n.nspname || '.' || idx.relname)::text AS qualified_name,
            (n.nspname || '.' || tbl.relname)::text AS parent_qualified_name,
            'table'::text AS parent_kind, idx.oid::bigint AS catalog_oid,
            'pg_class'::regclass::oid::bigint AS locator_class_oid,
            idx.oid::bigint AS locator_object_oid, 0::bigint AS locator_object_sub_id,
            jsonb_build_object('definition', pg_get_indexdef(idx.oid, 0, false),
              'unique', i.indisunique, 'primary', i.indisprimary, 'valid', i.indisvalid,
              'ready', i.indisready, 'predicate', pg_get_expr(i.indpred, i.indrelid, false)) AS definition
          FROM pg_index i JOIN pg_class idx ON idx.oid = i.indexrelid
          JOIN pg_class tbl ON tbl.oid = i.indrelid JOIN target_namespaces n ON n.oid = tbl.relnamespace
        ), policy_rows AS (
          SELECT 'database_policy'::text AS kind, n.nspname::text AS schema_name,
            p.polname::text AS object_name,
            (n.nspname || '.' || c.relname || '.' || p.polname)::text AS qualified_name,
            (n.nspname || '.' || c.relname)::text AS parent_qualified_name,
            'table'::text AS parent_kind, p.oid::bigint AS catalog_oid,
            'pg_policy'::regclass::oid::bigint AS locator_class_oid,
            p.oid::bigint AS locator_object_oid, 0::bigint AS locator_object_sub_id,
            jsonb_build_object('command', p.polcmd, 'permissive', p.polpermissive,
              'roles', ARRAY(SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid) END
                FROM unnest(p.polroles) AS role_oid ORDER BY 1),
              'using', pg_get_expr(p.polqual, p.polrelid, false),
              'with_check', pg_get_expr(p.polwithcheck, p.polrelid, false),
              'table_row_security_enabled', c.relrowsecurity) AS definition
          FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
          JOIN target_namespaces n ON n.oid = c.relnamespace
        ), function_rows AS (
          SELECT 'database_function'::text AS kind, n.nspname::text AS schema_name,
            p.proname::text AS object_name,
            (n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text AS qualified_name,
            n.nspname::text AS parent_qualified_name, 'schema'::text AS parent_kind,
            p.oid::bigint AS catalog_oid,
            'pg_proc'::regclass::oid::bigint AS locator_class_oid,
            p.oid::bigint AS locator_object_oid, 0::bigint AS locator_object_sub_id,
            jsonb_build_object('kind', p.prokind, 'identity_arguments', pg_get_function_identity_arguments(p.oid),
              'result', pg_get_function_result(p.oid), 'definition', pg_get_functiondef(p.oid)) AS definition
          FROM pg_proc p JOIN target_namespaces n ON n.oid = p.pronamespace
        ), trigger_rows AS (
          SELECT 'trigger'::text AS kind, n.nspname::text AS schema_name,
            t.tgname::text AS object_name,
            (n.nspname || '.' || c.relname || '.' || t.tgname)::text AS qualified_name,
            (n.nspname || '.' || c.relname)::text AS parent_qualified_name,
            'table'::text AS parent_kind, t.oid::bigint AS catalog_oid,
            'pg_trigger'::regclass::oid::bigint AS locator_class_oid,
            t.oid::bigint AS locator_object_oid, 0::bigint AS locator_object_sub_id,
            jsonb_build_object('definition', pg_get_triggerdef(t.oid, false), 'enabled', t.tgenabled) AS definition
          FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
          JOIN target_namespaces n ON n.oid = c.relnamespace WHERE NOT t.tgisinternal
        )
        SELECT * FROM schema_rows
        UNION ALL SELECT * FROM relation_rows
        UNION ALL SELECT * FROM column_rows
        UNION ALL SELECT * FROM constraint_rows
        UNION ALL SELECT * FROM index_rows
        UNION ALL SELECT * FROM policy_rows
        UNION ALL SELECT * FROM function_rows
        UNION ALL SELECT * FROM trigger_rows
        ORDER BY schema_name, kind, qualified_name
      `, [schemaNames]);

      const nominations = compilePostgresCatalogRows({
        database_key: input.database_key,
        source_ref: input.source_ref,
        source_revision: input.source_revision,
        schema_revision: input.schema_revision,
        producer_revision: input.producer_revision,
        rows: result.rows,
      });

      const countsByKind: Record<string, number> = {};
      for (const item of nominations) countsByKind[item.kind] = (countsByKind[item.kind] ?? 0) + 1;
      const receipt = postgresSchemaIntrospectionReceiptSchema.parse({
        database_key: input.database_key,
        source_revision: input.source_revision,
        schema_revision: input.schema_revision,
        schema_names: schemaNames,
        server_version_num: serverVersionNum,
        transaction_isolation: 'repeatable read',
        transaction_read_only: true,
        search_path: 'pg_catalog',
        nomination_count: nominations.length,
        counts_by_kind: countsByKind,
        catalog_oids_recorded: nominations.filter((item) => item.catalog_oid != null).length,
        catalog_locators_recorded: nominations.filter((item) => item.catalog_locator != null).length,
        input_checksum: sha256({ database_key: input.database_key, schemaNames, source_revision: input.source_revision, schema_revision: input.schema_revision, serverVersionNum }),
        output_checksum: sha256(nominations),
        producer_revision: input.producer_revision,
        canonical_identity_created: false,
      });

      await client.query('COMMIT');
      return { nominations, receipt };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export function describePostgresSchemaIntrospector(): string {
  return [
    'PostgreSQL system catalogs are read-only discovery inputs for Atlas schema nominations.',
    'The live catalog read is pinned to one REPEATABLE READ, READ ONLY snapshot with search_path=pg_catalog.',
    'Columns use relation OID + attnum as a revision-local catalog locator and never pretend the table OID is a column OID.',
    'Supported pg_get_* deparsers plus server_version_num generate revision evidence while catalog locators never contribute to canonical identity.',
    'Schema nominations must resolve through atlas_schema_object_registry before becoming atlas_evidence_entities canonical join keys.',
  ].join(' ');
}
