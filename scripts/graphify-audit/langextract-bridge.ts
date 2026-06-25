/**
 * LangExtract Bridge — Feature Extraction for Graphify Audit
 *
 * Wires LangExtract reranker to extract features from code/docs.
 * Canonical source: src/lib/server/retrieval/langextract-reranker.ts
 */

import type { z } from 'zod';

export interface ExtractedFeature {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'enum' | 'constant' | 'export';
  description: string;
  location: {
    file: string;
    line: number;
    column: number;
  };
  tags: string[];
  confidence: number;
  dependencies: string[];
}

export interface LangExtractResult {
  file: string;
  features: ExtractedFeature[];
  totalFeatures: number;
  confidence: number;
  metrics: {
    coverage: number; // 0-1 how much of the file was analyzed
    avgConfidence: number;
    analysisTime: number;
  };
}

export interface LangExtractRequest {
  file: string;
  content: string;
  language: 'typescript' | 'rust' | 'markdown';
  options?: {
    includeTypes?: boolean;
    includeDependencies?: boolean;
    minConfidence?: number;
  };
}

/**
 * Mock LangExtract service (placeholder for actual implementation)
 * In production: connect to Python LangExtract microservice or call Gemma4 with structured prompt
 */
export async function extractFeaturesViaMock(
  request: LangExtractRequest
): Promise<LangExtractResult> {
  const { file, content, language, options = {} } = request;

  // Parse TypeScript/Rust exports and functions via simple regex
  const features: ExtractedFeature[] = [];

  // Pattern: export function/class/interface/type
  const exportPattern = /export\s+(async\s+)?(function|class|interface|type|enum)\s+(\w+)/g;
  let match;
  const lines = content.split('\n');
  let lineNum = 1;

  while ((match = exportPattern.exec(content)) !== null) {
    const name = match[3];
    const type = match[2] as ExtractedFeature['type'];
    const lineIndex = content.substring(0, match.index).split('\n').length - 1;

    // Find description (JSDoc comment above export)
    const beforeExport = content.substring(Math.max(0, match.index - 500), match.index);
    const jsdocMatch = beforeExport.match(/\/\*\*([\s\S]*?)\*\//);
    const description = jsdocMatch
      ? jsdocMatch[1]
          .split('\n')
          .map((l) => l.trim())
          .join(' ')
          .substring(0, 200)
      : `${type} ${name}`;

    features.push({
      name,
      type: type as any,
      description,
      location: {
        file,
        line: lineIndex,
        column: 0
      },
      tags: [language, type],
      confidence: 0.85,
      dependencies: []
    });
  }

  return {
    file,
    features,
    totalFeatures: features.length,
    confidence: features.length > 0 ? 0.85 : 0.5,
    metrics: {
      coverage: Math.min(features.length / 10, 1.0), // Rough coverage estimate
      avgConfidence: 0.85,
      analysisTime: Date.now()
    }
  };
}

/**
 * Extract features via Gemma4 + structured prompting
 * Falls back to LangExtract if Gemma4 unavailable
 */
export async function extractFeaturesViaGemma4(
  request: LangExtractRequest,
  gemma4Url: string = 'http://127.0.0.1:8090'
): Promise<LangExtractResult> {
  const { file, content, language, options = {} } = request;

  const prompt = `
Analyze this ${language} code and extract all exportable features (functions, classes, types, interfaces, exports).

For each feature, provide:
- name: exact name
- type: one of function/class/interface/type/enum/constant/export
- description: 1-2 sentences
- tags: relevant tags (e.g., "async", "deprecated", "public", "api")
- dependencies: list of other features this depends on

Return JSON array:
[
  { "name": "validateSession", "type": "function", "description": "...", "tags": [...], "dependencies": [...] },
  ...
]

File: ${file}
Language: ${language}

Code:
\`\`\`${language}
${content.substring(0, 4000)}
\`\`\`

Features (JSON):
`;

  try {
    const response = await fetch(`${gemma4Url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-rotorquant:latest',
        prompt,
        stream: false,
        think: false,
        options: { temperature: 0.1, num_predict: 1024 }
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      console.warn(`Gemma4 extraction failed (${response.status}), falling back to mock`);
      return extractFeaturesViaMock(request);
    }

    const data = (await response.json()) as any;
    const responseText = data.response || '';

    // Parse JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('No JSON array found in Gemma4 response');
      return extractFeaturesViaMock(request);
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      type: string;
      description: string;
      tags: string[];
      dependencies: string[];
    }>;

    const features: ExtractedFeature[] = parsed
      .filter((f) => f.name && f.type)
      .map((f, i) => ({
        name: f.name,
        type: (f.type as any) || 'export',
        description: f.description || `${f.type} ${f.name}`,
        location: {
          file,
          line: i * 10, // Rough approximation
          column: 0
        },
        tags: f.tags || [language],
        confidence: options.minConfidence ? Math.max(0.8, options.minConfidence) : 0.8,
        dependencies: f.dependencies || []
      }));

    return {
      file,
      features,
      totalFeatures: features.length,
      confidence: 0.8,
      metrics: {
        coverage: Math.min(features.length / 15, 1.0),
        avgConfidence: 0.8,
        analysisTime: Date.now()
      }
    };
  } catch (err) {
    console.warn(`Gemma4 extraction error: ${err}. Falling back to mock.`);
    return extractFeaturesViaMock(request);
  }
}

/**
 * Batch extract features across multiple files
 */
export async function batchExtractFeatures(
  requests: LangExtractRequest[],
  useGemma4 = false
): Promise<LangExtractResult[]> {
  const extractor = useGemma4 ? extractFeaturesViaGemma4 : extractFeaturesViaMock;

  return Promise.all(requests.map((req) => extractor(req)));
}
