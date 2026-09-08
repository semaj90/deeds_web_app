import { createHash } from 'node:crypto';
import { z } from 'zod';

export const SOURCE_LINEAGE_AXES_SCHEMA = 'atlas.source-lineage-axes.v1' as const;

const revision = z.string().min(1);
const sourceContentRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const sourceLineageAxesV1Schema = z.object({
  schema: z.literal(SOURCE_LINEAGE_AXES_SCHEMA),
  sourceRef: z.string().min(1),
  workspaceRevision: revision,
  /** Repository/compiler lineage. It is not a content digest. */
  repositoryRevision: revision,
  /** Exact source-byte lineage from the workspace binding. */
  sourceContentRevision,
  sourceRevisionAuthority: z.literal('SOURCE_BYTES_SHA256_V1'),
  repositoryRevisionAuthority: z.literal('REPOSITORY_REVISION_V1'),
  status: z.enum(['MATCHED', 'MISSING_BINDING', 'CONFLICT']),
  canonicalAuthority: z.literal(false),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type SourceLineageAxesV1 = z.infer<typeof sourceLineageAxesV1Schema>;

export interface SourceLineageSymbolClaimV1 {
  sourceRef: string;
  workspaceRevision: string;
  repositoryRevision: string;
}

export interface SourceLineageBindingClaimV1 {
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
}

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

function checksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

/**
 * Reconciles repository/compiler lineage with exact source-byte lineage.
 * The two axes are intentionally carried separately; this function never
 * selects an authority or rewrites either claim.
 */
export function reconcileSourceLineageAxesV1(
  symbol: SourceLineageSymbolClaimV1,
  binding: SourceLineageBindingClaimV1 | null,
): SourceLineageAxesV1 {
  const bindingRevisionIsValid = binding !== null && sourceContentRevision.safeParse(binding.sourceRevision).success;
  const status = binding === null
    ? 'MISSING_BINDING'
    : symbol.sourceRef !== binding.sourceRef || symbol.workspaceRevision !== binding.workspaceRevision
      ? 'CONFLICT'
      : bindingRevisionIsValid
        ? 'MATCHED'
        : 'CONFLICT';

  const payload = {
    schema: SOURCE_LINEAGE_AXES_SCHEMA,
    sourceRef: symbol.sourceRef,
    workspaceRevision: symbol.workspaceRevision,
    repositoryRevision: symbol.repositoryRevision,
    sourceContentRevision: bindingRevisionIsValid
      ? binding!.sourceRevision
      : 'sha256:' + '0'.repeat(64),
    sourceRevisionAuthority: 'SOURCE_BYTES_SHA256_V1' as const,
    repositoryRevisionAuthority: 'REPOSITORY_REVISION_V1' as const,
    status,
    canonicalAuthority: false as const,
  };

  return sourceLineageAxesV1Schema.parse({ ...payload, checksum: checksum(payload) });
}

export function verifySourceLineageAxesChecksumV1(value: SourceLineageAxesV1): boolean {
  const parsed = sourceLineageAxesV1Schema.parse(value);
  const { checksum: expected, ...payload } = parsed;
  return checksum(payload) === expected;
}
