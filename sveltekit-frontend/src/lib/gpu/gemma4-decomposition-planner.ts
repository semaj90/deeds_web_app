/**
 * Gemma4 Decomposition Planner
 * Stage 1 of Policy Orchestrator: Call Gemma4 to decompose user intent into searchable subgoals
 *
 * Pattern: One agent (Gemma4) talks to another (retrieval system)
 * Input: "How do I handle authentication errors in microservices?"
 * Output: [codebase_search("auth middleware"), web_search("microservices error handling"), retrieval("unit tests")]
 */

import type { DecomposedQuery, Subgoal } from './gemma4-policy-orchestrator';

const DECOMPOSITION_PROMPT = `You are an expert research assistant breaking down complex questions into focused search tasks.

Given a user question, your job is:
1. Identify the user's INTENT (what are they trying to understand? is it exploratory, problem-solving, or verification?)
2. Extract KEY CONCEPTS (named entities, technical terms, patterns)
3. Break the question into 2-5 SUBGOALS that can be searched independently

Format your response as valid JSON only, no markdown, no extra text:
{
  "intent": "search|analyze|synthesize|iterate",
  "concepts": ["concept1", "concept2"],
  "subgoals": [
    {
      "type": "codebase_search|web_search|retrieval|verification",
      "query": "focused search query",
      "priority": 1.0,
      "reasoning": "why we need this"
    }
  ],
  "reasoning": "how these subgoals answer the original question"
}

IMPORTANT:
- Set priority=1.0 for essential searches, 0.5 for supporting, 0.2 for nice-to-have
- Type must be one of: codebase_search, web_search, retrieval, verification
- Each subgoal should be independently searchable
- Total subgoals should be 2-5 (not 1, not 10)
- Reasoning should explain HOW this subgoal helps answer the user's question
`;

interface GemmaDecompositionRequest {
  originalQuery: string;
  context?: {
    caseId?: string;
    userId?: string;
    previousContext?: string;
  };
}

interface GemmaDecompositionRaw {
  intent: 'search' | 'analyze' | 'synthesize' | 'iterate';
  concepts: string[];
  subgoals: Array<{
    type: 'codebase_search' | 'web_search' | 'retrieval' | 'verification';
    query: string;
    priority: number;
    reasoning: string;
  }>;
  reasoning: string;
}

/**
 * Call Gemma4 (TurboQuant at :8090) to decompose user query
 * Fallback: return a simple single-subgoal decomposition if Gemma4 unavailable
 */
