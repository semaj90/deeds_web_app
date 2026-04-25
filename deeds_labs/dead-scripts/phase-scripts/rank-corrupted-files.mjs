import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const batchPath = path.join(ROOT, 'reports/corruption-batch.json');
const outPath = path.join(ROOT, 'reports/repair-priorities.md');

if (!fs.existsSync(batchPath)) {
    console.error('Batch file not found');
    process.exit(1);
}

const batch = JSON.parse(fs.readFileSync(batchPath, 'utf-8'));
const corruptedFiles = new Set(batch.track1Files.map(f => f.file.replace(/\\/g, '/')));

console.log(`Analyzing ${corruptedFiles.size} corrupted files for impact...`);

// 1. Build Full Dependency Graph
const fileNodes = new Map(); // AbsolutePath -> { imports: [], reachable: false }
const allFiles = [];

// Helper: Resolve import path to absolute file path
function resolvePath(currentFile, importPath) {
    let target = importPath;

    // Handle $lib alias
    if (target.startsWith('$lib/')) {
        target = path.join(ROOT, 'src/lib', target.substring(5));
    } else if (target === '$lib') {
        target = path.join(ROOT, 'src/lib');
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

// scan all files
function scanAllFiles(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== '.svelte-kit' && !entry.name.startsWith('.')) {
                scanAllFiles(fullPath);
            }
        } else if (entry.isFile() && /\.(ts|svelte|js)$/.test(entry.name)) {
            // Normalize path
            const normPath = fullPath.replace(/\\/g, '/'); // simple norm
            allFiles.push(normPath);
            fileNodes.set(normPath, { imports: [], reachable: false });
        }
    }
}

console.log('Building dependency graph...');
scanAllFiles(path.join(ROOT, 'src'));

// Build edges
const importRegex = /(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const dynImportRegex = /import\(['"]([^'"]+)['"]\)/g;

for (const file of allFiles) {
    try {
        const content = fs.readFileSync(file, 'utf-8');
        // Reset regex state per file
        importRegex.lastIndex = 0;
        dynImportRegex.lastIndex = 0;
        let match;

        // Standard static imports/exports
        while ((match = importRegex.exec(content)) !== null) {
            const resolved = resolvePath(file, match[1]);
            if (resolved) {
                const normResolved = resolved.replace(/\\/g, '/');
                if (fileNodes.has(normResolved)) {
                    fileNodes.get(file).imports.push(normResolved);
                }
            }
        }

        // Dynamic imports
        while ((match = dynImportRegex.exec(content)) !== null) {
             const resolved = resolvePath(file, match[1]);
             if (resolved) {
                const normResolved = resolved.replace(/\\/g, '/');
                 if (fileNodes.has(normResolved)) {
                    fileNodes.get(file).imports.push(normResolved);
                }
             }
        }
    } catch (e) {}
}

// Mark Roots and Traverse
const roots = allFiles.filter(f =>
    f.includes('/routes/') ||
    f.includes('/hooks.') ||
    f.includes('service-worker') ||
    f.includes('app.d.ts')
);

const queue = [...roots];
roots.forEach(r => {
    if (fileNodes.has(r)) fileNodes.get(r).reachable = true;
});

let visitedCount = 0;
while (queue.length > 0) {
    const curr = queue.shift();
    visitedCount++;
    const node = fileNodes.get(curr);
    if (!node) continue;

    for (const imp of node.imports) {
        const child = fileNodes.get(imp);
        if (child && !child.reachable) {
            child.reachable = true;
            queue.push(imp);
        }
    }
}

console.log(`Reachability analysis: ${visitedCount}/${allFiles.length} files are reachable from roots.`);

// 2. Rank Corrupted Files
const ranked = [];
for (const file of corruptedFiles) {
    let summary = '';
    // ... header extraction (keep existing logic) ...
    if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf-8');
        const header = content.substring(0, 1000);
        const commentMatches = header.match(/(\/\*\*[\s\S]*?\*\/|\/\*[\s\S]*?\*\/|\/\/.*)/g);
        if (commentMatches) {
            summary = commentMatches.slice(0, 3).map(c => c.replace(/\/\*\*|\*\/|\/\/|\*/g, '').trim()).join('; ').substring(0, 80);
        }
    }

    // Check reachability
    // Need full path match. corruptedFiles are relative?
    // corruptedFiles from JSON are relative "src/..." (replace \\ /)
    const absPath = path.join(ROOT, file).replace(/\\/g, '/');
    const isReachable = fileNodes.has(absPath) ? fileNodes.get(absPath).reachable : false;

    // Usage count (incoming edges in graph)
    // We can count incoming edges from graph
    let incoming = 0;
    for (const [f, node] of fileNodes) {
        if (node.imports.includes(absPath)) incoming++;
    }

    ranked.push({
        file: file,
        usage: incoming,
        reachable: isReachable,
        type: file.split('/').slice(0, 3).join('/'),
        summary: summary || '(No header)'
    });
}

// Sort by Usage DESC, then Path
ranked.sort((a, b) => b.usage - a.usage || a.file.localeCompare(b.file));

// 3. Generate Report
let md = '# 🚑 Corrupted File Repair Priorities - Enhanced\n\n';
md += `Taking into account ${corruptedFiles.size} corrupted files.\n`;
md += 'Ranked by estimated usage (imports found in codebase). Includes reachability analysis.\n\n';
md += '| Priority | Reachable | Usage | File | Category | Header Summary |\n';
md += '|---|---|---|---|---|---|---|---|\n';

ranked.forEach((item, index) => {
    const priority = index < 50 ? '🔴 High' : (index < 200 ? '🟠 Med' : '⚪ Low');
    const reachable = item.reachable ? '✅ Yes' : '❌ No';
    md += `| ${priority} | ${reachable} | ${item.usage} | \`${item.file}\` | ${item.type} | ${item.summary} |\n`;
});

fs.writeFileSync(outPath, md);
console.log(`Generated prioritization report at ${outPath}`);
