import { Client as MinioClient } from 'minio';
import { Pool } from 'pg';
import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import chokidar from 'chokidar';
import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import textract from 'textract';
import sharp from 'sharp';
import natural from 'natural';
import nlp from 'compromise';
import winston from 'winston';
import chalk from 'chalk';
import ora from 'ora';
import { v4 as uuidv4 } from 'uuid';
import { lookup as lookupMimeType } from 'mime-types';

interface DocumentMetadata {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  hash: string;
  uploadedAt: string;
  processedAt?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

interface ExtractedContent {
  text: string;
  pages?: string[];
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string[];
    created?: string;
    modified?: string;
  };
}

interface ProcessedDocument {
  id: string;
  content: ExtractedContent;
  embeddings: number[];
  entities: LegalEntity[];
  chunks: DocumentChunk[];
  summary: string;
  keywords: string[];
}

interface LegalEntity {
  id: string;
  type: 'person' | 'organization' | 'date' | 'amount' | 'contract_type' | 'location';
  text: string;
  confidence: number;
  start: number;
  end: number;
  metadata?: Record<string, any>;
}

interface DocumentChunk {
  id: string;
  content: string;
  embedding: number[];
  start: number;
  end: number;
  page?: number;
  entities: LegalEntity[];
}

interface IngestionJob {
  id: string;
  filePath: string;
  metadata: DocumentMetadata;
  priority: number;
  retries: number;
}

interface IngestionResult {
  success: boolean;
  documentId: string;
  chunksCreated: number;
  entitiesFound: number;
  processingTime: number;
  error?: string;
}

class Phase74Ingestion {
  private minioClient: MinioClient;
  private dbPool: Pool;
  private redis: IORedis;
  private ingestionQueue: Queue;
  private worker: Worker;
  private queueEvents: QueueEvents;
  private app: express.Application;
  private wss: WebSocket.Server;
  private watcher: chokidar.FSWatcher | null = null;
  private logger: winston.Logger;

  constructor() {
    this.initializeLogger();
    this.initializeMinIO();
    this.initializeDatabase();
    this.initializeRedis();
    this.initializeQueue();
    this.initializeExpress();
    this.initializeWebSocket();
  }

