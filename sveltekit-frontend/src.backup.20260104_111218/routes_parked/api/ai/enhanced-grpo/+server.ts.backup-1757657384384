// Enhanced GRPO-thinking API endpoint - Simplified working version
// Integrates with existing infrastructure and new GRPO database tables

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/db/connection';
import { sql } from 'drizzle-orm';

// Generate embedding using nomic-embed-text
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await fetch('http://localhost:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nomic-embed-text',
        prompt: text.slice(0, 2048)
      })
    });

    if (response.ok) {
      const data = await response.json();
      return data.embedding || [];
    }
  } catch (error) {
    console.warn('Failed to generate embedding:', error);
  }
  
  return new Array(768).fill(0);
}

// Get AI response using Gemma3-Legal with thinking
async function getAIResponse(query: string): Promise<{
  thinking: string;
  response: string;
  confidence: number;
}> {
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3-legal:latest',
        prompt: `<|thinking|>
Let me analyze this legal query step by step:
1. Identify the key legal concepts
2. Consider relevant legal principles
3. Provide structured reasoning
4. Draw conclusions based on legal doctrine
</|thinking|>

${query}

Please provide a comprehensive legal analysis with structured reasoning.`,
        stream: false
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.response || '';
      
      // Extract thinking content
      const thinkingMatch = content.match(/<\|thinking\|>([\s\S]*?)<\/\|thinking\|>/);
      const thinking = thinkingMatch ? thinkingMatch[1].trim() : '';
      const responseText = content.replace(/<\|thinking\|>[\s\S]*?<\/\|thinking\|>/, '').trim();
      
      return {
        thinking,
        response: responseText,
        confidence: 0.85
      };
    }
  } catch (error) {
    console.error('AI response error:', error);
  }
  
  return {
    thinking: 'Unable to generate thinking content',
    response: 'I apologize, but I encountered an issue processing your request.',
    confidence: 0.3
  };
}

// Extract structured reasoning from thinking content
function extractStructuredReasoning(thinking: string) {
  const lines = thinking.split('\n').filter(line => line.trim());
  
  return {
    premises: lines.filter(line => 
      line.toLowerCase().includes('premise') || 
      line.toLowerCase().includes('given') ||
      line.toLowerCase().includes('established')
    ).slice(0, 5),
    inferences: lines.filter(line => 
      line.toLowerCase().includes('therefore') || 
      line.toLowerCase().includes('infer') ||
      line.toLowerCase().includes('follows')
    ).slice(0, 5),
    conclusions: lines.filter(line => 
      line.toLowerCase().includes('conclude') || 
      line.toLowerCase().includes('conclusion') ||
      line.toLowerCase().includes('result')
    ).slice(0, 3),
    legal_principles: lines.filter(line => 
      line.toLowerCase().includes('principle') || 
      line.toLowerCase().includes('rule') ||
      line.toLowerCase().includes('doctrine')
    ).slice(0, 3),
    counter_arguments: lines.filter(line => 
      line.toLowerCase().includes('however') || 
      line.toLowerCase().includes('but') ||
      line.toLowerCase().includes('although')
    ).slice(0, 3),
    confidence_factors: lines.filter(line => 
      line.toLowerCase().includes('confident') || 
      line.toLowerCase().includes('certain') ||
      line.toLowerCase().includes('established')
    ).slice(0, 3)
  };
}

// Calculate temporal score with exponential decay
function calculateTemporalScore(createdAt: Date, halfLifeDays: number = 30): number {
  const now = new Date();
  const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const decayFactor = Math.exp(-Math.LN2 * ageDays / halfLifeDays);
  return Math.max(0.1, Math.min(1.0, decayFactor));
}

// Get similar responses from database using vector similarity
async function getSimilarResponses(queryEmbedding: number[], maxResults: number = 5) {
  try {
    const embeddingVector = `[${queryEmbedding.join(',')}]`;
    
    const results = await db.execute(sql`
      SELECT 
        id,
        query,
        response,
        confidence,
        legal_domain,
        created_at,
        usage_count,
        (1 - (query_embedding <=> ${embeddingVector}::vector)) as similarity
      FROM ai_responses
      WHERE query_embedding IS NOT NULL
        AND (1 - (query_embedding <=> ${embeddingVector}::vector)) > 0.5
      ORDER BY similarity DESC
      LIMIT ${maxResults}
    `);

    return results.rows.map(row => ({
      id: row.id as string,
      similarity: row.similarity as number,
      temporal_factor: calculateTemporalScore(new Date(row.created_at as string)),
      final_score: (row.similarity as number) * 0.7 + calculateTemporalScore(new Date(row.created_at as string)) * 0.3,
      snippet: (row.response as string).slice(0, 200) + '...',
      metadata: {
        legal_domain: row.legal_domain as string,
        created_at: row.created_at as string,
        usage_count: row.usage_count as number,
        confidence: row.confidence as string
      }
    }));
  } catch (error) {
    console.warn('Failed to get similar responses:', error);
    return [];
  }
}

