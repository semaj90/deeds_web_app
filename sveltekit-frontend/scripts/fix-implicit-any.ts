import { Project, SyntaxKind } from 'ts-morph';
import path from 'path';

async function main() {
    console.log('🔄 Initializing ts-morph project for Implicit Any fixes...');

    const project = new Project({
        tsConfigFilePath: path.join(process.cwd(), 'tsconfig.json'),
        skipAddingFilesFromTsConfig: true,
    });

    // Patterns to include
    const patterns = [
        'src/lib/services/**/*.ts',
        'src/lib/utils/**/*.ts',
        'src/lib/types/**/*.ts'
    ];

    console.log(`📂 Adding files matching: ${patterns.join(', ')}`);
    project.addSourceFilesAtPaths(patterns);

    const sourceFiles = project.getSourceFiles();
    console.log(`✓ Loaded ${sourceFiles.length} files.`);

    let fixedFiles = 0;
    let totalParamsFixed = 0;

    for (const sourceFile of sourceFiles) {
        let modified = false;

        // Find all functions, methods, arrow functions
        const functions = [
            ...sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
            ...sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration),
            ...sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction),
            ...sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression)
        ];

        for (const func of functions) {
            const params = func.getParameters();
            for (const param of params) {
                // Check if parameter has type
                // 1. Has explicit type node?
                // 2. Has initializer? (Inferred type)
                // 3. Is 'this' parameter?
                // 4. Is binding pattern (destructuring)? (Harder, skip for now or type as any)

                if (!param.getTypeNode() && !param.getInitializer()) {
                     // CAUTION: Destructuring `({ a, b })` doesn't strictly have a type node on the param itself
                     // in the same way, but usually it's `({ a }: {a: string})`.
                     // If it's just `({ a })`, it is implicit any.

                     // We can try adding `: any`
                     try {
                         // Check if we can structure it safely.
                         // Only explicit named params for now `(a, b)` -> `(a: any, b: any)`
                         if (param.getNameNode().getKind() === SyntaxKind.Identifier) {
                             param.setType('any');
                             modified = true;
                             totalParamsFixed++;
                         }
                     } catch (e) {
                         // Ignore errors on complex structures
                     }
                }
            }
        }

        if (modified) {
            sourceFile.saveSync();
            process.stdout.write('.'); // Progress indicator
            fixedFiles++;
        }
    }

    console.log(`\n\n==========================================`);
    console.log(`Fixed ${totalParamsFixed} implicit 'any' parameters in ${fixedFiles} files.`);
    console.log(`==========================================`);
}

main().catch(console.error);