  private initializeLogger() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'phase-74-ingestion' },
      transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  private initializeMinIO() {
    this.minioClient = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    });
  }

  private initializeDatabase() {
    this.dbPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'legal_ai_db',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  private initializeRedis() {
    this.redis = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
    });
  }

  private initializeQueue() {
    this.ingestionQueue = new Queue('document-ingestion', {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.worker = new Worker('document-ingestion', this.processIngestionJob.bind(this), {
      connection: this.redis,
      concurrency: 2,
    });

    this.queueEvents = new QueueEvents('document-ingestion', {
      connection: this.redis,
    });

    this.setupQueueEventHandlers();
  }

  private initializeExpress() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'phase-74-ingestion' });
    });

    // Upload document
    this.app.post('/upload', this.handleDocumentUpload.bind(this));

    // Get ingestion status
    this.app.get('/status/:id', this.getIngestionStatus.bind(this));

    // List documents
    this.app.get('/documents', this.listDocuments.bind(this));

    // Search documents
    this.app.post('/search', this.searchDocuments.bind(this));

    // Start directory watch
    this.app.post('/watch', this.startDirectoryWatch.bind(this));
  }

  private initializeWebSocket() {
    this.wss = new WebSocket.Server({ port: 8085 });

    this.wss.on('connection', (ws) => {
      console.log('WebSocket client connected to Phase-74 ingestion');

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleWebSocketMessage(ws, data);
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            error: error.message
          }));
        }
      });
    });
  }

  private setupQueueEventHandlers() {
    this.queueEvents.on('completed', ({ jobId, returnvalue }) => {
      this.logger.info(`Job ${jobId} completed`, { returnvalue });
      this.broadcastToClients({
        type: 'job_completed',
        jobId,
        result: returnvalue
      });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.logger.error(`Job ${jobId} failed`, { failedReason });
      this.broadcastToClients({
        type: 'job_failed',
        jobId,
        error: failedReason
      });
    });

    this.queueEvents.on('progress', ({ jobId, data }) => {
      this.broadcastToClients({
        type: 'job_progress',
        jobId,
        progress: data
      });
    });
  }

  private broadcastToClients(data: any): void {
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  }

  async extractText(filePath: string, mimeType: string): Promise<ExtractedContent> {
    const buffer = await fs.readFile(filePath);

    switch (mimeType) {
      case 'application/pdf':
        return await this.extractFromPDF(buffer);

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await this.extractFromDOCX(buffer);

      case 'text/plain':
        return {
          text: buffer.toString('utf-8'),
          metadata: {}
        };

      default:
        // Try textract for other formats
        return await this.extractWithTextract(filePath);
    }
  }

  private async extractFromPDF(buffer: Buffer): Promise<ExtractedContent> {
    const data = await pdfParse(buffer);

    return {
      text: data.text,
      pages: data.text.split('\n\n').filter(page => page.trim()),
      metadata: {
        title: data.info?.Title,
        author: data.info?.Author,
        subject: data.info?.Subject,
        keywords: data.info?.Keywords?.split(','),
        created: data.info?.CreationDate,
        modified: data.info?.ModDate,
      }
    };
  }

  private async extractFromDOCX(buffer: Buffer): Promise<ExtractedContent> {
    const result = await mammoth.extractRawText({ buffer });

    return {
      text: result.value,
      metadata: {}
    };
  }

  private async extractWithTextract(filePath: string): Promise<ExtractedContent> {
    return new Promise((resolve, reject) => {
      textract.fromFileWithPath(filePath, (error, text) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            text: text || '',
            metadata: {}
          });
        }
      });
    });
  }

  async generateEmbeddings(text: string): Promise<number[]> {
    // Simple TF-IDF based embedding for now
    // In production, this would use a proper embedding model
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(text.toLowerCase()) || [];

    const tfidf = new natural.TfIdf();
    tfidf.addDocument(tokens);

    // Convert to fixed-size vector (simplified)
    const vector: number[] = [];
    const vocabulary = tfidf.listTerms(0).slice(0, 512); // Limit to 512 dimensions

    for (let i = 0; i < 512; i++) {
      vector.push(vocabulary[i]?.tfidf || 0);
    }

    return vector;
  }

  extractLegalEntities(text: string): LegalEntity[] {
    const entities: LegalEntity[] = [];
    const doc = nlp(text);

    // Extract people
    const people = doc.people().json();
    people.forEach((person: any, index: number) => {
      entities.push({
        id: uuidv4(),
        type: 'person',
        text: person.text,
        confidence: person.confidence || 0.8,
        start: person.offset.start,
        end: person.offset.end,
        metadata: { index }
      });
    });

    // Extract organizations
    const organizations = doc.organizations().json();
    organizations.forEach((org: any, index: number) => {
      entities.push({
        id: uuidv4(),
        type: 'organization',
        text: org.text,
        confidence: org.confidence || 0.8,
        start: org.offset.start,
        end: org.offset.end,
        metadata: { index }
      });
    });

    // Extract dates
    const dates = doc.dates().json();
    dates.forEach((date: any, index: number) => {
      entities.push({
        id: uuidv4(),
        type: 'date',
        text: date.text,
        confidence: date.confidence || 0.8,
        start: date.offset.start,
        end: date.offset.end,
        metadata: { index }
      });
    });

    // Extract monetary amounts (simple regex)
    const amountRegex = /\$\d+(?:,\d{3})*(?:\.\d{2})?/g;
    let match;
    while ((match = amountRegex.exec(text)) !== null) {
      entities.push({
        id: uuidv4(),
        type: 'amount',
        text: match[0],
        confidence: 0.9,
        start: match.index,
        end: match.index + match[0].length,
        metadata: {}
      });
    }

    return entities;
  }

  createDocumentChunks(text: string, entities: LegalEntity[]): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());

    for (let i = 0; i < sentences.length; i += 3) { // 3 sentences per chunk
      const chunkText = sentences.slice(i, i + 3).join('. ').trim();
      if (chunkText) {
        const start = text.indexOf(chunkText);
        const end = start + chunkText.length;

        // Find entities in this chunk
        const chunkEntities = entities.filter(
          entity => entity.start >= start && entity.end <= end
        );

        chunks.push({
          id: uuidv4(),
          content: chunkText,
          embedding: await this.generateEmbeddings(chunkText),
          start,
          end,
          entities: chunkEntities
        });
      }
    }

    return chunks;
  }

  generateSummary(text: string): string {
    // Simple extractive summarization
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    const wordCount = text.split(/\s+/).length;

    if (wordCount <= 100) {
      return text;
    }

    // Return first and last sentences, plus middle if long enough
    const summary: string[] = [];
    summary.push(sentences[0]);

    if (sentences.length > 2) {
      summary.push(sentences[Math.floor(sentences.length / 2)]);
    }

    if (sentences.length > 1) {
      summary.push(sentences[sentences.length - 1]);
    }

    return summary.join('. ').substring(0, 500) + (summary.join('. ').length > 500 ? '...' : '');
  }

  extractKeywords(text: string): string[] {
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(text.toLowerCase()) || [];

    // Remove stop words
    const stopWords = natural.stopwords;
    const filteredTokens = tokens.filter(token => !stopWords.includes(token));

    // Count frequency
    const frequency: Record<string, number> = {};
    filteredTokens.forEach(token => {
      frequency[token] = (frequency[token] || 0) + 1;
    });

    // Return top 10 keywords
    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([word]) => word);
  }

  async processIngestionJob(job: any): Promise<IngestionResult> {
    const { filePath, metadata }: IngestionJob = job.data;
    const startTime = Date.now();

    try {
      job.updateProgress(10);

      // Extract text content
      const content = await this.extractText(filePath, metadata.mimeType);
      job.updateProgress(30);

      // Generate embeddings
      const embeddings = await this.generateEmbeddings(content.text);
      job.updateProgress(50);

      // Extract legal entities
      const entities = this.extractLegalEntities(content.text);
      job.updateProgress(70);

      // Create document chunks
      const chunks = await this.createDocumentChunks(content.text, entities);
      job.updateProgress(85);

      // Generate summary and keywords
      const summary = this.generateSummary(content.text);
      const keywords = this.extractKeywords(content.text);

      // Create processed document
      const processedDoc: ProcessedDocument = {
        id: metadata.id,
        content,
        embeddings,
        entities,
        chunks,
        summary,
        keywords
      };

      // Store in MinIO
      await this.storeInMinIO(processedDoc, metadata);

      // Store in PostgreSQL
      await this.storeInPostgres(processedDoc, metadata);

      job.updateProgress(100);

      const processingTime = Date.now() - startTime;
      this.logger.info(`Document ${metadata.id} processed successfully`, {
        chunksCreated: chunks.length,
        entitiesFound: entities.length,
        processingTime
      });

      return {
        success: true,
        documentId: metadata.id,
        chunksCreated: chunks.length,
        entitiesFound: entities.length,
        processingTime
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Document ${metadata.id} processing failed`, {
        error: error.message,
        processingTime
      });

      // Update metadata with error
      await this.updateDocumentStatus(metadata.id, 'failed', error.message);

      return {
        success: false,
        documentId: metadata.id,
        chunksCreated: 0,
        entitiesFound: 0,
        processingTime,
        error: error.message
      };
    }
  }

  async storeInMinIO(doc: ProcessedDocument, metadata: DocumentMetadata): Promise<void> {
    const bucketName = 'legal-documents-processed';

    try {
      // Ensure bucket exists
      const bucketExists = await this.minioClient.bucketExists(bucketName);
      if (!bucketExists) {
        await this.minioClient.makeBucket(bucketName);
      }

      // Store processed document as JSON
      const objectName = `documents/${doc.id}/processed.json`;
      await this.minioClient.putObject(
        bucketName,
        objectName,
        JSON.stringify(doc, null, 2)
      );

      // Store original file
      const originalObjectName = `documents/${doc.id}/original${path.extname(metadata.filename)}`;
      const fileBuffer = await fs.readFile(metadata.originalName);
      await this.minioClient.putObject(bucketName, originalObjectName, fileBuffer);

    } catch (error) {
      this.logger.error('Error storing in MinIO:', error);
      throw error;
    }
  }

  async storeInPostgres(doc: ProcessedDocument, metadata: DocumentMetadata): Promise<void> {
    const client = await this.dbPool.connect();

    try {
      await client.query('BEGIN');

      // Insert document metadata
      await client.query(`
        INSERT INTO documents (
          id, filename, mime_type, size, hash, uploaded_at,
          processed_at, status, content, summary, keywords
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        doc.id,
        metadata.filename,
        metadata.mimeType,
        metadata.size,
        metadata.hash,
        metadata.uploadedAt,
        new Date().toISOString(),
        'completed',
        doc.content.text,
        doc.summary,
        doc.keywords
      ]);

      // Insert embeddings
      await client.query(`
        INSERT INTO document_embeddings (id, document_id, embedding)
        VALUES ($1, $2, $3)
      `, [uuidv4(), doc.id, `[${doc.embeddings.join(',')}]`]);

      // Insert entities
      for (const entity of doc.entities) {
        await client.query(`
          INSERT INTO document_entities (
            id, document_id, type, text, confidence, start_pos, end_pos, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          entity.id,
          doc.id,
          entity.type,
          entity.text,
          entity.confidence,
          entity.start,
          entity.end,
          JSON.stringify(entity.metadata)
        ]);
      }

      // Insert chunks
      for (const chunk of doc.chunks) {
        await client.query(`
          INSERT INTO document_chunks (
            id, document_id, content, embedding, start_pos, end_pos, entities
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          chunk.id,
          doc.id,
          chunk.content,
          `[${chunk.embedding.join(',')}]`,
          chunk.start,
          chunk.end,
          JSON.stringify(chunk.entities)
        ]);
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateDocumentStatus(id: string, status: DocumentMetadata['status'], error?: string): Promise<void> {
    await this.dbPool.query(`
      UPDATE documents
      SET status = $1, error = $2, processed_at = $3
      WHERE id = $4
    `, [status, error, new Date().toISOString(), id]);
  }

  // Express route handlers
  private async handleDocumentUpload(req: express.Request, res: express.Response) {
    try {
      if (!req.body.filePath) {
        return res.status(400).json({ error: 'filePath is required' });
      }

      const filePath = req.body.filePath;
      const priority = req.body.priority || 1;

      // Check if file exists
      await fs.access(filePath);

      // Get file stats
      const stats = await fs.stat(filePath);
      const mimeType = lookupMimeType(filePath) || 'application/octet-stream';

      // Create metadata
      const metadata: DocumentMetadata = {
        id: uuidv4(),
        filename: path.basename(filePath),
        originalName: filePath,
        mimeType,
        size: stats.size,
        hash: '', // Would compute actual hash in production
        uploadedAt: new Date().toISOString(),
        status: 'pending'
      };

      // Add to ingestion queue
      const job = await this.ingestionQueue.add(
        'ingest-document',
        { filePath, metadata, priority, retries: 0 },
        { priority }
      );

      res.json({
        jobId: job.id,
        documentId: metadata.id,
        status: 'queued'
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  private async getIngestionStatus(req: express.Request, res: express.Response) {
    try {
      const { id } = req.params;

      const result = await this.dbPool.query(
        'SELECT * FROM documents WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  private async listDocuments(req: express.Request, res: express.Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await this.dbPool.query(`
        SELECT id, filename, mime_type, size, uploaded_at, processed_at, status
        FROM documents
        ORDER BY uploaded_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  private async searchDocuments(req: express.Request, res: express.Response) {
    try {
      const { query, limit = 10 } = req.body;

      if (!query) {
        return res.status(400).json({ error: 'query is required' });
      }

      // Simple text search (would use vector search in production)
      const result = await this.dbPool.query(`
        SELECT id, filename, summary, keywords,
               ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', $1)) as rank
        FROM documents
        WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT $2
      `, [query, limit]);

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  private async startDirectoryWatch(req: express.Request, res: express.Response) {
    try {
      const { directory, patterns = ['**/*.{pdf,docx,txt}'] } = req.body;

      if (!directory) {
        return res.status(400).json({ error: 'directory is required' });
      }

      await this.startDirectoryWatcher(directory, patterns);
      res.json({ status: 'watching', directory, patterns });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async startDirectoryWatcher(directory: string, patterns: string[]): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
    }

    const globPatterns = patterns.map(pattern => path.join(directory, pattern));

    this.watcher = chokidar.watch(globPatterns, {
      ignored: ['**/node_modules/**', '**/.git/**'],
      persistent: true,
      awaitWriteFinish: true
    });

    this.watcher.on('add', async (filePath) => {
      this.logger.info(`New file detected: ${filePath}`);

      try {
        // Auto-ingest new files
        const response = await fetch('http://localhost:3003/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath, priority: 1 })
        });

        if (response.ok) {
          const result = await response.json();
          this.logger.info(`Auto-ingested file: ${filePath}`, { jobId: result.jobId });
        }
      } catch (error) {
        this.logger.error(`Failed to auto-ingest file: ${filePath}`, { error: error.message });
      }
    });

    this.logger.info(`Started watching directory: ${directory}`);
  }

  private async handleWebSocketMessage(ws: WebSocket, data: any) {
    // Handle real-time client messages
    switch (data.type) {
      case 'subscribe_job':
        // Client wants to subscribe to job updates
        this.logger.info(`Client subscribed to job: ${data.jobId}`);
        break;
    }
  }

  async start(port: number = 3003): Promise<void> {
    this.app.listen(port, () => {
      console.log(`Phase-74 Ingestion server running on port ${port}`);
      console.log('WebSocket server running on port 8085');
    });
  }

  async cleanup(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
    }
    await this.worker.close();
    await this.ingestionQueue.close();
    await this.redis.disconnect();
    await this.dbPool.end();
    this.wss.close();
  }
}

// CLI Interface
async function runCLI() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(chalk.blue('Phase-74 Ingestion CLI'));
    console.log('');
    console.log('Usage:');
    console.log('  phase-74 ingest <file>          Ingest a single document');
    console.log('  phase-74 monitor                Start monitoring dashboard');
    console.log('  phase-74 watch <dir>            Watch directory for new files');
    console.log('  phase-74 server                 Start HTTP/WebSocket server');
    console.log('');
    return;
  }

  const ingestion = new Phase74Ingestion();
  const command = args[0];

  try {
    switch (command) {
      case 'ingest':
        if (!args[1]) {
          console.error('Please specify a file to ingest');
          process.exit(1);
        }

        const spinner = ora('Ingesting document...').start();
        const response = await fetch('http://localhost:3003/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: args[1], priority: 1 })
        });

        if (response.ok) {
          const result = await response.json();
          spinner.succeed(`Document queued for ingestion: ${result.documentId}`);
        } else {
          spinner.fail('Failed to queue document');
        }
        break;

      case 'monitor':
        console.log('Starting monitoring dashboard...');
        // Would start a monitoring interface
        break;

      case 'watch':
        if (!args[1]) {
          console.error('Please specify a directory to watch');
          process.exit(1);
        }

        await ingestion.startDirectoryWatcher(args[1], ['**/*.{pdf,docx,txt}']);
        console.log(`Watching directory: ${args[1]}`);
        // Keep process running
        process.on('SIGINT', async () => {
          console.log('\nStopping directory watch...');
          await ingestion.cleanup();
          process.exit(0);
        });
        break;

      case 'server':
        await ingestion.start();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  runCLI().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { Phase74Ingestion, DocumentMetadata, ProcessedDocument, LegalEntity, DocumentChunk };