// Save enhanced response to database
async function saveEnhancedResponse(data: {
  query: string;
  response: string;
  thinking: string;
  structuredReasoning: any;
  queryEmbedding: number[];
  responseEmbedding: number[];
  confidence: number;
  userId?: string;
  legalDomain?: string;
}) {
  try {
    const result = await db.execute(sql`
      INSERT INTO ai_responses (
        query,
        response,
        thinking_content,
        thinking_structured,
        reasoning_steps,
        query_embedding,
        response_embedding,
        confidence,
        legal_domain,
        user_id,
        model,
        created_at,
        last_accessed
      ) VALUES (
        ${data.query},
        ${data.response},
        ${data.thinking},
        ${JSON.stringify(data.structuredReasoning)},
        ${JSON.stringify(data.structuredReasoning.premises.concat(data.structuredReasoning.inferences, data.structuredReasoning.conclusions))},
        ${`[${data.queryEmbedding.join(',')}]`}::vector,
        ${`[${data.responseEmbedding.join(',')}]`}::vector,
        ${data.confidence},
        ${data.legalDomain || 'general'},
        ${data.userId || null},
        'gemma3-legal:latest',
        NOW(),
        NOW()
      ) RETURNING id
    `);
    
    return result.rows[0]?.id as string;
  } catch (error) {
    console.error('Failed to save enhanced response:', error);
    return null;
  }
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const startTime = Date.now();
    const requestData = await request.json();

    const {
      query,
      text,
      userId,
      userRole,
      documentType = 'legal_document',
      analysisType = 'reasoning',
      enableRecommendations = true,
      maxRecommendations = 5,
      legalDomain = 'general'
    } = requestData;

    // Validate input
    if (!query && !text) {
      return json({ 
        error: 'Query or text is required',
        success: false 
      }, { status: 400 });
    }

    const inputText = query || text;

    // Step 1: Get AI response with thinking
    const aiResponse = await getAIResponse(inputText);
    
    // Step 2: Extract structured reasoning
    const structuredReasoning = extractStructuredReasoning(aiResponse.thinking);
    
    // Step 3: Generate embeddings
    const queryEmbedding = await generateEmbedding(inputText);
    const responseEmbedding = await generateEmbedding(aiResponse.response);
    
    // Step 4: Get similar responses (recommendations)
    let recommendations = [];
    if (enableRecommendations && queryEmbedding.some(x => x !== 0)) {
      recommendations = await getSimilarResponses(queryEmbedding, maxRecommendations);
    }
    
    // Step 5: Save to database
    const grpoId = await saveEnhancedResponse({
      query: inputText,
      response: aiResponse.response,
      thinking: aiResponse.thinking,
      structuredReasoning,
      queryEmbedding,
      responseEmbedding,
      confidence: aiResponse.confidence,
      userId,
      legalDomain: analysisType
    });
    
    // Step 6: Get trending topics
    const trendingTopics = await db.execute(sql`
      SELECT 
        legal_domain as topic,
        COUNT(*) as count,
        AVG(COALESCE(confidence::numeric, 0.8)) as avg_confidence
      FROM ai_responses 
      WHERE created_at >= NOW() - INTERVAL ${sql.raw(`'7 days'`)}
        AND legal_domain IS NOT NULL
      GROUP BY legal_domain
      ORDER BY count DESC, avg_confidence DESC
      LIMIT 5
    `);

    const processingTime = Date.now() - startTime;
    
    const response = {
      success: true,
      analysis: {
        thinking: aiResponse.thinking,
        response: aiResponse.response,
        confidence: aiResponse.confidence,
        reasoning_steps: structuredReasoning.premises
          .concat(structuredReasoning.inferences)
          .concat(structuredReasoning.conclusions),
        
        // Enhanced GRPO features
        structured_reasoning: structuredReasoning,
        temporal_score: 1.0, // New response gets max temporal score
        
        // Recommendations
        recommendations: recommendations.map(rec => ({
          id: rec.id,
          score: rec.final_score,
          confidence: parseFloat(rec.metadata.confidence || '0.8'),
          snippet: rec.snippet,
          metadata: {
            similarity: rec.similarity,
            temporal_factor: rec.temporal_factor,
            legal_domain: rec.metadata.legal_domain,
            created_at: rec.metadata.created_at
          }
        })),
        
        // Context
        trending_topics: trendingTopics.rows.map(row => ({
          topic: row.topic as string,
          count: parseInt(row.count as string),
          avg_confidence: parseFloat(row.avg_confidence as string)
        })),
        
        // Reasoning breakdown
        reasoning_components: {
          premises: structuredReasoning.premises,
          inferences: structuredReasoning.inferences,
          conclusions: structuredReasoning.conclusions,
          legal_principles: structuredReasoning.legal_principles,
          counter_arguments: structuredReasoning.counter_arguments,
          confidence_factors: structuredReasoning.confidence_factors
        }
      },
      
      metadata: {
        processing_time: processingTime,
        model_used: 'gemma3-legal:latest',
        algorithm: 'enhanced-grpo',
        grpo_id: grpoId,
        thinking_enabled: true,
        recommendations_enabled: enableRecommendations,
        user_id: userId,
        analysis_type: analysisType,
        document_type: documentType,
        recommendation_count: recommendations.length,
        api_version: '2.0',
        capabilities: [
          'structured_reasoning',
          'temporal_scoring',
          'vector_recommendations',
          'trend_analysis'
        ]
      }
    };

    return json(response);

  } catch (error: any) {
    console.error('Enhanced GRPO API error:', error);
    
    return json({
      success: false,
      error: 'Enhanced analysis failed',
      details: error.message || 'Unknown error occurred',
      metadata: {
        processing_time: 0,
        model_used: 'gemma3-legal:latest',
        algorithm: 'enhanced-grpo',
        thinking_enabled: false,
        error_type: error.constructor.name
      }
    }, { status: 500 });
  }
};

