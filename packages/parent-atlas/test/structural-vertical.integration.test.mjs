import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptAtlasAstEvidenceToStructuralInput,
} from '../dist/core/treesitter-chunker-evidence-adapter.js';
import {
  compileStructuralExtractionFabric,
} from '../dist/core/structural-extraction-fabric.js';
import {
  canonicalizeStructuralEvidence,
} from '../dist/core/gis-canonicalization.js';
import {
  symbolResolutionSchema,
} from '../dist/core/structural-symbol.js';
import {
  structuralReferenceResolutionSchema,
} from '../dist/core/structural-reference-resolver.js';

const source = `export function PATCH() { return authorizeCase(); }\nfunction authorizeCase() { return true; }\n`;
const patchStart = source.indexOf('export function PATCH');
const patchEnd = source.indexOf('\n');
const authStart = source.indexOf('function authorizeCase');
const authEnd = source.length;

const evidence = {
  schema: 'atlas.ast.evidence.v1',
  engine: 'treesitter-chunker',
  engine_version: 'fixture',
  language: 'typescript',
  file_path: 'src/routes/api/cases/[id]/+server.ts',
  source_revision: 'src-rev-742',
  chunks: [
    {
      upstream_chunk_id: 'chunk-patch',
      upstream_node_id: 'node-patch',
      upstream_file_id: 'file-route',
      upstream_symbol_id: 'upstream-symbol-patch',
      node_type: 'function_declaration',
      kind: 'function_definition',
      name: 'PATCH',
      parent_route: ['module'],
      parent_context: 'module',
      start_byte: patchStart,
      end_byte: patchEnd,
      start_line: 0,
      start_column: 0,
      end_line: 0,
      end_column: patchEnd,
      calls: ['authorizeCase'],
      imports: [],
      exports: ['PATCH'],
    },
    {
      upstream_chunk_id: 'chunk-auth',
      upstream_node_id: 'node-auth',
      upstream_file_id: 'file-route',
      upstream_symbol_id: 'upstream-symbol-auth',
      node_type: 'function_declaration',
      kind: 'function_definition',
      name: 'authorizeCase',
      parent_route: ['module'],
      parent_context: 'module',
      start_byte: authStart,
      end_byte: authEnd,
      start_line: 1,
      start_column: 0,
      end_line: 1,
      end_column: authEnd - authStart,
      calls: [],
      imports: [],
      exports: [],
    },
  ],
  edges: [
    {
      from_evidence_key: 'node-patch',
      to_evidence_key: 'node-auth',
      type: 'CALLS',
      evidence_start_line: 0,
      evidence_start_column: 30,
      evidence_end_line: 0,
      evidence_end_column: 43,
      resolved: true,
      resolution: 'authorizeCase',
    },
  ],
  diagnostics: [],
  syntax_status: 'CLEAN',
};

test('8095 evidence can reach GIS canonical evidence entities without extractor identity authority', async () => {
  const adapted = adaptAtlasAstEvidenceToStructuralInput({
    evidence,
    source_text: source,
    workspace_revision: 'ws-742',
    chunker_revision: 'treesitter-chunker:fixture',
    ast_grep_revision: 'ast-grep:fixture',
    langextract_revision: 'langextract:fixture',
    producer_revision: 'adapter:fixture',
    allow_compatibility_ids: false,
  });

  assert.equal(adapted.receipt.native_node_id_count, 2);
  assert.equal(adapted.receipt.compatibility_node_id_count, 0);
  assert.equal(adapted.receipt.canonical_identity_created, false);

  const fabric = compileStructuralExtractionFabric(adapted.structural_input, {
    producer_revision: 'fabric:fixture',
  });
  assert.equal(fabric.symbol_nominations.length, 2);
  assert.equal(fabric.reference_facts.length, 1);
  assert.equal(fabric.receipt.canonical_identity_created, false);

  const stableByNomination = new Map(
    fabric.symbol_nominations.map((nomination) => [
      nomination.nomination_id,
      nomination.name === 'PATCH' ? 'symbol:patch' : 'symbol:authorize-case',
    ]),
  );

  const result = await canonicalizeStructuralEvidence({
    evidence_id: 'evidence:route-file',
    evidence_revision: 'evidence-rev-1',
    source_ref: evidence.file_path,
    source_revision: evidence.source_revision,
    workspace_revision: 'ws-742',
    producer_revision: 'gis:fixture',
    symbol_nominations: fabric.symbol_nominations,
    reference_facts: fabric.reference_facts,
    symbol_resolver: {
      async resolve(nomination) {
        return symbolResolutionSchema.parse({
          nomination_id: nomination.nomination_id,
          symbol_key: nomination.symbol_key,
          status: 'canonical',
          stable_symbol_id: stableByNomination.get(nomination.nomination_id),
          registry_revision: 'registry-1',
          resolution_basis: 'exact_symbol_key',
          candidate_symbol_ids: [stableByNomination.get(nomination.nomination_id)],
          evidence_refs: ['evidence:route-file'],
        });
      },
    },
    reference_resolver: {
      async resolve(fact) {
        return structuralReferenceResolutionSchema.parse({
          reference_id: fact.reference_id,
          reference_kind: fact.reference_kind,
          source_stable_symbol_id: 'symbol:patch',
          target_stable_symbol_id: 'symbol:authorize-case',
          target_text: fact.target_text,
          status: 'canonical',
          resolution_basis: 'upstream_node_version',
          candidate_symbol_ids: ['symbol:patch', 'symbol:authorize-case'],
          source_revision: fact.source_revision,
          evidence_refs: ['evidence:route-file'],
          producer_revision: 'reference-resolver:fixture',
        });
      },
    },
  });

  assert.equal(result.receipt.canonical_symbol_count, 2);
  assert.equal(result.receipt.canonical_reference_count, 1);
  assert.equal(result.receipt.canonical_identity_created, false);
  assert.equal(result.evidence_entity_facts.length, 2);
  assert.deepEqual(
    result.evidence_entity_facts.map((fact) => fact.entity_id).sort(),
    ['symbol:authorize-case', 'symbol:patch'],
  );
});
