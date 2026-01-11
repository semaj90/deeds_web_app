// Contextual Prompts Generation API
// Generates intelligent prompts based on legal context and user behavior

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateAuthSession } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const session = await validateAuthSession(request);
    if (!session) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { context, timing, model = 'gemma2:9b', legalContext } = await request.json();

    // Generate contextual prompts based on timing and legal context
    const promptGenerationPrompt = `
You are an expert legal AI assistant. Generate contextual prompts and recommendations for a legal professional during document upload and analysis.

Context:
- Timing: ${timing}
- Files: ${context.files?.length || 0} documents
- Case ID: ${context.caseId || 'No active case'}
- Legal Context: ${JSON.stringify(legalContext || {})}
- User Expertise: ${context.userAnalytics?.caseContext?.expertise || 'associate'}
- Practice Area: ${legalContext?.practiceArea || 'General'}
- Urgency: ${legalContext?.urgency || 'medium'}

File Names: ${context.files?.map((f: any) => f.name).join(', ') || 'None'}

Generate 2-4 relevant prompts based on the timing phase:

For "before-upload": Focus on preparation, organization, and potential issues
For "during-upload": Focus on monitoring, insights, and real-time guidance
For "after-upload": Focus on next steps, analysis results, and recommendations

Each prompt should be actionable and specific to legal workflows.

Respond in JSON format:
{
  "prompts": [
    {
      "id": "unique-id",
      "content": "Specific, actionable prompt text",
      "category": "optimization|guidance|insight|warning|recommendation",
      "confidence": 0.0-1.0,
      "relevance": 0.0-1.0,
      "actionable": boolean,
      "legalSpecific": boolean
    }
  ]
}`;

    const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        prompt: promptGenerationPrompt,
        format: 'json',
        stream: false,
        options: {
          temperature: 0.6,
          top_p: 0.9
        }
      })
    });

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama API error: ${ollamaResponse.statusText}`);
    }

    const result = await ollamaResponse.json();
    let promptsData;

    try {
      promptsData = JSON.parse(result.response);
    } catch (error) {
      // Fallback prompts based on timing and context
      promptsData = generateFallbackPrompts(timing, context, legalContext);
    }

    // Add timing property to each prompt
    const prompts = promptsData.prompts.map((prompt: any) => ({
      ...prompt,
      timing: timing,
      id: prompt.id || `${timing}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }));

    return json({ prompts });

  } catch (error) {
    console.error('Prompt generation error:', error);

    // Return fallback prompts
    const fallbackPrompts = generateFallbackPrompts(
      request.body?.timing || 'before-upload',
      request.body?.context || {},
      request.body?.legalContext || {}
    );

    return json(fallbackPrompts);
  }
};

function generateFallbackPrompts(timing: string, context: any, legalContext: any) {
  const prompts = [];
  const timestamp = Date.now();

  if (timing === 'before-upload') {
    if (legalContext?.urgency === 'critical') {
      prompts.push({
        id: `critical-${timestamp}`,
        content: '🔥 Critical case detected. Ensure all documents are properly authenticated and chain of custody is documented before proceeding.',
        category: 'warning',
        confidence: 0.95,
        relevance: 0.9,
        actionable: true,
        legalSpecific: true
      });
    }

    if (context.files?.length > 10) {
      prompts.push({
        id: `bulk-${timestamp}`,
        content: '📋 Large document set detected. Consider organizing files by privilege status and relevance before upload to streamline review.',
        category: 'optimization',
        confidence: 0.8,
        relevance: 0.7,
        actionable: true,
        legalSpecific: true
      });
    }

    if (legalContext?.practiceArea === 'litigation') {
      prompts.push({
        id: `litigation-${timestamp}`,
        content: '⚖️ Litigation documents detected. Remember to check for attorney-client privilege and work product protection.',
        category: 'guidance',
        confidence: 0.85,
        relevance: 0.8,
        actionable: true,
        legalSpecific: true
      });
    }
  }

  if (timing === 'during-upload') {
    prompts.push({
      id: `monitoring-${timestamp}`,
      content: '🔍 AI analysis in progress. The system is examining documents for key entities, legal citations, and privilege status.',
      category: 'insight',
      confidence: 0.9,
      relevance: 0.7,
      actionable: false,
      legalSpecific: true
    });

    if (context.files?.length > 5) {
      prompts.push({
        id: `batch-processing-${timestamp}`,
        content: '⚡ Processing multiple documents. Results will include relevance scoring and evidence categorization.',
        category: 'insight',
        confidence: 0.8,
        relevance: 0.6,
        actionable: false,
        legalSpecific: true
      });
    }
  }

  if (timing === 'after-upload') {
    prompts.push({
      id: `next-steps-${timestamp}`,
      content: '🎯 Upload complete! Review AI analysis results and consider organizing documents by relevance and privilege status.',
      category: 'recommendation',
      confidence: 0.9,
      relevance: 0.8,
      actionable: true,
      legalSpecific: true
    });

    if (legalContext?.caseId) {
      prompts.push({
        id: `case-integration-${timestamp}`,
        content: '📁 Documents ready for case integration. Consider updating case timeline and evidence inventory.',
        category: 'recommendation',
        confidence: 0.85,
        relevance: 0.9,
        actionable: true,
        legalSpecific: true
      });
    }

    prompts.push({
      id: `quality-check-${timestamp}`,
      content: '✅ Run a quality check on AI analysis results. Verify entity extractions and legal citations for accuracy.',
      category: 'guidance',
      confidence: 0.8,
      relevance: 0.7,
      actionable: true,
      legalSpecific: true
    });
  }

  return { prompts };
}