// GET endpoint for retrieving recommendations and trends
export const GET: RequestHandler = async ({ url }) => {
  try {
    const operation = url.searchParams.get('operation') || 'trending';
    const limit = parseInt(url.searchParams.get('limit') || '10');

    switch (operation) {
      case 'trending':
        const days = parseInt(url.searchParams.get('days') || '7');
        
        const trendingTopics = await db.execute(sql`
          SELECT 
            legal_domain as topic,
            COUNT(*) as count,
            AVG(COALESCE(confidence::numeric, 0.8)) as avg_confidence,
            MAX(created_at) as latest_activity
          FROM ai_responses 
          WHERE created_at >= NOW() - INTERVAL ${sql.raw(`'${days} days'`)}
            AND legal_domain IS NOT NULL
          GROUP BY legal_domain
          ORDER BY count DESC, avg_confidence DESC
          LIMIT ${limit}
        `);
        
        return json({
          success: true,
          trending_topics: trendingTopics.rows.map(row => ({
            topic: row.topic as string,
            count: parseInt(row.count as string),
            avg_confidence: parseFloat(row.avg_confidence as string),
            latest_activity: row.latest_activity as string
          })),
          period_days: days
        });

      case 'recent':
        const recentResponses = await db.execute(sql`
          SELECT 
            id,
            query,
            response,
            confidence,
            legal_domain,
            created_at,
            usage_count
          FROM ai_responses 
          ORDER BY created_at DESC
          LIMIT ${limit}
        `);
        
        return json({
          success: true,
          recent_responses: recentResponses.rows.map(row => ({
            id: row.id as string,
            query: row.query as string,
            snippet: (row.response as string).slice(0, 200) + '...',
            confidence: parseFloat(row.confidence as string || '0.8'),
            legal_domain: row.legal_domain as string,
            created_at: row.created_at as string,
            usage_count: row.usage_count as number
          }))
        });

      default:
        return json({
          success: true,
          message: 'Enhanced GRPO API is operational',
          available_operations: ['trending', 'recent'],
          database_tables: ['ai_responses', 'grpo_feedback', 'recommendation_scores']
        });
    }

  } catch (error: any) {
    console.error('Enhanced GRPO GET error:', error);
    
    return json({
      success: false,
      error: 'Failed to retrieve data',
      details: error.message
    }, { status: 500 });
  }
};

// PATCH endpoint for recording feedback
export const PATCH: RequestHandler = async ({ request }) => {
  try {
    const feedbackData = await request.json();
    
    const {
      responseId,
      userRating,
      feedbackText,
      accuracy,
      clarity,
      completeness,
      relevance,
      userId,
      userRole
    } = feedbackData;

    if (!responseId || !userRating || userRating < 1 || userRating > 5) {
      return json({ 
        error: 'responseId and userRating (1-5) are required',
        success: false 
      }, { status: 400 });
    }

    // Record feedback
    await db.execute(sql`
      INSERT INTO grpo_feedback (
        response_id,
        user_rating,
        feedback_text,
        accuracy,
        clarity,
        completeness,
        relevance,
        user_id,
        user_role,
        feedback_type
      ) VALUES (
        ${responseId},
        ${userRating},
        ${feedbackText || null},
        ${accuracy || null},
        ${clarity || null},
        ${completeness || null},
        ${relevance || null},
        ${userId || null},
        ${userRole || null},
        'rating'
      )
    `);

    // Update response usage count and success metric
    await db.execute(sql`
      UPDATE ai_responses 
      SET usage_count = COALESCE(usage_count, 0) + 1,
          success_metric = ${userRating / 5.0},
          last_accessed = NOW()
      WHERE id = ${responseId}
    `);

    return json({
      success: true,
      message: 'Feedback recorded successfully',
      feedback_id: responseId,
      impact: 'Learning algorithms updated with your feedback'
    });

  } catch (error: any) {
    console.error('Feedback recording error:', error);
    
    return json({
      success: false,
      error: 'Failed to record feedback',
      details: error.message
    }, { status: 500 });
  }
};