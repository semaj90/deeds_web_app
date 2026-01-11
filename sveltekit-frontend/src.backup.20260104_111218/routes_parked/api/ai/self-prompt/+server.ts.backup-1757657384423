import type { RequestHandler } from './$types';

/*
 * Self-Prompting AI System for Prosecutors
 * Generates contextual suggestions based on case data and workflow
 */

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { caseId, context, currentPhase } = await request.json();

    // Generate context-aware prompts based on prosecutor workflow
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3-legal:latest',
        prompt: `As a legal AI assistant for prosecutors, generate 4 helpful question suggestions for case ${caseId} in the ${currentPhase} phase.

Context: ${context}
Phase: ${currentPhase}

Focus on practical prosecutor needs:
- Evidence strength assessment
- Legal strategy development  
- Timeline analysis
- Precedent research
- Defense preparation

Return only 4 concise, actionable questions as a JSON array:
["Question 1", "Question 2", "Question 3", "Question 4"]`,
        stream: false
      })
    });

    const result = await response.json();
    
    try {
      const suggestions = JSON.parse(result.response);
      return json({ 
        success: true, 
        suggestions: Array.isArray(suggestions) ? suggestions : [
          "Analyze evidence strength for this case",
          "Find similar cases with comparable evidence", 
          "Identify potential defense arguments",
          "Review timeline for inconsistencies"
        ]
      });
    } catch (parseError) {
      // Fallback suggestions
      return json({ 
        success: true, 
        suggestions: [
          "Analyze evidence strength for this case",
          "Find similar cases with comparable evidence",
          "Identify potential defense arguments", 
          "Review timeline for inconsistencies"
        ]
      });
    }
  } catch (error: any) {
    console.error('Self-prompt generation failed:', error);
    return json({ error: 'Failed to generate suggestions' }, { status: 500 });
  }
};