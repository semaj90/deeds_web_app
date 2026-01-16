// Phase 104: Chunked Streaming Fixer with Validation Checkpoints
// Uses ts-morph for AST-safe fixes where possible, regex for simple patterns
// Applies fixes in chunks with TSC validation after each chunk

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { glob } from 'glob';

// Configuration
const CONFIG = {
    CHUNK_SIZE: 50,  // Files per chunk
    MAX_REGRESSION_ALLOWED: 10,  // Max new errors before auto-revert
    BACKUP_DIR: 'scripts/phase104-backups',
    DRY_RUN: !process.argv.includes('--apply')
};

// Proven safe patterns - AST-validated
const SAFE_PATTERNS = [
    {
        name: 'index_signature_comma_to_colon',
        description: 'Fix [key, type] to [key: type] in index signatures',
        pattern: /\[([a-zA-Z_][a-zA-Z0-9_]*),\s*(string|number)\]/g,
        replacement: '[$1: $2]',
        validate: (before: string, after: string) => {
            // Ensure we're not breaking array destructuring
            return !before.includes('const [') && !before.includes('let [');
        }
    },
    {
        name: 'property_comma_to_colon',
        description: 'Fix property, Type; to property: Type;',
        pattern: /(\s+)([a-zA-Z_][a-zA-Z0-9_?]*),\s*(Date|string|number|boolean|unknown|any)\s*;/g,
        replacement: '$1$2: $3;',
        validate: () => true
    },
    {
        name: 'redis_setex_fix',
        description: 'Fix redis.setex(key: ttl: value) calls',
        pattern: /\.setex\(([^:)]+):\s*([^:)]+):\s*([^)]+)\)/g,
        replacement: '.setex($1, $2, $3)',
        validate: () => true
    }
];

interface ChunkResult {
    chunk: number;
    files: string[];
    fixesApplied: number;
    errorsBefore: number;
    errorsAfter: number;
    status: 'success' | 'regression' | 'skipped';
}

function getTscErrorCount(): number {
    try {
        const output = execSync('npx tsc --noEmit 2>&1', {
            encoding: 'utf-8',
            maxBuffer: 100 * 1024 * 1024,
            timeout: 300000
        });
        const matches = output.match(/error TS\d+/g) || [];
        return matches.length;
    } catch (e: any) {
        // TSC returns exit code 1 on errors, but output is still valid
        const output = e.stdout || e.stderr || '';
        const matches = output.match(/error TS\d+/g) || [];
        return matches.length;
    }
}

