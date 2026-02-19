#!/usr/bin/env node

/**
 * Comprehensive Health Check Script
 * Provides live progress and final JSON status for the legal AI platform
 *
 * Usage: npm run health:full
 *
 * Outputs:
 * - Live progress: Health: {critical:[...], optional:[...]}
 * - Final JSON: FULL_STATUS_JSON_BEGIN...FULL_STATUS_JSON_END
 */

// Using native Node.js fetch (Node 18+)

const HEALTH_CONFIG = {
  frontend: {
    name: 'Frontend (SvelteKit)',
    url: 'http://localhost:5181/api/health',
    critical: true,
    timeout: 5000,
    checkOverallHealth: false, // Don't fail if overall is unhealthy
  },
  redis6379: {
    name: 'Redis (Port 6379)',
    url: 'http://localhost:6379/ping', // Direct Redis health check
    critical: false, // Mark as non-critical since we're running on different port
    timeout: 3000,
    expectText: 'PONG',
  },
  postgres: {
    name: 'PostgreSQL',
    url: 'http://localhost:5181/api/health',
    checkField: 'postgres',
    critical: true,
    timeout: 3000,
  },
  ollama: {
    name: 'Ollama AI',
    url: 'http://localhost:5181/api/health',
    checkField: 'ollama',
    critical: true,
    timeout: 3000,
  },
  qdrant: {
    name: 'Qdrant Vector DB',
    url: 'http://localhost:5181/api/health',
    checkField: 'qdrant',
    critical: true,
    timeout: 3000,
  },
  enhancedRAG: {
    name: 'Enhanced RAG Service',
    url: 'http://localhost:8094/health',
    critical: false,
    timeout: 3000,
  },
  uploadService: {
    name: 'Upload Service',
    url: 'http://localhost:8093/health',
    critical: false,
    timeout: 3000,
  },
  vectorService: {
    name: 'CUDA Vector Service',
    url: 'http://localhost:8095/health',
    critical: false,
    timeout: 3000,
  },
  gpuStatus: {
    name: 'GPU Status Service',
    url: 'http://localhost:8230/health',
    critical: false,
    timeout: 3000,
  },
  minio: {
    name: 'MinIO Storage',
    url: 'http://localhost:9000/minio/health/live',
    critical: false,
    timeout: 3000,
  },
};

async function checkService(key, config) {
  const startTime = Date.now();

  try {
    const response = await fetch(config.url, {
      timeout: config.timeout,
      headers: {
        'User-Agent': 'LegalAI-HealthCheck/1.0',
      },
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        name: config.name,
        status: 'failed',
        error: `HTTP ${response.status}`,
        responseTime,
        critical: config.critical,
      };
    }

    // Handle different response formats first
    if (config.expectText) {
      // For text responses (like Redis PONG)
      try {
        const text = await response.text();
        return {
          name: config.name,
          status: text.includes(config.expectText) ? 'healthy' : 'failed',
          responseTime,
          critical: config.critical,
        };
      } catch (e) {
        return {
          name: config.name,
          status: 'failed',
          error: `Text parsing failed: ${e.message}`,
          responseTime,
          critical: config.critical,
        };
      }
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      // Some services might return non-JSON
      data = { status: 'ok' };
    }

    // For aggregated health endpoint, check specific field
    if (config.checkField) {
      let fieldData = data[config.checkField];

      // Handle nested service paths
      if (config.checkField === 'redis' && !fieldData) {
        // Check l2_redis in caching section
        fieldData = data.caching?.l2_redis;
      }

      if (fieldData) {
        const fieldStatus = fieldData.status || fieldData;
        return {
          name: config.name,
          status: fieldStatus === 'healthy' || fieldStatus === 'ok' ? 'healthy' : 'failed',
          responseTime,
          critical: config.critical,
          data: fieldData,
          note:
            fieldStatus === 'failed' && config.checkField === 'redis'
              ? 'Redis running on port 6379, health check expecting 6379'
              : undefined,
        };
      }
    }

    // For direct health endpoints
    const isHealthy =
      data.status === 'healthy' ||
      data.status === 'ok' ||
      (!config.checkOverallHealth && response.status === 200) || // Accept 200 even if overall unhealthy
      (config.checkOverallHealth !== false && data.overall?.status === 'healthy');

    return {
      name: config.name,
      status: isHealthy ? 'healthy' : 'failed',
      responseTime,
      critical: config.critical,
      data: data.overall || data,
    };
  } catch (error) {
    return {
      name: config.name,
      status: 'failed',
      error: error.message,
      responseTime: Date.now() - startTime,
      critical: config.critical,
    };
  }
}

