#!/usr/bin/env node
/**
 * Phase 89: XState v5 Pattern Ingestion
 *
 * Ingest XState v5 migration patterns into Qdrant knowledge base
 * for RAG/KAG-enhanced error fixing.
 *
 * Usage:
 *   node scripts/phase89-ingest-xstate-patterns.mjs
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { createHash } from 'crypto';
import ollama from 'ollama';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = 'phase89_kb_cards';
const EMBEDDING_MODEL = 'embeddinggemma:latest';

const qdrant = new QdrantClient({ url: QDRANT_URL });

// XState v5 migration patterns
const patterns = [
  {
    id: 'xstate-v5-frompromise-inline-types',
    title: 'XState v5: fromPromise inline types breaking change',
    category: 'xstate-migration',
    severity: 'high',
    errorCodes: ['TS2345', 'TS2322', 'TS2554'],
    content: `
**Pattern:** fromPromise with inline types (XState v4 → v5)

**Broken (v4):**
\`\`\`typescript
const logic = fromPromise(async ({ input }: { input: { userId: string } }) => {
  return await getUser(input.userId);
});
\`\`\`

**Fixed (v5):**
\`\`\`typescript
const logic = fromPromise<User, { userId: string }>(
  async ({ input }) => {
    return await getUser(input.userId);
  }
);
\`\`\`

**Detection Regex:** \`/fromPromise\\s*\\(\\s*async\\s*\\(\\s*\\{.*:\\s*\\{/\`

**Fix Steps:**
1. Extract inline type annotation
2. Create separate interface or use generic parameters
3. Apply to fromPromise<TOutput, TInput>
4. Remove inline type from async function signature
`,
    tags: ['xstate', 'typescript', 'breaking-change', 'fromPromise', 'actor-logic'],
    references: [
      'https://stately.ai/docs/migration',
      'https://stately.ai/docs/promise-actors'
    ]
  },
  {
    id: 'xstate-v5-actor-types-setup',
    title: 'XState v5: Actor type definitions in setup()',
    category: 'xstate-migration',
    severity: 'medium',
    errorCodes: ['TS2339', 'TS7053'],
    content: `
**Pattern:** Missing actor type definitions

**Broken (v4):**
\`\`\`typescript
const machine = createMachine({
  invoke: {
    src: 'fetchUser', // Type error: unknown
    input: { userId: '123' }
  }
});
\`\`\`

**Fixed (v5):**
\`\`\`typescript
const machine = setup({
  types: {
    actors: {} as {
      fetchUser: 'userFetcher';
      loadData: 'dataLoader';
    }
  },
  actors: {
    userFetcher: fromPromise<User, { userId: string }>(...),
    dataLoader: fromPromise<Data, { id: string }>(...)
  }
}).createMachine({
  invoke: {
    src: 'fetchUser', // Now strongly typed
    input: { userId: '123' } // Type-checked
  }
});
\`\`\`

**Error Messages:**
- "Property 'X' does not exist on type 'unknown'"
- "Element implicitly has an 'any' type"

**Fix Steps:**
1. Add setup() wrapper to machine
2. Define types.actors with string literal union
3. Register actors in actors: {} object
4. Invoke by string key (now type-safe)
`,
    tags: ['xstate', 'typescript', 'setup', 'actor-types', 'machine-config'],
    references: [
      'https://stately.ai/docs/actors',
      'https://stately.ai/docs/setup'
    ]
  },
  {
    id: 'xstate-v5-spawn-to-spawnchild',
    title: 'XState v5: spawn() → spawnChild() migration',
    category: 'xstate-migration',
    severity: 'medium',
    errorCodes: ['TS2304'],
    content: `
**Pattern:** Legacy spawn() function removed

**Broken (v4):**
\`\`\`typescript
actions: {
  spawnActor: (context) => {
    const ref = spawn(promiseLogic);
    return { actorRef: ref };
  }
}
\`\`\`

**Fixed (v5 - Option 1):**
\`\`\`typescript
import { spawnChild } from 'xstate';

actions: {
  spawnActor: spawnChild('promiseLogic')
}
\`\`\`

**Fixed (v5 - Option 2):**
\`\`\`typescript
actions: {
  spawnActor: assign({
    actorRef: ({ spawn }) => spawn(promiseLogic)
  })
}
\`\`\`

**Error Message:** "Cannot find name 'spawn'"

**Fix Steps:**
1. Replace standalone spawn() calls with spawnChild() action
2. OR use spawn() from assign context
3. Register spawned actors in setup({ actors: { ... } })
`,
    tags: ['xstate', 'typescript', 'spawn', 'actions', 'assign'],
    references: [
      'https://stately.ai/docs/migration#spawn',
      'https://stately.ai/docs/actions#spawnchild'
    ]
  },
  {
    id: 'xstate-v5-invoke-data-to-input',
    title: 'XState v5: invoke.data → invoke.input',
    category: 'xstate-migration',
    severity: 'low',
    errorCodes: ['TS2322', 'TS2353'],
    content: `
**Pattern:** invoke.data renamed to invoke.input

**Broken (v4):**
\`\`\`typescript
states: {
  fetching: {
    invoke: {
      src: 'fetchUser',
      data: { userId: '123' }
    }
  }
}
\`\`\`

**Fixed (v5):**
\`\`\`typescript
states: {
  fetching: {
    invoke: {
      src: 'fetchUser',
      input: { userId: '123' }
    }
  }
}
\`\`\`

**Error Messages:**
- "Object literal may only specify known properties, and 'data' does not exist"
- "Did you mean 'input'?"

**Fix Steps:**
1. Find all invoke: { data: ... } in state configs
2. Replace with invoke: { input: ... }
3. Validate with tsc --noEmit
`,
    tags: ['xstate', 'typescript', 'invoke', 'input', 'state-config'],
    references: [
      'https://stately.ai/docs/migration#invoke-data'
    ]
  },
  {
    id: 'xstate-v5-send-to-raise',
    title: 'XState v5: send() → raise() / sendTo()',
    category: 'xstate-migration',
    severity: 'medium',
    errorCodes: ['TS2304', 'TS2345'],
    content: `
**Pattern:** send() API split into raise() and sendTo()

**Broken (v4):**
\`\`\`typescript
actions: {
  notifySelf: send({ type: 'UPDATE' }),
  notifyParent: send({ type: 'DONE' }, { to: () => '#parent' })
}
\`\`\`

**Fixed (v5):**
\`\`\`typescript
import { raise, sendTo } from 'xstate';

actions: {
  notifySelf: raise({ type: 'UPDATE' }),
  notifyParent: sendTo('#parent', { type: 'DONE' })
}
\`\`\`

**Error Messages:**
- "Cannot find name 'send'"
- "Expected 1-2 arguments, but got 3"

**Fix Steps:**
1. Replace send() with no target → raise()
2. Replace send(event, { to: target }) → sendTo(target, event)
3. Import { raise, sendTo } from 'xstate'
`,
    tags: ['xstate', 'typescript', 'actions', 'send', 'raise', 'sendTo'],
    references: [
      'https://stately.ai/docs/migration#send',
      'https://stately.ai/docs/actions'
    ]
  }
];

/**
 * Generate stable UUID from pattern ID
 */
