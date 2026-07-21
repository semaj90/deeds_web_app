#!/usr/bin/env node

/**
 * embedding-boundary-probe.mjs
 *
 * Independent probe of embedding service boundaries.
 * Tests two separate endpoints:
 *   1. Ollama at http://127.0.0.1:11434 (provider='ollama')
 *   2. llama-server at http://127.0.0.1:8081 (provider='llama-server')
 *
 * Generates separate reports for each endpoint.
 * Does NOT fall back between providers.
 * Does NOT infer provider from URL.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test payload: the 162-token case that previously failed
// This is a legal document excerpt
const TEST_PAYLOAD = `In the case of Smith v. Jones, the court found that the defendant failed to comply with
the discovery requirements as established under Federal Rules of Civil Procedure 26(a). The plaintiff
argued that the defendant's failure to produce relevant documents within the prescribed timeframe constituted
a material breach of the discovery obligations. The court agreed, noting that discovery is a fundamental
component of civil litigation and serves to ensure that both parties have access to relevant evidence.
The defendant's obstruction of this process, intentional or otherwise, undermines the integrity of the
judicial system and the fair resolution of disputes. Accordingly, the court imposed sanctions and ordered
the production of all withheld documents within five business days.`;

console.log(`[PROBE] Text length: ${TEST_PAYLOAD.length} chars`);
console.log(`[PROBE] Approximate word count: ${TEST_PAYLOAD.split(/\s+/).length} words`);
console.log();

/**
 * Fingerprint a backend endpoint
 */
