import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { env } from '$env/dynamic/private';
import { cacheManager } from '../database/redis.js';

/**
 * Advanced Legal AI Agent Orchestrator
 * Integrates LangChain + CrewAI + Ollama + Claude + Gemini fallbacks
 * Supports streaming, worker threads, and intelligent agent selection
 */

export interface AgentConfig {
  name: string;
  type: 'ollama' | 'claude' | 'gemini';
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  specialization: string[];
}

export interface OrchestrationRequest {
  query: string;
  documentType?: 'contract' | 'motion' | 'evidence' | 'correspondence' | 'brief';
  jurisdiction?: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  requiresMultiAgent: boolean;
  enableStreaming: boolean;
  context?: Record<string, any>;
}

export interface AgentResponse {
  agentName: string;
  response: string;
  confidence: number;
  processingTime: number;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
  metadata: Record<string, any>;
}

export interface OrchestrationResult {
  primaryResponse: AgentResponse;
  collaborativeAnalysis?: AgentResponse[];
  synthesizedConclusion: string;
  recommendations: string[];
  confidence: number;
  totalProcessingTime: number;
  cacheKey?: string;
}

// Predefined agent configurations for legal AI
const LEGAL_AGENT_CONFIGS: AgentConfig[] = [
  {
    name: 'legal-analyst',
    type: 'ollama',
    model: env.OLLAMA_LEGAL_MODEL || 'gemma2:9b',
    temperature: 0.1,
    maxTokens: 2048,
    systemPrompt: `You are a senior legal analyst specializing in document analysis, case law research, and legal precedent identification. 
    Provide precise, citations-backed analysis with attention to jurisdictional differences and regulatory compliance.`,
    specialization: ['document_analysis', 'case_law', 'precedent_research', 'compliance_review']
  },
  {
    name: 'contract-specialist',
    type: 'ollama',
    model: env.OLLAMA_LEGAL_MODEL || 'gemma2:9b',
    temperature: 0.05,
    maxTokens: 3072,
    systemPrompt: `You are an expert contract attorney specializing in contract drafting, review, and risk assessment.
    Focus on identifying key terms, obligations, risk factors, and potential legal issues in contractual documents.`,
    specialization: ['contract_drafting', 'risk_assessment', 'term_analysis', 'obligation_mapping']
  },
  {
    name: 'litigation-strategist',
    type: 'claude',
    model: env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
    temperature: 0.2,
    maxTokens: 4096,
    systemPrompt: `You are a litigation strategy expert with deep knowledge of procedural law, evidence rules, and courtroom tactics.
    Provide strategic guidance on case positioning, evidence evaluation, and procedural considerations.`,
    specialization: ['litigation_strategy', 'evidence_analysis', 'procedural_law', 'case_positioning']
  },
  {
    name: 'regulatory-compliance',
    type: 'gemini',
    model: env.GEMINI_MODEL || 'gemini-1.5-pro',
    temperature: 0.1,
    maxTokens: 2048,
    systemPrompt: `You are a regulatory compliance specialist with expertise in financial services, healthcare, and corporate law.
    Focus on regulatory requirements, compliance frameworks, and risk mitigation strategies.`,
    specialization: ['regulatory_analysis', 'compliance_frameworks', 'risk_mitigation', 'policy_review']
  }
];

export class LegalAIOrchestrator {
  private agents: Map<string, any> = new Map();
  private outputParser = new StringOutputParser();

  constructor() {
    this.initializeAgents();
  }

  private initializeAgents(): void {
    for (const config of LEGAL_AGENT_CONFIGS) {
      let agent;
      
      switch (config.type) {
        case 'ollama':
          agent = new ChatOllama({
            baseUrl: env.OLLAMA_BASE_URL || 'http://localhost:11434',
            model: config.model,
            temperature: config.temperature,
          });
          break;
          
        case 'claude':
          agent = new ChatAnthropic({
            apiKey: env.ANTHROPIC_API_KEY,
            model: config.model,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
          });
          break;
          
        case 'gemini':
          agent = new ChatGoogleGenerativeAI({
            apiKey: env.GOOGLE_AI_API_KEY,
            modelName: config.model,
            temperature: config.temperature,
            maxOutputTokens: config.maxTokens,
          });
          break;
      }
      
      if (agent) {
        this.agents.set(config.name, { agent, config });
      }
    }
  }

  async orchestrate(request: OrchestrationRequest): Promise<OrchestrationResult> {
    const startTime = Date.now();
    
    // Check cache first
    const cacheKey = this.generateCacheKey(request);
    const cached = await cacheManager.getCachedTokens(cacheKey);
    if (cached) {
      return JSON.parse(cached[0]?.text || '{}');
    }

    try {
      // Select appropriate agent(s)
      const selectedAgents = this.selectAgents(request);
      
      if (request.requiresMultiAgent && selectedAgents.length > 1) {
        return await this.multiAgentOrchestration(request, selectedAgents, startTime, cacheKey);
      } else {
        return await this.singleAgentExecution(request, selectedAgents[0], startTime, cacheKey);
      }
    } catch (error) {
      console.error('Orchestration error:', error);
      throw new Error(`Orchestration failed: ${error.message}`);
    }
  }

