# EmbeddingGemma reference parity audit — 2026-08-20

## Result

`REFERENCE_PARITY_NOT_PROVEN`

The local SentenceTransformers model files exist under
`models/embeddinggemma_300m`, including the model weights, tokenizer, pooling,
and dense projection modules. The bounded default Python 3.13 dependency
probe did not complete a `sentence_transformers` import within 30 seconds, so
no reference vector was produced and no GGUF parity claim is made.

## Proven separately

- llama.cpp GGUF executor: live 768d prompt/runtime proof passed.
- Live MRL projection: 768/512/256/128 prefix plus L2 normalization passed.
- No Qdrant, Postgres, Valkey, or embedding artifact writes occurred.

## Required next proof

Run the reference model from its compatible ML environment against the same
three prompt fixtures, then compare dimension, norm, cosine similarity,
element deltas, and top-K agreement with the llama.cpp output. Keep model,
prompt, tokenizer, pooling, and normalization revisions in the receipt.
