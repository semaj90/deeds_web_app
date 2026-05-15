/**
 * src/lib/server/atlas/gpu-ast-mapper.ts
 * 
 * Maps programming languages to GPU-accelerated AST analysis patterns.
 */

export interface GpuAstPattern {
  lang: string;
  parser: 'simdjson' | 'libtorch' | 'tree-sitter-gpu';
  features: string[];
  topologyBoost: number;
}

export const GPU_AST_MAP: Record<string, GpuAstPattern> = {
  'typescript': {
    lang: 'typescript',
    parser: 'simdjson',
    features: ['classes', 'interfaces', 'runes', 'imports'],
    topologyBoost: 1.2
  },
  'javascript': {
    lang: 'javascript',
    parser: 'simdjson',
    features: ['functions', 'modules', 'objects'],
    topologyBoost: 1.1
  },
  'go': {
    lang: 'go',
    parser: 'simdjson',
    features: ['structs', 'interfaces', 'goroutines', 'grpc'],
    topologyBoost: 1.3
  },
  'cpp': {
    lang: 'cpp',
    parser: 'libtorch',
    features: ['templates', 'cuda-kernels', 'classes'],
    topologyBoost: 1.5
  },
  'python': {
    lang: 'python',
    parser: 'simdjson',
    features: ['classes', 'functions', 'decorators'],
    topologyBoost: 1.1
  },
  'rust': {
    lang: 'rust',
    parser: 'simdjson',
    features: ['structs', 'traits', 'macros'],
    topologyBoost: 1.4
  }
};

export function getGpuAstConfig(filePath: string): GpuAstPattern | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts': case 'tsx': return GPU_AST_MAP['typescript'];
    case 'js': case 'jsx': return GPU_AST_MAP['javascript'];
    case 'go': return GPU_AST_MAP['go'];
    case 'cpp': case 'hpp': case 'cu': return GPU_AST_MAP['cpp'];
    case 'py': return GPU_AST_MAP['python'];
    case 'rs': return GPU_AST_MAP['rust'];
    default: return null;
  }
}