async function fingerprintEndpoint(baseUrl, name) {
  const result = {
    name,
    baseUrl,
    timestamp: new Date().toISOString(),
    tests: {},
    fingerprint: {
      isOllama: false,
      isLlamaServer: false,
      supportsEmbeddings: false,
      modelList: [],
      versionInfo: null,
    },
  };

  // Test /api/version (Ollama)
  console.log(`[${name}] Testing /api/version...`);
  try {
    const versionRes = await fetch(`${baseUrl}/api/version`, {
      signal: AbortSignal.timeout(2000),
    });
    result.tests.apiVersion = {
      status: versionRes.status,
      ok: versionRes.ok,
    };
    if (versionRes.ok) {
      const versionData = await versionRes.json();
      result.fingerprint.isOllama = true;
      result.fingerprint.versionInfo = versionData.version || null;
      console.log(`  ✓ /api/version OK: ${result.fingerprint.versionInfo}`);
    } else {
      console.log(`  ✗ /api/version: HTTP ${versionRes.status}`);
    }
  } catch (err) {
    result.tests.apiVersion = { error: err.message };
    console.log(`  ✗ /api/version: ${err.message}`);
  }

  // Test /health (llama-server)
  console.log(`[${name}] Testing /health...`);
  try {
    const healthRes = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    result.tests.health = {
      status: healthRes.status,
      ok: healthRes.ok,
    };
    if (healthRes.ok) {
      const healthData = await healthRes.json();
      result.fingerprint.isLlamaServer = 'status' in healthData;
      console.log(`  ✓ /health OK`);
    } else {
      console.log(`  ✗ /health: HTTP ${healthRes.status}`);
    }
  } catch (err) {
    result.tests.health = { error: err.message };
    console.log(`  ✗ /health: ${err.message}`);
  }

  // Test /v1/models
  console.log(`[${name}] Testing /v1/models...`);
  try {
    const modelsRes = await fetch(`${baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(2000),
    });
    result.tests.v1Models = {
      status: modelsRes.status,
      ok: modelsRes.ok,
    };
    if (modelsRes.ok) {
      const modelsData = await modelsRes.json();
      if (Array.isArray(modelsData.data)) {
        result.fingerprint.modelList = modelsData.data.map((m) => m.id);
        result.fingerprint.supportsEmbeddings = true;
        console.log(`  ✓ /v1/models OK: ${result.fingerprint.modelList.length} models`);
      }
    } else {
      console.log(`  ✗ /v1/models: HTTP ${modelsRes.status}`);
    }
  } catch (err) {
    result.tests.v1Models = { error: err.message };
    console.log(`  ✗ /v1/models: ${err.message}`);
  }

  // Fallback: test /api/embeddings endpoint
  console.log(`[${name}] Testing /api/embeddings endpoint (POST)...`);
  try {
    const embedRes = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: 'test' }),
      signal: AbortSignal.timeout(3000),
    });
    result.tests.apiEmbeddings = {
      status: embedRes.status,
      ok: embedRes.ok,
    };

    const text = await embedRes.text();
    if (embedRes.ok) {
      try {
        const data = JSON.parse(text);
        const embedding = data.embedding || (data.embeddings && data.embeddings[0]);
        if (Array.isArray(embedding)) {
          result.tests.apiEmbeddings.embeddingDim = embedding.length;
          console.log(`  ✓ /api/embeddings OK: ${embedding.length}-dim embedding`);
        }
      } catch {
        console.log(`  ✗ /api/embeddings: Response not JSON`);
      }
    } else {
      console.log(`  ✗ /api/embeddings: HTTP ${embedRes.status}`);
      if (text.length < 200) {
        console.log(`    Response: ${text}`);
      }
    }
  } catch (err) {
    result.tests.apiEmbeddings = { error: err.message };
    console.log(`  ✗ /api/embeddings: ${err.message}`);
  }

  console.log();
  return result;
}

/**
 * Test embedding a payload
 */
async function testEmbedding(baseUrl, name, payload, model = 'embeddinggemma:latest') {
  const result = {
    model,
    textLength: payload.length,
    wordCount: payload.split(/\s+/).length,
    endpoints: {},
  };

  // Test /api/embeddings
  console.log(`[${name}] Embedding payload via /api/embeddings...`);
  try {
    const startMs = Date.now();
    const embedRes = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: payload }),
      signal: AbortSignal.timeout(30000),
    });
    const duration = Date.now() - startMs;

    result.endpoints.apiEmbeddings = {
      status: embedRes.status,
      ok: embedRes.ok,
      durationMs: duration,
    };

    if (embedRes.ok) {
      const data = await embedRes.json();
      const embedding = data.embedding || (data.embeddings && data.embeddings[0]);
      if (Array.isArray(embedding)) {
        result.endpoints.apiEmbeddings.embeddingDim = embedding.length;
        result.endpoints.apiEmbeddings.success = true;
        console.log(
          `  ✓ Success: ${embedding.length}-dim, ${duration}ms`,
        );
      }
    } else {
      const text = await embedRes.text();
      result.endpoints.apiEmbeddings.error = text.slice(0, 200);
      console.log(`  ✗ HTTP ${embedRes.status}: ${text.slice(0, 100)}`);
    }
  } catch (err) {
    result.endpoints.apiEmbeddings = {
      error: err.message,
    };
    console.log(`  ✗ Error: ${err.message}`);
  }

  // Test /v1/embeddings (OpenAI-compatible)
  console.log(`[${name}] Embedding payload via /v1/embeddings...`);
  try {
    const startMs = Date.now();
    const embedRes = await fetch(`${baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: payload }),
      signal: AbortSignal.timeout(30000),
    });
    const duration = Date.now() - startMs;

    result.endpoints.v1Embeddings = {
      status: embedRes.status,
      ok: embedRes.ok,
      durationMs: duration,
    };

    if (embedRes.ok) {
      const data = await embedRes.json();
      const embedding = data.data && data.data[0] && data.data[0].embedding;
      if (Array.isArray(embedding)) {
        result.endpoints.v1Embeddings.embeddingDim = embedding.length;
        result.endpoints.v1Embeddings.success = true;
        console.log(
          `  ✓ Success: ${embedding.length}-dim, ${duration}ms`,
        );
      }
    } else {
      const text = await embedRes.text();
      result.endpoints.v1Embeddings.error = text.slice(0, 200);
      console.log(`  ✗ HTTP ${embedRes.status}: ${text.slice(0, 100)}`);
    }
  } catch (err) {
    result.endpoints.v1Embeddings = {
      error: err.message,
    };
    console.log(`  ✗ Error: ${err.message}`);
  }

  // Test /embedding (llama-server native)
  console.log(`[${name}] Embedding payload via /embedding (llama-server native)...`);
  try {
    const startMs = Date.now();
    const embedRes = await fetch(`${baseUrl}/embedding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: payload, embd_normalize: 2 }),
      signal: AbortSignal.timeout(30000),
    });
    const duration = Date.now() - startMs;

    result.endpoints.embedding = {
      status: embedRes.status,
      ok: embedRes.ok,
      durationMs: duration,
    };

    if (embedRes.ok) {
      const data = await embedRes.json();
      const embedding = data.embedding;
      if (Array.isArray(embedding)) {
        result.endpoints.embedding.embeddingDim = embedding.length;
        result.endpoints.embedding.success = true;
        console.log(
          `  ✓ Success: ${embedding.length}-dim, ${duration}ms`,
        );
      }
    } else {
      const text = await embedRes.text();
      result.endpoints.embedding.error = text.slice(0, 200);
      console.log(`  ✗ HTTP ${embedRes.status}: ${text.slice(0, 100)}`);
    }
  } catch (err) {
    result.endpoints.embedding = {
      error: err.message,
    };
    console.log(`  ✗ Error: ${err.message}`);
  }

  console.log();
  return result;
}

/**
 * Main probe
 */
async function main() {
  const endpoints = [
    { url: 'http://127.0.0.1:11434', name: 'OLLAMA', provider: 'ollama' },
    { url: 'http://127.0.0.1:8081', name: 'LLAMA_SERVER', provider: 'llama-server' },
  ];

  const allResults = {
    timestamp: new Date().toISOString(),
    testPayload: {
      text: TEST_PAYLOAD,
      textLength: TEST_PAYLOAD.length,
      wordCount: TEST_PAYLOAD.split(/\s+/).length,
    },
    endpoints: {},
  };

  // Probe each endpoint independently
  for (const ep of endpoints) {
    console.log(`${'='.repeat(80)}`);
    console.log(`FINGERPRINTING: ${ep.name} (${ep.url})`);
    console.log(`Provider: ${ep.provider}`);
    console.log(`${'='.repeat(80)}`);
    console.log();

    const fingerprint = await fingerprintEndpoint(ep.url, ep.name);
    allResults.endpoints[ep.name] = { fingerprint };

    // Test embedding
    console.log(`${'='.repeat(80)}`);
    console.log(`EMBEDDING TEST: ${ep.name}`);
    console.log(`Payload: 162-token legal document excerpt`);
    console.log(`${'='.repeat(80)}`);
    console.log();

    const embedding = await testEmbedding(ep.url, ep.name, TEST_PAYLOAD);
    allResults.endpoints[ep.name].embedding = embedding;

    console.log(`${'='.repeat(80)}`);
    console.log();
  }

  // Write reports
  const reportDir = path.join(__dirname, '../../docs/reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const fullReportPath = path.join(reportDir, 'embedding-boundary-probe.json');
  fs.writeFileSync(fullReportPath, JSON.stringify(allResults, null, 2));
  console.log(`[REPORT] Full results: ${fullReportPath}`);

  // Write separate reports per endpoint
  for (const [epName, epData] of Object.entries(allResults.endpoints)) {
    const reportPath = path.join(reportDir, `embedding-boundary-probe.${epName.toLowerCase()}.json`);
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          timestamp: allResults.timestamp,
          endpoint: epName,
          testPayload: allResults.testPayload,
          data: epData,
        },
        null,
        2,
      ),
    );
    console.log(`[REPORT] ${epName} results: ${reportPath}`);
  }

  // Summary
  console.log();
  console.log(`${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(80)}`);
  console.log();

  for (const [epName, epData] of Object.entries(allResults.endpoints)) {
    const fp = epData.fingerprint;
    const embed = epData.embedding;

    console.log(`${epName}:`);
    console.log(
      `  Fingerprint: Ollama=${fp.isOllama}, LlamaServer=${fp.isLlamaServer}, SupportsEmbeddings=${fp.supportsEmbeddings}`,
    );

    if (embed && embed.endpoints) {
      const successCount = Object.values(embed.endpoints).filter((e) => e.success).length;
      console.log(`  Embedding: ${successCount}/3 endpoints successful`);

      for (const [epKey, epVal] of Object.entries(embed.endpoints)) {
        if (epVal.success) {
          console.log(
            `    ✓ ${epKey}: ${epVal.embeddingDim}-dim, ${epVal.durationMs}ms`,
          );
        } else {
          console.log(`    ✗ ${epKey}: ${epVal.error || 'Failed'}`);
        }
      }
    }
    console.log();
  }
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
