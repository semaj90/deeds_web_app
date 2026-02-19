// Enhanced legal AI worker - integrates with existing MCP orchestrator
const { parentPort } = require('worker_threads');
const Redis = require('ioredis');
const path = require('path');
const crypto = require('crypto');

// Load existing protobuf modules
const jobProto = require('../proto/job_pb');
const legalJobProto = require('../proto/legal_job_pb');

// Redis connection
const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

// Import AI capabilities
const LegalModelOrchestrator = require('../ai/legal_orchestrator');
const RLOptimizer = require('../ai/rl_optimizer');
const TensorCacheManager = require('../cache/tensor_cache_manager');

// Initialize components
const orchestrator = new LegalModelOrchestrator();
const rlOptimizer = new RLOptimizer();
const tensorCache = new TensorCacheManager(redis);

// Worker state
let workerId = `legal_worker_${process.pid}`;
let jobsProcessed = 0;
let totalProcessingTime = 0;

// Performance metrics
const metrics = {
  cache_hits: 0,
  cache_misses: 0,
  rl_optimizations: 0,
  tensor_uploads: 0,
  model_switches: 0
};

parentPort.on('message', async (msg) => {
  const startTime = Date.now();

  try {
    // Decode legal job
    let jobBuf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg.buffer || msg);
    const legalJob = legalJobProto.webgpu.LegalJob.decode(jobBuf);

    const { job_id, job_type, payload } = legalJob;

    parentPort.postMessage({
      type: 'job_started',
      job_id,
      worker_id: workerId,
      timestamp: Date.now()
    });

    // Process based on job type
    let result;
    switch (job_type) {
      case legalJobProto.webgpu.LegalJobType.CONTRACT_ANALYSIS:
        result = await processContractAnalysis(legalJob);
        break;

      case legalJobProto.webgpu.LegalJobType.CASE_RESEARCH:
        result = await processCaseResearch(legalJob);
        break;

      case legalJobProto.webgpu.LegalJobType.MULTI_AGENT_ANALYSIS:
        result = await processMultiAgentAnalysis(legalJob);
        break;

      case legalJobProto.webgpu.LegalJobType.EMBEDDING_GENERATION:
        result = await processEmbeddingGeneration(legalJob);
        break;

      case legalJobProto.webgpu.LegalJobType.TENSOR_OPTIMIZATION:
        result = await processTensorOptimization(legalJob);
        break;

      case legalJobProto.webgpu.LegalJobType.RL_TRAINING:
        result = await processRLTraining(legalJob);
        break;

      default:
        result = await processGeneralLegalAnalysis(legalJob);
    }

    // Create legal result
    const legalResult = legalJobProto.webgpu.LegalResult.create({
      job_id,
      result_data: Buffer.from(JSON.stringify(result.response)),
      produced_at: new Date().toISOString(),
      legal_analysis: result.analysis,
      extracted_entities: result.entities || [],
      citations: result.citations || [],
      confidence_score: result.confidence || 0.8,
      agent_chain: result.agent_chain || [],
      embeddings: result.embeddings || {},
      tensor_ids: result.tensor_ids || [],
      cached_at: result.cached_location || legalJobProto.webgpu.CacheLocation.REDIS,
      rl_optimized: result.rl_optimized || false
    });

    const resultBuffer = legalJobProto.webgpu.LegalResult.encode(legalResult).finish();

    // Store result using existing caching patterns
    const cacheKey = `legal:result:${job_id}`;
    await redis.setBuffer(cacheKey, Buffer.from(resultBuffer));
    await redis.setex(`${cacheKey}:meta`, 3600, JSON.stringify({
      job_type,
      case_id: payload.case_id,
      user_id: payload.user_id,
      processing_time: Date.now() - startTime,
      worker_id: workerId,
      cached_at: Date.now()
    }));

    // Store embeddings in tensor cache if generated
    if (result.embeddings && Object.keys(result.embeddings).length > 0) {
      await storeEmbeddingsInCache(result.embeddings, payload.case_id);
    }

    // Publish completion
    await redis.publish('channel:legal_complete', JSON.stringify({
      job_id,
      case_id: payload.case_id,
      user_id: payload.user_id,
      processing_time: Date.now() - startTime
    }));

    // Update worker metrics
    jobsProcessed++;
    totalProcessingTime += (Date.now() - startTime);

    parentPort.postMessage({
      type: 'job_completed',
      job_id,
      worker_id: workerId,
      processing_time: Date.now() - startTime,
      cache_hits: metrics.cache_hits,
      tensor_count: (result.tensor_ids || []).length
    });

    // Record RL experience if optimization was used
    if (result.rl_optimized) {
      await recordRLExperience(legalJob, result, Date.now() - startTime);
    }

  } catch (error) {
    parentPort.postMessage({
      type: 'job_error',
      job_id: msg.job_id || 'unknown',
      worker_id: workerId,
      error: error.message,
      stack: error.stack
    });
  }
});

