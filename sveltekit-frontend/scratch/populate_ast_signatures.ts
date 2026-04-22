import { pool } from '../src/lib/server/db/client.js';
import { chunkFiles } from '../src/lib/server/indexer/ast-chunker.js';
import { readdir, stat } from 'fs/promises';
import { join, resolve, relative } from 'path';

const SRC_ROOT = resolve(process.cwd(), 'src');
const EXTS = new Set(['.ts', '.js', '.mts', '.svelte']);
const SKIP = new Set(['node_modules', '.svelte-kit', 'archives', 'backups']);

async function walk(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
        if (SKIP.has(ent.name)) continue;
        const res = join(dir, ent.name);
        if (ent.isDirectory()) {
            files.push(...(await walk(res)));
        } else if (EXTS.has(ent.name.slice(ent.name.lastIndexOf('.')))) {
            files.push(res);
        }
    }
    return files;
}

async function run() {
    console.log('--- Phase 1: AST Extraction & DB Population ---');
    
    // 1. Find files
    const allFiles = await walk(SRC_ROOT);
    console.log(`Found ${allFiles.length} files in src/`);

    // 2. Filter for chunkable files (ast-chunker handles .ts/.js, skips others gracefully)
    const targets = allFiles.filter(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.mts'));
    console.log(`Processing ${targets.length} TypeScript/JavaScript files...`);

    // 3. Generate chunks
    const chunks = chunkFiles(targets, SRC_ROOT);
    console.log(`Generated ${chunks.length} chunks.`);

    // 4. Clear existing signatures (incremental update would be better but let's start fresh)
    console.log('Clearing old signatures...');
    await pool.query('DELETE FROM phase89_ast_signatures');

    // 5. Insert signatures
    console.log('Inserting signatures into phase89_ast_signatures...');
    let success = 0;
    for (const chunk of chunks) {
        try {
            await pool.query(
                `INSERT INTO phase89_ast_signatures (file_path, signature, node_type, metadata) 
                 VALUES ($1, $2, $3, $4)`,
                [
                    chunk.metadata.relativePath,
                    chunk.signature,
                    chunk.metadata.kind,
                    JSON.stringify(chunk.metadata)
                ]
            );
            success++;
            if (success % 100 === 0) console.log(`  Inserted ${success}/${chunks.length}...`);
        } catch (err) {
            console.error(`  Failed on chunk: ${chunk.metadata.symbol}`, err);
        }
    }

    console.log(`✅ Success: ${success} signatures stored in DB.`);
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
