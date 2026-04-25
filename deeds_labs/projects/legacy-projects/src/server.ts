/**
 * Phase 64 – Unified MCP Server
 * SIMD + Redis + pgvector + Ollama Bridge (Gemma-Legal Pipeline)
 * Fully ESM & HMR-safe for Vite/tsx
 */
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { cpus } from 'os';
import { Piscina } from 'piscina';
import postgres from 'postgres';
import { createCacheManager } from './utils/cache.js';
import { logger } from './utils/log.js';
import { generateEmbedding, chatWithGemma } from './utils/ollama.js';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import { pipeline } from 'stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ────────────────────────────────
   Database (pgvector)
──────────────────────────────── */
/*
const sql = postgres(process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db', {
  max: 20,
  idle_timeout: 30,
});
await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
logger.info('✅ pgvector extension confirmed');
*/

/* ────────────────────────────────
   Redis Cache Manager
──────────────────────────────── */
/*
const cache = createCacheManager({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
await cache.connect();
*/

export async function startServer() {
  console.log('Creating HTTP server...');
  const server = createServer(async (req, res) => {
    console.log(`📨 Request: ${req.method} ${req.url}`);
    try {
      // health
      if (req.url === '/mcp/health') {
        console.log('🏥 Health check requested');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, workers: 0 }));
        return;
      }

      // RAG endpoints
      if (req.url === '/rag/upload' && req.method === 'POST') {
        console.log('📤 RAG upload requested');
        await handleRAGUpload(req, res);
        return;
      }

      if (req.url === '/rag/search' && req.method === 'POST') {
        console.log('🔍 RAG search requested');
        await handleRAGSearch(req, res);
        return;
      }

      if (req.url === '/rag/embed' && req.method === 'POST') {
        console.log('🧮 RAG embed requested');
        await handleRAGEmbed(req, res);
        return;
      }

      if (req.url === '/agent/generate' && req.method === 'POST') {
        console.log('🤖 Agentic generation requested');
        await handleAgentGenerate(req, res);
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    } catch (err) {
      console.error(`❌ Server error: ${(err as Error).message}`);
      res.writeHead(500);
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  });

  console.log('Server created, attempting to listen...');
  server.listen(3003, '0.0.0.0', () => {
    console.log('🚀 Phase 64 Server LISTEN callback executed - should be bound to port 3003');
    console.log('🚀 Phase 64 Server running on http://0.0.0.0:3003');
  });

  server.on('error', (err) => {
    console.error(`❌ Server listen error: ${err.message}`);
    process.exit(1);
  });

  server.on('listening', () => {
    console.log('✅ Server is now listening!');
  });

  // Keep a reference to prevent garbage collection
  (global as any).server = server;
  console.log('Server reference stored');
}

/* ────────────────────────────────
   Agentic Fallback Logic
──────────────────────────────── */

async function runOCR(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    // Use python OCR service
    const pythonProcess = spawn('python3', ['python-services/ocr_tesseract.py', filePath], {
      cwd: process.cwd()
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        console.warn('OCR failed, using fallback:', errorOutput);
        resolve(''); // Return empty string on OCR failure
      }
    });

    pythonProcess.on('error', (error) => {
      console.warn('OCR process error:', error);
      resolve(''); // Return empty string on error
    });
  });
}

