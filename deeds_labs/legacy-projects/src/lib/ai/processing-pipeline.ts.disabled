import { LangChainService } from './langchain.js';
import { multiLayerCache } from '../cache/multi-layer-cache.js';
import { rabbitmqService } from '../messaging/rabbitmq-service.js';
import { dbManager } from '../database/postgres.js';
import { db } from '../database/postgres.js';
import * as schema from '../database/schema/legal-documents.js';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import type { AIProcessingJob } from '../messaging/rabbitmq-service.js';

/**
 * Comprehensive AI Processing Pipeline
 * Handles document ingestion, analysis, embedding generation, and vector search
 */

export interface ProcessingResult {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: any;
  error?: string;
  metadata: {
    processingTime: number;
    tokensUsed: number;
    confidence: number;
    stage: string;
  };
}

export interface DocumentUpload {
  file: File | Buffer;
  filename: string;
  mimeType: string;
  metadata?: Record<string, any>;
}

export interface AnalysisOptions {
  includeEmbeddings: boolean;
  includeSummary: boolean;
  includeEntities: boolean;
  includeRiskAnalysis: boolean;
  cacheResults: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export class AIProcessingPipeline {
  private langchain: LangChainService;
  private processingQueue: Map<string, ProcessingResult> = new Map();

  constructor() {
    this.langchain = new LangChainService();
    this.initializeWorkers();
  }

  /**
   * Process uploaded document through complete AI pipeline
   */
  async processDocument(
    upload: DocumentUpload,
    options: AnalysisOptions = {
      includeEmbeddings: true,
      includeSummary: true,
      includeEntities: true,
      includeRiskAnalysis: true,
      cacheResults: true,
      priority: 'medium'
    }
  ): Promise<ProcessingResult> {
    const jobId = this.generateJobId();
    const startTime = Date.now();

    // Initialize processing result
    const result: ProcessingResult = {
      id: jobId,
      status: 'pending',
      metadata: {
        processingTime: 0,
        tokensUsed: 0,
        confidence: 0,
        stage: 'initialization'
      }
    };

    this.processingQueue.set(jobId, result);

    try {
      // Stage 1: Text Extraction
      result.status = 'processing';
      result.metadata.stage = 'text_extraction';
      this.processingQueue.set(jobId, result);

      const extractedText = await this.extractText(upload);
      
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No text content could be extracted from the document');
      }

      // Stage 2: Document Analysis
      result.metadata.stage = 'document_analysis';
      this.processingQueue.set(jobId, result);

      const analysis = await this.analyzeDocument(extractedText, options);
      
      // Stage 3: Embedding Generation
      if (options.includeEmbeddings) {
        result.metadata.stage = 'embedding_generation';
        this.processingQueue.set(jobId, result);

        const embeddings = await this.generateEmbeddings(extractedText, upload.filename);
        analysis.embeddings = embeddings;
      }

      // Stage 4: Database Storage
      result.metadata.stage = 'database_storage';
      this.processingQueue.set(jobId, result);

      const storedDocument = await this.storeDocument(extractedText, analysis, upload);
      
      // Stage 5: Cache Storage
      if (options.cacheResults) {
        result.metadata.stage = 'cache_storage';
        this.processingQueue.set(jobId, result);

        await this.cacheResults(jobId, storedDocument, analysis);
      }

      // Complete processing
      result.status = 'completed';
      result.result = {
        documentId: storedDocument.id,
        analysis,
        document: storedDocument
      };
      result.metadata.processingTime = Date.now() - startTime;
      result.metadata.stage = 'completed';
      
      this.processingQueue.set(jobId, result);

      // Broadcast completion event
      await rabbitmqService.broadcastUpdate('document_processed', {
        jobId,
        documentId: storedDocument.id,
        processingTime: result.metadata.processingTime
      });

      return result;

    } catch (error) {
      result.status = 'error';
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.metadata.processingTime = Date.now() - startTime;
      this.processingQueue.set(jobId, result);

      console.error(`Document processing failed for job ${jobId}:`, error);
      return result;
    }
  }

