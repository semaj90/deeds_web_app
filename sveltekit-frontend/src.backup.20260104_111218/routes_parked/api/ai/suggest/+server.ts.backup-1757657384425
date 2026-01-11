import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';


export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const { prompt, vibe, context } = await request.json();

    if (!prompt || typeof prompt !== "string") {
      return json({ error: "Prompt is required" }, { status: 400 });
    }
    // Use Ollama for real AI response
    const response = await generateAIResponse(prompt, vibe, context);

    return json({
      response: response.text,
      suggestions: response.suggestions,
      actions: response.actions,
    });
  } catch (error: any) {
    console.error("AI suggestion error:", error);
    return json({ error: "Failed to generate AI suggestion" }, { status: 500 });
  }
};

async function generateAIResponse(
  prompt: string,
  vibe: string = "professional",
  context?: unknown,
): Promise<any> {
  try {
    // Use the ollama service instance
    await ollamaService.initialize();

    // Create enhanced prompt based on vibe and context
    const systemPrompt = createSystemPrompt(vibe, context);
    const enhancedPrompt = `${systemPrompt}\n\nUser request: ${prompt}`;

    // Get response from Ollama
    const aiResponse = await ollamaService.generate(enhancedPrompt, {
      temperature: getTemperatureForVibe(vibe),
      maxTokens: 500,
    });

    // Parse and structure the response
    const structuredResponse = parseAIResponse(aiResponse, prompt);

    return structuredResponse;
  } catch (error: any) {
    console.error("Ollama integration error:", error);

    // Fallback to mock response if Ollama fails
    return generateMockResponse(prompt, vibe, context);
  }
}
function createSystemPrompt(vibe: string, context?: unknown): string {
  const basePrompt = `You are an AI assistant for legal case management. You help prosecutors and legal professionals analyze cases, organize evidence, and provide insights.`;

  const vibeInstructions = {
    professional:
      "Respond in a formal, structured manner with clear legal terminology.",
    concise: "Provide brief, direct answers focusing on key points only.",
    investigative:
      "Take a thorough, analytical approach with detailed examination.",
    dramatic: "Use engaging, vivid language that brings the case to life.",
    technical: "Provide detailed, precise information with legal specifics.",
    collaborative: "Use inclusive language that builds on existing work.",
  };

  const contextInstruction =
    context === "canvas"
      ? " You are specifically helping with an interactive case canvas where users can visualize evidence, timelines, and case relationships."
      : "";

  return `${basePrompt} ${vibeInstructions[vibe as keyof typeof vibeInstructions] || vibeInstructions.professional}${contextInstruction}

When responding:
1. Provide actionable insights
2. Suggest specific next steps
3. Focus on legal case management context
4. Be helpful and constructive

Format your response as clear, professional advice.`;
}
function getTemperatureForVibe(vibe: string): number {
  const temperatureMap = {
    professional: 0.3,
    concise: 0.2,
    investigative: 0.4,
    dramatic: 0.7,
    technical: 0.1,
    collaborative: 0.5,
  };

  return temperatureMap[vibe as keyof typeof temperatureMap] || 0.3;
}
function parseAIResponse(aiResponse: string, originalPrompt: string) {
  // Extract suggestions and actions from the AI response
  const suggestions = extractSuggestions(aiResponse, originalPrompt);
  const actions = extractActions(aiResponse, originalPrompt);

  return {
    text: aiResponse,
    suggestions: suggestions,
    actions: actions,
  };
}
function extractSuggestions(response: string, prompt: string): string[] {
  // Smart extraction of actionable suggestions from AI response
  const defaultSuggestions = [
    "Review the evidence timeline",
    "Cross-reference witness statements",
    "Document key findings",
    "Identify missing information",
    "Consider legal precedents",
  ];

  // Try to extract specific suggestions from the AI response
  const suggestionPattern =
    /(?:suggest|recommend|consider|try|should|could)([^.!?]+)/gi;
  const matches = response.match(suggestionPattern);

  if (matches && matches.length > 0) {
    const extracted = matches
      .slice(0, 3)
      .map((match) =>
        match
          .replace(/^(suggest|recommend|consider|try|should|could)\s*/i, "")
          .trim(),
      )
      .filter((s: string) => s.length > 10 && s.length < 100);

    if (extracted.length > 0) {
      return extracted;
    }
  }
  // Return context-aware defaults based on prompt content
  if (prompt.toLowerCase().includes("evidence")) {
    return [
      "Organize evidence by category",
      "Create evidence timeline",
      "Verify evidence authenticity",
    ];
  } else if (prompt.toLowerCase().includes("witness")) {
    return [
      "Map witness locations",
      "Compare testimonies",
      "Identify testimony gaps",
    ];
  } else if (prompt.toLowerCase().includes("timeline")) {
    return ["Create visual timeline", "Mark key events", "Verify chronology"];
  }
  return defaultSuggestions.slice(0, 3);
}
function extractActions(response: string, prompt: string) {
  // Generate actionable items based on response content and prompt
  const actions: any[] = [];

  if (
    response.toLowerCase().includes("highlight") ||
    prompt.toLowerCase().includes("evidence")
  ) {
    actions.push({
      type: "highlight",
      text: "Mark important evidence",
      data: { priority: "high" },
    });
  }
  if (
    response.toLowerCase().includes("timeline") ||
    prompt.toLowerCase().includes("timeline")
  ) {
    actions.push({
      type: "annotation",
      text: "Add timeline notes",
      data: { category: "timeline" },
    });
  }
  if (
    response.toLowerCase().includes("research") ||
    response.toLowerCase().includes("precedent")
  ) {
    actions.push({
      type: "research",
      text: "Research legal precedents",
      data: { keywords: extractKeywords(prompt) },
    });
  }
  // Ensure we always have at least one action
  if (actions.length === 0) {
    actions.push({
      type: "annotation",
      text: "Add detailed notes",
      data: { category: "general" },
    });
  }
  return actions.slice(0, 3);
}
// Fallback mock response (original implementation)
async function generateMockResponse(
  prompt: string,
  vibe: string = "professional",
  context?: unknown,
): Promise<any> {
  // Simulate AI processing delay
  await new Promise((resolve) =>
    setTimeout(resolve, 1000 + Math.random() * 2000),
  );

  const vibeResponses = {
    professional: {
      prefix: "Based on my analysis of the case materials,",
      style: "formal and detailed",
    },
    creative: {
      prefix: "Looking at this from a fresh perspective,",
      style: "innovative and exploratory",
    },
    analytical: {
      prefix: "From a systematic examination of the evidence,",
      style: "logical and methodical",
    },
    collaborative: {
      prefix: "Building on the team's previous work,",
      style: "inclusive and building",
    },
  };

  const currentVibe =
    vibeResponses[vibe as keyof typeof vibeResponses] ||
    vibeResponses.professional;

  // Generate response based on prompt content
  let responseText = `${currentVibe.prefix} `;

  if (prompt.toLowerCase().includes("evidence")) {
    responseText +=
      "I recommend focusing on the documentary evidence patterns that show consistency in the timeline. Consider cross-referencing witness statements with physical evidence locations.";
  } else if (prompt.toLowerCase().includes("timeline")) {
    responseText +=
      "The chronological sequence suggests three key phases. I'd suggest creating visual markers for each phase to highlight the progression of events.";
  } else if (prompt.toLowerCase().includes("witness")) {
    responseText +=
      "The witness testimony reveals interesting correlations. Consider mapping their locations and perspectives to identify potential blind spots or confirmatory evidence.";
  } else if (prompt.toLowerCase().includes("analysis")) {
    responseText +=
      "A multi-layered approach would be beneficial here. I suggest breaking down the components into discrete elements for individual examination before synthesis.";
  } else {
    responseText +=
      "This presents an interesting challenge that would benefit from systematic documentation and cross-referencing with existing case law precedents.";
  }
  // Add context-specific suggestions
  const suggestions = [
    "Review similar cases in the database",
    "Create a visual timeline of events",
    "Map evidence to witness statements",
    "Identify gaps that need additional research",
    "Consider alternative interpretations",
  ];

  // Generate actionable items
  const actions = [
    {
      type: "highlight",
      text: "Mark key evidence for review",
      data: { priority: "high" },
    },
    {
      type: "annotation",
      text: "Add detailed notes to timeline",
      data: { category: "timeline" },
    },
    {
      type: "research",
      text: "Search for similar case precedents",
      data: { keywords: extractKeywords(prompt) },
    },
  ];

  return {
    text: responseText,
    suggestions: suggestions.slice(0, 3), // Return top 3 suggestions
    actions: actions,
  };
}
function extractKeywords(text: string): string[] {
  // Simple keyword extraction - in production would use NLP
  const commonWords = [
    "the",
    "a",
    "an",
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
  ];
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word: string) => word.length > 3 && !commonWords.includes(word));

  return [...new Set(words)].slice(0, 5);
}
