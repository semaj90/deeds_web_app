import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const reportPath = path.join(ROOT, 'reports/repair-priorities.md');
const ARCHIVE_DIR = path.join(ROOT, 'src/archived/corrupted-2026-02-13');

if (!fs.existsSync(reportPath)) {
    console.error('Report not found!');
    process.exit(1);
}

const content = fs.readFileSync(reportPath, 'utf-8');
const lines = content.split('\n');
const toArchive = [];

console.log('Parsing report...');

for (const line of lines) {
    if (line.includes('| ❌ No |')) {
        const match = line.match(/`([^`]+)`/);
        if (match) {
            const relPath = match[1];
            toArchive.push(relPath);
        }
    }
}

console.log(`Found ${toArchive.length} unreachable corrupted files to archive.`);

if (toArchive.length === 0) {
    console.log('No files to archive.');
    process.exit(0);
}

// Ensure archive dir
if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

let movedCount = 0;

for (const file of toArchive) {
    const srcPath = path.join(ROOT, file);
    const destPath = path.join(ARCHIVE_DIR, file.replace(/^src\//, '')); // verify strict rel path

    // Maintain subdirs
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    if (fs.existsSync(srcPath)) {
        try {
            fs.renameSync(srcPath, destPath);
            movedCount++;
            // Create a placeholder? No, let it break if used (Scream Test).
        } catch (e) {
            console.error(`Failed to move ${file}: ${e.message}`);
        }
    } else {
        console.warn(`File not found: ${file}`);
    }
}

console.log(`Successfully archived ${movedCount} files to ${ARCHIVE_DIR}`);
console.log('Run "npm run check" to verify if any live code broke.');