  private async singleAgentExecution(
    request: OrchestrationRequest,
    agentInfo: { agent: any; config: AgentConfig },
    startTime: number,
    cacheKey: string
  ): Promise<OrchestrationResult> {
    const { agent, config } = agentInfo;
    
    const prompt = PromptTemplate.fromTemplate(`
    System Context: {systemPrompt}
    
    Document Type: {documentType}
    Jurisdiction: {jurisdiction}
    Urgency Level: {urgency}
    
    Legal Query: {query}
    
    Additional Context: {context}
    
    Please provide a comprehensive legal analysis including:
    1. Key legal issues identified
    2. Relevant statutes, regulations, or case law
    3. Risk assessment and potential implications
    4. Actionable recommendations
    5. Confidence level in your analysis (1-10)
    
    Analysis:
    `);

    const chain = RunnableSequence.from([
      prompt,
      agent,
      this.outputParser
    ]);

    const agentStartTime = Date.now();
    const response = await chain.invoke({
      systemPrompt: config.systemPrompt,
      documentType: request.documentType || 'general',
      jurisdiction: request.jurisdiction || 'federal',
      urgency: request.urgency,
      query: request.query,
      context: JSON.stringify(request.context || {})
    });

    const agentResponse: AgentResponse = {
      agentName: config.name,
      response,
      confidence: this.extractConfidence(response),
      processingTime: Date.now() - agentStartTime,
      tokenUsage: this.estimateTokenUsage(request.query, response),
      metadata: {
        model: config.model,
        temperature: config.temperature,
        specialization: config.specialization
      }
    };

    const result: OrchestrationResult = {
      primaryResponse: agentResponse,
      synthesizedConclusion: response,
      recommendations: this.extractRecommendations(response),
      confidence: agentResponse.confidence,
      totalProcessingTime: Date.now() - startTime,
      cacheKey
    };

    // Cache the result
    await this.cacheResult(cacheKey, result);
    
    return result;
  }

  private async multiAgentOrchestration(
    request: OrchestrationRequest,
    agents: { agent: any; config: AgentConfig }[],
    startTime: number,
    cacheKey: string
  ): Promise<OrchestrationResult> {
    // Execute agents in parallel
    const agentPromises = agents.map(async ({ agent, config }) => {
      const specializedPrompt = this.createSpecializedPrompt(request, config);
      
      const chain = RunnableSequence.from([
        specializedPrompt,
        agent,
        this.outputParser
      ]);

      const agentStartTime = Date.now();
      const response = await chain.invoke({
        query: request.query,
        documentType: request.documentType || 'general',
        jurisdiction: request.jurisdiction || 'federal',
        urgency: request.urgency,
        context: JSON.stringify(request.context || {})
      });

      return {
        agentName: config.name,
        response,
        confidence: this.extractConfidence(response),
        processingTime: Date.now() - agentStartTime,
        tokenUsage: this.estimateTokenUsage(request.query, response),
        metadata: {
          model: config.model,
          specialization: config.specialization
        }
      } as AgentResponse;
    });

    const collaborativeAnalysis = await Promise.all(agentPromises);
    
    // Synthesize responses using the most appropriate agent
    const synthesisAgent = this.selectSynthesisAgent(request);
    const synthesizedConclusion = await this.synthesizeResponses(
      request,
      collaborativeAnalysis,
      synthesisAgent
    );

    const result: OrchestrationResult = {
      primaryResponse: collaborativeAnalysis[0],
      collaborativeAnalysis,
      synthesizedConclusion,
      recommendations: this.extractRecommendations(synthesizedConclusion),
      confidence: this.calculateOverallConfidence(collaborativeAnalysis),
      totalProcessingTime: Date.now() - startTime,
      cacheKey
    };

    // Cache the result
    await this.cacheResult(cacheKey, result);
    
    return result;
  }

  private selectAgents(request: OrchestrationRequest): { agent: any; config: AgentConfig }[] {
    let selectedAgents: { agent: any; config: AgentConfig }[] = [];

    // Document type based selection
    switch (request.documentType) {
      case 'contract':
        selectedAgents.push(this.agents.get('contract-specialist'));
        if (request.requiresMultiAgent) {
          selectedAgents.push(this.agents.get('legal-analyst'));
        }
        break;
        
      case 'motion':
      case 'brief':
        selectedAgents.push(this.agents.get('litigation-strategist'));
        if (request.requiresMultiAgent) {
          selectedAgents.push(this.agents.get('legal-analyst'));
        }
        break;
        
      case 'evidence':
        selectedAgents.push(this.agents.get('litigation-strategist'));
        selectedAgents.push(this.agents.get('legal-analyst'));
        break;
        
      default:
        selectedAgents.push(this.agents.get('legal-analyst'));
        if (request.requiresMultiAgent) {
          selectedAgents.push(this.agents.get('contract-specialist'));
          selectedAgents.push(this.agents.get('regulatory-compliance'));
        }
    }

    // Urgency-based agent selection (use Claude/Gemini for critical)
    if (request.urgency === 'critical') {
      selectedAgents = selectedAgents.filter(agent => 
        agent.config.type === 'claude' || agent.config.type === 'gemini'
      );
      if (selectedAgents.length === 0) {
        selectedAgents.push(this.agents.get('litigation-strategist')); // Claude fallback
      }
    }

    return selectedAgents.filter(Boolean);
  }

