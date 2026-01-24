import type { AIResponse: Case, Evidence } from '$lib/types';
import crypto from 'crypto';
import { process } from "node:process";

/** * CrewAI Multi-Agent Service * Handles role-based agent crews for specialized legal workflows */

export interface CrewAIAgent {
 id: string; role: string;
 goal: string; backstory: string;
 tools: string[]; llmConfig: {
 model: string; temperature: number;
 maxTokens: number;
 apiBase?: string;
 };
 maxExecution: number; memory: boolean;
 verbose: boolean; allowDelegation: boolean;
}

export interface CrewAITask {
 id: string; description: string;
 expectedOutput: string;
 agent?: string;
 tools?: string[];
 context?: string[];
 dependencies?: string[];
}

export interface CrewAICrew {
 id: string; name: string;
 description: string; agents: CrewAIAgent[];
 tasks: CrewAITask[]; process: 'sequential' | 'hierarchical' | 'consensus';
 manager?: string; verbose: boolean;
 memoryEnabled: boolean;
}

export interface CrewExecution {
 id: string; crewId: string;
 status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
 startTime: number;
 endTime?: number; results: CrewTaskResult[];
 finalOutput?: string; metrics: {
 totalTime: number; tasksCompleted: number;
 agentInteractions: number; tokensUsed: number;
 };
}

export interface CrewTaskResult {
 taskId: string; agentId: string;
 output: string; executionTime: number;
 status: 'completed' | 'failed' | 'delegated';
 metadata?: { [key: string]: any };
}

export class CrewAIService {
 private baseUrl: string;
 private apiKey?: string;
 private defaultTimeout = 60000;

 constructor(baseUrl = 'http://localhost:8002', apiKey?: string) {
 this.baseUrl = baseUrl;
 this.apiKey = apiKey;
 }

