import type { RequestHandler } from './$types';

/*
 * Enhanced AI Evidence Processing Endpoint
 * Optimized for Gemma3-legal-latest model with native Windows integration
 * Full-stack architecture: PostgreSQL + pgvector + Neo4j + Redis + Ollama
 */

import { json } from '@sveltejs/kit';
import { getUser } from '$lib/server/auth';

// Enhanced RAG service integration (port 8094)
const ENHANCED_RAG_URL = 'http://localhost:8094';
const OLLAMA_URL = 'http://localhost:11434';

export interface ProcessEvidenceRequest {
  caseId: string;
  evidence: any[];
  userId: string;
  model: string;
  analysisType?: 'summary' | 'risk_analysis' | 'legal_research' | 'case_comparison';
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LegalAnalysisResponse {
  summary: string;
  sources: Array<{
    id: string;
    title: string;
    relevance: number;
    type: 'case' | 'statute' | 'evidence' | 'precedent';
  }>;
  confidence: number;
  legalConcepts: string[];
  recommendations: string[];
  riskAssessment?: {
    level: 'low' | 'medium' | 'high';
    factors: string[];
  };
  processingTime: number;
  tokenCount: number;
}

export const POST: RequestHandler = async ({ request, cookies }) => {
  const startTime = performance.now();
  
  try {
    // Authentication check
    const { user } = await getUser({ request, cookies } as any);
    if (!user) {
      return json({ error: 'Authentication required' }, { status: 401 });
    }

    // Parse request body
    const body: ProcessEvidenceRequest = await request.json();
    const { 
      caseId, 
      evidence, 
      userId, 
      model = 'gemma3-legal:latest',
      analysisType = 'summary',
      temperature = 0.3, // Lower for legal precision
      maxTokens = 2048,
      stream = false 
    } = body;

    // Validate required fields
    if (!caseId || !evidence || !userId) {
      return json({ 
        error: 'Missing required fields: caseId, evidence, userId' 
      }, { status: 400 });
    }

    // Verify user matches authenticated user
    if (userId !== user.id) {
      return json({ error: 'User ID mismatch' }, { status: 403 });
    }

    // Check Ollama model availability
    const modelCheck = await checkOllamaModel(model);
    if (!modelCheck.available) {
      return json({ 
        error: `Model ${model} not available. Available models: ${modelCheck.available.join(', ')}` 
      }, { status: 503 });
    }

    // Prepare enhanced context for legal analysis
    const enhancedContext = {
      caseId,
      evidence,
      userId,
      analysisType,
      model,
      systemPrompt: getLegalSystemPrompt(analysisType),
      temperature,
      maxTokens,
      stream,
      metadata: {
        userRole: user.role,
        userSpecialties: user.legalSpecialties || [],
        timestamp: new Date().toISOString()
      }
    };

    // Route to Enhanced RAG service GPU processing
    const ragResponse = await fetch(`${ENHANCED_RAG_URL}/api/gpu/compute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId,
        'X-Case-ID': caseId
      },
      body: JSON.stringify({
        input_data: enhancedContext,
        operation: 'legal_analysis',
        model: model,
        context: enhancedContext
      })
    });

    if (!ragResponse.ok) {
      // Fallback to direct Ollama if RAG service unavailable
      console.warn('Enhanced RAG service unavailable, falling back to direct Ollama');
      return await processWithDirectOllama(enhancedContext, startTime);
    }

    let ragResult;
    try {
      ragResult = await ragResponse.json();
    } catch (error: any) {
      console.warn('RAG service response parsing failed, falling back to direct Ollama');
      return await processWithDirectOllama(enhancedContext, startTime);
    }
    
    // Enhance response with additional legal analysis
    const enhancedResult: LegalAnalysisResponse = {
      summary: ragResult.summary || ragResult.response,
      sources: ragResult.sources || [],
      confidence: ragResult.confidence || 0.85,
      legalConcepts: extractLegalConcepts(ragResult.summary || ''),
      recommendations: generateRecommendations(ragResult, analysisType),
      riskAssessment: assessLegalRisk(ragResult, evidence),
      processingTime: performance.now() - startTime,
      tokenCount: ragResult.tokenCount || estimateTokenCount(ragResult.summary || '')
    };

    // Log analysis for audit trail
    await logAnalysis({
      userId,
      caseId,
      analysisType,
      model,
      confidence: enhancedResult.confidence,
      processingTime: enhancedResult.processingTime
    });

    return json(enhancedResult);

  } catch (error: any) {
    console.error('Evidence processing error:', error);
    
    return json({
      error: 'Failed to process evidence',
      details: error instanceof Error ? error.message : 'Unknown error',
      processingTime: performance.now() - startTime
    }, { status: 500 });
  }
};

// Check Ollama model availability
async function checkOllamaModel(model: string): Promise<any> {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!response.ok) {
      return { available: false, models: [] };
    }
    
    const data = await response.json();
    const availableModels = data.models?.map((m: any) => m.name) || [];
    
    return {
      available: availableModels.includes(model),
      models: availableModels
    };
  } catch (error: any) {
    console.error('Ollama availability check failed:', error);
    return { available: false, models: [] };
  }
}

// Get specialized system prompt for legal analysis
function getLegalSystemPrompt(analysisType: string): string {
  const basePrompt = `You are a specialized legal AI assistant trained on legal documents, case law, and statutory materials. 
Provide accurate, precise analysis following legal standards and best practices.
Always cite relevant sources and indicate confidence levels.`;

  const typeSpecificPrompts = {
    summary: `${basePrompt}
Focus on: Key legal issues, relevant facts, applicable law, and case conclusions.
Format: Clear, structured summary suitable for legal professionals.`,

    risk_analysis: `${basePrompt}
Focus on: Legal risks, potential liabilities, compliance issues, and mitigation strategies.
Format: Risk assessment with severity levels and actionable recommendations.`,

    legal_research: `${basePrompt}
Focus on: Applicable statutes, case precedents, legal principles, and jurisdictional considerations.
Format: Comprehensive research memo with citations and legal analysis.`,

    case_comparison: `${basePrompt}
Focus on: Similarities/differences in facts, legal issues, holdings, and reasoning.
Format: Comparative analysis highlighting relevant patterns and distinctions.`
  };

  return typeSpecificPrompts[analysisType] || typeSpecificPrompts.summary;
}

// Fallback processing with direct Ollama integration
async function processWithDirectOllama(context: any, startTime: number): Promise<any> {
  try {
    const prompt = createLegalPrompt(context);
    
    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: context.model,
        prompt,
        system: context.systemPrompt,
        options: {
          temperature: context.temperature,
          num_predict: context.maxTokens,
          top_p: 0.9,
          repeat_penalty: 1.1
        },
        stream: false
      })
    });

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama error: ${ollamaResponse.status}`);
    }

    const result = await ollamaResponse.json();
    
    return json({
      summary: result.response,
      sources: [],
      confidence: 0.75, // Lower confidence for direct processing
      legalConcepts: extractLegalConcepts(result.response),
      recommendations: [],
      processingTime: performance.now() - startTime,
      tokenCount: estimateTokenCount(result.response)
    });

  } catch (error: any) {
    throw new Error(`Direct Ollama processing failed: ${error.message}`);
  }
}

