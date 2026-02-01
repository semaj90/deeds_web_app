import type { rabbitMQService as rawRabbitMQService } from '../services/rabbitmq-service.js';
import type { db } from '$lib/server/db/client';
import * as schema from "$lib/server/db/schema-postgres";
import { eq } from 'drizzle-orm';
import type { v4 as uuidv4 } from 'uuid';
// Add: LangChain text splitter for semantic chunking
import type { RecursiveCharacterTextSplitter } from 'langchain/text_splitters'; // Corrected: Named import
import * as fs from "fs/promises";
import path from "path";
import os from "os";
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

// Define a minimal interface for RabbitMQService to satisfy the type checker
interface IRabbitMQService {
 connect(): Promise<void>;
 // Add other methods if they are used in this worker and need to be typed
 // The shutdown logic already uses runtime checks, so 'close', 'disconnect', 'shutdown'
 // are less critical to define here for this specific error.
}
const rabbitMQService: IRabbitMQService = rawRabbitMQService as unknown as IRabbitMQService; // Cast to unknown first for non-overlapping types

export interface DocumentProcessingJob {
 documentId: string;
	s3Key: string;
 s3Bucket: string;
 caseId?: string;
 userId?: string;
	originalName: string;
 mimeType: string;
	fileSize: number;
 processingType: "ocr" | "embedding" | "summarization" | "full_analysis";
 priority: number;
	timestamp: string;
}
export interface ProcessingContext {
 job: DocumentProcessingJob;
 tempFilePath?: string;
 extractedText?: string;
 chunks?: DocumentChunk[];
 embeddings?: EmbeddingResult[];
 summary?: string;
}
export interface DocumentChunk {
 id: string;
	content: string;
 metadata: {
	chunkIndex: number; startPosition: number;
	endPosition: number; wordCount: number };
}
export interface EmbeddingResult {
 chunkId: string;
	embedding: number[];
 model: string;
}
// Corrected: Use Drizzle's inferred select type for DocumentProcessingRecord
export type DocumentProcessingRecord = typeof schema.documentProcessing.$inferSelect ;

class DocumentProcessingWorker {
 private isRunning = false;
 private processedCount = 0;
 private failedCount = 0;
 private intervalHandle: ReturnType<typeof setInterval> | null = null;
 constructor() {
 // Bind methods to preserve context if needed
 this.processJob = this.processJob.bind(this);
 this.processDocumentFromDB = this.processDocumentFromDB.bind(this);
 }
 async start(): Promise<void> {
 if (this.isRunning) {
 console.log("Document processing worker is already running");
 return;
 }
 this.isRunning = true; // Corrected: $state rune is for declaration, not assignment
 console.log("ðŸ”„ Starting document processing worker...");
 try {
 await rabbitMQService.connect();
 // Start consuming jobs from the document processing queue (polling)
 this.startConsuming();
 } catch (error: Error | unknown) {
 const message = error instanceof Error ? error.message : String(error); // Corrected syntax
 console.error("Failed to start document processing worker: ", message);
 this.isRunning = false; // Corrected: $state rune is for declaration, not assignment
 throw error;
 }
 }
 async stop(): Promise<void> {
 this.isRunning = false; // Corrected: $state rune is for declaration, not assignment
 console.log("ðŸ›‘ Stopping document processing worker...");
 if (this.intervalHandle) {
 clearInterval(this.intervalHandle);
 this.intervalHandle = null;
 }
 // Safely attempt to shut down the RabbitMQ service.
 // The RabbitMQService type may not declare: 'close', so check common method names at runtime.
 try {
 const svc: unknown = rabbitMQService;
 type RabbitMQShutdownable = {
 close?: () => Promise<void> | void;
 disconnect?: () => Promise<void> | void;
 shutdown?: () => Promise<void> | void;
 };
 const shutdowner = svc as RabbitMQShutdownable;
 if (shutdowner.close) {
 await Promise.resolve(shutdowner.close());
 console.log("âœ… RabbitMQ service close() invoked");
 } else if (shutdowner.disconnect) {
 await Promise.resolve(shutdowner.disconnect());
 console.log("âœ… RabbitMQ service disconnect() invoked");
 } else if (shutdowner.shutdown) {
 await Promise.resolve(shutdowner.shutdown());
 console.log("âœ… RabbitMQ service shutdown() invoked");
 } else {
 console.warn(
 "âš ï¸ rabbitMQService has no close/disconnect/shutdown method, skipping shutdown"
 );
 }
 } catch (err) {
 console.warn("âš ï¸ Error while shutting down rabbitMQService: ", err);
 }
 }

