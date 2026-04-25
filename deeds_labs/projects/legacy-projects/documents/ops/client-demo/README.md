Client-side demo: transformers.js + WebGPU + SharedArrayBuffer
=============================================================

This folder contains a short explanation of a client-side pattern for local embeddings and low-latency retrieval.

Key ideas
- Use transformers.js (or onnxruntime-web) with WebGPU to run a small Gemma model (e.g., gemma-270m) in-browser for immediate suggestions.
- Use SharedArrayBuffer + Web Workers to parallelize tokenization and batching.
- Cache top-k centroids or precomputed similarity vectors in IndexedDB or call backend Redis cache for warm results.

COOP/COEP requirements

To use SharedArrayBuffer in modern browsers, you must serve the page with the following headers:
- Cross-Origin-Opener-Policy: same-origin
- Cross-Origin-Embedder-Policy: require-corp

Example flow
1. Main thread allocates a SharedArrayBuffer and populates tokens or text offsets.
2. Post the SAB to a Worker; Worker uses transformers.js + WebGPU to compute embeddings.
3. Worker posts embeddings back to main thread; main thread queries backend /ranker or runs local WASM Qdrant for ANN.

This repo already contains a static example under `sveltekit-frontend/static/examples/embed-worker/`.

*** End of README
