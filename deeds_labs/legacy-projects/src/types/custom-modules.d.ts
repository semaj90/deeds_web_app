// Minimal ambient module declarations to quiet TypeScript until real packages are installed.
declare module 'langchain/*';
declare module 'langchain/text_splitter';
declare module 'langchain/embeddings/openai';
declare module 'langchain/embeddings/ollama';
declare module '@qdrant/js-client-rest';
declare module '@aws-sdk/client-s3';

// Generic fallback
declare module '*';
