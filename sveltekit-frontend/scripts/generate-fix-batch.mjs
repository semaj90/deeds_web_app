import fs from 'fs';
import path from 'path';

const logPath = 'reports/ast-corruption.log';
const outPath = 'reports/corruption-batch.json';

if (!fs.existsSync(logPath)) {
    console.error(`Log file not found: ${logPath}`);
    process.exit(1);
}

const content = fs.readFileSync(logPath, 'utf-8');
const lines = content.split('\n');
const files = [];

for (const line of lines) {
    const cleanLine = line.replace(/\u001b\[\d+m/g, '').trim();

    // Format 1: "❌ Corruption in: src/..." (Old)
    if (cleanLine.startsWith('❌ Corruption in:')) {
        files.push({ file: cleanLine.split('Corruption in:')[1].trim() });
    }
    // Format 2: "❌ src/..." (New, potentially indented)
    else if (cleanLine.startsWith('❌ ') && !cleanLine.includes('FAILED:') && !cleanLine.includes('Result:') && !cleanLine.includes('Syntax Corruption')) {
        files.push({ file: cleanLine.substring(2).trim() });
    }
    // Format 3: Handle raw lines with colors stipped
    else if (cleanLine.includes('❌') && !cleanLine.includes('FAILED') && !cleanLine.includes('Result')) {
         const parts = cleanLine.split('❌');
         if (parts.length > 1) {
             const potentialPath = parts[1].trim();
             // simple heuristic: path contains '/' or starts with 'src'
             if ((potentialPath.startsWith('src') || potentialPath.includes('/')) && !potentialPath.includes(' ')) {
                 files.push({ file: potentialPath });
             }
         }
    }
}

// deduplicate
const uniqueFiles = [...new Set(files.map(f => f.file))].map(f => ({ file: f }));

const batch = { track1Files: uniqueFiles };
fs.writeFileSync(outPath, JSON.stringify(batch, null, 2));
console.log(`Generated batch with ${uniqueFiles.length} files at ${outPath}.`);
