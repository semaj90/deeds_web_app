/**
 * RAG (Retrieval-Augmented Generation) utilities
 * Local LLM integration for case analysis and chat
 */

export interface RAGQuery {
  query: string;
  caseId: string;
  maxTokens?: number;
  temperature?: number;
  includeEvidence?: boolean;
  includeReports?: boolean;
}

export interface RAGResponse {
  response: string;
  sources: Array<{
    id: string;
    type: "evidence" | "report" | "case";
    relevance: number;
    excerpt?: string;
  }>;
  confidence: number;
  tokensUsed: number;
}

/**
 * Query local LLM with case context
 */
export async function queryLLM(ragQuery: RAGQuery): Promise<RAGResponse> {
  try {
    // TODO: This would integrate with your Ollama setup
    const response = await fetch("/api/llm/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ragQuery),
    });

    if (!response.ok) {
      throw new Error(`LLM query failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("LLM query error:", error);
    throw error;
  }
}

/**
 * Generate case summary using RAG
 */
export async function generateCaseSummary(caseId: string): Promise<string> {
  try {
    const ragQuery: RAGQuery = {
      query:
        "Provide a comprehensive summary of this case, including key evidence, timeline of events, and important findings.",
      caseId,
      maxTokens: 1000,
      temperature: 0.3,
      includeEvidence: true,
      includeReports: true,
    };

    const response = await queryLLM(ragQuery);
    return response.response;
  } catch (error) {
    console.error("Case summary generation error:", error);
    return "Failed to generate case summary. Please try again.";
  }
}

/**
 * Analyze evidence connections and patterns
 */
export async function analyzeEvidencePatterns(caseId: string): Promise<string> {
  try {
    const ragQuery: RAGQuery = {
      query:
        "Analyze the evidence in this case for patterns, connections, and inconsistencies. Identify key relationships between different pieces of evidence.",
      caseId,
      maxTokens: 800,
      temperature: 0.2,
      includeEvidence: true,
    };

    const response = await queryLLM(ragQuery);
    return response.response;
  } catch (error) {
    console.error("Evidence pattern analysis error:", error);
    return "Failed to analyze evidence patterns. Please try again.";
  }
}

/**
 * Generate investigation recommendations
 */
export async function generateInvestigationTips(
  caseId: string,
): Promise<string[]> {
  try {
    const ragQuery: RAGQuery = {
      query:
        "Based on the current evidence and case details, suggest next steps for the investigation. What additional evidence should be collected? What lines of inquiry should be pursued?",
      caseId,
      maxTokens: 600,
      temperature: 0.4,
      includeEvidence: true,
      includeReports: true,
    };

    const response = await queryLLM(ragQuery);

    // Parse response into array of recommendations
    const recommendations = response.response
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.replace(/^\d+\.\s*|^-\s*|^\*\s*/, "").trim())
      .filter((line) => line.length > 0);

    return recommendations;
  } catch (error) {
    console.error("Investigation tips generation error:", error);
    return [
      "Failed to generate investigation recommendations. Please try again.",
    ];
  }
}

/**
 * Smart search with natural language queries
 */
export async function smartSearch(
  query: string,
  caseId: string,
): Promise<{
  results: Array<{
    id: string;
    type: "evidence" | "report";
    title: string;
    relevance: number;
    snippet: string;
  }>;
  interpretation: string;
}> {
  try {
    // First, get semantic search results using embeddings
    const searchResponse = await fetch("/api/search/semantic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, caseId }),
    });

    if (!searchResponse.ok) {
      throw new Error("Search failed");
    }

    const searchResults = await searchResponse.json();

    // Then, get LLM interpretation of the query and results
    const ragQuery: RAGQuery = {
      query: `The user searched for: "${query}". Based on the search results and case context, provide a brief interpretation of what the user might be looking for and how the results relate to their query.`,
      caseId,
      maxTokens: 300,
      temperature: 0.3,
    };

    const interpretationResponse = await queryLLM(ragQuery);

    return {
      results: searchResults.results || [],
      interpretation: interpretationResponse.response,
    };
  } catch (error) {
    console.error("Smart search error:", error);
    return {
      results: [],
      interpretation: "Search failed. Please try a different query.",
    };
  }
}

/**
 * Extract key entities from text (names, locations, dates, etc.)
 */
export async function extractEntities(text: string): Promise<{
  people: string[];
  locations: string[];
  dates: string[];
  organizations: string[];
  other: string[];
}> {
  try {
    const response = await fetch("/api/nlp/entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error("Entity extraction failed");
    }

    const entities = await response.json();
    return entities;
  } catch (error) {
    console.error("Entity extraction error:", error);
    return {
      people: [],
      locations: [],
      dates: [],
      organizations: [],
      other: [],
    };
  }
}

/**
 * Generate questions for further investigation
 */
export async function generateInvestigationQuestions(
  caseId: string,
): Promise<string[]> {
  try {
    const ragQuery: RAGQuery = {
      query:
        "Based on the current evidence and case information, generate a list of important questions that need to be answered to advance this investigation. Focus on gaps in the evidence and areas that need clarification.",
      caseId,
      maxTokens: 500,
      temperature: 0.5,
      includeEvidence: true,
      includeReports: true,
    };

    const response = await queryLLM(ragQuery);

    // Parse response into questions
    const questions = response.response
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.replace(/^\d+\.\s*|^-\s*|^\*\s*/, "").trim())
      .filter((line) => line.length > 0 && line.includes("?"));

    return questions;
  } catch (error) {
    console.error("Question generation error:", error);
    return [
      "What additional evidence needs to be collected?",
      "What witnesses should be interviewed?",
    ];
  }
}
