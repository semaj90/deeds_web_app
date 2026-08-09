Ownership Correction Report

Date: 2026-08-09
Status: CORRECTED

Summary:
- TreeSitter Chunker: Current structural extraction implementation (36 languages, 100 grammars)
- Boundary IR: AstUnit facts → atlas_ast_nodes (packet_key null, structural_revision)
- LangExtract: Grounded NLP/extraction lane beside structural, not instead of it

Files Corrected:
- docs/architecture/PACKET-COMPILER-STAGES.md
- docs/research/parent-atlas-upstream-api-matrix.md
- openspec/changes/parent-atlas-graph-retrieval-proof/tasks.md
- docs/ATLAS-TOOLS-MCP-INSTALLATION.md

Key Corrections:
1. Ownership: TreeSitter Chunker is structural extraction, not 'primitives'
2. LangExtract: Beside structural, not replacement
3. Pipeline: 11-stage semantic alignment with proper sequencing

Evidence Base:
- Local workstation state (not GitHub main)
- scripts/atlas/ast-treesitter-facts.mjs — real TreeSitter implementation
- sveltekit-frontend/src/lib/server/atlas/indexing/tree-sitter-chunker.ts — chunker integration

Next Steps:
1. Ownership corrected in all architectural documents ✓
2. NLP sidecar structure documented with proper hierarchy ✓
3. Semantic alignment pipeline updated to 11 stages ✓
4. Stanza benchmarking (ablation: with vs without linguistic pass) ⏳
