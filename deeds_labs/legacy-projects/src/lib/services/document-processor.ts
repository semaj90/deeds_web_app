/**
 * Document Processor Service
 * Handles JSON/JSONL conversion, metadata extraction, and data formatting
 * for legal document processing pipeline
 */

import fs from 'fs/promises';
import path from 'path';
import type { ProcessedLegalDocument, QLoRATrainingData } from './auto-document-fetcher.js';
import type { DocumentChunk } from './document-ingestion-service.js';

export interface DocumentMetadata {
  id: string;
  title: string;
  source: string;
  legal_area: string;
  document_type: string;
  jurisdiction: string;
  date_extracted: string;
  word_count: number;
  chunk_count: number;
  confidence_score: number;
  processing_status: 'pending' | 'processed' | 'embedded' | 'indexed';
  tags: string[];
  complexity_score: number;
}

export interface EnhancedDocumentChunk extends DocumentChunk {
  embedding?: number[];
  similarity_scores?: Record<string, number>;
  rag_rank?: number;
  legal_concepts?: string[];
  entities?: {
    persons: string[];
    organizations: string[];
    locations: string[];
    dates: string[];
    amounts: string[];
  };
}

export interface ProcessingStatistics {
  total_documents: number;
  by_legal_area: Record<string, number>;
  by_document_type: Record<string, number>;
  by_jurisdiction: Record<string, number>;
  average_word_count: number;
  total_chunks: number;
  processing_time_ms: number;
}

export class DocumentProcessor {
  private outputDir: string;
  private batchSize = 100;

  constructor(outputDir = './data/processed') {
    this.outputDir = outputDir;
  }

