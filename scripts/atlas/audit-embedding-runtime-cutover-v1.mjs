#!/usr/bin/env node

/** Read-only inventory of embedding transport ownership before the 11434 -> 8081 cutover. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/embedding-runtime-cutover-audit-v1.json');
const sourceRoots = ['sveltekit-frontend/src', 'sveltekit-frontend/scripts', 'scripts'];
const extensions = ['*.ts', '*.mts', '*.mjs', '*.js'];
const runRg = (pattern) => {
  try {
    const args = ['-l', '--no-heading', '-i', pattern, ...sourceRoots, ...extensions.flatMap((ext) => ['--glob', ext])];
    return execFileSync('rg', args, { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
      .filter((file) => !file.includes('scripts/api-cleanup/reports/backup-') && !file.includes('node_modules'));
  } catch { return []; }
};

const ollamaFiles = [...new Set(runRg('11434|OLLAMA_BASE_URL|OLLAMA_EMBED_BASE_URL|embedViaOllama'))].sort();
const llamaFiles = [...new Set(runRg('8081|EMBED_SERVER_URL|llama_cpp_gguf'))].sort();
const overlap = ollamaFiles.filter((file) => llamaFiles.includes(file));
const report = {
  schema: 'atlas.embedding-runtime-cutover-audit.v1',
  status: 'CUTOVER_NOT_READY_CALLER_INVENTORY_ONLY',
  canonicalModel: 'EmbeddingGemma',
  canonicalRepresentation: 'semantic_768',
  canonicalDimensions: 768,
  currentTransport: { ollama: 'http://127.0.0.1:11434', llamaServerEmbedding: 'http://127.0.0.1:8081' },
  ollamaReferenceFileCount: ollamaFiles.length,
  llamaServerReferenceFileCount: llamaFiles.length,
  dualReferenceFileCount: overlap.length,
  ollamaReferenceFiles: ollamaFiles,
  llamaServerReferenceFiles: llamaFiles,
  dualReferenceFiles: overlap,
  parityProof: false,
  writerCutover: false,
  startupCutover: false,
  fallbackRemoval: false,
  productionActivation: false,
  databaseWrites: false,
  nextRequiredStep: 'Prove :8081 model/tokenizer/prompt/2048-token/768-dim parity, then cut over one executor-neutral embedding boundary at a time.',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, ollamaReferenceFiles: undefined, llamaServerReferenceFiles: undefined, dualReferenceFiles: undefined }, null, 2));
