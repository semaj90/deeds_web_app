#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const sidecarPath = path.join(root, 'python', 'miniforge_nlp_sidecar.py');
const helperPath = path.join(root, 'python', 'atlas_structural_provenance.py');
const clientPath = path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'nlp', 'miniforge-nlp-sidecar.ts');

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

const checks = [];
function check(id, ok, detail) {
  checks.push({ id, ok, detail });
}

check('HELPER_EXISTS', await exists(helperPath), path.relative(root, helperPath));
check('SIDECAR_EXISTS', await exists(sidecarPath), path.relative(root, sidecarPath));
check('CLIENT_EXISTS', await exists(clientPath), path.relative(root, clientPath));

const sidecar = await fs.readFile(sidecarPath, 'utf8');
const helper = await fs.readFile(helperPath, 'utf8');
const client = await fs.readFile(clientPath, 'utf8');

check(
  'HELPER_NORMALIZES_CHUNKER_IDS',
  helper.includes('normalize_treesitter_chunker_chunk'),
  'native node_id/file_id/symbol_id/chunk_id helper exists',
);
check(
  'HELPER_NORMALIZES_LANGEXTRACT_GROUNDING',
  helper.includes('normalize_langextract_extraction'),
  'char_interval/alignment_status helper exists',
);
check(
  'CLIENT_ACCEPTS_NATIVE_CHUNKER_IDS',
  client.includes('upstream_node_id') && client.includes('upstream_file_id') && client.includes('upstream_symbol_id'),
  'TypeScript client can preserve native Consiliency provenance',
);

// Production integration gates. These deliberately remain red until the Python
// sidecar imports/calls the helper rather than reconstructing native IDs itself.
check(
  'SIDECAR_IMPORTS_PROVENANCE_HELPER',
  /from\s+atlas_structural_provenance\s+import|import\s+atlas_structural_provenance/.test(sidecar),
  'TODO: import python/atlas_structural_provenance.py in miniforge_nlp_sidecar.py',
);
check(
  'SIDECAR_USES_NATIVE_CHUNK_NORMALIZER',
  sidecar.includes('normalize_treesitter_chunker_chunk('),
  'TODO: normalize every raw Consiliency CodeChunk before building AstEvidenceChunk',
);
check(
  'SIDECAR_USES_LANGEXTRACT_NORMALIZER',
  sidecar.includes('normalize_langextract_extraction('),
  'TODO: preserve LangExtract char_interval + alignment_status instead of legacy start_char/end_char',
);

const hardPass = checks.filter((item) => item.id.startsWith('HELPER_') || item.id.startsWith('CLIENT_')).every((item) => item.ok);
const liveWired = checks.filter((item) => item.id.startsWith('SIDECAR_') && !item.id.endsWith('EXISTS')).every((item) => item.ok);

const receipt = {
  schema: 'atlas.structural-provenance-wiring-audit.v1',
  status: hardPass && liveWired ? 'PROVEN' : hardPass ? 'SCAFFOLDED_LIVE_WIRING_PENDING' : 'INCOMPLETE',
  helper_ready: hardPass,
  live_sidecar_wired: liveWired,
  checks,
};

console.log(JSON.stringify(receipt, null, 2));
process.exitCode = hardPass ? 0 : 1;
