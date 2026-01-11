import { json, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getSystemPromptForIntent, buildUserPromptForIntent } from '$lib/ai/intents';
import type { IntentContext } from '$lib/ai/intents';

const OLLAMA_URL = env.OLLAMA_URL || 'http://localhost:11434';
const LLM_MODEL = env.OLLAMA_LLM_MODEL || 'gemma3-legal:latest';

/**
 * Scenario E: Research Workspace + Memo Builder
 * Save statutes + notes + POI statements → LLM builds memo skeleton
 * Passive: user clicks "Generate memo skeleton"
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const ctx: IntentContext = await request.json();

    console.log('[Memo Builder] Generating memo skeleton for workspace:', ctx.workspaceId);

    // TODO: Fetch workspace bundle from database
    const additionalContext = {
      facts: 'Defendant was arrested for kidnapping across state lines on June 3, 2024.',
      statutes: [
        { citation: '18 U.S.C. § 1201', title: 'Kidnapping' },
        { citation: '18 U.S.C. § 1202', title: 'Interstate Commerce' },
      ],
      notes: [
        'Victim was transported from California to Nevada',
        'Ransom demand was made via email',
        'Defendant has prior conviction for similar offense',
      ],
    };

    // Build prompts
    const systemPrompt = getSystemPromptForIntent('MEMO_BUILDER');
    const userPrompt = buildUserPromptForIntent('MEMO_BUILDER', ctx, additionalContext);

    console.log('[Memo Builder] Calling Ollama...');

    // Call Ollama
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const data = await response.json();

    // Parse response as memo outline
    const outline = data.response || '';

    return json({
      outline,
      workspaceId: ctx.workspaceId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Memo Builder] Error:', error);
    return json(
      { error: 'Failed to generate memo skeleton', details: String(error) },
      { status: 500 }
    );
  }
};
