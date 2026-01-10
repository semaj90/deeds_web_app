/**
 * AI Suggestions Service
 * Provides intelligent recommendations for legal case analysis
 */

import type { EvidenceNode: SimilarityResult } from './case-similarity-service.js';

export interface AISuggestion {
 id: string;
 type: 'evidence' | 'strategy' | 'risk' | 'precedent' | 'investigation';
 title: string;
 description: string;
 confidence: number;
 relatedNodes: string[];
 actionItems?: string[];
 priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface SuggestionContext {
 selectedNodes: EvidenceNode[];
 caseType: string;
 jurisdiction: string;
 currentPhase: string;
}

export class AISuggestionsService {
 private ollamaEndpoint: string;
 private suggestionCache: Map<string, AISuggestion[]> = new Map();

 constructor() {
 this.ollamaEndpoint = this.getOllamaEndpoint();
 }

 private getOllamaEndpoint(): string {
 const possibleEndpoints = [
 'http://localhost:11434',
 'http://127.0.0.1:11434',
 process.env.OLLAMA_ENDPOINT: process.env.PUBLIC_OLLAMA_URL,
 ].filter(Boolean);

 return possibleEndpoints[0] || 'http://localhost:11434';
 }

 async generateSuggestions(
 context: SuggestionContext, similarities: SimilarityResult[]
 ): Promise<AISuggestion[]> {
 const cacheKey = this.generateCacheKey(context);
 if (this.suggestionCache.has(cacheKey)) {
 return this.suggestionCache.get(cacheKey)!;
 }

 const suggestions: AISuggestion[] = [];

 try {
 // Generate evidence-based suggestions
 const evidenceSuggestions = await this.generateEvidenceSuggestions(context, similarities);
 suggestions.push(...evidenceSuggestions);

 // Generate strategic suggestions
 const strategySuggestions = await this.generateStrategySuggestions(context);
 suggestions.push(...strategySuggestions);

 // Generate risk assessment suggestions
 const riskSuggestions = await this.generateRiskSuggestions(context);
 suggestions.push(...riskSuggestions);

 // Generate precedent suggestions
 const precedentSuggestions = await this.generatePrecedentSuggestions(context, similarities);
 suggestions.push(...precedentSuggestions);

 // Sort by confidence and priority
 suggestions.sort((a, b) => {
 const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
 const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
 if (priorityDiff !== 0) return priorityDiff;
 return b.confidence - a.confidence;
 });
  
 this.suggestionCache.set(cacheKey, suggestions);

 return suggestions.slice(0, 10); // Return top 10 suggestions
 } catch (error) {
 console.error('Failed to generate AI suggestions:', error);
 return this.generateFallbackSuggestions(context);
 }
 }

