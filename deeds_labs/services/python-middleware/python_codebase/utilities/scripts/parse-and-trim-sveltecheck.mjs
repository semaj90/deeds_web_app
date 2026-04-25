import fs from 'fs/promises';
import path from 'node:path';

const inPath = path.resolve('.cache/sveltecheck.json');
const outPath = path.resolve('.cache/sveltecheck.trimmed.json');

async function findJsonAndTrim() {
  const raw = await fs.readFile(inPath, 'utf8');
  // Find candidate positions of '{' and try to parse from each
  const positions = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '{') positions.push(i);
  }
  for (const pos of positions) {
    try {
      const candidate = raw.slice(pos);
      const parsed = JSON.parse(candidate);
      const diagnostics = parsed.diagnostics || parsed.results || parsed || null;
      // normalize diagnostics array
      let diags = [];
      if (Array.isArray(diagnostics)) diags = diagnostics;
      else if (parsed && Array.isArray(parsed.diagnostics)) diags = parsed.diagnostics;
      else if (parsed && parsed.results && Array.isArray(parsed.results)) diags = parsed.results;
      else if (Array.isArray(parsed)) diags = parsed;

      const trimmed = diags.map(d => ({ file: d.file, message: d.message, code: d.code, start: d.start, severity: d.severity }));
      const out = { generated_at: new Date().toISOString(), count: trimmed.length, diagnostics: trimmed };
      await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
      console.log('Trimmed diagnostics written to', outPath, 'count=', trimmed.length);
      return 0;
    } catch (e) {
      // ignore parse errors and continue
    }
  }
  console.error('Failed to find a valid JSON object in', inPath);
  return 1;
}

findJsonAndTrim().then(code => process.exit(code)).catch(err => { console.error(err); process.exit(2); });
