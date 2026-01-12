import { Project, SyntaxKind, ImportDeclaration } from 'ts-morph';
import path from 'path';

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = Infinity; // No limit

async function main() {
    console.log(`🔧 Phase 68: Type-Import Fixer ${DRY_RUN ? '(DRY RUN)' : ''}`);

    const project = new Project({
        tsConfigFilePath: path.join(process.cwd(), 'tsconfig.json'),
        skipAddingFilesFromTsConfig: true,
    });

    // Patterns matching the error analysis
    // "ID only refers to a type, but is being used as a value here"
    const patterns = [
        'src/lib/services/**/*.ts',
        'src/lib/components/**/*.svelte', // ts-morph handles .svelte specific TS map? No, usually .ts only.
        // Let's stick to .ts
        'src/lib/**/*.ts'
    ];

    console.log(`📂 Adding files match: ${patterns}`);
    project.addSourceFilesAtPaths(patterns);

    const sourceFiles = project.getSourceFiles();
    console.log(`✓ Loaded ${sourceFiles.length} files.`);

    let fixedCount = 0;

    for (const sourceFile of sourceFiles) {
        if (fixedCount >= LIMIT) break;

        let modified = false;
        const imports = sourceFile.getImportDeclarations();

        for (const imp of imports) {
            // Check if it is "import type {...}"
            if (imp.isTypeOnly()) {
                // Check usage of named imports
                const namedImports = imp.getNamedImports();
                let needsValue = false;

                for (const named of namedImports) {
                    const nameNode = named.getNameNode();
                    const refs = nameNode.findReferencesAsNodes();

                    // analyze references
                    for (const ref of refs) {
                        // If any reference is a value usage
                        const parent = ref.getParent();
                        if (!parent) continue;

                        // Heuristic:
                        // If parent is TypeReference -> Usage is Type
                        // If parent is NewExpression -> Usage is Value
                        // If usage is just identifier in code -> Value

                        const parentKind = parent.getKind();
                        if (parentKind !== SyntaxKind.TypeReference &&
                            parentKind !== SyntaxKind.QualifiedName && // Maybe?
                            parentKind !== SyntaxKind.ImportSpecifier &&
                            parentKind !== SyntaxKind.ExportSpecifier) {

                            // It's likely a value usage
                            needsValue = true;
                            // console.log(`   Found value usage of ${nameNode.getText()} in ${parentKind}`);
                            break;
                        }
                    }
                    if (needsValue) break;
                }

                if (needsValue) {
                    // Fix: Remove 'type' keyword
                    console.log(`   [${sourceFile.getBaseName()}] Converting 'import type' found in ${imp.getText()}`);
                    if (!DRY_RUN) {
                        imp.setIsTypeOnly(false);
                        modified = true;
                    }
                }
            }
        }

        if (modified && !DRY_RUN) {
            sourceFile.saveSync();
            console.log(`✓ Fixed ${sourceFile.getBaseName()}`);
            fixedCount++;
        }
    }

    if (DRY_RUN) {
        console.log(`\n(Dry Run Complete - No files changed)`);
    } else {
        console.log(`\nFixed ${fixedCount} files.`);
    }
}

main().catch(console.error);
