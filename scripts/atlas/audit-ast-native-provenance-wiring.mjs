#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const surfaces = [
  {
    id: 'PYTHON_AST_PRODUCER',
    path: 'python/miniforge_nlp_sidecar.py',
    required: [
      'class AstEvidenceChunk(BaseModel):',
      'node_id:',
      'file_id:',
      'symbol_id:',
      'chunk_id:',
      'parent_route:',
      'qualified_route:',
      'parent_context:',
    ],
    forbiddenForCanonicalProof: [
      'upstream_id = _digest_parts(req.file_path, req.source_revision, node_type, name or "", start, end)',
    ],
    note: 'The Python producer is the upstream-preservation boundary and must expose Consiliency qualified_route before any adapter aliasing.',
  },
  {
    id: 'TYPESCRIPT_SIDECAR_CLIENT',
    path: 'sveltekit-frontend/src/lib/server/nlp/miniforge-nlp-sidecar.ts',
    required: ['node_id?:', 'file_id?:', 'symbol_id?:', 'chunk_id?:', 'parent_route?:', 'route?:', 'char_interval?:', 'alignment_status?:'],
    forbiddenForCanonicalProof: [],
    note: 'TypeScript intentionally aliases upstream qualified_route to route; the producer must preserve the native value before this adapter boundary.',
  },
  {
    id: 'AST_EVIDENCE_NORMALIZER',
    path: 'sveltekit-frontend/src/lib/server/analysis/atlas-ast-evidence-normalizer.ts',
    required: ['nativeNodeId', 'nativeFileId', 'nativeSymbolId', 'nativeChunkId', 'compatibilityTreeNodeId', 'treeNodeIdProvenance', 'nativeProvenance'],
    forbiddenForCanonicalProof: [],
    note: 'Compatibility tree hashes may coexist, but promotion must use native provenance completeness.',
  },
  {
    id: 'GRAPHIFY_PROMOTION_GATE',
    path: 'sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-materializer.ts',
    required: ['nativeProvenanceComplete', 'ELIGIBLE_FOR_GIS_EVALUATION', 'BLOCKED_NATIVE_PROVENANCE_INCOMPLETE'],
    forbiddenForCanonicalProof: [],
    note: 'Graphify may expose eligibility for downstream GIS evaluation; it must not mint canonical GIS identity here.',
  },
];

const results = surfaces.map((surface) => {
  const absolute = resolve(repoRoot, surface.path);
  const source = readFileSync(absolute, 'utf8');
  const missing = surface.required.filter((fragment) => !source.includes(fragment));
  const forbiddenPresent = surface.forbiddenForCanonicalProof.filter((fragment) => source.includes(fragment));
  return {
    id: surface.id,
    path: surface.path,
    status: missing.length === 0 && forbiddenPresent.length === 0 ? 'PASS' : 'FAIL',
    missing,
    forbiddenPresent,
    note: surface.note,
  };
});

const status = results.every((result) => result.status === 'PASS') ? 'PROVEN_STATIC_WIRING' : 'DEGRADED';
const report = {
  schemaVersion: 'atlas.ast.native-provenance-wiring-proof.v2',
  generatedAt: new Date().toISOString(),
  status,
  results,
  note: 'Static wiring proof does not replace the live sidecar proof. Canonical upstream contracts + static wiring + live conformance must all pass before PROVEN_NATIVE_PROVENANCE.',
};

console.log(JSON.stringify(report, null, 2));
if (status !== 'PROVEN_STATIC_WIRING') process.exitCode = 2;
