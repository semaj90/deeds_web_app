import {
  classifyEmbeddingError,
  resolveEmbeddingBackend,
  validateResolvedBackend,
} from '../../sveltekit-frontend/src/lib/server/embedding/embedding-backend-resolution.js';
import { ENV } from '../../sveltekit-frontend/src/lib/server/env.server.ts';

async function main() {
  const resolution = resolveEmbeddingBackend('embeddinggemma:latest', {
    configuredProvider: ENV.EMBEDDING_PROVIDER,
    configuredBaseUrl: ENV.EMBEDDING_BASE_URL,
    fallbackBaseUrl: ENV.OLLAMA_BASE_URL,
  });
  const backendValidation = await validateResolvedBackend(
    resolution.provider,
    resolution.baseUrl,
  );
  const boundaryKind = classifyEmbeddingError('input: 162 tokens physical batch size: 128');

  const report = {
    status: backendValidation.valid ? 'PASS' : 'WARN',
    resolution,
    backendValidation,
    boundaryKind,
    note: 'Backend resolution is evaluated statically; runtime fingerprints are reported separately in the boundary probes.',
  };

  console.log(JSON.stringify(report, null, 2));

  if (report.status !== 'PASS') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
