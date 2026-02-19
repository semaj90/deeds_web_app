#!/usr/bin/env node

/**
 * Production Pipeline Worker
 * Crawl → OCR → Embed → Index → Cache → Store
 * 
 * Handles: Web crawling, PDF OCR, text chunking, embedding generation, 
 *         PostgreSQL+pgvector storage, Redis caching
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cluster from 'cluster';
import os from 'os';

// Core dependencies
import puppeteer from 'puppeteer';
import { createWorker } from 'tesseract.js';
import fetch from 'node-fetch';
import amqp from 'amqplib';
import Redis from 'ioredis';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Schema imports
import {
  crawlJobs,
  crawledPages, 
  documents,
  documentChunks,
  searchIndex,
  processingJobs,
  systemMetrics,
  vectorSimilaritySearch,
  hybridSearch
} from '../sveltekit-frontend/src/lib/server/db/schema-production-pipeline.js';
import { eq, and, desc, sql } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ===== CONFIGURATION =====

const CONFIG = {
  // Database
  database: {
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/legal_ai_db',
    max: 10,
    ssl: process.env.NODE_ENV === 'production'
  },
  
  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '4005'),
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    keyPrefix: 'pipeline:'
  },
  
  // RabbitMQ
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
    queues: {
      crawl: 'crawl_queue',
      ocr: 'ocr_queue', 
      embed: 'embed_queue',
      index: 'index_queue',
      deadletter: 'dead_letter_queue'
    }
  },
  
  // MinIO S3-compatible storage
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:4002',
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'legal-documents',
    region: 'us-east-1'
  },
  
  // Ollama Embedding Service
  ollama: {
    baseURL: process.env.OLLAMA_URL || 'http://localhost:11434',
    model: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
    dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '384')
  },
  
  // Worker Configuration
  worker: {
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_JOBS || '3'),
    retryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3'),
    timeoutMs: parseInt(process.env.JOB_TIMEOUT_MS || '300000'), // 5 minutes
    chunkSize: parseInt(process.env.CHUNK_SIZE || '600'),
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '100')
  },
  
  // Crawling Configuration  
  crawler: {
    userAgent: 'Legal-AI-Crawler/1.0 (+https://legal-ai.example.com/crawler)',
    maxPages: parseInt(process.env.MAX_PAGES_PER_JOB || '100'),
    rateLimitMs: parseInt(process.env.CRAWL_RATE_LIMIT_MS || '1000'),
    timeout: parseInt(process.env.CRAWL_TIMEOUT_MS || '30000'),
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '50') * 1024 * 1024 // 50MB
  }
};

// ===== MAIN WORKER CLASS =====

class ProductionPipelineWorker {
  constructor(workerId = 'main') {
    this.workerId = workerId;
    this.isProcessing = false;
    this.currentJob = null;
    this.processedCount = 0;
    
    // Initialize connections
    this.db = null;
    this.redis = null;
    this.rabbitmq = null;
    this.s3 = null;
    this.browser = null;
    this.ocrWorker = null;
    
    this.setupSignalHandlers();
  }
  
  async initialize() {
    try {
      console.log(`🚀 [${this.workerId}] Initializing Production Pipeline Worker...`);
      
      // Initialize database connection
      const sqlClient = postgres(CONFIG.database.connectionString, {
        max: CONFIG.database.max,
        ssl: CONFIG.database.ssl
      });
      this.db = drizzle(sqlClient);
      console.log(`✅ [${this.workerId}] Database connected`);
      
      // Initialize Redis
      this.redis = new Redis(CONFIG.redis);
      await this.redis.ping();
      console.log(`✅ [${this.workerId}] Redis connected`);
      
      // Initialize RabbitMQ
      const connection = await amqp.connect(CONFIG.rabbitmq.url);
      this.rabbitmq = await connection.createChannel();
      await this.setupQueues();
      console.log(`✅ [${this.workerId}] RabbitMQ connected`);
      
      // Initialize MinIO S3 client
      this.s3 = new S3Client({
        endpoint: CONFIG.minio.endpoint,
        region: CONFIG.minio.region,
        credentials: {
          accessKeyId: CONFIG.minio.accessKeyId,
          secretAccessKey: CONFIG.minio.secretAccessKey
        },
        forcePathStyle: true
      });
      console.log(`✅ [${this.workerId}] MinIO S3 client initialized`);
      
      // Initialize Puppeteer browser
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor'
        ]
      });
      console.log(`✅ [${this.workerId}] Puppeteer browser launched`);
      
      // Initialize Tesseract OCR worker
      this.ocrWorker = await createWorker('eng');
      console.log(`✅ [${this.workerId}] Tesseract OCR worker ready`);
      
      console.log(`🎉 [${this.workerId}] Pipeline worker fully initialized`);
      return true;
      
    } catch (error) {
      console.error(`❌ [${this.workerId}] Initialization failed:`, error);
      throw error;
    }
  }
  
  async setupQueues() {
    const queues = Object.values(CONFIG.rabbitmq.queues);
    
    for (const queueName of queues) {
      await this.rabbitmq.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': CONFIG.rabbitmq.queues.deadletter,
          'x-message-ttl': CONFIG.worker.timeoutMs
        }
      });
    }
    
    // Setup dead letter queue
    await this.rabbitmq.assertQueue(CONFIG.rabbitmq.queues.deadletter, { durable: true });
  }
  
  async startProcessing() {
    console.log(`🔄 [${this.workerId}] Starting job processing...`);
    
    // Start consuming from all queues
    const queues = [
      { name: CONFIG.rabbitmq.queues.crawl, handler: this.processCrawlJob.bind(this) },
      { name: CONFIG.rabbitmq.queues.ocr, handler: this.processOCRJob.bind(this) },
      { name: CONFIG.rabbitmq.queues.embed, handler: this.processEmbedJob.bind(this) },
      { name: CONFIG.rabbitmq.queues.index, handler: this.processIndexJob.bind(this) }
    ];
    
    for (const queue of queues) {
      await this.rabbitmq.consume(queue.name, async (msg) => {
        if (msg) {
          try {
            const job = JSON.parse(msg.content.toString());
            console.log(`📝 [${this.workerId}] Processing ${queue.name} job:`, job.id);
            
            await queue.handler(job);
            this.rabbitmq.ack(msg);
            this.processedCount++;
            
            console.log(`✅ [${this.workerId}] Completed job ${job.id}`);
            
          } catch (error) {
            console.error(`❌ [${this.workerId}] Job processing failed:`, error);
            this.rabbitmq.nack(msg, false, false); // Send to dead letter queue
          }
        }
      }, { noAck: false });
    }
    
    console.log(`🎯 [${this.workerId}] Worker is now processing jobs from all queues`);
  }
  
  // ===== CRAWLING PIPELINE =====
  
  async processCrawlJob(job) {
    const startTime = Date.now();
    this.currentJob = job;
    
    try {
      // Update job status
      await this.updateJobStatus(job.id, 'processing', { startedAt: new Date() });
      
      console.log(`🕷️ [${this.workerId}] Starting crawl for URL: ${job.url}`);
      
      // Create browser page
      const page = await this.browser.newPage();
      await page.setUserAgent(CONFIG.crawler.userAgent);
      
      // Set timeout
      page.setDefaultTimeout(CONFIG.crawler.timeout);
      
      // Navigate to URL
      const response = await page.goto(job.url, { 
        waitUntil: 'networkidle2',
        timeout: CONFIG.crawler.timeout 
      });
      
      if (!response.ok() && response.status() >= 400) {
        throw new Error(`HTTP ${response.status()}: ${response.statusText()}`);
      }
      
      // Extract page content
      const pageData = await this.extractPageContent(page, job.url);
      
      // Save to database
      const crawledPageId = await this.saveCrawledPage(job.crawlJobId, pageData);
      
      // Store large content in MinIO if needed
      if (pageData.rawContent && pageData.rawContent.length > 100000) { // >100KB
        const blobPath = await this.storeBlobInMinIO(
          `crawled/${crawledPageId}.html`,
          pageData.rawContent,
          'text/html'
        );
        
        // Update database with blob path
        await this.db.update(crawledPages)
          .set({ blobPath, rawContent: null })
          .where(eq(crawledPages.id, crawledPageId));
      }
      
      // Queue for OCR if needed (PDFs, images)
      if (pageData.requiresOCR) {
        await this.queueOCRJob(crawledPageId);
      }
      
      // Queue for embedding generation
      await this.queueEmbedJob(crawledPageId);
      
      await page.close();
      
      const processingTime = Date.now() - startTime;
      await this.updateJobStatus(job.id, 'completed', { 
        completedAt: new Date(),
        processingTime 
      });
      
      // Record metrics
      await this.recordMetric('crawl_rate', 1, 'pages/min', { url: job.url });
      
      console.log(`✅ [${this.workerId}] Crawled ${job.url} in ${processingTime}ms`);
      
    } catch (error) {
      console.error(`❌ [${this.workerId}] Crawl job failed:`, error);
      await this.updateJobStatus(job.id, 'failed', { error: error.message });
      throw error;
    }
  }
  
  async extractPageContent(page, url) {
    // Extract basic page information
    const title = await page.title();
    const content = await page.content();
    
    // Extract text content
    const textContent = await page.evaluate(() => {
      return document.body?.innerText || '';
    });
    
    // Extract links
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]')).map(a => ({
        url: a.href,
        text: a.textContent?.trim()
      }));
    });
    
    // Extract images
    const images = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img[src]')).map(img => ({
        src: img.src,
        alt: img.alt
      }));
    });
    
    // Detect if OCR is needed
    const requiresOCR = content.includes('application/pdf') || 
                      images.some(img => img.src.match(/\.(jpg|jpeg|png|gif|bmp|tiff)$/i));
    
    return {
      title,
      rawContent: content,
      textContent,
      contentType: 'text/html',
      contentLength: content.length,
      contentHash: this.generateHash(content),
      links,
      images,
      requiresOCR,
      metadata: {
        extractedAt: new Date().toISOString(),
        userAgent: CONFIG.crawler.userAgent
      }
    };
  }
  
  // ===== OCR PIPELINE =====
  
  async processOCRJob(job) {
    const startTime = Date.now();
    
    try {
      console.log(`🖼️ [${this.workerId}] Starting OCR for page: ${job.pageId}`);
      
      // Get page data
      const [page] = await this.db.select()
        .from(crawledPages)
        .where(eq(crawledPages.id, job.pageId));
        
      if (!page) {
        throw new Error(`Crawled page ${job.pageId} not found`);
      }
      
      let contentToOCR = page.rawContent;
      
      // If content is in MinIO, fetch it
      if (page.blobPath) {
        contentToOCR = await this.getBlobFromMinIO(page.blobPath);
      }
      
      // Perform OCR based on content type
      let ocrResult;
      if (page.contentType === 'application/pdf') {
        ocrResult = await this.ocrPDF(contentToOCR);
      } else {
        ocrResult = await this.ocrImage(contentToOCR);
      }
      
      // Update page with OCR results
      await this.db.update(crawledPages)
        .set({
          rawContent: ocrResult.text,
          processingStatus: 'completed',
          metadata: sql`metadata || ${JSON.stringify({ 
            ocr: {
              confidence: ocrResult.confidence,
              processingTime: Date.now() - startTime,
              wordCount: ocrResult.text.split(' ').length
            }
          })}`
        })
        .where(eq(crawledPages.id, job.pageId));
      
      // Queue for embedding
      await this.queueEmbedJob(job.pageId);
      
      console.log(`✅ [${this.workerId}] OCR completed for page ${job.pageId}`);
      
    } catch (error) {
      console.error(`❌ [${this.workerId}] OCR job failed:`, error);
      throw error;
    }
  }
  
  async ocrPDF(pdfBuffer) {
    // For PDF OCR, we'd need to convert PDF to images first
    // This is a simplified implementation
    const { data: { text, confidence } } = await this.ocrWorker.recognize(pdfBuffer);
    
    return {
      text: text.trim(),
      confidence: confidence || 0,
      pageCount: 1 // Would be calculated from actual PDF
    };
  }
  
  async ocrImage(imageBuffer) {
    const { data: { text, confidence } } = await this.ocrWorker.recognize(imageBuffer);
    
    return {
      text: text.trim(),
      confidence: confidence || 0,
      pageCount: 1
    };
  }
  
  // ===== EMBEDDING PIPELINE =====
  
  async processEmbedJob(job) {
    const startTime = Date.now();
    
    try {
      console.log(`🧠 [${this.workerId}] Starting embedding for page: ${job.pageId}`);
      
      // Get page data
      const [page] = await this.db.select()
        .from(crawledPages)
        .where(eq(crawledPages.id, job.pageId));
        
      if (!page) {
        throw new Error(`Crawled page ${job.pageId} not found`);
      }
      
      let content = page.rawContent;
      if (page.blobPath) {
        content = await this.getBlobFromMinIO(page.blobPath);
      }
      
      // Create document record
      const documentId = crypto.randomUUID();
      const document = await this.createDocument(page, content, documentId);
      
      // Chunk the content strategically
      const chunks = this.chunkContent(content, CONFIG.worker.chunkSize, CONFIG.worker.chunkOverlap);
      
      // Generate embeddings for each chunk
      const embeddingResults = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = await this.generateEmbedding(chunk.content);
        
        const chunkId = crypto.randomUUID();
        
        // Store chunk with embedding
        await this.db.insert(documentChunks).values({
          id: chunkId,
          documentId,
          chunkIndex: i,
          chunkType: chunk.type,
          content: chunk.content,
          contentLength: chunk.content.length,
          startPosition: chunk.startPosition,
          endPosition: chunk.endPosition,
          embedding: `[${embedding.join(',')}]`, // Store as vector
          embeddingModel: CONFIG.ollama.model,
          importance: chunk.importance || 0.5,
          searchKeywords: this.extractKeywords(chunk.content),
          legalConcepts: this.extractLegalConcepts(chunk.content)
        });
        
        embeddingResults.push({
          chunkId,
          embedding: embedding,
          content: chunk.content.substring(0, 100) + '...'
        });
      }
      
      // Update document status
      await this.db.update(documents)
        .set({ 
          embeddingStatus: 'completed',
          wordCount: content.split(' ').length
        })
        .where(eq(documents.id, documentId));
      
      // Queue for indexing
      await this.queueIndexJob(documentId);
      
      // Cache embeddings in Redis
      await this.cacheEmbeddings(documentId, embeddingResults);
      
      console.log(`✅ [${this.workerId}] Generated ${embeddingResults.length} embeddings for page ${job.pageId}`);
      
    } catch (error) {
      console.error(`❌ [${this.workerId}] Embedding job failed:`, error);
      throw error;
    }
  }
  
  async generateEmbedding(text) {
    try {
      const response = await fetch(`${CONFIG.ollama.baseURL}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: CONFIG.ollama.model,
          prompt: text
        })
      });
      
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }
      
      const result = await response.json();
      return result.embedding;
      
    } catch (error) {
      console.error(`❌ [${this.workerId}] Embedding generation failed:`, error);
      // Return a zero vector as fallback
      return new Array(CONFIG.ollama.dimensions).fill(0);
    }
  }
  
  // ===== INDEXING PIPELINE =====
  
  async processIndexJob(job) {
    const startTime = Date.now();
    
    try {
      console.log(`📇 [${this.workerId}] Starting indexing for document: ${job.documentId}`);
      
      // Get document and chunks
      const [document] = await this.db.select()
        .from(documents)
        .where(eq(documents.id, job.documentId));
        
      if (!document) {
        throw new Error(`Document ${job.documentId} not found`);
      }
      
      const chunks = await this.db.select()
        .from(documentChunks)
        .where(eq(documentChunks.documentId, job.documentId))
        .orderBy(documentChunks.chunkIndex);
      
      // Create full-text search vectors
      const searchContent = chunks.map(chunk => chunk.content).join(' ');
      
      // Extract keywords and concepts
      const keywords = this.extractKeywords(searchContent);
      const concepts = this.extractLegalConcepts(searchContent);
      const entities = this.extractLegalEntities(searchContent);
      
      // Create search index record
      await this.db.insert(searchIndex).values({
        documentId: job.documentId,
        indexType: 'hybrid',
        searchVector: sql`to_tsvector('english', ${searchContent})`,
        searchContent,
        keywords,
        concepts,
        entities,
        boost: this.calculateDocumentBoost(document),
        freshness: this.calculateFreshness(document.createdAt),
        authority: this.calculateAuthority(document),
        legalWeight: this.calculateLegalWeight(document)
      });
      
      // Update document status
      await this.db.update(documents)
        .set({ 
          indexStatus: 'completed',
          summary: this.generateSummary(searchContent)
        })
        .where(eq(documents.id, job.documentId));
      
      // Warm up cache for this document
      await this.warmDocumentCache(job.documentId);
      
      console.log(`✅ [${this.workerId}] Indexed document ${job.documentId} with ${chunks.length} chunks`);
      
    } catch (error) {
      console.error(`❌ [${this.workerId}] Indexing job failed:`, error);
      throw error;
    }
  }
  
  // ===== UTILITY METHODS =====
  
  chunkContent(content, chunkSize, overlap) {
    const chunks = [];
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    let currentSize = 0;
    let startPosition = 0;
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim() + '.';
      
      if (currentSize + sentence.length > chunkSize && currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          type: 'paragraph',
          startPosition,
          endPosition: startPosition + currentChunk.length,
          importance: this.calculateChunkImportance(currentChunk)
        });
        
        // Handle overlap
        const overlapText = currentChunk.slice(-overlap);
        startPosition += currentChunk.length - overlap;
        currentChunk = overlapText + ' ' + sentence;
        currentSize = overlapText.length + sentence.length;
      } else {
        if (currentChunk.length === 0) {
          startPosition = content.indexOf(sentence);
        }
        currentChunk += ' ' + sentence;
        currentSize += sentence.length;
      }
    }
    
    if (currentChunk.trim().length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        type: 'paragraph',
        startPosition,
        endPosition: startPosition + currentChunk.length,
        importance: this.calculateChunkImportance(currentChunk)
      });
    }
    
    return chunks;
  }
  
  calculateChunkImportance(content) {
    let importance = 0.5;
    
    // Legal keywords boost importance
    const legalKeywords = ['court', 'judge', 'law', 'statute', 'regulation', 'contract', 'agreement'];
    const keywordMatches = legalKeywords.filter(keyword => 
      content.toLowerCase().includes(keyword)
    ).length;
    importance += keywordMatches * 0.1;
    
    // Length penalty for very short chunks
    if (content.length < 100) importance -= 0.2;
    
    // Cap at 1.0
    return Math.min(1.0, importance);
  }
  
  extractKeywords(text) {
    // Simple keyword extraction (in production, use more sophisticated NLP)
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3);
      
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([word]) => word);
  }
  
  extractLegalConcepts(text) {
    const legalConcepts = [
      'contract law', 'tort law', 'criminal law', 'constitutional law',
      'intellectual property', 'corporate law', 'employment law',
      'real estate law', 'family law', 'immigration law'
    ];
    
    return legalConcepts.filter(concept => 
      text.toLowerCase().includes(concept)
    );
  }
  
  extractLegalEntities(text) {
    // Simple entity extraction (in production, use NER models)
    const entities = {
      courts: [],
      cases: [],
      statutes: []
    };
    
    // Court pattern matching
    const courtPattern = /\b[\w\s]+ Court\b/gi;
    entities.courts = [...new Set(text.match(courtPattern) || [])];
    
    // Case citation pattern
    const casePattern = /\b[\w\s]+ v\.? [\w\s]+/gi;
    entities.cases = [...new Set(text.match(casePattern) || [])];
    
    return entities;
  }
  
  calculateDocumentBoost(document) {
    let boost = 1.0;
    
    // Official sources get higher boost
    if (document.sourceUrl?.includes('gov')) boost += 0.5;
    if (document.sourceUrl?.includes('edu')) boost += 0.3;
    
    // Document type boost
    if (document.documentType === 'statute') boost += 0.4;
    if (document.documentType === 'case_law') boost += 0.3;
    
    return boost;
  }
  
  calculateFreshness(createdAt) {
    const daysSinceCreated = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0.1, 1.0 - (daysSinceCreated / 365)); // Decay over 1 year
  }
  
  calculateAuthority(document) {
    let authority = 0.5;
    
    if (document.jurisdiction?.includes('Supreme')) authority = 1.0;
    else if (document.jurisdiction?.includes('Appellate')) authority = 0.8;
    else if (document.jurisdiction?.includes('Federal')) authority = 0.7;
    
    return authority;
  }
  
  calculateLegalWeight(document) {
    const practiceAreaWeights = {
      'constitutional': 1.0,
      'corporate': 0.8,
      'litigation': 0.9,
      'intellectual_property': 0.7
    };
    
    return practiceAreaWeights[document.practiceArea] || 0.5;
  }
  
  generateSummary(content) {
    // Simple extractive summary (first sentence of each paragraph)
    const paragraphs = content.split('\n\n');
    return paragraphs
      .map(p => p.trim().split('.')[0] + '.')
      .filter(s => s.length > 20)
      .slice(0, 3)
      .join(' ');
  }
  
  // ===== DATABASE OPERATIONS =====
  
  async createDocument(page, content, documentId) {
    const document = {
      id: documentId,
      crawledPageId: page.id,
      title: page.title || 'Untitled Document',
      content,
      contentType: page.contentType,
      sourceUrl: page.url,
      sourceHash: page.contentHash,
      documentType: this.classifyDocumentType(content),
      jurisdiction: this.extractJurisdiction(content),
      practiceArea: this.extractPracticeArea(content),
      embeddingStatus: 'processing'
    };
    
    await this.db.insert(documents).values(document);
    return document;
  }
  
  classifyDocumentType(content) {
    const text = content.toLowerCase();
    
    if (text.includes('contract') || text.includes('agreement')) return 'contract';
    if (text.includes('v.') && text.includes('court')) return 'case_law';
    if (text.includes('statute') || text.includes('code')) return 'statute';
    if (text.includes('regulation') || text.includes('cfr')) return 'regulation';
    if (text.includes('brief') || text.includes('motion')) return 'brief';
    
    return 'document';
  }
  
  extractJurisdiction(content) {
    const text = content.toLowerCase();
    
    if (text.includes('supreme court')) return 'US-Supreme';
    if (text.includes('federal')) return 'US-Federal';
    if (text.includes('california')) return 'US-CA';
    if (text.includes('new york')) return 'US-NY';
    
    return 'US-Federal'; // Default
  }
  
  extractPracticeArea(content) {
    const text = content.toLowerCase();
    
    if (text.includes('corporate') || text.includes('business')) return 'corporate';
    if (text.includes('intellectual property') || text.includes('patent')) return 'intellectual_property';
    if (text.includes('employment') || text.includes('labor')) return 'employment';
    if (text.includes('real estate') || text.includes('property')) return 'real_estate';
    
    return 'general';
  }
  
  async saveCrawledPage(crawlJobId, pageData) {
    const pageId = crypto.randomUUID();
    
    await this.db.insert(crawledPages).values({
      id: pageId,
      crawlJobId,
      url: pageData.url || 'unknown',
      title: pageData.title,
      contentType: pageData.contentType,
      contentLength: pageData.contentLength,
      contentHash: pageData.contentHash,
      rawContent: pageData.rawContent,
      links: pageData.links,
      images: pageData.images,
      metadata: pageData.metadata,
      ocrRequired: pageData.requiresOCR,
      processingStatus: 'completed'
    });
    
    return pageId;
  }
  
  // ===== STORAGE OPERATIONS =====
  
  async storeBlobInMinIO(key, content, contentType = 'application/octet-stream') {
    try {
      const buffer = Buffer.from(content, 'utf-8');
      
      await this.s3.send(new PutObjectCommand({
        Bucket: CONFIG.minio.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: {
          'worker-id': this.workerId,
          'stored-at': new Date().toISOString()
        }
      }));
      
      return key;
    } catch (error) {
      console.error(`❌ [${this.workerId}] MinIO storage failed:`, error);
      throw error;
    }
  }
  
  async getBlobFromMinIO(key) {
    try {
      const response = await this.s3.send(new GetObjectCommand({
        Bucket: CONFIG.minio.bucket,
        Key: key
      }));
      
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      
      return Buffer.concat(chunks).toString('utf-8');
    } catch (error) {
      console.error(`❌ [${this.workerId}] MinIO retrieval failed:`, error);
      throw error;
    }
  }
  
  // ===== CACHING OPERATIONS =====
  
  async cacheEmbeddings(documentId, embeddings) {
    const cacheKey = `embeddings:${documentId}`;
    
    await this.redis.setex(cacheKey, 7200, JSON.stringify({
      documentId,
      embeddings: embeddings.map(e => ({
        chunkId: e.chunkId,
        embedding: e.embedding,
        preview: e.content
      })),
      cachedAt: new Date().toISOString()
    }));
    
    // Track cache key in database
    await this.db.insert(cacheKeys).values({
      cacheKey,
      cacheType: 'embedding_result',
      documentId,
      ttl: 7200,
      dataSize: JSON.stringify(embeddings).length
    });
  }
  
  async warmDocumentCache(documentId) {
    // Pre-warm frequently accessed data
    const document = await this.db.select()
      .from(documents)
      .where(eq(documents.id, documentId));
      
    const chunks = await this.db.select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId));
    
    const cacheData = {
      document: document[0],
      chunks,
      cachedAt: new Date().toISOString()
    };
    
    await this.redis.setex(`document:${documentId}`, 3600, JSON.stringify(cacheData));
  }
  
  // ===== JOB QUEUE OPERATIONS =====
  
  async queueOCRJob(pageId) {
    const job = {
      id: crypto.randomUUID(),
      type: 'ocr',
      pageId,
      priority: 5,
      createdAt: new Date().toISOString()
    };
    
    await this.rabbitmq.sendToQueue(
      CONFIG.rabbitmq.queues.ocr,
      Buffer.from(JSON.stringify(job)),
      { persistent: true, priority: job.priority }
    );
  }
  
  async queueEmbedJob(pageId) {
    const job = {
      id: crypto.randomUUID(),
      type: 'embed',
      pageId,
      priority: 7,
      createdAt: new Date().toISOString()
    };
    
    await this.rabbitmq.sendToQueue(
      CONFIG.rabbitmq.queues.embed,
      Buffer.from(JSON.stringify(job)),
      { persistent: true, priority: job.priority }
    );
  }
  
  async queueIndexJob(documentId) {
    const job = {
      id: crypto.randomUUID(),
      type: 'index',
      documentId,
      priority: 6,
      createdAt: new Date().toISOString()
    };
    
    await this.rabbitmq.sendToQueue(
      CONFIG.rabbitmq.queues.index,
      Buffer.from(JSON.stringify(job)),
      { persistent: true, priority: job.priority }
    );
  }
  
  // ===== MONITORING & METRICS =====
  
  async updateJobStatus(jobId, status, metadata = {}) {
    await this.db.update(processingJobs)
      .set({
        status,
        ...metadata,
        updatedAt: new Date()
      })
      .where(eq(processingJobs.id, jobId));
  }
  
  async recordMetric(metricType, value, unit, tags = {}) {
    await this.db.insert(systemMetrics).values({
      metricType,
      component: `worker-${this.workerId}`,
      value,
      unit,
      tags,
      metadata: {
        processedCount: this.processedCount,
        workerId: this.workerId
      }
    });
  }
  
  generateHash(content) {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }
  
  // ===== LIFECYCLE MANAGEMENT =====
  
  setupSignalHandlers() {
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('uncaughtException', (error) => {
      console.error(`❌ [${this.workerId}] Uncaught exception:`, error);
      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
  }
  
  async gracefulShutdown(signal) {
    console.log(`🛑 [${this.workerId}] Graceful shutdown initiated (${signal})`);
    
    this.isProcessing = false;
    
    // Wait for current job to complete (with timeout)
    let waitTime = 0;
    while (this.currentJob && waitTime < 30000) { // 30 second timeout
      await new Promise(resolve => setTimeout(resolve, 1000));
      waitTime += 1000;
    }
    
    // Close connections
    try {
      if (this.browser) await this.browser.close();
      if (this.ocrWorker) await this.ocrWorker.terminate();
      if (this.rabbitmq) await this.rabbitmq.close();
      if (this.redis) await this.redis.quit();
    } catch (error) {
      console.error(`❌ [${this.workerId}] Shutdown error:`, error);
    }
    
    console.log(`✅ [${this.workerId}] Shutdown complete. Processed ${this.processedCount} jobs.`);
    process.exit(0);
  }
}

// ===== CLUSTER MANAGEMENT =====

if (cluster.isMaster || cluster.isPrimary) {
  const numWorkers = parseInt(process.env.WORKER_COUNT || os.cpus().length);
  
  console.log(`🚀 Starting ${numWorkers} pipeline workers...`);
  
  // Fork workers
  for (let i = 0; i < numWorkers; i++) {
    const worker = cluster.fork({ WORKER_ID: `worker-${i}` });
    console.log(`✅ Started worker ${worker.process.pid}`);
  }
  
  // Handle worker crashes
  cluster.on('exit', (worker, code, signal) => {
    console.log(`💀 Worker ${worker.process.pid} died (${signal || code})`);
    console.log('🔄 Starting replacement worker...');
    cluster.fork({ WORKER_ID: `worker-${Date.now()}` });
  });
  
  // Handle master shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 Master received SIGTERM, shutting down workers...');
    for (const worker of Object.values(cluster.workers)) {
      worker.kill('SIGTERM');
    }
  });
  
} else {
  // Worker process
  const workerId = process.env.WORKER_ID || `worker-${process.pid}`;
  const worker = new ProductionPipelineWorker(workerId);
  
  worker.initialize()
    .then(() => worker.startProcessing())
    .catch(error => {
      console.error(`❌ [${workerId}] Worker startup failed:`, error);
      process.exit(1);
    });
}

export { ProductionPipelineWorker, CONFIG };