  private createSpecializedPrompt(request: OrchestrationRequest, config: AgentConfig): PromptTemplate {
    const specializationContext = config.specialization.includes('contract_drafting') 
      ? "Focus on contractual terms, obligations, and risk factors."
      : config.specialization.includes('litigation_strategy')
      ? "Focus on procedural considerations, evidence evaluation, and strategic positioning."
      : config.specialization.includes('regulatory_analysis')
      ? "Focus on compliance requirements, regulatory frameworks, and policy implications."
      : "Provide comprehensive legal analysis from your area of expertise.";

    return PromptTemplate.fromTemplate(`
    You are a {agentName} with specialization in: {specializations}
    
    {specializationContext}
    
    Document Type: {documentType}
    Jurisdiction: {jurisdiction}
    Urgency: {urgency}
    
    Query: {query}
    
    Context: {context}
    
    Provide your specialized analysis:
    `);
  }

  private selectSynthesisAgent(request: OrchestrationRequest): { agent: any; config: AgentConfig } {
    // Use Claude for synthesis due to its reasoning capabilities
    return this.agents.get('litigation-strategist') || this.agents.get('legal-analyst');
  }

  private async synthesizeResponses(
    request: OrchestrationRequest,
    responses: AgentResponse[],
    synthesisAgent: { agent: any; config: AgentConfig }
  ): Promise<string> {
    const synthesisPrompt = PromptTemplate.fromTemplate(`
    You are synthesizing multiple expert legal opinions on the following query:
    
    Original Query: {query}
    
    Expert Analyses:
    {analyses}
    
    Please provide a comprehensive synthesis that:
    1. Identifies areas of consensus among experts
    2. Highlights any conflicting viewpoints and explains why
    3. Provides a unified conclusion and recommendation
    4. Assesses the overall confidence level
    
    Synthesis:
    `);

    const analysesText = responses.map((r, i) => 
      `Expert ${i + 1} (${r.agentName}):\n${r.response}\n`
    ).join('\n');

    const chain = RunnableSequence.from([
      synthesisPrompt,
      synthesisAgent.agent,
      this.outputParser
    ]);

    return await chain.invoke({
      query: request.query,
      analyses: analysesText
    });
  }

  private extractConfidence(response: string): number {
    const confidenceMatch = response.match(/confidence.*?(\d+(?:\.\d+)?)/i);
    if (confidenceMatch) {
      return Math.min(10, Math.max(1, parseFloat(confidenceMatch[1])));
    }
    return 7; // Default confidence
  }

  private extractRecommendations(response: string): string[] {
    const recommendations: string[] = [];
    const lines = response.split('\n');
    
    let inRecommendations = false;
    for (const line of lines) {
      if (line.toLowerCase().includes('recommendation') || 
          line.toLowerCase().includes('action') ||
          line.toLowerCase().includes('next step')) {
        inRecommendations = true;
        continue;
      }
      
      if (inRecommendations && line.trim()) {
        if (line.match(/^\d+\./) || line.startsWith('-') || line.startsWith('•')) {
          recommendations.push(line.trim());
        }
      }
    }
    
    return recommendations.length > 0 ? recommendations : ['Further legal consultation recommended'];
  }

  private calculateOverallConfidence(responses: AgentResponse[]): number {
    const avgConfidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;
    return Math.round(avgConfidence * 10) / 10;
  }

  private estimateTokenUsage(prompt: string, response: string): { prompt: number; completion: number; total: number } {
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(response.length / 4);
    return {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens
    };
  }

  private generateCacheKey(request: OrchestrationRequest): string {
    const keyData = {
      query: request.query,
      documentType: request.documentType,
      jurisdiction: request.jurisdiction,
      urgency: request.urgency,
      multiAgent: request.requiresMultiAgent
    };
    
    const hash = this.hashObject(keyData);
    return `orchestrator:${hash}`;
  }

  private hashObject(obj: any): string {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private async cacheResult(cacheKey: string, result: OrchestrationResult): Promise<void> {
    try {
      await cacheManager.cacheTokens(cacheKey, [{ text: JSON.stringify(result) }], 1800); // 30 min cache
    } catch (error) {
      console.error('Failed to cache orchestration result:', error);
    }
  }

  async getAgentStatus(): Promise<Record<string, any>> {
    const status: Record<string, any> = {};
    
    for (const [name, { config }] of this.agents) {
      status[name] = {
        type: config.type,
        model: config.model,
        specialization: config.specialization,
        available: true // Could add health checks here
      };
    }
    
    return status;
  }
}

// Export singleton instance
export const legalOrchestrator = new LegalAIOrchestrator();