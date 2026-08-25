## Context

`sveltekit-frontend/src/lib/server/retrieval/runtime-reranker.ts` is the actual base contract
(not `canonical-rerank-executor.ts`, which wraps it) — confirmed by reading the source, not
assumed. It already defines:

- `SIGNAL_KEYS = ['dense', 'bm25', 'ast', 'graph', 'pagerank', 'domain', 'crossEncoder']`
- `RerankCandidateSchema` with optional `astScore`, `graphScore`, `pagerankScore`, `domainScore`
  fields
- `blendScores()` — a weighted average over whichever signals are present, skipping `undefined`
  ones and renormalizing by active weight
- `BlendWeightsSchema` — `.strict()` zod object, `.superRefine()`-enforced to sum to exactly `1.0`

Live callers already populate `graphScore`/`pagerankScore`/`astScore` for real (verified via
`grep`, not assumed): `retrieval/candidate-scorer.ts`, `ai/graph-reranker.ts`,
`atlas/retrieval/graph-retriever.ts`, `ace/token-aware-packer.ts`,
`features/ai/ace/context-assembler.ts`. This blend is a live, operating system today, not a stub —
the gap is narrower than the original request implied: it's specifically about (a) confirming
`graphScore`/`pagerankScore` actually derive from the spectral/Katz-eigenvector outputs proposed
below rather than a single simpler algorithm, and (b) adding static-vs-dynamic and
user-vs-AI-generated as new derived inputs somewhere in this pipeline.

`domainScore`'s current real-world meaning is **unverified** — in a legal-AI platform, "domain" is
plausibly already legal-subject-matter classification (evidence type, statute area, etc.), not
provenance. Repurposing it without checking would risk silently corrupting an existing signal.

## Goals / Non-Goals

**Goals:**
- Add a static-vs-dynamic code classification signal, derived from the existing AST-grep pipeline.
- Extend `source-kind-classifier.ts`'s `SourceKind` (`ai_generated`, `user_note`, etc.) to code
  symbols, and surface it as a rerank input.
- Verify (not assume) whether `graphScore`/`pagerankScore` already carry Katz/eigenvector-derived
  authority, or only plain PageRank — and wire in the spectral outputs if not.
- Do all of this without breaking `BlendWeightsSchema`'s `.strict()` + sum-to-1 contract or any
  existing caller that constructs a full `BlendWeights` object today.

**Non-Goals:**
- No new reranker, classifier, graph algorithm, or KV-cache layer.
- No new top-level `SIGNAL_KEYS` entries unless Decision 1 below is proven necessary and every
  existing `BlendWeights`-constructing caller is updated in the same change (see Risks).
- No CUDA token-feature-mapping work — deferred to a follow-up change pending its own audit
  (unverified whether it exists at all; see proposal.md).
- No change to `atlas_chunk_packet_identity_links` or the `S512-ID3`/`S512-ID4` gate — unrelated,
  separately owned in `parent-atlas-semantic-512-canonicalization`.

## Decisions

**Decision 1 — where do the two new signals live: new `SIGNAL_KEYS` entries, or folded into an
existing slot?**

**SUPERSEDED by Decision 2's resolution** — originally framed as "fold into `astScore`" pending
the `domainScore` safety check; now that `domainScore` is confirmed free (Decision 2), the two new
signals compose into `domainScore` instead of `astScore`. The core reasoning still applies to
*why not* a new top-level `SIGNAL_KEYS` entry: `.strict()` + `superRefine(sum === 1)` means every
existing `DEFAULT_BLEND_WEIGHTS`-style object anywhere in the codebase would need a matching
update in the same commit, and this codebase's own audit history (root `CLAUDE.md`'s Duplication
Prevention section) already flagged 14 unclassified reranker files from past sessions — a wider
blast radius risks recreating exactly that fragmentation. New `SIGNAL_KEYS` entries remain a
documented fallback if the `domainScore` composite turns out to lose too much signal resolution
during implementation.

**Decision 2 — is `domainScore` available for provenance, or already spoken for?**

