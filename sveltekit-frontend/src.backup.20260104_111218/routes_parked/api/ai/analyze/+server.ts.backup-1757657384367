
import { json } from "@sveltejs/kit";
import type { RequestHandler } from './$types';


export const POST: RequestHandler = async ({ request }) => {
  try {
    const {
      content,
      caseId,
      reportId,
      analysisType = "comprehensive",
      model = "gemma3-legal",
    } = await request.json();

    if (!content || content.trim().length === 0) {
      return json(
        { error: "No content provided for analysis" },
        { status: 400 },
      );
    }

    // Prepare analysis prompt based on type
    let prompt = "";
    switch (analysisType) {
      case "legal":
        prompt = `Please provide a comprehensive legal analysis of this report. Identify:
1. Key legal issues
2. Relevant laws and regulations
3. Potential violations or compliance issues
4. Legal risks and implications
5. Recommended legal actions

Content to analyze:
${content}

Legal Analysis:`;
        break;

      case "evidence":
        prompt = `Please analyze this content for evidentiary value. Identify:
1. Types of evidence present
2. Strength and reliability of evidence
3. Gaps in evidence
4. Potential challenges to admissibility
5. Additional evidence needed

Content to analyze:
${content}

Evidence Analysis:`;
        break;

      case "investigation":
        prompt = `Please provide an investigative analysis of this content. Focus on:
1. Key findings and patterns
2. Investigative leads to pursue
3. Potential witnesses or sources
4. Timeline and sequence of events
5. Recommended next steps

Content to analyze:
${content}

Investigation Analysis:`;
        break;

      default: // comprehensive
        prompt = `Please provide a comprehensive analysis of this legal report. Include:
1. Key points and findings
2. Legal implications
3. Evidentiary considerations
4. Investigative insights
5. Risk assessment
6. Actionable recommendations

Content to analyze:
${content}

Comprehensive Analysis:`;
    }

    // Call the local Ollama instance
    const startTime = Date.now();

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.4, // Balanced temperature for analytical content
          top_p: 0.9,
          top_k: 40,
          max_tokens: 1000, // Longer responses for detailed analysis
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    const processingTime = Date.now() - startTime;

    if (!data.response) {
      throw new Error("No response from AI model");
    }

    // Parse the analysis response to extract structured information
    const analysisText = data.response.trim();
    const parsedAnalysis = parseAnalysisResponse(analysisText, analysisType);

    // Create enhanced analysis result with proper typing
    const enhancedAnalysis = createEnhancedAnalysis(parsedAnalysis, analysisText, {
      analysisType,
      model,
      processingTime,
      contentLength: content.length,
      caseId,
      reportId
    });

    return json({
      success: true,
      analysis: enhancedAnalysis,
      rawAnalysis: analysisText,
      analysisType,
      model: model,
      processingTime: processingTime,
      metadata: {
        analyzedAt: new Date().toISOString(),
        caseId,
        reportId,
        contentLength: content.length,
        confidence: enhancedAnalysis.confidence,
        validationScore: enhancedAnalysis.validationScore,
        riskLevel: enhancedAnalysis.riskLevel,
        complexityLevel: enhancedAnalysis.complexityLevel,
      },
    });
  } catch (error: any) {
    console.error("AI analysis error:", error);

    // Check if it's an Ollama connection error
    if (error instanceof Error && error.message.includes("fetch")) {
      return json(
        {
          error:
            "Unable to connect to local AI service. Please ensure Ollama is running.",
        },
        { status: 503 },
      );
    }

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate analysis",
      },
      { status: 500 },
    );
  }
};

function parseAnalysisResponse(analysisText: string, analysisType: string) {
  // Extract key points, recommendations, and other structured data
  const sections = analysisText.split(/\d+\.\s+|\n\n+/);

  const keyPoints: string[] = [];
  const recommendations: string[] = [];
  const risks: string[] = [];
  const findings: string[] = [];

  sections.forEach((section) => {
    const lowerSection = section.toLowerCase();
    const trimmedSection = section.trim();

    if (!trimmedSection) return;

    // Categorize content based on keywords
    if (
      lowerSection.includes("recommend") ||
      lowerSection.includes("should") ||
      lowerSection.includes("suggest")
    ) {
      recommendations.push(trimmedSection);
    } else if (
      lowerSection.includes("risk") ||
      lowerSection.includes("concern") ||
      lowerSection.includes("challenge")
    ) {
      risks.push(trimmedSection);
    } else if (
      lowerSection.includes("finding") ||
      lowerSection.includes("evidence") ||
      lowerSection.includes("indicates")
    ) {
      findings.push(trimmedSection);
    } else if (trimmedSection.length > 20) {
      keyPoints.push(trimmedSection);
    }
  });

  return {
    keyPoints: keyPoints.slice(0, 5),
    recommendations: recommendations.slice(0, 5),
    risks: risks.slice(0, 3),
    findings: findings.slice(0, 5),
    confidence: calculateConfidence(analysisText),
  };
}

