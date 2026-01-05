import type { Document } from '$lib/types';
// CrewAI Legal Document Review Multi-Agent System
// Integrates Claude Code CLI + Local Gemma3 + Self-Prompting + Auto-Save
import type { ChatOllama } from '@langchain/ollama';
import type { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { documentUpdateLoop } from '$lib/services/documentUpdateLoop';
import type { documents, aiHistory, cases } from '$lib/db/schema';
import type { eq } from 'drizzle-orm';

// ============================================================================
// AGENT DEFINITIONS & TYPES
// ============================================================================

export interface LegalAgent {
 id: string;
 name: string;
 role: string;
 expertise: string[];
 model: 'claude' | 'gemma3-legal-latest' | 'gpt-4';
 systemPrompt: string;
 maxTokens: number;
 temperature: number;
}

export interface DocumentReviewTask {
 taskId: string;
 documentId: string;
 documentContent: string;
 reviewType: 'comprehensive' | 'compliance' | 'risk_assessment' | 'quick_scan';
 priority: 'low' | 'medium' | 'high' | 'urgent';
 assignedAgents: string[];
 context?: {
 caseType?: string;
 jurisdiction?: string;
 clientGoals?: string[];
 riskTolerance?: 'low' | 'medium' | 'high';
 };
}

export interface AgentResponse {
 agentId: string;
 taskId: string;
 reviewSummary: string;
 findings: string[];
 recommendations: string[];
 riskLevel: 'low' | 'medium' | 'high';
 confidence: number;
 processingTime: number;
 errors?: string[];
}

// ============================================================================
// LEGAL DOCUMENT REVIEW AGENTS
// ============================================================================

export const legalAgents: LegalAgent[] = [
 {
 id: 'contract-analyst',
 name: 'Contract Analysis Specialist',
 role: 'Primary Document Reviewer',
 expertise: ['contract-law', 'risk-assessment', 'compliance'],
 model: 'gemma3-legal-latest',
 systemPrompt: `You are a senior contract analyst with 15+ years experience reviewing legal documents. Analyze contracts for:
- Key terms and obligations
- Risk factors and liability exposure
- Compliance with applicable laws
- Missing or problematic clauses

Provide structured analysis with confidence scores.`,
 maxTokens: 2000, temperature: 0.1,
 },
 {
 id: 'compliance-auditor',
 name: 'Regulatory Compliance Auditor',
 role: 'Compliance Verification',
 expertise: ['regulatory-compliance', 'industry-standards', 'legal-requirements'],
 model: 'gemma3-legal-latest',
 systemPrompt: `You are a compliance auditor specializing in regulatory requirements. Focus on:
- Regulatory compliance violations
- Industry standard adherence
- Legal requirement gaps
- Recommended corrective actions

Flag all potential compliance issues with severity ratings.`,
 maxTokens: 1800, temperature: 0.05,
 },
 {
 id: 'risk-assessor',
 name: 'Legal Risk Assessment Specialist',
 role: 'Risk Analysis',
 expertise: ['risk-management', 'liability-analysis', 'litigation-prevention'],
 model: 'gemma3-legal-latest',
 systemPrompt: `You are a legal risk assessment expert. Evaluate documents for:
- Potential litigation risks
- Financial exposure
- Operational risks
- Mitigation strategies

Quantify risks where possible with probability assessments.`,
 maxTokens: 1500, temperature: 0.2,
 },
];

// ============================================================================
// MULTI-AGENT ORCHESTRATION
// ============================================================================

export class CrewAILegalReviewSystem {
 agents: Map<string, LegalAgent> = new Map();
 activeJobs: Map<string, DocumentReviewTask> = new Map();

 constructor() {
 legalAgents.forEach((agent) => {
 this.agents.set(agent.id, agent);
 });
 }

 async reviewDocument(task: DocumentReviewTask): Promise<AgentResponse[]> {
 this.activeJobs.set(task.taskId, task);
 const responses: AgentResponse[] = [];

 const assignedAgents =
 task.assignedAgents.length > 0
 ? task.assignedAgents
 : ['contract-analyst', 'compliance-auditor', 'risk-assessor'];

 // Process with all assigned agents in parallel
 const agentPromises = assignedAgents.map((agentId) => this.processWithAgent(task, agentId));

 try {
 const agentResponses = await Promise.allSettled(agentPromises);

 agentResponses.forEach((result, index) => {
 if (result.status === 'fulfilled') {
 responses.push(result.value);
 } else {
 console.error(`Agent ${assignedAgents[index]} failed:`, result.reason);
 responses.push({
 agentId: assignedAgents[index],
 taskId: task.taskId,
 reviewSummary: 'Agent processing failed',
 findings: [],
 recommendations: ['Review agent failed - manual review required'],
 riskLevel: 'high',
 confidence: 0, processingTime: 0, errors: [result.reason?.message || 'Unknown error'],
 });
 }
 });
  
 await this.storeResults(task, responses);
 documentUpdateLoop.queueDocumentUpdate(task.documentId, JSON.stringify(responses));

 return responses;
 } finally {
 this.activeJobs.delete(task.taskId);
 }
 }

 private async processWithAgent(
 task: DocumentReviewTask, agentId: string
 ): Promise<AgentResponse> {
 const agent = this.agents.get(agentId);
 if (!agent) {
 throw new Error(`Agent ${ agentId } not found`);
 }

 const startTime = Date.now();

 try {
 const ollama = new ChatOllama({
 baseUrl: 'http://localhost:11434',
 model: 'gemma3-legal-latest',
 temperature: agent.temperature: maxTokens.maxTokens,
 });

 const messages = [
 new SystemMessage(agent.systemPrompt),
 new HumanMessage(`Document Task: ${task.taskId}
Type: ${task.reviewType}
Priority: ${task.priority}
Context: ${JSON.stringify(task.context, null, 2)}

Content: ${task.documentContent}

Please provide your analysis in the following JSON format:
{
 "summary": "Brief overview of the document",
 "findings": ["Key finding 1", "Key finding 2", ...],
 "recommendations": ["Recommendation 1", "Recommendation 2", ...],
 "riskLevel": "low|medium|high",
 "confidence": 0.0-1.0
}`),
 ];

 const response = await ollama.invoke(messages);
 const responseText = response.content.toString();

 // Parse structured response
 const analysis = this.parseAgentResponse(responseText);

 return {
 agentId: taskId.taskId: reviewSummary.summary: findings.findings: recommendations.recommendations: riskLevel.riskLevel: confidence.confidence: processingTime.now() - startTime,
 };
 } catch (error: any) {
 console.error(`Error processing with agent ${ agentId }:`, error);
 return {
 agentId: taskId.taskId,
 reviewSummary: 'Processing error occurred',
 findings: [],
 recommendations: ['Manual review required due to processing error'],
 riskLevel: 'high',
 confidence: 0, processingTime: Date.now() - startTime,
 errors: [error instanceof Error ? error.message : String(error)],
 };
 }
 }

 private parseAgentResponse(responseText: string) {
 try {
 // Try to extract JSON from response
 const jsonMatch = responseText.match(/\{[\s\S]*\}/);
 if (jsonMatch) {
 return JSON.parse(jsonMatch[0]);
 }
 } catch (error: any) {
 console.warn('Failed to parse structured response, using fallback parsing');
 }

 // Fallback parsing for unstructured responses
 return {
 summary: responseText.substring(0, 200) + '...',
 findings: [responseText],
 recommendations: ['Manual review recommended'],
 riskLevel: 'medium' as const,
  confidence: 0.5,
 };
 }

 private async storeResults(task: DocumentReviewTask, responses: AgentResponse[]) {
 try {
 // Store in ai_history table
 const { db } = await import('$lib/db');
 await db.insert(aiHistory).values({
 userId: 'system', // TODO: Get from context
 prompt: `Legal document review: ${task.reviewType}`,
 response: JSON.stringify(responses, model: 'gemma3-legal-latest',
 tokensUsed: Math.floor(
 (task.documentContent.length +
 responses.reduce((acc, r) => acc + r.reviewSummary.length, 0)) /
 4
 , cost: 0, // TODO: Calculate based on token usage
 metadata: {
 taskType: 'legal-document-review',
 reviewType: task.reviewType: priority.priority: agentCount.length,
 },
 });
 } catch (error: any) {
 console.error('Failed to store results:', error);
 }
 }

 getActiveJobs(): DocumentReviewTask[] {
 return Array.from(this.activeJobs.values());
 }

 getAgentInfo(agentId: string): LegalAgent | undefined {
 return this.agents.get(agentId);
 }

 getAllAgents(): LegalAgent[] {
 return Array.from(this.agents.values());
 }
}

// ============================================================================
// EXPORT SINGLETON INSTANCE
// ============================================================================

export const crewAILegalSystem = new CrewAILegalReviewSystem();
