import { structuralExtractionReceiptSchema, type StructuralExtractionFabricResultV1 } from './structural-extraction-fabric.js';
import { buildAcePacketV3, verifyAcePacketV3, type AcePacketV3 } from './ace-packet-v3.js';

/**
 * Attach already-produced, byte-grounded structural observations to an ACE v3
 * packet. This is a pure composition function: it never parses source or
 * assigns canonical tree/symbol identity. Tree-sitter chunk ids and AST-grep
 * observation ids remain evidence references only.
 */
export function attachStructuralEvidenceToAcePacketV3(input: {
  packet: unknown;
  structural: StructuralExtractionFabricResultV1;
}): AcePacketV3 {
  const packet = verifyAcePacketV3(input.packet);
  const { identity } = packet;
  const receipt = structuralExtractionReceiptSchema.parse(input.structural.receipt);
  if (receipt.source_ref !== identity.source_ref
    || receipt.workspace_revision !== identity.workspace_revision
    || receipt.source_revision !== identity.source_revision) {
    throw new Error('ACE3_STRUCTURAL_LINEAGE_IDENTITY_MISMATCH');
  }
  if (receipt.chunk_count !== input.structural.chunks.length
    || receipt.ast_grep_observation_count !== input.structural.ast_grep_observations.length
    || receipt.symbol_nomination_count !== input.structural.symbol_nominations.length
    || receipt.reference_fact_count !== input.structural.reference_facts.length
    || receipt.lsp_resolved_reference_count !== input.structural.lsp_resolved_references.length
    || receipt.canonical_identity_created) {
    throw new Error('ACE3_STRUCTURAL_RECEIPT_OUTPUT_MISMATCH');
  }

  for (const chunk of input.structural.chunks) {
    if (chunk.source_ref !== identity.source_ref) throw new Error('ACE3_STRUCTURAL_CHUNK_SOURCE_MISMATCH');
  }
  for (const observation of input.structural.ast_grep_observations) {
    if (observation.source_ref !== identity.source_ref) throw new Error('ACE3_STRUCTURAL_OBSERVATION_SOURCE_MISMATCH');
    if (observation.source_revision !== identity.source_revision) throw new Error('ACE3_STRUCTURAL_OBSERVATION_REVISION_MISMATCH');
    if (observation.extractor_revision !== receipt.ast_grep_revision) throw new Error('ACE3_STRUCTURAL_PROVIDER_REVISION_MISMATCH');
    if (observation.canonical_authority) throw new Error('ACE3_STRUCTURAL_OBSERVATION_CANNOT_OWN_IDENTITY');
  }
  for (const reference of input.structural.lsp_resolved_references) {
    if (reference.source_ref !== identity.source_ref) throw new Error('ACE3_STRUCTURAL_LSP_SOURCE_MISMATCH');
    if (reference.source_revision !== identity.source_revision || reference.workspace_revision !== identity.workspace_revision) {
      throw new Error('ACE3_STRUCTURAL_LSP_REVISION_MISMATCH');
    }
    if (reference.canonical_authority) throw new Error('ACE3_STRUCTURAL_LSP_CANNOT_OWN_IDENTITY');
  }
  for (const nomination of input.structural.symbol_nominations) {
    if (nomination.source_ref !== identity.source_ref) throw new Error('ACE3_STRUCTURAL_NOMINATION_SOURCE_MISMATCH');
    if (nomination.source_revision !== identity.source_revision || nomination.workspace_revision !== identity.workspace_revision) {
      throw new Error('ACE3_STRUCTURAL_NOMINATION_REVISION_MISMATCH');
    }
    if (nomination.identity_status !== 'nominated') throw new Error('ACE3_STRUCTURAL_NOMINATION_CANNOT_OWN_IDENTITY');
  }
  for (const fact of input.structural.reference_facts) {
    if (fact.source_ref !== identity.source_ref) throw new Error('ACE3_STRUCTURAL_FACT_SOURCE_MISMATCH');
    if (fact.source_revision !== identity.source_revision || fact.workspace_revision !== identity.workspace_revision) {
      throw new Error('ACE3_STRUCTURAL_FACT_REVISION_MISMATCH');
    }
  }

  const observedSymbols = input.structural.ast_grep_observations.flatMap((observation) => {
    const name = observation.captures.name;
    if (!name) return [];
    return [{ name, kind: observation.observation_kind, byte_start: observation.byte_start, byte_end: observation.byte_end }];
  });
  const symbolsFromChunks = input.structural.chunks.flatMap((chunk) => chunk.symbol_name
    ? [{ name: chunk.symbol_name, kind: chunk.kind, byte_start: chunk.byte_start, byte_end: chunk.byte_end }]
    : []);
  const symbols = [...new Map([...symbolsFromChunks, ...observedSymbols].map((symbol) => [
    `${symbol.name}\0${symbol.kind}\0${symbol.byte_start}\0${symbol.byte_end}`,
    symbol,
  ])).values()].sort((a, b) => a.byte_start - b.byte_start || a.byte_end - b.byte_end || a.name.localeCompare(b.name));

  const hasEvidence = input.structural.chunks.length + input.structural.ast_grep_observations.length
    + input.structural.symbol_nominations.length + input.structural.reference_facts.length
    + input.structural.lsp_resolved_references.length > 0;
  const current = hasEvidence;
  const structuralEvidenceRefs = [
    ...input.structural.ast_grep_observations.map((item) => `ast-grep-observation:${item.observation_id}`),
    ...input.structural.chunks.map((item) => `treesitter-chunk:${item.upstream_chunk_id}`),
    ...input.structural.symbol_nominations.map((item) => `symbol-nomination:${item.nomination_id}`),
    ...input.structural.reference_facts.map((item) => `structural-reference:${item.reference_id}`),
    ...input.structural.lsp_resolved_references.map((item) => `lsp-resolution:${item.resolution_id}`),
  ].sort();
  const { integrity: _integrity, ...body } = packet;
  return buildAcePacketV3({
    ...body,
    structural: {
      status: current ? 'CURRENT' : 'HINT',
      revision: current ? receipt.source_revision : null,
      evidence_refs: structuralEvidenceRefs,
      data: {
        provider: [input.structural.chunks.length || input.structural.symbol_nominations.length || input.structural.reference_facts.length ? 'treesitter-chunker' : null, input.structural.ast_grep_observations.length ? 'ast-grep' : null].filter(Boolean).join('+') || null,
        provider_revision: current ? `treesitter-chunker=${receipt.chunker_revision};ast-grep=${receipt.ast_grep_revision}` : null,
        symbols,
        imports: [...new Set(input.structural.chunks.flatMap((chunk) => chunk.imports))].sort(),
        calls: [...new Set(input.structural.chunks.flatMap((chunk) => chunk.calls))].sort(),
        exports: [...new Set(input.structural.chunks.flatMap((chunk) => chunk.exports))].sort(),
        ast_grep_rule_ids: [...new Set(input.structural.ast_grep_observations.map((item) => item.rule_id))].sort(),
        structural_fact_refs: structuralEvidenceRefs,
        ...(input.structural.symbol_nominations.length ? { symbol_nominations: input.structural.symbol_nominations } : {}),
        ...(input.structural.reference_facts.length ? { reference_facts: input.structural.reference_facts } : {}),
        ...(input.structural.lsp_resolved_references.length ? { lsp_references: input.structural.lsp_resolved_references } : {}),
      },
    },
  });
}
