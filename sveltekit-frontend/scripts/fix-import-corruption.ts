import { Project, SyntaxKind } from 'ts-morph';
import * as fs from 'fs';
import * as path from 'path';

async function fixImportCorruption() {
    const project = new Project({
        tsConfigFilePath: './tsconfig.json',
        skipAddingFilesFromTsConfig: true,
    });

    // Patterns to fix:
    // 1. import: { named } from: 'module'; -> import { named } from 'module';
    // 2. import: default from: 'module'; -> import default from 'module';

    const files = fs.readdirSync('src', { recursive: true }).filter(f => f.toString().endsWith('.ts'));

    let fixedCount = 0;

    for (const relativePath of files) {
        const filePath = path.join('src', relativePath.toString());
        let content = fs.readFileSync(filePath, 'utf8');
        let modified = false;

        // Fix: import: ... from: ...
        if (content.match(/import:\s*\{[^}]+\}\s*from:/)) {
            content = content.replace(/import:\s*(\{.+?\})\s*from:\s*(['"][^'"]+['"])/g, 'import $1 from $2');
            modified = true;
        }

        // Fix: import: default from: ...
        if (content.match(/import:\s*\w+\s*from:/)) {
             content = content.replace(/import:\s*(\w+)\s*from:\s*(['"][^'"]+['"])/g, 'import $1 from $2');
             modified = true;
        }

        if (modified) {
            fs.writeFileSync(filePath, content);
            console.log(`Fixed imports in: ${filePath}`);
            fixedCount++;
        }
    }

    console.log(`\nFixed imports in ${fixedCount} files.`);
}

fixImportCorruption().catch(console.error);
