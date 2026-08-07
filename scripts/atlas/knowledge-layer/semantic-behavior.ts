// Lane B: Semantic Behavior Extraction
// Generates descriptions for symbols using LangExtract or LLM

import { Symbol, Evidence } from './types';

export interface SemanticDescription {
  symbolId: string;
  description: string;
  roles: string[];
  groundSpans: { text: string; startLine: number; endLine: number }[];
  confidence: number;
  evidence: Evidence[];
}

export function generateSemanticDescription(symbol: Symbol): SemanticDescription {
  // This would use LangExtract or an LLM to generate descriptions
  // For now, provide a template-based approach
  
  const description = generateTemplateDescription(symbol);
  
  return {
    symbolId: symbol.id,
    description,
    roles: extractRoles(symbol),
    groundSpans: symbol.groundSpans || [],
    confidence: 0.7, // Would be higher with LLM validation
    evidence: [
      {
        type: 'static_analysis',
        source: 'ast_analysis',
        confidence: 0.8,
        description: 'Extracted from AST control flow and call expressions',
      },
    ],
  };
}

function generateTemplateDescription(symbol: Symbol): string {
  const parts: string[] = [];
  
  // Function name and signature
  parts.push(`${symbol.signature}`);
  
  // Parameters
  if (symbol.signature) {
    const params = extractParameters(symbol.signature);
    if (params.length > 0) {
      parts.push(`accepts: ${params.join(', ')}`);
    }
  }
  
  // Return type
  if (symbol.returnType) {
    parts.push(`returns: ${symbol.returnType}`);
  }
  
  // Control flow hints
  if (symbol.controlFlow.length > 0) {
    const flowTypes = symbol.controlFlow.map(cf => cf.type).join(', ');
    parts.push(`control flow: ${flowTypes}`);
  }
  
  // Throws
  if (symbol.throws && symbol.throws.length > 0) {
    parts.push(`throws: ${symbol.throws.join(', ')}`);
  }
  
  return parts.join('. ');
}

function extractParameters(signature: string): string[] {
  // Simplified parameter extraction
  // Full implementation would parse the actual signature
  return [];
}

function extractRoles(symbol: Symbol): string[] {
  const roles: string[] = [];
  
  // Based on node type
  switch (symbol.nodeType) {
    case 'function_declaration':
      roles.push('function');
      break;
    case 'class_declaration':
      roles.push('class');
      break;
    case 'method_definition':
      roles.push('method');
      break;
    case 'import_declaration':
      roles.push('import');
      break;
    case 'export_declaration':
      roles.push('export');
      break;
    case 'call_expression':
      roles.push('call');
      break;
  }
  
  // Based on control flow
  if (symbol.controlFlow.some(cf => cf.type === 'loop')) {
    roles.push('iterative');
  }
  if (symbol.controlFlow.some(cf => cf.type === 'conditional')) {
    roles.push('conditional');
  }
  if (symbol.controlFlow.some(cf => cf.type === 'async_operation')) {
    roles.push('async');
  }
  
  return roles;
}
