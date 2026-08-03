# Library Integration Audit

Generated at: 2026-08-03T09:19:26.926Z

Snapshot source: C:\Users\james\Videos\deeds-web-app\docs\reports\library-registry-2026-08-02.json

## Status Summary

- IMPORTED_UNPROVEN: 14
- MISSING: 4

## Candidate Matrix

| Library | Ecosystem | Declared | Resolved | Installed | Imported | Invoked | Status |
|---|---|---:|---:|---|---|---|---|
| `npm:tree-sitter` | npm | 0.25.0 | 0.25.0 | yes | yes | yes | IMPORTED_UNPROVEN |
| `python:ast-grep-py` | python | — | 0.44.1 | yes | yes | yes | IMPORTED_UNPROVEN |
| `npm:ts-morph` | npm | 27.0.2 | 27.0.2 | yes | yes | yes | IMPORTED_UNPROVEN |
| `python:langextract` | python | — | 0.1.0 | yes | yes | yes | IMPORTED_UNPROVEN |
| `npm:opentelemetry` | npm | 1.9.1 | 1.9.0 | yes | yes | yes | IMPORTED_UNPROVEN |
| `npm:langfuse` | npm | — | — | no | no | no | MISSING |
| `npm:langchain` | npm | ^1.0.0 | 0.3.26 | yes | yes | yes | IMPORTED_UNPROVEN |
| `npm:mastra` | npm | — | 0.1.26 | yes | yes | yes | IMPORTED_UNPROVEN |
| `npm:qdrant-js` | npm | 1.15.1 | 1.15.1 | yes | yes | yes | IMPORTED_UNPROVEN |
| `npm:neo4j` | npm | — | — | no | yes | yes | IMPORTED_UNPROVEN |
| `npm:kafkajs` | npm | — | — | no | no | no | MISSING |
| `npm:openwiki` | system | — | — | no | no | no | MISSING |
| `python:torch` | python | — | 2.8.0+cu128 | yes | yes | yes | IMPORTED_UNPROVEN |
| `python:cupy` | python | — | — | no | yes | yes | IMPORTED_UNPROVEN |
| `python:cuvs` | python | — | — | no | yes | yes | IMPORTED_UNPROVEN |
| `python:cugraph` | python | — | — | no | yes | yes | IMPORTED_UNPROVEN |
| `python:spacy` | python | — | 3.8.14 | yes | yes | yes | IMPORTED_UNPROVEN |
| `python:deepspeed-or-llm-runtime` | system | — | — | no | no | no | MISSING |

## Evidence Notes

- npm:tree-sitter: sveltekit-frontend\package.json ; docs\reports\library-registry-2026-08-02.json:npm:tree-sitter@0.25.0 ; python\miniforge_nlp_sidecar.py:10:- tree-sitter chunking when available ; python\miniforge_nlp_sidecar.py:59:    for candidate in ("treesitter_chunker", "tree_sitter_chunker", "chunker"):
- python:ast-grep-py: docs\reports\library-registry-2026-08-02.json:pip:ast-grep-py@0.44.1 ; python\miniforge_nlp_sidecar.py:94:    from ast_grep_py import SgRoot  # type: ignore ; python\miniforge_nlp_sidecar.py:95:    AST_GREP_AVAILABLE = True ; python\miniforge_nlp_sidecar.py:98:    AST_GREP_AVAILABLE = False
- npm:ts-morph: package.json ; docs\reports\library-registry-2026-08-02.json:npm:ts-morph@27.0.2 ; packages\atlas-core\src\evidence\index.ts:6:export * from './lanes/ts-morph.js'; ; scripts\atlas\extract-symbol-map.mjs:26:import { Project } from 'ts-morph';
- python:langextract: docs\reports\library-registry-2026-08-02.json:pip:langextract@0.1.0 ; python\tests\test_parent_atlas_networkx_pagerank.py:37:    assert payload["imports"]["langextract"]["available"] is True ; python\tests\test_parent_atlas_networkx_pagerank.py:38:    assert payload["imports"]["langextract"]["importVerified"] is True ; python\tests\test_parent_atlas_networkx_pagerank.py:39:    assert payload["imports"]["langextract"]["version"] == "0.1.0"
- npm:opentelemetry: sveltekit-frontend\package.json ; docs\reports\library-registry-2026-08-02.json:npm:@opentelemetry/api@1.9.0 ; sveltekit-frontend\ecosystem.config.cjs:120:    // ACP OBSERVABILITY: OpenTelemetry tracer + MongoDB-style retry logic ; sveltekit-frontend\ecosystem.config.cjs:123:      name: 'acp-opentelemetry-collector',
- npm:langfuse: scripts\graph\build-deep-relations-jsonl.mjs:40:            langfuse = new Langfuse({ ; sveltekit-frontend\scripts\agentic-error-fix.mjs:194:    return new Langfuse({ secretKey: LANGFUSE_SK, publicKey: LANGFUSE_PK, baseUrl: LANGFUSE_BASE });
- npm:langchain: package.json ; docs\reports\library-registry-2026-08-02.json:pip:langchain@0.3.26 ; scripts\gemma3-legal-agent.mjs:7:import { ChatOllama } from '@langchain/ollama'; ; scripts\gemma3-legal-agent.mjs:9:import { Tool } from '@langchain/core/tools';
- npm:mastra: docs\reports\library-registry-2026-08-02.json:npm:@mastra/core@0.1.26 ; packages\atlas-core\src\langgraph\types.ts:2: * LangGraph run types and Mastra agent contracts. ; packages\atlas-core\src\langgraph\types.ts:9: *   AgentDefinition — Contract for a Mastra reasoning worker invoked as a ; packages\atlas-core\src\langgraph\types.ts:11: *                     Mastra owns the tool-choosing reasoning step.
- npm:qdrant-js: package.json ; docs\reports\library-registry-2026-08-02.json:npm:@qdrant/js-client-rest@1.15.1 ; packages\atlas-core\src\langgraph\worker.ts:34:import type { QdrantClient } from '@qdrant/js-client-rest'; ; packages\atlas-core\src\langgraph\example-usage.ts:13:import { QdrantClient } from '@qdrant/js-client-rest';
- npm:neo4j: scripts\atlas\atlas-startup-intelligence.mjs:104:    const neo4j = await import('neo4j-driver'); ; scripts\atlas\apply-parent-atlas-cypher.mjs:4:import neo4j from 'neo4j-driver'; ; scripts\atlas\audit-higher-hop-enrichment.mjs:24:import neo4j from 'neo4j-driver'; ; scripts\atlas\audit-higher-hop-enrichment-fields.mjs:18:import neo4j from 'neo4j-driver';
- npm:kafkajs: no evidence refs
- npm:openwiki: sveltekit-frontend\src\lib\server\agents\agents-context-source.ts:2: * OKF (OpenWiki Knowledge Format) Context Source ; sveltekit-frontend\src\lib\server\agents\agents-context-source.ts:226:	ctx += `[OpenWiki Knowledge Format v1.0.0 - docs/.okf/schema.yaml]\n\n`;
