import { createHash } from 'node:crypto';
import { z } from 'zod';

export const LEXICAL_FINGERPRINT_V1_SCHEMA = 'parent-atlas.lexical-fingerprint.v1' as const;

const HEX_SHA256 = z.string().regex(/^[a-f0-9]{64}$/);

export const LexicalTermStatV1Schema = z.object({
  term: z.string().min(1),
  documentFrequency: z.number().int().nonnegative(),
  corpusFrequency: z.number().int().nonnegative(),
}).strict();
export type LexicalTermStatV1 = z.infer<typeof LexicalTermStatV1Schema>;

export const LexicalFingerprintV1Schema = z.object({
  schema: z.literal(LEXICAL_FINGERPRINT_V1_SCHEMA),
  candidateRef: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  topLexemes: z.array(LexicalTermStatV1Schema).max(128),
  statisticsAvailable: z.boolean(),
  lexicalFeatureRevision: z.string().min(1),
  corpusSnapshotChecksum: HEX_SHA256,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  checksum: HEX_SHA256,
}).strict();

export type LexicalFingerprintV1 = z.infer<typeof LexicalFingerprintV1Schema>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Builds a candidate-scoped lexical feature from an already frozen corpus
 * observation. It deliberately accepts an opaque existing candidateRef rather
 * than creating identity, and records unavailable statistics explicitly.
 */
export function buildLexicalFingerprintV1(input: {
  candidateRef: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  lexicalFeatureRevision: string;
  corpusSnapshotChecksum: string;
  statistics?: readonly LexicalTermStatV1[];
}): LexicalFingerprintV1 {
  const statisticsAvailable = input.statistics !== undefined;
  const topLexemes = [...(input.statistics ?? [])]
    .map((stat) => LexicalTermStatV1Schema.parse({ ...stat, term: stat.term.trim().toLowerCase() }))
    .sort((left, right) =>
      right.documentFrequency - left.documentFrequency ||
      right.corpusFrequency - left.corpusFrequency ||
      left.term.localeCompare(right.term)
    )
    .filter((stat, index, all) => index === all.findIndex((candidate) => candidate.term === stat.term))
    .slice(0, 128);
  const body = {
    schema: LEXICAL_FINGERPRINT_V1_SCHEMA,
    candidateRef: input.candidateRef,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    workspaceRevision: input.workspaceRevision,
    topLexemes,
    statisticsAvailable,
    lexicalFeatureRevision: input.lexicalFeatureRevision,
    corpusSnapshotChecksum: input.corpusSnapshotChecksum,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  return LexicalFingerprintV1Schema.parse({ ...body, checksum: sha256(stableJson(body)) });
}
