// Lane E: Runtime Evidence Collection
// Connects traces, logs, tests to symbol identity

import { RuntimeEvidence, SymbolMetrics, Evidence } from './types';

export interface TraceData {
  traceId: string;
  symbolId: string;
  timestamp: string;
  type: 'latency' | 'memory' | 'timeout' | 'error' | 'fallback';
  metric: number;
  unit: string;
  context: {
    inputShape: any;
    environment: string;
    version: string;
  };
}

export function collectRuntimeEvidence(traces: TraceData[]): RuntimeEvidence[] {
  return traces.map(trace => ({
    symbolId: trace.symbolId,
    traceId: trace.traceId,
    timestamp: trace.timestamp,
    type: trace.type,
    metric: trace.metric,
    unit: trace.unit,
    context: trace.context,
  }));
}

export function aggregateSymbolMetrics(symbols: Map<string, RuntimeEvidence[]>): SymbolMetrics[] {
  return [...symbols.entries()].map(([symbolId, evidences]) => {
    if (evidences.length === 0) {
      return {
        symbolId,
        avgLatency: 0,
        p99Latency: 0,
        errorRate: 0,
        timeoutFrequency: 0,
        fallbackFrequency: 0,
        testCoverage: 0,
        lastExecuted: new Date().toISOString(),
      };
    }
    
    const latencies = evidences
      .filter(e => e.type === 'latency')
      .map(e => e.metric);
    
    const errors = evidences.filter(e => e.type === 'error');
    const timeouts = evidences.filter(e => e.type === 'timeout');
    const fallbacks = evidences.filter(e => e.type === 'fallback');
    
    return {
      symbolId,
      avgLatency: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      p99Latency: latencies.length > 0 ? latencies.sort((a, b) => a - b)[latencies.length - 1] : 0,
      errorRate: errors.length / evidences.length,
      timeoutFrequency: timeouts.length / evidences.length,
      fallbackFrequency: fallbacks.length / evidences.length,
      testCoverage: 0, // Would be calculated from test references
      lastExecuted: new Date().toISOString(),
    };
  });
}

export function getSymbolEvidence(symbolId: string, evidences: RuntimeEvidence[]): Evidence[] {
  return evidences
    .filter(e => e.symbolId === symbolId)
    .map(e => ({
      type: 'runtime',
      source: `trace_${e.traceId}`,
      confidence: calculateEvidenceConfidence(e),
      description: `${e.type}: ${e.metric} ${e.unit}`,
    }));
}

function calculateEvidenceConfidence(e: RuntimeEvidence): number {
  let confidence = 0.5;
  
  // Higher confidence for more recent evidence
  const now = new Date();
  const evidenceTime = new Date(e.timestamp);
  const ageHours = (now.getTime() - evidenceTime.getTime()) / (1000 * 60 * 60);
  
  if (ageHours < 1) confidence += 0.2;
  else if (ageHours < 24) confidence += 0.1;
  else if (ageHours < 168) confidence += 0.05; // 1 week
  
  // Higher confidence for more data points
  const similarEvidence = evidences.filter(e2 => e2.symbolId === e.symbolId && e2.type === e.type).length;
  confidence += Math.min(0.1, similarEvidence * 0.01);
  
  return Math.min(1.0, confidence);
}
