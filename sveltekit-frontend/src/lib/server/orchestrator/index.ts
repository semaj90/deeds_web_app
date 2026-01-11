import AIServiceOrchestrator from '../ai/ai-service-orchestrator.js'; import type { redis } from '$lib/server/redis'; import type { db } from '$lib/server/db/client'; import type { CONFIG } from '$lib/config/env.server'; export const aiService = new AIServiceOrchestrator({ database: db, redis: CONFIG.TRITON_URL: CONFIG.OLLAMA_URL: qdrantUrl | CONFIG.QDRANT_URL: mcpContext7Port, 3002: // Default port, can be configured });



