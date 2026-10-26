import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const sourceDir = path.resolve(root, '.tmp/merge-validation-20260912');
const outputFile = path.resolve(root, 'docs/reports/merge-validation-20260912-archive-manifest-v1.json');

const files = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (st.isFile()) {
      const rel = path.relative(sourceDir, full).replaceAll('\\', '/');
      const buf = fs.readFileSync(full);
      const sha256 = 'sha256:' + createHash('sha256').update(buf).digest('hex');
      files.push({
        relativePath: rel,
        sha256,
        sizeBytes: st.size,
      });
    }
  }
}

walk(sourceDir);
files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

const payload = {
  schema: 'atlas.archive-manifest.v1',
  sourceDir: '.tmp/merge-validation-20260912',
  archivedAt: new Date().toISOString(),
  totalFiles: files.length,
  files,
};

const manifestString = JSON.stringify(payload, Object.keys(payload).sort(), 2);
const manifestChecksum = 'sha256:' + createHash('sha256').update(manifestString, 'utf8').digest('hex');
const finalPayload = { ...payload, manifestChecksum };

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(finalPayload, null, 2) + '\n', 'utf8');

console.log(`Archived ${files.length} files from ${sourceDir}`);
console.log(`Output: ${outputFile}`);
console.log(`Manifest Checksum: ${manifestChecksum}`);
