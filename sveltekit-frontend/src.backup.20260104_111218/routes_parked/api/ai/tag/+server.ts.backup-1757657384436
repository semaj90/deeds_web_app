
import { json } from "@sveltejs/kit";
import type { RequestHandler } from './$types';


export const POST: RequestHandler = async ({ request }) => {
  try {
    const {
      content,
      fileName,
      fileType,
      enhanced = false,
    } = await request.json();

    if (!content || content.trim() === "") {
      return json({ error: "Content is required" }, { status: 400 });
    }
    // Enhanced prompt for better auto-form fill capabilities
    const enhancedPrompt = `You are an advanced legal AI assistant specializing in evidence analysis and metadata extraction. Extract comprehensive structured metadata from the following content for use in a legal case management system.

CRITICAL: Return ONLY a valid JSON object with NO additional text, markdown, or formatting.

Required JSON structure:
{
  "tags": ["relevant", "case", "tags"],
  "title": "Brief descriptive title (max 100 chars)",
  "people": ["Full Name 1", "Full Name 2"],
  "locations": ["Specific Location 1", "Address or Place 2"],
  "dates": ["YYYY-MM-DD", "YYYY-MM-DD HH:MM"],
  "organizations": ["Organization Name 1", "Company 2"],
  "evidenceType": "document|photo|video|audio|physical|digital|testimony|other",
  "legalRelevance": "critical|high|medium|low",
  "summary": "Concise summary (max 300 chars)",
  "keyFacts": ["Important fact 1", "Important fact 2", "Important fact 3"],
  "legalCategories": ["criminal|civil|contract|property|family|employment|other"],
  "confidentialityLevel": "public|internal|confidential|restricted",
  "urgencyLevel": "immediate|high|normal|low",
  "potentialWitnesses": ["Person who might testify"],
  "relatedCases": ["Case reference or number if mentioned"],
  "statutes": ["Relevant law or statute reference"],
  "monetaryAmounts": ["$1000", "$5000 damages"],
  "timeReferences": ["approximate time mentioned in content"],
  "actions": ["Action item 1", "Follow-up needed"],
  "sentiment": "positive|negative|neutral",
  "language": "en|es|fr|other",
  "qualityScore": 0.95,
  "extractionConfidence": {
    "people": 0.9,
    "locations": 0.8,
    "dates": 0.95,
    "organizations": 0.7
  },
  "redFlags": ["concerning issue 1", "potential problem 2"],
  "recommendations": ["suggested action 1", "next step 2"]
}
Analysis Guidelines:
1. Extract ALL named entities accurately
2. Identify relationships between people/organizations
3. Parse dates in various formats (relative dates like "last Tuesday")
4. Determine legal relevance based on content severity
5. Flag any privacy/confidentiality concerns
6. Suggest follow-up actions
7. Rate extraction confidence for each category
8. Identify potential red flags or concerns

File Details:
- Name: ${fileName || "Unknown"}
- Type: ${fileType || "Unknown"}
- Enhanced Analysis: ${enhanced ? "Yes" : "No"}

Content to analyze:
${content.slice(0, enhanced ? 5000 : 2000)}

Return ONLY the JSON object. No markdown, no explanations, no additional text.`;

    const basicPrompt = `Extract structured legal metadata from this content. Return ONLY valid JSON:

{
  "tags": ["tag1", "tag2"],
  "title": "Brief title",
  "people": ["person1", "person2"],
  "locations": ["location1"],
  "dates": ["date1"],
  "organizations": ["org1"],
  "evidenceType": "document|photo|video|audio|other",
  "legalRelevance": "high|medium|low",
  "summary": "Brief summary",
  "keyFacts": ["fact1", "fact2"]
}
File: ${fileName || "Unknown"}
Content: ${content.slice(0, 2000)}`;

    const prompt = enhanced ? enhancedPrompt : basicPrompt;

    // Try legal Gemma3 model first, with fallbacks
    const models = [
      "gemma3:legal",
      "llama3:legal",
      "gemma3",
      "llama3.1",
      "gemma3-legal:latest",
    ];
    let result: any = null;
    let modelUsed = "";

    for (const model of models) {
      try {
        const ollamaResponse = await fetch(
          "http://localhost:11434/api/generate",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              prompt,
              stream: false,
              options: {
                temperature: enhanced ? 0.2 : 0.3, // Lower temperature for better consistency
                top_p: 0.9,
                top_k: 40,
                repeat_penalty: 1.1,
                num_ctx: enhanced ? 8192 : 4096, // More context for enhanced analysis
              },
            }),
          },
        );

        if (ollamaResponse.ok) {
          result = await ollamaResponse.json();
          modelUsed = model;
          break;
        }
      } catch (error: any) {
        console.log(`Model ${model} failed, trying next...`);
        continue;
      }
    }
    if (!result) {
      return json({ error: "No AI models available" }, { status: 503 });
    }
    const parsedResult = await parseAndReturnTags(
      result.response,
      fileName,
      fileType,
      enhanced,
      modelUsed,
    );

    // Add embedding generation for vector search (if enhanced)
    if (enhanced) {
      try {
        await generateEmbedding(parsedResult, content);
      } catch (error: any) {
        console.log("Embedding generation failed:", error);
        // Non-critical, continue without embedding
      }
    }
    return parsedResult;
  } catch (error: any) {
    console.error("AI Tagging error:", error);
    return json(
      {
        error: "Failed to process content for tagging",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
};

async function parseAndReturnTags(
  response: string,
  fileName?: string,
  fileType?: string,
  enhanced = false,
  modelUsed = "",
): Promise<any> {
  // Enhanced default structure for auto-form fill
  let tagsResult: any = {
    tags: [],
    title: fileName || "Untitled Evidence",
    people: [],
    locations: [],
    dates: [],
    organizations: [],
    evidenceType: "other",
    legalRelevance: "medium",
    summary: "",
    keyFacts: [],

    // Enhanced fields for auto-form fill
    ...(enhanced && {
      legalCategories: [],
      confidentialityLevel: "internal",
      urgencyLevel: "normal",
      potentialWitnesses: [],
      relatedCases: [],
      statutes: [],
      monetaryAmounts: [],
      timeReferences: [],
      actions: [],
      sentiment: "neutral",
      language: "en",
      qualityScore: 0.5,
      extractionConfidence: {
        people: 0.5,
        locations: 0.5,
        dates: 0.5,
        organizations: 0.5,
      },
      redFlags: [],
      recommendations: [],
      modelUsed,
      processingTime: new Date().toISOString(),
    }),
  };

  try {
    // Multiple JSON extraction strategies
    let cleanResponse = response.trim();

    // Remove common AI response prefixes/suffixes
    const prefixesToRemove = [
      "Here is the JSON:",
      "Here's the extracted data:",
      "Based on the content, here is the structured data:",
      "The extracted metadata is:",
      "```json",
      "```",
    ];

    const suffixesToRemove = [
      "Please let me know if you need any clarification.",
      "This analysis is based on the provided content.",
      "```",
      "Let me know if you need anything else.",
    ];

    prefixesToRemove.forEach((prefix) => {
      if (cleanResponse.toLowerCase().startsWith(prefix.toLowerCase())) {
        cleanResponse = cleanResponse.substring(prefix.length).trim();
      }
    });

    suffixesToRemove.forEach((suffix) => {
      if (cleanResponse.toLowerCase().endsWith(suffix.toLowerCase())) {
        cleanResponse = cleanResponse
          .substring(0, cleanResponse.length - suffix.length)
          .trim();
      }
    });

    // Find JSON boundaries more robustly
    const jsonStart = cleanResponse.indexOf("{");
    const jsonEnd = cleanResponse.lastIndexOf("}");

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      const jsonStr = cleanResponse.substring(jsonStart, jsonEnd + 1);

      try {
        const parsed = JSON.parse(jsonStr);

        // Validate and merge with defaults
        tagsResult = {
          ...tagsResult,
          ...validateAndCleanParsedData(parsed, enhanced),
        };
      } catch (parseError) {
        console.warn("JSON parsing failed, attempting repair:", parseError);

        // Attempt JSON repair
        const repairedJson = attemptJsonRepair(jsonStr);
        if (repairedJson) {
          const parsed = JSON.parse(repairedJson);
          tagsResult = {
            ...tagsResult,
            ...validateAndCleanParsedData(parsed, enhanced),
          };
        } else {
          throw parseError;
        }
      }
    } else {
      throw new Error("No valid JSON structure found");
    }
  } catch (parseError) {
    console.error("Failed to parse AI response:", parseError);
    console.log("Raw response:", response);

    // Advanced fallback parsing using regex and NLP techniques
    tagsResult = {
      ...tagsResult,
      ...extractWithFallbackMethods(response, enhanced),
    };

    // Add warning about parsing failure
    if (enhanced) {
      tagsResult.redFlags = [
        ...(tagsResult.redFlags || []),
        "AI response parsing partially failed",
      ];
      tagsResult.qualityScore = 0.3;
    }
  }
  // Auto-detect evidence type if not provided or invalid
  if (!tagsResult.evidenceType || tagsResult.evidenceType === "other") {
    tagsResult.evidenceType = detectEvidenceType(fileType);
  }
  // Enhance with file-based metadata
  if (enhanced) {
    tagsResult = enhanceWithFileMetadata(tagsResult, fileName, fileType);
  }
  return json(tagsResult);
}
function validateAndCleanParsedData(parsed: any, enhanced: boolean): unknown {
  const result: any = {};

  // Validate arrays
  if (Array.isArray(parsed.tags))
    result.tags = parsed.tags.filter((t) => typeof t === "string");
  if (Array.isArray(parsed.people))
    result.people = parsed.people.filter((p) => typeof p === "string");
  if (Array.isArray(parsed.locations))
    result.locations = parsed.locations.filter((l) => typeof l === "string");
  if (Array.isArray(parsed.dates)) result.dates = validateDates(parsed.dates);
  if (Array.isArray(parsed.organizations))
    result.organizations = parsed.organizations.filter(
      (o) => typeof o === "string",
    );
  if (Array.isArray(parsed.keyFacts))
    result.keyFacts = parsed.keyFacts.filter((f) => typeof f === "string");

  // Validate strings
  if (typeof parsed.title === "string")
    result.title = parsed.title.substring(0, 100);
  if (typeof parsed.summary === "string")
    result.summary = parsed.summary.substring(0, 300);

  // Validate enums
  const validEvidenceTypes = [
    "document",
    "photo",
    "video",
    "audio",
    "physical",
    "digital",
    "testimony",
    "other",
  ];
  if (validEvidenceTypes.includes(parsed.evidenceType))
    result.evidenceType = parsed.evidenceType;

  const validRelevance = ["critical", "high", "medium", "low"];
  if (validRelevance.includes(parsed.legalRelevance))
    result.legalRelevance = parsed.legalRelevance;

  // Enhanced validation
  if (enhanced) {
    if (Array.isArray(parsed.legalCategories))
      result.legalCategories = parsed.legalCategories.filter(
        (c) => typeof c === "string",
      );
    if (Array.isArray(parsed.potentialWitnesses))
      result.potentialWitnesses = parsed.potentialWitnesses.filter(
        (w) => typeof w === "string",
      );
    if (Array.isArray(parsed.relatedCases))
      result.relatedCases = parsed.relatedCases.filter(
        (c) => typeof c === "string",
      );
    if (Array.isArray(parsed.statutes))
      result.statutes = parsed.statutes.filter((s) => typeof s === "string");
    if (Array.isArray(parsed.monetaryAmounts))
      result.monetaryAmounts = parsed.monetaryAmounts.filter(
        (m) => typeof m === "string",
      );
    if (Array.isArray(parsed.timeReferences))
      result.timeReferences = parsed.timeReferences.filter(
        (t) => typeof t === "string",
      );
    if (Array.isArray(parsed.actions))
      result.actions = parsed.actions.filter((a) => typeof a === "string");
    if (Array.isArray(parsed.redFlags))
      result.redFlags = parsed.redFlags.filter((r) => typeof r === "string");
    if (Array.isArray(parsed.recommendations))
      result.recommendations = parsed.recommendations.filter(
        (r) => typeof r === "string",
      );

    const validConfidentiality = [
      "public",
      "internal",
      "confidential",
      "restricted",
    ];
    if (validConfidentiality.includes(parsed.confidentialityLevel))
      result.confidentialityLevel = parsed.confidentialityLevel;

    const validUrgency = ["immediate", "high", "normal", "low"];
    if (validUrgency.includes(parsed.urgencyLevel))
      result.urgencyLevel = parsed.urgencyLevel;

    const validSentiment = ["positive", "negative", "neutral"];
    if (validSentiment.includes(parsed.sentiment))
      result.sentiment = parsed.sentiment;

    if (
      typeof parsed.qualityScore === "number" &&
      parsed.qualityScore >= 0 &&
      parsed.qualityScore <= 1
    ) {
      result.qualityScore = parsed.qualityScore;
    }
    if (typeof parsed.extractionConfidence === "object") {
      result.extractionConfidence = parsed.extractionConfidence;
    }
  }
  return result;
}
function validateDates(dates: any[]): string[] {
  return dates.filter((date) => {
    if (typeof date !== "string") return false;

    // Try to parse various date formats
    const parsedDate = new Date(date);
    if (!isNaN(parsedDate.getTime())) return true;

    // Check for relative dates or time expressions
    const timePatterns = [
      /\d{1,2}:\d{2}/, // Time format
      /yesterday|today|tomorrow/i,
      /last\s+(week|month|year)/i,
      /\d{1,2}\/\d{1,2}\/\d{2,4}/, // Date format
      /\d{4}-\d{1,2}-\d{1,2}/, // ISO date format
    ];

    return timePatterns.some((pattern) => pattern.test(date));
  });
}
function attemptJsonRepair(jsonStr: string): string | null {
  try {
    // Common JSON repair strategies
    let repaired = jsonStr;

    // Fix missing quotes around keys
    repaired = repaired.replace(
      /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
      '$1"$2":',
    );

    // Fix trailing commas
    repaired = repaired.replace(/,(\s*[}\]])/g, "$1");

    // Fix single quotes to double quotes
    repaired = repaired.replace(/'/g, '"');

    // Try to parse the repaired JSON
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null;
  }
}
function extractWithFallbackMethods(text: string, enhanced: boolean): unknown {
  const result: any = {
    tags: extractBasicTags(text),
    summary: text.substring(0, 200) + "...",
    keyFacts: [],
  };

  // Extract people using regex patterns
  const peoplePatterns = [
    /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, // First Last
    /Mr\.\s+[A-Z][a-z]+/g,
    /Mrs\.\s+[A-Z][a-z]+/g,
    /Dr\.\s+[A-Z][a-z]+/g,
  ];

  peoplePatterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      result.people = [...(result.people || []), ...matches];
    }
  });

  // Extract dates using regex
  const datePatterns = [
    /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
    /\d{4}-\d{1,2}-\d{1,2}/g,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/g,
  ];

  datePatterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      result.dates = [...(result.dates || []), ...matches];
    }
  });

  // Extract monetary amounts
  const moneyPattern = /\$[\d,]+(?:\.\d{2})?/g;
  const moneyMatches = text.match(moneyPattern);
  if (moneyMatches && enhanced) {
    result.monetaryAmounts = moneyMatches;
  }
  // Basic sentiment analysis
  if (enhanced) {
    const positiveWords = [
      "good",
      "excellent",
      "positive",
      "successful",
      "agreement",
    ];
    const negativeWords = [
      "bad",
      "negative",
      "failed",
      "dispute",
      "violation",
      "damage",
    ];

    const lowerText = text.toLowerCase();
    const positiveCount = positiveWords.filter((word) =>
      lowerText.includes(word),
    ).length;
    const negativeCount = negativeWords.filter((word) =>
      lowerText.includes(word),
    ).length;

    if (positiveCount > negativeCount) result.sentiment = "positive";
    else if (negativeCount > positiveCount) result.sentiment = "negative";
    else result.sentiment = "neutral";
  }
  return result;
}
function extractBasicTags(text: string): string[] {
  const words = text.toLowerCase().split(/\s+/);
  const commonWords = new Set([
    "the",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
  ]);

  const wordFreq = new Map();
  words.forEach((word) => {
    const cleaned = word.replace(/[^\w]/g, "");
    if (cleaned.length > 3 && !commonWords.has(cleaned)) {
      wordFreq.set(cleaned, (wordFreq.get(cleaned) || 0) + 1);
    }
  });

  return Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}