function generateUUID(id) {
  const hash = createHash('md5').update(id).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Ingest patterns into Qdrant
 */
async function ingestPatterns() {
  console.log('🔄 Phase 89: XState v5 Pattern Ingestion');
  console.log('═'.repeat(60));
  console.log('');

  // Check Qdrant connection
  try {
    await qdrant.getCollections();
    console.log('✅ Qdrant connected:', QDRANT_URL);
  } catch (error) {
    console.error('❌ Qdrant connection failed:', error.message);
    process.exit(1);
  }

  // Check if collection exists
  let collectionExists = false;
  try {
    await qdrant.getCollection(COLLECTION_NAME);
    collectionExists = true;
    console.log(`✅ Collection exists: ${COLLECTION_NAME}`);
  } catch (error) {
    console.log(`⚠️  Collection not found: ${COLLECTION_NAME}`);
    console.log('   Creating collection...');

    await qdrant.createCollection(COLLECTION_NAME, {
      vectors: {
        size: 768, // embeddinggemma:latest dimension
        distance: 'Cosine'
      }
    });

    console.log(`✅ Collection created: ${COLLECTION_NAME}`);
  }

  console.log('');
  console.log(`📦 Ingesting ${patterns.length} XState v5 patterns...`);
  console.log('');

  for (const pattern of patterns) {
    const uuid = generateUUID(pattern.id);

    console.log(`🔍 Processing: ${pattern.title}`);
    console.log(`   ID: ${pattern.id}`);
    console.log(`   UUID: ${uuid}`);
    console.log(`   Category: ${pattern.category}`);
    console.log(`   Severity: ${pattern.severity}`);

    // Generate embedding
    const embeddingPrompt = `${pattern.title}\n\n${pattern.content}`;

    try {
      const { embedding } = await ollama.embeddings({
        model: EMBEDDING_MODEL,
        prompt: embeddingPrompt
      });

      console.log(`   Embedding: ${embedding.length} dimensions`);

      // Upsert to Qdrant
      await qdrant.upsert(COLLECTION_NAME, {
        points: [
          {
            id: uuid,
            vector: embedding,
            payload: {
              id: pattern.id,
              title: pattern.title,
              category: pattern.category,
              severity: pattern.severity,
              errorCodes: pattern.errorCodes,
              content: pattern.content,
              tags: pattern.tags,
              references: pattern.references,
              source: 'xstate-v5-migration',
              indexed_at: new Date().toISOString()
            }
          }
        ]
      });

      console.log('   ✅ Ingested successfully');
      console.log('');
    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}`);
      console.log('');
    }
  }

  // Verify ingestion
  const collectionInfo = await qdrant.getCollection(COLLECTION_NAME);
  console.log('');
  console.log('═'.repeat(60));
  console.log('📊 Ingestion Summary');
  console.log('═'.repeat(60));
  console.log(`Collection: ${COLLECTION_NAME}`);
  console.log(`Total points: ${collectionInfo.points_count}`);
  console.log(`Indexed: ${collectionInfo.indexed_vectors_count}`);
  console.log(`Status: ${collectionInfo.status}`);
  console.log('');
  console.log('✅ XState v5 patterns ready for RAG/KAG queries');
  console.log('');
  console.log('🔍 Example query:');
  console.log('   "XState v5 fromPromise type errors"');
  console.log('   "How to fix spawn() in XState v5"');
  console.log('   "invoke.data → invoke.input migration"');
}

// Run ingestion
ingestPatterns().catch(error => {
  console.error('❌ Ingestion failed:', error);
  process.exit(1);
});
