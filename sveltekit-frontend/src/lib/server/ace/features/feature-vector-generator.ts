import { z } from 'zod';

export const FeatureVectorSchema = z.object({
  packetKey: z.string(),
  sourceRef: z.string(),
  features: z.array(z.number()),
  dimension: z.number(),
  modelVersion: z.string()
});

export type FeatureVector = z.infer<typeof FeatureVectorSchema>;

export interface FeatureExtractorConfig {
  maxVocabulary: number;
  embedding: {
    model: string;
    dimension: number;
  };
}

export class FeatureVectorGenerator {
  private vocabulary: Map<string, number> = new Map();
  private config: FeatureExtractorConfig;
  private dimension: number;

  constructor(config: FeatureExtractorConfig) {
    this.config = config;
    this.dimension = config.embedding.dimension;
  }

  // Lexical features: path tokens, function names, keywords
  extractLexicalFeatures(sourceRef: string, content: string): number[] {
    const features = new Float32Array(50).fill(0);

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

  // Structural features: AST patterns
  extractStructuralFeatures(content: string): number[] {
    const features = new Float32Array(30).fill(0);

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

  // Semantic features: high-level indicators
  extractSemanticFeatures(sourceRef: string, content: string): number[] {
    const features = new Float32Array(20).fill(0);

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

  generateFeatureVector(
    packetKey: string,
    sourceRef: string,
    content: string
  ): FeatureVector {
    const lexical = this.extractLexicalFeatures(sourceRef, content);
    const structural = this.extractStructuralFeatures(content);
    const semantic = this.extractSemanticFeatures(sourceRef, content);

    // Combine all features (40 total: 20 lexical + 10 structural + 10 semantic)
    const combinedFeatures = [...lexical, ...structural, ...semantic];

    // Pad or trim to expected dimension
    const features = new Array(this.dimension).fill(0);
    for (let i = 0; i < Math.min(combinedFeatures.length, this.dimension); i++) {
      features[i] = combinedFeatures[i];
    }

    return {
      packetKey,
      sourceRef,
      features: features.map(f => Number(f.toFixed(6))),
      dimension: this.dimension,
      modelVersion: this.config.embedding.model
    };
  }
}