  /**
   * Initialize processor with directory structure
   */
  async initialize(): Promise<void> {
    const dirs = [
      this.outputDir,
      path.join(this.outputDir, 'json'),
      path.join(this.outputDir, 'jsonl'),
      path.join(this.outputDir, 'metadata'),
      path.join(this.outputDir, 'chunks'),
      path.join(this.outputDir, 'qlora'),
      path.join(this.outputDir, 'statistics'),
      path.join(this.outputDir, 'batches'),
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    console.log('📁 Document processor initialized with directory structure');
  }

  /**
   * Process documents with enhanced metadata extraction
   */
  async processDocuments(
    documents: ProcessedLegalDocument[],
    options: {
      extractEntities?: boolean;
      calculateComplexity?: boolean;
      generateTags?: boolean;
      batchProcess?: boolean;
    } = {}
  ): Promise<{
    processed: ProcessedLegalDocument[];
    metadata: DocumentMetadata[];
    statistics: ProcessingStatistics;
  }> {
    console.log(`🔄 Processing ${documents.length} documents...`);
    const startTime = Date.now();

    const processedDocs: ProcessedLegalDocument[] = [];
    const metadataList: DocumentMetadata[] = [];

    // Process in batches if requested
    const batches = options.batchProcess ? this.chunkArray(documents, this.batchSize) : [documents];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batch.length} documents)`);

      for (const doc of batch) {
        try {
          const enhanced = await this.enhanceDocument(doc, options);
          processedDocs.push(<any>(<any>enhanced));

          const metadata = this.extractDocumentMetadata(enhanced);
          metadataList.push(<any>(<any>metadata));
        } catch (error) {
          console.error(`❌ Error processing document ${doc.id}:`, error);
        }
      }

      // Save batch if batch processing is enabled
      if (options.batchProcess && batches.length > 1) {
        await this.saveBatch(batch, i);
      }
    }

    const processingTime = Date.now() - startTime;
    const statistics = this.calculateStatistics(processedDocs, processingTime);

    console.log(`✅ Processing complete: ${processedDocs.length} documents in ${processingTime}ms`);

    return {
      processed: processedDocs,
      metadata: metadataList,
      statistics,
    };
  }

  /**
   * Enhance document with additional processing
   */
  private async enhanceDocument(
    doc: ProcessedLegalDocument,
    options: {
      extractEntities?: boolean;
      calculateComplexity?: boolean;
      generateTags?: boolean;
    }
  ): Promise<ProcessedLegalDocument> {
    const enhanced = { ...doc };

    // Enhance chunks
    enhanced.chunks = await Promise.all(
      doc.chunks.map((chunk) => this.enhanceChunk(chunk, options))
    );

    // Calculate complexity score
    if (options.calculateComplexity) {
      enhanced.metadata.confidence_score = this.calculateComplexityScore(doc.content);
    }

    // Generate tags
    if (options.generateTags) {
      const tags = this.generateTags(doc);
      enhanced.metadata = { ...enhanced.metadata, tags };
    }

    return enhanced;
  }

  /**
   * Enhance document chunk with additional metadata
   */
  private async enhanceChunk(
    chunk: DocumentChunk,
    options: {
      extractEntities?: boolean;
      calculateComplexity?: boolean;
    }
  ): Promise<EnhancedDocumentChunk> {
    const enhanced: EnhancedDocumentChunk = { ...chunk };

    // Extract entities
    if (options.extractEntities) {
      enhanced.entities = this.extractEntities(chunk.content);
    }

    // Extract legal concepts
    enhanced.legal_concepts = this.extractLegalConcepts(chunk.content);

    return enhanced;
  }

  /**
   * Extract entities from text
   */
  private extractEntities(text: string): {
    persons: string[];
    organizations: string[];
    locations: string[];
    dates: string[];
    amounts: string[];
  } {
    // Simple regex-based entity extraction (could be enhanced with NER models)
    const persons = [...text.matchAll(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g)].map((m) => m[0]);
    const organizations = [
      ...text.matchAll(/\b[A-Z][a-z]+ (?:Inc\.|Corp\.|LLC|Company|Corporation)\b/g),
    ].map((m) => m[0]);
    const locations = [...text.matchAll(/\b[A-Z][a-z]+ (?:County|State|City|District)\b/g)].map(
      (m) => m[0]
    );
    const dates = [...text.matchAll(/\b\d{12}\/\d{12}\/\d{4}|\b\d{4}-\d{2}-\d{2}\b/g)].map(
      (m) => m[0]
    );
    const amounts = [...text.matchAll(/\$[\d,]+(?:\.\d{2})?/g)].map((m) => m[0]);

    return {
      persons: [...new Set(persons)],
      organizations: [...new Set(organizations)],
      locations: [...new Set(locations)],
      dates: [...new Set(dates)],
      amounts: [...new Set(amounts)],
    };
  }

  /**
   * Extract legal concepts from text
   */
  private extractLegalConcepts(text: string): string[] {
    const legalTerms = [
      'contract',
      'breach',
      'negligence',
      'liability',
      'damages',
      'consideration',
      'due process',
      'probable cause',
      'reasonable doubt',
      'burden of proof',
      'statute of limitations',
      'res judicata',
      'stare decisis',
      'habeas corpus',
      'tort',
      'plaintiff',
      'defendant',
      'jurisdiction',
      'venue',
      'discovery',
      'deposition',
      'subpoena',
      'injunction',
      'summary judgment',
      'appeal',
    ];

    const foundConcepts = legalTerms.filter((term) => new RegExp(`\\b${term}\\b`, 'i').test(text));

    return foundConcepts;
  }

  /**
   * Calculate document complexity score
   */
  private calculateComplexityScore(content: string): number {
    const sentences = content.split(/[.!?]+/).filter((s) => s.trim());
    const words = content.split(/\s+/);

    // Factors contributing to complexity
    const avgWordsPerSentence = words.length / sentences.length;
    const legalTermCount = this.extractLegalConcepts(content).length;
    const citationCount = (content.match(/\d+\s+U\.S\.|\d+\s+F\.\d+d|\d+\s+S\.Ct\./g) || []).length;
    const complexPunctuation = (content.match(/[;:()]/g) || []).length;

    // Weighted scoring
    const complexityScore = Math.min(
      (avgWordsPerSentence / 20) * 0.3 +
        (legalTermCount / 10) * 0.4 +
        (citationCount / 5) * 0.2 +
        (complexPunctuation / words.length) * 100 * 0.1,
      1.0
    );

    return Math.round(complexityScore * 100) / 100;
  }

  /**
   * Generate tags for document
   */
  private generateTags(doc: ProcessedLegalDocument): string[] {
    const tags: string[] = [];
    const content = (doc.content + ' ' + doc.title).toLowerCase();

    // Add metadata-based tags
    tags.push(<any>(<any>doc.metadata.legal_area));
    tags.push(<any>(<any>doc.metadata.document_type));
    tags.push(<any>(<any>doc.metadata.jurisdiction));

    // Add content-based tags
    const topicTags = {
      regulatory: ['regulation', 'rule', 'compliance', 'administrative'],
      litigation: ['court', 'case', 'lawsuit', 'trial', 'judge'],
      commercial: ['business', 'commercial', 'trade', 'company'],
      constitutional: ['constitutional', 'amendment', 'rights', 'freedom'],
      international: ['international', 'treaty', 'foreign', 'global'],
    };

    for (const [tag, keywords] of Object.entries(topicTags)) {
      if (keywords.some((keyword) => content.includes(keyword))) {
        tags.push(<any>(<any>tag));
      }
    }

    // Add complexity-based tags
    const complexity = doc.metadata.confidence_score || 0;
    if (complexity > 0.8) tags.push(<any>(<any>'complex'));
    else if (complexity > 0.5) tags.push(<any>(<any>'intermediate'));
    else tags.push(<any>(<any>'basic'));

    // Add length-based tags
    if (doc.metadata.word_count > 5000) tags.push(<any>(<any>'long-form'));
    else if (doc.metadata.word_count > 1000) tags.push(<any>(<any>'medium-length'));
    else tags.push(<any>(<any>'short-form'));

    return [...new Set(tags)];
  }

  /**
   * Extract document metadata
   */
  private extractDocumentMetadata(doc: ProcessedLegalDocument): DocumentMetadata {
    return {
      id: doc.id,
      title: doc.title,
      source: doc.metadata.source,
      legal_area: doc.metadata.legal_area,
      document_type: doc.metadata.document_type,
      jurisdiction: doc.metadata.jurisdiction,
      date_extracted: doc.metadata.date_extracted,
      word_count: doc.metadata.word_count,
      chunk_count: doc.chunks.length,
      confidence_score: doc.metadata.confidence_score,
      processing_status: 'processed',
      tags: (doc.metadata as any).tags || [],
      complexity_score: this.calculateComplexityScore(doc.content),
    };
  }

  /**
   * Calculate processing statistics
   */
  private calculateStatistics(
    docs: ProcessedLegalDocument[],
    processingTime: number
  ): ProcessingStatistics {
    const stats: ProcessingStatistics = {
      total_documents: docs.length,
      by_legal_area: {},
      by_document_type: {},
      by_jurisdiction: {},
      average_word_count: 0,
      total_chunks: 0,
      processing_time_ms: processingTime,
    };

    let totalWords = 0;
    let totalChunks = 0;

    for (const doc of docs) {
      // Count by legal area
      stats.by_legal_area[doc.metadata.legal_area] =
        (stats.by_legal_area[doc.metadata.legal_area] || 0) + 1;

      // Count by document type
      stats.by_document_type[doc.metadata.document_type] =
        (stats.by_document_type[doc.metadata.document_type] || 0) + 1;

      // Count by jurisdiction
      stats.by_jurisdiction[doc.metadata.jurisdiction] =
        (stats.by_jurisdiction[doc.metadata.jurisdiction] || 0) + 1;

      totalWords += doc.metadata.word_count;
      totalChunks += doc.chunks.length;
    }

    stats.average_word_count = Math.round(totalWords / docs.length);
    stats.total_chunks = totalChunks;

    return stats;
  }

  /**
   * Convert to JSON format
   */
  async convertToJSON(documents: ProcessedLegalDocument[], filename?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFilename = filename || `legal-docs-${timestamp}.json`;
    const jsonPath = path.join(this.outputDir, 'json', jsonFilename);

    const output = {
      metadata: {
        generated_at: new Date().toISOString(),
        document_count: documents.length,
        version: '1.0.0',
      },
      documents,
    };

    await fs.writeFile(jsonPath, JSON.stringify(output, null, 2));
    console.log(`💾 JSON saved: ${jsonPath} (${documents.length} documents)`);
    return jsonPath;
  }

  /**
   * Convert to JSONL format
   */
  async convertToJSONL(documents: ProcessedLegalDocument[], filename?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonlFilename = filename || `legal-docs-${timestamp}.jsonl`;
    const jsonlPath = path.join(this.outputDir, 'jsonl', jsonlFilename);

    const jsonlContent = documents.map((doc) => JSON.stringify(doc)).join('\n');
    await fs.writeFile(jsonlPath, jsonlContent);

    console.log(`💾 JSONL saved: ${jsonlPath} (${documents.length} documents)`);
    return jsonlPath;
  }

  /**
   * Export metadata separately
   */
  async exportMetadata(metadata: DocumentMetadata[], filename?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const metadataFilename = filename || `metadata-${timestamp}.json`;
    const metadataPath = path.join(this.outputDir, 'metadata', metadataFilename);

    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`📋 Metadata saved: ${metadataPath} (${metadata.length} entries)`);
    return metadataPath;
  }

  /**
   * Export enhanced chunks separately
   */
  async exportChunks(documents: ProcessedLegalDocument[], filename?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const chunksFilename = filename || `chunks-${timestamp}.jsonl`;
    const chunksPath = path.join(this.outputDir, 'chunks', chunksFilename);

    const allChunks = documents.flatMap((doc) =>
      doc.chunks.map((chunk) => ({
        document_id: doc.id,
        document_title: doc.title,
        legal_area: doc.metadata.legal_area,
        ...chunk,
      }))
    );

    const chunksContent = allChunks.map((chunk) => JSON.stringify(chunk)).join('\n');
    await fs.writeFile(chunksPath, chunksContent);

    console.log(`🧩 Chunks saved: ${chunksPath} (${allChunks.length} chunks)`);
    return chunksPath;
  }

  /**
   * Save processing statistics
   */
  async saveStatistics(statistics: ProcessingStatistics, filename?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const statsFilename = filename || `stats-${timestamp}.json`;
    const statsPath = path.join(this.outputDir, 'statistics', statsFilename);

    await fs.writeFile(statsPath, JSON.stringify(statistics, null, 2));
    console.log(`📊 Statistics saved: ${statsPath}`);
    return statsPath;
  }

  /**
   * Save batch during processing
   */
  private async saveBatch(documents: ProcessedLegalDocument[], batchIndex: number): Promise<void> {
    const batchPath = path.join(this.outputDir, 'batches', `batch-${batchIndex}.jsonl`);
    const batchContent = documents.map((doc) => JSON.stringify(doc)).join('\n');
    await fs.writeFile(batchPath, batchContent);
    console.log(`💾 Batch ${batchIndex} saved: ${batchPath}`);
  }

  /**
   * Utility methods
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(<any>(<any>array.slice(i, i + size)));
    }
    return chunks;
  }

  /**
   * Load documents from JSON file
   */
  async loadFromJSON(filePath: string): Promise<ProcessedLegalDocument[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      return data.documents || data; // Handle both wrapped and raw formats
    } catch (error) {
      console.error(`❌ Error loading JSON from ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Load documents from JSONL file
   */
  async loadFromJSONL(filePath: string): Promise<ProcessedLegalDocument[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line));
    } catch (error) {
      console.error(`❌ Error loading JSONL from ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.initialize();
      return true;
    } catch (error) {
      console.error('Document processor health check failed:', error);
      return false;
    }
  }
}

// Export singleton
export const documentProcessor = new DocumentProcessor();
export default documentProcessor;
