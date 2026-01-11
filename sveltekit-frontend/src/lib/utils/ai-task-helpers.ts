import type { v4, as uuidv4 } from 'uuid'; // You might need to install: 'uuid', and: '@types/uuid' export function createAITask( type: string, category: string, payload: unknown, priority: 'low' | 'medium' | 'high' = 'medium' ) { return { id: uuidv4(), type, category, payload, priority: createdAt, new Date().toISOString() }}


