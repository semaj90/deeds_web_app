import { z } from 'zod';

/**
 * Language intelligence is intentionally split by authority:
 *
 * - Tree-sitter: language-agnostic concrete syntax/byte-span structure.
 * - ts-morph: TypeScript/JavaScript compiler-semantic specialization.
 * - LSP: cross-language semantic protocol (definition/reference/rename/etc.).
 *
 * None of these adapters directly authorizes canonical mutations. They emit
 * revision-qualified observations/nominations that Parent Atlas validates and
 * promotes through the existing DAG/identity owners.
 */

export const AtlasProgrammingLanguageSchema = z.enum([
  'TYPESCRIPT',
  'JAVASCRIPT',
  'SVELTE',
  'PYTHON',
  'RUST',
  'GO',
  'JAVA',
  'CSHARP',
  'CPP',
  'C',
  'SQL',
  'OTHER',
]);
export type AtlasProgrammingLanguage = z.infer<typeof AtlasProgrammingLanguageSchema>;

export const LanguageIntelligenceOperationSchema = z.enum([
  'STRUCTURE',
  'SYMBOLS',
  'TYPES',
  'DEFINITIONS',
  'REFERENCES',
  'IMPLEMENTATIONS',
  'CALL_HIERARCHY',
  'DIAGNOSTICS',
  'RENAME_PROPOSAL',
  'CODE_ACTION_PROPOSAL',
  'STRUCTURED_VALUE_EXTRACTION',
]);
export type LanguageIntelligenceOperation = z.infer<typeof LanguageIntelligenceOperationSchema>;

export const LanguageIntelligenceEngineSchema = z.enum([
  'TREE_SITTER',
  'TS_MORPH',
  'LSP',
]);
export type LanguageIntelligenceEngine = z.infer<typeof LanguageIntelligenceEngineSchema>;

export const LanguageEvidenceAuthoritySchema = z.enum([
  'SYNTAX_OBSERVATION',
  'COMPILER_SEMANTIC_OBSERVATION',
  'LANGUAGE_SERVER_SEMANTIC_OBSERVATION',
  'MUTATION_PROPOSAL_ONLY',
]);
export type LanguageEvidenceAuthority = z.infer<typeof LanguageEvidenceAuthoritySchema>;

export const LanguageRelationKindSchema = z.enum([
  'DEFINES',
  'REFERENCES',
  'IMPLEMENTS',
  'CALLS_CANDIDATE',
  'IMPORTS',
  'EXPORTS',
  'TYPE_OF',
  'EXTENDS',
  'STRUCTURED_MEMBER',
  'STRUCTURED_ARGUMENT',
  'DIAGNOSTIC_FOR',
]);
export type LanguageRelationKind = z.infer<typeof LanguageRelationKindSchema>;

export const LanguageSourceCoordinateV1Schema = z.object({
  sourceRef: z.string().min(1),
  filePath: z.string().min(1),
  startByte: z.number().int().nonnegative().nullable(),
  endByte: z.number().int().nonnegative().nullable(),
  startChar: z.number().int().nonnegative(),
  endChar: z.number().int().nonnegative(),
  startLine: z.number().int().positive().nullable(),
  endLine: z.number().int().positive().nullable(),
  treeNodeId: z.string().min(1).nullable(),
  symbolVersionId: z.string().min(1).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.endChar < value.startChar) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endChar'], message: 'endChar must be >= startChar' });
  }
  if (value.startByte !== null && value.endByte !== null && value.endByte < value.startByte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endByte'], message: 'endByte must be >= startByte' });
  }
});
export type LanguageSourceCoordinateV1 = z.infer<typeof LanguageSourceCoordinateV1Schema>;

