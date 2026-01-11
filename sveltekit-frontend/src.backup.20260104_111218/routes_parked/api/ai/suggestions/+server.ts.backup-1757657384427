
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import { chatMessages, chatRecommendations } from '$lib/server/db/schema-unified.js';
import { generateEnhancedEmbedding } from '$lib/server/ai/embeddings-enhanced.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { RequestHandler } from './$types';


// Import our new AI suggestion services
import { generateOllamaSuggestions, type OllamaSuggestion } from '$lib/services/ollama-suggestions-service.js';
import { generateVectorContextualSuggestions, type ContextualSuggestion } from '$lib/services/vector-suggestions-service.js';
import { generateEnhancedRAGSuggestions, type RAGSuggestionResponse } from '$lib/services/enhanced-rag-suggestions-service.js';
import { aiSuggestionsClient, ReportTypeUtils, type SuggestionResponse } from '$lib/services/ai-suggestions-grpc-client.js';

export interface EnhancedSuggestionRequest {
  content: string;
  reportType?: 'prosecution_memo' | 'case_brief' | 'evidence_summary' | 'motion' | 'discovery_request' | 'witness_statement' | 'legal_research' | 'closing_argument' | 'general';
  userId?: string;
  sessionId?: string;
  context?: {
    caseId?: string;
    evidenceIds?: string[];
    previousMessages?: string[];
    userProfile?: {
      userType?: 'attorney' | 'paralegal' | 'investigator';
      experienceLevel?: 'junior' | 'mid' | 'senior' | 'expert';
      specializations?: string[];
    };
  };
  model?: string;
  useVectorSearch?: boolean;
  useOllamaAI?: boolean;
  useEnhancedRAG?: boolean;
  useProtobuf?: boolean;
  maxSuggestions?: number;
  confidenceThreshold?: number;
  temperature?: number;
}

export interface UnifiedSuggestion {
  id: string;
  content: string;
  type: string;
  confidence: number;
  reasoning: string;
  metadata: {
    source: 'ollama' | 'vector_search' | 'enhanced_rag' | 'protobuf_grpc' | 'rule_based';
    category: string;
    priority?: number;
    keywords?: string[];
    supportingContext?: string[];
    citations?: string[];
    urgency?: number;
    processingTimeMs?: number;
  };
}

