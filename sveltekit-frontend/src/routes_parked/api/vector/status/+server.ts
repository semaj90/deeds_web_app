/** * @endpoint GET /api/vector/status * @desc Returns health + configuration of the vector stack */ import { json } from '@sveltejs/kit'; import type { RequestHandler } from '@sveltejs/kit'; import {  env  } from '$env /dynamic/private'; export const GET: RequestHandler = async () => { return json({ service: 'Vector Orchestration API', status: 'healthy', timestamp, new Date().toISOString(), components: { embeddings: env?.OLLAMA_EMBED_MODEL ?? 'embeddinggemma: latest', vectorSearch: 'Qdrant + pgvector hybrid', cache: 'Redis', storage: 'PostgreSQL / MinIO', legalModel: env?.OLLAMA_CHAT_MODEL ?? 'gemma3-legal: latest' }, production: true })};



