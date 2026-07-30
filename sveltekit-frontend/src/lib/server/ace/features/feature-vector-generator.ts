import { z } from 'zod';

/**
 * Feature vector schema with support for:
 * - 40-dim hand-crafted features (lexical, structural, semantic)
 * - 512-dim MRL semantic embeddings (evaluation candidate)
 * - Optional fallback to 768-dim dense (primary retrieval)
 * - Reference-only 384-dim routing, 64-dim topology
 */
export const FeatureVectorSchema = z.object({
  packetKey: z.string(),
  sourceRef: z.string(),
  features: z.array(z.number()), // Hand-crafted features (40-dim)
  dimension: z.number(), // Total output dimension
  modelVersion: z.string(),
  embedding: z.array(z.number()).optional(), // 512-dim MRL semantic embedding
  embeddingDimension: z.number().optional(), // Actual embedding dimension (512 or 768)
  embeddingModel: z.string().optional() // Model used (embeddinggemma:latest)
});

export type FeatureVector = z.infer<typeof FeatureVectorSchema>;

export interface FeatureExtractorConfig {
  maxVocabulary: number;
  embedding: {
    model: string;
    dimension: number; // Total output dimension (e.g., 512 for MRL)
  };
  semanticEmbedding?: {
    enabled: boolean; // Enable 512-dim MRL semantic embeddings
    model: string; // embeddinggemma:latest (canonical 512-dim MRL)
    fallbackDimension: number; // 768 (primary) or 384 (routing reference)
  };
}

/**
 * Feature vector generator for ACE packets.
 *
 * Extracts three layers of features:
 * 1. Lexical (20-dim): path tokens, keywords, code metrics
 * 2. Structural (10-dim): nesting, block sizes, comment density, type annotations
 * 3. Semantic (10-dim): domain signals (auth, data, api, ui, gpu, etc.)
 * 4. Embedding (512-dim): semantic embedding via embeddinggemma (MRL evaluation candidate)
 *
 * Output options:
 * - Hand-crafted only: 40-dim (lexical + structural + semantic)
 * - With embedding: 512-dim MRL (semantic) OR 768-dim dense (primary fallback)
 * - Hybrid: 40-dim hand-crafted + 512-dim embedding = 552-dim compound
 */
export class FeatureVectorGenerator {
  private vocabulary: Map<string, number> = new Map();
  private config: FeatureExtractorConfig;
  private dimension: number;
  private semanticEmbeddingEnabled: boolean;

  constructor(config: FeatureExtractorConfig) {
    this.config = config;
    this.dimension = config.embedding.dimension;
    this.semanticEmbeddingEnabled = config.semanticEmbedding?.enabled ?? false;
  }

  /**
   * Generate semantic embedding via embeddinggemma (512-dim MRL evaluation candidate).
   * Fallback to 768-dim dense if MRL unavailable.
   */
  async generateSemanticEmbedding(text: string): Promise<number[] | undefined> {
    if (!this.semanticEmbeddingEnabled) {
      return undefined;
    }

    try {
      const { generateSingleEmbedding } = await import('../../grpc/embedding-client.js');
      // embeddinggemma returns 512-dim by default (MRL evaluation candidate)
      const embedding = await generateSingleEmbedding(text);
      return embedding;
    } catch (err) {
      console.warn('[FeatureVectorGenerator] Semantic embedding failed:', err);
      return undefined;
    }
  }

  // Lexical features: path tokens, function names, keywords
  extractLexicalFeatures(sourceRef: string, content: string): number[] {
    const features = new Float32Array(20).fill(0); // Only allocate what we use (20-dim)

    // Path-based features
    const pathTokens = sourceRef.split(/[\/\\-_.]/).filter(t => t);
    for (const token of pathTokens) {
      if (token === 'lib') features[0]++;
      if (token === 'server') features[1]++;
      if (token === 'api') features[2]++;
      if (token === 'components') features[3]++;
      if (token === 'utils') features[4]++;
    }

    // Keyword features (normalized)
    const keywords = [
      ['async', 'await', 'promise', 'promise'],
      ['function', 'class', 'interface', 'type'],
      ['import', 'export', 'module'],
      ['query', 'fetch', 'request'],
      ['error', 'exception', 'throw', 'catch']
    ];

    for (let i = 0; i < keywords.length; i++) {
      for (const keyword of keywords[i]) {
        const count = (content.match(new RegExp(keyword, 'gi')) || []).length;
        features[5 + i] += count;
      }
    }

    // Line count feature
    const lineCount = content.split('\n').length;
    features[10] = Math.min(lineCount / 1000, 1.0); // Normalize to [0,1]

    // Complexity: function count, class count, imports
    features[11] = (content.match(/function\s+\w+/gi) || []).length / 10;
    features[12] = (content.match(/class\s+\w+/gi) || []).length / 5;
    features[13] = (content.match(/import\s+/gi) || []).length / 20;

    return Array.from(features.slice(0, 20));
  }