**RESOLVED (tasks.md 1.2/1.3): yes, use `domainScore`.** Verified via `grep` that zero real
callers construct a `FusedCandidateInput`/`RerankCandidate` with a populated `domainScore` along
the live RRF fusion → `candidate-scorer.ts` → `runtime-reranker.ts` path this change targets.
`canonical-rerank-executor.ts`'s `canonicalEnvelopeToRerankCandidate()` sets `domainScore:
envelope.metadata?.score` (a duplicate of the generic metadata score, not real domain
classification), and that value is weighted at `DEFAULT_CANONICAL_RERANK_WEIGHTS.domain = 0.00`
in its one real consumer (`MixedbreadCanonicalReranker`) — inert either way. The only real
legal-domain-classification "domain" concept in this codebase lives in a **wholly separate**
reranker, `semantic-vector-reranker.ts` (own `RerankScores` shape, own `blendWeights.domain_match`,
own `getDomainScore(packet.domainClass)`) — not connected to `runtime-reranker.ts`'s
`blendScores()`/`SIGNAL_KEYS` contract at all, so there is no collision risk.

**This reverses the original default (fold into `astScore`).** That default was chosen specifically
because `domainScore`'s safety was unverified at design time; now that it's confirmed free, it's
strictly better than folding into `astScore` — it preserves the independent-tunability that
Decision 1's own "Risks" section flagged as the cost of the `astScore`-folding approach, with none
of the downside. `SIGNAL_KEYS`/`BlendWeightsSchema`/`DEFAULT_BLEND_WEIGHTS` remain fully
unchanged — `domain` is already a first-class key, just newly populated.

The two default weight tables (`runtime-reranker.ts`'s `DEFAULT_BLEND_WEIGHTS.domain = 0.1` vs.
`canonical-rerank-executor.ts`'s `DEFAULT_CANONICAL_RERANK_WEIGHTS.domain = 0.00`) were found
*not* to actually disagree for the same call path — they're intentional presets for two different
`RuntimeReranker` implementations (deterministic vs. Mixedbread cross-encoder tier). See tasks.md
1.3 for the full reconciliation, including a newly-found third, unrelated same-named
`DEFAULT_BLEND_WEIGHTS` const in `cross-ranker.ts` (module-local, harmless, but a naming footgun
recorded for a future cleanup pass — not fixed here, out of scope).

**Decision 3 — graph/spectral authority: verify before wiring.**

**RESOLVED, but with a correction that reverses task 4.2's original plan: do not wire anything.**
Confirmed (tasks.md 1.1) both `ai/graph-reranker.ts:213-220` and
`atlas/retrieval/graph-retriever.ts:98-107` use plain Neo4j PageRank with no reference to Katz or
eigenvector centrality. The original plan was to extend them to consume
`atlas/spectral/spectral-rtx-alignment-fixture-v1.ts`'s output instead — **but reading that file
found it is explicitly `backend: 'MOCK_CPU_REFERENCE'`, `rtxGemm.parity: 'FIXTURE_ONLY'`,
`canonicalWritesAllowed: false`, `identityAuthority: false`, `promotionEligible: false`** (its own
zod schema, `.strict()`-enforced literals — not an inference). It also isn't Katz/eigenvector
centrality at all: it computes `NORMALIZED_LAPLACIAN` spectral **clustering** into
`clusterCount` buckets, a different algorithm family from a per-node centrality score. Wiring a
live reranker to a schema-enforced non-promotable mock would silently promote fixture data into
production ranking — exactly what root `CLAUDE.md`'s Status Language rules exist to prevent.

**Broader correction: Katz centrality does not exist anywhere in this codebase.**
`grep -rni katz sveltekit-frontend/src` returns exactly one match, `Katz v. United States` (a
Fourth Amendment case in `data/legal-seed-data.ts`) — completely unrelated. The second candidate
checked, `atlas/graph/atlas-rapids-pagerank-client.ts`, is also plain PageRank (`backend:
'cugraph.pagerank'`, a GPU/cuGraph-backed implementation) — a different PageRank *implementation*,
not a different *algorithm*. Root `CLAUDE.md` already documents a prior audit finding "5
competing PageRank implementations"; wiring in a 6th (this cuGraph client) to satisfy "Katz
eigenvector" would neither deliver what was asked nor avoid deepening that already-flagged
duplication.

**Conclusion**: task 4.2 is out of scope per this proposal's own Non-Goals ("No new... graph
algorithm"). `ai/graph-reranker.ts` and `atlas/retrieval/graph-retriever.ts` are left untouched.
If real Katz/eigenvector centrality is genuinely wanted, that is new algorithm work requiring its
own proposal — not something to smuggle into a ranking-consolidation change that explicitly
commits not to add one.

## Risks / Trade-offs

- [Repurposing `domainScore` without checking corrupts an existing legal-domain-classification
  signal] → Verified (tasks.md 1.2): no real caller on the targeted path populates it, and the one
  real "domain" concept in the codebase (`semantic-vector-reranker.ts`) is a separate,
  disconnected reranker. Resolved, not just mitigated.
- [Composing new signals into a single `domainScore` field loses independent tunability if a
  future need arises to weight static-vs-dynamic separately from provenance] → acceptable
  trade-off for the smaller blast radius; the new-`SIGNAL_KEYS` alternative (Decision 1) remains
  documented as a fallback if evidence during implementation shows the composite is too coarse.
- [Two default weight tables reference `domain`] → Verified (tasks.md 1.3): not actually
  disagreeing — two intentional presets for two different `RuntimeReranker` implementations. A
  third, unrelated same-named `DEFAULT_BLEND_WEIGHTS` const in `cross-ranker.ts` was found as a
  naming footgun; recorded, not fixed (out of scope).
- [CUDA token-feature-mapping claim in the original request may not correspond to anything real]
  → Verified (tasks.md 1.4): confirmed absent via live addon introspection. Explicitly deferred to
  a follow-up change (Non-Goals), not attempted here.

## Migration Plan

1. ~~Confirm `domainScore`'s real current meaning~~ — **done**, see Decision 2 / tasks.md 1.2-1.3.
2. ~~Confirm `graphScore`/`pagerankScore`'s current derivation~~ — **done**, see Decision 3 /
   tasks.md 1.1.
3. Add static-vs-dynamic classification derivation to the AST-grep pipeline output (additive new
   field on the existing candidate shape, not a schema-breaking change).
4. Extend `source-kind-classifier.ts`'s `classifySourceKind()` (or a sibling function, if code
   symbols need different heuristics than documentation files) to accept code symbols.
5. Wire both into `domainScore`'s computation in `candidate-scorer.ts` behind a documented
   composite-scoring note (versioned) distinguishing this from the field's dormant prior state.
6. Extend `ai/graph-reranker.ts` and `atlas/retrieval/graph-retriever.ts` to consume the spectral
   adapter's Katz/eigenvector output in place of plain PageRank (Decision 3).
7. No rollback complexity — every step above is additive to an optional field computation; the
   blend already tolerates `undefined` signals via `blendScores()`'s active-weight renormalization,
   so a bad new signal can be reverted by simply not populating it, without touching the schema.

## Open Questions

All resolved during implementation (tasks.md section 1) — see Decisions 2 and 3 above and tasks.md
1.1-1.4 for the verified answers. None remain blocking sections 2-5.
