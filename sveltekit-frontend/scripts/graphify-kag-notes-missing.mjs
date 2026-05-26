#!/usr/bin/env node
/**
 * scripts/graphify-kag-notes-missing.mjs
 *
 * Finds directories in Neo4j that have no DirectoryNote in CouchDB karpathy_wiki.
 * Generates a summary for missing directories using Gemma4 and upserts them.
 *
 * Usage:
 *   npm run graphify:kag-notes:missing
 *   npm run graphify:kag-notes:missing:dry
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import neo4j from 'neo4j-driver';

dotenv.config();

const NEO4J_URI  = process.env.NEO4J_URI  ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? 'neo4j123';
const COUCHDB_URL = process.env.COUCHDB_URL ?? 'http://admin:deeds123@localhost:5984';
const OLLAMA_URL  = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const MODEL       = 'gemma4-rotorquant:latest';

const couchUrlParsed = new URL(COUCHDB_URL);
const couchAuthHeader = couchUrlParsed.username
    ? { Authorization: `Basic ${Buffer.from(`${decodeURIComponent(couchUrlParsed.username)}:${decodeURIComponent(couchUrlParsed.password)}`).toString('base64')}` }
    : {};
couchUrlParsed.username = '';
couchUrlParsed.password = '';
const COUCHDB_CLEAN_URL = couchUrlParsed.toString().replace(/\/$/, '');

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

// ── 3. Gemma4 Generation ─────────────────────────────────────────────────────
async function generateSummary(dir, files) {
    const prompt = `You are an expert codebase summarizer.
Analyze this directory: ${dir}
It contains these files: ${files.slice(0, 10).join(', ')}${files.length > 10 ? ' ...' : ''}
Provide a single, concise sentence describing the technical purpose of this directory. Do not use conversational filler.`;

    try {
        const res = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: MODEL, prompt, stream: false })
        });
        if (!res.ok) return `Directory containing ${files.length} files.`;
        const data = await res.json();
        return data.response.trim();
    } catch (e) {
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
    } catch (e) {}

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
    console.log('=== Batch DirectoryNote Generation ===');
    console.log(`[cfg] dryRun=${DRY_RUN}`);

    console.log('[neo4j] Fetching codebase files...');
    let dirMap;
    try {
        dirMap = await getNeo4jDirectories();
    } catch (err) {
        console.warn('[neo4j] Failed to fetch directories from Neo4j (is it running?). Error:', err.message);
        dirMap = new Map();
    }

    console.log(`[neo4j] Found ${dirMap.size} unique directories.`);

    console.log('[couchdb] Fetching existing DirectoryNotes...');
    let existingDirs;
    try {
        existingDirs = await getExistingCouchDbDirs();
    } catch (err) {
        console.warn('[couchdb] Failed to fetch from CouchDB. Error:', err.message);
        existingDirs = new Set();
    }

    console.log(`[couchdb] Found ${existingDirs.size} existing DirectoryNotes.`);

    const missingDirs = Array.from(dirMap.keys()).filter(d => {
        const slug = getSlug(d);
        return !existingDirs.has(slug);
    });
    console.log(`[diff] ${missingDirs.length} directories missing notes.`);

    if (missingDirs.length === 0) {
        console.log('Nothing to do!');
        return;
    }

    if (DRY_RUN) {
        console.log('\n[dry-run] Would generate notes for:');
        for (const d of missingDirs.slice(0, 10)) {
            console.log(`  - ${d} (${dirMap.get(d).length} files)`);
        }
        if (missingDirs.length > 10) console.log(`  ... and ${missingDirs.length - 10} more.`);
        return;
    }

    console.log(`\n[llm] Generating summaries via ${MODEL}...`);
    let generated = 0;
    let failed = 0;

    for (const dir of missingDirs) {
        process.stdout.write(`  [${generated+1}/${missingDirs.length}] ${dir} ... `);
        try {
            const files = dirMap.get(dir);
            const summary = await generateSummary(dir, files);
            await upsertDirectoryNote(dir, summary, files);
            console.log('OK');
            generated++;
        } catch (e) {
            console.log(`FAIL (${e.message})`);
            failed++;
        }
    }

    console.log(`\n=== Done ===`);
    console.log(`Generated: ${generated}`);
    console.log(`Failed:    ${failed}`);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
