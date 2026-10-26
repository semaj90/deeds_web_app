# Domain Crosswalk Fixture Readback V1

Status: `PROPOSAL_ONLY_REVIEW_REQUIRED`

## Captured source evidence

- Source: `https://huggingface.co/google/embeddinggemma-2/raw/main/README.md`
- Local capture: `docs/.okf/embeddinggemma2/hf-README.md`
- Capture SHA-256: `b677a0ee2818c36f091b65fd3d9b4baea9f04d53b02b49cae916c74bf9682037`
- Exact grounded text: `retrieval-augmented generation (RAG)`
- Unicode character span: `[1621, 1657)`
- UTF-8 byte span: `[1625, 1661)`
- Span bytes decode exactly to the grounded text; the source digest matches
  `crawl-receipt.json`.
- This is a source-capture check, not an authenticated workspace grant or a
  current canonical Atlas source revision.

## OAKLIB candidate readback

- Taxonomy owner: `postgresql18.public.atlas_domain_ontology`, exported
  read-only as a shadow OBO snapshot with 17 classes and 4 parent edges.
- Source taxonomy revision:
  `sha256:2cd1f71d88141fd29d7f3e84169e9967d55beaeafde91d446a9f4e69bbebf8c0`
- OBO snapshot revision:
  `sha256:179f022f668d7f7a276a73e90cdfcb5d29cfa681cef8f0f3ad19721853e24e3e`
- OAKLIB lexical search for grounded tokens `retrieval` and `search` returned
  no candidates. Searching the taxonomy's exact preferred label
  `Information Retrieval` returned `ATLAS-DOMAIN:retrieval` as a proposal.
- Candidate: `oaklib-concept-candidate:3f88c94d8e4de6dae27d6f3b12ce72d8`.
- Crosswalk outcome remains `REVIEW_REQUIRED`; the phrase is not an exact label
  match, and no BROADER/NARROWER mapping is asserted from this lookup.

## Admission boundary

No `OntologyLinkedTupleV1` was created. Workspace revision and actor/source
authorization are absent; no reviewer approved the candidate. The in-process
Windows sidecar/OAKLIB lookup is not evidence that the route is deployed on live
`:8095`. No database, cache, vector index, or model was written or run.