export async function decomposeQueryWithGemma4(
  request: GemmaDecompositionRequest
): Promise<DecomposedQuery> {
  const { originalQuery, context } = request;

  // Build the actual prompt with context
  const fullPrompt = `${DECOMPOSITION_PROMPT}

User Question: ${originalQuery}${
    context?.previousContext
      ? `\n\nPrevious Context: ${context.previousContext}`
      : ''
  }

Respond with ONLY valid JSON, no other text.`;

  try {
    // Try TurboQuant at :8090
    const response = await fetch('http://127.0.0.1:8090/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal-iq4xs-direct.gguf',
        messages: [
          {
            role: 'system',
            content: 'You are an expert research assistant. Respond with ONLY valid JSON.'
          },
          { role: 'user', content: fullPrompt }
        ],
        temperature: 0.3, // low temp for structured output
        max_tokens: 1024,
        stream: false
      }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      throw new Error(`Gemma4 HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content from Gemma4');
    }

    // Parse JSON response
    const parsed = JSON.parse(content) as GemmaDecompositionRaw;

    // Convert to DecomposedQuery with numbered subgoal IDs
    const decomposed: DecomposedQuery = {
      originalQuery,
      intent: parsed.intent || 'search',
      subgoals: parsed.subgoals.map((sg, idx) => ({
        id: `sg-${idx + 1}`,
        type: sg.type,
        query: sg.query,
        priority: sg.priority ?? 1.0,
        expectedResults: Math.ceil(100 * (sg.priority ?? 1.0))
      })),
      reasoning: `Gemma4 decomposition: ${parsed.reasoning}`
    };

    return decomposed;
  } catch (err) {
    console.warn('[Decomposition] Gemma4 unavailable, falling back to simple decomposition:', err);

    // Fallback: simple extraction of keywords
    const keywords = extractKeywordsNaive(originalQuery);

    return {
      originalQuery,
      intent: 'search',
      subgoals: [
        {
          id: 'sg-1',
          type: 'codebase_search',
          query: originalQuery,
          priority: 1.0,
          expectedResults: 50
        },
        ...(keywords.length > 0
          ? [
              {
                id: 'sg-2',
                type: 'retrieval',
                query: keywords.join(' '),
                priority: 0.7,
                expectedResults: 30
              }
            ]
          : [])
      ],
      reasoning: `Fallback decomposition (Gemma4 unavailable): single codebase search + keyword retrieval`
    };
  }
}

/**
 * Naive fallback: extract nouns and significant words from query
 */
function extractKeywordsNaive(query: string): string[] {
  // Remove common words
  const stopwords = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'for',
    'from',
    'has',
    'he',
    'in',
    'is',
    'it',
    'its',
    'of',
    'on',
    'that',
    'the',
    'to',
    'was',
    'will',
    'with',
    'how',
    'what',
    'when',
    'where',
    'why',
    'do',
    'does',
    'did'
  ]);

  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w));

  // Take top 3 words as keywords
  return words.slice(0, 3);
}

/**
 * Fallback: try Ollama if TurboQuant fails
 * (slower, but more likely to work if Ollama is available)
 */
export async function decomposeQueryWithOllama(
  request: GemmaDecompositionRequest
): Promise<DecomposedQuery> {
  const { originalQuery } = request;

  try {
    const response = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-rotorquant:latest',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert research assistant. Respond with ONLY valid JSON, no markdown.'
          },
          {
            role: 'user',
            content: `${DECOMPOSITION_PROMPT}\n\nUser Question: ${originalQuery}\n\nRespond with ONLY valid JSON.`
          }
        ],
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 1024
        }
      }),
      signal: AbortSignal.timeout(60_000)
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data.message?.content;

    if (!content) {
      throw new Error('No content from Ollama');
    }

    const parsed = JSON.parse(content) as GemmaDecompositionRaw;

    return {
      originalQuery,
      intent: parsed.intent || 'search',
      subgoals: parsed.subgoals.map((sg, idx) => ({
        id: `sg-${idx + 1}`,
        type: sg.type,
        query: sg.query,
        priority: sg.priority ?? 1.0,
        expectedResults: Math.ceil(100 * (sg.priority ?? 1.0))
      })),
      reasoning: `Ollama decomposition: ${parsed.reasoning}`
    };
  } catch (err) {
    console.warn('[Decomposition] Ollama also unavailable, using fallback:', err);
    // Already implemented fallback in main function
    throw err;
  }
}

/**
 * Main entry point: try TurboQuant, fallback to Ollama, then naive extraction
 */
export async function planQuery(request: GemmaDecompositionRequest): Promise<DecomposedQuery> {
  try {
    // Try TurboQuant first (fastest)
    return await decomposeQueryWithGemma4(request);
  } catch (err) {
    console.warn('[Decomposition] TurboQuant failed, trying Ollama:', err);
    try {
      // Try Ollama as fallback
      return await decomposeQueryWithOllama(request);
    } catch (ollErr) {
      console.warn('[Decomposition] Both LLM services failed, using naive fallback:', ollErr);
      // Return naive fallback
      return {
        originalQuery: request.originalQuery,
        intent: 'search',
        subgoals: [
          {
            id: 'sg-1',
            type: 'codebase_search',
            query: request.originalQuery,
            priority: 1.0,
            expectedResults: 50
          }
        ],
        reasoning: 'Fallback: single search (LLM services unavailable)'
      };
    }
  }
}