export async function POST({ request, url }: RequestEvent): Promise<any> {
  try {
    const data: EnhancedSuggestionRequest = await request.json();
    const {
      content,
      reportType = 'general',
      userId,
      sessionId,
      context = {},
      model = 'gemma3-legal',
      useVectorSearch = true,
      useOllamaAI = true,
      useEnhancedRAG = true,
      useProtobuf = false,
      maxSuggestions = 5,
      confidenceThreshold = 0.6,
      temperature = 0.3
    } = data;

    if (!content) {
      return json({ error: 'Content is required' }, { status: 400 });
    }

    // Generate comprehensive AI suggestions using multiple services
    const suggestions = await generateComprehensiveSuggestions({
      content,
      reportType,
      context,
      useVectorSearch,
      useOllamaAI,
      useEnhancedRAG,
      useProtobuf,
      maxSuggestions,
      confidenceThreshold,
      temperature,
      userId
    });

    // Store in database if userId provided
    const recommendationId = uuidv4();
    
    if (userId && sessionId) {
      await storeRecommendations({
        userId,
        sessionId,
        content,
        suggestions,
        recommendationId,
        reportType
      });
    }

    return json({
      id: recommendationId,
      suggestions,
      model,
      reportType,
      confidence: suggestions.length > 0 ? suggestions[0].confidence : 0,
      servicesUsed: {
        vectorSearch: useVectorSearch,
        ollamaAI: useOllamaAI,
        enhancedRAG: useEnhancedRAG,
        protobufGRPC: useProtobuf
      },
      timestamp: new Date().toISOString(),
      metadata: {
        contentLength: content.length,
        suggestionsCount: suggestions.length,
        context: Object.keys(context).length > 0 ? context : undefined,
        processingServices: suggestions.map(s => s.metadata.source).filter((v, i, a) => a.indexOf(v) === i)
      }
    });
  } catch (error: any) {
    console.error('Error generating AI suggestions:', error);
    return json({ 
      error: 'Failed to generate suggestions',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
async function generateComprehensiveSuggestions({
  content,
  reportType,
  context = {},
  useVectorSearch = true,
  useOllamaAI = true,
  useEnhancedRAG = true,
  useProtobuf = false,
  maxSuggestions = 5,
  confidenceThreshold = 0.6,
  temperature = 0.3,
  userId
}: {
  content: string;
  reportType: string;
  context: any;
  useVectorSearch: boolean;
  useOllamaAI: boolean;
  useEnhancedRAG: boolean;
  useProtobuf: boolean;
  maxSuggestions: number;
  confidenceThreshold: number;
  temperature: number;
  userId?: string;
}): Promise<UnifiedSuggestion[]> {
  const allSuggestions: UnifiedSuggestion[] = [];
  const processingStartTime = Date.now();

  // Service execution promises for parallel processing
  const servicePromises: Promise<void>[] = [];

  // 1. Protocol Buffers gRPC Service (if enabled)
  if (useProtobuf) {
    servicePromises.push(
      (async () => {
        try {
          const grpcStartTime = Date.now();
          const reportTypeEnum = ReportTypeUtils.fromString(reportType);
          
          const grpcResponse = await aiSuggestionsClient.generateSuggestions({
            content,
            report_type: reportTypeEnum,
            model,
            max_suggestions: maxSuggestions,
            confidence_threshold: confidenceThreshold,
            context: {
              case_id: context.caseId,
              user_id: userId,
              document_ids: context.evidenceIds
            }
          });

          grpcResponse.suggestions.forEach((suggestion, index) => {
            allSuggestions.push({
              id: suggestion.id || `grpc-${index}`,
              content: suggestion.content,
              type: suggestion.type?.toString() || 'protobuf_suggestion',
              confidence: suggestion.confidence,
              reasoning: suggestion.metadata?.reasoning || 'Generated via Protocol Buffers gRPC service',
              metadata: {
                source: 'protobuf_grpc',
                category: suggestion.category?.toString() || 'general',
                priority: suggestion.priority,
                keywords: suggestion.metadata?.source_documents || [],
                supportingContext: suggestion.supporting_evidence || [],
                citations: suggestion.case_citations || [],
                processingTimeMs: Date.now() - grpcStartTime
              }
            });
          });
        } catch (error: any) {
          console.warn('Protocol Buffers gRPC service failed:', error);
        }
      })()
    );
  }

  // 2. Enhanced RAG Service
  if (useEnhancedRAG) {
    servicePromises.push(
      (async () => {
        try {
          const ragStartTime = Date.now();
          const ragResponse = await generateEnhancedRAGSuggestions(content, reportType, {
            context: {
              caseId: context.caseId,
              evidenceIds: context.evidenceIds,
              userId
            },
            maxSuggestions,
            confidenceThreshold
          });

          ragResponse.suggestions.forEach((suggestion, index) => {
            allSuggestions.push({
              id: `rag-${index}`,
              content: suggestion.content,
              type: suggestion.type,
              confidence: suggestion.confidence,
              reasoning: suggestion.reasoning,
              metadata: {
                source: 'enhanced_rag',
                category: suggestion.metadata.category,
                priority: suggestion.metadata.priority,
                keywords: suggestion.metadata.contextDocuments || [],
                supportingContext: suggestion.supportingContext,
                citations: suggestion.relevantCitations,
                processingTimeMs: Date.now() - ragStartTime
              }
            });
          });
        } catch (error: any) {
          console.warn('Enhanced RAG service failed:', error);
        }
      })()
    );
  }

  // 3. Ollama AI Service
  if (useOllamaAI) {
    servicePromises.push(
      (async () => {
        try {
          const ollamaStartTime = Date.now();
          const ollamaSuggestions = await generateOllamaSuggestions(
            content,
            reportType,
            context,
            { temperature, maxSuggestions }
          );

          ollamaSuggestions.forEach((suggestion, index) => {
            allSuggestions.push({
              id: `ollama-${index}`,
              content: suggestion.content,
              type: suggestion.type,
              confidence: suggestion.confidence,
              reasoning: suggestion.reasoning,
              metadata: {
                source: 'ollama',
                category: suggestion.metadata.category,
                keywords: suggestion.metadata.keywords || [],
                urgency: suggestion.metadata.urgency,
                processingTimeMs: Date.now() - ollamaStartTime
              }
            });
          });
        } catch (error: any) {
          console.warn('Ollama AI service failed:', error);
        }
      })()
    );
  }

  // 4. Vector Contextual Search
  if (useVectorSearch) {
    servicePromises.push(
      (async () => {
        try {
          const vectorStartTime = Date.now();
          const vectorSuggestions = await generateVectorContextualSuggestions(
            content,
            reportType,
            userId,
            context.caseId
          );

          vectorSuggestions.forEach((suggestion, index) => {
            allSuggestions.push({
              id: `vector-${index}`,
              content: suggestion.content,
              type: suggestion.type,
              confidence: suggestion.confidence,
              reasoning: suggestion.reasoning,
              metadata: {
                source: 'vector_search',
                category: suggestion.metadata.category,
                keywords: suggestion.metadata.keywords || [],
                supportingContext: suggestion.metadata.sourceDocumentId ? [suggestion.metadata.sourceDocumentId] : [],
                processingTimeMs: Date.now() - vectorStartTime
              }
            });
          });
        } catch (error: any) {
          console.warn('Vector search service failed:', error);
        }
      })()
    );
  }

  // 5. Rule-based fallback (always enabled)
  servicePromises.push(
    (async () => {
      const ruleStartTime = Date.now();
      const ruleBasedSuggestions = generateRuleBasedSuggestions(content, reportType, content.toLowerCase());
      
      ruleBasedSuggestions.forEach((suggestion, index) => {
        allSuggestions.push({
          id: `rule-${index}`,
          content: suggestion.content,
          type: suggestion.type,
          confidence: suggestion.confidence,
          reasoning: suggestion.reasoning,
          metadata: {
            source: 'rule_based',
            category: suggestion.metadata.category,
            keywords: suggestion.metadata.keywords || [],
            processingTimeMs: Date.now() - ruleStartTime
          }
        });
      });
    })()
  );

  // Execute all services in parallel
  await Promise.allSettled(servicePromises);

  // Deduplicate, rank, and filter suggestions
  const uniqueSuggestions = deduplicateUnifiedSuggestions(allSuggestions);
  const rankedSuggestions = rankSuggestionsByQuality(uniqueSuggestions, confidenceThreshold);
  
  console.log(`Generated ${allSuggestions.length} total suggestions from ${new Set(allSuggestions.map(s => s.metadata.source)).size} services in ${Date.now() - processingStartTime}ms`);
  
  return rankedSuggestions.slice(0, maxSuggestions);
}

function generateRuleBasedSuggestions(
  content: string,
  reportType: string,
  contentLower: string
) {
  const suggestions: Array<{
    content: string;
    type: string;
    confidence: number;
    reasoning: string;
    metadata: any;
  }> = [];

  if (reportType === 'prosecution_memo') {
    if (contentLower.includes('suspect') || contentLower.includes('defendant')) {
      suggestions.push({
        content: "Consider including the defendant's criminal history and prior convictions to establish a pattern of behavior.",
        type: 'background_check',
        confidence: 0.8,
        reasoning: 'Document mentions suspect/defendant - criminal history relevant',
        metadata: { keywords: ['suspect', 'defendant'], category: 'legal_strategy' }
      });
    }
    if (contentLower.includes('evidence')) {
      suggestions.push({
        content: 'Ensure all evidence is properly authenticated and meets the requirements for admissibility under the Rules of Evidence.',
        type: 'evidence_validation',
        confidence: 0.85,
        reasoning: 'Evidence mentioned - authentication crucial for admissibility',
        metadata: { keywords: ['evidence'], category: 'procedural' }
      });
    }
    if (contentLower.includes('witness')) {
      suggestions.push({
        content: 'Evaluate witness credibility and consider any potential impeachment issues that may arise during trial.',
        type: 'witness_analysis',
        confidence: 0.82,
        reasoning: 'Witness mentioned - credibility assessment important',
        metadata: { keywords: ['witness'], category: 'testimony' }
      });
    }
    if (contentLower.includes('charge') || contentLower.includes('count')) {
      suggestions.push({
        content: 'Review the elements of each charge to ensure sufficient evidence exists to prove guilt beyond a reasonable doubt.',
        type: 'charge_analysis',
        confidence: 0.87,
        reasoning: 'Charges mentioned - element analysis required',
        metadata: { keywords: ['charge', 'count'], category: 'legal_elements' }
      });
    }
  } else if (reportType === 'case_brief') {
    suggestions.push({
      content: 'Summarize the key legal issues and applicable statutes relevant to this case.',
      type: 'legal_summary',
      confidence: 0.75,
      reasoning: 'Case brief format requires legal issue identification',
      metadata: { category: 'structure' }
    });
    suggestions.push({
      content: 'Analyze any potential constitutional issues or procedural defenses.',
      type: 'constitutional_analysis',
      confidence: 0.73,
      reasoning: 'Case brief should address constitutional considerations',
      metadata: { category: 'legal_analysis' }
    });
  } else if (reportType === 'evidence_summary') {
    suggestions.push({
      content: 'Organize evidence chronologically and by relevance to each charge.',
      type: 'evidence_organization',
      confidence: 0.78,
      reasoning: 'Evidence summary requires logical organization',
      metadata: { category: 'organization' }
    });
    suggestions.push({
      content: 'Note any chain of custody issues that need to be addressed.',
      type: 'custody_chain',
      confidence: 0.80,
      reasoning: 'Chain of custody critical for evidence admissibility',
      metadata: { category: 'procedural' }
    });
  }

  // Generic content-based suggestions
  if (content.length < 200) {
    suggestions.push({
      content: 'Consider expanding this section with more detailed analysis and supporting evidence.',
      type: 'content_expansion',
      confidence: 0.65,
      reasoning: 'Content appears brief - additional detail may strengthen argument',
      metadata: { contentLength: content.length, category: 'content_quality' }
    });
  }
  
  if (!contentLower.includes('statute') && !contentLower.includes('law')) {
    suggestions.push({
      content: 'Reference applicable statutes and legal precedents to strengthen your argument.',
      type: 'legal_citations',
      confidence: 0.70,
      reasoning: 'No legal citations found - precedents would strengthen analysis',
      metadata: { category: 'legal_support' }
    });
  }
  
  if (!contentLower.includes('conclusion') && content.length > 500) {
    suggestions.push({
      content: 'Consider adding a conclusion section to summarize your key findings and recommendations.',
      type: 'conclusion_needed',
      confidence: 0.68,
      reasoning: 'Lengthy content without conclusion - summary would improve clarity',
      metadata: { contentLength: content.length, category: 'structure' }
    });
  }

  return suggestions;
}

async function getVectorBasedSuggestions(content: string, reportType: string): Promise<any> {
  try {
    // Generate embedding for the content
    const embedding = await generateEnhancedEmbedding(content, {
      provider: 'nomic-embed',
      legalDomain: true,
      cache: true
    }) as number[];

    // Search for similar chat messages and their recommendations
    const similarMessages = await db
      .select({
        content: chatMessages.content,
        recommendations: chatRecommendations.content,
        confidence: chatRecommendations.confidence,
        type: chatRecommendations.recommendationType
      })
      .from(chatMessages)
      .leftJoin(chatRecommendations, eq(chatMessages.id, chatRecommendations.messageId))
      .where(
        // Note: This is a simplified similarity search
        // In production, you'd use pgvector operators for proper cosine similarity
        eq(chatMessages.role, 'user')
      )
      .limit(10);

    return similarMessages
      .filter(msg => msg.recommendations && msg.confidence && msg.confidence > 0.6)
      .map(msg => ({
        content: msg.recommendations!,
        type: msg.type || 'vector_based',
        confidence: msg.confidence!,
        reasoning: 'Based on similar previous conversations',
        metadata: { source: 'vector_search', similarContent: msg.content }
      }));
  } catch (error: any) {
    console.warn('Vector similarity search failed:', error);
    return [];
  }
}

async function generateContextualSuggestions(content: string, context: any): Promise<any> {
  const suggestions: Array<{
    content: string;
    type: string;
    confidence: number;
    reasoning: string;
    metadata: any;
  }> = [];

  try {
    // If we have case context, suggest case-specific improvements
    if (context.caseId) {
      suggestions.push({
        content: 'Consider referencing related evidence from this case to strengthen your analysis.',
        type: 'case_context',
        confidence: 0.75,
        reasoning: 'Working within specific case context',
        metadata: { caseId: context.caseId, category: 'context_aware' }
      });
    }

    // If we have evidence context, suggest evidence-specific analysis
    if (context.evidenceIds && context.evidenceIds.length > 0) {
      suggestions.push({
        content: 'Review the chain of custody and authentication requirements for the referenced evidence.',
        type: 'evidence_context',
        confidence: 0.78,
        reasoning: 'Specific evidence items referenced',
        metadata: { evidenceIds: context.evidenceIds, category: 'evidence_specific' }
      });
    }

    // If we have previous messages, suggest consistency
    if (context.previousMessages && context.previousMessages.length > 0) {
      suggestions.push({
        content: 'Ensure consistency with previous analysis and build upon established arguments.',
        type: 'consistency_check',
        confidence: 0.72,
        reasoning: 'Building on previous conversation context',
        metadata: { previousMessageCount: context.previousMessages.length, category: 'consistency' }
      });
    }
  } catch (error: any) {
    console.warn('Failed to generate contextual suggestions:', error);
  }

  return suggestions;
}

function deduplicateUnifiedSuggestions(suggestions: UnifiedSuggestion[]): UnifiedSuggestion[] {
  const seen = new Map<string, UnifiedSuggestion>();
  
  suggestions.forEach(suggestion => {
    const key = suggestion.content.toLowerCase().replace(/\s+/g, ' ').trim();
    
    if (!seen.has(key)) {
      seen.set(key, suggestion);
    } else {
      // Keep the suggestion with higher confidence
      const existing = seen.get(key)!;
      if (suggestion.confidence > existing.confidence) {
        seen.set(key, suggestion);
      }
    }
  });
  
  return Array.from(seen.values());
}

function rankSuggestionsByQuality(
  suggestions: UnifiedSuggestion[],
  confidenceThreshold: number
): UnifiedSuggestion[] {
  return suggestions
    .filter(s => s.confidence >= confidenceThreshold)
    .sort((a, b) => {
      // Multi-factor ranking: confidence, priority, source reliability
      const sourceWeights = {
        'enhanced_rag': 1.0,
        'protobuf_grpc': 0.95,
        'ollama': 0.9,
        'vector_search': 0.8,
        'rule_based': 0.6
      };
      
      const scoreA = (
        a.confidence * 0.5 +
        (a.metadata.priority || 1) * 0.2 +
        (sourceWeights[a.metadata.source] || 0.5) * 0.3
      );
      
      const scoreB = (
        b.confidence * 0.5 +
        (b.metadata.priority || 1) * 0.2 +
        (sourceWeights[b.metadata.source] || 0.5) * 0.3
      );
      
      return scoreB - scoreA;
    });
}

async function storeRecommendations({
  userId,
  sessionId,
  content,
  suggestions,
  recommendationId,
  reportType
}: {
  userId: string;
  sessionId: string;
  content: string;
  suggestions: UnifiedSuggestion[];
  recommendationId: string;
  reportType: string;
}): Promise<any> {
  try {
    // Generate embedding for the content
    const embedding = await generateEnhancedEmbedding(content, {
      provider: 'nomic-embed',
      legalDomain: true,
      cache: true
    }) as number[];

    // Store the message
    const messageResult = await db.insert(chatMessages).values({
      id: uuidv4(),
      sessionId,
      role: 'user',
      content,
      embedding: JSON.stringify(embedding),
      metadata: {
        reportType,
        suggestionRequestId: recommendationId,
        servicesUsed: suggestions.map(s => s.metadata.source),
        totalSuggestions: suggestions.length,
        timestamp: new Date().toISOString()
      }
    }).returning({ id: chatMessages.id });

    const messageId = messageResult[0]?.id;
    
    if (messageId) {
      // Store each recommendation with enhanced metadata
      for (let i = 0; i < suggestions.length; i++) {
        const suggestion = suggestions[i];
        await db.insert(chatRecommendations).values({
          id: suggestion.id || uuidv4(),
          userId,
          messageId,
          recommendationType: suggestion.type,
          content: suggestion.content,
          confidence: suggestion.confidence,
          metadata: {
            reasoning: suggestion.reasoning,
            source: suggestion.metadata.source,
            category: suggestion.metadata.category,
            priority: suggestion.metadata.priority,
            keywords: suggestion.metadata.keywords,
            supportingContext: suggestion.metadata.supportingContext,
            citations: suggestion.metadata.citations,
            urgency: suggestion.metadata.urgency,
            processingTimeMs: suggestion.metadata.processingTimeMs,
            rank: i + 1,
            timestamp: new Date().toISOString()
          }
        });
      }
    }
  } catch (error: any) {
    console.error('Failed to store enhanced recommendations:', error);
    // Don't throw - we don't want storage failure to break the API
  }
}
