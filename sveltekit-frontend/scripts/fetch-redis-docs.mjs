#!/usr/bin/env node
/**
 * Redis Documentation Fetcher
 * Downloads Redis docs for RAG/KAG/DAG integration
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REDIS_DOCS = [
    'https://redis.io/docs/latest/develop/data-types/',
    'https://redis.io/docs/latest/develop/data-types/strings/',
    'https://redis.io/docs/latest/develop/data-types/lists/',
    'https://redis.io/docs/latest/develop/data-types/sets/',
    'https://redis.io/docs/latest/develop/data-types/sorted-sets/',
    'https://redis.io/docs/latest/develop/data-types/hashes/',
    'https://redis.io/docs/latest/develop/data-types/streams/',
    'https://redis.io/docs/latest/develop/data-types/json/',
    'https://redis.io/docs/latest/develop/interact/programmability/',
    'https://redis.io/docs/latest/develop/interact/search-and-query/',
    'https://redis.io/docs/latest/develop/clients/nodejs/',
    'https://redis.io/docs/latest/commands/',
    'https://redis.io/docs/latest/operate/oss_and_stack/stack-with-enterprise/'
];

async function fetchDoc(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const html = await response.text();

        // Extract text content (simple HTML stripping)
        const text = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        return { url, text, success: true };
    } catch (error) {
        console.error(`❌ Failed to fetch ${url}: ${error.message}`);
        return { url, error: error.message, success: false };
    }
}

async function main() {
    console.log('📚 Redis Documentation Fetcher\n');
    console.log('='.repeat(60));
    console.log(`Fetching ${REDIS_DOCS.length} Redis documentation pages...\n`);

    const outputDir = path.join(__dirname, '../data/redis-docs');
    await fs.mkdir(outputDir, { recursive: true });

    const results = [];
    let successCount = 0;

    for (let i = 0; i < REDIS_DOCS.length; i++) {
        const url = REDIS_DOCS[i];
        console.log(`[${i + 1}/${REDIS_DOCS.length}] Fetching: ${url}`);

        const result = await fetchDoc(url);
        results.push(result);

        if (result.success) {
            // Save individual doc
            const filename = url.split('/').filter(Boolean).slice(-2).join('_') + '.txt';
            const filepath = path.join(outputDir, filename);
            await fs.writeFile(filepath, `URL: ${url}\n\n${result.text}`, 'utf-8');
            console.log(`   ✅ Saved to ${filename}`);
            successCount++;
        }

        // Rate limit
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Save combined doc
    const combined = results
        .filter(r => r.success)
        .map(r => `${'='.repeat(80)}\nURL: ${r.url}\n${'='.repeat(80)}\n\n${r.text}\n\n`)
        .join('\n');

    await fs.writeFile(
        path.join(outputDir, 'redis-combined.txt'),
        combined,
        'utf-8'
    );

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Results: ${successCount}/${REDIS_DOCS.length} pages fetched`);
    console.log(`📁 Saved to: ${outputDir}`);
    console.log('✅ Ready for RAG/KAG/DAG integration');
}

main().catch(console.error);