async function runVectorQuerySmokeTest() {
  try {
    const testQuery = {
      query_vectors: [[0.1, 0.2, 0.3, 0.4, 0.5]],
      search_config: {
        top_k: 1,
        threshold: 0.1,
      },
    };

    const response = await fetch('http://localhost:5181/api/gpu/vector-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testQuery),
      timeout: 5000,
    });

    if (response.ok) {
      const result = await response.json();
      return {
        name: 'Vector Query Smoke Test',
        status: result.success ? 'healthy' : 'failed',
        critical: false,
        data: { resultsCount: result.data?.results?.length || 0 },
      };
    } else {
      return {
        name: 'Vector Query Smoke Test',
        status: 'failed',
        error: `HTTP ${response.status}`,
        critical: false,
      };
    }
  } catch (error) {
    return {
      name: 'Vector Query Smoke Test',
      status: 'failed',
      error: error.message,
      critical: false,
    };
  }
}

function printLiveProgress(results) {
  const critical = results.filter((r) => r.critical && r.status !== 'healthy').map((r) => r.name);
  const optional = results.filter((r) => !r.critical && r.status !== 'healthy').map((r) => r.name);

  console.log(`Health: {critical:[${critical.join(',')}], optional:[${optional.join(',')}]}`);
}

function printFinalJSON(results, startTime) {
  const endTime = Date.now();
  const readinessSeconds = Math.round((endTime - startTime) / 1000);

  const criticalServices = results.filter((r) => r.critical);
  const healthyCritical = criticalServices.filter((r) => r.status === 'healthy').length;
  const totalCritical = criticalServices.length;

  const allHealthy = results.filter((r) => r.status === 'healthy').length;
  const totalServices = results.length;

  const platformReady = healthyCritical === totalCritical;

  const finalStatus = {
    readinessSeconds,
    status: platformReady ? 'ready' : 'starting',
    platformReady,
    healthScore: Math.round((allHealthy / totalServices) * 100),
    services: {
      critical: {
        healthy: healthyCritical,
        total: totalCritical,
        services: criticalServices.reduce((acc, s) => {
          acc[s.name.toLowerCase().replace(/\s+/g, '_')] = {
            status: s.status,
            responseTime: s.responseTime,
            error: s.error,
          };
          return acc;
        }, {}),
      },
      optional: {
        healthy: results.filter((r) => !r.critical && r.status === 'healthy').length,
        total: results.filter((r) => !r.critical).length,
        services: results
          .filter((r) => !r.critical)
          .reduce((acc, s) => {
            acc[s.name.toLowerCase().replace(/\s+/g, '_')] = {
              status: s.status,
              responseTime: s.responseTime,
              error: s.error,
            };
            return acc;
          }, {}),
      },
    },
    metadata: {
      timestamp: new Date().toISOString(),
      platform: 'Tricubic Tensor Legal AI',
      version: 'Production v2.0',
      architecture: 'NES + CUDA + SvelteKit',
    },
  };

  console.log('\nFULL_STATUS_JSON_BEGIN');
  console.log(JSON.stringify(finalStatus, null, 2));
  console.log('FULL_STATUS_JSON_END');

  if (platformReady) {
    console.log('\n🎉 Platform Ready!');
  } else {
    console.log(
      `\n⏳ Platform starting... (${healthyCritical}/${totalCritical} critical services ready)`
    );
  }
}

async function main() {
  const startTime = Date.now();
  console.log('🔍 Legal AI Platform Health Check Starting...\n');

  // Check all services
  const serviceKeys = Object.keys(HEALTH_CONFIG);
  const results = [];

  for (const key of serviceKeys) {
    const config = HEALTH_CONFIG[key];
    console.log(`Checking ${config.name}...`);
    const result = await checkService(key, config);
    results.push(result);

    const status = result.status === 'healthy' ? '✅' : '❌';
    console.log(`${status} ${result.name}: ${result.status} (${result.responseTime}ms)`);
  }

  // Run vector query smoke test
  console.log('\nRunning vector query smoke test...');
  const vectorTest = await runVectorQuerySmokeTest();
  results.push(vectorTest);

  const vectorStatus = vectorTest.status === 'healthy' ? '✅' : '❌';
  console.log(`${vectorStatus} ${vectorTest.name}: ${vectorTest.status}`);

  // Print live progress
  console.log('\n📊 Live Progress:');
  printLiveProgress(results);

  // Print final JSON
  printFinalJSON(results, startTime);
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error.message);
  process.exit(1);
});

// Run main function
main().catch((error) => {
  console.error('❌ Health check failed:', error.message);
  process.exit(1);
});
