
import type { RequestHandler } from './$types';

/*
 * Auto-Tagging API Endpoint
 * Integrates with Ollama GPU service, PostgreSQL pgvector, and Go microservice
 * Provides real-time AI analysis for document uploads
 */

import { aiAutoTaggingService } from "$lib/services/aiAutoTagging";
import { goMicroservice } from "$lib/services/goMicroservice";
import { enhancedEvidence } from "$lib/server/db/enhanced-legal-schema";
import { URL } from "url";

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const { documentId, content, documentType, useGPUAcceleration = true } = await request.json();
    
    if (!documentId || !content) {
      return json({ error: 'Missing required fields: documentId, content' }, { status: 400 });
    }
    
    // Validate user authentication
    if (!locals.user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }
    
    console.log(`🤖 Starting AI auto-tagging for document: ${documentId}`);
    
    // 1. Auto-tag the document with AI analysis
    const autoTagResult = await aiAutoTaggingService.autoTagDocument(
      documentId, 
      content, 
      documentType || 'document'
    );
    
    console.log(`✅ Auto-tagging completed with ${autoTagResult.tags.length} tags, confidence: ${autoTagResult.confidence}`);
    
    // 2. Enhanced processing with Go microservice if GPU acceleration enabled
    let gpuProcessingResult = null;
    if (useGPUAcceleration) {
      try {
        // Check Go service health
        const healthCheck = await goMicroservice.healthCheck();
        
        if (healthCheck.status === 'healthy' && healthCheck.gpu_available) {
          console.log('🚀 Using GPU acceleration via Go microservice');
          
          // Generate embeddings with cuBLAS acceleration
          const gpuEmbeddings = await goMicroservice.generateEmbeddingsBatch(
            [content.substring(0, 4000)], // Limit context
            'nomic-embed-text'
          );
          
          // SIMD JSON parsing for metadata
          const metadata = JSON.stringify({
            tags: autoTagResult.tags,
            entities: autoTagResult.entities,
            confidence: autoTagResult.confidence
          });
          
          const parsedMetadata = await goMicroservice.parseJSONSIMD(metadata, true);
          
          gpuProcessingResult = {
            embeddings: gpuEmbeddings[0],
            parsedMetadata,
            gpuAccelerated: true
          };
          
          console.log('⚡ GPU processing completed successfully');
        }
      } catch (gpuError) {
        console.warn('⚠️ GPU acceleration failed, falling back to CPU:', gpuError);
      }
    }
    
    // 3. Generate RAG query for similar documents
    const ragQuery = `Find documents similar to: ${autoTagResult.tags.slice(0, 3).join(', ')}`;
    const ragResult = await enhancedRAGPipeline.ragQuery(ragQuery, {
      useSemanticSearch: true,
      useMemoryGraph: false,
      useMultiAgent: false,
      maxSources: 5,
      minConfidence: 0.6
    });
    
    // 4. Update document in database with enriched data
    const updateData: any = {
      tags: autoTagResult.tags,
      summary: autoTagResult.summary,
      updatedAt: new Date()
    };
    
    // Use GPU embeddings if available, otherwise use CPU embeddings
    if (gpuProcessingResult?.embeddings) {
      updateData.embedding = `[${gpuProcessingResult.embeddings.join(',')}]`;
    } else if (autoTagResult.embedding.length > 0) {
      updateData.embedding = `[${autoTagResult.embedding.join(',')}]`;
    }
    
    await db.update(enhancedEvidence)
      .set(updateData)
      .where(eq(enhancedEvidence.id, documentId));
    
    console.log('💾 Database updated successfully');
    
    // 5. Update RAG pipeline search index
    try {
      const documents = await db.select().from(enhancedEvidence);
      enhancedRAGPipeline.updateSearchIndex(documents.map((doc: any) => ({
        id: doc.id,
        title: doc.title,
        content: doc.content || '',
        tags: doc.tags || [],
        type: 'document'
      })));
    } catch (indexError) {
      console.warn('⚠️ Search index update failed:', indexError);
    }
    
    // 6. Prepare comprehensive response
    const response = {
      success: true,
      documentId,
      autoTags: autoTagResult.tags,
      entities: autoTagResult.entities,
      summary: autoTagResult.summary,
      confidence: autoTagResult.confidence,
      relationships: autoTagResult.relationships,
      similarDocuments: ragResult.sources.slice(0, 3).map((source: any) => ({
        id: source.id,
        title: source.title,
        relevance: source.relevance
      })),
      processing: {
        gpuAccelerated: !!gpuProcessingResult,
        embeddingDimensions: gpuProcessingResult?.embeddings?.length || autoTagResult.embedding.length,
        processingTime: Date.now() - new Date().getTime()
      },
      ragAnalysis: {
        answer: ragResult.answer,
        confidence: ragResult.confidence,
        suggestedActions: ragResult.suggestedActions
      }
    };
    
    console.log('🎉 Auto-tagging API completed successfully');
    
    return json(response);
    
  } catch (error: any) {
    console.error('❌ Auto-tagging API error:', error);
    
    return json({
      error: 'Auto-tagging failed',
      details: error.message,
      success: false
    }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ url, locals }) => {
  // Get auto-tagging status and statistics
  try {
    if (!locals.user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }
    
    const documentId = url.searchParams.get('documentId');
    
    if (documentId) {
      // Get specific document tagging info
      const document = await db.select()
        .from(enhancedEvidence)
        .where(eq(enhancedEvidence.id, documentId))
        .limit(1);
        
      if (document.length === 0) {
        return json({ error: 'Document not found' }, { status: 404 });
      }
      
      return json({
        documentId,
        tags: document[0].tags || [],
        summary: document[0].summary || '',
        hasEmbedding: !!document[0].embedding,
        lastUpdated: document[0].updatedAt
      });
    }
    
    // Get general auto-tagging statistics
    const stats = await db.select()
      .from(enhancedEvidence)
      .limit(100);
      
    const taggedDocuments = stats.filter((doc: any) => doc.tags && doc.tags.length > 0);
    const documentsWithEmbeddings = stats.filter((doc: any) => doc.embedding);
    
    // Check Go microservice status
    const goServiceHealth = await goMicroservice.healthCheck();
    
    return json({
      statistics: {
        totalDocuments: stats.length,
        taggedDocuments: taggedDocuments.length,
        documentsWithEmbeddings: documentsWithEmbeddings.length,
        averageTagsPerDocument: taggedDocuments.length > 0 
          ? taggedDocuments.reduce((sum, doc) => sum + (doc.tags?.length || 0), 0) / taggedDocuments.length 
          : 0
      },
      services: {
        aiAutoTagging: 'operational',
        enhancedRAG: 'operational',
        goMicroservice: goServiceHealth.status,
        gpuAcceleration: goServiceHealth.gpu_available
      },
      capabilities: [
        'AI-powered auto-tagging',
        'Entity extraction',
        'Document summarization',
        'Semantic similarity search',
        'GPU-accelerated embeddings',
        'Real-time RAG analysis'
      ]
    });
    
  } catch (error: any) {
    console.error('Auto-tagging status error:', error);
    
    return json({
      error: 'Failed to get auto-tagging status',
      details: error.message
    }, { status: 500 });
  }
};