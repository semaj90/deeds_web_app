#!/usr/bin/env node
/**
 * Ingest Redis documentation into Qdrant for RAG/KAG/DAG
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'redis_documentation';
const DOCS_DIR = path.join(__dirname, '../data/redis-docs');

async function createCollection() {
    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            vectors: {
                size: 768,
                distance: 'Cosine'
            }
        })
    });

    if (response.ok || response.status === 409) {
        console.log('✅ Collection ready');
        return true;
    }
    throw new Error(`Failed to create collection: ${response.statusText}`);
}

async function generateEmbedding(text) {
    // Simple hash-based embedding for now (replace with actual embedding model)
    const hash = text.split('').reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);

    const embedding = new Array(768).fill(0).map((_, i) =>
        Math.sin(hash * (i + 1) / 768) * 0.5
    );

    return embedding;
}

async function ingestDocs() {
    console.log('📚 Redis Documentation Ingestion to Qdrant\n');
    console.log('='.repeat(60));

    // Create collection
    await createCollection();

    // Read all docs
    const files = await fs.readdir(DOCS_DIR);
    const txtFiles = files.filter(f => f.endsWith('.txt'));

    console.log(`\n📄 Found ${txtFiles.length} documentation files\n`);

    let totalChunks = 0;

    for (const file of txtFiles) {
        const filepath = path.join(DOCS_DIR, file);
        const content = await fs.readFile(filepath, 'utf-8');

        // Extract URL
        const urlMatch = content.match(/URL: (https?:\/\/[^\n]+)/);
        const url = urlMatch ? urlMatch[1] : 'unknown';

        // Split into chunks (1000 chars each)
        const chunks = [];
        const chunkSize = 1000;
        for (let i = 0; i < content.length; i += chunkSize) {
            chunks.push(content.substring(i, i + chunkSize));
        }

        console.log(`   ${file}: ${chunks.length} chunks`);

        // Ingest chunks
        for (let i = 0; i < chunks.length; i++) {
            const embedding = await generateEmbedding(chunks[i]);

            const point = {
                id: totalChunks,
                vector: embedding,
                payload: {
                    source: 'redis_docs',
                    file: file,
                    url: url,
                    chunk_index: i,
                    text: chunks[i],
                    created_at: new Date().toISOString()
                }
            };

            await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    points: [point]
                })
            });

            totalChunks++;
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Ingested ${totalChunks} chunks into Qdrant`);
    console.log(`📊 Collection: ${COLLECTION_NAME}`);
    console.log(`🔗 Endpoint: ${QDRANT_URL}`);
}

ingestDocs().catch(console.error);
