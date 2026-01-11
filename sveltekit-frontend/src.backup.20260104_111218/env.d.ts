interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_OLLAMA_URL?: string;
  readonly VITE_QDRANT_URL?: string;
  readonly VITE_REDIS_URL?: string;
  readonly VITE_DATABASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