// Legal analysis functions
async function processContractAnalysis(legalJob) {
  const { payload } = legalJob;

  // Check cache first
  const cacheKey = generateCacheKey(payload);
  const cached = await getCachedResponse(cacheKey);
  if (cached) {
    metrics.cache_hits++;
    return cached;
  }
  metrics.cache_misses++;

  // Get RL-optimized parameters
  const rlParams = await rlOptimizer.getOptimizedParams(
    payload.case_id,
    payload.messages[payload.messages.length - 1]?.content || '',
    { job_type: 'contract_analysis' }
  );

  // Generate response using orchestrator
  const response = await orchestrator.generateResponse({
    model_preference: payload.model_config.model_type,
    messages: payload.messages,
    case_context: payload.legal_context,
    max_tokens: rlParams.max_tokens || payload.model_config.max_tokens,
    temperature: rlParams.temperature || payload.model_config.temperature,
    use_kv_cache: payload.model_config.enable_kv_reuse
  });

  // Extract legal entities and citations
  const analysis = await extractLegalEntities(response);

  const result = {
    response,
    analysis: analysis.structured_analysis,
    entities: analysis.entities,
    citations: analysis.citations,
    confidence: analysis.confidence,
    rl_optimized: rlParams.rl_optimized || false,
    cached_location: legalJobProto.webgpu.CacheLocation.REDIS
  };

  // Cache the result
  await cacheResponse(cacheKey, result);

  return result;
}

async function processCaseResearch(legalJob) {
  const { payload } = legalJob;

  // Multi-step research process
  const researchSteps = [
    'precedent_search',
    'statute_analysis',
    'case_law_review',
    'synthesis'
  ];

  const stepResults = [];
  const tensor_ids = [];

  for (const step of researchSteps) {
    // Create specialized prompt for each step
    const stepPrompt = createResearchPrompt(step, payload.messages, payload.legal_context);

    // Generate embeddings for similarity search
    const embedding = await orchestrator.generateEmbedding(stepPrompt);
    const tensorId = `research_${step}_${payload.case_id}_${Date.now()}`;

    // Store embedding in tensor cache
    await tensorCache.storeTensor(tensorId, embedding, {
      shape: [embedding.length],
      dtype: 'float32',
      compression: 'float16',
      metadata: {
        step,
        case_id: payload.case_id,
        research_type: 'legal_precedent'
      }
    });
    tensor_ids.push(tensorId);

    // Find similar cases using embeddings
    const similarCases = await findSimilarCases(embedding, payload.legal_context.case_type);

    // Generate analysis for this step
    const stepAnalysis = await orchestrator.generateResponse({
      model_preference: 'gemma3',
      messages: [{
        role: 'system',
        content: `You are conducting ${step} for a legal case. Focus on relevant precedents and statutes.`
      }, {
        role: 'user',
        content: stepPrompt
      }],
      case_context: {
        ...payload.legal_context,
        similar_cases: similarCases
      }
    });

    stepResults.push({
      step,
      analysis: stepAnalysis,
      similar_cases: similarCases,
      tensor_id: tensorId
    });
  }

  // Synthesize all research steps
  const finalSynthesis = await orchestrator.generateResponse({
    model_preference: 'gemma3',
    messages: [{
      role: 'system',
      content: 'Synthesize the legal research findings into a comprehensive analysis.'
    }, {
      role: 'user',
      content: `Research findings: ${JSON.stringify(stepResults, null, 2)}`
    }]
  });

  return {
    response: finalSynthesis,
    analysis: 'Comprehensive legal research analysis',
    entities: extractEntitiesFromSteps(stepResults),
    citations: extractCitationsFromSteps(stepResults),
    confidence: 0.9,
    tensor_ids,
    research_steps: stepResults,
    cached_location: legalJobProto.webgpu.CacheLocation.REDIS
  };
}

