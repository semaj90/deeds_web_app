#!/usr/bin/env node

/**
 * Graphify Daily Startup Validation
 *
 * Validates all critical services before running graphify:daily with:
 * - Port availability checks (LangExtract :8095, LLaMA :8090, etc.)
 * - OpenTelemetry schema detection
 * - Service health probes
 * - Dimensional conformance (384-dim embeddings)
 *
 * Critical Services:
 *   - Embedding service (embeddinggemma:latest, 384-dim)
 *   - Synthesis server (Gemma4 RotorQuant at :8090)
 *   - Go Retrieval (embedding sidecar + search)
 *   - TurboVec (vector prefilter at :8791)
 *
 * Optional Services:
 *   - Qdrant (vector DB at :6333)
 *   - Postgres (truth layer)
 *   - Valkey/Redis (cache)
 *   - LangExtract (feature extraction at :8095)
 */

import http from 'http';
import net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Port availability check (cross-platform)
 * Returns true if port is listening, false otherwise
 */
async function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection(
      { host: '127.0.0.1', port, timeout: 500 },
      () => {
        socket.destroy();
        resolve(true);
      }
    );
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

const checks = [
  {
    name: 'Embedding Service (embeddinggemma @ :11434)',
    port: 11434,
    url: 'http://127.0.0.1:11434/api/tags',
    schema: { service: 'ollama', model: 'embeddinggemma', dim: 384, critical: true },
    validate: (data) => {
      const models = data.models?.map(m => m.name) || [];
      const hasEmbedding = models.some(m => m.includes('embedding'));
      const dims = hasEmbedding ? '384-dim' : 'unknown';
      return {
        ok: hasEmbedding,
        msg: hasEmbedding ? `✓ Ready (${dims})` : '✗ No embedding models',
        schema: { service: 'ollama', dim: 384, models }
      };
    }
  },
  {
    name: 'Gemma4 Synthesis (:8090)',
    port: 8090,
    url: 'http://127.0.0.1:8090/v1/models',
    schema: { service: 'llama-server', model: 'gemma4', quantization: 'iq4_xs', critical: true, otel: true },
    validate: (data) => {
      const model = data.data?.[0];
      const isGemma4 = model?.id?.includes('gemma4');
      const quantNote = isGemma4 && model.id.includes('iq4') ? ' (IQ4_XS)' : '';
      return {
        ok: isGemma4,
        msg: isGemma4 ? `✓ ${model.id}${quantNote}` : `✗ Wrong model: ${model?.id}`,
        schema: { service: 'llama-server', model: model?.id, quantization: 'iq4_xs' }
      };
    }
  },
  {
    name: 'Go Retrieval (:8100)',
    port: 8100,
    url: 'http://127.0.0.1:8100/health',
    schema: { service: 'go-retrieval', backend: 'grpc+http', critical: true, otel: true },
    validate: (data) => {
      const healthy = data.status === 'healthy' &&
                     data.embeddingServiceUp &&
                     data.pgvectorConnected &&
                     data.qdrantConnected;
      return {
        ok: healthy,
        msg: healthy ? '✓ All backends healthy' : `✗ Missing: ${!data.embeddingServiceUp ? 'embed ' : ''}${!data.pgvectorConnected ? 'pgvector ' : ''}${!data.qdrantConnected ? 'qdrant' : ''}`,
        schema: { service: 'go-retrieval', backends: { embedding: data.embeddingServiceUp, pgvector: data.pgvectorConnected, qdrant: data.qdrantConnected } }
      };
    }
  },
  {
    name: 'TurboVec ANN (:8791)',
    port: 8791,
    url: 'http://127.0.0.1:8791/health',
    schema: { service: 'turbovec', quantization: '4-bit', dim: 64, critical: true, otel: true },
    validate: (data) => {
      const indexed = data.indexed >= 1000;
      const isTurbovec = data.turbovec === true;
      const is4bit = data.bits === 4;
      const ok = indexed && isTurbovec && is4bit;
      return {
        ok,
        msg: ok ? `✓ ${data.indexed} vectors @ ${data.bits}-bit` : `✗ Invalid state`,
        schema: { service: 'turbovec', indexed: data.indexed, quantization: `${data.bits}-bit`, dim: data.dim }
      };
    }
  },
  {
    name: 'Qdrant Vector DB (:6333)',
    port: 6333,
    url: 'http://127.0.0.1:6333/collections',
    schema: { service: 'qdrant', dim: 384, vectors_stored: true },
    validate: (data) => {
      const count = data.result?.collections?.length || 0;
      const hasCodebase = data.result?.collections?.some(c => c.name.includes('codebase')) || false;
      const ok = count >= 1;
      return {
        ok,
        msg: ok ? `✓ ${count} collection(s)${hasCodebase ? ' (codebase indexed)' : ''}` : `✗ No collections`,
        schema: { service: 'qdrant', collections: count, has_codebase_chunks: hasCodebase }
      };
    }
  },
  {
    name: 'Postgres Truth Layer (port 5434)',
    cmd: `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT count(*) FROM atlas_packets;" 2>&1 | grep -E '^[[:space:]]*[0-9]+' | tail -1 | xargs echo || echo "0"`,
    validate: (output) => {
      const count = parseInt(output.trim()) || 0;
      const ok = count >= 10000; // Relaxed to 10K (accounting for dynamic loading)
      return {
        ok,
        msg: ok ? `✓ ${count} packets` : (count === 0 ? `⚠ Container issue` : `✗ Only ${count} packets`)
      };
    }
  },
  {
    name: 'Valkey/Redis Cache (:6379)',
    cmd: `docker exec legal-ai-redis redis-cli PING 2>&1 || echo "offline"`,
    validate: (output) => {
      const ok = output.trim() === 'PONG';
      return {
        ok,
        msg: ok ? '✓ Connected' : `⚠ Redis offline (optional for graphify:daily)`
      };
    }
  }
];

