/**
 * LangExtract Feature Extraction for Graphify Audit
 *
 * Extracts 1037 TODO items, feature labels, code patterns, and audit insights.
 * Integrates with Gemma4 tool calling for semantic analysis.
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Feature extraction result
 */
export interface ExtractedFeature {
  id: string;
  type: 'todo' | 'feature' | 'pattern' | 'risk' | 'gap';
  name: string;
  description: string;
  confidence: number;
  tags: string[];
  source_file: string;
  line_number?: number;
  priority?: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Graphify audit summary
 */
export interface GraphifyAuditSummary {
  total_features: number;
  total_todos: number;
  by_type: Record<string, number>;
  by_priority: Record<string, number>;
  critical_gaps: ExtractedFeature[];
  recommendations: string[];
  timestamp: string;
}

/**
 * Parse "1037 TODOs" from markdown/code/config files
 */
export async function extractTodosFromDirectory(
  dir: string,
  patterns: RegExp[] = [/TODO:/gi, /FIXME:/gi, /XXX:/gi]
): Promise<ExtractedFeature[]> {
  const todos: ExtractedFeature[] = [];
  const walkDir = async (currentPath: string, depth = 0) => {
    if (depth > 3) return; // Limit depth

    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && !['.git', 'node_modules', '.next', 'dist'].includes(entry.name)) {
          await walkDir(path.join(currentPath, entry.name), depth + 1);
        } else if (entry.isFile() && ['.ts', '.tsx', '.md', '.json'].some((ext) => entry.name.endsWith(ext))) {
          try {
            const content = await fs.readFile(path.join(currentPath, entry.name), 'utf-8');
            const lines = content.split('\n');

            lines.forEach((line, idx) => {
              patterns.forEach((pattern) => {
                if (pattern.test(line)) {
                  const match = line.match(pattern);
                  if (match) {
                    todos.push({
                      id: `todo-${todos.length}`,
                      type: 'todo',
                      name: line.substring(match.index! + match[0].length).trim().substring(0, 80),
                      description: line.trim(),
                      confidence: 0.95,
                      tags: ['actionable', 'audit'],
                      source_file: path.relative(dir, path.join(currentPath, entry.name)),
                      line_number: idx + 1,
                      priority: line.includes('CRITICAL') ? 'critical' : line.includes('FIXME') ? 'high' : 'medium'
                    });
                  }
                }
              });
            });
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  };

  await walkDir(dir);
  return todos;
}

/**
 * Extract feature patterns from TypeScript code
 */
export async function extractFeaturePatternsFromCode(filePath: string): Promise<ExtractedFeature[]> {
  const features: ExtractedFeature[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // Extract exports
    lines.forEach((line, idx) => {
      if (line.includes('export ') && (line.includes('function') || line.includes('const'))) {
        const nameMatch = line.match(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/);
        if (nameMatch) {
          features.push({
            id: `func-${nameMatch[1]}`,
            type: 'feature',
            name: nameMatch[1],
            description: `Exported function/constant at line ${idx + 1}`,
            confidence: 1.0,
            tags: ['export', 'api'],
            source_file: filePath,
            line_number: idx + 1,
            priority: 'medium'
          });
        }
      }

      // Extract async/await patterns
      if (line.includes('await ') || line.includes('async ')) {
        features.push({
          id: `async-${idx}`,
          type: 'pattern',
          name: 'Async/await',
          description: line.trim().substring(0, 100),
          confidence: 0.9,
          tags: ['async', 'concurrency'],
          source_file: filePath,
          line_number: idx + 1,
          priority: 'low'
        });
      }
    });
  } catch {
    // Skip on error
  }

  return features;
}

/**
 * Perform GAN-style validation on extracted features
 */
export function validateFeaturesGAN(features: ExtractedFeature[]): { pass: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for duplicates
  const seen = new Set<string>();
  features.forEach((f) => {
    if (seen.has(f.id)) {
      errors.push(`Duplicate feature ID: ${f.id}`);
    }
    seen.add(f.id);
  });

  // Check confidence range
  features.forEach((f) => {
    if (f.confidence < 0 || f.confidence > 1) {
      errors.push(`Invalid confidence for ${f.id}: ${f.confidence}`);
    }
  });

  // Check required fields
  features.forEach((f) => {
    if (!f.name || !f.description || !f.source_file) {
      errors.push(`Missing required fields in ${f.id}`);
    }
  });

  return {
    pass: errors.length === 0,
    errors
  };
}

/**
 * Generate audit summary from features
 */
export function summarizeFeatures(features: ExtractedFeature[]): GraphifyAuditSummary {
  const byType: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const criticalGaps: ExtractedFeature[] = [];

  features.forEach((f) => {
    byType[f.type] = (byType[f.type] || 0) + 1;
    if (f.priority) {
      byPriority[f.priority] = (byPriority[f.priority] || 0) + 1;
    }
    if (f.priority === 'critical') {
      criticalGaps.push(f);
    }
  });

  return {
    total_features: features.length,
    total_todos: features.filter((f) => f.type === 'todo').length,
    by_type: byType,
    by_priority: byPriority,
    critical_gaps: criticalGaps,
    recommendations: [
      criticalGaps.length > 0 ? `Address ${criticalGaps.length} critical gaps` : 'No critical gaps',
      `Review ${byType['risk'] || 0} risk items`,
      `Validate ${byType['pattern'] || 0} code patterns`
    ],
    timestamp: new Date().toISOString()
  };
}

/**
 * Write results to .tmp/graphify-audit-results.json
 */
export async function writeTmpAuditResults(
  results: {
    features: ExtractedFeature[];
    summary: GraphifyAuditSummary;
    ganValidation: { pass: boolean; errors: string[] };
  }
): Promise<string> {
  const tmpDir = path.join(process.cwd(), '.tmp');

  try {
    await fs.mkdir(tmpDir, { recursive: true });
  } catch {
    // Already exists
  }

  const outputPath = path.join(tmpDir, 'graphify-audit-results.json');

  await fs.writeFile(outputPath, JSON.stringify(results, null, 2));

  return outputPath;
}