  // Structural features: AST patterns (10-dim)
  extractStructuralFeatures(content: string): number[] {
    const features = new Float32Array(10).fill(0);

    // Nesting depth (simple approximation)
    const maxNestingDepth = Math.max(
      ...content.split('\n').map(line => {
        const opens = (line.match(/{/g) || []).length;
        const closes = (line.match(/}/g) || []).length;
        return opens - closes;
      })
    );
    features[0] = Math.min(maxNestingDepth / 10, 1.0);

    // Block sizes
    const blockSizes = content.match(/{[^{}]*}/g)?.map(b => b.length) || [];
    features[1] = blockSizes.length > 0 ? Math.min(Math.max(...blockSizes) / 1000, 1.0) : 0;

    // Comment density
    const commentLines = (content.match(/\/\/.*/g) || []).length;
    const totalLines = content.split('\n').length;
    features[2] = commentLines / Math.max(totalLines, 1);

    // Type annotations (TypeScript)
    features[3] = (content.match(/:\s*\w+/g) || []).length / 100;

    return Array.from(features.slice(0, 10));
  }

  // Semantic features: high-level indicators (10-dim)
  extractSemanticFeatures(sourceRef: string, content: string): number[] {
    const features = new Float32Array(10).fill(0);

    // Authorship signals
    if (/auth|session|login|password|token/i.test(content)) features[0] = 1;
    if (/database|query|schema|migration/i.test(content)) features[1] = 1;
    if (/cache|redis|bitfrost|memcache/i.test(content)) features[2] = 1;
    if (/test|spec|mock|fixture/i.test(content)) features[3] = 1;
    if (/api|route|endpoint|server/i.test(sourceRef)) features[4] = 1;
    if (/ui|component|svelte|react/i.test(sourceRef)) features[5] = 1;
    if (/worker|thread|async|queue/i.test(content)) features[6] = 1;
    if (/gpu|cuda|tensor|model|pytorch/i.test(content)) features[7] = 1;

    return Array.from(features.slice(0, 10));
  }

  /**
   * Generate feature vector with optional 512-dim MRL semantic embeddings.
   *
   * Output modes:
   * 1. Hand-crafted only: 40-dim (lexical + structural + semantic)
   * 2. With 512-dim MRL embedding: 512-dim semantic (primary)
   * 3. Fallback to 768-dim dense: 768-dim semantic (if MRL unavailable)
   * 4. Hybrid: 40-dim hand-crafted + 512-dim embedding = 552-dim compound
   */
  async generateFeatureVector(
    packetKey: string,
    sourceRef: string,
    content: string
  ): Promise<FeatureVector> {
    const lexical = this.extractLexicalFeatures(sourceRef, content);
    const structural = this.extractStructuralFeatures(content);
    const semantic = this.extractSemanticFeatures(sourceRef, content);

    // Combine hand-crafted features (40 total: 20 lexical + 10 structural + 10 semantic)
    const combinedFeatures = [...lexical, ...structural, ...semantic];

    // Pad hand-crafted features to 40-dim
    const handCraftedVector = new Array(40).fill(0);
    for (let i = 0; i < Math.min(combinedFeatures.length, 40); i++) {
      handCraftedVector[i] = combinedFeatures[i];
    }

    // Generate semantic embedding if enabled (512-dim MRL evaluation candidate)
    let embeddingVector: number[] | undefined;
    let embeddingDim: number | undefined;
    let embeddingModel: string | undefined;

    if (this.semanticEmbeddingEnabled && this.config.semanticEmbedding) {
      embeddingVector = await this.generateSemanticEmbedding(
        `${sourceRef}\n${content.slice(0, 500)}`
      );

      if (embeddingVector) {
        embeddingDim = embeddingVector.length;
        embeddingModel = this.config.semanticEmbedding.model;
      }
    }

    // Determine output vector based on configuration
    let outputVector: number[];

    if (embeddingVector) {
      // Use embedding as primary output (512-dim MRL or 768-dim fallback)
      outputVector = embeddingVector;
    } else {
      // Fallback to hand-crafted features only (40-dim)
      outputVector = handCraftedVector;
    }

    // Pad or trim to configured dimension if needed
    if (outputVector.length < this.dimension) {
      const padded = new Array(this.dimension).fill(0);
      for (let i = 0; i < outputVector.length; i++) {
        padded[i] = outputVector[i];
      }
      outputVector = padded;
    } else if (outputVector.length > this.dimension) {
      outputVector = outputVector.slice(0, this.dimension);
    }

    return {
      packetKey,
      sourceRef,
      features: handCraftedVector.map(f => Number(f.toFixed(6))),
      dimension: this.dimension,
      modelVersion: this.config.embedding.model,
      embedding: embeddingVector ? embeddingVector.map(f => Number(f.toFixed(6))) : undefined,
      embeddingDimension: embeddingDim,
      embeddingModel: embeddingModel
    };
  }
}
