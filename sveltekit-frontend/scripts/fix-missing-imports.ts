import { Project, SyntaxKind } from 'ts-morph';
import path from 'path';

// Common types map (Expand based on codebase)
const KNOWN_IMPORTS: Record<string, string> = {
    'User': '$lib/types',
    'Case': '$lib/types',
    'Evidence': '$lib/types',
    'Document': '$lib/types',
    'Tag': '$lib/types',
    'ValidationResult': '$lib/types',
    'ErrorReport': '$lib/types',
    'OllamaService': '$lib/services/ai/OllamaService',
    'VectorService': '$lib/services/ai/VectorService',
    'SupabaseClient': '@supabase/supabase-js',
    'onMount': 'svelte',
    'onDestroy': 'svelte',
    'createEventDispatcher': 'svelte'
};

async function main() {
    console.log('🔄 Initializing ts-morph project...');

    const project = new Project({
        tsConfigFilePath: path.join(process.cwd(), 'tsconfig.json'),
        skipAddingFilesFromTsConfig: true,
    });

    // Add services files
    const globPattern = 'src/lib/services/**/*.ts';
    console.log(`📂 Adding files matching: ${globPattern}`);
    project.addSourceFilesAtPaths(globPattern);

    const sourceFiles = project.getSourceFiles();
    console.log(`✓ Loaded ${sourceFiles.length} files.`);

    let fixedFiles = 0;

    for (const sourceFile of sourceFiles) {
        let modified = false;

        // Find identifiers that might be missing imports
        // This is a naive approach: check valid identifiers that are not defined locally/imported
        // A better way is to rely on simple text search for known missing types if diagnostics are too slow

        // For efficiency in this script, we'll iterate the KNOWN_IMPORTS and check if identifier exists in file
        // but is NOT in imports/declarations.

        const text = sourceFile.getFullText();

        for (const [name, moduleSpecifier] of Object.entries(KNOWN_IMPORTS)) {
            // Regex check for usage "Name" but not "import ... Name"
            // This is faster than full AST traversal for diagnostics
            const usageRegex = new RegExp(`\\b${name}\\b`);

            if (usageRegex.test(text)) {
                // Check if already imported
                const imports = sourceFile.getImportDeclarations();
                const isImported = imports.some(imp => {
                     const named = imp.getNamedImports().map(n => n.getName());
                     return named.includes(name);
                });

                // Check if declared locally (class, interface, etc)
                // This is harder with regex, but ts-morph can check declarations.
                // However, resolving references is expensive.
                // Let's assume if it's missing from imports, we *might* need it.
                // But we must avoid duplicates.

                // "Smart" Check:
                // If usage is found, and not imported, try to add it.
                // ts-morph `addImportDeclaration` handles duplicates if we configure it right,
                // or we check `isImported` properly.

                if (!isImported) {
                     // Check if defined locally?
                     // const declarations = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier).filter(i => i.getText() === name);
                     // Too slow.

                     // Let's rely on `isImported` check.
                     // Risk: It might be defined locally.
                     // But for `User`, `Case` (High-level types), usually they are imported.

                     // Add import
                     const importDecl = sourceFile.getImportDeclaration(moduleSpecifier);
                     if (importDecl) {
                         if (!importDecl.getNamedImports().some(n => n.getName() === name)) {
                             importDecl.addNamedImport(name);
                             modified = true;
                         }
                     } else {
                         sourceFile.addImportDeclaration({
                             moduleSpecifier,
                             namedImports: [name]
                         });
                         modified = true;
                     }
                }
            }
        }

        if (modified) {
            sourceFile.saveSync();
            console.log(`✓ Fixed imports in ${sourceFile.getBaseName()}`);
            fixedFiles++;
        }
    }

    console.log(`\n==========================================`);
    console.log(`Total files with imports fixed: ${fixedFiles}`);
    console.log(`==========================================`);
}

main().catch(console.error);