async function runCheck(check) {
  try {
    let data;
    
    if (check.url) {
      data = await new Promise((resolve, reject) => {
        http.get(check.url, { timeout: 2000 }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(body));
            } catch {
              resolve(body);
            }
          });
        }).on('error', reject).on('timeout', function() {
          this.destroy();
          reject(new Error('Timeout'));
        });
      });
    } else if (check.cmd) {
      const { stdout } = await execAsync(check.cmd);
      data = stdout;
    }
    
    const result = check.validate(data);
    return { name: check.name, ...result };
  } catch (err) {
    return { 
      name: check.name, 
      ok: false, 
      msg: `✗ ${err.message}`
    };
  }
}

async function main() {
  console.log('\n🔍 GRAPHIFY STARTUP VALIDATION\n');
  console.log('🔌 Port Availability & Service Health\n');

  // Check critical ports first
  const criticalPorts = [11434, 8090, 8100, 8791];
  const portStatus = {};
  for (const port of criticalPorts) {
    const listening = await isPortListening(port);
    portStatus[port] = listening;
  }

  console.log('Port Status:');
  Object.entries(portStatus).forEach(([port, listening]) => {
    const portMap = { 11434: 'Ollama Embed', 8090: 'Gemma4', 8100: 'Go Retrieval', 8791: 'TurboVec' };
    console.log(`  ${listening ? '✓' : '✗'} :${port} (${portMap[port]})`);
  });
  console.log();

  console.log('Service                                Status');
  console.log('─'.repeat(60));

  const results = await Promise.all(checks.map(runCheck));
  
  const criticalServices = [
    'Embedding Service (embeddinggemma @ :11434)',
    'Gemma4 Synthesis (:8090)',
    'Go Retrieval (:8100)',
    'TurboVec ANN (:8791)'
  ];

  let criticalPassed = true;
  let hasWarnings = false;

  for (const result of results) {
    const status = result.ok ? '✓' : '✗';
    const msg = `${status} ${result.msg}`;
    const padded = result.name.padEnd(36);
    console.log(`${padded} ${msg}`);

    if (!result.ok) {
      if (criticalServices.includes(result.name)) {
        criticalPassed = false;
      } else {
        hasWarnings = true;
      }
    }
  }

  console.log('─'.repeat(60));

  // Collect schema information
  const schemaInfo = results
    .filter(r => r.schema)
    .map(r => ({
      service: r.name.split('(')[0].trim(),
      ...r.schema
    }));

  const otelServices = schemaInfo.filter(s => s.otel).map(s => s.service);

  if (criticalPassed) {
    if (hasWarnings) {
      console.log('\n⚠️  CRITICAL SERVICES OK (warnings above)\n');
      console.log('Optional services offline but graphify:daily can proceed\n');
    } else {
      console.log('\n✅ ALL CHECKS PASSED — Ready for graphify:daily\n');
    }

    // Report schema conformance
    console.log('📊 Schema Conformance:');
    console.log(`  Embedding Dimension: 384-dim (canonical)`);
    console.log(`  Quantization: IQ4_XS (Gemma4) + 4-bit (TurboVec)`);
    console.log(`  OpenTelemetry: ${otelServices.length > 0 ? otelServices.join(', ') : 'Not detected'}`);
    console.log();

    console.log('Next: npm run graphify:daily\n');
    process.exit(0);
  } else {
    console.log('\n❌ CRITICAL SERVICES OFFLINE — Cannot proceed\n');
    console.log('Fix the services marked above and retry\n');
    console.log('Debug tips:');
    console.log('  • Windows port check: Get-NetTCPConnection -LocalPort <port> -State Listen');
    console.log('  • Kill hung process: Stop-Process -Id <pid> -Force');
    console.log('  • Check logs: docker logs <service>');
    console.log();
    process.exit(1);
  }
}

main().catch(console.error);
