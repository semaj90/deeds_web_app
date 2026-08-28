import { createHash } from 'node:crypto';
import { z } from 'zod';

const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const projectGraphRevisionInputSchema = z.object({
  workspace_revision: z.string().min(1),
  project_ref: z.string().min(1),
  project_config_checksum: sha256,
  compiler_options_checksum: sha256,
  dependency_lock_checksum: sha256.nullable(),
  package_manifest_checksums: z.array(sha256),
  project_reference_checksums: z.array(sha256),
  declaration_file_checksums: z.array(sha256),
  source_revision_checksums: z.array(sha256),
  semantic_engine_revision: z.string().min(1),
  virtual_document_checksums: z.array(sha256),
  source_map_checksums: z.array(sha256),
}).strict();

export const projectGraphRevisionSchema = z.object({
  schema: z.literal('atlas.project-graph-revision.v1').default('atlas.project-graph-revision.v1'),
  workspace_revision: z.string().min(1),
  project_ref: z.string().min(1),
  project_config_checksum: sha256,
  compiler_options_checksum: sha256,
  dependency_lock_checksum: sha256.nullable(),
  semantic_engine_revision: z.string().min(1),
  input_source_revision_set_checksum: sha256,
  project_graph_revision: sha256,
}).strict();

export type ProjectGraphRevisionInputV1 = z.infer<typeof projectGraphRevisionInputSchema>;
export type ProjectGraphRevisionV1 = z.infer<typeof projectGraphRevisionSchema>;

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

/** Derives a compiler project revision without reading or writing a project. */
export function deriveProjectGraphRevision(raw: ProjectGraphRevisionInputV1): ProjectGraphRevisionV1 {
  const input = projectGraphRevisionInputSchema.parse(raw);
  const sourceSet = sorted(input.source_revision_checksums);
  const projectGraphRevision = digest({
    workspace_revision: input.workspace_revision,
    project_ref: input.project_ref,
    project_config_checksum: input.project_config_checksum,
    compiler_options_checksum: input.compiler_options_checksum,
    dependency_lock_checksum: input.dependency_lock_checksum,
    package_manifest_checksums: sorted(input.package_manifest_checksums),
    project_reference_checksums: sorted(input.project_reference_checksums),
    declaration_file_checksums: sorted(input.declaration_file_checksums),
    semantic_engine_revision: input.semantic_engine_revision,
    virtual_document_checksums: sorted(input.virtual_document_checksums),
    source_map_checksums: sorted(input.source_map_checksums),
    input_source_revision_set_checksum: digest(sourceSet),
  });
  return projectGraphRevisionSchema.parse({
    workspace_revision: input.workspace_revision,
    project_ref: input.project_ref,
    project_config_checksum: input.project_config_checksum,
    compiler_options_checksum: input.compiler_options_checksum,
    dependency_lock_checksum: input.dependency_lock_checksum,
    semantic_engine_revision: input.semantic_engine_revision,
    input_source_revision_set_checksum: digest(sourceSet),
    project_graph_revision: projectGraphRevision,
  });
}