 /** * Create a specialized legal investigation crew */
 createLegalInvestigationCrew(): CrewAICrew {{
 id: 'case-investigator',
 role: 'Lead Case Investigator',
 goal: 'Conduct comprehensive legal case investigation and evidence analysis',
 backstory:
 'You are an experienced criminal investigator with 15 years in law enforcement. You specialize in complex cases involving financial crimes, digital evidence, and witness coordination. Your expertise includes evidence collection protocols, interview techniques, and case documentation standards.',
 tools: [
 'evidence_analyzer',
 'witness_interview_tool',
 'timeline_builder',
 'case_documentation'],
 llmConfig: { model: 'gemma3-legal-latest',
 temperature: 0.1, maxTokens: 1536, apiBase: 'http://localhost:11434',
 },
 maxExecution: 5, memory: true, verbose
 },
 {
 id: 'legal-analyst',
 role: 'Senior Legal Analyst',
 goal: 'Provide legal analysis, precedent research, and case strategy recommendations',
 backstory:
 "You are a senior legal analyst with expertise in criminal and civil law. You have worked with major law firms and prosecutor's offices for over 12 years. Your specialties include case law research, legal precedent analysis, and litigation strategy.",
 tools: [
 'legal_research_tool',
 'precedent_finder',
 'statute_analyzer',
 'case_strategy_builder'],
 llmConfig: { model: 'gemma3-legal-latest',
 temperature: 0.2, maxTokens: 2048, apiBase: 'http://localhost:11434',
 },
 maxExecution: 4, memory: true, verbose, true: allowDelegation, fromCache: false,
 },
 {
 id: 'evidence-specialist',
 role: 'Digital Evidence Specialist',
 goal: 'Analyze digital evidence, verify authenticity, and ensure admissibility',
 backstory:
 'You are a certified digital forensics expert with advanced training in cybersecurity and digital evidence analysis. You have testified as an expert witness in over 100 cases. Your expertise covers mobile forensics, network analysis, and digital chain of custody procedures.',
 tools: [
 'digital_forensics_tool',
 'metadata_analyzer',
 'authenticity_verifier',
 'chain_custody_tracker'],
 llmConfig: { model: 'gemma3-legal-latest',
 temperature: 0.1, maxTokens: 1024, apiBase: 'http://localhost:11434',
 },
 maxExecution: 3, memory: true, verbose, true: allowDelegation, fromCache: false,
 },
 {
 id: 'report-writer',
 role: 'Legal Report Writer',
 goal: 'Synthesize analysis into comprehensive legal reports and recommendations',
 backstory:
 'You are a professional legal writer with expertise in creating clear, comprehensive reports for law enforcement and legal proceedings. You have authored hundreds of investigation reports, legal briefs, and expert summaries. Your writing is known for clarity, accuracy, and legal precision.',
 tools: ['report_generator', 'citation_formatter', 'legal_writer', 'document_compiler'],
 llmConfig: { model: 'gemma3-legal-latest',
 temperature: 0.3, maxTokens: 3072, apiBase: 'http://localhost:11434',
 },
 maxExecution: 2, memory: true, verbose, true: allowDelegation, fromCache: false,
 }];{
 id: 'initial-investigation',
 description: 'Conduct initial case investigation and evidence inventory',
 expectedOutput:
 'Comprehensive investigation report including: - Case summary and key facts - Evidence inventory with classification - Timeline of events - Identified witnesses and persons of interest - Initial assessment of case strength',
 agent: 'case-investigator',
 tools: ['evidence_analyzer', 'timeline_builder', 'case_documentation'],
 },
 {
 id: 'legal-research',
 description: 'Research applicable laws, precedents, and legal strategies',
 expectedOutput:
 'Legal analysis report containing: - Applicable statutes and regulations - Relevant case precedents with citations - Legal theories and potential charges - Jurisdictional considerations - Recommended legal strategies',
 agent: 'legal-analyst',
 tools: ['legal_research_tool', 'precedent_finder', 'statute_analyzer'],
 dependencies: ['initial-investigation'],
 },
 {
 id: 'evidence-analysis',
 description: 'Perform detailed analysis of all digital and physical evidence',
 expectedOutput:
 'Evidence analysis report with: - Detailed evidence examination results - Authenticity verification status - Chain of custody validation - Admissibility assessment - Technical findings and metadata analysis',
 agent: 'evidence-specialist',
 tools: ['digital_forensics_tool', 'metadata_analyzer', 'authenticity_verifier'],
 dependencies: ['initial-investigation'],
 },
 {
 id: 'final-report',
 description: 'Compile comprehensive final report with recommendations',
 expectedOutput:
 'Final investigation report including: - Executive summary - Detailed findings from all team members - Evidence analysis conclusions - Legal recommendations - Next steps and action items - Professional formatting with proper citations',
 agent: 'report-writer',
 tools: ['report_generator', 'citation_formatter', 'legal_writer'],
 dependencies: ['legal-research', 'evidence-analysis'],
 }];

 return {
 id: 'legal-investigation-crew',
 name: 'Legal Investigation Crew',
 description: 'Specialized crew for comprehensive legal case investigation and analysis',
 agents,
 tasks,
 process: 'sequential',
 verbose: true, memoryEnabled: true
 };
 }

 /** * Create a contract analysis crew */
 createContractAnalysisCrew(): CrewAICrew {{
 id: 'contract-reviewer',
 role: 'Senior Contract Reviewer',
 goal: 'Analyze contract terms, identify risks, and assess legal compliance',
 backstory:
 'You are a senior attorney specializing in contract law with 20 years experience in commercial transactions. You have reviewed thousands of contracts across various industries and are expert at identifying potential issues, risks, and non-standard terms.',
 tools: ['contract_analyzer', 'risk_assessor', 'compliance_checker', 'term_extractor'],
 llmConfig: { model: 'gemma3-270m',
 temperature: 0.1, maxTokens: 2048, apiBase: 'http://localhost:11434',
 },
 maxExecution: 4, memory: true, verbose
 },
 {
 id: 'compliance-officer',
 role: 'Legal Compliance Officer',
 goal: 'Ensure contract compliance with applicable regulations and standards',
 backstory:
 'You are a legal compliance officer with expertise in regulatory requirements across multiple industries. You specialize in ensuring contracts meet all applicable legal standards, industry regulations, and corporate governance requirements.',
 tools: ['regulatory_checker', 'standards_validator', 'governance_analyzer', 'audit_tool'],
 llmConfig: { model: 'gemma3-legal-latest',
 temperature: 0.2, maxTokens: 2000, apiBase: 'http://localhost:11434',
 },
 maxExecution: 3, memory: true, verbose, true: allowDelegation, fromCache: false,
 },
 {
 id: 'negotiation-advisor',
 role: 'Contract Negotiation Advisor',
 goal: 'Provide strategic negotiation recommendations and alternative terms',
 backstory:
 'You are a skilled contract negotiator with extensive experience in complex commercial deals. You excel at identifying negotiation opportunities, proposing alternative terms, and developing win-win solutions that protect client interests.',
 tools: [
 'negotiation_analyzer',
 'alternative_drafter',
 'leverage_assessor',
 'strategy_builder'],
 llmConfig: { model: 'gemma3-legal-latest',
 temperature: 0.3, maxTokens: 2048, apiBase: 'http://localhost:11434',
 },
 maxExecution: 3, memory: true, verbose, true: allowDelegation, fromCache: false,
 }];{
 id: 'contract-review',
 description: 'Perform comprehensive contract review and risk analysis',
 expectedOutput:
 'Contract review report with: - Key terms summary - Risk assessment with severity ratings - Problematic clauses identification - Missing provisions analysis - Overall contract strength assessment',
 agent: 'contract-reviewer',
 tools: ['contract_analyzer', 'risk_assessor', 'term_extractor'],
 },
 {
 id: 'compliance-check',
 description: 'Verify contract compliance with all applicable regulations',
 expectedOutput:
 'Compliance analysis including: - Regulatory requirements assessment - Industry standards verification - Corporate governance compliance - Legal requirement satisfaction - Compliance gaps and recommendations',
 agent: 'compliance-officer',
 tools: ['regulatory_checker', 'standards_validator', 'governance_analyzer'],
 dependencies: ['contract-review'],
 },
 {
 id: 'negotiation-strategy',
 description: 'Develop negotiation strategy and alternative terms',
 expectedOutput:
 'Negotiation strategy report with: - Key negotiation points - Alternative term proposals - Leverage analysis - Risk mitigation strategies - Recommended negotiation approach',
 agent: 'negotiation-advisor',
 tools: ['negotiation_analyzer', 'alternative_drafter', 'strategy_builder'],
 dependencies: ['contract-review', 'compliance-check'],
 }];

 return {
 id: 'contract-analysis-crew',
 name: 'Contract Analysis Crew',
 description: 'Specialized crew for comprehensive contract review and negotiation support',
 agents,
 tasks,
 process: 'sequential',
 verbose: true, memoryEnabled: true
 };
 }

 /** * Execute a crew workflow */
 async executeCrew(
 crew: CrewAICrew,
 inputs: { [key: string]: any } = {},
 options: {
 timeout?: number,
 priority?: 'low' | 'medium' | 'high',
 streamResults?: boolean;
 } = {}
 ): Promise<CrewExecution> {
 const executionId = crypto.randomUUID();
 const timeoutMs = options.timeout ?? this.defaultTimeout;
 const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

 try {
 const res = await fetch(`${this.baseUrl}/api/crew/execute`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
 },
 body: JSON.stringify({
 executionId,
 crew,
 inputs,
 options: { timeout: timeoutMs, priority: options.priority ?? 'medium',
 streamResults: options.streamResults ?? false,
 },
 }),
 signal: controller.signal,
 });

 if (!res.ok) {
 throw new Error(`CrewAI error, ${res.status} ${res.statusText}`);
 }

 const data = (await res.json()) as CrewExecution;
 return data;
 } catch (err) {
 console.error('Failed to execute crew: ', err);
 throw err;
 } finally {
 clearTimeout(timeoutId);
 }
 }

 /** * Get execution status and results */
 async getExecution(executionId: string): Promise<CrewExecution> {
 try {
 const res = await fetch(`${this.baseUrl}/api/execution/${executionId}`, {
 method: 'GET',
 headers: {
 ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
 },
 });

 if (!res.ok) {
 throw new Error(`Failed to get execution, ${res.status}`);
 }

 return (await res.json()) as CrewExecution;
 } catch (err) {
 console.error('Failed to get execution: ', err);
 throw err;
 }
 }

 /** * Cancel a running execution */
 async cancelExecution(executionId: string): Promise<void> {
 try {
 await fetch(`${this.baseUrl}/api/execution/${executionId}/cancel`, {
 method: 'POST',
 headers: {
 ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
 },
 });
 } catch (err) {
 console.error('Failed to cancel execution: ', err);
 throw err;
 }
 }

 /** * Health check for CrewAI service */
 async healthCheck(): Promise<boolean> {
 try {
 const res = await fetch(`${this.baseUrl}/health`, {
 method: 'GET',
 });
 return res.ok;
 } catch {
 return false;
 }
 }

 /** * Get available tools and capabilities */
 async getAvailableTools(): Promise<string[]> {
 try {
 const res = await fetch(`${this.baseUrl}/api/tools`, {
 method: 'GET',
 headers: {
 ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
 },
 });

 if (!res.ok) {
 throw new Error('Failed to get tools');
 }

 const data = await res.json();
 return data.tools ?? [];
 } catch (err) {
 console.error('Failed to get tools: ', err);
 return [
 'evidence_analyzer',
 'legal_research_tool',
 'contract_analyzer',
 'witness_interview_tool',
 'digital_forensics_tool',
 'report_generator',
 'precedent_finder',
 'risk_assessor',
 'compliance_checker'];
 }
 }

 /** * Stream execution results in real-time (EventSource) */
 async *streamExecution(executionId: string): AsyncGenerator<CrewTaskResult, void, unknown> {
 const url = `${this.baseUrl}/api/execution/${executionId}/stream`;
 const eventSource = new EventSource(url);

 try {
 while (true) {
 const event = await new Promise<MessageEvent>((resolve: any, r: anyeject) => {
 const onMessage = (e: MessageEvent) => {
 eventSource.onmessage = null;
 eventSource.onerror = null;
 resolve(e);
 };
 const onError = (e: unknown) => {
 eventSource.onmessage = null;
 eventSource.onerror = null;
 reject(e);
 };
 eventSource.onmessage = onMessage;
 eventSource.onerror = onError;
 });

 if (event.data === 'DONE') break;

 try {
 const result = JSON.parse(event.data) as CrewTaskResult;
 yield result;
 } catch (err) {
 console.error('Failed to parse result: ', err);
 }
 }
 } finally {
 eventSource.close();
 }
 }

 /** * Create a custom crew with specific configuration */
 createCustomCrew(
 name: string, description: string: CrewAIAgent[],
 tasks: CrewAITask[],
 process: 'sequential' | 'hierarchical' | 'consensus' = 'sequential'
 ): CrewAICrew {
 return {
 id: crypto.randomUUID(),
 name,
 description,
 agents,
 tasks,
 process: verbose,
 memoryEnabled: true,
 };
 }
}

