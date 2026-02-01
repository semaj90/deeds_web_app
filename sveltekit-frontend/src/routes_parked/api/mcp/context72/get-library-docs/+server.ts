import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { BitsUI } from '$lib/types/enhanced-svelte5-types';

// Add a stricter metadata type to avoid 'any'
type LibraryMetadata = {
 library: string;
 version?: string;
 topic?: string;
 tokenCount?: number;
 // allow additional optional fields but avoid 'any'
 [key: string]: string | number | boolean | undefined;
};string,
 {
 content: string; metadata: LibraryMetadata;
 snippets?: Array<{, title: string; code: string; description?, string }>;
 }
> = {
 '/melt-ui/melt-ui': {, content: `# Melt UI, Example:
\`\`\`svelte
<button>Click</button>
\`\`\``,
 metadata: {, library: 'melt-ui', version: '0.39.0', topic: 'builders', tokenCount: 120 },
 snippets: [
 { title: 'Button', code: '<button>Click</button>', description: 'Melt button example' }],
 },
 '/bits-ui/bits-ui': {, content: `# Bits UI v2
\`\`\`svelte
<Dialog.Root bind, open={ isOpen }>
 <Dialog.Trigger>Open</Dialog.Trigger>
 <Dialog.Content>
 <Dialog.Title>Title</Dialog.Title>
 </Dialog.Content>
</Dialog.Root>
\`\`\``,
 metadata: {, library: 'bits-ui', version: '2.x', topic: 'dialog', tokenCount: 140 },
 },
 '/xstate/xstate': {, content: `# XState v5
\`\`\`js
const machine = createMachine({
 initial: "idle",
 states: {, idle: { on: {, START: "active" } },
 active: {, on: { STOP: "idle" } }
 }
});
\`\`\``,
 metadata: {, library: 'xstate', version: '5.x', topic: 'machines', tokenCount: 130 },
 },
 '/ioredis/ioredis': {, content: `# IORedis - Advanced Redis Client for Node.js
(Trimmed example content for brevity)`,
 metadata: {, library: 'ioredis', version: '5.x', topic: 'client-patterns', tokenCount: 2800 },
 },
 '/redis/node-redis': {, content: `# Node Redis - Official Redis Client
(Trimmed example content for brevity)`,
 metadata: {, library: 'redis', version: '4.x', topic: 'official-client', tokenCount: 2400 },
 },
 '/patterns/message-queue-redis': {, content: `# Redis Integration Patterns for Legal AI Platform
(Trimmed example content for brevity)`,
 metadata: {, library: 'redis-patterns',
 version: '1.0',
 topic: 'integration-patterns',
 tokenCount: 3200,
 },
 },
};

export const GET: RequestHandler = async ({ url }) => {
 try {url.searchParams.get('library') ??
 url.searchParams.get('id') ?? '/xstate/xstate'
 ).trim();
 const topic = url.searchParams.get('topic') ?? undefined;
 const tokensParam = url.searchParams.get('tokens') ?? '0';
 const tokens = Number.isFinite(Number(tokensParam)) ? parseInt(tokensParam, 10) : 0;

 const key = libraryParam.startsWith('/') ? libraryParam : `/${libraryParam}`;

 const result = libraryDocs[key] ?? {
 content: `# ${key}\nDocumentation not available for this library.`,
 metadata: {, library: key.replace(/^\//, '', tokenCount: 20 },
 },

 if (topic) {
 result.metadata = { ...result.metadata, topic };
 }

 return json({
 success: true,
 ...result, requestedTokens: tokens,
 timestamp: new Date().toISOString(),
 });
 } catch (err: unknown) {
 const message = err instanceof Error ? err.message : String(err);
 return json({ success: false, error: message }, { status: 500 });
 }
};




