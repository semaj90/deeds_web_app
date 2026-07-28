#!/usr/bin/env node
/**
 * scripts/graphify-kag-notes-missing.mjs
 *
 * Finds directories in Neo4j that have no DirectoryNote in CouchDB karpathy_wiki.
 * Generates summaries for missing directories using Gemma4 (via llama-server :8090)
 * and upserts them to CouchDB.
 *
 * Wired into daily graphify pipeline (scripts/daily-graphify.mjs).
 * Requires llama-server running on LLAMA_SERVER_URL (default :8090).
 *
 * Usage:
 *   npm run graphify:kag-notes:missing
 *   npm run graphify:kag-notes:missing:dry
 *
 * Environment:
 *   LLAMA_SERVER_URL=http://localhost:8090
 *   LLAMA_MODEL=gemma4-legal-iq4xs-direct.gguf
 *   COUCHDB_URL=http://localhost:5984
 *   COUCHDB_USER=admin (from .env)
 *   COUCHDB_PASSWORD=admin (from .env)
 *   NEO4J_URI=bolt://localhost:7687
 *   NEO4J_USER=neo4j
 *   NEO4J_PASSWORD=neo4j123 (from .env)
 */

import dotenv from 'dotenv';
import path from 'node:path';
import neo4j from 'neo4j-driver';

dotenv.config();

const NEO4J_URI  = process.env.NEO4J_URI  ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? 'neo4j123';
const COUCHDB_URL = process.env.COUCHDB_URL ?? 'http://localhost:5984';
const LLAMA_SERVER_URL = process.env.LLAMA_SERVER_URL ?? 'http://localhost:8090';
const LLAMA_MODEL = process.env.LLAMA_MODEL ?? 'gemma4-legal-iq4xs-direct.gguf';

const COUCHDB_CLEAN_URL = COUCHDB_URL.replace(/\/$/, '');
const couchdbUser = process.env.COUCHDB_USER ?? 'admin';
const couchdbPass = process.env.COUCHDB_PASSWORD ?? 'admin';
const couchAuthHeader = {
  Authorization: `Basic ${Buffer.from(`${couchdbUser}:${couchdbPass}`).toString('base64')}`
};

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function getSlug(dirPath) {
    return dirPath.replace(/[\\/]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function getRelativeDir(filePath) {
    let rel = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    if (rel.startsWith('../') || rel.startsWith('..') || path.isAbsolute(rel)) {
        return null;
    }
    const parts = rel.split('/');
    if (parts.length <= 1) {
        return 'root';
    }
    return parts.slice(0, -1).join('/');
}

// ── 1. Fetch directories from Neo4j ──────────────────────────────────────────
async function getNeo4jDirectories() {
    const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
    const session = driver.session();
    try {
        const res = await session.run(`MATCH (f:CodebaseFile) WHERE f.filePath IS NOT NULL RETURN f.filePath AS path`);
        const allFiles = res.records.map(r => r.get('path')).filter(p => typeof p === 'string');

        const dirMap = new Map();
        for (const f of allFiles) {
            const dir = getRelativeDir(f);
            if (!dir) continue;
            if (!dirMap.has(dir)) dirMap.set(dir, []);
            dirMap.get(dir).push(f);
        }
        return dirMap; // Map<dirPath, filePaths[]>
    } finally {
        await session.close();
        await driver.close();
    }
}

// ── 2. Fetch existing from CouchDB ───────────────────────────────────────────
async function getExistingCouchDbDirs() {
    const res = await fetch(`${COUCHDB_CLEAN_URL}/karpathy_wiki/_all_docs?startkey="agents:dir:"&endkey="agents:dir:\\ufff0"`, {
        headers: couchAuthHeader
    });
    if (!res.ok) {
        if (res.status === 404) return new Set();
        throw new Error(`CouchDB fetch failed: ${res.statusText}`);
    }
    const data = await res.json();
    return new Set(data.rows.map(r => r.id.replace('agents:dir:', '')));
}

// ── 3. Gemma4 Generation via llama-server ───────────────────────────────────
async function generateSummary(dir, files) {
    const prompt = `You are an expert codebase summarizer.
Analyze this directory: ${dir}
It contains these files: ${files.slice(0, 10).join(', ')}${files.length > 10 ? ' ...' : ''}
Provide a single, concise sentence describing the technical purpose of this directory. Do not use conversational filler.`;

    try {
        const res = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: LLAMA_MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 200,
                stream: false
            }),
            signal: AbortSignal.timeout(30000)
        });
        if (!res.ok) return `Directory containing ${files.length} files.`;
        const data = await res.json();
        let content = data.choices?.[0]?.message?.content?.trim();

        // Sanitize training-trace tokens (verified issue from Phase 7)
        if (content) {
          content = content
            .replace(/<end_of_turn>/g, '')
            .replace(/<start_of_turn>/g, '')
            .replace(/<\|channel>.*?<\/\|channel>/gs, '')
            .replace(/<\|.*?>.*?<\/\|.*?>/gs, '')
            .replace(/<thinking>.*?<\/thinking>/gs, '')
            .replace(/<\|endthinking>/g, '')
            .trim();
        }

        return content || `Directory containing ${files.length} files.`;
    } catch (_err) {
        return `Directory containing ${files.length} files.`;
    }
}

