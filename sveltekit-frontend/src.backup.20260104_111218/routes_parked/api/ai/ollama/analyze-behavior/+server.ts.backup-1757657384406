// Behavior Analysis API Endpoint
// Analyzes user patterns and generates insights for legal workflows

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validateAuthSession } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const session = await validateAuthSession(request);
    if (!session) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userAnalytics, context, legalContext } = await request.json();

    // Enhanced legal behavior analysis prompt
    const behaviorPrompt = `
You are an expert legal workflow analyst. Analyze the following user behavior data and legal context to provide insights and recommendations.

User Analytics:
- Behavior Pattern: ${userAnalytics.behaviorPattern}
- Typing Speed: ${userAnalytics.interactionMetrics.typingSpeed} WPM
- Success Rate: ${userAnalytics.uploadHistory.successRate * 100}%
- Expertise Level: ${userAnalytics.caseContext.expertise}
- Workflow Stage: ${userAnalytics.caseContext.workflowStage}
- Active Cases: ${userAnalytics.caseContext.activeCases.length}

Legal Context:
- Practice Area: ${legalContext?.practiceArea || 'General'}
- Case Type: ${legalContext?.caseType || 'Unknown'}
- Urgency: ${legalContext?.urgency || 'Medium'}

Current Session:
- Files Selected: ${context.files.length}
- Total File Size: ${context.files.reduce((sum: number, f: any) => sum + f.size, 0)} bytes

Provide analysis in JSON format:
{
  "behaviorPattern": "novice|intermediate|expert|power_user",
  "engagementLevel": "low|medium|high",
  "efficiencyScore": 0.0-1.0,
  "workflowOptimization": "poor|fair|good|excellent",
  "legalSpecificInsights": {
    "documentPreparation": "string",
    "caseManagement": "string",
    "timeManagement": "string"
  },
  "recommendations": ["string"],
  "urgencyAwareness": 0.0-1.0,
  "nextBestActions": ["string"]
}`;

    const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gemma2:9b',
        prompt: behaviorPrompt,
        format: 'json',
        stream: false,
        options: {
          temperature: 0.4,
          top_p: 0.8
        }
      })
    });

    if (!ollamaResponse.ok) {
      throw new Error(`Ollama API error: ${ollamaResponse.statusText}`);
    }

    const result = await ollamaResponse.json();
    let analysis;

    try {
      analysis = JSON.parse(result.response);
    } catch (error) {
      // Fallback analysis
      analysis = {
        behaviorPattern: userAnalytics.behaviorPattern,
        engagementLevel: 'medium',
        efficiencyScore: userAnalytics.uploadHistory.successRate,
        workflowOptimization: 'good',
        legalSpecificInsights: {
          documentPreparation: 'Standard preparation observed',
          caseManagement: 'Active case management detected',
          timeManagement: 'Efficient workflow patterns'
        },
        recommendations: ['Continue current workflow'],
        urgencyAwareness: legalContext?.urgency === 'critical' ? 1.0 : 0.7,
        nextBestActions: ['Process selected documents']
      };
    }

    // Update user analytics based on AI insights
    const updatedAnalytics = {
      ...userAnalytics,
      behaviorPattern: analysis.behaviorPattern,
      contextualPreferences: {
        ...userAnalytics.contextualPreferences,
        preferredAIPromptStyle: analysis.behaviorPattern === 'expert' ? 'concise' : 'detailed',
        helpLevel: analysis.behaviorPattern === 'novice' ? 'extensive' : 'moderate'
      }
    };

    return json({
      analytics: updatedAnalytics,
      insights: analysis,
      score: analysis.efficiencyScore
    });

  } catch (error) {
    console.error('Behavior analysis error:', error);
    return json({ error: 'Analysis failed' }, { status: 500 });
  }
};
