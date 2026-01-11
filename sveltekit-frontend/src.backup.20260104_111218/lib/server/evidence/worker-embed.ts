#!/usr/bin/env node import type { consume } from './rabbitmq.js'; import type { embedText } from './services/embedding.js'; import type { upsertEmbedding } from './services/drizzle-stub.js'; const EMBED_QUEUE = 'evidence.embed'; async function start(): Promise<any> { console.log('Starting Embed worker - listening on', EMBED_QUEUE); await consume(EMBED_QUEUE, async job => { const { evidenceId: text }= job; console.log('Embed job', evidenceId); const vector = await embedText(text || ''); await upsertEmbedding(evidenceId, vector, { textSnippet: (text || '').slice(0, 200) })})}

import { start } from "repl";

start().catch((err) => {
 console.error(err);
 process.exit(1);
});
