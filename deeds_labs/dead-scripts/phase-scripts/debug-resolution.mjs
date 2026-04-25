import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');

function resolvePath(currentFile, importPath) {
    let target = importPath;

    // Handle $lib alias
    if (target.startsWith('$lib/')) {
        target = path.join(root, 'src/lib', target.substring(5));
    } else if (target === '$lib') {
        target = path.join(root, 'src/lib');
    } else if (target.startsWith('.')) {
        target = path.resolve(path.dirname(currentFile), target);
    } else {
        return null; // node_modules or unknown alias
    }

    // Try extensions
    const extensions = ['.ts', '.js', '.svelte', '/index.ts', '/index.js', '.d.ts'];
    if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;

    for (const ext of extensions) {
        if (fs.existsSync(target + ext)) return target + ext;
    }
    return null; // Could not resolve
}

// Test Case 1: error-brain/state.ts importing types
const testFile = path.join(root, 'src/lib/error-brain/state.ts');
const importPath = './types';

console.log(`Resolving '${importPath}' from '${testFile}'...`);
const res = resolvePath(testFile, importPath);
console.log(`Result: ${res}`);

// Test Case 2: $lib import
const importPath2 = '$lib/error-brain/types';
console.log(`Resolving '${importPath2}'...`);
const res2 = resolvePath(testFile, importPath2);
console.log(`Result: ${res2}`);
