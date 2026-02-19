import { readFile, writeFile } from 'fs/promises';
import path from 'node:path';

const inPath = path.resolve('.cache/sveltecheck.diagnostics.json');
const outPath = path.resolve('.cache/sveltecheck.trimmed.json');

try {
  const raw = await readFile(inPath, 'utf8');
  // raw is expected to be a JSON array (string). Wrap to parse
  const arr = JSON.parse(raw);
  const diagnostics = arr.map(d => ({ file: d.file, message: d.message, code: d.code, start: d.start, severity: d.severity }));
  const out = { generated_at: new Date().toISOString(), count: diagnostics.length, diagnostics };
  await writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('Trimmed diagnostics written to', outPath, 'count=', diagnostics.length);
} catch (e) {
  console.error('trim-diagnostics failed:', e.message);
  process.exit(1);
}
