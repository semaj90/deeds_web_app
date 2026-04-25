import { exec } from 'child_process';
import * as dotenv from 'dotenv';
import Nano from 'nano';
import { promisify } from 'util';

dotenv.config();

const execAsync = promisify(exec);

// Configuration
const COUCHDB_URL = process.env.COUCHDB_URL || 'http://admin:password@localhost:5984';
const DB_NAME = 'project-knowledge-base';

async function main() {
    console.log('🔍 Starting Agentic Audit...');

    // 1. Connect to CouchDB
    const nano = Nano(COUCHDB_URL);
    let db;
    try {
        await nano.db.create(DB_NAME);
        console.log(`✅ Created database: ${DB_NAME}`);
    } catch (e) {
        if (e.statusCode !== 412) { // 412 = Precondition Failed (DB already exists)
            console.error('❌ Failed to connect/create DB:', e.message);
        }
    }
    db = nano.use(DB_NAME);
    console.log(`✅ Connected to database: ${DB_NAME}`);

    // 2. Run svelte-check
    console.log('running svelte-check...');
    let stdout = '';
    try {
        // Increase maxBuffer to handle large output
        const result = await execAsync('npx svelte-check', { maxBuffer: 1024 * 1024 * 10 });
        stdout = result.stdout;
    } catch (e) {
        stdout = e.stdout || '';
    }

    // 3. Parse Output
    const errors = [];
    const lines = stdout.split('\n');

    // Regex for standard output:
    // src/lib/stores/user.svelte.ts:10:23: Error: Cannot find name 'foo'. (ts)
    const regex = /^(.+?):(\d+):(\d+): (\w+): (.+) \((.+)\)$/;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const match = trimmed.match(regex);
        if (match) {
            errors.push({
                file: match[1],
                line: parseInt(match[2]),
                column: parseInt(match[3]),
                severity: match[4].toLowerCase(),
                message: match[5],
                code: match[6],
                timestamp: new Date().toISOString(),
                type: 'ast_error',
                _id: `error:${match[1]}:${match[2]}:${match[3]}`.replace(/[\/\\]/g, '_') // Sanitize ID
            });
        }
    }

    console.log(`Found ${errors.length} errors.`);

    // 4. Sync to CouchDB
    let newCount = 0;
    let updatedCount = 0;

    for (const error of errors) {
        try {
            try {
                const existing = await db.get(error._id);
                // Only update if content changed (ignoring timestamp)
                if (existing.message !== error.message || existing.line !== error.line) {
                     await db.insert({ ...existing, ...error, _rev: existing._rev });
                     updatedCount++;
                }
            } catch (e) {
                if (e.statusCode === 404) {
                    await db.insert(error);
                    newCount++;
                } else {
                    console.error(`Error checking ${error._id}:`, e.message);
                }
            }
        } catch (e) {
            console.error(`Failed to sync error ${error._id}:`, e.message);
        }
    }

    console.log(`✅ Sync Complete: ${newCount} new, ${updatedCount} updated.`);
}

main().catch(console.error);