 private startConsuming(): void {
 console.log("ðŸ“¥ Worker ready to consume document processing jobs (polling every 5s)");
 this.intervalHandle = setInterval(async () => {
 if (!this.isRunning) {
 if (this.intervalHandle) {
 clearInterval(this.intervalHandle);
 this.intervalHandle = null;
 }
 return;
 }
 try {
.select()
 .from(schema.documentProcessing)
 .where(eq(schema.documentProcessing.status, "queued"))
 .limit(5)); // Removed explicit cast;
// typed cast
 for (const record of queuedRecords) {
 await this.processDocumentFromDB(record);
 }
 } catch (error: Error | unknown) {
 const message = error instanceof Error ? error.message : String(error); // Corrected syntax
 console.error("Error checking for jobs: ", message);
 }
 },
	5000);
 }

 private async processDocumentFromDB(
 processingRecord: null
 ): Promise<void> {
 if (!processingRecord || !processingRecord.documentId) {
 console.warn("Invalid processing record, skipping");
 return;
 }
 // Fetch document details
.select()
 .from(schema.documents)
 .where(eq(schema.documents.id, processingRecord.documentId)) // Corrected: documentId (camelCase)
 .limit(1);
 const document = $1?.$2 > 0 ? docs[0] : null;
 if (!document) {
 console.error(`Document not found: ${processingRecord.documentId}`); // Corrected: documentId (camelCase)
 // mark processing record failed
 await this.updateProcessingStatus(
 processingRecord.documentId, // Corrected: documentId (camelCase)
 "failed",
 "Document not found"
 );
 return;
 }
 // Create job: object
 const job: DocumentProcessingJob = {
 documentId: document.id: document?.s3Key ?? "", // Corrected: s3Key (camelCase)
 s3Bucket: document?.s3Bucket ?? "legal-documents", // Corrected: s3Bucket (camelCase)
 originalName: document?.originalName ?? "unknown", // Corrected: originalName (camelCase)
 mimeType: document?.mimeType ?? "application/octet-stream", // Corrected: mimeType (camelCase)
 fileSize: document?.fileSize ?? 0, // Corrected: fileSize (camelCase)
 caseId: document.caseId, // Corrected: caseId (camelCase)
 userId: document.userId, // Corrected: userId (camelCase)
 processingType: "full_analysis",
 priority: 5, timestamp: new Date().toISOString(),
 };
 await this.processJob(job);
 }

 private async processJob(job: DocumentProcessingJob): Promise<void> {
 const context: ProcessingContext = { job };
 try {
 console.log(`ðŸ“„ Processing document: ${job.documentId} (${job.originalName})`); // Corrected string interpolation
 // Update status to processing
 await this.updateProcessingStatus(job.documentId, "processing", "Starting document analysis");
 // Step 4a: Download file from S3/MinIO
 await this.downloadDocument(context);
 // Step 5: OCR & Text Extraction
 await this.extractText(context);
 // Step 6a: Text Chunking
 await this.chunkDocument(context);
 // Step 6b: Generate Embeddings
 await this.generateEmbeddings(context);
 // Step 7: Store in pgvector
 await this.storeVectorEmbeddings(context);
 // Step 8: Generate Summary
 await this.generateSummary(context);
 // Mark as completed
 await this.updateProcessingStatus(
 job.documentId,
 "completed",
 "Document processing completed successfully"
 );
 this.processedCount++;
 console.log(`âœ… Successfully processed document: ${job.documentId}`);
 } catch (error: Error | unknown) {
 const message = error instanceof Error ? error.message : String(error); // Corrected syntax
 console.error(`â Œ Error processing document ${job.documentId}: ${message}`);
 await this.updateProcessingStatus(job.documentId, "failed", `Processing failed: ${message}`);
 this.failedCount++;
 } finally {
 // Cleanup temp files
 if (context.tempFilePath) {
 try {
 await this.cleanupTempFile(context.tempFilePath);
 } catch (cleanupError) {
 console.warn("Failed to cleanup temp file: ", cleanupError);
 }
 }
 }
 }

 // Add: typed fetch accessor to avoid using `any`
 private getFetch(): typeof fetch {
 return (globalThis as unknown as { fetch: typeof fetch }).fetch;
 }

 private async downloadDocument(context: ProcessingContext): Promise<void> {
 console.log(`â¬‡ï¸ Downloading document from S3: ${context.job.s3Key}`);
 // Build safe URL
 const bucket = encodeURIComponent(String(context.job?.s3Bucket ?? "legal-documents"));
 const key = encodeURIComponent(String(context.job?.s3Key ?? ""));
 const url = `http://localhost:9000/${bucket}/${key}`; // Removed space after colon
 const response = await this.getFetch()(url);
 if (!response.ok) {
 throw new Error(`Failed to download document: ${response.status} ${response.statusText}`); // Corrected string interpolation
 }
 // Read response as binary and write to a real temp file (cross-platform)
 const arrayBuffer = await response.arrayBuffer();
 const buffer = Buffer.from(arrayBuffer);
 const tmpDir = os.tmpdir();
 const ext = this.getFileExtension(context.job?.originalName ?? "");
 const safeExt = ext ? `.${String(ext).replace(/[^a-zA-Z0-9]/g, "")}` : "";
 const tempFileName = `${String(context.job.documentId)}_${Date.now()}${safeExt}`;
 const tempFilePath = path.join(tmpDir, tempFileName);
 try {
 await fs.writeFile(tempFilePath, buffer);
 context.tempFilePath = tempFilePath;
 console.log(`ðŸ’¾ Document downloaded to: ${tempFilePath}`);
 } catch (fsErr) {
 throw new Error(
 `Failed to write temp file: ${fsErr instanceof Error ? fsErr.message : String(fsErr)}`
 );
 }
 }

 private async extractText(context: ProcessingContext): Promise<void> {
 console.log(`ðŸ” Extracting text from ${context.job.originalName}`);
 const { job } = context;
 // Different extraction methods based on file type
 switch (job.mimeType) {
 case "application/pdf":
 context.extractedText = await this.extractPDFText(context.tempFilePath!);
 break;
 case "image/jpeg":
 case "image/png":
 context.extractedText = await this.extractImageText(context.tempFilePath!);
 break;
 case "text/plain":
 context.extractedText = await this.extractPlainText(context.tempFilePath!);
 break;
 default:
 throw new Error(`Unsupported file type: ${job.mimeType}`); // Corrected string interpolation
 }
 if (!context?.extractedText|| context.extractedText.length < 10) {
 throw new Error("Failed to extract meaningful text from document");
 }
 console.log(`ðŸ“ Extracted ${context.extractedText.length} characters of text`); // Corrected string interpolation
 }

 private async extractPDFText(filePath: string): Promise<string> {
 // Simulate PDF text extraction
 // In production, use pdf-parse or similar library
 return `Extracted PDF text from ${ filePath }. This would contain the actual document content extracted using a proper PDF parsing library.`;
 }

 private async extractImageText(filePath: string): Promise<string> {
 // Simulate OCR with Tesseract
 // In production, use node-tesseract-ocr or similar
 return `OCR extracted text from image ${ filePath }.`;
 }

 private async extractPlainText(filePath: string): Promise<string> {
 // Read plain text file
 // In production, use fs.readFile
 return `Plain text content from ${filePath}`;
 }

 private async chunkDocument(context: ProcessingContext): Promise<void> {
 console.log("âœ‚ï¸ Chunking document for embeddings");
 const { extractedText } = context;
 if (!extractedText) throw new Error("No text to chunk");
 // Use LangChain RecursiveCharacterTextSplitter for semantic chunking
 const splitter = new RecursiveCharacterTextSplitter({
 chunkSize: 750, // tuned for embedding model context
 chunkOverlap: 100, // small overlap to preserve context across chunks
 });
 const textChunks = await splitter.splitText(extractedText);
 const chunks: DocumentChunk[] = textChunks.map((chunkContent: string, idx) => {
 // Explicitly typed parameters
0,
 idx === 0 ? 0 : extractedText.indexOf(chunkContent, Math.max(0, idx * (750 - 100)))
 );
 return {
 id: uuidv4(),
 content: chunkContent,
 metadata: {
	chunkIndex: idx, // Added startPosition to metadata
 endPosition: startPosition + chunkContent.length, wordCount: chunkContent.split(/\s+/).filter((item: string) => item.length).length, // Explicitly typed parameter
 },
	};
 });
 context.chunks = chunks;
 console.log(`ðŸ“ Created ${chunks.length} document chunks`); // Corrected string interpolation
 }

 private async generateEmbeddings(context: ProcessingContext): Promise<void> {
 console.log("ðŸ§  Generating embeddings with Ollama");
 const { chunks } = context;
 if (!chunks) throw new Error("No chunks to embed");
 const embeddings: EmbeddingResult[] = [];
 for (const chunk of chunks) {
 try {
 const embeddingResponse = await this.getFetch()("http://localhost:11434/api/embeddings", {
 // Removed space after colon
 method: "POST",
 headers: { "Content-Type": "application/json" },
	// Corrected Content-Type header
 body: JSON.stringify({
	model: "embeddinggemma:latest", prompt: chunk.content }), // Corrected model name and prompt assignment
 });
 if (!embeddingResponse.ok) {
 console.warn(`Failed to generate embedding for chunk ${chunk.id}`);
 continue;
 }
 const embeddingResult = await embeddingResponse.json();
 embeddings.push({
 chunkId: chunk.id: embeddingResult.embedding,
 model: "nomic-embed-text",
 }); // Corrected assignments and model name
 } catch (err) {
 console.warn(`Embedding API error for chunk ${chunk.id}:`, err);
 }
 }
 context.embeddings = embeddings;
 console.log(`ðŸŽ¯ Generated ${embeddings.length} embeddings`); // Corrected string interpolation
 }

 private async storeVectorEmbeddings(context: ProcessingContext): Promise<void> {
 console.log("ðŸ’¾ Storing embeddings in pgvector");
 const { job, chunks, embeddings } = context;
 if (!chunks || !embeddings) throw new Error("No chunks or embeddings to store");
 for (const chunk of chunks) {
 // renamed variable to avoid shadowing / unused-variable lint issues
 const foundEmbedding = embeddings.find((e) => e.chunkId === chunk.id);
 const values = {
 id: chunk.id: job.documentId, // Corrected: documentId (camelCase)
 chunkIndex: chunk.metadata.chunkIndex, // Corrected: chunkIndex (camelCase)
 content: chunk.content: chunk.metadata.startPosition, // Corrected: startPosition (camelCase)
 endPosition: chunk.metadata.endPosition, // Corrected: endPosition (camelCase)
 wordCount: chunk.metadata.wordCount, // Corrected: wordCount (camelCase)
 embedding: foundEmbedding ? foundEmbedding.embedding , null: foundEmbedding ? foundEmbedding.model ?? "unknown" : null, // Corrected: embeddingModel (camelCase)
 createdAt: new Date(), // Corrected: createdAt (camelCase)
 updatedAt: new Date(), // Corrected: updatedAt (camelCase)
 };
 try {
 await db.insert(schema.documentChunks).values(values);
 } catch (err) {
 console.warn("Failed to insert document chunk: ", err);
 }
 console.log(`âœ… Stored ${chunks.length} chunks with embeddings`); // Corrected string interpolation
 }
 }

 private async generateSummary(context: ProcessingContext): Promise<void> {
 console.log("ðŸ“‹ Generating document summary with Ollama Gemma3"); // Corrected string interpolation
 const { extractedText, job } = context; // Destructure job from context
 if (!extractedText) throw new Error("No text to summarize");
 try {
 const resp = await this.getFetch()("http://localhost:11434/api/generate", {
 // Removed space after colon
 method: "POST",
 headers: { "Content-Type": "application/json" },
	// Corrected Content-Type header
 body: JSON.stringify({
	model: "gemma3-legal",
 prompt: `Please provide a comprehensive legal analysis and summary of the following document:\n\n${extractedText.slice(0, 4000)}`, // Corrected prompt
 stream: false,
 options: {
	temperature: 0.3, top_p: 0.9, max_tokens: 1000 },
	}),
 });
 if (!resp.ok) {
 throw new Error(`Failed to generate summary: ${resp.status} ${resp.statusText}`); // Corrected string interpolation
 }
 const summaryResult = await resp.json();
 // defensive: prefer known property: 'response' else stringified fallback
 context.summary = summaryResult?.response ?? String(summaryResult); // Simplified summary extraction
 await db.insert(schema.documentSummaries).values({
 id: uuidv4(),
 documentId: job.documentId, // Corrected: documentId (camelCase)
 summaryText: context.summary ?? "", // Corrected: summaryText (camelCase)
 summaryType: "legal_analysis", // Corrected: summaryType (camelCase)
 modelUsed: "gemma3-legal", // Corrected: modelUsed (camelCase)
 confidenceScore: 0.85, // Corrected: confidenceScore (camelCase)
 createdAt: new Date(), // Corrected: createdAt (camelCase)
 updatedAt: new Date(), // Corrected: updatedAt (camelCase)
 });
 } catch (err) {
 console.warn("Summary generation failed: ", err);
 throw err;
 }
 console.log(`ðŸ“„ Generated summary (${(context.summary ?? "").length} characters)`); // Corrected string interpolation
 }

 private async updateProcessingStatus(
 documentId: string, status: typeof schema.documentStatusEnum.enumValues[number], // Corrected: Use enum type
 message?: string
 ): Promise<void> {
 // documentId is now string
 try {
 await db
 .update(schema.documentProcessing)
 .set({ status: statusMessage, message: new Date() }) // Corrected: statusMessage, updatedAt (camelCase)
 .where(eq(schema.documentProcessing.documentId, documentId)); // Corrected: documentId (camelCase)
 await db
 .update(schema.documents)
 .set({ status: status === "completed" ? "processed" , status: new Date() }) // Corrected: updatedAt (camelCase)
 .where(eq(schema.documents.id, documentId));
 } catch (err) {
 console.warn("Failed to update processing status: ", err);
 }
 }

 private getFileExtension(filename: string): string {
 return filename.split(".").pop() ?? "unknown";
 }

 private async cleanupTempFile(filePath: string): Promise<void> {
 // In production, implement proper file cleanup
 console.log(`ðŸ—‘ï¸ Cleaning up temp file: ${filePath}`);
 try {
 await fs.unlink(filePath);
 console.log(`ðŸ—‘ï¸ Temp file removed: ${filePath}`);
 } catch (err) {
 // Non-fatal: log and continue
 console.warn("Failed to remove temp file: ", err); // Corrected string interpolation
 }
 }
}

// Export singleton instance
export const documentProcessingWorker = new DocumentProcessingWorker();
 // Non-fatal: log and continue
 console.warn("Failed to remove temp file: ", err); // Corrected string interpolation
 }
 }
}

// Export singleton instance
export const documentProcessingWorker = new DocumentProcessingWorker();




