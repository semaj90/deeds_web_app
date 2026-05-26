import { existsSync } from 'fs';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { resolve } from 'path';
import { config as loadEnv } from 'dotenv';

for (const envFile of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const envPath = resolve(process.cwd(), envFile);
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
}

type HealthMode = 'embedding' | 'retrieval' | 'all';

interface BaseHealthResult {
  available: boolean;
  enabled: boolean;
  url: string;
  status?: string;
  error?: string;
}

interface EmbeddingHealthResult extends BaseHealthResult {
  device?: string;
}

interface RetrievalHealthResult extends BaseHealthResult {
  pgvectorConnected?: boolean;
  qdrantConnected?: boolean;
  service?: string;
}

const EMBEDDING_GRPC_URL = process.env.EMBEDDING_GRPC_URL ?? '127.0.0.1:50051';
const EMBEDDING_GRPC_ENABLED = (process.env.EMBEDDING_GRPC_ENABLED ?? 'false') === 'true';
const GO_SEARCH_GRPC_URL = process.env.GO_SEARCH_GRPC_URL ?? '127.0.0.1:50055';
const RETRIEVAL_GRPC_URL = process.env.RETRIEVAL_GRPC_URL ?? GO_SEARCH_GRPC_URL;
const RETRIEVAL_GRPC_ENABLED = (process.env.RETRIEVAL_GRPC_ENABLED ?? 'false') === 'true';

function loadServiceClient(protoPath: string, packagePath: string[], serviceName: string, url: string): any {
  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: false,
    longs: Number,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [
      resolve(process.cwd(), '../proto'),
      resolve(process.cwd(), '../proto/active')
    ],
  });

  const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as Record<string, any>;
  const serviceContainer = packagePath.reduce<any>((acc, key) => acc?.[key], protoDescriptor);

  if (!serviceContainer?.[serviceName]) {
    throw new Error(`Service ${packagePath.join('.')}.${serviceName} not found in ${protoPath}`);
  }

  return new serviceContainer[serviceName](url, grpc.credentials.createInsecure(), {
    'grpc.keepalive_time_ms': 10_000,
    'grpc.keepalive_timeout_ms': 5_000,
    'grpc.keepalive_permit_without_calls': 1,
  });
}

function getMethodCandidates(client: any, candidates: string[]): Array<{ name: string; fn: Function }> {
  return candidates
    .filter((name) => typeof client[name] === 'function')
    .map((name) => ({ name, fn: client[name].bind(client) }));
}

function requestBodiesFor(methodName: string, serviceName: string): Record<string, unknown>[] {
  if (/healthcheck/i.test(methodName)) {
    return [{ checkGpu: true, checkRedis: true }, { check_gpu: true, check_redis: true }, {}];
  }

  return [{ service: serviceName }, {}];
}

async function callFirstWorkingHealthMethod(
  client: any,
  candidateNames: string[],
  serviceName: string
): Promise<any> {
  const methods = getMethodCandidates(client, candidateNames);

  if (methods.length === 0) {
    throw new Error(`No health RPC found. Checked: ${candidateNames.join(', ')}`);
  }

  let lastError: Error | null = null;

  for (const method of methods) {
    for (const requestBody of requestBodiesFor(method.name, serviceName)) {
      try {
        const response = await new Promise<any>((resolvePromise, rejectPromise) => {
          const deadline = new Date(Date.now() + 3000);
          method.fn(requestBody, { deadline }, (err: Error | null, responseValue: any) => {
            if (err) {
              rejectPromise(err);
              return;
            }
            resolvePromise(responseValue);
          });
        });

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  throw lastError ?? new Error('Health RPC failed');
}

async function checkEmbeddingHealth(): Promise<EmbeddingHealthResult> {
  const protoPath = resolve(process.cwd(), '../proto/active/embedding.proto');
  const base: EmbeddingHealthResult = {
    enabled: EMBEDDING_GRPC_ENABLED,
    url: EMBEDDING_GRPC_URL,
    available: false,
  };

  try {
    const client = loadServiceClient(protoPath, ['embedding'], 'EmbeddingService', EMBEDDING_GRPC_URL);
    const response = await callFirstWorkingHealthMethod(client, ['health', 'healthCheck', 'Health', 'HealthCheck'], 'embedding');
    const status = typeof response?.status === 'string' ? response.status : response?.healthy ? 'healthy' : 'unknown';
    const device = typeof response?.device === 'string'
      ? response.device
      : response?.gpuAvailable === true || response?.gpu_available === true
        ? 'cuda'
        : 'cpu';

    return {
      ...base,
      available: response?.healthy === true || status === 'healthy',
      status,
      device,
    };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkRetrievalHealth(): Promise<RetrievalHealthResult> {
  if (RETRIEVAL_GRPC_ENABLED) {
    const protoPath = resolve(process.cwd(), '../proto/active/retrieval.proto');
    const base: RetrievalHealthResult = {
      enabled: true,
      url: RETRIEVAL_GRPC_URL,
      available: false,
      service: 'retrieval-service',
    };

    try {
      const client = loadServiceClient(protoPath, ['yorha', 'retrieval'], 'RetrievalService', RETRIEVAL_GRPC_URL);
      const response = await callFirstWorkingHealthMethod(client, ['health', 'Health', 'healthCheck', 'HealthCheck'], 'retrieval');
      const status = typeof response?.status === 'string' ? response.status : response?.healthy ? 'healthy' : 'unknown';

      return {
        ...base,
        available: response?.healthy === true || status === 'healthy',
        status,
        pgvectorConnected: response?.pgvectorConnected ?? response?.pgvector_connected,
        qdrantConnected: response?.qdrantConnected ?? response?.qdrant_connected,
      };
    } catch (error) {
      return {
        ...base,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const protoPath = resolve(process.cwd(), '../proto/active/library_search.proto');
  const base: RetrievalHealthResult = {
    enabled: false,
    url: GO_SEARCH_GRPC_URL,
    available: false,
    service: 'go-search-library',
  };

  try {
    const client = loadServiceClient(protoPath, ['library', 'search'], 'LibrarySearchService', GO_SEARCH_GRPC_URL);
    const response = await callFirstWorkingHealthMethod(client, ['health', 'Health'], 'library');
    const status = typeof response?.status === 'string' ? response.status : response?.healthy ? 'healthy' : 'unknown';

    return {
      ...base,
      available: status === 'healthy',
      status,
      pgvectorConnected: response?.pgvectorConnected ?? response?.pgvector_connected,
      qdrantConnected: response?.qdrantConnected ?? response?.qdrant_connected,
    };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const mode = (process.argv[2] ?? 'all') as HealthMode;

  if (!['embedding', 'retrieval', 'all'].includes(mode)) {
    console.error('Usage: npx tsx scripts/health/grpc-health.ts [embedding|retrieval|all]');
    process.exit(1);
  }

  if (mode === 'embedding') {
    console.log(JSON.stringify(await checkEmbeddingHealth(), null, 2));
    return;
  }

  if (mode === 'retrieval') {
    console.log(JSON.stringify(await checkRetrievalHealth(), null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        embedding: await checkEmbeddingHealth(),
        retrieval: await checkRetrievalHealth(),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});