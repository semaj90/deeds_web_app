/**
 * GET /.well-known/agent.json
 *
 * Google Agent2Agent (A2A) protocol AgentCard discovery endpoint.
 * Spec: https://google.github.io/A2A/specification/
 *
 * Allows other agents/orchestrators to discover this agent's capabilities,
 * authentication requirements, and supported skill endpoints.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const base = `${url.protocol}//${url.host}`;

  return json({
    name: 'Deeds Legal AI Agent',
    description:
      'Gemma4 legal reasoning agent with RAG (Qdrant), case search (Postgres), ' +
      '4D hyperedge memory recall, and GPU-accelerated knowledge graph analysis.',
    url: `${base}/api/ai/agent`,
    version: '1.0.0',
    provider: {
      organization: 'Deeds Legal AI',
      url: base,
    },
    // A2A authentication — API key passed as Bearer token
    authentication: {
      schemes: ['Bearer'],
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['application/json', 'text/event-stream'],
    capabilities: {
      streaming: true,        // supports tasks/sendSubscribe SSE
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    skills: [
      {
        id: 'legal-rag',
        name: 'Legal RAG Search',
        description:
          'Retrieve relevant legal documents, statutes, and precedents from the ' +
          'vector knowledge base (Qdrant research_summaries + legal_documents).',
        tags: ['legal', 'rag', 'retrieval', 'qdrant'],
        examples: [
          'What is the hearsay rule under FRE 801?',
          'Find cases about wrongful termination in California',
        ],
        inputModes: ['text/plain'],
        outputModes: ['application/json'],
      },
      {
        id: 'case-analysis',
        name: 'Case Analysis',
        description:
          'Full-text search across case database, evidence analysis, and ' +
          'GPU-accelerated hyperedge knowledge graph reasoning.',
        tags: ['cases', 'evidence', 'analysis', 'graph'],
        examples: [
          'Summarize the key facts in case c9b79f5d',
          'What evidence is relevant to this contract dispute?',
        ],
        inputModes: ['text/plain', 'application/json'],
        outputModes: ['application/json'],
      },
      {
        id: 'hyperedge-memory',
        name: 'Hyperedge Memory Recall',
        description:
          'Query the 4D GPU knowledge graph (SOM + k-means + PageRank hyperedges) ' +
          'for Grade A/B knowledge clusters most relevant to the query.',
        tags: ['graph', 'memory', 'hyperedge', 'gpu', 'som'],
        examples: [
          'What knowledge clusters relate to contract law?',
          'Show top hyperedges for evidence authentication',
        ],
        inputModes: ['text/plain'],
        outputModes: ['application/json'],
      },
    ],
  } satisfies AgentCard, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};

// ── A2A AgentCard type (Google spec) ─────────────────────────────────────────

interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  provider: { organization: string; url: string };
  authentication: { schemes: string[] };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  skills: AgentSkill[];
}

interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
  inputModes: string[];
  outputModes: string[];
}
