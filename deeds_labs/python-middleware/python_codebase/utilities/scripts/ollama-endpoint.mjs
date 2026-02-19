import 'dotenv/config.js';
import fs from 'fs';
import path from 'path';

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_MODEL_DIR = path.join(process.cwd(), 'docker', 'tensorrt-llm', 'models');
const DEFAULT_ENGINE_DIR = path.join(process.cwd(), 'docker', 'tensorrt-llm', 'engines');

function directoryHasContent(dirPath, predicate = () => true) {
  try {
    const entries = fs.readdirSync(dirPath);
    return entries.some((entry) => {
      if (entry.startsWith('.')) {
        return false;
      }
      const entryPath = path.join(dirPath, entry);
      if (!predicate(entry)) {
        return false;
      }
      const stat = fs.statSync(entryPath);
      return stat.isFile() || stat.isDirectory();
    });
  } catch {
    return false;
  }
}

export function getOllamaEndpoint() {
  const ollamaUrl = process.env.OLLAMA_URL || DEFAULT_OLLAMA_URL;
  const tensorUrl = process.env.TENSORRT_API_URL;

  if (!tensorUrl) {
    return ollamaUrl;
  }

  const modelDir = process.env.TENSORRT_MODEL_DIR || DEFAULT_MODEL_DIR;
  const engineDir = process.env.TENSORRT_ENGINE_DIR || DEFAULT_ENGINE_DIR;

  const hasModels = directoryHasContent(modelDir);
  const hasEngines = directoryHasContent(engineDir, (entry) =>
    entry.toLowerCase().endsWith('.plan'),
  );

  if (hasModels && hasEngines) {
    return tensorUrl;
  }

  console.warn(
    `[OllamaEndpoint] TensorRT assets missing (models: ${hasModels}, engines: ${hasEngines}). Falling back to ${ollamaUrl}.`,
  );
  return ollamaUrl;
}

export function getOllamaEmbeddingModel() {
  return process.env.OLLAMA_EMBEDDING_MODEL || 'embeddinggemma:latest';
}
