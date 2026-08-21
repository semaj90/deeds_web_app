# EmbeddingGemma MRL contract proof — 2026-08-20

Implemented `truncateEmbeddingGemmaMrl` beside the canonical `semantic_768`
contract. It accepts only 768, 512, 256, or 128; validates the source is an
exact finite 768-dimensional vector; truncates the prefix; and L2
re-normalizes the derived representation. Arbitrary widths, including 384,
fail closed.

Validation:

- `npx vitest run src/lib/server/embedding/embedding-contract-768.spec.ts` — 6/6 passed.
- `npm run atlas:vector-lanes:smoke` — 6/6 passed.
- `git diff --check` — passed with existing line-ending warnings.

This does not create a sparse model, replace SPLADE/miniCOIL, change Ollama,
write Qdrant/pgvector, or alter TurboVec ownership. The compact vectors remain
derived routing/LOD representations until separate recall and persistence
proofs promote them.

Prompt construction is now owned beside the representation contract for
`retrieval_query`, `code_query`, and `document` inputs. Prompt/runtime parity
with the local GGUF llama.cpp executor remains open.

The read-only GGUF probe is now available as
`npm run atlas:embedding:gemma:llama:proof`. The live run returned `PROVEN`
for all three prompt modes with stable 768-dimensional finite normalized
vectors. The binary did not expose `--embd-normalize`; normalization was
validated from the observed vectors. No model, Qdrant, Postgres, Valkey, or
embedding artifact writes occurred.

The live MRL probe also passed for all four representations (`768/512/256/128`)
derived from one 768d response. The derived vectors remain disposable runtime
representations until separate recall and persistence gates pass.
