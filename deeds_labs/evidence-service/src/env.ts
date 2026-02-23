import { config } from 'dotenv';

config();

export const env = {
  database: {
    url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/deeds',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  },
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    accessKey: process.env.MINIO_ACCESS_KEY || 'minio',
    secretKey: process.env.MINIO_SECRET_KEY || 'minio123',
    useSSL: process.env.MINIO_USE_SSL === 'true',
    bucket: process.env.MINIO_BUCKET || 'evidence',
  },
  qdrant: {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    collection: process.env.QDRANT_COLLECTION || 'legal_evidence',
  },
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text',
    chatModel: process.env.OLLAMA_CHAT_MODEL || 'gemma3',
  },
  service: {
    port: parseInt(process.env.PORT || '4000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
  upload: {
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '104857600', 10),
    tempDir: process.env.UPLOAD_TEMP_DIR || '/tmp/evidence-uploads',
  },
};
