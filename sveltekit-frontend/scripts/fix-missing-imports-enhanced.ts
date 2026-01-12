import { Project } from 'ts-morph';
import path from 'path';

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = Infinity;

// Expanded Map
const KNOWN_IMPORTS: Record<string, string> = {
    'stdout': 'node:process',
    'stderr': 'node:process',
    'stdin': 'node:process',
    'process': 'node:process', // Or global access, but import is safer in ESM
    'Buffer': 'node:buffer',
    'OllamaService': '$lib/services/ai/OllamaService', // Check case!
    'fs': 'node:fs',
    'path': 'node:path',
    'Readable': 'node:stream',
    'EventEmitter': 'node:events',
    'onMount': 'svelte',
    'onDestroy': 'svelte',
    'tick': 'svelte',
    'browser': '$app/environment',
    'page': '$app/stores',
    'goto': '$app/navigation'
};

async function main() {
    console.log(`🔧 Phase 68: Missing Import Fixer ${DRY_RUN ? '(DRY RUN)' : ''}`);

    const project = new Project({
        tsConfigFilePath: path.join(process.cwd(), 'tsconfig.json'),
        skipAddingFilesFromTsConfig: true,
    });

    const patterns = ['src/lib/services/**/*.ts', 'src/lib/agents/**/*.ts'];
    // project.addSourceFilesAtPaths(patterns);
    const glob = patterns[0]; // Just services for now
    project.addSourceFilesAtPaths(glob);

    const sourceFiles = project.getSourceFiles();
    console.log(`✓ Loaded ${sourceFiles.length} files.`);

    let fixedCount = 0;

    for (const sourceFile of sourceFiles) {
        if (fixedCount >= LIMIT) break;
        let modified = false;

        const text = sourceFile.getFullText();

        for (const [name, moduleSpecifier] of Object.entries(KNOWN_IMPORTS)) {
            // Check usage regex (fast)
            const regex = new RegExp(`\\b${name}\\b`);
            if (!regex.test(text)) continue;

            const imports = sourceFile.getImportDeclarations();
            const isImported = imports.some(imp => {
                const named = imp.getNamedImports().map(n => n.getName());
                return named.includes(name);
            });

            if (!isImported) {
                // Here we would ideally check if it's defined locally.
                // But for "OllamaService" or "stdout", unlikely to be local variable with same name
                // unless shadowed.

                console.log(`   [${sourceFile.getBaseName()}] Missing import for '${name}' -> '${moduleSpecifier}'`);

                if (!DRY_RUN) {
                   // Add it
                   const importDecl = sourceFile.getImportDeclaration(moduleSpecifier);
                   if (importDecl) {
                       importDecl.addNamedImport(name);
                   } else {
                       sourceFile.addImportDeclaration({
                           defaultImport: undefined,
                           moduleSpecifier,
                           namedImports: [name]
                       });
                   }
                   modified = true;
                }
            }
        }

        if (modified) {
            sourceFile.saveSync();
            console.log(`✓ Fixed ${sourceFile.getBaseName()}`);
            fixedCount++;
        }
    }

    if (DRY_RUN) {
        console.log(`\n(Dry Run Complete)`);
    } else {
        console.log(`\nFixed ${fixedCount} files.`);
    }
}

main().catch(console.error);