export const LanguageSemanticEvidenceV1Schema = z.object({
  schema: z.literal('atlas.language-semantic-evidence.v1'),
  observationId: z.string().min(1),
  language: AtlasProgrammingLanguageSchema,
  engine: LanguageIntelligenceEngineSchema,
  authority: LanguageEvidenceAuthoritySchema,
  relationKind: LanguageRelationKindSchema.nullable(),
  subjectCanonicalId: z.string().min(1).nullable(),
  objectCanonicalId: z.string().min(1).nullable(),
  symbolName: z.string().min(1).nullable(),
  typeText: z.string().min(1).nullable(),
  coordinate: LanguageSourceCoordinateV1Schema,
  evidenceRefs: z.array(z.string().min(1)).min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  grammarRevision: z.string().min(1).nullable(),
  semanticEngineRevision: z.string().min(1).nullable(),
  requiresCanonicalPromotion: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type LanguageSemanticEvidenceV1 = z.infer<typeof LanguageSemanticEvidenceV1Schema>;

export const LanguageIntelligenceStageV1Schema = z.object({
  engine: LanguageIntelligenceEngineSchema,
  operations: z.array(LanguageIntelligenceOperationSchema).min(1),
  role: z.enum(['STRUCTURAL_OWNER', 'LANGUAGE_SPECIALIST', 'CROSS_LANGUAGE_SEMANTIC']),
  authority: LanguageEvidenceAuthoritySchema,
  primary: z.boolean(),
  canonicalWritesAllowed: z.literal(false),
  reasons: z.array(z.string().min(1)).min(1),
}).strict();
export type LanguageIntelligenceStageV1 = z.infer<typeof LanguageIntelligenceStageV1Schema>;

export const LanguageIntelligencePlanningInputV1Schema = z.object({
  schema: z.literal('atlas.language-intelligence-planning-input.v1'),
  language: AtlasProgrammingLanguageSchema,
  operations: z.array(LanguageIntelligenceOperationSchema).min(1),
  treeSitterAvailable: z.boolean(),
  tsMorphAvailable: z.boolean(),
  lspAvailable: z.boolean(),
  mutationSensitive: z.boolean(),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();
export type LanguageIntelligencePlanningInputV1 = z.infer<typeof LanguageIntelligencePlanningInputV1Schema>;

export const LanguageIntelligenceExecutionPlanV1Schema = z.object({
  schema: z.literal('atlas.language-intelligence-execution-plan.v1'),
  language: AtlasProgrammingLanguageSchema,
  stages: z.array(LanguageIntelligenceStageV1Schema).min(1),
  treeSitterOwnsStructuralCoordinates: z.literal(true),
  tsMorphRestrictedToTypeScriptFamily: z.literal(true),
  lspIsSemanticProtocolNotSyntaxOwner: z.literal(true),
  directMutationAllowed: z.literal(false),
  mutationRequiresDagAuthorization: z.literal(true),
  structuredValueOrderOwnedBySyntax: z.literal(true),
  semanticEnrichmentMayNotReorderMembers: z.literal(true),
  downstreamFeatureProjectionAllowed: z.literal(true),
  downstreamTournamentAllowed: z.literal(true),
  canonicalWritesAllowed: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type LanguageIntelligenceExecutionPlanV1 = z.infer<typeof LanguageIntelligenceExecutionPlanV1Schema>;

const STRUCTURAL_OPS = new Set<LanguageIntelligenceOperation>([
  'STRUCTURE',
  'SYMBOLS',
  'STRUCTURED_VALUE_EXTRACTION',
]);
const SEMANTIC_OPS = new Set<LanguageIntelligenceOperation>([
  'TYPES',
  'DEFINITIONS',
  'REFERENCES',
  'IMPLEMENTATIONS',
  'CALL_HIERARCHY',
  'DIAGNOSTICS',
]);
const MUTATION_OPS = new Set<LanguageIntelligenceOperation>([
  'RENAME_PROPOSAL',
  'CODE_ACTION_PROPOSAL',
]);

function isTypeScriptFamily(language: AtlasProgrammingLanguage): boolean {
  return language === 'TYPESCRIPT' || language === 'JAVASCRIPT';
}

function uniqueOperations(operations: readonly LanguageIntelligenceOperation[]): LanguageIntelligenceOperation[] {
  return [...new Set(operations.map((operation) => LanguageIntelligenceOperationSchema.parse(operation)))];
}

export function planLanguageIntelligence(value: LanguageIntelligencePlanningInputV1): LanguageIntelligenceExecutionPlanV1 {
  const input = LanguageIntelligencePlanningInputV1Schema.parse(value);
  const requested = uniqueOperations(input.operations);
  const structural = requested.filter((operation) => STRUCTURAL_OPS.has(operation));
  const semantic = requested.filter((operation) => SEMANTIC_OPS.has(operation));
  const mutations = requested.filter((operation) => MUTATION_OPS.has(operation));
  const stages: LanguageIntelligenceStageV1[] = [];

  if (structural.length > 0) {
    if (!input.treeSitterAvailable) throw new Error('TREE_SITTER_REQUIRED_FOR_STRUCTURAL_COORDINATE_OWNER');
    stages.push(LanguageIntelligenceStageV1Schema.parse({
      engine: 'TREE_SITTER',
      operations: structural,
      role: 'STRUCTURAL_OWNER',
      authority: 'SYNTAX_OBSERVATION',
      primary: true,
      canonicalWritesAllowed: false,
      reasons: [
        'TREE_SITTER_OWNS_BYTE_SPANS_NODE_KINDS_PARENT_CHILD_ORDER_AND_GRAMMAR_REVISION',
        'STRUCTURED_MEMBER_ORDER_MUST_COME_FROM_SOURCE_SYNTAX_NOT_TYPE_SERVICE_SORTING',
      ],
    }));
  }

  if (semantic.length > 0) {
    if (isTypeScriptFamily(input.language) && input.tsMorphAvailable) {
      stages.push(LanguageIntelligenceStageV1Schema.parse({
        engine: 'TS_MORPH',
        operations: semantic,
        role: 'LANGUAGE_SPECIALIST',
        authority: 'COMPILER_SEMANTIC_OBSERVATION',
        primary: true,
        canonicalWritesAllowed: false,
        reasons: [
          'TS_MORPH_EXPOSES_TYPES_DEFINITIONS_REFERENCES_AND_TYPESCRIPT_PROJECT_SEMANTICS',
          'TS_MORPH_ENRICHES_TREE_SITTER_COORDINATES_BUT_DOES_NOT_REPLACE_THE_CANONICAL_TREE_NODE_ID_OWNER',
        ],
      }));
      if (input.lspAvailable) {
        stages.push(LanguageIntelligenceStageV1Schema.parse({
          engine: 'LSP',
          operations: semantic,
          role: 'CROSS_LANGUAGE_SEMANTIC',
          authority: 'LANGUAGE_SERVER_SEMANTIC_OBSERVATION',
          primary: false,
          canonicalWritesAllowed: false,
          reasons: ['LSP_CAN_SHADOW_CROSS_CHECK_DEFINITION_REFERENCE_AND_DIAGNOSTIC_RESULTS_WITHOUT_CREATING_AN_EXTRA_RETRIEVAL_VOTE'],
        }));
      }
    } else {
      if (!input.lspAvailable) throw new Error(`LSP_REQUIRED_FOR_${input.language}_SEMANTIC_OPERATIONS`);
      stages.push(LanguageIntelligenceStageV1Schema.parse({
        engine: 'LSP',
        operations: semantic,
        role: 'CROSS_LANGUAGE_SEMANTIC',
        authority: 'LANGUAGE_SERVER_SEMANTIC_OBSERVATION',
        primary: true,
        canonicalWritesAllowed: false,
        reasons: [
          'LSP_STANDARDIZES_LANGUAGE_SERVER_SEMANTICS_ACROSS_PROGRAMMING_LANGUAGES',
          'TREE_SITTER_REMAINS_THE_SOURCE_ORDER_AND_STRUCTURAL_COORDINATE_OWNER',
        ],
      }));
    }
  }

  if (mutations.length > 0) {
    const engine: LanguageIntelligenceEngine = isTypeScriptFamily(input.language) && input.tsMorphAvailable
      ? 'TS_MORPH'
      : input.lspAvailable
        ? 'LSP'
        : (() => { throw new Error(`NO_MUTATION_PROPOSAL_ENGINE_FOR_${input.language}`); })();
    stages.push(LanguageIntelligenceStageV1Schema.parse({
      engine,
      operations: mutations,
      role: engine === 'TS_MORPH' ? 'LANGUAGE_SPECIALIST' : 'CROSS_LANGUAGE_SEMANTIC',
      authority: 'MUTATION_PROPOSAL_ONLY',
      primary: true,
      canonicalWritesAllowed: false,
      reasons: [
        'RENAME_AND_CODE_ACTION_OUTPUTS_ARE_PROPOSALS_ONLY',
        input.mutationSensitive
          ? 'MUTATION_SENSITIVE_REQUEST_REQUIRES_EXACT_SOURCE_EVIDENCE_REVISION_CAS_DAG_AUTHORIZATION_AND_VALIDATION'
          : 'HOST_DAG_STILL_AUTHORIZES_ANY_EVENTUAL_WRITE',
      ],
    }));
  }

  if (stages.length === 0) throw new Error('NO_LANGUAGE_INTELLIGENCE_STAGE_PLANNED');

  return LanguageIntelligenceExecutionPlanV1Schema.parse({
    schema: 'atlas.language-intelligence-execution-plan.v1',
    language: input.language,
    stages,
    treeSitterOwnsStructuralCoordinates: true,
    tsMorphRestrictedToTypeScriptFamily: true,
    lspIsSemanticProtocolNotSyntaxOwner: true,
    directMutationAllowed: false,
    mutationRequiresDagAuthorization: true,
    structuredValueOrderOwnedBySyntax: true,
    semanticEnrichmentMayNotReorderMembers: true,
    downstreamFeatureProjectionAllowed: true,
    downstreamTournamentAllowed: true,
    canonicalWritesAllowed: false,
    producerRevision: input.producerRevision,
  });
}

export const LanguageFeatureProjectionV1Schema = z.object({
  schema: z.literal('atlas.language-feature-projection.v1'),
  canonicalId: z.string().min(1),
  sourceRef: z.string().min(1),
  treeNodeId: z.string().min(1).nullable(),
  structuralConfidence: z.number().finite().min(0).max(1),
  typeResolutionConfidence: z.number().finite().min(0).max(1),
  definitionResolutionConfidence: z.number().finite().min(0).max(1),
  referenceBreadth: z.number().finite().min(0).max(1),
  implementationResolutionConfidence: z.number().finite().min(0).max(1),
  diagnosticPenalty: z.number().finite().min(0).max(1),
  exactSourceEvidence: z.boolean(),
  logicalLane: z.literal('ast'),
  logicalLaneVoteAdded: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type LanguageFeatureProjectionV1 = z.infer<typeof LanguageFeatureProjectionV1Schema>;

export function normalizedReferenceBreadth(referenceCount: number): number {
  if (!Number.isFinite(referenceCount) || referenceCount < 0) throw new Error('referenceCount must be non-negative');
  return Math.min(1, Math.log1p(referenceCount) / Math.log(65));
}
