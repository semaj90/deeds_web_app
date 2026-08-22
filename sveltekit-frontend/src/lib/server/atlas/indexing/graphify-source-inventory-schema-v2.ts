import { z } from 'zod';

export const GRAPHIFY_SOURCE_INVENTORY_SCHEMA_V2 = 'atlas.graphify-source-inventory-schema.v2' as const;

export const GRAPHIFY_RUN_REQUIRED_COLUMNS_V2 = [
  'run_id', 'workspace_id', 'repository_revision', 'workspace_revision',
  'source_manifest_digest', 'source_manifest_source_count',
  'parser_contract_version', 'extraction_contract_version',
] as const;

export const GRAPHIFY_FILE_REQUIRED_COLUMNS_V2 = [
  'file_id', 'workspace_id', 'source_ref', 'source_revision',
  'code_source_revision', 'content_hash', 'byte_length',
  'first_seen_run_id', 'last_seen_run_id',
] as const;

export const graphifySourceInventorySchemaObservationV2Schema = z.object({
  schema: z.literal(GRAPHIFY_SOURCE_INVENTORY_SCHEMA_V2),
  graphifyRunsPresent: z.boolean(),
  graphifyFilesPresent: z.boolean(),
  runColumns: z.array(z.string()),
  fileColumns: z.array(z.string()),
  requiredRunColumnsPresent: z.boolean(),
  requiredFileColumnsPresent: z.boolean(),
  v2Ready: z.boolean(),
  missingRunColumns: z.array(z.string()),
  missingFileColumns: z.array(z.string()),
}).strict();
export type GraphifySourceInventorySchemaObservationV2 = z.infer<typeof graphifySourceInventorySchemaObservationV2Schema>;

export function classifyGraphifySourceInventorySchemaV2(input: {
  graphifyRunsPresent: boolean;
  graphifyFilesPresent: boolean;
  runColumns: Iterable<string>;
  fileColumns: Iterable<string>;
}): GraphifySourceInventorySchemaObservationV2 {
  const runColumns = [...new Set(input.runColumns)].sort();
  const fileColumns = [...new Set(input.fileColumns)].sort();
  const run = new Set(runColumns);
  const file = new Set(fileColumns);
  const missingRunColumns = GRAPHIFY_RUN_REQUIRED_COLUMNS_V2.filter((column) => !run.has(column));
  const missingFileColumns = GRAPHIFY_FILE_REQUIRED_COLUMNS_V2.filter((column) => !file.has(column));
  const requiredRunColumnsPresent = input.graphifyRunsPresent && missingRunColumns.length === 0;
  const requiredFileColumnsPresent = input.graphifyFilesPresent && missingFileColumns.length === 0;
  return graphifySourceInventorySchemaObservationV2Schema.parse({
    schema: GRAPHIFY_SOURCE_INVENTORY_SCHEMA_V2,
    graphifyRunsPresent: input.graphifyRunsPresent,
    graphifyFilesPresent: input.graphifyFilesPresent,
    runColumns,
    fileColumns,
    requiredRunColumnsPresent,
    requiredFileColumnsPresent,
    v2Ready: requiredRunColumnsPresent && requiredFileColumnsPresent,
    missingRunColumns,
    missingFileColumns,
  });
}

/**
 * Legacy/current materializer contract audit. These columns describe the old
 * single-table writer shape and MUST NOT be inferred from the v2 migration.
 */
export const LEGACY_MATERIALIZER_FILE_COLUMNS = [
  'workspace_revision', 'git_blob_oid', 'source_revision_authority', 'producer_revision',
] as const;

export function legacyMaterializerCompatibleWithV2(fileColumns: Iterable<string>): boolean {
  const columns = new Set(fileColumns);
  return LEGACY_MATERIALIZER_FILE_COLUMNS.every((column) => columns.has(column));
}
