#!/usr/bin/env node
/**
 * Phase 2D Diagnostic: Debug retrieval errors
 *
 * Tests:
 * 1. QdrantManager.hybridSearch() - does it return valid results?
 * 2. Raw client.search() - does it return valid results?
 * 3. Embedding API - can we get real embeddings?
 * 4. Collection health - do points exist?
 *
 * Run from sveltekit-frontend directory:
 *   npx tsx scripts/phase2d-diagnostic.mts
 */

import { getQdrantClient } from '../src/lib/server/vector/qdrant-singleton.js';
import { QdrantManager } from '../src/lib/server/vector/qdrant-manager.js';

interface DiagnosticResult {
  test: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  message: string;
  details?: any;
  duration_ms?: number;
}

const results: DiagnosticResult[] = [];

async function test(
  name: string,
  fn: () => Promise<DiagnosticResult>
): Promise<void> {
  try {
    console.log(`\n🔍 Testing: ${name}...`);
    const result = await fn();
    results.push(result);

    if (result.status === 'PASS') {
      console.log(`  ✅ ${result.message}`);
      if (result.details) {
        console.log(`     Details: ${JSON.stringify(result.details)}`);
      }
    } else if (result.status === 'FAIL') {
      console.log(`  ❌ ${result.message}`);
      if (result.details) {
        console.log(`     Details: ${JSON.stringify(result.details)}`);
      }
    } else {
      console.log(`  ⚠️  ${result.message}`);
      if (result.details) {
        console.log(`     Error: ${result.details}`);
      }
    }

    if (result.duration_ms) {
      console.log(`     Latency: ${result.duration_ms}ms`);
    }
  } catch (err) {
    console.error(`  💥 Test crashed:`, err);
    results.push({
      test: name,
      status: 'ERROR',
      message: 'Test execution failed',
      details: err instanceof Error ? err.message : String(err)
    });
  }
}

// ===== Tests =====

await test('1. Collection Health Check', async () => {
  const start = Date.now();
  const response = await fetch('http://127.0.0.1:6333/collections/codebase_chunks_768');
  const data = (await response.json()) as any;
  const duration = Date.now() - start;

  if (!response.ok) {
    return {
      test: 'Collection Health',
      status: 'FAIL',
      message: 'Collection not found',
      details: data,
      duration_ms: duration
    };
  }

  const { points_count, indexed_vectors_count } = data.result;
  if (points_count === 0) {
    return {
      test: 'Collection Health',
      status: 'FAIL',
      message: 'Collection is empty',
      details: data.result,
      duration_ms: duration
    };
  }

  return {
    test: 'Collection Health',
    status: 'PASS',
    message: `Collection has ${points_count} points, ${indexed_vectors_count} indexed vectors`,
    details: { points_count, indexed_vectors_count },
    duration_ms: duration
  };
});

await test('2. Singleton Client Connection', async () => {
  const start = Date.now();
  const client = getQdrantClient();
  const duration = Date.now() - start;

  if (!client) {
    return {
      test: 'Singleton Connection',
      status: 'FAIL',
      message: 'Failed to get singleton client',
      duration_ms: duration
    };
  }

  return {
    test: 'Singleton Connection',
    status: 'PASS',
    message: 'Singleton client initialized',
    duration_ms: duration
  };
});

await test('3. QdrantManager Instantiation', async () => {
  const start = Date.now();
  const manager = new QdrantManager();
  const duration = Date.now() - start;

  if (!manager || !manager.client) {
    return {
      test: 'Manager Instantiation',
      status: 'FAIL',
      message: 'Failed to create manager',
      duration_ms: duration
    };
  }

  return {
    test: 'Manager Instantiation',
    status: 'PASS',
    message: 'QdrantManager created successfully',
    details: {
      hasClient: !!manager.client,
      hasCollections: !!manager.collections
    },
    duration_ms: duration
  };
});

