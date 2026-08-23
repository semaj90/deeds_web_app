import { z } from 'zod';

/**
 * Document classification schema with three evidence lanes:
 * 1. Lexical: noun/verb/identifier/error_term classification
 * 2. AST: tree-sitter/ast-grep node type classification
 * 3. Domain: naive bayes domain classification
 */

export const LexicalClassEnum = z.enum([
  'noun',
  'verb',
  'identifier',
  'error_term',
  'keyword',
  'type_declaration',
  'import_export',
  'comment',
  'string_literal',
  'numeric_literal',
  'operator',
  'punctuation',
  'unknown'
]);

export type LexicalClass = z.infer<typeof LexicalClassEnum>;

export const ASTNodeTypeEnum = z.enum([
  'function_declaration',
  'class_declaration',
  'interface_declaration',
  'type_alias',
  'variable_declaration',
  'import_statement',
  'export_statement',
  'call_expression',
  'property_access',
  'array_literal',
  'object_literal',
  'unknown'
]);

export type ASTNodeType = z.infer<typeof ASTNodeTypeEnum>;

export const DomainClassEnum = z.enum([
  'api_endpoint',
  'ui_component',
  'data_model',
  'business_logic',
  'infrastructure',
  'testing',
  'documentation',
  'configuration',
  'unknown'
]);

export type DomainClass = z.infer<typeof DomainClassEnum>;

export const LexicalFeaturesSchema = z.object({
  token_count: z.number().int().nonnegative(),
  contains_noun: z.boolean(),
  contains_verb: z.boolean(),
  contains_error_keywords: z.boolean(),
  token_patterns: z.array(z.string()).optional()
});

export type LexicalFeatures = z.infer<typeof LexicalFeaturesSchema>;

export const ASTFeaturesSchema = z.object({
  node_type: ASTNodeTypeEnum,
  depth: z.number().int().nonnegative(),
  children_count: z.number().int().nonnegative(),
  function_params: z.number().int().nonnegative().optional(),
  return_type: z.string().optional(),
  decorators: z.array(z.string()).optional()
});

export type ASTFeatures = z.infer<typeof ASTFeaturesSchema>;

export const NLPFeaturesSchema = z.object({
  embedding_768: z.array(z.number()).length(768),
  semantic_tags: z.array(z.string()).optional(),
  entity_types: z.array(z.string()).optional(),
  dependency_patterns: z.array(z.string()).optional()
});

export type NLPFeatures = z.infer<typeof NLPFeaturesSchema>;

export const DocumentClassificationSchema = z.object({
  id: z.string().uuid().optional(),
  source_ref: z.string().min(1),
  packet_key: z.string().optional(),

  // Lexical lane
  lexical_class: LexicalClassEnum.optional(),
  lexical_confidence: z.number().min(0).max(1).default(0),
  lexical_features: LexicalFeaturesSchema.optional(),

  // AST lane
  ast_node_type: ASTNodeTypeEnum.optional(),
  ast_class: z.string().optional(),
  ast_confidence: z.number().min(0).max(1).default(0),
  ast_features: ASTFeaturesSchema.optional(),

  // Domain lane (naive bayes)
  domain_class: DomainClassEnum.optional(),
  domain_confidence: z.number().min(0).max(1).default(0),

  // Unified result
  primary_class: z.string().optional(),
  secondary_classes: z.array(z.string()).optional(),
  final_confidence: z.number().min(0).max(1).default(0),

  nlp_features: NLPFeaturesSchema.optional(),

  created_at: z.date().optional(),
  updated_at: z.date().optional()
});

export type DocumentClassification = z.infer<typeof DocumentClassificationSchema>;

export const ClassificationInputSchema = DocumentClassificationSchema.pick({
  source_ref: true,
  packet_key: true,
  lexical_class: true,
  lexical_confidence: true,
  lexical_features: true,
  ast_node_type: true,
  ast_class: true,
  ast_confidence: true,
  ast_features: true,
  domain_class: true,
  domain_confidence: true,
  nlp_features: true
});

export type ClassificationInput = z.infer<typeof ClassificationInputSchema>;

/**
 * Unified classification logic: merge three lanes into primary + secondary classes
 */
export function unifyClassification(input: ClassificationInput): {
  primary_class: string;
  secondary_classes: string[];
  final_confidence: number;
} {
  const candidates: Array<{ class: string; confidence: number }> = [];

  if (input.lexical_class && input.lexical_confidence > 0) {
    candidates.push({
      class: `lexical:${input.lexical_class}`,
      confidence: input.lexical_confidence
    });
  }

  if (input.ast_class && input.ast_confidence > 0) {
    candidates.push({
      class: `ast:${input.ast_class}`,
      confidence: input.ast_confidence
    });
  }

  if (input.domain_class && input.domain_confidence > 0) {
    candidates.push({
      class: `domain:${input.domain_class}`,
      confidence: input.domain_confidence
    });
  }

  if (candidates.length === 0) {
    return {
      primary_class: 'unknown',
      secondary_classes: [],
      final_confidence: 0
    };
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  const primary = candidates[0];
  const secondary = candidates.slice(1);
  const final_confidence =
    candidates.reduce((sum, c) => sum + c.confidence, 0) / candidates.length;

  return {
    primary_class: primary.class,
    secondary_classes: secondary.map(c => c.class),
    final_confidence
  };
}
