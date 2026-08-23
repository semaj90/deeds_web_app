import { db } from '$lib/server/db/client';
import { atlas_document_classification } from '$lib/server/db/schema-postgres';
import {
  DocumentClassification,
  ClassificationInput,
  unifyClassification,
  LexicalClassEnum,
  ASTNodeTypeEnum,
  DomainClassEnum
} from '$lib/server/schemas/document-classification';
import { eq } from 'drizzle-orm';

/**
 * Three-lane document classification orchestrator:
 * 1. Lexical lane: LangExtract noun/verb/identifier extraction
 * 2. AST lane: tree-sitter/ast-grep node type classification
 * 3. Domain lane: naive bayes classifier over lexical + AST features
 */

export class DocumentClassifier {
  /**
   * Classify a document via all three lanes
   */
  async classifyDocument(sourceRef: string, input: Partial<ClassificationInput>) {
    // Run lanes in parallel
    const [lexicalResult, astResult, domainResult] = await Promise.all([
      this.lexicalLane(sourceRef, input),
      this.astLane(sourceRef, input),
      this.domainLane(sourceRef, input, lexicalResult, astResult)
    ]);

    // Unify results
    const unified = unifyClassification({
      source_ref: sourceRef,
      packet_key: input.packet_key,
      lexical_class: lexicalResult?.class,
      lexical_confidence: lexicalResult?.confidence ?? 0,
      lexical_features: lexicalResult?.features,
      ast_node_type: astResult?.nodeType,
      ast_class: astResult?.class,
      ast_confidence: astResult?.confidence ?? 0,
      ast_features: astResult?.features,
      domain_class: domainResult?.class,
      domain_confidence: domainResult?.confidence ?? 0,
      nlp_features: input.nlp_features
    });

    // Persist to database
    const result = await db
      .insert(atlas_document_classification)
      .values({
        source_ref: sourceRef,
        packet_key: input.packet_key,
        lexical_class: lexicalResult?.class,
        lexical_confidence: lexicalResult?.confidence ?? 0,
        ast_node_type: astResult?.nodeType,
        ast_class: astResult?.class,
        ast_confidence: astResult?.confidence ?? 0,
        domain_class: domainResult?.class,
        domain_confidence: domainResult?.confidence ?? 0,
        primary_class: unified.primary_class,
        secondary_classes: unified.secondary_classes,
        final_confidence: unified.final_confidence,
        lexical_features: lexicalResult?.features ?? null,
        ast_features: astResult?.features ?? null,
        nlp_features: input.nlp_features ?? null
      })
      .onConflictDoUpdate({
        target: atlas_document_classification.source_ref,
        set: {
          lexical_class: lexicalResult?.class,
          lexical_confidence: lexicalResult?.confidence ?? 0,
          ast_node_type: astResult?.nodeType,
          ast_class: astResult?.class,
          ast_confidence: astResult?.confidence ?? 0,
          domain_class: domainResult?.class,
          domain_confidence: domainResult?.confidence ?? 0,
          primary_class: unified.primary_class,
          secondary_classes: unified.secondary_classes,
          final_confidence: unified.final_confidence,
          updated_at: new Date()
        }
      })
      .returning();

    return result[0] as DocumentClassification;
  }

  /**
   * Lane 1: Lexical classification via LangExtract
   * Extract noun/verb/identifier patterns from text
   */
  private async lexicalLane(
    sourceRef: string,
    input: Partial<ClassificationInput>
  ) {
    // This would invoke LangExtract or similar NLP preprocessor
    // For now, return input if provided, else None
    if (input.lexical_features) {
      return {
        class: input.lexical_class,
        confidence: input.lexical_confidence ?? 0.5,
        features: input.lexical_features
      };
    }
    return null;
  }

  /**
   * Lane 2: AST classification via tree-sitter / ast-grep
   * Extract node type, depth, structure from source code
   */
  private async astLane(
    sourceRef: string,
    input: Partial<ClassificationInput>
  ) {
    // This would invoke ast-grep or tree-sitter parser
    // For now, return input if provided, else None
    if (input.ast_features) {
      return {
        nodeType: input.ast_node_type,
        class: input.ast_class,
        confidence: input.ast_confidence ?? 0.5,
        features: input.ast_features
      };
    }
    return null;
  }

  /**
   * Lane 3: Domain classification via naive bayes
   * Classify as api_endpoint, ui_component, data_model, etc.
   * Uses lexical + AST features as input
   */
  private async domainLane(
    sourceRef: string,
    input: Partial<ClassificationInput>,
    lexicalResult: any,
    astResult: any
  ) {
    // Naive bayes classifier: use lexical + AST features to predict domain
    // Training data would come from labeled atlas_packets with domain_class set
    // For MVP: return input.domain_class if provided
    if (input.domain_class) {
      return {
        class: input.domain_class,
        confidence: input.domain_confidence ?? 0.5
      };
    }

    // Fallback heuristic: infer from AST node type
    if (astResult?.nodeType) {
      const heuristics: Record<string, string> = {
        function_declaration: 'business_logic',
        class_declaration: 'data_model',
        interface_declaration: 'data_model',
        type_alias: 'data_model',
        import_statement: 'infrastructure',
        export_statement: 'infrastructure',
        call_expression: 'business_logic'
      };
      return {
        class: heuristics[astResult.nodeType] ?? 'unknown',
        confidence: 0.3 // Low confidence for heuristic
      };
    }

    return null;
  }

  /**
   * Retrieve cached classification
   */
  async getClassification(sourceRef: string): Promise<DocumentClassification | null> {
    const result = await db
      .select()
      .from(atlas_document_classification)
      .where(eq(atlas_document_classification.source_ref, sourceRef))
      .limit(1);

    return result[0] ?? null;
  }
}

export const documentClassifier = new DocumentClassifier();
