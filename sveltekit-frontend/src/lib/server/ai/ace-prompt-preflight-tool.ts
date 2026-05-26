import { buildAcePromptPreflight, type AcePromptPreflightInput } from './ace-prompt-preflight.js';
import type { Gemma4Tool } from '$lib/server/ace/gemma4-codeintel.js';

const ACE_PROMPT_PREFLIGHT_PARAMETERS: Gemma4Tool['parameters'] = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Natural language task or question' },
    intent: {
      type: 'string',
      description: 'Optional intent hint',
      enum: ['find', 'fix', 'implement', 'prune', 'consolidate', 'explain'],
    },
    tokenBudget: { type: 'number', description: 'Max prompt budget for the compact packet' },
    backend: {
      type: 'string',
      description: 'Generation backend selection',
      enum: ['bifrost', 'turboquant', 'ollama'],
    },
  },
  required: ['query'],
};

export const acePromptPreflightTool: Gemma4Tool = {
  name: 'ace.prompt_preflight',
  description:
    'Builds a compact ACE/NES prompt packet using Redis, Qdrant, Postgres, HyperGraphRAG, TurboVec, and token-budget pruning before model generation.',
  parameters: ACE_PROMPT_PREFLIGHT_PARAMETERS,
  execute: async (args) => {
    const query = String(args.query ?? '');
    return buildAcePromptPreflight({
      query,
      intent: (args.intent as AcePromptPreflightInput['intent']) ?? 'find',
      tokenBudget: Number(args.tokenBudget ?? 3500),
      backend: (args.backend as AcePromptPreflightInput['backend']) ?? 'turboquant',
      modelName: 'gemma4-legal.gguf',
    });
  },
};

export const acePromptPreflightLlamaTool = {
  type: 'function' as const,
  function: {
    name: 'ace__prompt_preflight',
    description:
      'Build a compact ACE/NES prompt packet before OpenAI-compatible Gemma4 generation.',
    parameters: ACE_PROMPT_PREFLIGHT_PARAMETERS,
  },
};
