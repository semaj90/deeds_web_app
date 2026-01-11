
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, fetch }) => {
  try {
    const { query, jurisdiction = 'all', category = 'all', useAI = true } = await request.json();

    if (!query || query.trim().length === 0) {
      return json({ error: 'Search query is required' }, { status: 400 });
    }

    // First, get basic search results
    const searchParams = new URLSearchParams({
      q: query,
      jurisdiction,
      category,
      limit: '20'
    });

    const basicSearchResponse = await fetch(`/api/laws/search?${searchParams}`);
    const basicResults = await basicSearchResponse.json();

    if (!useAI) {
      return json(basicResults);
    }

    // Enhance with AI analysis
    const aiEnhancedResults = await enhanceWithAI(query, basicResults.laws || [], fetch);

    return json({
      success: true,
      laws: aiEnhancedResults.laws,
      aiSummary: aiEnhancedResults.summary,
      suggestions: aiEnhancedResults.suggestions,
      count: aiEnhancedResults.laws.length,
      query,
      filters: { jurisdiction, category },
      enhanced: true,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('AI legal search error:', error);
    return json(
      { 
        success: false, 
        error: 'AI search failed',
        laws: [],
        count: 0 
      }, 
      { status: 500 }
    );
  }
};

async function enhanceWithAI(query: string, laws: any[], fetch: Function): Promise<any> {
  try {
    // Use AI to analyze the query and provide legal context
    const aiAnalysisPrompt = `Analyze this legal search query and provide insights:

Query: "${query}"

Found Laws:
${laws.map(law => `- ${law.title} (${law.code}): ${law.description}`).join('\n')}

Please provide:
1. A brief summary of what the user is likely looking for
2. Key legal concepts involved
3. Additional search suggestions
4. Relevance ranking of the found laws

Format your response as JSON with these fields: summary, concepts, suggestions, rankings`;

    const aiResponse = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: aiAnalysisPrompt,
        temperature: 0.3, // Lower temperature for more focused analysis
        model: 'gemma3-legal:latest'
      })
    });

    let aiAnalysis = null;
    if (aiResponse.ok) {
      const aiData = await aiResponse.json();
      try {
        // Try to parse AI response as JSON
        aiAnalysis = JSON.parse(aiData.response || '{}');
      } catch {
        // If not valid JSON, create a basic analysis
        aiAnalysis = {
          summary: aiData.response?.substring(0, 200) || 'AI analysis unavailable',
          concepts: extractLegalConcepts(query),
          suggestions: generateSuggestions(query),
          rankings: laws.map((_, index) => index)
        };
      }
    }

    // If AI analysis failed, use fallback analysis
    if (!aiAnalysis) {
      aiAnalysis = {
        summary: `Search results for "${query}" - found ${laws.length} relevant laws`,
        concepts: extractLegalConcepts(query),
        suggestions: generateSuggestions(query),
        rankings: laws.map((_, index) => index)
      };
    }

    // Reorder laws based on AI rankings if available
    let reorderedLaws = [...laws];
    if (aiAnalysis.rankings && Array.isArray(aiAnalysis.rankings)) {
      try {
        reorderedLaws = aiAnalysis.rankings.map((index: number) => laws[index]).filter(Boolean);
      } catch {
        reorderedLaws = laws;
      }
    }

    // Add AI confidence scores to laws
    const enhancedLaws = reorderedLaws.map((law, index) => ({
      ...law,
      aiRelevanceScore: Math.max(0.9 - (index * 0.1), 0.1),
      aiInsights: generateLawInsights(law, query)
    }));

    return {
      laws: enhancedLaws,
      summary: aiAnalysis.summary || 'AI analysis complete',
      suggestions: aiAnalysis.suggestions || generateSuggestions(query),
      concepts: aiAnalysis.concepts || extractLegalConcepts(query)
    };

  } catch (error: any) {
    console.error('AI enhancement error:', error);
    
    // Return basic enhancement on AI failure
    return {
      laws: laws.map(law => ({
        ...law,
        aiRelevanceScore: 0.8,
        aiInsights: generateLawInsights(law, query)
      })),
      summary: `Found ${laws.length} laws related to "${query}"`,
      suggestions: generateSuggestions(query),
      concepts: extractLegalConcepts(query)
    };
  }
}

function extractLegalConcepts(query: string): string[] {
  const concepts = [];
  const lowerQuery = query.toLowerCase();

  const conceptMap = {
    'murder': ['homicide', 'intent', 'malice aforethought', 'criminal law'],
    'contract': ['agreement', 'consideration', 'offer', 'acceptance', 'civil law'],
    'evidence': ['admissibility', 'relevance', 'hearsay', 'procedure'],
    'search': ['fourth amendment', 'warrant', 'probable cause', 'constitutional law'],
    'robbery': ['theft', 'force', 'fear', 'felony', 'criminal law'],
    'corporation': ['business entity', 'filing', 'articles', 'corporate law'],
    'property': ['ownership', 'title', 'real estate', 'civil law']
  };

  for (const [keyword, relatedConcepts] of Object.entries(conceptMap)) {
    if (lowerQuery.includes(keyword)) {
      concepts.push(...relatedConcepts);
    }
  }

  return [...new Set(concepts)]; // Remove duplicates
}

function generateSuggestions(query: string): string[] {
  const suggestions = [];
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.includes('murder') || lowerQuery.includes('homicide')) {
    suggestions.push(
      'What are the degrees of murder in California?',
      'What is the difference between murder and manslaughter?',
      'What evidence is needed to prove intent to kill?'
    );
  } else if (lowerQuery.includes('contract')) {
    suggestions.push(
      'What makes a contract legally binding?',
      'How can a contract be breached?',
      'What are the remedies for contract violations?'
    );
  } else if (lowerQuery.includes('evidence')) {
    suggestions.push(
      'What makes evidence admissible in court?',
      'How do I establish chain of custody?',
      'What is the hearsay rule?'
    );
  } else if (lowerQuery.includes('search')) {
    suggestions.push(
      'When is a warrant required for a search?',
      'What constitutes probable cause?',
      'What are the exceptions to the warrant requirement?'
    );
  } else {
    suggestions.push(
      'What are the elements of this legal concept?',
      'What precedent cases apply?',
      'What evidence is needed to prove this?'
    );
  }

  return suggestions.slice(0, 3);
}

function generateLawInsights(law: any, query: string): string {
  const lowerQuery = query.toLowerCase();
  const lowerTitle = law.title.toLowerCase();

  if (lowerQuery.includes('element') && lowerTitle.includes('murder')) {
    return 'Key elements: unlawful killing, human being, malice aforethought';
  } else if (lowerQuery.includes('penalty') || lowerQuery.includes('sentence')) {
    return 'Refers to penalties and sentencing guidelines for this offense';
  } else if (lowerQuery.includes('procedure')) {
    return 'Outlines procedural requirements and court processes';
  } else if (lowerQuery.includes('contract') && lowerTitle.includes('contract')) {
    return 'Establishes fundamental requirements for valid contracts';
  } else {
    return 'Relevant to your search query - consider context and application';
  }
}