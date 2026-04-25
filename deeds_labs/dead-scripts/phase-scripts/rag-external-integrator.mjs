#!/usr/bin/env node
/**
 * Phase 72 - RAG External Integrator
 *
 * Integrates external sources (Web, Gemini, Claude) into the RAG system.
 *
 * Features:
 * - Web Crawling (Puppeteer/Cheerio)
 * - External LLM Integration (Gemini, Claude)
 * - Embedding & Indexing (Ollama -> Qdrant)
 * - Retrieval & Ranking (Cosine Similarity)
 *
 * Usage:
 *   node scripts/rag-external-integrator.mjs --crawl https://example.com
 *   node scripts/rag-external-integrator.mjs --ask "What is the latest on Svelte 5?" --use gemini
 *   node scripts/rag-external-integrator.mjs --search "Svelte 5 runes" (requires search API)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import * as cheerio from 'cheerio';
import { createHash } from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.phase72') });

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'embeddinggemma:latest';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_COLLECTION = 'phase72_external_knowledge_base';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Parse arguments
const args = process.argv.slice(2);
const crawlUrl = args.includes('--crawl') ? args[args.indexOf('--crawl') + 1] : null;
const askQuery = args.includes('--ask') ? args[args.indexOf('--ask') + 1] : null;
const useModel = args.includes('--use') ? args[args.indexOf('--use') + 1] : 'gemini';

console.log('🌐 Phase 72 - RAG External Integrator\n');

async function main() {
    await ensureCollection();

    if (crawlUrl) {
        await handleCrawl(crawlUrl);
    } else if (askQuery) {
        await handleAsk(askQuery, useModel);
    } else {
        console.log('Usage:');
        console.log('  node scripts/rag-external-integrator.mjs --crawl <url>');
        console.log('  node scripts/rag-external-integrator.mjs --ask <query> [--use gemini|claude]');
    }
}

/**
 * Ensure Qdrant collection exists
 */
async function ensureCollection() {
    try {
        const check = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`);
        if (!check.ok) {
            console.log(`🔧 Creating collection: ${QDRANT_COLLECTION}`);
            await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vectors: { size: 768, distance: 'Cosine' }
                })
            });
        }
    } catch (e) {
        console.error('❌ Qdrant connection failed:', e.message);
        process.exit(1);
    }
}

/**
 * Crawl a URL and index content
 */
async function handleCrawl(url) {
    console.log(`🕷️  Crawling: ${url}`);

    try {
        const browser = await puppeteer.launch({ headless: 'new' });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle0' });
        const content = await page.content();
        await browser.close();

        const $ = cheerio.load(content);

        // Remove scripts, styles, etc.
        $('script').remove();
        $('style').remove();
        $('nav').remove();
        $('footer').remove();

        const title = $('title').text().trim();
        const text = $('body').text().replace(/\s+/g, ' ').trim();

        console.log(`📄 Extracted: ${title} (${text.length} chars)`);

        // Chunking (simple)
        const chunks = chunkText(text, 1000);
        console.log(`🧩 Chunked into ${chunks.length} segments`);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const embedding = await generateEmbedding(chunk);

            if (embedding) {
                await insertToQdrant({
                    id: createHash('sha256').update(url + i).digest('hex').slice(0, 16),
                    vector: embedding,
                    payload: {
                        source: url,
                        title: title,
                        content: chunk,
                        type: 'web_crawl',
                        timestamp: new Date().toISOString()
                    }
                });
                process.stdout.write('.');
            }
        }
        console.log('\n✅ Indexing complete');

    } catch (e) {
        console.error('❌ Crawl failed:', e.message);
    }
}

/**
 * Ask a question using RAG + External LLM
 */
async function handleAsk(query, model) {
    console.log(`❓ Asking (${model}): ${query}`);

    // 1. Embed query
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) return;

    // 2. Retrieve context
    const searchRes = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            vector: queryEmbedding,
            limit: 5,
            with_payload: true
        })
    });

    const searchData = await searchRes.json();
    const context = searchData.result.map(r => r.payload.content).join('\n\n');

    console.log(`📚 Found ${searchData.result.length} relevant context chunks`);

    // 3. Generate answer
    const prompt = `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer based on the context:`;

    if (model === 'gemini') {
        if (!GEMINI_API_KEY) {
            console.error('❌ GEMINI_API_KEY not found in .env');
            return;
        }
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const m = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await m.generateContent(prompt);
        console.log('\n🤖 Gemini Answer:\n', result.response.text());
    } else if (model === 'claude') {
        if (!ANTHROPIC_API_KEY) {
            console.error('❌ ANTHROPIC_API_KEY not found in .env');
            return;
        }
        // Simple fetch for Claude (assuming API key is valid)
        try {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'claude-3-sonnet-20240229',
                    max_tokens: 1024,
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            const data = await res.json();
            if (data.content) {
                console.log('\n🤖 Claude Answer:\n', data.content[0].text);
            } else {
                console.error('Claude API Error:', data);
            }
        } catch (e) {
            console.error('Claude Request Failed:', e.message);
        }
    } else {
        console.log('Using local Ollama...');
        // Fallback to Ollama chat
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemma3-legal:latest',
                prompt: prompt,
                stream: false
            })
        });
        const data = await res.json();
        console.log('\n🤖 Ollama Answer:\n', data.response);
    }
}

async function generateEmbedding(text) {
    try {
        const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_EMBEDDING_MODEL,
                prompt: text
            })
        });
        const data = await res.json();
        return data.embedding;
    } catch (e) {
        console.error('Embedding failed:', e.message);
        return null;
    }
}

async function insertToQdrant(point) {
    await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: [point] })
    });
}

function chunkText(text, size) {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) {
        chunks.push(text.slice(i, i + size));
    }
    return chunks;
}

main().catch(console.error);