async function processMultiAgentAnalysis(legalJob) {
  const { payload } = legalJob;

  if (payload.workflow_config.workflow_type === 'autogen') {
    return await processAutoGenWorkflow(payload);
  } else if (payload.workflow_config.workflow_type === 'crewai') {
    return await processCrewAIWorkflow(payload);
  } else {
    // Default sequential multi-agent
    return await processSequentialAgents(payload);
  }
}

async function processAutoGenWorkflow(payload) {
  // Multi-agent AutoGen conversation
  const agents = payload.workflow_config.agents;
  const conversationHistory = [];

  for (const agent of agents) {
    const agentPrompt = `${agent.system_prompt}\n\nPrevious conversation:\n${JSON.stringify(conversationHistory, null, 2)}\n\nUser query: ${payload.messages[payload.messages.length - 1].content}`;

    const response = await orchestrator.generateResponse({
      model_preference: 'gemma3',
      messages: [{
        role: 'system',
        content: agent.system_prompt
      }, {
        role: 'user',
        content: agentPrompt
      }],
      case_context: payload.legal_context
    });

    conversationHistory.push({
      agent: agent.agent_type,
      response,
      timestamp: Date.now()
    });
  }

  // Final synthesis
  const finalResponse = await orchestrator.generateResponse({
    model_preference: 'gemma3',
    messages: [{
      role: 'system',
      content: 'Synthesize the multi-agent analysis into a final legal opinion.'
    }, {
      role: 'user',
      content: JSON.stringify(conversationHistory, null, 2)
    }]
  });

  return {
    response: finalResponse,
    analysis: 'Multi-agent collaborative analysis',
    agent_chain: agents.map(a => a.agent_type),
    conversation_history: conversationHistory,
    confidence: 0.95,
    cached_location: legalJobProto.webgpu.CacheLocation.REDIS
  };
}

async function processEmbeddingGeneration(legalJob) {
  const { payload } = legalJob;

  const embeddings = {};
  const tensor_ids = [];

  for (const message of payload.messages) {
    if (message.role === 'user') {
      // Generate embedding for user message
      const embedding = await orchestrator.generateEmbedding(message.content);
      const tensorId = `embedding_${payload.case_id}_${message.message_id}_${Date.now()}`;

      // Store with compression
      await tensorCache.storeTensor(tensorId, embedding, {
        shape: [embedding.length],
        dtype: 'float32',
        compression: payload.model_config.compression_type || 'float16',
        metadata: {
          message_id: message.message_id,
          case_id: payload.case_id,
          role: message.role
        }
      });

      embeddings[message.message_id] = Buffer.from(embedding.buffer);
      tensor_ids.push(tensorId);
      metrics.tensor_uploads++;
    }
  }

  return {
    response: 'Embeddings generated successfully',
    analysis: `Generated ${tensor_ids.length} embeddings`,
    embeddings,
    tensor_ids,
    confidence: 1.0,
    cached_location: legalJobProto.webgpu.CacheLocation.REDIS
  };
}