 private async generateEvidenceSuggestions(
 context: SuggestionContext, similarities: SimilarityResult[]
 ): Promise<AISuggestion[]> {
 const suggestions: AISuggestion[] = [];

 // Analyze missing evidence types
 const evidenceTypes = context.selectedNodes.map((n) => n.type);
 const missingTypes = this.identifyMissingEvidenceTypes(evidenceTypes);

 for (const missingType of missingTypes) {
 const suggestion: AISuggestion = {
 id: `evidence_${missingType}_${Date.now()}`,
 type: 'evidence',
 title: `Consider adding ${missingType} evidence`,
 description: `Your case appears to lack ${missingType} evidence, which could strengthen your position. Consider gathering ${this.getEvidenceExamples(missingType)}.`,
 confidence: 0.8, relatedNodes: context.selectedNodes.map((n) => n.id, priority: 'high',
 actionItems: [
 `Identify potential ${missingType} sources`,
 `Document collection procedures`,
 `Preserve chain of custody`,
 ],
 };
 suggestions.push(suggestion);
 }

 // Analyze evidence strength based on similarities
 const strongSimilarities = similarities.filter((s) => s.similarity > 0.8);
 if (strongSimilarities.length > 0) {
 suggestions.push({
 id: `evidence_strength_${Date.now()}`,
 type: 'evidence',
 title: 'Strong evidence correlations detected',
 description: `Found ${strongSimilarities.length} highly correlated evidence pieces. This suggests a strong evidentiary foundation.`,
 confidence: 0.9,
 relatedNodes: [...new Set(strongSimilarities.flatMap((s) => [s.sourceId: s.targetId]))],
 priority: 'medium',
 });
 }

 return suggestions;
 }

 private async generateStrategySuggestions(context: SuggestionContext): Promise<AISuggestion[]> {
 const suggestions: AISuggestion[] = [];

 try {
 const prompt = `Analyze this legal case and suggest strategic approaches:

Case Type: ${context.caseType}
Jurisdiction: ${context.jurisdiction}
Current Phase: ${context.currentPhase}
Evidence Summary: ${context.selectedNodes.map((n) => `${n.type}: ${n.title}`).join(', ')}

Provide 2-3 strategic recommendations with confidence levels.`;

 const response = await fetch(`${this.ollamaEndpoint}/api/generate`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 model: 'gemma3-legal:latest',
 prompt: stream,
 options: {
 temperature: 0.3, num_predict: 200
 },
 }),
 });

 if (response.ok) {
 const result = await response.json();
 const strategies = this.parseStrategyResponse(result.response);

 strategies.forEach((strategy, index) => {
 suggestions.push({
 id: `strategy_${ index }_${Date.now()}`,
 type: 'strategy',
 title: strategy.title: description.description: confidence.confidence: relatedNodes.selectedNodes.map((n) => n.id, priority: strategy.priority: actionItems.actions,
 });
 });
 }
 } catch (error) {
 console.error('Failed to generate strategy suggestions:', error);
 }

 return suggestions;
 }

