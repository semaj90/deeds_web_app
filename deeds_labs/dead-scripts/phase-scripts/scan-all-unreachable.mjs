import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

// Reuse logic from rank-corrupted-files.mjs but focus on ALL files
// ... (I'll import or copy-paste relevant parts) ...

// Actually, let's just make a new simple script that uses the same logic.
// Simpler: iterate all src files, check reachability, list unreachable.

function getAllFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            if (file === 'node_modules' || file === '.svelte-kit' || file === 'archived' || file.startsWith('.')) continue;
            getAllFiles(filePath, fileList);
        } else {
            if (filePath.endsWith('.ts') || filePath.endsWith('.js') || filePath.endsWith('.svelte')) {
                fileList.push(filePath);
            }
        }
    }
    return fileList;
}

function resolvePath(currentFile, importPath) {
    let target = importPath;
    if (target.startsWith('$lib/')) {
        target = path.join(ROOT, 'src/lib', target.substring(5));
    } else if (target === '$lib') {
        target = path.join(ROOT, 'src/lib'); // likely index
    } else if (target.startsWith('.')) {
        target = path.resolve(path.dirname(currentFile), target);
    } else {
        return null;
    }

    const extensions = ['.ts', '.js', '.svelte', '/index.ts', '/index.js', '.d.ts'];
    if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
    for (const ext of extensions) {
        if (fs.existsSync(target + ext)) return target + ext;
    }
    return null;
}

console.log('Scanning all files...');
const allFiles = getAllFiles(path.join(ROOT, 'src'));
console.log(`Found ${allFiles.length} source files.`);

const fileNodes = new Map();
for (const file of allFiles) {
    const relPath = path.relative(ROOT, file).replace(/\\/g, '/');
    fileNodes.set(file.replace(/\\/g, '/'), {
        id: file.replace(/\\/g, '/'),
        relPath,
        imports: [],
        reachable: false
    });
}
// Also add known roots even if not in scan (e.g. if I missed something)
// But roots should be in scan.

// Build edges
const importRegex = /(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const dynImportRegex = /import\(['"]([^'"]+)['"]\)/g;

for (const file of allFiles) {
    try {
        const content = fs.readFileSync(file, 'utf-8');
        importRegex.lastIndex = 0;
        dynImportRegex.lastIndex = 0;
        let match;

        while ((match = importRegex.exec(content)) !== null) {
            const resolved = resolvePath(file, match[1]);
            if (resolved) {
                const norm = resolved.replace(/\\/g, '/');
                if (fileNodes.has(norm)) fileNodes.get(file.replace(/\\/g, '/')).imports.push(norm);
            }
        }
        while ((match = dynImportRegex.exec(content)) !== null) {
            const resolved = resolvePath(file, match[1]);
            if (resolved) {
                const norm = resolved.replace(/\\/g, '/');
                if (fileNodes.has(norm)) fileNodes.get(file.replace(/\\/g, '/')).imports.push(norm);
            }
        }
    } catch (e) {}
}

// Mark roots
const roots = [];
for (const [file, node] of fileNodes) {
    if (node.relPath.startsWith('src/routes/') ||
        node.relPath.includes('src/hooks.') ||
        node.relPath.includes('src/app.d.ts') ||
        node.relPath.includes('src/service-worker')) {
        node.reachable = true;
        roots.push(node);
    }
}

console.log(`Identified ${roots.length} root files.`);

// Propagate reachability
const queue = [...roots];
while (queue.length > 0) {
    const node = queue.shift();
    for (const imp of node.imports) {
        if (fileNodes.has(imp)) {
            const target = fileNodes.get(imp);
            if (!target.reachable) {
                target.reachable = true;
                queue.push(target);
            }
        }
    }
}

// Stats
let reachableCount = 0;
let unreachableFiles = [];

for (const [file, node] of fileNodes) {
    if (node.reachable) reachableCount++;
    else unreachableFiles.push(node.relPath);
}

console.log(`Reachable: ${reachableCount}`);
console.log(`Unreachable: ${unreachableFiles.length}`);

// Write report
const report = `# Unreachable File Report

Total Files: ${allFiles.length}
Reachable: ${reachableCount}
Unreachable: ${unreachableFiles.length}

## Unreachable Files
${unreachableFiles.map(f => `- ${f}`).join('\n')}
`;

fs.writeFileSync(path.join(ROOT, 'reports/unreachable-files-phase93.md'), report);
console.log('Report generated at reports/unreachable-files-phase93.md');
