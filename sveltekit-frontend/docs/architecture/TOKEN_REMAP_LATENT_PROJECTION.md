# Token Remap + Latent Projection

Model-facing token ids remain owned by the model tokenizer. Atlas creates a parallel `TokenFeatureMap` carrying byte span, engram key, AST/ontology/domain IDs, entropy/surprisal, feature ID, and packet key.

Discrete token/engram IDs are not interpolated. Numeric derived representations may be projected or quantized.

Production candidate:

`semantic_768 -> deterministic AE -> latent_128`

Research only:

`semantic_768 -> VAE(mu, sigma) -> sampled latent`

The VAE exists only for uncertainty/generative topology experiments; it is not required for Ornith inference or token remapping.