  /**
   * Extract text from various document formats
   */
  private async extractText(upload: DocumentUpload): Promise<string> {
    const buffer = upload.file instanceof Buffer ? upload.file : Buffer.from(await upload.file.arrayBuffer());

    switch (upload.mimeType) {
      case 'application/pdf':
        const pdfData = await pdfParse(buffer);
        return pdfData.text;

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        const docxResult = await mammoth.extractRawText({ buffer });
        return docxResult.value;

      case 'text/plain':
        return buffer.toString('utf-8');

      case 'application/json':
        const jsonData = JSON.parse(buffer.toString('utf-8'));
        return typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData, null, 2);

      default:
        // Try to parse as text
        const text = buffer.toString('utf-8');
        if (text.length > 0 && this.isReadableText(text)) {
          return text;
        }
        throw new Error(`Unsupported file type: ${upload.mimeType}`);
    }
  }

  /**
   * Perform comprehensive document analysis using Go GPU Server
   */
  private async analyzeDocument(content: string, options: AnalysisOptions): Promise<any> {
    const analysis: any = {
      wordCount: content.split(/\s+/).length,
      characterCount: content.length,
      language: 'en',
      extractedAt: new Date()
    };

    try {
      // Call Go GPU Server for comprehensive analysis
      const goServerUrl = process.env.GO_SERVER_URL || 'http://localhost:8081';
      const response = await fetch(`${goServerUrl}/process-document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_id: this.generateJobId(),
          content: content,
          document_type: 'legal_document',
          options: {
            extract_entities: options.includeEntities,
            generate_summary: options.includeSummary,
            assess_risk: options.includeRiskAnalysis,
            generate_embedding: options.includeEmbeddings,
            store_in_database: false, // We'll handle storage in SvelteKit
            use_gemma3_legal: true
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Go server error: ${response.status}`);
      }

      const goResult = await response.json();
      
      if (goResult.success) {
        // Merge Go server results with basic analysis
        analysis.summary = goResult.summary || '';
        analysis.entities = goResult.entities || [];
        analysis.riskAssessment = goResult.risk_assessment || {};
        analysis.embedding = goResult.embedding || [];
        analysis.processingTime = goResult.processing_time;
        
        // Extract additional data from entities
        analysis.keyTerms = this.extractKeyTermsFromEntities(goResult.entities || []);
        analysis.dates = this.extractDates(content);
        analysis.amounts = this.extractMonetaryAmounts(content);
        
        // Map risk assessment to our format
        if (goResult.risk_assessment) {
          analysis.risks = [{
            type: 'legal',
            severity: goResult.risk_assessment.overall_risk || 'medium',
            description: `Risk score: ${goResult.risk_assessment.risk_score}/100`,
            factors: goResult.risk_assessment.risk_factors || [],
            recommendations: goResult.risk_assessment.recommendations || []
          }];
        }
      } else {
        // Fallback to local processing if Go server fails
        console.warn('Go server processing failed, falling back to local:', goResult.error);
        await this.performLocalAnalysis(content, options, analysis);
      }
    } catch (error) {
      // Fallback to local processing
      console.warn('Go server not available, falling back to local processing:', error);
      await this.performLocalAnalysis(content, options, analysis);
    }

    // Always perform local classification and confidence scoring
    analysis.documentType = await this.classifyDocumentType(content);
    analysis.practiceArea = await this.identifyPracticeArea(content);
    analysis.confidenceScore = this.calculateConfidenceScore(analysis);

    return analysis;
  }

  /**
   * Generate embeddings for document content and title
   */
  private async generateEmbeddings(content: string, title: string): Promise<{
    contentEmbedding: number[];
    titleEmbedding: number[];
  }> {
    const [contentEmbedding, titleEmbedding] = await Promise.all([
      this.langchain.embeddings.embedQuery(content.substring(0, 8000)), // Limit content for embedding
      this.langchain.embeddings.embedQuery(title)
    ]);

    return {
      contentEmbedding,
      titleEmbedding
    };
  }

  /**
   * Store processed document in database
   */
  private async storeDocument(
    content: string,
    analysis: any,
    upload: DocumentUpload
  ): Promise<schema.LegalDocument> {
    const documentData: schema.NewLegalDocument = {
      title: upload.filename,
      content,
      documentType: analysis.documentType || 'evidence',
      jurisdiction: 'federal', // Could be enhanced with jurisdiction detection
      practiceArea: analysis.practiceArea,
      fileName: upload.filename,
      fileSize: upload.file instanceof Buffer ? upload.file.length : upload.file.size,
      mimeType: upload.mimeType,
      contentEmbedding: analysis.embeddings?.contentEmbedding,
      titleEmbedding: analysis.embeddings?.titleEmbedding,
      analysisResults: {
        entities: analysis.entities || [],
        keyTerms: analysis.keyTerms || [],
        sentimentScore: analysis.sentimentScore || 0,
        complexityScore: analysis.complexityScore || 0,
        confidenceLevel: analysis.confidenceScore || 0,
        extractedDates: analysis.dates || [],
        extractedAmounts: analysis.amounts || [],
        parties: analysis.parties || [],
        obligations: analysis.obligations || [],
        risks: analysis.risks || []
      },
      processingStatus: 'completed'
    };

    const [document] = await db.insert(schema.legalDocuments)
      .values(documentData)
      .returning();

    return document;
  }

  /**
   * Cache analysis results for fast retrieval
   */
  private async cacheResults(jobId: string, document: schema.LegalDocument, analysis: any): Promise<void> {
    const cacheKeys = [
      `doc:${document.id}`,
      `analysis:${document.id}`,
      `embedding:${document.id}`
    ];

    await Promise.all([
      multiLayerCache.set(cacheKeys[0], document, {
        type: 'document',
        ttl: 3600,
        tags: ['document', document.documentType, document.practiceArea].filter(Boolean)
      }),
      multiLayerCache.set(cacheKeys[1], analysis, {
        type: 'analysis',
        ttl: 1800,
        tags: ['analysis', 'legal']
      }),
      multiLayerCache.set(cacheKeys[2], {
        contentEmbedding: document.contentEmbedding,
        titleEmbedding: document.titleEmbedding
      }, {
        type: 'embedding',
        ttl: 7200,
        tags: ['embedding', 'vector']
      })
    ]);
  }

  /**
   * Perform semantic search across documents
   */
  async semanticSearch(
    query: string,
    options: {
      limit?: number;
      documentType?: string;
      practiceArea?: string;
      jurisdiction?: string;
      useCache?: boolean;
    } = {}
  ): Promise<Array<schema.LegalDocument & { similarity: number }>> {
    const { limit = 10, useCache = true } = options;
    
    // Check cache first
    if (useCache) {
      const cacheKey = `search:${this.hashQuery(query, options)}`;
      const cached = await multiLayerCache.get(cacheKey);
      if (cached) return cached;
    }

    // Generate query embedding
    const queryEmbedding = await this.langchain.embeddings.embedQuery(query);

    // Perform vector similarity search
    const results = await dbManager.findSimilarDocuments(
      queryEmbedding,
      limit,
      0.6, // similarity threshold
      options.documentType,
      options.jurisdiction
    );

    // Filter by practice area if specified
    const filteredResults = options.practiceArea 
      ? results.filter(doc => doc.practiceArea === options.practiceArea)
      : results;

    // Cache results
    if (useCache) {
      const cacheKey = `search:${this.hashQuery(query, options)}`;
      await multiLayerCache.set(cacheKey, filteredResults, {
        type: 'search',
        ttl: 1800,
        tags: ['search', 'semantic', options.documentType, options.practiceArea].filter(Boolean)
      });
    }

    return filteredResults;
  }

  /**
   * Get processing status
   */
  getProcessingStatus(jobId: string): ProcessingResult | null {
    return this.processingQueue.get(jobId) || null;
  }

  /**
   * Cancel processing job
   */
  cancelProcessing(jobId: string): boolean {
    const result = this.processingQueue.get(jobId);
    if (result && result.status === 'processing') {
      result.status = 'error';
      result.error = 'Cancelled by user';
      this.processingQueue.set(jobId, result);
      return true;
    }
    return false;
  }

  /**
   * Get processing queue statistics
   */
  getQueueStats(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    errors: number;
  } {
    const stats = { total: 0, pending: 0, processing: 0, completed: 0, errors: 0 };
    
    for (const result of this.processingQueue.values()) {
      stats.total++;
      stats[result.status]++;
    }

    return stats;
  }

  // Private helper methods

  /**
   * Fallback local analysis when Go server is unavailable
   */
  private async performLocalAnalysis(content: string, options: AnalysisOptions, analysis: any): Promise<void> {
    try {
      // Generate summary
      if (options.includeSummary) {
        analysis.summary = await this.langchain.summarizeDocument(content);
      }

      // Extract entities and key information
      if (options.includeEntities) {
        analysis.entities = await this.extractEntities(content);
        analysis.keyTerms = await this.extractKeyTerms(content);
        analysis.dates = this.extractDates(content);
        analysis.amounts = this.extractMonetaryAmounts(content);
      }

      // Perform risk analysis
      if (options.includeRiskAnalysis) {
        analysis.risks = await this.analyzeRisks(content);
        analysis.compliance = await this.checkCompliance(content);
      }
    } catch (error) {
      console.error('Local analysis failed:', error);
      // Set minimal analysis data
      analysis.summary = 'Analysis failed';
      analysis.entities = [];
      analysis.risks = [];
    }
  }

  /**
   * Extract key terms from Go server entity results
   */
  private extractKeyTermsFromEntities(entities: Array<{ type: string; value: string; confidence: number }>): string[] {
    return entities
      .filter(entity => entity.confidence > 0.7)
      .map(entity => entity.value)
      .slice(0, 20);
  }

  private async initializeWorkers(): Promise<void> {
    // Initialize RabbitMQ workers for distributed processing
    await rabbitmqService.setupAIWorkers();
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isReadableText(text: string): boolean {
    // Simple heuristic to check if text is readable
    const printableChars = text.replace(/[^\x20-\x7E]/g, '').length;
    return printableChars / text.length > 0.7;
  }

  private async extractEntities(content: string): Promise<Array<{ type: string; value: string; confidence: number }>> {
    // Enhanced entity extraction using LangChain
    const extractionTemplate = `
      Extract the following entities from the text:
      - Person names
      - Organization names
      - Locations
      - Legal terms
      - Dates
      - Monetary amounts
      
      Return as JSON array with format: [{"type": "person", "value": "John Doe", "confidence": 0.95}]
    `;

    try {
      const result = await this.langchain.extractInfo(content, extractionTemplate);
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  }

  private async extractKeyTerms(content: string): Promise<string[]> {
    // Extract key legal terms and concepts
    const words = content.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Simple frequency analysis
    const frequency = new Map<string, number>();
    words.forEach(word => {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    });

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  private extractDates(content: string): string[] {
    const dateRegex = /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b|\b\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? \d{4}\b/gi;
    return content.match(dateRegex) || [];
  }

  private extractMonetaryAmounts(content: string): string[] {
    const moneyRegex = /\$[\d,]+(?:\.\d{2})?|\b\d+(?:,\d{3})*(?:\.\d{2})? dollars?\b/gi;
    return content.match(moneyRegex) || [];
  }

  private async analyzeRisks(content: string): Promise<Array<{ type: string; severity: 'low' | 'medium' | 'high'; description: string }>> {
    // Placeholder for risk analysis - would integrate with specialized legal AI models
    const riskKeywords = {
      high: ['penalty', 'criminal', 'violation', 'breach', 'default', 'terminate'],
      medium: ['liability', 'obligation', 'requirement', 'compliance', 'dispute'],
      low: ['notice', 'amendment', 'modification', 'update', 'review']
    };

    const risks: Array<{ type: string; severity: 'low' | 'medium' | 'high'; description: string }> = [];
    const lowerContent = content.toLowerCase();

    Object.entries(riskKeywords).forEach(([severity, keywords]) => {
      keywords.forEach(keyword => {
        if (lowerContent.includes(keyword)) {
          risks.push({
            type: 'legal',
            severity: severity as 'low' | 'medium' | 'high',
            description: `Document contains ${keyword}-related content`
          });
        }
      });
    });

    return risks;
  }

  private async checkCompliance(content: string): Promise<any> {
    // Placeholder for compliance checking
    return {
      gdprCompliant: true,
      hipaaCompliant: false,
      sox404Compliant: true
    };
  }

  private async classifyDocumentType(content: string): Promise<schema.LegalDocument['documentType']> {
    // Simple keyword-based classification - could be enhanced with ML
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('contract') || lowerContent.includes('agreement')) {
      return 'contract';
    } else if (lowerContent.includes('motion') || lowerContent.includes('petition')) {
      return 'motion';
    } else if (lowerContent.includes('brief')) {
      return 'brief';
    } else if (lowerContent.includes('regulation') || lowerContent.includes('rule')) {
      return 'regulation';
    } else {
      return 'evidence';
    }
  }

  private async identifyPracticeArea(content: string): Promise<schema.LegalDocument['practiceArea']> {
    const lowerContent = content.toLowerCase();
    
    const practiceAreaKeywords = {
      corporate: ['corporation', 'merger', 'acquisition', 'securities', 'board'],
      litigation: ['lawsuit', 'court', 'trial', 'plaintiff', 'defendant'],
      intellectual_property: ['patent', 'trademark', 'copyright', 'trade secret'],
      employment: ['employee', 'workplace', 'discrimination', 'labor'],
      real_estate: ['property', 'lease', 'mortgage', 'deed', 'zoning'],
      criminal: ['criminal', 'prosecution', 'defense', 'guilty', 'sentence'],
      family: ['divorce', 'custody', 'adoption', 'marriage', 'domestic'],
      tax: ['tax', 'irs', 'deduction', 'income', 'audit'],
      immigration: ['visa', 'citizenship', 'immigration', 'deportation'],
      environmental: ['environmental', 'pollution', 'epa', 'clean air', 'hazardous']
    };

    for (const [area, keywords] of Object.entries(practiceAreaKeywords)) {
      if (keywords.some(keyword => lowerContent.includes(keyword))) {
        return area as schema.LegalDocument['practiceArea'];
      }
    }

    return 'corporate'; // default
  }

  private calculateConfidenceScore(analysis: any): number {
    let score = 0.5; // base score

    if (analysis.summary && analysis.summary.length > 50) score += 0.1;
    if (analysis.entities && analysis.entities.length > 0) score += 0.1;
    if (analysis.keyTerms && analysis.keyTerms.length > 5) score += 0.1;
    if (analysis.documentType) score += 0.1;
    if (analysis.practiceArea) score += 0.1;
    if (analysis.risks && analysis.risks.length > 0) score += 0.1;

    return Math.min(score, 1.0);
  }

  private hashQuery(query: string, options: any): string {
    const combined = JSON.stringify({ query, options });
    return Buffer.from(combined).toString('base64').substring(0, 32);
  }
}

// Export singleton instance
export const aiPipeline = new AIProcessingPipeline();