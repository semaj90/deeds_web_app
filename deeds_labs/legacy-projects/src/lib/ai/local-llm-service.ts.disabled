import { spawn } from 'child_process';
import type { ProcessedDocument } from '$lib/types';

export class LocalLLMService {
  private ollamaUrl = 'http://localhost:11434';
  private modelName = 'gemma3-legal:latest'; // Your custom Gemma3 model
  
  async initialize() {
    // Check if Ollama is running and model is loaded
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      const data = await response.json();
      const hasModel = data.models?.some((m: any) => m.name === this.modelName);
      
      if (!hasModel) {
        console.error(`Model ${this.modelName} not found in Ollama`);
        throw new Error('Gemma3 model not loaded');
      }
      
      console.log('✅ Local LLM Service initialized with Gemma3');
    } catch (error) {
      console.error('Failed to initialize LLM service:', error);
      throw error;
    }
  }
  
  async embed(text: string): Promise<Float32Array> {
    try {
      // Use Ollama's embedding endpoint
      const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          prompt: text
        })
      });
      
      if (!response.ok) {
        throw new Error(`Embedding failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      return new Float32Array(data.embedding);
    } catch (error) {
      console.error('Embedding error:', error);
      // Fallback to a simple hash-based embedding for testing
      return this.generateFallbackEmbedding(text);
    }
  }
  
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Process in parallel with rate limiting
    const batchSize = 5;
    const results: Float32Array[] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const embeddings = await Promise.all(
        batch.map(text => this.embed(text))
      );
      results.push(...embeddings);
    }
    
    return results;
  }
  
  async analyzeCase(caseId: string, analysisType: string): Promise<any> {
    const prompt = this.buildAnalysisPrompt(caseId, analysisType);
    
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          prompt,
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 1024,
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return {
        caseId,
        analysisType,
        result: data.response,
        confidence: 0.85, // Mock confidence for now
        metadata: {
          model: this.modelName,
          tokensUsed: data.total_duration,
        }
      };
    } catch (error) {
      console.error('Analysis error:', error);
      throw error;
    }
  }
  
  async chat(messages: Array<{ role: string; content: string }>, options?: any) {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelName,
          messages,
          stream: options?.stream || false,
          options: {
            temperature: options?.temperature || 0.7,
            num_predict: options?.max_tokens || 512,
          }
        })
      });
      
      if (options?.stream) {
        return response.body; // Return readable stream
      }
      
      const data = await response.json();
      return data.message.content;
    } catch (error) {
      console.error('Chat error:', error);
      throw error;
    }
  }
  
  async splitText(text: string, chunkSize = 1000, overlap = 200): Promise<string[]> {
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > chunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        // Add overlap
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(overlap / 5));
        currentChunk = overlapWords.join(' ') + ' ' + sentence;
      } else {
        currentChunk += sentence;
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
  
  private buildAnalysisPrompt(caseId: string, analysisType: string): string {
    const prompts: Record<string, string> = {
      summary: `Analyze the legal case with ID ${caseId} and provide a comprehensive summary including:
1. Key facts and parties involved
2. Legal issues at stake
3. Relevant laws and precedents
4. Current status and next steps`,
      
      risk: `Perform a risk assessment for case ${caseId} including:
1. Potential liabilities and exposure
2. Probability of success/failure
3. Financial implications
4. Recommended risk mitigation strategies`,
      
      strategy: `Develop a legal strategy for case ${caseId} including:
1. Strengths and weaknesses of the case
2. Key arguments to advance
3. Evidence requirements
4. Timeline and milestones`,
    };
    
    return prompts[analysisType] || `Analyze case ${caseId} for ${analysisType}`;
  }
  
  private generateFallbackEmbedding(text: string): Float32Array {
    // Simple fallback embedding for testing
    const embedding = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      embedding[i] = Math.sin(text.charCodeAt(i % text.length) * (i + 1) / 384);
    }
    return embedding;
  }
}

// Export singleton instance
export const localLLM = new LocalLLMService();
