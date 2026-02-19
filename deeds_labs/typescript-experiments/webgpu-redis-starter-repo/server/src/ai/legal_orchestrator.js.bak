// Legal AI Orchestrator - Enhanced for existing Redis/worker architecture
const Redis = require('ioredis');
const crypto = require('crypto');

class LegalModelOrchestrator {
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
    this.models = new Map();
    this.initialized = false;

    // Model endpoints (these would connect to actual AI services)
    this.endpoints = {
      gemma3: process.env.VLLM_ENDPOINT || 'http://localhost:8001',
      'gemma-local': process.env.LOCAL_ENDPOINT || 'http://localhost:8002',
      autogen: process.env.AUTOGEN_ENDPOINT || 'http://localhost:8003',
      crewai: process.env.CREWAI_ENDPOINT || 'http://localhost:8004'
    };

    // Cache configurations
    this.cacheConfig = {
      embeddings: { ttl: 86400, prefix: 'emb:' },
      responses: { ttl: 3600, prefix: 'resp:' },
      kv_cache: { ttl: 7200, prefix: 'kv:' }
    };
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Check Redis connection
      await this.redis.ping();
      console.log('✅ Redis connected for Legal AI Orchestrator');

      // Initialize model connections
      await this.initializeModels();

      this.initialized = true;
      console.log('🚀 Legal AI Orchestrator initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Legal AI Orchestrator:', error);
      throw error;
    }
  }

  async initializeModels() {
    // Check which models are available
    for (const [modelName, endpoint] of Object.entries(this.endpoints)) {
      try {
        // Simple health check (would be actual model health check)
        const isAvailable = await this.checkModelHealth(endpoint);
        if (isAvailable) {
          this.models.set(modelName, { endpoint, status: 'ready' });
          console.log(`✅ Model ${modelName} available at ${endpoint}`);
        } else {
          console.log(`⚠️ Model ${modelName} not available at ${endpoint}`);
        }
      } catch (error) {
        console.log(`❌ Model ${modelName} failed to connect: ${error.message}`);
      }
    }
  }

  async checkModelHealth(endpoint) {
    // Mock health check - in real implementation, would ping the actual service
    return true;
  }

  async generateResponse(request) {
    await this.ensureInitialized();

    const {
      model_preference = 'gemma3',
      messages = [],
      case_context = {},
      max_tokens = 1024,
      temperature = 0.7,
      use_kv_cache = true
    } = request;

    // Generate cache key
    const cacheKey = this.generateCacheKey({
      model: model_preference,
      messages,
      context: case_context,
      params: { max_tokens, temperature }
    });

    // Check cache first
    if (use_kv_cache) {
      const cached = await this.getCachedResponse(cacheKey);
      if (cached) {
        console.log(`📋 Cache hit for ${cacheKey.substring(0, 8)}...`);
        return cached;
      }
    }

    // Route to appropriate model
    let response;
    try {
      switch (model_preference) {
        case 'gemma3':
          response = await this.generateVLLMResponse(request);
          break;
        case 'gemma-local':
          response = await this.generateLocalResponse(request);
          break;
        case 'autogen':
          response = await this.generateAutoGenResponse(request);
          break;
        case 'crewai':
          response = await this.generateCrewAIResponse(request);
          break;
        default:
          response = await this.generateVLLMResponse(request);
      }

      // Cache the response
      if (use_kv_cache && response) {
        await this.cacheResponse(cacheKey, response);
      }

      return response;
    } catch (error) {
      console.error(`❌ Error generating response with ${model_preference}:`, error);

      // Fallback to default model
      if (model_preference !== 'gemma3') {
        console.log('🔄 Falling back to Gemma3...');
        return await this.generateVLLMResponse({
          ...request,
          model_preference: 'gemma3'
        });
      }

      throw error;
    }
  }

  async generateVLLMResponse(request) {
    const { messages, case_context, max_tokens, temperature } = request;

    // Format legal prompt
    const systemPrompt = this.createLegalSystemPrompt(case_context);
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // Simulate vLLM API call (replace with actual vLLM integration)
    const response = await this.callVLLMAPI({
      messages: formattedMessages,
      max_tokens,
      temperature,
      model: 'gemma3-legal-latest'
    });

    return this.formatLegalResponse(response, 'gemma3');
  }

  async generateLocalResponse(request) {
    const { messages, max_tokens = 512, temperature = 0.7 } = request;

    try {
      // Use actual gemma3:270m model via Ollama (291MB - 2-3 second response time)
      console.log('🚀 Using gemma3:270m for fast local inference...');

      const prompt = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');

      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma3:270m',
          prompt: prompt,
          stream: false,
          options: {
            num_predict: max_tokens,
            temperature: temperature
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const result = await response.json();

      return this.formatLegalResponse({
        text: result.response,
        model: 'gemma3:270m',
        tokens: result.eval_count || 0,
        latency: Math.round(result.total_duration / 1000000) // Convert nanoseconds to milliseconds
      }, 'gemma-local');

    } catch (error) {
      console.error('❌ Local model error:', error);

      // Fallback to mock response
      const response = await this.callLocalModel({
        messages,
        max_tokens,
        model: 'gemma-270mb'
      });

      return this.formatLegalResponse(response, 'gemma-local-fallback');
    }
  }

  async generateAutoGenResponse(request) {
    const { messages, case_context } = request;

    // Multi-agent conversation simulation
    const agents = [
      { role: 'legal_researcher', expertise: 'case_law' },
      { role: 'contract_analyst', expertise: 'contract_terms' },
      { role: 'compliance_checker', expertise: 'regulations' }
    ];

    const agentResponses = [];

    for (const agent of agents) {
      const agentPrompt = this.createAgentPrompt(agent, messages, case_context);
      const agentResponse = await this.callVLLMAPI({
        messages: [{ role: 'user', content: agentPrompt }],
        max_tokens: 800,
        temperature: 0.3
      });

      agentResponses.push({
        agent: agent.role,
        expertise: agent.expertise,
        response: agentResponse
      });
    }

    // Synthesize agent responses
    const synthesis = await this.synthesizeAgentResponses(agentResponses, messages);

    return {
      response: synthesis,
      model_used: 'autogen',
      agent_chain: agents.map(a => a.role),
      agent_responses: agentResponses,
      confidence: 0.92
    };
  }

  async generateCrewAIResponse(request) {
    const { messages, case_context } = request;

    // Sequential workflow simulation
    const workflow = [
      { task: 'analysis', agent: 'legal_analyst' },
      { task: 'research', agent: 'researcher' },
      { task: 'risk_assessment', agent: 'risk_assessor' },
      { task: 'recommendations', agent: 'advisor' }
    ];

    const workflowResults = [];
    let context = { messages, case_context };

    for (const step of workflow) {
      const stepPrompt = this.createWorkflowStepPrompt(step, context);
      const stepResponse = await this.callVLLMAPI({
        messages: [{ role: 'user', content: stepPrompt }],
        max_tokens: 600,
        temperature: 0.4
      });

      workflowResults.push({
        task: step.task,
        agent: step.agent,
        response: stepResponse
      });

      // Update context for next step
      context.previous_steps = workflowResults;
    }

    // Final synthesis
    const finalSynthesis = await this.synthesizeWorkflowResults(workflowResults);

    return {
      response: finalSynthesis,
      model_used: 'crewai',
      workflow_steps: workflowResults,
      confidence: 0.89
    };
  }

  async generateEmbedding(text, model = 'embeddinggemma') {
    const cacheKey = `${this.cacheConfig.embeddings.prefix}${this.hashText(text)}`;

    // Check cache
    const cached = await this.redis.getBuffer(cacheKey);
    if (cached) {
      return new Float32Array(cached.buffer);
    }

    // Generate embedding (simulate API call)
    const embedding = await this.callEmbeddingAPI(text, model);

    // Cache the embedding
    await this.redis.setex(
      cacheKey,
      this.cacheConfig.embeddings.ttl,
      Buffer.from(embedding.buffer)
    );

    return embedding;
  }

  // Helper methods
  createLegalSystemPrompt(context) {
    const { case_type = 'general', priority = 'medium', legal_entities = [] } = context;

    let prompt = `You are an expert legal AI assistant specializing in ${case_type} law. `;
    prompt += `This is a ${priority} priority case. `;

    if (legal_entities.length > 0) {
      prompt += `Relevant entities: ${legal_entities.join(', ')}. `;
    }

    prompt += `Provide accurate, well-reasoned legal analysis based on established legal principles. `;
    prompt += `Always cite relevant statutes and case law when applicable. `;
    prompt += `Structure your response clearly with numbered points and legal reasoning.`;

    return prompt;
  }

  createAgentPrompt(agent, messages, context) {
    const lastMessage = messages[messages.length - 1]?.content || '';

    return `You are a ${agent.role} specializing in ${agent.expertise}.

    User query: ${lastMessage}

    Case context: ${JSON.stringify(context, null, 2)}

    Provide analysis from your specialized perspective. Focus on:
    - Your area of expertise
    - Specific legal considerations
    - Relevant precedents or regulations
    - Recommendations for next steps`;
  }

  createWorkflowStepPrompt(step, context) {
    const { task, agent } = step;
    const lastMessage = context.messages[context.messages.length - 1]?.content || '';

    return `Task: ${task}
    Agent: ${agent}

    User query: ${lastMessage}

    Context: ${JSON.stringify(context.case_context, null, 2)}

    ${context.previous_steps ? `Previous analysis: ${JSON.stringify(context.previous_steps, null, 2)}` : ''}

    Complete the ${task} task for this legal matter.`;
  }

  async synthesizeAgentResponses(agentResponses, originalMessages) {
    const synthesisPrompt = `Synthesize the following expert analyses into a comprehensive legal opinion:

    ${agentResponses.map(ar => `${ar.agent} (${ar.expertise}): ${ar.response}`).join('\n\n')}

    Original query: ${originalMessages[originalMessages.length - 1]?.content}

    Provide a unified, coherent legal analysis that incorporates all expert perspectives.`;

    return await this.callVLLMAPI({
      messages: [{ role: 'user', content: synthesisPrompt }],
      max_tokens: 1200,
      temperature: 0.2
    });
  }

  async synthesizeWorkflowResults(workflowResults) {
    const synthesisPrompt = `Synthesize the following workflow analysis into a final legal recommendation:

    ${workflowResults.map(wr => `${wr.task} (${wr.agent}): ${wr.response}`).join('\n\n')}

    Provide a comprehensive legal conclusion with specific recommendations.`;

    return await this.callVLLMAPI({
      messages: [{ role: 'user', content: synthesisPrompt }],
      max_tokens: 1000,
      temperature: 0.3
    });
  }

  formatLegalResponse(response, modelUsed) {
    return {
      response,
      model_used: modelUsed,
      timestamp: new Date().toISOString(),
      confidence: this.calculateConfidence(response),
      token_count: response.split(' ').length
    };
  }

  calculateConfidence(response) {
    // Simple confidence calculation based on response characteristics
    let confidence = 0.7; // Base confidence

    // Higher confidence for longer, more detailed responses
    if (response.length > 500) confidence += 0.1;
    if (response.length > 1000) confidence += 0.1;

    // Higher confidence for responses with citations
    if (response.includes('v.') || response.includes('U.S.C.')) confidence += 0.1;

    // Cap at 0.95
    return Math.min(confidence, 0.95);
  }

  // API simulation methods (replace with actual implementations)
  async callVLLMAPI(params) {
    // Simulate API delay
    await this.sleep(Math.random() * 1000 + 500);

    // Generate mock legal response based on the query
    const query = params.messages[params.messages.length - 1]?.content || '';

    if (query.toLowerCase().includes('contract')) {
      return `Based on contract law principles, this agreement should be analyzed for:
      1. Offer and acceptance elements
      2. Consideration adequacy
      3. Capacity of parties
      4. Potential liability clauses
      5. Termination provisions

      Recommend reviewing Section 2-201 of the UCC for written contract requirements.`;
    }

    if (query.toLowerCase().includes('liability')) {
      return `Liability analysis indicates several key considerations:
      1. Duty of care establishment
      2. Breach of duty evidence
      3. Causation elements (factual and proximate)
      4. Damages quantification
      5. Potential defenses available

      Reference relevant state tort law and comparative negligence standards.`;
    }

    return `Legal analysis of the matter reveals several important considerations that require careful review of applicable statutes and precedent case law. Further factual development may be necessary to provide comprehensive guidance.`;
  }

  async callLocalModel(params) {
    // Simulate local model (faster, shorter responses)
    await this.sleep(Math.random() * 300 + 200);

    return `Legal guidance: Review applicable statutes and consult relevant case precedents. Consider potential risks and compliance requirements.`;
  }

  async callEmbeddingAPI(text, model) {
    // Simulate embedding generation
    await this.sleep(100);

    // Generate mock embedding (768-dimensional)
    const embedding = new Float32Array(768);
    for (let i = 0; i < 768; i++) {
      embedding[i] = Math.random() * 2 - 1; // Random values between -1 and 1
    }

    return embedding;
  }

  // Caching utilities
  generateCacheKey(data) {
    return crypto.createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  hashText(text) {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  async getCachedResponse(cacheKey) {
    const cached = await this.redis.get(`${this.cacheConfig.responses.prefix}${cacheKey}`);
    return cached ? JSON.parse(cached) : null;
  }

  async cacheResponse(cacheKey, response) {
    await this.redis.setex(
      `${this.cacheConfig.responses.prefix}${cacheKey}`,
      this.cacheConfig.responses.ttl,
      JSON.stringify(response)
    );
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Status and monitoring
  async getStatus() {
    const modelStatus = {};
    for (const [name, model] of this.models) {
      modelStatus[name] = model.status;
    }

    const cacheStats = await this.getCacheStats();

    return {
      initialized: this.initialized,
      models: modelStatus,
      cache: cacheStats,
      endpoints: this.endpoints
    };
  }

  async getCacheStats() {
    const keys = await this.redis.keys('resp:*');
    const embKeys = await this.redis.keys('emb:*');

    return {
      response_cache_size: keys.length,
      embedding_cache_size: embKeys.length,
      total_cached_items: keys.length + embKeys.length
    };
  }

  async cleanup() {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

module.exports = LegalModelOrchestrator;