// ── 4. Upsert to CouchDB ─────────────────────────────────────────────────────
async function upsertDirectoryNote(dir, summary, files) {
    const slug = getSlug(dir);
    const id = `agents:dir:${slug || 'root'}`;
    // Fetch rev if exists
    let _rev;
    try {
        const res = await fetch(`${COUCHDB_CLEAN_URL}/karpathy_wiki/${encodeURIComponent(id)}`, {
            headers: couchAuthHeader
        });
        if (res.ok) {
            const data = await res.json();
            _rev = data._rev;
        }
    } catch (_err) {
        // Document doesn't exist yet, will be created
    }

    const note = {
        _id: id,
        ...( _rev ? { _rev } : {} ),
        type: 'directory',
        path: dir,
        summary: summary,
        fileCount: files.length,
        dominantTags: ['auto-generated'],
        representativeFiles: files.slice(0, 5),
        generatedAt: new Date().toISOString(),
        version: 1
    };

    const res = await fetch(`${COUCHDB_CLEAN_URL}/karpathy_wiki/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...couchAuthHeader
        },
        body: JSON.stringify(note)
    });
    if (!res.ok) throw new Error(`Failed to upsert ${id}: ${await res.text()}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    const startTime = Date.now();
    const results = {
        directoriesFound: 0,
        existingNotes: 0,
        missingCount: 0,
        generated: 0,
        failed: 0,
        failedDirs: [],
        generatedDirs: [],
        duration_ms: 0
    };

    console.log('=== Batch DirectoryNote Generation ===');
    console.log(`[cfg] dryRun=${DRY_RUN}`);
    console.log(`[cfg] llmServer=${process.env.LLAMA_SERVER_URL ?? 'http://localhost:8090'}`);
    console.log(`[cfg] model=${process.env.LLAMA_MODEL ?? 'gemma4-legal-iq4xs-direct.gguf'}`);

    console.log('\n[neo4j] Fetching codebase files...');
    let dirMap;
    try {
        dirMap = await getNeo4jDirectories();
        results.directoriesFound = dirMap.size;
    } catch (err) {
        console.warn('[neo4j] Failed to fetch directories from Neo4j (is it running?). Error:', err.message);
        dirMap = new Map();
    }

    console.log(`[neo4j] Found ${results.directoriesFound} unique directories.`);

    console.log('[couchdb] Fetching existing DirectoryNotes...');
    let existingDirs;
    try {
        existingDirs = await getExistingCouchDbDirs();
        results.existingNotes = existingDirs.size;
    } catch (err) {
        console.warn('[couchdb] Failed to fetch from CouchDB. Error:', err.message);
        existingDirs = new Set();
    }

    console.log(`[couchdb] Found ${results.existingNotes} existing DirectoryNotes.`);

    const missingDirs = Array.from(dirMap.keys()).filter(d => {
        const slug = getSlug(d);
        return !existingDirs.has(slug);
    });
    results.missingCount = missingDirs.length;
    console.log(`[diff] ${results.missingCount} directories missing notes.`);

    if (missingDirs.length === 0) {
        console.log('\n✓ All directories have notes. Nothing to do!');
        results.duration_ms = Date.now() - startTime;
        console.log(`\nResults: ${JSON.stringify(results, null, 2)}`);
        return;
    }

    if (DRY_RUN) {
        console.log('\n[dry-run] Would generate notes for:');
        for (const d of missingDirs.slice(0, 10)) {
            console.log(`  - ${d} (${dirMap.get(d).length} files)`);
        }
        if (missingDirs.length > 10) console.log(`  ... and ${missingDirs.length - 10} more.`);
        results.duration_ms = Date.now() - startTime;
        console.log(`\nResults (dry-run): ${JSON.stringify(results, null, 2)}`);
        return;
    }

    console.log(`\n[llm] Generating summaries via llama-server :8090 (${process.env.LLAMA_MODEL || 'gemma4-legal-iq4xs-direct.gguf'})...`);
    const summaryStartTime = Date.now();

    for (const dir of missingDirs) {
        process.stdout.write(`  [${results.generated + results.failed + 1}/${missingDirs.length}] ${dir} ... `);
        try {
            const files = dirMap.get(dir);
            const summary = await generateSummary(dir, files);
            await upsertDirectoryNote(dir, summary, files);
            console.log('✓ OK');
            results.generated++;
            results.generatedDirs.push({
                path: dir,
                fileCount: files.length,
                timestamp: new Date().toISOString()
            });
        } catch (err) {
            console.log(`✗ FAIL (${err.message})`);
            results.failed++;
            results.failedDirs.push({
                path: dir,
                error: err.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    results.duration_ms = Date.now() - startTime;
    const summaryDuration = ((Date.now() - summaryStartTime) / 1000).toFixed(1);

    console.log(`\n${'='.repeat(60)}`);
    console.log('GENERATION REPORT');
    console.log(`${'='.repeat(60)}`);
    console.log(`Directories found:     ${results.directoriesFound}`);
    console.log(`Existing notes:        ${results.existingNotes}`);
    console.log(`Missing notes:         ${results.missingCount}`);
    console.log(`Generated:             ${results.generated}`);
    console.log(`Failed:                ${results.failed}`);
    console.log(`Success rate:          ${((results.generated / results.missingCount) * 100).toFixed(1)}%`);
    console.log(`Summary time:          ${summaryDuration}s`);
    console.log(`Total duration:        ${(results.duration_ms / 1000).toFixed(1)}s`);

    if (results.failed > 0) {
        console.log(`\n⚠️  Failed directories:`);
        for (const failed of results.failedDirs) {
            console.log(`  - ${failed.path}: ${failed.error}`);
        }
    }

    console.log(`\n✓ Full results saved to: ${JSON.stringify(results, null, 2)}`);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
