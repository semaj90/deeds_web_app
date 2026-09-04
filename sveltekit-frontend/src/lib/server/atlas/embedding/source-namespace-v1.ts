import { z } from 'zod';

/**
 * SOURCE-NAMESPACE-CONTRACT-01
 *
 * Formalizes the workspace/repository binding found live in
 * WORKSPACE-OWNER-BINDING-01 (docs/reports/workspace-owner-binding-01.json).
 * No new table, no migration — this names what the real `graphify_files`
 * table already proves, and is explicit about what it does NOT yet prove.
 *
 * PROVEN today (verified against live data, not assumed):
 *   - This repo has exactly one workspace. `workspaces.id` =
 *     625743d2-092b-4fa8-abe0-9dc094920c80 ("Graphify Default Workspace"),
 *     consistently FK-referenced by both `graphify_files.workspace_id` and
 *     `graphify_runs.workspace_id` — 885/885 graphify_files rows agree.
 *   - repositoryId = 'deeds-web-app' is consistent everywhere it appears
 *     (`atlas_workspace_source_bindings.repo_id`, and implicitly this is the
 *     only repository graphify_files/atlas_workspace_source_bindings track).
 *
 * NOT proven today — do not synthesize these:
 *   - bindingRevision: `graphify_files.workspace_revision` is NULL for
 *     512/885 (58%) of its own rows. Only 4 distinct real values exist
 *     (NULL, and 3 sha256-format strings). A row with a NULL
 *     workspace_revision has no bindingRevision — leave it unset, do not
 *     default to one of the other 3 real values or invent a placeholder.
 *   - directoryScope: not independently checked this pass. No evidence of
 *     multiple directory-scoped sub-workspaces was found (the single
 *     workspace appears to cover the whole repo), but that absence of
 *     evidence is not itself proof — this contract does not claim
 *     directoryScope='.' as PROVEN, it leaves the field optional.
 *   - Cross-table source_revision equivalence: `graphify_files.source_revision`
 *     is a git-blob-style 40-hex SHA-1; `atlas_packet_chunk_lineage.source_revision`
 *     is sha256-format. These are DIFFERENT revision-identity spaces for the
 *     same file — WORKSPACE-OWNER-BINDING-01 found they do not match as
 *     strings and no reconciliation (e.g. a git-blob-oid -> content-sha256
 *     mapping) has been proven to make them equivalent. Do not merge them.
 *
 * `atlas_workspace_source_bindings` was also audited and is a real,
 * well-formed, CHECK-constraint-enforced binding table — but it has ZERO
 * overlap with the embedded semantic_768 corpus (its 111 rows are an exact
 * match for the 647-row EXCLUDED_BY_POLICY population from
 * SEM768-COVERAGE-01). It is not useless, but it cannot supply a binding
 * for any row this contract is likely to be built for today.
 */

export const SOURCE_NAMESPACE_SCHEMA_V1 = 'atlas.source-namespace.v1' as const;

export const SourceNamespaceProvenanceV1Schema = z.enum([
  /** workspaceId + repositoryId resolved, but no bindingRevision for this row. */
  'WORKSPACE_IDENTITY_ONLY',
  /** workspaceId + repositoryId + a real, non-null bindingRevision all resolved. */
  'REVISION_BOUND',
]);
export type SourceNamespaceProvenanceV1 = z.infer<typeof SourceNamespaceProvenanceV1Schema>;

export const SourceNamespaceV1Schema = z
  .object({
    schema: z.literal(SOURCE_NAMESPACE_SCHEMA_V1),

    // PROVEN today: this repo's one real workspace.
    workspaceId: z.string().uuid(),
    repositoryId: z.string().min(1),

    // NOT independently proven this pass — optional, no default synthesized.
    directoryScope: z.string().min(1).optional(),

    // NOT proven for the majority of graphify_files rows (58% NULL) — only
    // set this when a real, non-null workspace_revision value exists.
    bindingRevision: z.string().min(1).optional(),
    bindingChecksum: z.string().regex(/^[a-f0-9]{64}$/i).optional(),

    // Which real table this binding was resolved from, for auditability.
    // 'atlas_workspace_source_bindings' is a valid source in principle but
    // per the module docstring currently only resolves the excluded-by-policy
    // population — a caller resolving from it should expect this, not be
    // surprised by it.
    resolvedFrom: z.enum(['graphify_files', 'atlas_workspace_source_bindings']),

    provenance: SourceNamespaceProvenanceV1Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasRevision = !!value.bindingRevision;
    if (value.provenance === 'REVISION_BOUND' && !hasRevision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['provenance'],
        message: 'provenance="REVISION_BOUND" requires a non-empty bindingRevision.',
      });
    }
    if (value.provenance === 'WORKSPACE_IDENTITY_ONLY' && hasRevision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['provenance'],
        message: 'provenance="WORKSPACE_IDENTITY_ONLY" must not carry a bindingRevision — use "REVISION_BOUND" instead.',
      });
    }
  });

export type SourceNamespaceV1 = z.infer<typeof SourceNamespaceV1Schema>;

/**
 * Builds a SourceNamespaceV1 from a graphify_files row's fields. Does NOT
 * query the database itself — pass in what a caller already fetched.
 * workspaceRevision may be null (58% of live graphify_files rows are) —
 * that is the expected, honest case, not an error.
 */
export function buildSourceNamespaceFromGraphifyFilesV1(input: {
  workspaceId: string;
  repositoryId: string;
  workspaceRevision: string | null;
}): SourceNamespaceV1 {
  const bindingRevision = input.workspaceRevision ?? undefined;
  return SourceNamespaceV1Schema.parse({
    schema: SOURCE_NAMESPACE_SCHEMA_V1,
    workspaceId: input.workspaceId,
    repositoryId: input.repositoryId,
    bindingRevision,
    resolvedFrom: 'graphify_files' as const,
    provenance: bindingRevision ? 'REVISION_BOUND' as const : 'WORKSPACE_IDENTITY_ONLY' as const,
  });
}
