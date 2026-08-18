#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const paths = {
  sidecar: path.join(root, 'python', 'miniforge_nlp_sidecar.py'),
  helper: path.join(root, 'python', 'atlas_structural_provenance.py'),
  helperTest: path.join(root, 'python', 'test_atlas_structural_provenance.py'),
  client: path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'nlp', 'miniforge-nlp-sidecar.ts'),
  normalizer: path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'analysis', 'atlas-ast-evidence-normalizer.ts'),
  materializer: path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'atlas', 'indexing', 'graphify-structural-materializer.ts'),
  astGrep: path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'analysis', 'ast-grep-extractor.ts'),
  proof: path.join(root, 'scripts', 'atlas', 'prove-ast-sidecar.mjs'),
};

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function read(file) {
  return fs.readFile(file, 'utf8');
}

const checks = [];
function check(id, ok, detail, category = 'scaffold') {
  checks.push({ id, ok, detail, category });
}

for (const [name, file] of Object.entries(paths)) {
  check(`${name.toUpperCase()}_EXISTS`, await exists(file), path.relative(root, file), 'presence');
}

const [sidecar, helper, client, normalizer, materializer, astGrep, proof] = await Promise.all([
  read(paths.sidecar),
  read(paths.helper),
  read(paths.client),
  read(paths.normalizer),
  read(paths.materializer),
  read(paths.astGrep),
  read(paths.proof),
]);

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
  client.includes('upstream_node_id') && client.includes('upstream_file_id') && client.includes('upstream_symbol_id') && client.includes('parent_route'),
  'TypeScript client can preserve native Consiliency provenance',
);
check(
  'NORMALIZER_PRESERVES_NATIVE_PROVENANCE',
  normalizer.includes('upstreamNodeId') && normalizer.includes('upstreamFileId') && normalizer.includes('upstreamSymbolId') && normalizer.includes('treeNodeIdSource'),
  'normalizer keeps native provenance and labels compatibility treeNodeId explicitly',
);
check(
  'GRAPHIFY_GATES_CANONICAL_PROMOTION',
  materializer.includes("status: 'NATIVE_READY' | 'COMPATIBILITY_ONLY' | 'NO_EVIDENCE'")
    && materializer.includes('canonicalPromotionAllowed'),
  'Graphify materializer blocks GIS promotion on compatibility-only provenance',
);
check(
  'AST_GREP_EMITS_BYTE_RANGES',
  astGrep.includes('byteStart') && astGrep.includes('byteEnd') && astGrep.includes('ruleId'),
  'ast-grep observations retain byte-grounded match provenance',
);
check(
  'LIVE_PROOF_REQUIRES_NATIVE_PROVENANCE',
  proof.includes('NATIVE_NODE_IDS') && proof.includes('NATIVE_FILE_IDS') && proof.includes('HIERARCHY_PRESERVED'),
  'live proof can no longer pass on upstream_chunk_id alone',
);
check(
  'LIVE_PROOF_PROBES_LANGEXTRACT_ALIGNMENT',
  proof.includes('LANGEXTRACT_NATIVE_CHAR_INTERVAL') && proof.includes('LANGEXTRACT_ALIGNMENT_STATUS_VISIBLE'),
  'live proof separately checks LangExtract native grounding/alignment',
);

// Production integration gates. These deliberately remain red until the Python
// sidecar imports/calls the helper rather than reconstructing native IDs itself.
check(
  'SIDECAR_IMPORTS_PROVENANCE_HELPER',
  /from\s+atlas_structural_provenance\s+import|import\s+atlas_structural_provenance/.test(sidecar),
  'TODO: import python/atlas_structural_provenance.py in miniforge_nlp_sidecar.py',
  'live',
);
check(
  'SIDECAR_USES_NATIVE_CHUNK_NORMALIZER',
  sidecar.includes('normalize_treesitter_chunker_chunk('),
  'TODO: normalize every raw Consiliency CodeChunk before building AstEvidenceChunk',
  'live',
);
check(
  'SIDECAR_USES_LANGEXTRACT_NORMALIZER',
  sidecar.includes('normalize_langextract_extraction('),
  'TODO: preserve LangExtract char_interval + alignment_status instead of legacy start_char/end_char',
  'live',
);

const presencePass = checks.filter((item) => item.category === 'presence').every((item) => item.ok);
const scaffoldPass = checks.filter((item) => item.category === 'scaffold').every((item) => item.ok);
const liveWired = checks.filter((item) => item.category === 'live').every((item) => item.ok);

const receipt = {
  schema: 'atlas.structural-provenance-wiring-audit.v2',
  status: presencePass && scaffoldPass && liveWired
    ? 'PROVEN'
    : presencePass && scaffoldPass
      ? 'SCAFFOLDED_LIVE_WIRING_PENDING'
      : 'INCOMPLETE',
  presence_ready: presencePass,
  scaffold_ready: scaffoldPass,
  live_sidecar_wired: liveWired,
  red_gates: checks.filter((item) => !item.ok).map((item) => item.id),
  checks,
};

console.log(JSON.stringify(receipt, null, 2));
// Scaffolding may be intentionally complete while the live sidecar remains red.
// Exit non-zero only when the checked-in scaffold itself is incomplete.
process.exitCode = presencePass && scaffoldPass ? 0 : 1;
