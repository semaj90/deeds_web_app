#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const paths = {
  legacySidecar: path.join(root, 'python', 'miniforge_nlp_sidecar.py'),
  sidecarV2: path.join(root, 'python', 'miniforge_nlp_sidecar_v2.py'),
  helper: path.join(root, 'python', 'atlas_structural_provenance.py'),
  helperTest: path.join(root, 'python', 'test_atlas_structural_provenance.py'),
  client: path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'nlp', 'miniforge-nlp-sidecar.ts'),
  normalizer: path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'analysis', 'atlas-ast-evidence-normalizer.ts'),
  materializer: path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'atlas', 'indexing', 'graphify-structural-materializer.ts'),
  graphifyFabric: path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'atlas', 'indexing', 'graphify-structural-intelligence-adapter.ts'),
  astGrep: path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'analysis', 'ast-grep-extractor.ts'),
  proof: path.join(root, 'scripts', 'atlas', 'prove-ast-sidecar.mjs'),
  integrationProof: path.join(root, 'scripts', 'atlas', 'prove-structural-intelligence-integration.mjs'),
  dockerfile: path.join(root, 'docker', 'miniforge-nlp-sidecar', 'Dockerfile'),
  launcher: path.join(root, 'scripts', 'launch-miniforge-nlp-sidecar.ps1'),
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

const [sidecarV2, helper, client, normalizer, materializer, graphifyFabric, astGrep, proof, integrationProof, dockerfile, launcher] = await Promise.all([
  read(paths.sidecarV2),
  read(paths.helper),
  read(paths.client),
  read(paths.normalizer),
  read(paths.materializer),
  read(paths.graphifyFabric),
  read(paths.astGrep),
  read(paths.proof),
  read(paths.integrationProof),
  read(paths.dockerfile),
  read(paths.launcher),
]);

check('HELPER_NORMALIZES_CHUNKER_IDS', helper.includes('normalize_treesitter_chunker_chunk'), 'native node_id/file_id/symbol_id/chunk_id helper exists');
check('HELPER_NORMALIZES_LANGEXTRACT_GROUNDING', helper.includes('normalize_langextract_extraction'), 'char_interval/alignment_status helper exists');
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
  materializer.includes("'NATIVE_READY' | 'NATIVE_RECOVERED' | 'COMPATIBILITY_ONLY' | 'NO_EVIDENCE'")
    && materializer.includes('STRUCTURAL_PROVENANCE_RECOVERED_NOT_PROMOTABLE')
    && materializer.includes('canonicalPromotionAllowed'),
  'Graphify blocks GIS promotion for recovered or compatibility-only structural evidence',
);
check(
  'GRAPHIFY_RETAINS_RAW_EVIDENCE_FOR_FABRIC',
  materializer.includes('evidence: AtlasStructuralEvidence | null') && materializer.includes('evidence,'),
  'Graphify retains raw 8095 evidence while keeping legacy normalized consumers intact',
);
check(
  'GRAPHIFY_COMPILES_PARENT_ATLAS_FABRIC',
  graphifyFabric.includes('compileStructuralExtractionFabric')
    && graphifyFabric.includes('adaptAstGrepExtractedFeature')
    && graphifyFabric.includes('adaptSidecarGroundedExtractions')
    && graphifyFabric.includes('canonicalPromotionMayBeAttempted'),
  'Graphify has an additive pre-GIS bridge into the three-producer Parent Atlas fabric',
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
check(
  'ORDERED_INTEGRATION_PROOF_EXISTS',
  integrationProof.includes('PARENT_ATLAS_BUILD')
    && integrationProof.includes('FRONTEND_STRUCTURAL_INTEGRATION_TESTS')
    && integrationProof.includes('WRITTEN != WIRED != PROVEN'),
  'integration proof builds Parent Atlas before frontend cross-package tests',
);

// Production deployment gates. The provenance-v2 facade is the selected owner
// for 8095 while the legacy monolith remains an explicit rollback target.
check(
  'SIDECAR_V2_IMPORTS_PROVENANCE_HELPER',
  sidecarV2.includes('normalize_treesitter_chunker_chunk') && sidecarV2.includes('normalize_langextract_extraction'),
  'provenance-v2 facade imports both normalization helpers',
  'live',
);
check(
  'SIDECAR_V2_PRESERVES_NATIVE_IDS',
  sidecarV2.includes('upstream_node_id=normalized.get("upstream_node_id")')
    && sidecarV2.includes('upstream_file_id=normalized.get("upstream_file_id")')
    && sidecarV2.includes('upstream_symbol_id=normalized.get("upstream_symbol_id")')
    && sidecarV2.includes('identity_path=file_path'),
  'provenance-v2 /ast/chunk maps native Consiliency IDs and logical identity path',
  'live',
);
check(
  'SIDECAR_V2_DEGRADES_IDENTITY_PATH_FALLBACK',
  sidecarV2.includes('CONSILIENCY_IDENTITY_PATH_UNPROVEN')
    && sidecarV2.includes('identity_path_preserved'),
  'older chunker fallback remains searchable but forces recovered/nonpromotable structural status',
  'live',
);
check(
  'SIDECAR_V2_PRESERVES_LANGEXTRACT_GROUNDING',
  sidecarV2.includes('"char_interval": interval') && sidecarV2.includes('"alignment_status": normalized.get("alignment_status")'),
  'provenance-v2 /analyze exposes native LangExtract grounding metadata',
  'live',
);
check('DOCKER_LAUNCHES_PROVENANCE_V2', dockerfile.includes('miniforge_nlp_sidecar_v2.py'), 'Docker 8095 entrypoint selects provenance-v2 facade', 'live');
check(
  'LOCAL_LAUNCHER_DEFAULTS_TO_PROVENANCE_V2',
  launcher.includes("'miniforge_nlp_sidecar_v2.py'") && launcher.includes('UseLegacySidecar'),
  'PowerShell launcher defaults to provenance-v2 with explicit legacy rollback',
  'live',
);

const presencePass = checks.filter((item) => item.category === 'presence').every((item) => item.ok);
const scaffoldPass = checks.filter((item) => item.category === 'scaffold').every((item) => item.ok);
const liveWired = checks.filter((item) => item.category === 'live').every((item) => item.ok);

const receipt = {
  schema: 'atlas.structural-provenance-wiring-audit.v4',
  status: presencePass && scaffoldPass && liveWired
    ? 'WIRED_UNPROVEN_RUNTIME'
    : presencePass && scaffoldPass
      ? 'SCAFFOLDED_LIVE_WIRING_PENDING'
      : 'INCOMPLETE',
  presence_ready: presencePass,
  scaffold_ready: scaffoldPass,
  live_sidecar_wired: liveWired,
  runtime_proven: false,
  red_gates: checks.filter((item) => !item.ok).map((item) => item.id),
  next_runtime_gate: 'Run scripts/atlas/prove-structural-intelligence-integration.mjs; set ATLAS_PROVE_LIVE_SIDECAR=1 to include the live 8095 proof.',
  checks,
};

console.log(JSON.stringify(receipt, null, 2));
process.exitCode = presencePass && scaffoldPass && liveWired ? 0 : 1;
