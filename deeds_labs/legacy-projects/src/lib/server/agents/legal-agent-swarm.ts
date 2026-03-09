// src/lib/server/agents/legal-agent-swarm.ts
import { OllamaClient } from '$lib/ai/ollama-client';

export interface AgentOutput {
  role: string;
  output: string;
  structured: any | null;
}

export interface Recommendation {
  action: string;
  rationale: string;
  confidence: number;
  priority: 'high' | 'medium' | 'low';
}

export interface AgentSwarmResult {
  agents: AgentOutput[];
  synthesis: string;
  recommendations: Recommendation[];
}

export class LegalAgentSwarm {
  private ollama = new OllamaClient();

  async analyzeDocument(documentText: string): Promise<AgentSwarmResult> {
    // Agent 1: Document Analyzer
    const analysisAgent = await this.runAgent({
      role: 'Document Analyzer',
      task: `Extract key facts from this legal document:\n\n${documentText.slice(0, 2000)}`,
      model: 'gemma3:270m'
    });

    // Agent 2: Case Law Researcher
    const researchAgent = await this.runAgent({
      role: 'Case Law Researcher',
      task: `Based on these facts:\n${analysisAgent.output}\n\nFind similar legal precedents and cite relevant cases.`,
      model: 'gemma3:legal-latest'
    });

    // Agent 3: Risk Assessor
    const riskAgent = await this.runAgent({
      role: 'Risk Assessor',
      task: `Given this analysis:\n${analysisAgent.output}\n\nAnd these precedents:\n${researchAgent.output}\n\nIdentify legal risks and assign a risk level (low/medium/high/critical).`,
      model: 'gemma3:270m'
    });

    // Agent 4: Synthesizer (Meta-Agent)
    const synthesis = await this.synthesizeOutputs([
      analysisAgent,
      researchAgent,
      riskAgent
    ]);

    return {
      agents: [analysisAgent, researchAgent, riskAgent],
      synthesis,
      recommendations: await this.generateRecommendations(synthesis)
    };
  }

  private async runAgent(config: {
    role: string;
    task: string;
    model: string;
  }): Promise<AgentOutput> {
    const prompt = `You are a ${config.role}.

Task: ${config.task}

Provide a detailed response in JSON format:
{
  "findings": [...],
  "confidence": 0.0-1.0,
  "next_steps": [...] 
}`;

    const result = await this.ollama.generate(prompt, {
      model: config.model,
      temperature: 0.3,
      maxTokens: 1024
    });

    try {
      return {
        role: config.role,
        output: result.response,
        structured: JSON.parse(result.response)
      };
    } catch {
      return {
        role: config.role,
        output: result.response,
        structured: null
      };
    }
  }

  private async synthesizeOutputs(agents: AgentOutput[]): Promise<string> {
    const combinedOutputs = agents.map(a =>
      `${a.role}:\n${a.output}`
    ).join('\n\n---\n\n');

    const synthesisPrompt = `Synthesize these agent outputs into a coherent legal analysis:

${combinedOutputs}

Provide a unified summary highlighting:
1. Key findings
2. Risk assessment
3. Recommended actions`;

    const result = await this.ollama.generate(synthesisPrompt, {
      model: 'gemma3:legal-latest',
      temperature: 0.5,
      maxTokens: 512
    });

    return result.response;
  }

  private async generateRecommendations(synthesis: string): Promise<Recommendation[]> {
    const prompt = `Based on this legal analysis:

${synthesis}

Generate 3-5 recommended next actions in JSON format:
[
  {
    "action": "Search similar cases",
    "rationale": "...",
    "confidence": 0.92,
    "priority": "high"
  }
]`;

    const result = await this.ollama.generate(prompt, {
      model: 'gemma3:270m',
      temperature: 0.2,
      maxTokens: 512
    });

    try {
      return JSON.parse(result.response);
    } catch {
      return [];
    }
  }
}
