// TypeScript Fix Script for SvelteKit Project
// This fixes the embedding type issues in ai-service.ts

import { readFileSync, writeFileSync } from 'fs';

const aiServicePath = 'src/lib/services/ai-service.ts';

// Fix embedding type handling
const fixEmbeddingTypes = () => {
  let content = readFileSync(aiServicePath, 'utf8');

  // Add a proper embedding normalizer function at the top of the class
  const normalizerFunction = `
  // Helper function to normalize embedding types
  private normalizeEmbedding(embedding: number[] | number[][]): number[] {
    if (Array.isArray(embedding) && embedding.length > 0 && Array.isArray(embedding[0])) {
      return embedding[0] as number[];
    }
    return embedding as number[];
  }
`;

  // Insert the normalizer function after the class declaration
  content = content.replace(
    /class EnhancedAIService \{/,
    `class EnhancedAIService {${normalizerFunction}`
  );

  // Fix any problematic embedding assignments
  content = content.replace(
    /embedding: Array\.isArray\(embedding\[0\]\) \? embedding\[0\] : embedding,/g,
    'embedding: this.normalizeEmbedding(embedding),'
  );

  // Fix the specific line that was causing the error
  content = content.replace(
    /embedding: Array\.isArray\(embedding\[0\]\) \? \(embedding\[0\] as number\[\]\) : \(embedding as number\[\]\),/g,
    'embedding: this.normalizeEmbedding(embedding),'
  );

  // Ensure consistent return types
  content = content.replace(
    /return isArray \? result : result\[0\];/g,
    'return isArray ? result : (result[0] || result);'
  );

  writeFileSync(aiServicePath, content, 'utf8');
  console.log('✅ Fixed embedding types in ai-service.ts');
};

// Run the fixes
try {
  fixEmbeddingTypes();
  console.log('🎉 All TypeScript fixes applied successfully!');
} catch (error) {
  console.error('❌ Error applying fixes:', error);
}