await test('4. hybridSearch with Synthetic Embedding', async () => {
  const start = Date.now();
  const manager = new QdrantManager();

  try {
    const result = await manager.hybridSearch({
      collection: 'codebase_chunks_768',
      query: 'authentication',
      queryEmbedding: Array(768).fill(0.5),  // Synthetic: all 0.5, match Qdrant content vector (768-dim)
      limit: 10
    });
    const duration = Date.now() - start;

    if (!result) {
      return {
        test: 'hybridSearch Synthetic',
        status: 'FAIL',
        message: 'hybridSearch returned null/undefined',
        duration_ms: duration
      };
    }

    if (!result.results || !Array.isArray(result.results)) {
      return {
        test: 'hybridSearch Synthetic',
        status: 'FAIL',
        message: 'Result missing "results" array',
        details: {
          resultKeys: Object.keys(result),
          resultsType: typeof result.results
        },
        duration_ms: duration
      };
    }

    return {
      test: 'hybridSearch Synthetic',
      status: result.results.length > 0 ? 'PASS' : 'FAIL',
      message: `hybridSearch returned ${result.results.length} results`,
      details: {
        count: result.results.length,
        firstResult: result.results[0],
        metadata: result.metadata
      },
      duration_ms: duration
    };
  } catch (error) {
    const duration = Date.now() - start;
    const errorDetails = error instanceof Error ? {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    } : String(error);

    return {
      test: 'hybridSearch Synthetic',
      status: 'ERROR',
      message: 'hybridSearch threw error',
      details: errorDetails,
      duration_ms: duration
    };
  }
});

await test('5. Raw Client Search with Synthetic Embedding', async () => {
  const start = Date.now();
  const client = getQdrantClient();

  try {
    const result = await client.search('codebase_chunks_768', {
      vector: {
        name: 'content',  // Named vector in Qdrant
        vector: Array(768).fill(0.5),  // 768-dim to match collection
      },
      limit: 10,
      with_payload: true
    });
    const duration = Date.now() - start;

    if (!result) {
      return {
        test: 'Raw Search Synthetic',
        status: 'FAIL',
        message: 'client.search returned null/undefined',
        duration_ms: duration
      };
    }

    if (!Array.isArray(result)) {
      return {
        test: 'Raw Search Synthetic',
        status: 'FAIL',
        message: 'Result is not an array',
        details: {
          resultType: typeof result,
          resultKeys: typeof result === 'object' ? Object.keys(result) : null
        },
        duration_ms: duration
      };
    }

    return {
      test: 'Raw Search Synthetic',
      status: result.length > 0 ? 'PASS' : 'FAIL',
      message: `client.search returned ${result.length} results`,
      details: {
        count: result.length,
        firstResult: result[0]
      },
      duration_ms: duration
    };
  } catch (error) {
    const duration = Date.now() - start;
    return {
      test: 'Raw Search Synthetic',
      status: 'ERROR',
      message: 'client.search threw error',
      details: error instanceof Error ? error.message : String(error),
      duration_ms: duration
    };
  }
});

// ===== Summary =====

console.log('\n' + '='.repeat(60));
console.log('📊 DIAGNOSTIC SUMMARY');
console.log('='.repeat(60));

const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
const errors = results.filter(r => r.status === 'ERROR').length;

console.log(`\n Results: ${passed} passed, ${failed} failed, ${errors} errors out of ${results.length} tests`);

if (failed > 0) {
  console.log('\n❌ Failed tests:');
  results
    .filter(r => r.status === 'FAIL')
    .forEach(r => console.log(`   - ${r.test}: ${r.message}`));
}

if (errors > 0) {
  console.log('\n⚠️  Tests with errors:');
  results
    .filter(r => r.status === 'ERROR')
    .forEach(r => console.log(`   - ${r.test}: ${r.message}`));
}

if (passed === results.length) {
  console.log('\n✅ All tests passed! Phase 2D workload should succeed.');
  console.log('   Run: npm run phase2e:load-test');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed. See details above.');
  process.exit(1);
}