function calculateConfidence(text: string): number {
  // Simple confidence calculation based on text characteristics
  let confidence = 0.7; // Base confidence

  // Check for specific legal terms and structure
  const legalTerms = [
    "statute",
    "regulation",
    "precedent",
    "evidence",
    "testimony",
    "liability",
    "violation",
    "compliance",
    "analysis",
    "finding",
  ];

  const lowerText = text.toLowerCase();
  const termCount = legalTerms.filter((term) =>
    lowerText.includes(term),
  ).length;

  // Adjust confidence based on legal terminology usage
  confidence += (termCount / legalTerms.length) * 0.2;

  // Check for structured analysis (numbered points, clear sections)
  if (
    text.includes("1.") ||
    text.includes("Key") ||
    text.includes("Recommendation")
  ) {
    confidence += 0.1;
  }

  // Ensure confidence is within reasonable bounds
  return Math.min(0.95, Math.max(0.6, confidence));
}

export interface AnalysisContext {
  analysisType: string;
  model: string;
  processingTime: number;
  contentLength: number;
  caseId?: string;
  reportId?: string;
}

function createEnhancedAnalysis(parsedAnalysis: any, analysisText: string, context: AnalysisContext) {
  const confidence = calculateConfidence(analysisText);
  
  // Calculate validation score (0-100) based on various factors
  const validationScore = calculateValidationScore(analysisText, confidence, context);
  
  // Determine risk level based on content analysis
  const riskLevel = determineRiskLevel(analysisText, parsedAnalysis);
  
  // Determine complexity level
  const complexityLevel = determineComplexityLevel(analysisText, context);
  
  // Create analysis metrics
  const analysisMetrics = {
    contentLength: context.contentLength,
    processingSteps: parsedAnalysis.keyPoints?.length || 0,
    qualityScore: Math.round(confidence * 100),
    completenessScore: calculateCompletenessScore(parsedAnalysis),
    accuracyIndicators: extractAccuracyIndicators(analysisText),
    confidenceDistribution: {
      high: confidence > 0.8 ? 1 : 0,
      medium: confidence > 0.6 && confidence <= 0.8 ? 1 : 0,
      low: confidence <= 0.6 ? 1 : 0
    }
  };

  return {
    ...parsedAnalysis,
    validationScore,
    riskLevel,
    complexityLevel,
    confidence,
    analysisMetrics,
    model: context.model,
    processingTime: context.processingTime,
    analyzedAt: new Date().toISOString(),
    version: 1
  };
}

function calculateValidationScore(text: string, confidence: number, context: AnalysisContext): number {
  let score = confidence * 70; // Base score from confidence (0-70)
  
  // Add points for structured analysis
  if (text.includes("1.") && text.includes("2.")) score += 10;
  if (text.includes("Recommendation") || text.includes("recommend")) score += 5;
  if (text.includes("Risk") || text.includes("concern")) score += 5;
  if (text.includes("Evidence") || text.includes("finding")) score += 5;
  
  // Add points for legal terminology
  const legalTerms = ["statute", "precedent", "liability", "compliance", "violation"];
  const termCount = legalTerms.filter((term: any) => text.toLowerCase().includes(term)).length;
  score += termCount * 2;
  
  // Add points for comprehensive analysis (longer content usually more thorough)
  if (context.contentLength > 1000) score += 3;
  
  return Math.min(100, Math.max(0, Math.round(score)));
}

function determineRiskLevel(text: string, parsedAnalysis: any): "low" | "medium" | "high" | "critical" {
  const lowerText = text.toLowerCase();
  const risks = parsedAnalysis.risks || [];
  
  // Check for critical risk indicators
  if (lowerText.includes("critical") || lowerText.includes("urgent") || lowerText.includes("immediate")) {
    return "critical";
  }
  
  // Check for high risk indicators
  if (risks.length > 3 || lowerText.includes("serious") || lowerText.includes("significant")) {
    return "high";
  }
  
  // Check for medium risk indicators
  if (risks.length > 1 || lowerText.includes("moderate") || lowerText.includes("concern")) {
    return "medium";
  }
  
  return "low";
}

function determineComplexityLevel(text: string, context: AnalysisContext): "simple" | "moderate" | "complex" | "highly_complex" {
  const lowerText = text.toLowerCase();
  
  // Simple heuristics based on content length, legal terms, and structure
  const legalTermCount = ["statute", "precedent", "regulation", "jurisdiction", "liability"].filter(
    (term: any) => lowerText.includes(term)
  ).length;
  
  if (context.contentLength > 2000 && legalTermCount > 3) {
    return "highly_complex";
  } else if (context.contentLength > 1000 && legalTermCount > 2) {
    return "complex";
  } else if (context.contentLength > 500 || legalTermCount > 1) {
    return "moderate";
  }
  
  return "simple";
}

function calculateCompletenessScore(parsedAnalysis: any): number {
  let score = 0;
  
  if (parsedAnalysis.keyPoints?.length > 0) score += 25;
  if (parsedAnalysis.recommendations?.length > 0) score += 25;
  if (parsedAnalysis.risks?.length > 0) score += 25;
  if (parsedAnalysis.findings?.length > 0) score += 25;
  
  return score;
}

function extractAccuracyIndicators(text: string): string[] {
  const indicators: string[] = [];
  
  if (text.includes("based on") || text.includes("according to")) {
    indicators.push("source_referenced");
  }
  if (text.includes("analysis shows") || text.includes("evidence indicates")) {
    indicators.push("evidence_based");
  }
  if (text.includes("recommend") || text.includes("suggest")) {
    indicators.push("actionable_insights");
  }
  if (text.includes("1.") && text.includes("2.")) {
    indicators.push("structured_analysis");
  }
  
  return indicators;
}
