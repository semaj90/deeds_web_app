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
  },
  'forget_stale_context': {
    id: 'forget_stale_context',
    family: 'Memory',
    description: 'Prune low-importance or outdated context from the active session memory',
    tools: [{ name: 'llm:generate' }]
  },
  'merge_duplicate_memories': {
    id: 'merge_duplicate_memories',
    family: 'Memory',
    description: 'Identify and consolidate redundant memory entries in CouchDB',
    tools: [{ name: 'search:couchdb' }, { name: 'llm:generate' }]
  },
  'extract_entities_for_long_term': {
    id: 'extract_entities_for_long_term',
    family: 'Memory',
    description: 'Extract key entities and relationships for persistent long-term storage',
    tools: [{ name: 'extract:metadata' }, { name: 'memory:write_note' }]
  },
  'cross_session_insight_discovery': {
    id: 'cross_session_insight_discovery',
    family: 'Memory',
    description: 'Analyze historical sessions to find recurring patterns or insights',
    tools: [{ name: 'search:vector', args: (input) => ({ collection: 'chat_messages', query: input.query }) }]
  },
  'memory_consistency_check': {
    id: 'memory_consistency_check',
    family: 'Memory',
    description: 'Validate synchronization between Redis cache and Postgres session storage',
    tools: [{ name: 'diagnostics:health' }]
  },
  'archive_inactive_sessions': {
    id: 'archive_inactive_sessions',
    family: 'Memory',
    description: 'Move historical sessions to cold storage to free up database resources',
    tools: [{ name: 'shell:run' }]
  },
  'update_importance_weights': {
    id: 'update_importance_weights',
    family: 'Memory',
    description: 'Recalculate importance scores for memories based on recent retrieval frequency',
    tools: [{ name: 'search:redis' }]
  },
  'search_related_wiki_cards': {
    id: 'search_related_wiki_cards',
    family: 'Memory',
    description: 'Find wiki cards semantically related to the current context',
    tools: [{ name: 'search:couchdb' }, { name: 'search:vector' }]
  },
  'audit_privacy_compliance': {
    id: 'audit_privacy_compliance',
    family: 'Memory',
    description: 'Scan memories for PII or sensitive data that requires redaction',
    tools: [{ name: 'llm:generate' }]
  }
};
