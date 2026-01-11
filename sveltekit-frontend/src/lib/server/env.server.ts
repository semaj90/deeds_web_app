
import { env as privateEnv } from '$env /dynamic/private';
import { env as publicEnv } from '$env /dynamic/public';

export const ENV = {
 POSTGRES_URL: privateEnv.POSTGRES_URL!,
 REDIS_URL: privateEnv.REDIS_URL!,
 QDRANT_URL: privateEnv.QDRANT_URL!,
 RABBITMQ_URL: privateEnv.RABBITMQ_URL!,
 OLLAMA_BASE_URL: privateEnv.OLLAMA_BASE_URL ?? 'http://host.docker.internal:11434',

 PUBLIC_API_URL: publicEnv.PUBLIC_API_URL ?? 'http://localhost:5173',
};

