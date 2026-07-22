/**
 * ACE Features Layer: Deterministic Feature Extraction & SOM Clustering
 * Gate 12 execution: 4-5 hours for 61,659 packets
 *
 * Pipeline:
 * 1. FeatureVectorGenerator: Lexical + Structural + Semantic features (40-dim)
 * 2. TreeNodeExtractor: SHA-256 node IDs per language (TS/Rust/C++)
 * 3. DomainClassifier: 13-class rule-based domain classification
 * 4. SomClusterer: K-Means 20×20 SOM grid (GPU via N-API or CPU fallback)
 * 5. FeatureExtractionOrchestrator: End-to-end pipeline orchestration
 */

export * from './feature-vector-generator.js';
export * from './tree-node-extractor.js';
export * from './domain-classifier.js';
export * from './som-clustering.js';
export * from './feature-extraction-orchestrator.js';
