import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ARCHIVE_DIR = path.join(ROOT, 'src/archived/unused-2026-02-14');
const REPORT_FILE = path.join(ROOT, 'reports/archived-unused-manifest.md');

// 1. Re-run scan logic to be sure (in-memory)
// Copied from scan-all-unreachable.mjs but integrated for safety
function getAllFiles(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
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
        target = path.join(ROOT, 'src/lib');
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

function extractHeader(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n').slice(0, 10);
        const comments = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('*') || l.trim().startsWith('/*'));
        return comments.join(' ').replace(/\/\//g, '').replace(/\/\*/g, '').replace(/\*\//g, '').replace(/\*/g, '').trim().substring(0, 100);
    } catch (e) { return ''; }
}

console.log('Scanning for unreachable files...');
const allFiles = getAllFiles(path.join(ROOT, 'src'));
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

// Propagate
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

// Identify Unreachable
const unreachable = [];
for (const [file, node] of fileNodes) {
    if (!node.reachable) unreachable.push(node);
}

console.log(`Found ${unreachable.length} unreachable files.`);
if (unreachable.length === 0) {
    console.log('No files to archive.');
    process.exit(0);
}

// Prepare Manifest
let manifest = `# Archived Unused Files (Phase 93)
Date: ${new Date().toISOString()}
Total Files: ${unreachable.length}

| File | Header Summary |
|---|---|
`;

// Move Files
if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

let movedCount = 0;
for (const node of unreachable) {
    const srcPath = node.id;
    // node.relPath is like src/lib/foo.ts. We want lib/foo.ts inside archive, or src/lib/foo.ts?
    // Let's keep src/ structure inside archive to be safe: archive/src/lib/foo.ts
    // No, standard practice is relative to src usually, but 'src' prefix is safer to avoid collisions if strict structure.
    // Let's mirror full path relative to ROOT. -> archive/src/...

    // Actually, let's strip 'src/' to avoid deep nesting if possible, but keeping 'src' implies it came from src.
    // User's previous archive had 'lib/...' inside.
    // Let's use node.relPath directly.

    const destPath = path.join(ARCHIVE_DIR, node.relPath.replace(/^src\//, ''));

    const header = extractHeader(srcPath);
    manifest += `| \`${node.relPath}\` | ${header} |\n`;

    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    try {
        fs.renameSync(srcPath, destPath);
        movedCount++;
    } catch (e) {
        console.error(`Failed to move ${node.relPath}: ${e.message}`);
    }
}

fs.writeFileSync(REPORT_FILE, manifest);
console.log(`Successfully moved ${movedCount} files to ${ARCHIVE_DIR}`);
console.log(`Manifest generated at ${REPORT_FILE}`);