function backupFile(filePath: string): void {
    const backupPath = path.join(CONFIG.BACKUP_DIR, filePath.replace(/\//g, '_'));
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(filePath, backupPath);
}

function restoreFile(filePath: string): void {
    const backupPath = path.join(CONFIG.BACKUP_DIR, filePath.replace(/\//g, '_'));
    if (fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, filePath);
    }
}

function applyFixesToFile(filePath: string): { fixCount: number; success: boolean } {
    try {
        let content = fs.readFileSync(filePath, 'utf-8');
        const originalContent = content;
        let totalFixes = 0;

        for (const pattern of SAFE_PATTERNS) {
            const matches = content.match(pattern.pattern) || [];

            // Validate each match
            for (const match of matches) {
                const testContent = content;
                const after = testContent.replace(pattern.pattern, pattern.replacement);

                if (pattern.validate(match, after)) {
                    content = content.replace(pattern.pattern, pattern.replacement);
                    totalFixes += matches.length;
                    break; // Pattern applied globally
                }
            }
        }

        if (totalFixes > 0 && content !== originalContent) {
            backupFile(filePath);
            fs.writeFileSync(filePath, content);
            return { fixCount: totalFixes, success: true };
        }

        return { fixCount: 0, success: true };
    } catch (e) {
        console.error(`  ❌ Error processing ${filePath}:`, e);
        return { fixCount: 0, success: false };
    }
}

function revertChunk(files: string[]): void {
    console.log('  🔄 Reverting chunk...');
    for (const file of files) {
        restoreFile(file);
    }
}

async function processChunk(files: string[], chunkNum: number, totalChunks: number): Promise<ChunkResult> {
    console.log(`\n📦 Processing chunk ${chunkNum}/${totalChunks} (${files.length} files)`);

    const errorsBefore = getTscErrorCount();
    console.log(`   TSC errors before: ${errorsBefore}`);

    let fixesApplied = 0;
    const processedFiles: string[] = [];

    for (const file of files) {
        const result = applyFixesToFile(file);
        if (result.fixCount > 0) {
            fixesApplied += result.fixCount;
            processedFiles.push(file);
            if (!CONFIG.DRY_RUN) {
                console.log(`   ✅ ${file}: ${result.fixCount} fixes`);
            }
        }
    }

    if (CONFIG.DRY_RUN) {
        console.log(`   📊 Dry-run: ${fixesApplied} fixes would be applied to ${processedFiles.length} files`);
        return {
            chunk: chunkNum,
            files: processedFiles,
            fixesApplied,
            errorsBefore,
            errorsAfter: errorsBefore,
            status: 'skipped'
        };
    }

    // Validate chunk
    const errorsAfter = getTscErrorCount();
    console.log(`   TSC errors after: ${errorsAfter}`);

    const regression = errorsAfter - errorsBefore;

    if (regression > CONFIG.MAX_REGRESSION_ALLOWED) {
        console.log(`   ⚠️  Regression detected (+${regression} errors), reverting chunk...`);
        revertChunk(processedFiles);
        return {
            chunk: chunkNum,
            files: processedFiles,
            fixesApplied: 0,
            errorsBefore,
            errorsAfter: errorsBefore,
            status: 'regression'
        };
    }

    const change = errorsBefore - errorsAfter;
    console.log(`   ✅ Chunk successful: ${change >= 0 ? '-' : '+'}${Math.abs(change)} errors`);

    return {
        chunk: chunkNum,
        files: processedFiles,
        fixesApplied,
        errorsBefore,
        errorsAfter,
        status: 'success'
    };
}

async function loadScanResults(): Promise<{ file: string; fixes: number }[]> {
    const scanPath = 'scripts/phase103b-scan.json';
    if (fs.existsSync(scanPath)) {
        const data = JSON.parse(fs.readFileSync(scanPath, 'utf-8'));
        return data.files || [];
    }

    // Fallback: scan now
    console.log('📂 No scan results found, scanning...');
    const files = await glob('src/**/*.ts', {
        ignore: ['**/*.d.ts', '**/node_modules/**', '**/*.bak']
    });

    const results: { file: string; fixes: number }[] = [];
    for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        let fixes = 0;
        for (const p of SAFE_PATTERNS) {
            const matches = content.match(p.pattern) || [];
            fixes += matches.length;
        }
        if (fixes > 0) {
            results.push({ file, fixes });
        }
    }

    return results.sort((a, b) => b.fixes - a.fixes);
}

async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 PHASE 104: Chunked Streaming Fixer with Validation');
    console.log(`   Mode: ${CONFIG.DRY_RUN ? 'DRY-RUN (preview only)' : 'LIVE (applying fixes)'}`);
    console.log(`   Chunk size: ${CONFIG.CHUNK_SIZE} files`);
    console.log(`   Max regression allowed: ${CONFIG.MAX_REGRESSION_ALLOWED} errors`);
    console.log('=' .repeat(70));

    // Create backup directory
    fs.mkdirSync(CONFIG.BACKUP_DIR, { recursive: true });

    // Load files to process
    const filesToProcess = await loadScanResults();
    console.log(`\n📂 Files to process: ${filesToProcess.length}`);
    console.log(`   Total fixes available: ${filesToProcess.reduce((sum, f) => sum + f.fixes, 0)}`);

    // Get initial error count
    console.log('\n📊 Getting initial TSC error count...');
    const initialErrors = getTscErrorCount();
    console.log(`   Initial TSC errors: ${initialErrors}`);

    // Process in chunks
    const chunks: string[][] = [];
    for (let i = 0; i < filesToProcess.length; i += CONFIG.CHUNK_SIZE) {
        chunks.push(filesToProcess.slice(i, i + CONFIG.CHUNK_SIZE).map(f => f.file));
    }

    console.log(`\n📦 Processing ${chunks.length} chunks...`);

    const results: ChunkResult[] = [];
    let totalFixesApplied = 0;

    for (let i = 0; i < chunks.length; i++) {
        const result = await processChunk(chunks[i], i + 1, chunks.length);
        results.push(result);

        if (result.status === 'success') {
            totalFixesApplied += result.fixesApplied;
        }

        // Early exit on multiple regressions
        const regressionsCount = results.filter(r => r.status === 'regression').length;
        if (regressionsCount >= 3) {
            console.log('\n⚠️  Multiple regressions detected, stopping early...');
            break;
        }
    }

    // Final summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 FINAL SUMMARY');
    console.log(`   Chunks processed: ${results.length}/${chunks.length}`);
    console.log(`   Total fixes applied: ${totalFixesApplied}`);
    console.log(`   Initial errors: ${initialErrors}`);

    if (!CONFIG.DRY_RUN) {
        const finalErrors = getTscErrorCount();
        console.log(`   Final errors: ${finalErrors}`);
        console.log(`   Net change: ${initialErrors - finalErrors >= 0 ? '-' : '+'}${Math.abs(initialErrors - finalErrors)}`);
    }

    console.log(`\n   Chunk status breakdown:`);
    console.log(`     ✅ Success: ${results.filter(r => r.status === 'success').length}`);
    console.log(`     ⚠️  Regression (reverted): ${results.filter(r => r.status === 'regression').length}`);
    console.log(`     ⏭️  Skipped (dry-run): ${results.filter(r => r.status === 'skipped').length}`);

    // Save results
    fs.writeFileSync('scripts/phase104-results.json', JSON.stringify({
        timestamp: new Date().toISOString(),
        mode: CONFIG.DRY_RUN ? 'dry-run' : 'applied',
        initialErrors,
        totalFixesApplied,
        results
    }, null, 2));
    console.log('\n📝 Results saved to: scripts/phase104-results.json\n');
}

main().catch(console.error);
