import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputArg = process.argv[2] ?? '.tmp/atlas/shader-source-index-v1.json';
const outputPath = path.resolve(repoRoot, outputArg);
const roots = ['sveltekit-frontend/src', 'scripts/blender'];
const shaderExtensions = new Set(['.wgsl', '.glsl', '.vert', '.frag', '.hlsl', '.shader']);
const hostExtensions = new Set(['.ts', '.js', '.svelte', '.py']);
const hostShaderMarkers = [
  ['THREE_SHADER_MATERIAL', /\b(?:Raw)?ShaderMaterial\b/g],
  ['THREE_PBR_MATERIAL', /\bMesh(?:Standard|Physical)Material\b/g],
  ['THREE_SHADER_HOOK', /\bonBeforeCompile\b/g],
  ['BLENDER_PBR_SHADER_NODE', /\bShaderNodeBsdfPrincipled\b/g],
  ['WEBGPU_SHADER_MODULE', /\bcreateShaderModule\s*\(/g],
  ['WGSL_SOURCE_MARKER', /@(?:vertex|fragment|compute)\b|@group\s*\(/g],
  ['SHADER_REGISTRY', /\bSHADER_REGISTRY\b/g]
];

async function walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.svelte-kit') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (shaderExtensions.has(path.extname(entry.name).toLowerCase()) || hostExtensions.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files;
}

const sourceFiles = (await Promise.all(roots.map((root) => walk(path.join(repoRoot, root)))))
  .flat().sort((a, b) => a.localeCompare(b));
const entries = [];
const hostModules = [];
for (const absolutePath of sourceFiles) {
  const bytes = await readFile(absolutePath);
  const relativePath = path.relative(repoRoot, absolutePath).replaceAll(path.sep, '/');
  const ext = path.extname(absolutePath).toLowerCase();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (shaderExtensions.has(ext)) {
    entries.push({
      sourceRef: relativePath,
      sha256,
      byteLength: bytes.byteLength,
      language: ext.slice(1),
      classification: 'SHADER_SOURCE_FILE_ONLY',
      indexingNote: 'Hash and path inventory only; no shader compilation, semantic embedding, or runtime qualification.'
    });
  } else {
    const text = bytes.toString('utf8');
    const markers = hostShaderMarkers.flatMap(([name, pattern]) => {
      pattern.lastIndex = 0;
      const count = [...text.matchAll(pattern)].length;
      return count ? [{ name, count }] : [];
    });
    if (markers.length) hostModules.push({
      sourceRef: relativePath,
      sha256,
      byteLength: bytes.byteLength,
      language: ext.slice(1),
      markers,
      classification: 'SHADER_HOST_OR_EMBEDDED_SOURCE_CANDIDATE',
      indexingNote: 'Static marker inventory only; inspect source before treating it as shader code. No compilation or runtime qualification.'
    });
  }
}

const index = {
  schema: 'atlas.shader-source-index.v1',
  generatedAt: new Date().toISOString(),
  roots,
  count: entries.length,
  entries,
  hostModuleCount: hostModules.length,
  hostModules,
  referenceSources: [
    { title: 'Blender Material Python API', url: 'https://docs.blender.org/api/4.3/bpy.types.Material.html', role: 'material node authoring' },
    { title: 'Blender Principled BSDF Python API', url: 'https://docs.blender.org/api/4.3/bpy.types.ShaderNodeBsdfPrincipled.html', role: 'PBR node inputs' },
    { title: 'Three.js MeshStandardMaterial', url: 'https://threejs.org/docs/pages/MeshStandardMaterial.html', role: 'browser metallic-roughness material' },
    { title: 'Three.js Raycaster', url: 'https://threejs.org/docs/pages/Raycaster.html', role: 'mouse picking, not illumination' },
    { title: 'Three.js path tracer example', url: 'https://threejs.org/examples/webgl_renderer_pathtracer.html', role: 'separate community path-tracing renderer example' },
    { title: 'NVIDIA NGX programming guide', url: 'https://docs.nvidia.com/ngx/latest/pdf/Programming-Guide.pdf', role: 'native NVIDIA super-resolution integration context' },
    { title: 'PostgreSQL 18 data types', url: 'https://www.postgresql.org/docs/18/datatype.html', role: 'metadata versus binary storage' }
  ],
  status: 'LOCAL_INDEX_ONLY_NOT_DATABASE_OR_MODEL_INGESTION'
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ output: path.relative(repoRoot, outputPath), shaderSourceCount: entries.length, hostModuleCandidateCount: hostModules.length, status: index.status })}\n`);
