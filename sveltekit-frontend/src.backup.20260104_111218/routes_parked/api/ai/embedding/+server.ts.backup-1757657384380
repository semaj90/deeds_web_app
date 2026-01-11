
import { json } from "@sveltejs/kit";
import type { RequestHandler } from './$types';
import { gemmaEmbeddingService } from '$lib/services/gemma-embedding.js';

export const POST: RequestHandler = async ({ request }) => {
  const startTime = Date.now();
  
  try {
    const { text, content, metadata } = await request.json();
    const inputText = text || content;
    
    if (!inputText || inputText.trim() === "") {
      return json({ 
        error: "Text or content is required",
        timestamp: new Date().toISOString()
      }, { status: 400 });
    }

    // Use the improved Gemma embedding service
    const result = await gemmaEmbeddingService.generateEmbedding(inputText, metadata);
    
    if (!result.success) {
      return json({ 
        error: result.error,
        model: result.model,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

    return json({ 
      embedding: result.embedding,
      metadata: result.metadata,
      model: result.model,
      processingTime: result.processingTime,
      responseTime: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    return json({ 
      error: `Failed to get embedding: ${error.message}`,
      responseTime: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};

export const GET: RequestHandler = async () => {
  try {
    const healthResult = await gemmaEmbeddingService.healthCheck();
    
    return json({
      service: "AI Embedding API",
      ...healthResult,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    return json({
      service: "AI Embedding API", 
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
};
