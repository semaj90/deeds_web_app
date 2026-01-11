import type { RequestHandler } from './$types';

/*
 * Deep Legal Analysis API Endpoint
 * Provides comprehensive legal text analysis using LegalBERT and enhanced processing
 */

import { analyzeLegalText } from "$lib/services/comprehensive-database-orchestrator";

export interface DeepAnalysisRequest {
  text: string;
  userRole?: string;
  caseId?: string;
  options?: {
    includeEntities?: boolean;
    includeConcepts?: boolean;
    includeSentiment?: boolean;
    includeComplexity?: boolean;
    includeRecommendations?: boolean;
  };
}

export const POST: RequestHandler = async ({ request }) => {
  const startTime = Date.now();

  try {
    const body: DeepAnalysisRequest = await request.json();
    const { text, userRole, caseId, options = {} } = body;

    if (!text?.trim()) {
      return json({ error: 'Text is required for analysis' }, { status: 400 });
    }

    // Default options
    const analysisOptions = {
      includeEntities: true,
      includeConcepts: true,
      includeSentiment: true,
      includeComplexity: true,
      includeRecommendations: true,
      ...options,
    };

    // Perform deep legal analysis
    const analysis = await analyzeLegalText(text, analysisOptions);

    // Generate role-specific recommendations
    const recommendations = generateRoleSpecificRecommendations(analysis, userRole, text);

    // Extract key points
    const keyPoints = extractKeyPoints(analysis, text);

    // Calculate overall analysis confidence
    const confidence = calculateAnalysisConfidence(analysis);

    // Generate next steps
    const nextSteps = generateNextSteps(analysis, userRole, caseId);

    const result = {
      ...analysis,
      recommendations,
      keyPoints,
      nextSteps,
      metadata: {
        processingTime: Date.now() - startTime,
        textLength: text.length,
        userRole,
        caseId,
        analysisOptions,
        confidence,
      },
    };

    return json(result);
  } catch (error: any) {
    console.error('Deep analysis API error:', error);

    return json(
      {
        error: 'Analysis failed',
        message: error.message,
        processingTime: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
};

function generateRoleSpecificRecommendations(
  analysis: any,
  userRole?: string,
  text?: string
): string[] {
  const recommendations = [];

  switch (userRole) {
    case 'prosecutor':
      if (analysis.entities?.some((e: any) => e.type === 'LEGAL_CONCEPT')) {
        recommendations.push('Consider gathering evidence related to identified legal concepts');
      }
      if (analysis.complexity?.legalComplexity > 0.7) {
        recommendations.push('This complex matter may require expert witnesses');
      }
      recommendations.push('Document all legal research and case precedents');
      recommendations.push('Prepare for potential defense arguments');
      break;

    case 'defense':
      recommendations.push('Review all prosecution evidence critically');
      if (analysis.entities?.some((e: any) => e.type === 'STATUTE')) {
        recommendations.push('Research constitutional challenges to cited statutes');
      }
      recommendations.push('Identify potential mitigating factors');
      break;

    case 'judge':
      recommendations.push('Ensure all parties have adequate time for preparation');
      if (analysis.complexity?.legalComplexity > 0.8) {
        recommendations.push('Consider scheduling additional time for oral arguments');
      }
      recommendations.push('Review jurisdictional precedents');
      break;

    default:
      recommendations.push('Consult with qualified legal counsel');
      recommendations.push('Gather all relevant documentation');
      recommendations.push('Research applicable laws and regulations');
  }

  // Add general recommendations based on analysis
  if (analysis.entities?.length > 5) {
    recommendations.push(
      'This matter involves multiple legal entities - create a comprehensive case map'
    );
  }

  if (analysis.sentiment?.classification === 'negative') {
    recommendations.push(
      'The tone suggests potential conflict - consider mediation or settlement options'
    );
  }

  return recommendations;
}

function extractKeyPoints(analysis: any, text: string): string[] {
  const keyPoints = [];

  // From summary
  if (analysis.summary?.keyPoints) {
    keyPoints.push(...analysis.summary.keyPoints);
  }

  // From entities
  if (analysis.entities?.length > 0) {
    const importantEntities = analysis.entities
      .filter((e: any) => e.confidence > 0.8)
      .slice(0, 3)
      .map((e: any) => `Key legal concept: ${e.text}`);
    keyPoints.push(...importantEntities);
  }

  // From concepts
  if (analysis.concepts?.length > 0) {
    const topConcepts = analysis.concepts
      .filter((c: any) => c.relevance > 0.8)
      .slice(0, 2)
      .map((c: any) => `Important legal area: ${c.concept}`);
    keyPoints.push(...topConcepts);
  }

  // From complexity
  if (analysis.complexity?.legalComplexity > 0.7) {
    keyPoints.push('High legal complexity detected - requires careful analysis');
  }

  return keyPoints.slice(0, 5); // Limit to top 5 key points
}

function calculateAnalysisConfidence(analysis: any): number {
  let confidence = 0.5;

  // Boost from entities
  if (analysis.entities?.length > 0) {
    const avgEntityConfidence =
      analysis.entities.reduce((sum: number, e: any) => sum + e.confidence, 0) /
      analysis.entities.length;
    confidence += avgEntityConfidence * 0.3;
  }

  // Boost from concepts
  if (analysis.concepts?.length > 0) {
    const avgConceptRelevance =
      analysis.concepts.reduce((sum: number, c: any) => sum + c.relevance, 0) /
      analysis.concepts.length;
    confidence += avgConceptRelevance * 0.2;
  }

  // Boost from sentiment confidence
  if (analysis.sentiment?.confidence) {
    confidence += analysis.sentiment.confidence * 0.1;
  }

  return Math.min(confidence, 1.0);
}

function generateNextSteps(analysis: any, userRole?: string, caseId?: string): string[] {
  const steps = [];

  if (caseId) {
    steps.push(`Document this analysis in Case ${caseId}`);
  }

  // Based on analysis results
  if (analysis.entities?.some((e: any) => e.type === 'CASE_CITATION')) {
    steps.push('Research cited cases for precedential value');
  }

  if (analysis.entities?.some((e: any) => e.type === 'STATUTE')) {
    steps.push('Verify current status of referenced statutes');
  }

  if (analysis.complexity?.legalComplexity > 0.6) {
    steps.push('Consider consulting subject matter experts');
  }

  // Role-specific steps
  switch (userRole) {
    case 'prosecutor':
      steps.push('Prepare charging documents if warranted');
      steps.push('Coordinate with law enforcement for additional evidence');
      break;
    case 'defense':
      steps.push('Interview client about identified legal issues');
      steps.push('Research potential defenses and mitigating factors');
      break;
    case 'paralegal':
      steps.push('Prepare research memo for supervising attorney');
      steps.push('Organize supporting documents and exhibits');
      break;
  }

  steps.push('Schedule follow-up review of legal developments');

  return steps;
}
