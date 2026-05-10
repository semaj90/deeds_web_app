// Cartridge rerank compute shader — client-side top-N scoring for UI.
// Bindings:
//   0,0  features[]  — read-only CartridgeFeatures array
//   0,1  weights     — read-only RerankWeights (7 floats)
//   0,2  scores[]    — read-write Float32 output (one score per doc)
//
// All canonical retrieval/rerank logic lives server-side (LibTorch/CUDA).
// This shader is strictly a UI-acceleration layer for local sorting/highlighting.

struct CartridgeFeatures {
    pagerank:       f32,  // normalised [0,1] from Redis gpu:karpathy:scores
    semantic_score: f32,  // Qdrant cosine similarity [0,1]
    tag_score:      f32,  // tag overlap fraction [0,1]
    export_score:   f32,  // export match fraction [0,1]
    route_proximity:f32,  // inverted route-distance [0,1]
    som_boost:      f32,  // SOM grid proximity boost [0,1]
    trust_tier:     f32,  // T1=1.0 T2=0.833 T3=0.792 T4=0.583 T5=0.500
    _pad:           f32,  // align to 32 bytes
};

struct RerankWeights {
    pagerank:        f32,
    semantic:        f32,
    tag_match:       f32,
    export_match:    f32,
    route_proximity: f32,
    som_boost:       f32,
    recency:         f32,
    _pad:            f32,
};

@group(0) @binding(0) var<storage, read>       features : array<CartridgeFeatures>;
@group(0) @binding(1) var<storage, read>       weights  : RerankWeights;
@group(0) @binding(2) var<storage, read_write> scores   : array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= arrayLength(&features)) { return; }

    let f = features[i];
    let w = weights;

    let base =
        f.pagerank        * w.pagerank        +
        f.semantic_score  * w.semantic        +
        f.tag_score       * w.tag_match       +
        f.export_score    * w.export_match    +
        f.route_proximity * w.route_proximity +
        f.som_boost       * w.som_boost;

    // Trust-tier multiplier: T1 gets a 20% boost, T4/T5 are dampened.
    // Values mirror TRUST_SCORE_MULTIPLIER in src/lib/server/ace/types.ts.
    scores[i] = clamp(base * f.trust_tier, 0.0, 1.0);
}
