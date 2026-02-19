import fs from 'fs/promises';
import { existsSync, copyFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const summaryPath = path.resolve(__dirname, '../logs/fix-comma-summary.json');

function isSafeObjectProperty(originalLine) {
  // Trim-leading whitespace for checks
  const t = originalLine.trim();
  // Object literal property: key: value  (allow quoted keys)
  if (/^["'`]?[_$A-Za-z0-9\-]+["'`]?\s*:\s*[^,{};]+$/.test(t)) return true;
  // Type or interface member: name: Type
  if (/^[A-Za-z_$][A-Za-z0-9_$]*\s*:\s*[^,;]+$/.test(t)) return true;
  // Allow simple array element lines of primitives (e.g., '42' or '"str"')
  if (/^[\[\(\{\s]*[0-9\-"'`A-Za-z_$].*$/.test(t) && !t.endsWith(')') && !t.endsWith(';')) return false;
  return false;
}

async function main() {
  if (!existsSync(summaryPath)) {
    console.error('Summary not found:', summaryPath);
    process.exit(1);
  }
  const raw = await fs.readFile(summaryPath, 'utf8');
  const summary = JSON.parse(raw);
  let filesModified = 0;
  let fixesApplied = 0;
  for (const f of summary.files) {
    const abs = path.resolve(repoRoot, f.file);
    if (!existsSync(abs)) continue;
    const content = await fs.readFile(abs, 'utf8');
    const lines = content.split(/\r?\n/);
    const patches = f.details || [];
    let changed = false;
    // Apply patches bottom-up
    const sorted = [...patches].sort((a,b)=>b.line-a.line);
    for (const p of sorted) {
      const idx = p.line - 1;
      if (idx < 0 || idx >= lines.length) continue;
      const current = lines[idx];
      if (current.trim() !== p.original.trim()) continue; // require exact match (trimmed)
      if (!isSafeObjectProperty(p.original)) continue;
      // backup once per file
      if (!changed) {
        copyFileSync(abs, abs + '.bak');
      }
      lines[idx] = p.suggestion;
      changed = true;
      fixesApplied++;
    }
    if (changed) {
      await fs.writeFile(abs, lines.join('\n'), 'utf8');
      filesModified++;
      console.log('Modified:', f.file, 'applied patches:', patches.filter(p=>lines[p.line-1]===p.suggestion).length);
    }
  }
  console.log('\nSummary:');
  console.log('Files modified:', filesModified);
  console.log('Fixes applied:', fixesApplied);
  console.log('\nNext: run `npx tsc --noEmit --skipLibCheck` to validate.');
}

main().catch(err=>{ console.error(err); process.exit(1); });
