import type { RequestHandler } from './$types';

/*
 * Elemental Awareness API - YOLO-style hover analysis
 * Provides legal context for any UI element when hovered
 */
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const payload = await request.json();
    const elementType = payload?.elementType ?? 'unknown';
    const content = payload?.content ?? '';
    const context = payload?.context ?? '';

    if (!content || content.length < 3) {
      return json({ error: 'No content to analyze', relevance: 'No content to analyze' }, { status: 400 });
    }

    // Quick legal relevance analysis
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3-legal:latest',
        prompt: `Analyze this UI element for legal relevance:

Element: ${elementType}
Content: "${content}"
Context: ${context}

Provide a brief 1-sentence legal relevance assessment and classification.
Format as JSON: {"relevance": "...", "legalContext": "evidence|case|statute|procedure|other", "actionable": true}`,
        stream: false
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('Remote analyze service returned non-OK:', response.status, text);
      return json({ error: 'Remote analyze service failed' }, { status: 502 });
    }

    const result = await response.json().catch(() => null);

    // Normalize result into a JS object
    let analysis: any = null;
    if (!result) {
      analysis = {
        relevance: 'Content may have legal significance',
        legalContext: 'general',
        actionable: false
      };
    } else if (typeof result === 'string') {
      try {
        analysis = JSON.parse(result);
      } catch {
        analysis = { raw: result };
      }
    } else if (result.response) {
      // result.response might be a JSON string or already an object
      if (typeof result.response === 'string') {
        try {
          analysis = JSON.parse(result.response);
        } catch {
          analysis = { response: result.response };
        }
      } else {
        analysis = result.response;
      }
    } else {
      analysis = result;
    }

    return json(analysis);
  } catch (error: any) {
    console.error('Element analysis failed:', error);
    return json({ error: 'Analysis unavailable', relevance: 'Analysis unavailable' }, { status: 500 });
  }
};