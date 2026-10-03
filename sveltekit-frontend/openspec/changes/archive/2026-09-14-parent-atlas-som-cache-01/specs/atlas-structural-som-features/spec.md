## ADDED Requirements

### Requirement: Structural feature vectors are derived from graph structure alone, never conflated with real embeddings
The system SHALL compute each node's SOM-training feature vector deterministically from
`GraphFixtureV1`'s existing edge lists (out-degree, in-degree, edge-type distribution), and SHALL
label this representation as a structural feature vector distinct from any real production
semantic embedding (e.g. `embeddinggemma` `semantic_768` vectors).

#### Scenario: Feature vector generation requires no new fixture or external data
- **WHEN** structural feature vectors are computed for a `SOM-CACHE-01` run
- **THEN** the computation reads only `GraphFixtureV1`'s existing node/edge data — no new synthetic
  graph, no canonical production embedding table

#### Scenario: Result artifacts label the feature representation explicitly
- **WHEN** a SOM training or tournament result artifact is produced
- **THEN** it labels the feature vectors as `StructuralFeatureVectorV1` (or an equivalently explicit
  name), never as an unqualified "embedding"

### Requirement: SOM training is deterministic and CPU-only
The system SHALL train the SOM using a fixed seed, a fixed grid size, and a fixed (non-shuffled)
training-sample order, entirely on CPU, and SHALL NOT require CUDA or GPU device access to
reproduce a given training run byte-for-byte.

#### Scenario: SOM training is reproducible
- **WHEN** SOM training is run twice with the same seed and fixture
- **THEN** the resulting BMU-grid assignment for every node is identical across both runs

#### Scenario: SOM training runs without a GPU
- **WHEN** SOM training executes on a host with no CUDA-capable device
- **THEN** training completes successfully and produces the same result as it would on a
  CUDA-capable host
