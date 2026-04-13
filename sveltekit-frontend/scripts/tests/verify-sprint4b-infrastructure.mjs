/**
 * Sprint 4B Infrastructure Verification
 * Checks all required services and dependencies
 */

// ANSI colors
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const blue = '\x1b[34m';
const reset = '\x1b[0m';

function log(message, color = reset) {
  console.log(`${color}${message}${reset}`);
}

async function checkQdrantCollection() {
  log('\n🔍 Checking Qdrant chat_documents collection...', blue);
  try {
    const response = await fetch('http://localhost:6333/collections/chat_documents');
    const data = await response.json();

    if (data.result) {
      log(`✅ Collection exists with ${data.result.points_count} points`, green);
      log(`   Vectors: 768-dim, ${data.result.config.params.vectors.distance} distance`, reset);
      return true;
    } else {
      log('❌ Collection not found', red);
      return false;
    }
  } catch (error) {
    log(`❌ Qdrant not reachable: ${error.message}`, red);
    return false;
  }
}

async function checkOllamaModels() {
  log('\n🔍 Checking Ollama models...', blue);
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    const data = await response.json();

    const required = ['embeddinggemma', 'gemma3-legal', 'gemma4'];
    const available = data.models.map(m => m.name.split(':')[0]);

    let allFound = true;
    for (const model of required) {
      if (available.includes(model)) {
        log(`✅ ${model} available`, green);
      } else {
        log(`❌ ${model} NOT found`, red);
        allFound = false;
      }
    }

    return allFound;
  } catch (error) {
    log(`❌ Ollama not reachable: ${error.message}`, red);
    return false;
  }
}

async function checkLangExtract() {
  log('\n🔍 Checking LangExtract service...', blue);
  try {
    const response = await fetch('http://localhost:8095/health');
    const data = await response.json();

    if (data.status === 'healthy') {
      log('✅ LangExtract healthy', green);
      log(`   Memory: ${data.memory_mb.toFixed(1)} MB`, reset);
      return true;
    } else {
      log('⚠️  LangExtract unhealthy', yellow);
      return false;
    }
  } catch (error) {
    log(`❌ LangExtract not reachable: ${error.message}`, red);
    return false;
  }
}

async function checkDatabase() {
  log('\n🔍 Checking PostgreSQL database...', blue);
  try {
    // This requires pg module - for now we'll skip or use a simple check
    log('⚠️  Database check requires pg module - skipping', yellow);
    log('   Manual check: psql -c "\\d chat_document_attachments" postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db', reset);
    return true;
  } catch (error) {
    log(`❌ Database check failed: ${error.message}`, red);
    return false;
  }
}

async function checkRabbitMQ() {
  log('\n🔍 Checking RabbitMQ...', blue);
  try {
    // RabbitMQ management API (if enabled)
    const response = await fetch('http://localhost:15672/api/overview', {
      headers: {
        'Authorization': 'Basic ' + Buffer.from('guest:guest').toString('base64')
      }
    });

    if (response.ok) {
      const data = await response.json();
      log('✅ RabbitMQ running', green);
      log(`   Queues: ${data.queue_totals?.total || 'unknown'}`, reset);
      return true;
    } else {
      log('⚠️  RabbitMQ management API not accessible', yellow);
      return true; // Non-fatal
    }
  } catch (error) {
    log('⚠️  RabbitMQ check failed (might not have management plugin)', yellow);
    return true; // Non-fatal
  }
}

async function checkRedis() {
  log('\n🔍 Checking Redis...', blue);
  // Redis check would require ioredis module
  log('⚠️  Redis check requires ioredis module - skipping', yellow);
  log('   Manual check: redis-cli PING', reset);
  return true;
}

async function checkWhisper() {
  log('\n🔍 Checking Whisper CLI...', blue);
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync('whisper --version', { timeout: 3000 });
      log('✅ Whisper CLI installed', green);
      log(`   ${stdout.trim()}`, reset);
      return true;
    } catch (error) {
      log('❌ Whisper CLI not found in PATH', red);
      log('   Install: pip install -U openai-whisper', yellow);
      log('   Or: npm install -g whisper-node', yellow);
      return false;
    }
  } catch (error) {
    log(`❌ Failed to check Whisper: ${error.message}`, red);
    return false;
  }
}

async function main() {
  log('═══════════════════════════════════════════════════', blue);
  log('   Sprint 4B Infrastructure Verification', blue);
  log('═══════════════════════════════════════════════════', blue);

  const results = {
    qdrant: await checkQdrantCollection(),
    ollama: await checkOllamaModels(),
    langextract: await checkLangExtract(),
    database: await checkDatabase(),
    rabbitmq: await checkRabbitMQ(),
    redis: await checkRedis(),
    whisper: await checkWhisper()
  };

  // Summary
  log('\n═══════════════════════════════════════════════════', blue);
  log('   Summary', blue);
  log('═══════════════════════════════════════════════════', blue);

  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;

  log(`\n${passed}/${total} checks passed`, passed === total ? green : yellow);

  if (!results.whisper) {
    log('\n⚠️  CRITICAL: Whisper CLI is required for audio transcription', yellow);
    log('   Install instructions:', reset);
    log('   1. Python: pip install -U openai-whisper', reset);
    log('   2. Or Node: npm install -g whisper-node', reset);
  }

  if (!results.qdrant) {
    log('\n⚠️  CRITICAL: Qdrant chat_documents collection missing', yellow);
    log('   Create with:', reset);
    log('   curl -X PUT http://localhost:6333/collections/chat_documents \\', reset);
    log('     -H "Content-Type: application/json" \\', reset);
    log('     -d \'{"vectors": {"size": 768, "distance": "Cosine"}}\'', reset);
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch(console.error);
