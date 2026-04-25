/**
 * QLoRA Training Data Formatter
 * Specialized formatter for legal document QLoRA fine-tuning data
 * Optimizes for Gemma model training with legal domain knowledge
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { ProcessedLegalDocument } from './auto-document-fetcher.js';
import type { VectorizedDocument } from './gemma-embedding-service.js';

export interface QLoRATrainingExample {
  instruction: string;
  input: string;
  output: string;
  metadata: {
    document_id: string;
    legal_area: string;
    difficulty_level: number;
    token_count: number;
    source_type: string;
    confidence_score: number;
  };
}

export interface TrainingDataset {
  examples: QLoRATrainingExample[];
  metadata: {
    total_examples: number;
    by_legal_area: Record<string, number>;
    by_difficulty: Record<string, number>;
    by_source_type: Record<string, number>;
    avg_token_count: number;
    total_tokens: number;
    creation_date: string;
    version: string;
  };
}

export interface FormatterConfig {
  output_formats: ('jsonl' | 'json' | 'huggingface' | 'alpaca' | 'sharegpt')[];
  instruction_templates: InstructionTemplate[];
  token_limits: {
    max_input_tokens: number;
    max_output_tokens: number;
    max_total_tokens: number;
  };
  quality_filters: {
    min_confidence: number;
    min_content_length: number;
    max_content_length: number;
    required_legal_concepts: number;
  };
  augmentation: {
    enable_paraphrasing: boolean;
    enable_context_injection: boolean;
    enable_multi_turn: boolean;
    synthetic_examples_ratio: number;
  };
}

export interface InstructionTemplate {
  id: string;
  template: string;
  legal_area: string[];
  difficulty: number;
  output_format: 'analysis' | 'summary' | 'advice' | 'explanation' | 'comparison';
  examples: string[];
}

export class QLoRATrainingFormatter {
  private defaultConfig: FormatterConfig = {
    output_formats: ['jsonl', 'json'],
    instruction_templates: [],
    token_limits: {
      max_input_tokens: 2048,
      max_output_tokens: 1024,
      max_total_tokens: 3072
    },
    quality_filters: {
      min_confidence: 0.7,
      min_content_length: 100,
      max_content_length: 8000,
      required_legal_concepts: 2
    },
    augmentation: {
      enable_paraphrasing: false,
      enable_context_injection: true,
      enable_multi_turn: false,
      synthetic_examples_ratio: 0.1
    }
  };

  constructor(private config: Partial<FormatterConfig> = {}) {
    this.config = { ...this.defaultConfig, ...config };
    this.initializeInstructionTemplates();
  }

  /**
   * Format legal documents into QLoRA training examples
   */
  async formatDocuments(
    documents: ProcessedLegalDocument[] | VectorizedDocument[],
    outputDir = './data/training'
  ): Promise<TrainingDataset> {
    console.log(`🎓 Formatting ${documents.length} documents for QLoRA training...`);

    await fs.mkdir(outputDir, { recursive: true });

    // Step 1: Filter documents by quality
    const qualifiedDocs = this.filterByQuality(documents);
    console.log(`✅ ${qualifiedDocs.length} documents passed quality filters`);

    // Step 2: Generate training examples
    const examples = await this.generateTrainingExamples(qualifiedDocs);
    console.log(`📝 Generated ${examples.length} training examples`);

    // Step 3: Apply augmentation
    const augmentedExamples = await this.augmentExamples(examples);
    console.log(`🔄 Augmented to ${augmentedExamples.length} total examples`);

    // Step 4: Create dataset
    const dataset = this.createDataset(augmentedExamples);

    // Step 5: Export in various formats
    await this.exportDataset(dataset, outputDir);

    console.log(`🎯 QLoRA training data formatted successfully`);
    return dataset;
  }

  /**
   * Filter documents by quality criteria
   */
  private filterByQuality(documents: any[]): any[] {
    const { quality_filters } = this.config as FormatterConfig;

    return documents.filter(doc => {
      // Confidence score check
      if (doc.metadata.confidence_score < quality_filters.min_confidence) {
        return false;
      }

      // Content length check
      const contentLength = doc.content.length;
      if (contentLength < quality_filters.min_content_length ||
          contentLength > quality_filters.max_content_length) {
        return false;
      }

      // Legal concepts check
      const legalConcepts = this.extractLegalConcepts(doc.content);
      if (legalConcepts.length < quality_filters.required_legal_concepts) {
        return false;
      }

      return true;
    });
  }

  /**
   * Generate training examples from documents
   */
  private async generateTrainingExamples(documents: any[]): Promise<QLoRATrainingExample[]> {
    const examples: QLoRATrainingExample[] = [];

    for (const doc of documents) {
      const docExamples = await this.createExamplesFromDocument(doc);
      examples.push(...docExamples);
    }

    return examples;
  }

  /**
   * Create multiple training examples from a single document
   */
  private async createExamplesFromDocument(doc: any): Promise<QLoRATrainingExample[]> {
    const examples: QLoRATrainingExample[] = [];
    const templates = this.getRelevantTemplates(doc.metadata.legal_area);

    // Generate examples using different templates
    for (const template of templates.slice(0, 3)) { // Limit to 3 examples per document
      try {
        const example = await this.createExample(doc, template);
        if (example) {
          examples.push(example as QLoRATrainingExample);
        }
      } catch (error) {
        console.warn(`Failed to create example for document ${doc.id}:`, error);
      }
    }

    return examples;
  }

  /**
   * Create a single training example
   */
  private async createExample(doc: any, template: InstructionTemplate): Promise<QLoRATrainingExample | null> {
    const tokenLimit = (this.config as FormatterConfig).token_limits;

    // Prepare input content
    let inputContent = doc.content;

    // Truncate if too long
    if (this.estimateTokens(inputContent) > tokenLimit.max_input_tokens) {
      inputContent = this.truncateToTokenLimit(inputContent, tokenLimit.max_input_tokens);
    }

    // Generate instruction
    const instruction = this.interpolateTemplate(template.template, doc);

    // Generate input
    const input = this.formatInput(inputContent, doc, template);

    // Generate output based on template type
    const output = await this.generateOutput(doc, template);

    if (!output || this.estimateTokens(output) > tokenLimit.max_output_tokens) {
      return null;
    }

    const totalTokens = this.estimateTokens(instruction + input + output);
    if (totalTokens > tokenLimit.max_total_tokens) {
      return null;
    }

    return {
      instruction,
      input,
      output,
      metadata: {
        document_id: doc.id,
        legal_area: doc.metadata.legal_area,
        difficulty_level: template.difficulty,
        token_count: totalTokens,
        source_type: template.output_format,
        confidence_score: doc.metadata.confidence_score
      }
    };
  }

  /**
   * Generate output based on template type
   */
  private async generateOutput(doc: any, template: InstructionTemplate): Promise<string> {
    const legalConcepts = this.extractLegalConcepts(doc.content);
    const jurisdiction = doc.metadata.jurisdiction || 'general';
    const docType = doc.metadata.document_type || 'legal document';

    switch (template.output_format) {
      case 'analysis':
        return `This ${docType} addresses key legal principles in ${doc.metadata.legal_area}. The primary legal concepts include: ${legalConcepts.slice(0, 5).join(', ')}. Under ${jurisdiction} jurisdiction, this document establishes important precedents for ${this.inferLegalImplications(doc.content, legalConcepts)}. The legal significance lies in its treatment of ${this.identifyKeyIssues(doc.content)}, which affects both current legal practice and future case development.`;

      case 'summary':
        return `Summary: This ${docType} focuses on ${doc.metadata.legal_area} matters within ${jurisdiction} jurisdiction. Key points include: 1) ${this.extractKeyPoint(doc.content, 0)}, 2) ${this.extractKeyPoint(doc.content, 1)}, 3) ${this.extractKeyPoint(doc.content, 2)}. The document addresses ${legalConcepts.join(', ')} and provides guidance on ${this.inferPracticalApplication(doc.content)}.`;

      case 'advice':
        return `Legal Advice: Based on this ${docType}, practitioners should consider: 1) The established precedent regarding ${legalConcepts[0] || 'the main legal issue'}, 2) Compliance requirements under ${jurisdiction} law, 3) Potential risks related to ${this.identifyRisks(doc.content)}. Recommended actions include thorough review of ${this.suggestReviewAreas(legalConcepts)}.`;

      case 'explanation':
        return `Legal Explanation: This document illustrates ${doc.metadata.legal_area} principles through ${docType} analysis. The legal framework involves ${legalConcepts.join(', ')}, which operate under ${jurisdiction} jurisdiction. Key legal mechanisms include ${this.explainMechanisms(doc.content, legalConcepts)}. Understanding these concepts is crucial for ${this.identifyAudience(template.difficulty)}.`;

      case 'comparison':
        return `Comparative Analysis: This ${docType} can be compared to similar cases in ${doc.metadata.legal_area}. It differs from standard approaches by ${this.identifyUniqueAspects(doc.content)}. Common elements include ${legalConcepts.slice(0, 3).join(', ')}, while distinctive features involve ${this.identifyDistinguishingFactors(doc.content)}. This analysis is relevant for ${jurisdiction} practitioners handling similar matters.`;

      default:
        return `This legal document discusses ${doc.metadata.legal_area} and covers important concepts including ${legalConcepts.join(', ')}.`;
    }
  }

  /**
   * Augment examples with variations and synthetic data
   */
  private async augmentExamples(examples: QLoRATrainingExample[]): Promise<QLoRATrainingExample[]> {
    const augmentationConfig = (this.config as FormatterConfig).augmentation;
    if (!augmentationConfig.enable_context_injection && !augmentationConfig.enable_paraphrasing) {
      return examples;
    }

    const augmented = [...examples];

    // Context injection
    if (augmentationConfig.enable_context_injection) {
      const contextVariations = examples
        .slice(0, Math.floor(examples.length * 0.2))
        .map((example) => this.injectContext(example));
      augmented.push(...contextVariations);
    }

    // Paraphrasing (simplified version)
    if (augmentationConfig.enable_paraphrasing) {
      const paraphrased = examples
        .slice(0, Math.floor(examples.length * 0.1))
        .map((example) => this.paraphraseExample(example));
      augmented.push(...paraphrased);
    }

    return augmented;
  }

  /**
   * Create dataset with metadata
   */
  private createDataset(examples: QLoRATrainingExample[]): TrainingDataset {
    const byLegalArea: Record<string, number> = {};
    const byDifficulty: Record<string, number> = {};
    const bySourceType: Record<string, number> = {};
    let totalTokens = 0;

    for (const example of examples) {
      const { legal_area, difficulty_level, source_type, token_count } = example.metadata;

      byLegalArea[legal_area] = (byLegalArea[legal_area] || 0) + 1;
      byDifficulty[difficulty_level.toString()] = (byDifficulty[difficulty_level.toString()] || 0) + 1;
      bySourceType[source_type] = (bySourceType[source_type] || 0) + 1;
      totalTokens += token_count;
    }

    return {
      examples,
      metadata: {
        total_examples: examples.length,
        by_legal_area: byLegalArea,
        by_difficulty: byDifficulty,
        by_source_type: bySourceType,
        avg_token_count: Math.round(totalTokens / examples.length),
        total_tokens: totalTokens,
        creation_date: new Date().toISOString(),
        version: '1.0.0'
      }
    };
  }

  /**
   * Export dataset in multiple formats
   */
  private async exportDataset(dataset: TrainingDataset, outputDir: string): Promise<void> {
    const formats = (this.config as FormatterConfig).output_formats;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    for (const format of formats) {
      const fileName = `legal-training-${timestamp}.${this.getFileExtension(format)}`;
      const filePath = path.join(outputDir, fileName);

      let content: string;

      switch (format) {
        case 'jsonl':
          content = dataset.examples
            .map(ex => JSON.stringify({
              instruction: ex.instruction,
              input: ex.input,
              output: ex.output
            }))
            .join('\n');
          break;

        case 'json':
          content = JSON.stringify(dataset, null, 2);
          break;

        case 'huggingface':
          content = JSON.stringify(
            dataset.examples.map(ex => ({
              text: `### Instruction:\n${ex.instruction}\n\n### Input:\n${ex.input}\n\n### Response:\n${ex.output}`
            })),
            null,
            2
          );
          break;

        case 'alpaca':
          content = JSON.stringify(
            dataset.examples.map(ex => ({
              instruction: ex.instruction,
              input: ex.input,
              output: ex.output
            })),
            null,
            2
          );
          break;

        case 'sharegpt':
          content = JSON.stringify(
            dataset.examples.map(ex => ({
              conversations: [
                { from: 'human', value: `${ex.instruction}\n\n${ex.input}` },
                { from: 'gpt', value: ex.output }
              ]
            })),
            null,
            2
          );
          break;

        default:
          continue;
      }

      await fs.writeFile(filePath, content, 'utf-8');
      console.log(`💾 Exported ${format.toUpperCase()}: ${filePath}`);
    }

    // Export metadata separately
    const metadataPath = path.join(outputDir, `metadata-${timestamp}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(dataset.metadata, null, 2));
    console.log(`📊 Exported metadata: ${metadataPath}`);
  }

  /**
   * Initialize instruction templates
   */
  private initializeInstructionTemplates(): void {
    (this.config as FormatterConfig).instruction_templates = [
      {
        id: 'contract_analysis',
        template: 'Analyze this {doc_type} and identify the key contractual elements and their legal implications.',
        legal_area: ['contract-law', 'business-law'],
        difficulty: 3,
        output_format: 'analysis',
        examples: []
      },
      {
        id: 'tort_liability',
        template: 'Explain the tort liability principles established in this {doc_type} and their practical applications.',
        legal_area: ['tort-law'],
        difficulty: 4,
        output_format: 'explanation',
        examples: []
      },
      {
        id: 'constitutional_rights',
        template: 'Summarize the constitutional principles discussed in this {doc_type} and their impact on civil rights.',
        legal_area: ['constitutional-law'],
        difficulty: 5,
        output_format: 'summary',
        examples: []
      },
      {
        id: 'criminal_procedure',
        template: 'Analyze the criminal procedure aspects of this {doc_type} and provide guidance for practitioners.',
        legal_area: ['criminal-law'],
        difficulty: 4,
        output_format: 'advice',
        examples: []
      },
      {
        id: 'legal_comparison',
        template: 'Compare the legal approaches in this {doc_type} with similar cases and highlight distinguishing factors.',
        legal_area: ['general'],
        difficulty: 3,
        output_format: 'comparison',
        examples: []
      }
    ];
  }

  /**
   * Helper methods
   */
  private getRelevantTemplates(legalArea: string): InstructionTemplate[] {
    const templates = (this.config as FormatterConfig).instruction_templates;
    return templates.filter(template =>
      template.legal_area.includes(legalArea) || template.legal_area.includes('general')
    );
  }

  private interpolateTemplate(template: string, doc: any): string {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      switch (key) {
        case 'doc_type':
          return doc.metadata.document_type || 'legal document';
        case 'legal_area':
          return doc.metadata.legal_area || 'law';
        case 'jurisdiction':
          return doc.metadata.jurisdiction || 'applicable jurisdiction';
        default:
          return match;
      }
    });
  }

  private formatInput(content: string, doc: any, template: InstructionTemplate): string {
    const title = doc.title || 'Legal Document';
    const docType = doc.metadata.document_type || 'document';

    return `Document Title: ${title}\nDocument Type: ${docType}\nLegal Area: ${doc.metadata.legal_area}\n\nContent:\n${content}`;
  }

  private extractLegalConcepts(content: string): string[] {
    const concepts = [
      'contract', 'tort', 'negligence', 'liability', 'damages', 'breach', 'duty',
      'jurisdiction', 'precedent', 'statute', 'regulation', 'constitutional',
      'due process', 'equal protection', 'evidence', 'discovery', 'motion',
      'appeal', 'remedy', 'injunction', 'standing', 'causation'
    ];

    return concepts.filter(concept =>
      new RegExp(`\\b${concept}\\b`, 'i').test(content)
    );
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.split(/\s+/).length * 1.3);
  }

  private truncateToTokenLimit(text: string, tokenLimit: number): string {
    const words = text.split(/\s+/);
    const maxWords = Math.floor(tokenLimit / 1.3);
    return words.slice(0, maxWords).join(' ');
  }

  private getFileExtension(format: string): string {
    const extensions: Record<string, string> = {
      'jsonl': 'jsonl',
      'json': 'json',
      'huggingface': 'json',
      'alpaca': 'json',
      'sharegpt': 'json'
    };
    return extensions[format] || 'txt';
  }

  // Simplified helper methods for output generation
  private inferLegalImplications(content: string, concepts: string[]): string {
    return concepts.length > 0 ? `${concepts[0]} law and related doctrines` : 'applicable legal standards';
  }

  private identifyKeyIssues(content: string): string {
    const issues = ['liability standards', 'procedural requirements', 'substantive rights', 'judicial interpretation'];
    return issues[Math.floor(Math.random() * issues.length)];
  }

  private extractKeyPoint(content: string, index: number): string {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    return sentences[index] || `Legal principle ${index + 1}`;
  }

  private inferPracticalApplication(content: string): string {
    return 'practical compliance and risk management';
  }

  private identifyRisks(content: string): string {
    return 'regulatory compliance and potential liabilities';
  }

  private suggestReviewAreas(concepts: string[]): string {
    return concepts.length > 0 ? `${concepts.slice(0, 2).join(' and ')} provisions` : 'relevant legal provisions';
  }

  private explainMechanisms(content: string, concepts: string[]): string {
    return concepts.length > 0 ? `${concepts[0]} enforcement and compliance mechanisms` : 'legal compliance mechanisms';
  }

  private identifyAudience(difficulty: number): string {
    const audiences = ['law students', 'junior practitioners', 'experienced attorneys', 'legal specialists', 'expert practitioners'];
    return audiences[Math.min(difficulty - 1, audiences.length - 1)];
  }

  private identifyUniqueAspects(content: string): string {
    return 'its approach to jurisdictional requirements and procedural standards';
  }

  private identifyDistinguishingFactors(content: string): string {
    return 'specific factual circumstances and legal precedent application';
  }

  private injectContext(example: QLoRATrainingExample): QLoRATrainingExample {
    return {
      ...example,
      input: `Context: This analysis is for ${example.metadata.legal_area} practitioners.\n\n${example.input}`,
      metadata: {
        ...example.metadata,
        source_type: 'context_injected'
      }
    };
  }

  private paraphraseExample(example: QLoRATrainingExample): QLoRATrainingExample {
    // Simple paraphrasing by varying instruction wording
    const paraphrases: Record<string, string> = {
      'Analyze': 'Examine',
      'Explain': 'Describe',
      'Summarize': 'Outline',
      'identify': 'determine',
      'discuss': 'address'
    };

    let paraphrasedInstruction = example.instruction;
    for (const [original, replacement] of Object.entries(paraphrases)) {
      paraphrasedInstruction = paraphrasedInstruction.replace(
        new RegExp(original, 'gi'),
        replacement
      );
    }

    return {
      ...example,
      instruction: paraphrasedInstruction,
      metadata: {
        ...example.metadata,
        source_type: 'paraphrased'
      }
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Test basic functionality
      const testDoc = {
        id: 'test',
        title: 'Test Document',
        content: 'This is a test legal document about contract law.',
        metadata: {
          legal_area: 'contract-law',
          document_type: 'test',
          jurisdiction: 'test',
          confidence_score: 0.8
        }
      };

      const examples = await this.createExamplesFromDocument(testDoc);
      return examples.length > 0;
    } catch (error) {
      console.error('QLoRA Training Formatter health check failed:', error);
      return false;
    }
  }
}

// Export singleton
export const qloraTrainingFormatter = new QLoRATrainingFormatter();
export default qloraTrainingFormatter;