// Create optimized prompt for legal analysis
function createLegalPrompt(context: any): string {
  const evidenceText = context.evidence
    .map((item: any, index: number) => `Evidence ${index + 1}: ${JSON.stringify(item)}`)
    .join('\n\n');

  return `Case ID: ${context.caseId}
Analysis Type: ${context.analysisType}

Evidence to Analyze:
${evidenceText}

Please provide a comprehensive ${context.analysisType.replace('_', ' ')} of this evidence.
Include relevant legal principles, potential issues, and actionable insights.`;
}

// Extract legal concepts from analysis text
function extractLegalConcepts(text: string): string[] {
  const legalTerms = [
    'negligence', 'contract', 'tort', 'liability', 'damages', 'breach',
    'jurisdiction', 'statute of limitations', 'due process', 'evidence',
    'precedent', 'case law', 'statutory', 'constitutional', 'procedural',
    'substantive', 'discovery', 'motion', 'pleading', 'settlement'
  ];

  const concepts = legalTerms.filter(term => 
    text.toLowerCase().includes(term.toLowerCase())
  );

  return [...new Set(concepts)]; // Remove duplicates
}

// Generate contextual recommendations
function generateRecommendations(result: any, analysisType: string): string[] {
  const recommendations: string[] = [];

  if (analysisType === 'risk_analysis') {
    recommendations.push(
      'Review insurance coverage for identified risks',
      'Document all evidence thoroughly',
      'Consider early settlement negotiations if liability is clear'
    );
  } else if (analysisType === 'legal_research') {
    recommendations.push(
      'Review recent case law in this jurisdiction',
      'Check for updated statutory requirements',
      'Consult specialized legal databases'
    );
  }

  return recommendations;
}

// Assess legal risk level
function assessLegalRisk(result: any, evidence: any[]) {
  // Simple heuristic - in production, use more sophisticated analysis
  const riskKeywords = ['negligence', 'breach', 'violation', 'damages', 'liability'];
  const text = (result.summary || '').toLowerCase();
  
  const riskCount = riskKeywords.filter(keyword => text.includes(keyword)).length;
  const evidenceCount = evidence.length;

  let level: 'low' | 'medium' | 'high' = 'low';
  const factors: string[] = [];

  if (riskCount > 2 || evidenceCount > 10) {
    level = 'high';
    factors.push('Multiple risk indicators identified', 'Substantial evidence volume');
  } else if (riskCount > 0 || evidenceCount > 5) {
    level = 'medium';
    factors.push('Some risk indicators present', 'Moderate evidence complexity');
  } else {
    factors.push('Limited risk indicators', 'Manageable evidence volume');
  }

  return { level, factors };
}

// Estimate token count (rough approximation)
function estimateTokenCount(text: string): number {
  return Math.ceil(text.split(/\s+/).length * 1.3); // Rough token estimation
}

// Log analysis for audit trail
async function logAnalysis(data: any): Promise<any> {
  try {
    // In production, log to database or audit service
    console.log('Legal analysis logged:', {
      timestamp: new Date().toISOString(),
      ...data
    });
  } catch (error: any) {
    console.warn('Failed to log analysis:', error);
  }
}