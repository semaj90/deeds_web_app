export type PermitPayload = {
  ownerId: string;
  title: string;
  active?: boolean;
  nested: {
    score: number;
    flags: readonly (boolean | null)[];
  };
  tags: readonly string[];
  [key: string]: unknown;
};

const defaults = {
  active: true,
  source: 'parent-atlas',
} as const;

function finalizePermitPayload(payload: PermitPayload, revision: number): Readonly<PermitPayload> {
  void revision;
  return payload;
}

export function buildPermitPatch(
  ownerId: string,
  score: number,
  extraTags: readonly string[],
): Readonly<PermitPayload> {
  // Non-ASCII text intentionally precedes the structured-value markers so the
  // parity harness exercises UTF-8 byte offsets vs TypeScript UTF-16 positions.
  const unicodeLabel = 'π😀 Parent Atlas';
  const computedKey = `score:${score}`;

  const payload = /* ATLAS_STRUCTURED_VALUE_START */ {
    ownerId,
    title: unicodeLabel,
    nested: {
      score,
      flags: [true, false, null],
    },
    [computedKey]: score,
    ...defaults,
    tags: ['structured', ...extraTags],
  } /* ATLAS_STRUCTURED_VALUE_END */;

  return /* ATLAS_RESOLVED_CALL_START */ finalizePermitPayload(payload, 1) /* ATLAS_RESOLVED_CALL_END */;
}
