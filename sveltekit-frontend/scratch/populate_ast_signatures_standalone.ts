import pg from 'pg';
import dotenv from 'dotenv';
import { Project, SyntaxKind } from 'ts-morph';
import { readdir, readFile } from 'fs/promises';
import { join, resolve, relative, basename } from 'path';

dotenv.config();

// Force 5434 as requested
const DATABASE_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const SRC_ROOT = resolve(process.cwd(), 'src');
const EXTS = new Set(['.ts', '.js', '.mts']);
const SKIP = new Set(['node_modules', '.svelte-kit', 'archives', 'backups']);

const pool = new pg.Pool({ connectionString: DATABASE_URL });

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

function buildSignature(symbol: string, node: any, filePath: string): string {
    const kind = node.getKindName();
    const isExported = node.isExported?.() ?? false;
    return `${isExported ? 'export ' : ''}${kind.toLowerCase()} ${symbol} in ${filePath}`;
}

async function run() {
    console.log('\n  Phase 89 — Standalone AST Ingestion');
    console.log(`  Target: ${SRC_ROOT}`);
    console.log(`  DB: ${DATABASE_URL.split('@')[1]}\n`);

    const project = new Project();
    const files = await walk(SRC_ROOT);
    console.log(`  📄 Found ${files.length} candidate files`);

    console.log('  🧹 Clearing phase89_ast_signatures...');
    await pool.query('DELETE FROM phase89_ast_signatures');

    let totalSignatures = 0;

    for (const f of files) {
        try {
            const relPath = relative(process.cwd(), f).replace(/\\/g, '/');
            const sourceFile = project.addSourceFileAtPath(f);
            
            const signatures: Array<{symbol: string, signature: string, kind: string}> = [];

            // Extract Functions
            sourceFile.getFunctions().forEach(fn => {
                const name = fn.getName() || 'anonymous';
                signatures.push({
                    symbol: name,
                    signature: buildSignature(name, fn, relPath),
                    kind: 'function'
                });
            });

            // Extract Classes
            sourceFile.getClasses().forEach(cls => {
                const name = cls.getName() || 'AnonymousClass';
                signatures.push({
                    symbol: name,
                    signature: buildSignature(name, cls, relPath),
                    kind: 'class'
                });
            });

            // Extract Exported Consts (simple approach)
            sourceFile.getVariableStatements().forEach(vs => {
                if (vs.isExported()) {
                    vs.getDeclarations().forEach(decl => {
                        const name = decl.getName();
                        signatures.push({
                            symbol: name,
                            signature: `export const ${name} in ${relPath}`,
                            kind: 'const'
                        });
                    });
                }
            });

            for (const sig of signatures) {
                await pool.query(
                    `INSERT INTO phase89_ast_signatures (file_path, signature, node_type, metadata) 
                     VALUES ($1, $2, $3, $4)`,
                    [relPath, sig.signature, sig.kind, JSON.stringify({ symbol: sig.symbol })]
                );
                totalSignatures++;
            }

            project.removeSourceFile(sourceFile);
            if (totalSignatures % 50 === 0 && totalSignatures > 0) {
                process.stdout.write(`\r  Progress: ${totalSignatures} signatures stored...`);
            }
        } catch (err) {
            // Skip files that fail to parse
        }
    }

    console.log(`\n\n  ✅ Success: ${totalSignatures} signatures stored in DB.`);
    await pool.end();
}

run().catch(console.error);