function detectEvidenceType(fileType?: string): string {
  if (!fileType) return "other";

  if (fileType.includes("image") || fileType.includes("photo")) return "photo";
  if (fileType.includes("video")) return "video";
  if (fileType.includes("audio")) return "audio";
  if (
    fileType.includes("pdf") ||
    fileType.includes("document") ||
    fileType.includes("text")
  )
    return "document";

  return "digital";
}
function enhanceWithFileMetadata(
  result: any,
  fileName?: string,
  fileType?: string,
): unknown {
  if (fileName) {
    // Extract metadata from filename
    const lowerName = fileName.toLowerCase();

    // Detect urgency from filename
    if (lowerName.includes("urgent") || lowerName.includes("emergency")) {
      result.urgencyLevel = "immediate";
    } else if (
      lowerName.includes("priority") ||
      lowerName.includes("important")
    ) {
      result.urgencyLevel = "high";
    }
    // Detect confidentiality from filename
    if (lowerName.includes("confidential") || lowerName.includes("private")) {
      result.confidentialityLevel = "confidential";
    } else if (
      lowerName.includes("restricted") ||
      lowerName.includes("classified")
    ) {
      result.confidentialityLevel = "restricted";
    }
    // Extract case numbers or references
    const caseNumberPattern = /case[_\s]?(\d+)/i;
    const match = fileName.match(caseNumberPattern);
    if (match) {
      result.relatedCases = [...(result.relatedCases || []), match[0]];
    }
  }
  // Set quality score based on available metadata
  const metadataFields = [
    "people",
    "locations",
    "dates",
    "organizations",
  ].filter((field) => result[field] && result[field].length > 0);
  result.qualityScore = Math.min(0.9, 0.3 + metadataFields.length * 0.15);

  return result;
}
async function generateEmbedding(parsedResult: any, content: string): Promise<any> {
  // Generate embeddings for vector search using Ollama's embedding model
  try {
    const embeddingText = [
      parsedResult.title,
      parsedResult.summary,
      ...parsedResult.tags,
      ...parsedResult.keyFacts,
      content.substring(0, 1000),
    ].join(" ");

    const embeddingResponse = await fetch(
      "http://localhost:11434/api/embeddings",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "nomic-embed-text",
          prompt: embeddingText,
        }),
      },
    );

    if (embeddingResponse.ok) {
      const embeddingData = await embeddingResponse.json();

      // Store embedding in Qdrant (if available)
      await fetch("/api/qdrant/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embedding: embeddingData.embedding,
          metadata: parsedResult,
          content: embeddingText,
        }),
      }).catch((error) => console.log("Qdrant storage failed:", error));
    }
  } catch (error: any) {
    console.log("Embedding generation failed:", error);
  }
}
