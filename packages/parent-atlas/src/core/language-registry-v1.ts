import { z } from 'zod';

/**
 * A vocabulary label is always namespaced and attributed to the owner that
 * emitted it. This registry reconciles vocabularies; it does not replace the
 * language enum or grammar registries owned by individual parsers.
 */
export const LanguageLabelNamespaceV1Schema = z.enum([
  'CONTENT_LANGUAGE',
  'AST_PARSER_LANGUAGE',
  'PARSER_GRAMMAR_ID',
  'FILE_EXTENSION',
  'SIDECAR_LANGUAGE',
]);
export type LanguageLabelNamespaceV1 = z.infer<typeof LanguageLabelNamespaceV1Schema>;

export const LanguageVocabularyV1Schema = z.object({
  sourceOwner: z.string().min(1),
  sourceRevision: z.string().min(1),
  namespace: LanguageLabelNamespaceV1Schema,
  labels: z.array(z.string().min(1)),
}).strict();
export type LanguageVocabularyV1 = z.infer<typeof LanguageVocabularyV1Schema>;

export const LanguageAliasBindingV1Schema = z.object({
  fromNamespace: LanguageLabelNamespaceV1Schema,
  fromLabel: z.string().min(1),
  toNamespace: LanguageLabelNamespaceV1Schema,
  toLabel: z.string().min(1),
  authorityOwner: z.string().min(1),
  authorityRevision: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();
export type LanguageAliasBindingV1 = z.infer<typeof LanguageAliasBindingV1Schema>;

export const LanguageLabelResolutionV1Schema = z.object({
  schema: z.literal('atlas.language-label-resolution.v1'),
  inputNamespace: LanguageLabelNamespaceV1Schema,
  inputLabel: z.string().min(1),
  status: z.enum(['RESOLVED', 'UNMAPPED', 'UNSUPPORTED', 'AMBIGUOUS']),
  targetNamespace: LanguageLabelNamespaceV1Schema.nullable(),
  targetLabel: z.string().min(1).nullable(),
  matchedBindings: z.number().int().nonnegative(),
  evidenceRefs: z.array(z.string().min(1)),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();
export type LanguageLabelResolutionV1 = z.infer<typeof LanguageLabelResolutionV1Schema>;

export interface LanguageRegistryV1 {
  schema: 'atlas.language-registry.v1';
  vocabularies: LanguageVocabularyV1[];
  bindings: LanguageAliasBindingV1[];
  canonicalAuthority: false;
  writesPerformed: false;
}

function labelKey(namespace: LanguageLabelNamespaceV1, label: string): string {
  return `${namespace}\u0000${label.trim().toLocaleLowerCase('en-US')}`;
}

/** Build a read-only registry snapshot from source-owned vocabularies/bindings. */
export function buildLanguageRegistryV1(input: {
  vocabularies: LanguageVocabularyV1[];
  bindings: LanguageAliasBindingV1[];
}): LanguageRegistryV1 {
  const vocabularies = input.vocabularies.map((item) => LanguageVocabularyV1Schema.parse(item))
    .map((item) => ({ ...item, labels: [...item.labels].sort((a, b) => a.localeCompare(b, 'en-US')) }))
    .sort((a, b) => `${a.namespace}\u0000${a.sourceOwner}\u0000${a.sourceRevision}`.localeCompare(
      `${b.namespace}\u0000${b.sourceOwner}\u0000${b.sourceRevision}`, 'en-US'));
  const bindings = input.bindings.map((item) => LanguageAliasBindingV1Schema.parse(item))
    .map((item) => ({ ...item, evidenceRefs: [...new Set(item.evidenceRefs)].sort((a, b) => a.localeCompare(b, 'en-US')) }))
    .sort((a, b) => `${a.fromNamespace}\u0000${a.fromLabel}\u0000${a.toNamespace}\u0000${a.toLabel}\u0000${a.authorityOwner}\u0000${a.authorityRevision}`
      .localeCompare(`${b.fromNamespace}\u0000${b.fromLabel}\u0000${b.toNamespace}\u0000${b.toLabel}\u0000${b.authorityOwner}\u0000${b.authorityRevision}`, 'en-US'));
  const known = new Set(vocabularies.flatMap((item) => item.labels.map((label) => labelKey(item.namespace, label))));
  for (const binding of bindings) {
    if (!known.has(labelKey(binding.fromNamespace, binding.fromLabel))) {
      throw new Error(`LANGUAGE_ALIAS_SOURCE_NOT_IN_VOCABULARY:${binding.fromNamespace}:${binding.fromLabel}`);
    }
    if (!known.has(labelKey(binding.toNamespace, binding.toLabel))) {
      throw new Error(`LANGUAGE_ALIAS_TARGET_NOT_IN_VOCABULARY:${binding.toNamespace}:${binding.toLabel}`);
    }
  }
  return {
    schema: 'atlas.language-registry.v1',
    vocabularies,
    bindings,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}

/** Resolve only explicit, source-qualified bindings; never infer aliases. */
export function resolveLanguageLabelV1(
  registry: LanguageRegistryV1,
  input: { namespace: LanguageLabelNamespaceV1; label: string },
): LanguageLabelResolutionV1 {
  const namespace = LanguageLabelNamespaceV1Schema.parse(input.namespace);
  const label = z.string().min(1).parse(input.label);
  const key = labelKey(namespace, label);
  const vocabularyHasLabel = registry.vocabularies.some((vocabulary) =>
    vocabulary.namespace === namespace && vocabulary.labels.some((candidate) => labelKey(namespace, candidate) === key));
  const matches = registry.bindings.filter((binding) =>
    labelKey(binding.fromNamespace, binding.fromLabel) === key);
  const targets = new Map<string, LanguageAliasBindingV1>();
  for (const match of matches) {
    targets.set(`${match.toNamespace}\u0000${match.toLabel}`, match);
  }

  if (targets.size > 1) {
    return LanguageLabelResolutionV1Schema.parse({
      schema: 'atlas.language-label-resolution.v1', inputNamespace: namespace, inputLabel: label,
      status: 'AMBIGUOUS', targetNamespace: null, targetLabel: null, matchedBindings: matches.length,
      evidenceRefs: [...new Set(matches.flatMap((match) => match.evidenceRefs))],
      canonicalAuthority: false, writesPerformed: false,
    });
  }

  if (targets.size === 1) {
    const binding = [...targets.values()][0]!;
    return LanguageLabelResolutionV1Schema.parse({
      schema: 'atlas.language-label-resolution.v1', inputNamespace: namespace, inputLabel: label,
      status: 'RESOLVED', targetNamespace: binding.toNamespace, targetLabel: binding.toLabel,
      matchedBindings: matches.length, evidenceRefs: [...new Set(matches.flatMap((match) => match.evidenceRefs))],
      canonicalAuthority: false, writesPerformed: false,
    });
  }

  return LanguageLabelResolutionV1Schema.parse({
    schema: 'atlas.language-label-resolution.v1', inputNamespace: namespace, inputLabel: label,
    status: vocabularyHasLabel ? 'UNMAPPED' : 'UNSUPPORTED', targetNamespace: null, targetLabel: null, matchedBindings: 0,
    evidenceRefs: [], canonicalAuthority: false, writesPerformed: false,
  });
}