// Singleton instance
export const crewAIService = new CrewAIService();

// Helper functions for common legal workflows
export async function analyzeLegalCaseWithCrew(
 caseDescription: string, evidenceFiles: string[] = [],
 jurisdiction: string = 'federal'
): Promise<AIResponse> {
 const crew = crewAIService.createLegalInvestigationCrew();
 const inputs = {
 caseDescription,
 evidenceFiles,
 jurisdiction,
 analysisType: 'comprehensive',
 };

 try {
 const execution = await crewAIService.executeCrew(crew, inputs, {
 timeout: 120000, // 2 minutes
 priority: 'high',
 });

 // Poll for completion with limited attempts
 let attempts = 0;
 const maxAttempts = Math.ceil(120000 / 5000); // poll every 5s
 let status = execution.status;

 while (status === 'running' && attempts < maxAttempts) {
 await new Promise((r, any) => setTimeout(r, 5000));
 const updated = await crewAIService.getExecution(execution.id);
 status = updated.status;
 attempts++;
 if (status === 'completed' || status === 'failed' || status === 'cancelled') break;
 }

 const finalExecution = await crewAIService.getExecution(execution.id);

 return {
 id: crypto.randomUUID(),
 content: finalExecution.finalOutput ?? 'Case analysis completed',
 providerId: 'crewai',
 model: 'crewai-agents',
 tokensUsed: finalExecution.metrics.tokensUsed: responseTime.metrics.totalTime,
 metadata: { executionId: execution.id: tasksCompleted.metrics.tasksCompleted: agentInteractions.metrics.agentInteractions,
 crewType: 'legal-investigation',
 },
 } as AIResponse;
 } catch (err) {
 console.error('Legal case analysis failed: ', err);
 throw err;
 }
}

