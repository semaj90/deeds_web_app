const crypto = require("crypto");
const natural = require("natural");
const compromise = require("compromise");

class EmbeddingGenerator {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    this.stopwords = new Set(natural.stopwords);
    this.vocabulary = new Map();
    this.vectors = new Map();
  }

  async generateEmbedding(text, dimensions = 384) {
    try {
      // Preprocess text
      const tokens = this.preprocessText(text);

      // Generate base vector using multiple techniques
      const vector = new Array(dimensions).fill(0);

      // Technique 1: Token frequency
      const tokenFreq = this.calculateTokenFrequencies(tokens);
      this.addFrequencyVector(vector, tokenFreq, dimensions * 0.3);

      // Technique 2: Semantic features
      const semanticFeatures = this.extractSemanticFeatures(text);
      this.addSemanticVector(vector, semanticFeatures, dimensions * 0.3);

      // Technique 3: Structural features
      const structuralFeatures = this.extractStructuralFeatures(text);
      this.addStructuralVector(vector, structuralFeatures, dimensions * 0.2);

      // Technique 4: Hash-based randomization for uniqueness
      const hashVector = this.generateHashVector(text, dimensions * 0.2);
      this.addHashVector(vector, hashVector);

      // Normalize vector
      return this.normalizeVector(vector);

    } catch (error) {
      console.error('Error generating embedding:', error);
      return new Array(dimensions).fill(0);
    }
  }

  preprocessText(text) {
    // Convert to lowercase
    let processed = text.toLowerCase();

    // Remove HTML tags
    processed = processed.replace(/<[^>]*>/g, ' ');

    // Remove punctuation and special characters
    processed = processed.replace(/[^\w\s]/g, ' ');

    // Tokenize
    const tokens = this.tokenizer.tokenize(processed) || [];

    // Remove stopwords and short tokens
    const filteredTokens = tokens.filter(token =>
      token.length > 2 && !this.stopwords.has(token)
    );

    // Stem tokens
    return filteredTokens.map(token => this.stemmer.stem(token));
  }

  calculateTokenFrequencies(tokens) {
    const frequencies = new Map();

    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) || 0) + 1);
    }

    return frequencies;
  }

  addFrequencyVector(vector, frequencies, weight) {
    const entries = Array.from(frequencies.entries());
    const maxFreq = Math.max(...entries.map(([_, freq]) => freq));

    for (let i = 0; i < Math.min(entries.length, weight); i++) {
      const [token, freq] = entries[i];
      const hash = this.simpleHash(token);
      const index = Math.abs(hash) % Math.floor(weight);
      vector[index] += (freq / maxFreq) * 0.5;
    }
  }

  addSemanticVector(vector, features, weight) {
    const startIndex = Math.floor(vector.length * 0.3);

    // Sentiment score
    vector[startIndex] += features.sentiment * 0.5;

    // Complexity score
    vector[startIndex + 1] += features.complexity * 0.5;

    // Formality score
    vector[startIndex + 2] += features.formality * 0.5;

    // Technical terms ratio
    vector[startIndex + 3] += features.technicalRatio * 0.5;
  }

  addStructuralVector(vector, features, weight) {
    const startIndex = Math.floor(vector.length * 0.6);

    // Length score
    vector[startIndex] += Math.min(features.length / 1000, 1) * 0.5;

    // Sentence count
    vector[startIndex + 1] += Math.min(features.sentences / 10, 1) * 0.5;

    // Paragraph count
    vector[startIndex + 2] += Math.min(features.paragraphs / 5, 1) * 0.5;
  }

  addHashVector(vector, hashVector) {
    const startIndex = Math.floor(vector.length * 0.8);

    for (let i = 0; i < hashVector.length && startIndex + i < vector.length; i++) {
      vector[startIndex + i] += hashVector[i] * 0.3;
    }
  }

  extractSemanticFeatures(text) {
    const doc = compromise(text);

    // Sentiment analysis (simplified)
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'worst', 'poor'];

    const words = text.toLowerCase().split(/\s+/);
    const positiveCount = words.filter(w => positiveWords.includes(w)).length;
    const negativeCount = words.filter(w => negativeWords.includes(w)).length;
    const sentiment = (positiveCount - negativeCount) / Math.max(words.length, 1);

    // Complexity based on sentence structure
    const sentences = doc.sentences().out('array');
    const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);
    const complexity = Math.min(avgWordsPerSentence / 20, 1);

    // Formality based on word choice
    const formalWords = ['therefore', 'however', 'consequently', 'furthermore', 'moreover'];
    const formalCount = words.filter(w => formalWords.includes(w)).length;
    const formality = formalCount / Math.max(words.length, 1);

    // Technical terms ratio
    const technicalIndicators = ['function', 'component', 'interface', 'class', 'method', 'property'];
    const technicalCount = words.filter(w => technicalIndicators.some(t => w.includes(t))).length;
    const technicalRatio = technicalCount / Math.max(words.length, 1);

    return {
      sentiment: Math.max(-1, Math.min(1, sentiment)),
      complexity,
      formality,
      technicalRatio
    };
  }

  extractStructuralFeatures(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);

    return {
      length: text.length,
      sentences: sentences.length,
      paragraphs: paragraphs.length,
      words: words.length
    };
  }

  generateHashVector(text, length) {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    const vector = [];

    for (let i = 0; i < length; i++) {
      const byte = parseInt(hash.substr(i * 2, 2), 16);
      vector.push(byte / 255); // Normalize to 0-1
    }

    return vector;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }

  normalizeVector(vector) {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));

    if (magnitude === 0) return vector;

    return vector.map(val => val / magnitude);
  }

  async cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  async generateEmbeddingsBatch(texts, dimensions = 384) {
    const embeddings = [];

    for (const text of texts) {
      const embedding = await this.generateEmbedding(text, dimensions);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  async findSimilar(text, candidates, topK = 5) {
    const queryEmbedding = await this.generateEmbedding(text);
    const similarities = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidateEmbedding = await this.generateEmbedding(candidates[i]);
      const similarity = await this.cosineSimilarity(queryEmbedding, candidateEmbedding);

      similarities.push({
        text: candidates[i],
        index: i,
        similarity
      });
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }
}

async function embed(text, dimensions = 384) {
  const generator = new EmbeddingGenerator();
  return await generator.generateEmbedding(text, dimensions);
}

module.exports = { EmbeddingGenerator, embed };