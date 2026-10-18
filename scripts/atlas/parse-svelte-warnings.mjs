import fs from 'node:fs';
import path from 'node:path';

const warningsPath = path.resolve('sveltekit-frontend/svelte-warnings.txt');
if (!fs.existsSync(warningsPath)) {
  console.error('File not found:', warningsPath);
  process.exit(1);
}

const content = fs.readFileSync(warningsPath, 'utf8');
const lines = content.split('\n');
const warnings = [];
let current = null;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trimEnd();
  const fileMatch = line.match(/^([A-Za-z]:\\[^:]+):(\d+):(\d+)/);
  if (fileMatch) {
    if (current) warnings.push(current);
    current = {
      file: fileMatch[1],
      line: parseInt(fileMatch[2], 10),
      col: parseInt(fileMatch[3], 10),
      message: '',
      code: '',
      snippet: []
    };
  } else if (current) {
    if (line.includes('Warn: ')) {
      current.message = line.replace(/.*Warn:\s*/, '').trim();
    } else if (line.includes('https://svelte.dev/e/')) {
      const codeMatch = line.match(/https:\/\/svelte\.dev\/e\/([a-zA-Z0-9_]+)/);
      if (codeMatch) current.code = codeMatch[1];
    } else if (line.startsWith('\t') || line.startsWith('  ') || line.startsWith('<')) {
      if (current.snippet.length < 5) {
        current.snippet.push(line);
      }
    }
  }
}
if (current) warnings.push(current);

console.log('Total warnings parsed:', warnings.length);
const byCode = {};
warnings.forEach(w => {
  byCode[w.code] = (byCode[w.code] || 'unknown') + 1;
});
console.log('By code:\n', JSON.stringify(byCode, null, 2));

const byFile = {};
warnings.forEach(w => {
  const rel = w.file.replace(/.*sveltekit-frontend[\\\/]/, '').replace(/\\/g, '/');
  byFile[rel] = byFile[rel] || [];
  byFile[rel].push(w);
});

const sortedFiles = Object.entries(byFile).sort((a,b) => b[1].length - a[1].length);
console.log(`\nFiles with warnings (${sortedFiles.length} files):`);
sortedFiles.slice(0, 25).forEach(([f, list]) => {
  const codes = list.map(x => x.code).reduce((acc, c) => {
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});
  console.log(`  ${list.length.toString().padStart(2, ' ')} warnings: ${f} -> ${JSON.stringify(codes)}`);
});

fs.writeFileSync('sveltekit-frontend/parsed-warnings.json', JSON.stringify(warnings, null, 2));
fs.writeFileSync('sveltekit-frontend/warnings-by-file.json', JSON.stringify(byFile, null, 2));