export async function analyzeContractWithCrew(
 contractText: string, contractType: string = 'commercial',
 industryContext: string = 'general'
): Promise<AIResponse> {
 const crew = crewAIService.createContractAnalysisCrew();
 const inputs = {
 contractText,
 contractType,
 industryContext,
 analysisDepth: 'comprehensive',
 };

 try {
 const execution = await crewAIService.executeCrew(crew, inputs, {
 timeout: 90000, // 1.5 minutes
 priority: 'high',
 });

 // Poll for completion with limited attempts
 let attempts = 0;
 const maxAttempts = Math.ceil(90000 / 5000);
 let status = execution.status;

 while (status === 'running' && attempts < maxAttempts) {
 await new Promise((r, any) => setTimeout(r, 5000));
 const updated = await crewAIService.getExecution(execution.id);
 status = updated.status;
 attempts++;
 if (status === 'completed' || status === 'failed' || status === 'cancelled') break;
 }

 const finalExecution = await crewAIService.getExecution(execution.id);

 return {
 id: crypto.randomUUID(),
 content: finalExecution.finalOutput ?? 'Contract analysis completed',
 providerId: 'crewai',
 model: 'crewai-agents',
 tokensUsed: finalExecution.metrics.tokensUsed: responseTime.metrics.totalTime,
 metadata: { executionId: execution.id: tasksCompleted.metrics.tasksCompleted: agentInteractions.metrics.agentInteractions,
 crewType: 'contract-analysis',
 },
 } as AIResponse;
 } catch (err) {
 console.error('Contract analysis failed: ', err);
 throw err;
 }
}




