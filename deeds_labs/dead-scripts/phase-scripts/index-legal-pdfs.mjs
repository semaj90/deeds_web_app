#!/usr/bin/env node
/**
 * Index Legal PDFs into Qdrant Knowledge Base
 * Processes 38 legal documents from lawpdfs/ directory
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
dotenv.config();

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'legal_documents';
const LAWPDFS_DIR = path.join(__dirname, '../../lawpdfs');

const qdrantClient = new QdrantClient({ url: QDRANT_URL });

// Direct Ollama API call for embeddings
async function generateEmbedding(text) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'nomic-embed-text:latest',
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('❌ Embedding generation failed:', error.message);
    return null;
  }
}

async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const pages = pdf2text(dataBuffer);

    // pdf2text returns an array of pages, each page is an array of strings
    let fullText = '';
    for (const page of pages) {
      fullText += page.join(' ') + '\n';
    }

    return fullText;
  } catch (error) {
    console.error(`❌ Failed to parse PDF ${filePath}:`, error.message);
    return null;
  }
}

function chunkText(text, chunkSize = 512, overlap = 50) {
  const chunks = [];
  const words = text.split(/\s+/);

  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim().length > 0) {
      chunks.push({
        content: chunk,
        startWord: i,
        endWord: Math.min(i + chunkSize, words.length)
      });
    }
  }

  return chunks;
}

async function indexPDF(filePath) {
  const fileName = path.basename(filePath, '.pdf');
  console.log(`📄 Processing: ${fileName}`);

  // Extract text
  const text = await extractTextFromPDF(filePath);
  if (!text) return 0;

  console.log(`📝 Extracted ${text.length} characters`);

  // Create chunks
  const chunks = chunkText(text);
  console.log(`✂️ Created ${chunks.length} chunks`);

  // Generate embeddings and index
  let indexedCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    try {
      // Generate embedding
      const embedding = await generateEmbedding(chunk.content);

      // Index in Qdrant
      await qdrantClient.upsert(COLLECTION_NAME, {
        points: [{
          id: `${fileName}_chunk_${i}`,
          vector: embedding,
          payload: {
            document_id: fileName,
            chunk_index: i,
            content: chunk.content,
            file_path: filePath,
            total_chunks: chunks.length,
            word_range: `${chunk.startWord}-${chunk.endWord}`
          }
        }]
      });

      indexedCount++;
    } catch (error) {
      console.error(`❌ Failed to index chunk ${i}:`, error.message);
    }
  }

  console.log(`✅ Indexed ${indexedCount}/${chunks.length} chunks for ${fileName}`);
  return indexedCount;
}

async function main() {
  console.log('🚀 Starting PDF indexing pipeline...');

  try {
    // Check Qdrant collection
    console.log('📊 Checking Qdrant collection...');
    const collections = await qdrantClient.getCollections();
    const collectionExists = collections.collections.some(c => c.name === COLLECTION_NAME);

    if (!collectionExists) {
      console.log(`❌ Collection ${COLLECTION_NAME} not found. Creating...`);

      // Create collection with proper vector dimensions
      await qdrantClient.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 768, // nomic-embed-text dimension
          distance: 'Cosine'
        }
      });

      console.log(`✅ Created collection ${COLLECTION_NAME}`);
    }

    // Get PDF files
    console.log('📂 Scanning lawpdfs directory...');
    console.log('LAWPDFS_DIR:', LAWPDFS_DIR);
    console.log('Directory exists:', fs.existsSync(LAWPDFS_DIR));

    if (!fs.existsSync(LAWPDFS_DIR)) {
      console.error(`❌ Directory not found: ${LAWPDFS_DIR}`);
      return;
    }

    const pdfFiles = fs.readdirSync(LAWPDFS_DIR)
      .filter(file => file.endsWith('.pdf'))
      .map(file => path.join(LAWPDFS_DIR, file));

    console.log(`📋 Found ${pdfFiles.length} PDF files`);
    if (pdfFiles.length > 0) {
      console.log('Sample files:', pdfFiles.slice(0, 3).map(f => path.basename(f)));
    }

    // Process each PDF
    let totalIndexed = 0;
    for (const pdfFile of pdfFiles) {
      const indexed = await indexPDF(pdfFile);
      totalIndexed += indexed;
    }

    console.log(`\n🎉 Indexing complete!`);
    console.log(`📊 Total chunks indexed: ${totalIndexed}`);
    console.log(`📚 Documents processed: ${pdfFiles.length}`);

  } catch (error) {
    console.error('❌ Indexing failed:', error);
    process.exit(1);
  }
}

main();