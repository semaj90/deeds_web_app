/**
 * Hermes Memory Skills
 * 
 * Recipes for interacting with long-term memory (CouchDB, Redis, Postgres).
 */

import type { SkillRecipe } from './registry.js';

export const MEMORY_SKILLS: Record<string, SkillRecipe> = {
  'couchdb_view_query': {
    id: 'couchdb_view_query',
    family: 'Memory',
    description: 'Query CouchDB MapReduce views for wiki cards or relationship logs',
    tools: [
      {
        name: 'search:couchdb',
        args: (input) => ({
          db: input.db || 'wiki_cards',
          design: input.design || 'by_tag',
          view: input.view || 'by_tag',
          limit: input.limit || 10
        })
      }
    ]
  },
  'redis_cache_lookup': {
    id: 'redis_cache_lookup',
    family: 'Memory',
    description: 'Lookup a specific key or hash from Redis cache',
    tools: [
      {
        name: 'search:redis',
        args: (input) => ({
          key: input.key,
          type: input.type || 'string'
        })
      }
    ]
  },
  'postgres_session_lookup': {
    id: 'postgres_session_lookup',
    family: 'Memory',
    description: 'Retrieve session data or user history from Postgres',
    tools: [
      {
        name: 'search:sql',
        args: (input) => ({
          query: `SELECT * FROM agent_sessions WHERE id = '${input.sessionId}' LIMIT 1`
        })
      }
    ]
  },
  'qdrant_memory_search': {
    id: 'qdrant_memory_search',
    family: 'Memory',
    description: 'Search conversational memory vectors in Qdrant',
    tools: [
      {
        name: 'search:vector',
        args: (input) => ({
          query: input.query,
          collection: 'chat_messages',
          limit: 5
        })
      }
    ]
  },
  'write_session_summary': {
    id: 'write_session_summary',
    family: 'Memory',
    description: 'Write a summary of the current session to long-term memory',
    tools: [
      {
        name: 'memory:write_note',
        args: (input) => ({
          note: {
            type: 'session_summary',
            content: input.summary,
            sessionId: input.sessionId,
            tags: ['session', 'summary']
          }
        })
      }
    ]
  }
};