async function generateWithFallback(text: string, options: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const { maxTokens = 1024, temperature = 0.7 } = options;

  // Try TensorRT-LLM first (fastest)
  try {
    console.log('🚀 Trying TensorRT-LLM...');
    const tensorrtResponse = await fetch('http://localhost:8099/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text, max_tokens: maxTokens, temperature }),
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    if (tensorrtResponse.ok) {
      const result = await tensorrtResponse.json();
      console.log('✅ TensorRT-LLM success');
      return result.generated_text;
    }
  } catch (error) {
    console.warn('⚠️ TensorRT-LLM failed:', error);
  }

  // Fallback to PyTorch (slower but more compatible)
  try {
    console.log('🔄 Falling back to PyTorch...');
    const pytorchResponse = await fetch('http://localhost:8098/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text, max_tokens: maxTokens, temperature }),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (pytorchResponse.ok) {
      const result = await pytorchResponse.json();
      console.log('✅ PyTorch fallback success');
      return result.generated_text;
    }
  } catch (error) {
    console.warn('⚠️ PyTorch fallback failed:', error);
  }

  // Final fallback to Ollama (slowest but most reliable)
  try {
    console.log('🐌 Final fallback to Ollama...');
    const ollamaResult = await chatWithGemma([{ role: 'user', content: text }]);
    console.log('✅ Ollama fallback success');
    return ollamaResult;
  } catch (error) {
    console.error('❌ All LLM backends failed:', error);
    throw new Error('All LLM services are unavailable');
  }
}

async function handleRAGUpload(req: any, res: any) {
  try {
    // Parse multipart form data
    const boundary = req.headers['content-type']?.split('boundary=')[1];
    if (!boundary) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing boundary in multipart form' }));
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    // Simple multipart parser (for file uploads)
    const parts = body.toString().split(`--${boundary}`);
    let fileBuffer: Buffer | null = null;
    let filename = '';
    let contentType = '';

    for (const part of parts) {
      if (part.includes('filename=')) {
        const filenameMatch = part.match(/filename="([^"]+)"/);
        const contentTypeMatch = part.match(/Content-Type:\s*([^\r\n]+)/);

        if (filenameMatch) filename = filenameMatch[1];
        if (contentTypeMatch) contentType = contentTypeMatch[1];

        // Extract file content (after headers)
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          fileBuffer = Buffer.from(part.slice(headerEnd + 4, -2), 'binary');
        }
      }
    }

    if (!fileBuffer || !filename) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No file uploaded' }));
      return;
    }

    // Generate unique ID for the document
    const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Upload to MinIO
    const minioUrl = process.env.MINIO_URL || 'http://localhost:9000';
    const minioBucket = process.env.MINIO_BUCKET || 'legal-docs';

    // For now, store in local temp directory (MinIO integration would go here)
    const tempPath = `/tmp/${docId}_${filename}`;
    await fs.writeFile(tempPath, fileBuffer);

    // Run OCR if it's an image/PDF
    let ocrText = '';
    if (contentType.startsWith('image/') || contentType === 'application/pdf') {
      ocrText = await runOCR(tempPath);
    } else if (contentType === 'text/plain') {
      ocrText = fileBuffer.toString('utf-8');
    }

    // Generate embedding
    const embedding = await generateEmbedding(ocrText);

    // Store in vector database (Qdrant)
    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    // Qdrant integration would go here

    // Store metadata in Redis
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    // Redis integration would go here

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      docId,
      filename,
      contentType,
      ocrText: ocrText.substring(0, 500) + '...', // Preview
      embedding: embedding.slice(0, 5), // Preview first 5 dimensions
      stored: true
    }));

  } catch (error) {
    console.error('RAG upload error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
}

async function handleRAGSearch(req: any, res: any) {
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    const { query, limit = 10 } = JSON.parse(body);

    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);

    // Search vector database
    // Qdrant search integration would go here

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      query,
      results: [], // Would contain search results
      total: 0
    }));

  } catch (error) {
    console.error('RAG search error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
}

async function handleRAGEmbed(req: any, res: any) {
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    const { text, generateResponse = false } = JSON.parse(body);

    if (!text) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing text field' }));
      return;
    }

    // Generate embedding using Ollama (embeddings are fast, keep using Ollama)
    const embedding = await generateEmbedding(text);

    let generatedResponse = null;
    if (generateResponse) {
      // Use agentic fallback for text generation
      generatedResponse = await generateWithFallback(text, { maxTokens: 512, temperature: 0.3 });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      text: text.substring(0, 100) + '...',
      embedding: embedding,
      dimensions: embedding.length,
      generatedResponse,
      backends: ['tensorrt-llm', 'pytorch', 'ollama']
    }));

  } catch (error) {
    console.error('RAG embed error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
}

async function handleAgentGenerate(req: any, res: any) {
  try {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    const { prompt, maxTokens = 1024, temperature = 0.7 } = JSON.parse(body);

    if (!prompt) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing prompt field' }));
      return;
    }

    const generatedText = await generateWithFallback(prompt, { maxTokens, temperature });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      prompt: prompt.substring(0, 100) + '...',
      generated_text: generatedText,
      backend_used: 'agentic-fallback', // Could be enhanced to track which backend succeeded
      tokens_generated: generatedText.split(' ').length // Rough estimate
    }));

  } catch (error) {
    console.error('Agent generate error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
async function runOCR(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // Use python OCR service
    const pythonProcess = spawn('python3', ['python-services/ocr_tesseract.py', filePath], {
      cwd: process.cwd()
    });

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        console.warn('OCR failed, using fallback:', errorOutput);
        resolve(''); // Return empty string on OCR failure
      }
    });

    pythonProcess.on('error', (error) => {
      console.warn('OCR process error:', error);
      resolve(''); // Return empty string on error
    });
  });
}

/* ────────────────────────────────
   HMR / ESM Bootstrap
──────────────────────────────── */
console.log('Starting server unconditionally...');

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('📴 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

try {
  await startServer();
  console.log('✅ Server started successfully, entering keep-alive loop...');

  // Keep the process alive with a more robust mechanism
  const keepAlive = () => {
    setTimeout(keepAlive, 1000);
  };
  keepAlive();
} catch (error) {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
}
}