async function processTensorOptimization(legalJob) {
  const { payload } = legalJob;

  // Get current tensor usage for case
  const caseTensors = await tensorCache.getTensorsForCase(payload.case_id);

  // Apply RL-guided optimization
  const optimizations = await rlOptimizer.optimizeTensorLayout(caseTensors);

  // Execute optimizations
  const optimizedTensors = [];
  for (const opt of optimizations.actions) {
    if (opt.action === 'compress') {
      await tensorCache.compressTensor(opt.tensor_id, 'lz4');
      optimizedTensors.push(opt.tensor_id);
    } else if (opt.action === 'promote_gpu') {
      await tensorCache.promoteTensorToGPU(opt.tensor_id);
      optimizedTensors.push(opt.tensor_id);
    }
  }

  return {
    response: `Optimized ${optimizedTensors.length} tensors`,
    analysis: JSON.stringify(optimizations, null, 2),
    tensor_ids: optimizedTensors,
    confidence: 0.8,
    rl_optimized: true,
    cached_location: legalJobProto.webgpu.CacheLocation.GPU
  };
}

// Helper functions
function generateCacheKey(payload) {
  const keyData = {
    messages: payload.messages,
    model_config: payload.model_config,
    case_type: payload.legal_context.case_type
  };
  return crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
}

async function getCachedResponse(cacheKey) {
  const cached = await redis.get(`legal_cache:${cacheKey}`);
  return cached ? JSON.parse(cached) : null;
}

async function cacheResponse(cacheKey, result) {
  await redis.setex(`legal_cache:${cacheKey}`, 3600, JSON.stringify(result));
}

async function extractLegalEntities(text) {
  // Simplified entity extraction
  const entities = [];
  const citations = [];

  // Extract case names (simplified regex)
  const caseMatches = text.match(/[A-Z][a-z]+ v\. [A-Z][a-z]+/g);
  if (caseMatches) entities.push(...caseMatches);

  // Extract statute references
  const statuteMatches = text.match(/\d+ U\.S\.C\. §\s*\d+/g);
  if (statuteMatches) citations.push(...statuteMatches);

  return {
    structured_analysis: 'Legal analysis with extracted entities',
    entities,
    citations,
    confidence: 0.85
  };
}

async function storeEmbeddingsInCache(embeddings, caseId) {
  for (const [messageId, embeddingBuffer] of Object.entries(embeddings)) {
    const tensorId = `cached_embedding_${caseId}_${messageId}`;
    await tensorCache.storeTensor(tensorId, new Float32Array(embeddingBuffer), {
      shape: [embeddingBuffer.length / 4], // Assuming float32
      dtype: 'float32',
      compression: 'float16',
      metadata: { case_id: caseId, message_id: messageId }
    });
  }
}

async function recordRLExperience(legalJob, result, processingTime) {
  const experience = {
    job_id: legalJob.job_id,
    processing_time: processingTime,
    cache_performance: metrics.cache_hits / (metrics.cache_hits + metrics.cache_misses),
    tensor_count: (result.tensor_ids || []).length,
    model_used: legalJob.payload.model_config.model_type,
    success: true
  };

  await rlOptimizer.recordExperience(experience);
  metrics.rl_optimizations++;
}

// Worker health monitoring
setInterval(() => {
  parentPort.postMessage({
    type: 'worker_health',
    worker_id: workerId,
    jobs_processed: jobsProcessed,
    avg_processing_time: jobsProcessed > 0 ? totalProcessingTime / jobsProcessed : 0,
    metrics,
    memory_usage: process.memoryUsage(),
    timestamp: Date.now()
  });
}, 30000); // Every 30 seconds

console.log(`Legal AI worker ${workerId} started`);

module.exports = {
  processContractAnalysis,
  processCaseResearch,
  processMultiAgentAnalysis
};