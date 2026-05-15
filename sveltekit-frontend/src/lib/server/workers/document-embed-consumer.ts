/**
 * Document Embedding Consumer
 * RabbitMQ consumer for document.embed queue
 * Chunks documents and embeds them in Qdrant chat_documents collection
 */
import { rabbitmq } from '$lib/server/queue/rabbitmq-manager-fixed';
import { db } from '$lib/server/db/client';
import { chatDocumentAttachments, documents } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { ENV } from '$lib/server/env.server.js';

interface DocumentEmbedJob {
  documentId: string;
  filePath: string;
  fileName: string;
  sessionId: string;
  caseId: string | null;
  userId: string;
  timestamp: number;
}

let isConsuming = false;

/**
 * Extract text from document (basic implementation)
 */
async function extractText(filePath: string, mimeType: string): Promise<string> {
  try {
    if (mimeType === 'text/plain' || mimeType === 'text/markdown' || filePath.endsWith('.txt') || filePath.endsWith('.md')) {
      return await readFile(filePath, 'utf-8');
    } else if (mimeType === 'application/json' || filePath.endsWith('.json')) {
      const content = await readFile(filePath, 'utf-8');
      return JSON.stringify(JSON.parse(content), null, 2);
    } else if (mimeType === 'application/pdf' || filePath.endsWith('.pdf')) {
      try {
        const pdfParse = await import('pdf-parse/lib/pdf-parse.js');
        const buffer = await readFile(filePath);
        const data = await pdfParse.default(buffer);
        return data.text;
      } catch (err) {
        console.warn('[doc-embed] pdf-parse failed:', err);
        return '[PDF content extraction failed]';
      }
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword' ||
      filePath.endsWith('.docx') || filePath.endsWith('.doc')
    ) {
      try {
        const mammoth = await import('mammoth');
        const buffer = await readFile(filePath);
        const result = await mammoth.extractRawText({ buffer });
        if (result.messages.length) console.debug('[doc-embed] mammoth warnings:', result.messages);
        return result.value;
      } catch (err) {
        console.warn('[doc-embed] mammoth failed:', err);
        return '[DOCX content extraction failed]';
      }
    } else {
      return `[Document type ${mimeType} not yet supported for text extraction]`;
    }
  } catch (error) {
    console.error('[doc-embed] Text extraction error:', error);
    throw error;
  }
}

/**
 * Chunk text into smaller pieces for embedding
 */
function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    start += chunkSize - overlap;
  }

  return chunks;
}

/**
 * Embed text chunk using embeddinggemma
 */
async function embedChunk(text: string): Promise<number[]> {
  const response = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'embeddinggemma:latest',
      prompt: text
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.status}`);
  }

  const { embedding } = await response.json();
  return embedding;
}

/**
 * Process document: extract text → chunk → embed → index in Qdrant
 */
async function processDocument(job: DocumentEmbedJob): Promise<void> {
  const { documentId, filePath, fileName, sessionId } = job;

  try {
    // Update status to processing
    await db
      .update(chatDocumentAttachments)
      .set({ embedding_status: 'processing' })
      .where(eq(chatDocumentAttachments.document_id, documentId));

    // Get document record for mime type
    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!doc) {
      throw new Error('Document not found');
    }

    // Extract text
    console.log(`[Document Embed] Extracting text from ${fileName}...`);
    const text = await extractText(filePath, doc.mimeType || 'text/plain');

    if (!text || text.length < 10) {
      throw new Error('No text extracted from document');
    }

    // Chunk text
    const chunks = chunkText(text);
    console.log(`[Document Embed] Split ${fileName} into ${chunks.length} chunks`);

    // Embed chunks and upsert to Qdrant (use UUID — Qdrant requires UUID or integer IDs)
    const qdrantDocId = crypto.randomUUID();

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await embedChunk(chunk);

      // Upsert to Qdrant chat_documents collection
      await fetch(`${ENV.QDRANT_URL}/collections/chat_documents/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [
            {
              id: crypto.randomUUID(),
              vector: embedding,
              payload: {
                documentId,
                sessionId,
                text: chunk,
                chunkIndex: i,
                totalChunks: chunks.length,
                fileName,
                timestamp: new Date().toISOString()
              }
            }
          ]
        })
      });
    }

    // Update status to completed
    await db
      .update(chatDocumentAttachments)
      .set({
        embedding_status: 'completed',
        qdrant_id: qdrantDocId
      })
      .where(eq(chatDocumentAttachments.document_id, documentId));

    await db
      .update(documents)
      .set({ status: 'completed' })
      .where(eq(documents.id, documentId));

    console.log(`[Document Embed] Completed ${fileName} - ${chunks.length} chunks indexed`);
  } catch (error) {
    console.error(`[Document Embed] Failed to process ${fileName}:`, error);

    // Update status to failed
    await db
      .update(chatDocumentAttachments)
      .set({ embedding_status: 'failed' })
      .where(eq(chatDocumentAttachments.document_id, documentId));

    await db
      .update(documents)
      .set({ status: 'failed' })
      .where(eq(documents.id, documentId));

    throw error;
  }
}

/**
 * Start consuming document.embed queue
 */
export async function startDocumentEmbedConsumer() {
  if (isConsuming) {
    console.log('Document embed consumer already running');
    return;
  }

  // noAck:true — consumer handles errors internally; no requeue on failure
  await rabbitmq.consume('chat.document.embed', async (message) => {
    let job: DocumentEmbedJob;
    try {
      job = JSON.parse(message.content.toString()) as DocumentEmbedJob;
    } catch {
      console.error('[Document Embed Queue] Failed to parse message');
      return;
    }
    console.log(`[Document Embed Queue] Processing ${job.fileName}...`);
    try {
      await processDocument(job);
      console.log(`[Document Embed Queue] Successfully processed ${job.fileName}`);
    } catch (error) {
      console.error(`[Document Embed Queue] Failed to process ${job.fileName}:`, error);
    }
  }, true); // noAck = true

  isConsuming = true;
  console.log('[Document Embed Queue] Consumer started successfully');
}

/**
 * Stop consuming (cleanup on shutdown)
 */
export async function stopDocumentEmbedConsumer() {
  if (!isConsuming) return;
  isConsuming = false;
  console.log('[Document Embed Queue] Consumer stopped');
}
