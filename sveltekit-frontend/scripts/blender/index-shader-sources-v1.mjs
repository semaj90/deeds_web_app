import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '../..');
const output = path.resolve(process.argv[2] ?? path.join(appRoot, '.tmp/atlas/shader-source-index-v1.json'));
const roots = [
  ['src', path.join(appRoot, 'src/lib')],
  ['scripts', path.join(appRoot, 'scripts/blender')]
];
const extensionKinds = new Map([['.wgsl', 'WGSL'], ['.glsl', 'GLSL'], ['.vert', 'GLSL_VERTEX'], ['.frag', 'GLSL_FRAGMENT'], ['.py', 'BLENDER_PYTHON_SHADER_AUTHORING']]);
const markers = [/ShaderMaterial/g, /ShaderNodeBsdfPrincipled/g, /Principled BSDF/g, /createN64Material/g, /makeRetroMaterial/g, /shaderType/g];

async function walk(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.svelte-kit', 'dist'].includes(entry.name)) files.push(...await walk(full));
    } else if (extensionKinds.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

const records = [];
for (const [scope, root] of roots) {
  let files;
  try { files = await walk(root); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  for (const file of files.sort()) {
    const bytes = await readFile(file);
    const source = bytes.toString('utf8');
    const matched = markers.filter((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(source);
    }).map((pattern) => pattern.source.replaceAll('\\', ''));
    records.push({
      sourceRef: path.relative(appRoot, file).split(path.sep).join('/'),
      sourceKind: extensionKinds.get(path.extname(file).toLowerCase()),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.byteLength,
      signals: matched
    });
  }
}
const document = {
  schema: 'atlas.shader-source-inventory.v1',
  generatedAt: new Date().toISOString(),
  semantics: 'PATH_AND_HASH_INVENTORY_ONLY; no compilation, embedding, training, or database write',
  sources: records
};
await writeFile(output, JSON.stringify(document, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(JSON.stringify({ output, sourceCount: records.length, written: true }) + '\n');
