# Phase alignment: HMM/Viterbi → MCP/DAG → prefill/decode

- [x] PA-01 Define a revision-qualified phase alignment input and receipt.
- [x] PA-02 Block quarantine before MCP/model dispatch.
- [x] PA-03 Require exact evidence before prefill.
- [x] PA-04 Require reusable prefill identity before decode.
- [x] PA-05 Keep encoder-training admission explicitly false.
- [x] PA-06 Add package export and deterministic fixture tests.
- [x] PA-07 Bind the receipt to the existing bounded tool caller and LangGraph synthesis node without creating a second executor.
- [x] PA-08 Prove dependency-injected prefill MISS → compile → decode and HIT replay.
- [x] PA-09 Prove quarantine produces zero dispatches in the bounded caller fixture; live DAG replay remains open.
- [x] PA-10 Add Valkey adapter binding with checksum-validated fixture readback and no KV payload.
- [x] PA-11 Add and fixture-test a lineage-qualified encoder-training dataset receipt; real dataset generation and training promotion remain blocked.
- [x] PA-12 Run live hforf.gguf tool-call replay through the bounded phase/DAG harness; injected execution is dry-run only and durable business dispatch remains gated.
- [x] PA-13 Add the opt-in phase envelope at the legacy MCP dispatcher boundary; quarantine blocks before the existing handler and allowed calls return the receipt without passing phase metadata to the executor.