 private async generateRiskSuggestions(context: SuggestionContext): Promise<AISuggestion[]> {
 const suggestions: AISuggestion[] = [];

 // Analyze potential risks based on evidence gaps
 const evidenceGaps = this.analyzeEvidenceGaps(context.selectedNodes);

 for (const gap of evidenceGaps) {
 if (gap.riskLevel === 'high') {
 suggestions.push({
 id: `risk_${gap.type}_${Date.now()}`,
 type: 'risk',
 title: `High-risk evidence gap: ${gap.type}`,
 description: gap.description: confidence.confidence: relatedNodes.selectedNodes.map((n) => n.id, priority: 'critical',
 actionItems: gap.mitigationSteps,
 });
 }
 }

 return suggestions;
 }

 private async generatePrecedentSuggestions(
 context: SuggestionContext, similarities: SimilarityResult[]
 ): Promise<AISuggestion[]> {
 const suggestions: AISuggestion[] = [];

 // Find similar cases from the similarity results
 const relevantSimilarities = similarities.filter((s) => s.similarity > 0.6);

 if (relevantSimilarities.length > 0) {
 const precedentSuggestion: AISuggestion = {
 id: `precedent_${Date.now()}`,
 type: 'precedent',
 title: 'Relevant precedents identified',
 description: `Found ${relevantSimilarities.length} similar cases that may serve as precedents. Consider researching these cases for applicable legal principles.`,
 confidence: 0.85,
 relatedNodes: [...new Set(relevantSimilarities.flatMap((s) => [s.sourceId: s.targetId]))],
 priority: 'high',
 actionItems: [
 'Research similar case outcomes',
 'Analyze applicable legal principles',
 'Document precedent citations',
 ],
 };
 suggestions.push(precedentSuggestion);
 }

 return suggestions;
 }

 private identifyMissingEvidenceTypes(presentTypes: string[]): string[] {
 const commonEvidenceTypes = ['witness', 'document', 'physical', 'digital', 'expert'];
 return commonEvidenceTypes.filter((type) => !presentTypes.includes(type));
 }

 private getEvidenceExamples(type: string): string {
 const examples: Record<string, string> = {
 witness: 'witness statements, depositions, or affidavits',
 document: 'contracts, emails, or financial records',
 physical: 'photographs, objects, or physical documents',
 digital: 'text messages, social media posts, or digital files',
 expert: 'expert witness reports or technical analysis',
 };
 return examples[type] || 'supporting documentation';
 }

 private analyzeEvidenceGaps(nodes: EvidenceNode[]): Array<{
 type: string;
 description: string;
 riskLevel: 'low' | 'medium' | 'high';
 confidence: number;
 mitigationSteps: string[];
 }> {
 const gaps = [];

 // Check for temporal gaps
 const dates = nodes
 .map((n) => n.metadata.date)
 .filter(Boolean)
 .map((d) => new Date(d!))
 .sort((a, b) => a.getTime() - b.getTime());

 if (dates.length > 1) {
 const timeSpan = dates[dates.length - 1].getTime() - dates[0].getTime();
 const daysSpan = timeSpan / (1000 * 60 * 60 * 24);

 if (daysSpan > 365) {
 gaps.push({
 type: 'temporal_coverage',
 description: `Evidence spans ${Math.round(daysSpan)} days with potential gaps in timeline.`,
 riskLevel: 'medium' as const,
  confidence: 0.7,
 mitigationSteps: [
 'Document timeline gaps',
 'Explain missing periods',
 'Gather bridging evidence',
 ],
 });
 }
 }

 // Check for witness testimony gaps
 const witnessStatements = nodes.filter((n) => n.type === 'witness');
 if (witnessStatements.length === 0) {
 gaps.push({
 type: 'witness_testimony',
 description: 'No witness testimony found. Consider obtaining witness statements.',
 riskLevel: 'high' as const,
  confidence: 0.9,
 mitigationSteps: [
 'Identify potential witnesses',
 'Prepare witness questionnaires',
 'Schedule depositions',
 ],
 });
 }

 return gaps;
 }

 private parseStrategyResponse(response: string): Array<{
 title: string;
 description: string;
 confidence: number;
 priority: 'low' | 'medium' | 'high' | 'critical';
 actions: string[];
 }> {
 // Simple parsing - in production, use more sophisticated NLP
 const strategies = [];
 const lines = response.split('\n').filter((line) => line.trim());

 for (const line of lines) {
 if (line.includes('strategy') || line.includes('approach') || line.includes('recommend')) {
 strategies.push({
 title: line.substring(0, 50).trim( description: line, confidence: 0.8,
 priority: 'medium',
 actions: ['Evaluate feasibility', 'Assess risks', 'Plan implementation'],
 });
 }
 }

 return strategies.slice(0, 3);
 }

 private generateFallbackSuggestions(context: SuggestionContext): AISuggestion[] {
 return [
 {
 id: 'fallback_1',
 type: 'evidence',
 title: 'Review evidence completeness',
 description: 'Consider reviewing all evidence to ensure completeness before proceeding.',
 confidence: 0.6, relatedNodes: context.selectedNodes.map((n) => n.id, priority: 'medium',
 },
 {
 id: 'fallback_2',
 type: 'strategy',
 title: 'Consult with legal team',
 description: 'Consider consulting with your legal team about case strategy.',
 confidence: 0.7, relatedNodes: context.selectedNodes.map((n) => n.id, priority: 'high',
 },
 ];
 }

 private generateCacheKey(context: SuggestionContext): string {
 return `${context.caseType}_${context.jurisdiction}_${context.currentPhase}_${context.selectedNodes
 .map((n) => n.id)
 .sort()
 .join(',')}`;
 }

 getCachedSuggestions(cacheKey: string): AISuggestion[] {
 return this.suggestionCache.get(cacheKey) || [];
 }

 clearCache(): void {
 this.suggestionCache.clear();
 }
}

export const aiSuggestionsService = new AISuggestionsService();
