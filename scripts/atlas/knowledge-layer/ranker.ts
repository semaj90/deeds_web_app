// Lane F: Ranker
// Ranks symbols based on impact, confidence, evidence, failure, cost, blast radius

import { PatchCandidate, scoreCandidate, Symbol } from './types';
import { analyzeImpact } from './graph-construction';

export interface RankerInput {
  symbols: Symbol[];
  edges: { from: string; to: string; type: string; evidenceStrength: number; confidence: number }[];
  metrics: Map<string, { avgLatency: number; errorRate: number; timeoutFrequency: number; fallbackFrequency: number }>;
  query: {
    impact?: number;
    confidence?: number;
    evidenceStrength?: number;
    failureSeverity?: number;
    implementationCost?: number;
    blastRadius?: number;
  };
}

export interface RankedResult {
  candidates: PatchCandidate[];
  rankedBy: string[];
  totalScore: number;
}

export function rankSymbols(input: RankerInput): RankedResult {
  const candidates: PatchCandidate[] = [];
  
  for (const symbol of input.symbols) {
    // Calculate impact from graph
    const impact = analyzeImpact(symbol.id, input.edges);
    
    // Get runtime metrics
    const metrics = input.metrics.get(symbol.id) || {
      avgLatency: 0,
      errorRate: 0,
      timeoutFrequency: 0,
      fallbackFrequency: 0,
    };
    
    // Build candidate
    const candidate: PatchCandidate = {
      symbolId: symbol.id,
      impact: input.query.impact || impact.blastRadius,
      confidence: input.query.confidence || 0.7,
      evidenceStrength: input.query.evidenceStrength || 0.6,
      failureSeverity: input.query.failureSeverity || 1,
      failureFrequency: metrics.errorRate + metrics.timeoutFrequency + metrics.fallbackFrequency,
      implementationCost: input.query.implementationCost || 1,
      blastRadius: impact.blastRadius,
      score: 0, // Will be calculated
    };
    
    candidates.push(candidate);
  }
  
  // Score each candidate
  for (const candidate of candidates) {
    candidate.score = scoreCandidate(candidate);
  }
  
  // Sort by score (descending)
  candidates.sort((a, b) => b.score - a.score);
  
  // Apply hard exclusions
  const excludedIds = new Set([
    ...getGeneratedFiles(input.symbols),
    ...getVendoredDependencies(input.symbols),
    ...getLowConfidenceSymbols(input.symbols, 0.3),
    ...getStaleRevisions(input.symbols, 90),
  ]);
  
  const filtered = candidates.filter(c => !excludedIds.has(c.symbolId));
  
  return {
    candidates: filtered,
    rankedBy: ['impact', 'confidence', 'evidence', 'failure', 'cost', 'blastRadius'],
    totalScore: filtered.reduce((sum, c) => sum + c.score, 0),
  };
}

function getGeneratedFiles(symbols: Symbol[]): string[] {
  return symbols
    .filter(s => s.id.includes('node_modules') || s.id.includes('dist') || s.id.includes('__generated'))
    .map(s => s.id);
}

function getVendoredDependencies(symbols: Symbol[]): string[] {
  return symbols
    .filter(s => s.id.includes('lodash') || s.id.includes('axios') || s.id.includes('moment'))
    .map(s => s.id);
}

function getLowConfidenceSymbols(symbols: Symbol[], threshold: number): string[] {
  return symbols
    .filter(s => s.confidence < threshold)
    .map(s => s.id);
}

function getStaleRevisions(symbols: Symbol[], days: number): string[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  return symbols
    .filter(s => new Date(s.updated_at) < cutoff)
    .map(s => s.id);
}
