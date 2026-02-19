import { Project, SyntaxKind, Node } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';

interface Diagnostic {
    code: number;
    message: string;
    file: string;
    line: number;
    character: number;
    category: string;
}

function applyFixes(diagnosticsFilePath: string) {
    if (!fs.existsSync(diagnosticsFilePath)) {
        console.log(`Diagnostics file not found: ${diagnosticsFilePath}`);
        return;
    }

    const diagnosticsRaw = fs.readFileSync(diagnosticsFilePath, 'utf-8');
    let diagnostics: Diagnostic[] = [];
    try {
        diagnostics = JSON.parse(diagnosticsRaw);
    } catch (e) {
        console.error(`Failed to parse diagnostics file: ${e}`);
        return;
    }

    const project = new Project({
        tsConfigFilePath: path.resolve('sveltekit-frontend/tsconfig.json'),
        skipAddingFilesFromTsConfig: true,
    });

    const filesToProcess = new Set(diagnostics.map(d => path.resolve(d.file)));
    filesToProcess.forEach(filePath => {
        if (fs.existsSync(filePath)) {
            project.addSourceFileAtPath(filePath);
        } else {
            console.warn(`Source file not found for diagnostic: ${filePath}`);
        }
    });

    let fixesApplied = 0;

    for (const diagnostic of diagnostics) {
        const sourceFile = project.getSourceFile(path.resolve(diagnostic.file));
        if (!sourceFile) {
            continue;
        }

        // Adjust line and character to be 0-indexed for ts-morph
        const start = sourceFile.getPositionOfLineAndCharacter(diagnostic.line - 1, diagnostic.character - 1);
        // ...existing code...
        // use getDescendantAtPos which accepts a numeric position
        const node = sourceFile.getDescendantAtPos(start);

        if (!node) {
            console.warn(`Could not find node at line ${diagnostic.line}, character ${diagnostic.character} in ${diagnostic.file}`);
            continue;
        }

        // Enum literal mismatches (example: "LOW" | "HIGH" | "MODERATE")
        // This is a simplified example. A real implementation would need more robust parsing of the diagnostic message
        // to extract the expected enum values and the actual incorrect value.
        if (diagnostic.message.includes('type "LOW" | "HIGH" | "MODERATE"') && node.getKind() === SyntaxKind.StringLiteral) {
            const stringLiteral = node.asKindOrThrow(SyntaxKind.StringLiteral);
            const currentValue = stringLiteral.getLiteralValue();

            // This is a placeholder for actual logic to determine the correct enum value.
            // In a real scenario, you'd parse the message to find the suggested values
            // and potentially map the incorrect value to a correct one.
            // For demonstration, let's assume we want to change "LOW" to "HIGH" if it's a mismatch.
            if (currentValue === "LOW" && diagnostic.message.includes('is not assignable to type')) {
                stringLiteral.replaceWithText('"HIGH"');
                fixesApplied++;
                console.log(`Fixed enum mismatch in ${diagnostic.file}:${diagnostic.line}. Changed "${currentValue}" to "HIGH".`);
            }
            // Add more specific logic here based on actual diagnostic messages and desired fixes
        }
        // Add logic for other types of fixes here (missing named exports, unknown -> string casting)
    }

    if (fixesApplied > 0) {
        console.log(`Applying ${fixesApplied} fixes...`);
        project.saveSync();
        console.log('Fixes applied and files saved.');
    } else {
        console.log('No fixes applied.');
    }
}

// Main execution
// Expecting the path as the third argument (index 2)
const diagnosticsFilePath = process.argv[2];
if (!diagnosticsFilePath || typeof diagnosticsFilePath !== 'string') {
    console.error('Usage: ts-node scripts/auto-fix-enums.ts <path-to-svelte5-diagnostics.json>');
    process.exit(1);
}

applyFixes(diagnosticsFilePath);