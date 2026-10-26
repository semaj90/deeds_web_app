import fs from 'node:fs';
import path from 'node:path';

const warningsPath = path.resolve('sveltekit-frontend/svelte-warnings.txt');
const content = fs.readFileSync(warningsPath, 'utf8');

// Strip ANSI codes
const clean = content.replace(/\u001b\[[0-9;]*m/g, '');
const blocks = clean.split(/(?=[A-Za-z]:\\[^:\n]+:\d+:\d+)/);

const warnings = [];
for (const b of blocks) {
  const fileMatch = b.match(/^([A-Za-z]:\\[^:\n]+):(\d+):(\d+)/);
  if (!fileMatch) continue;
  const file = fileMatch[1].trim();
  const line = parseInt(fileMatch[2], 10);
  const col = parseInt(fileMatch[3], 10);
  
  const warnMatch = b.match(/Warn:\s*([^\n]+)/);
  const message = warnMatch ? warnMatch[1].trim() : '';
  
  const codeMatch = b.match(/https:\/\/svelte\.dev\/e\/([a-zA-Z0-9_]+)/);
  const code = codeMatch ? codeMatch[1].trim() : 'unknown';

  warnings.push({ file, line, col, message, code });
}

console.log('Total warnings:', warnings.length);
const byCode = {};
warnings.forEach(w => { byCode[w.code] = (byCode[w.code] || 0) + 1; });
console.log('By code:', byCode);

const cssWarnings = warnings.filter(w => w.code === 'css_unused_selector');
const cssByFile = {};
cssWarnings.forEach(w => {
  const rel = w.file.replace(/.*sveltekit-frontend[\\\/]/, '').replace(/\\/g, '/');
  cssByFile[rel] = cssByFile[rel] || [];
  cssByFile[rel].push(w.message);
});

console.log('\nCSS Unused Selectors by File:');
for (const [f, sels] of Object.entries(cssByFile)) {
  console.log(`\n=== ${f} (${sels.length}) ===`);
  sels.forEach(s => console.log('  ' + s));
}

fs.writeFileSync('sveltekit-frontend/parsed-clean-warnings.json', JSON.stringify(warnings, null, 2));
