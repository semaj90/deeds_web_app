// Functional Graph Construction
// Creates edges between symbols: CALLS, IMPORTS, WRITES_TABLE, READS_TABLE, etc.

import { Symbol, SymbolEdge, EdgeType } from './types';

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  evidenceStrength: number;
  confidence: number;
}

export function buildFunctionalGraph(symbols: Symbol[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  
  // Build symbol lookup
  const symbolMap = new Map<string, Symbol>();
  for (const symbol of symbols) {
    symbolMap.set(symbol.id, symbol);
  }
  
  // Extract edges from control flow
  for (const symbol of symbols) {
    // CALLS edges from call expressions
    for (const callExpr of symbol.callExpressions) {
      const calleeSymbol = symbolMap.get(`call_${callExpr.callee}`);
      if (calleeSymbol) {
        edges.push({
          from: symbol.id,
          to: calleeSymbol.id,
          type: EdgeType.CALLS,
          evidenceStrength: 0.9,
          confidence: 1.0,
        });
      }
    }
    
    // WRITES_TABLE / READS_TABLE from db calls
    for (const dbCall of symbol.dbCalls || []) {
      const tableSymbol = symbolMap.get(`table_${dbCall.split('.')[0]}`);
      if (tableSymbol) {
        edges.push({
          from: symbol.id,
          to: tableSymbol.id,
          type: dbCall.includes('write') ? EdgeType.WRITES_TABLE : EdgeType.READS_TABLE,
          evidenceStrength: 0.8,
          confidence: 0.9,
        });
      }
    }
    
    // PUBLISHES_EVENT / CONSUMES_EVENT from side effects
    for (const sideEffect of symbol.sideEffects) {
      if (sideEffect.type === 'async_operation') {
        // Will be resolved during runtime evidence collection
      }
    }
  }
  
  return edges;
}

export function analyzeImpact(targetSymbolId: string, edges: GraphEdge[]): {
  directCallers: string[];
  indirectCallers: string[];
  affectedModules: string[];
  blastRadius: number;
} {
  const impact = {
    directCallers: [],
    indirectCallers: [],
    affectedModules: [],
    blastRadius: 0,
  };
  
  // Build adjacency list
  const callers = new Map<string, string[]>();
  const callees = new Map<string, string[]>();
  
  for (const edge of edges) {
    if (!callers.has(edge.from)) callers.set(edge.from, []);
    if (!callees.has(edge.to)) callees.set(edge.to, []);
    
    callers.get(edge.from)!.push(edge.to);
    callees.get(edge.to)!.push(edge.from);
  }
  
  // BFS from target
  const visited = new Set<string>();
  const queue: string[] = [targetSymbolId];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    if (visited.has(current)) continue;
    visited.add(current);
    
    // Get all callers
    const incoming = callees.get(current) || [];
    for (const caller of incoming) {
      if (caller !== targetSymbolId) {
        impact.directCallers.push(caller);
        
        // Continue BFS for indirect callers
        const callerCallers = callers.get(caller) || [];
        for (const indirect of callerCallers) {
          if (!visited.has(indirect)) {
            impact.indirectCallers.push(indirect);
            queue.push(indirect);
          }
        }
      }
    }
  }
  
  impact.blastRadius = impact.directCallers.length + impact.indirectCallers.length;
  impact.affectedModules = [...new Set([...impact.directCallers, ...impact.indirectCallers])];
  
  return impact;
}

export function getSymbolDependencies(symbolId: string, edges: GraphEdge[]): string[] {
  const dependencies = new Set<string>();
  
  for (const edge of edges) {
    if (edge.from === symbolId) {
      dependencies.add(edge.to);
    }
  }
  
  return [...dependencies];
}

export function getSymbolDependents(symbolId: string, edges: GraphEdge[]): string[] {
  const dependents = new Set<string>();
  
  for (const edge of edges) {
    if (edge.to === symbolId) {
      dependents.add(edge.from);
    }
  }
  
  return [...dependents];
}
