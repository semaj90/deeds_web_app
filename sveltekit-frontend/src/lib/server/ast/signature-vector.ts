import { createHash } from 'node:crypto';
import { getRedis } from '../redis';

/**
 * Extracts function/class/export signature from TypeScript/JavaScript code.
 * Returns a canonical string representation of the code's structure.
 * Example: "class User { constructor(); login(); logout(); }"
 */
export function extractSignatureFromCode(code: string): string {
  const lines = code.split('\n');
  const signatures: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Export declarations
    if (trimmed.startsWith('export ')) {
      signatures.push(trimmed);
    }

    // Class/interface/type declarations
    if (trimmed.match(/^(export\s+)?(class|interface|type|enum|function)/)) {
      // Extract just the declaration, not implementation
      const match = trimmed.match(/^(export\s+)?(class|interface|type|enum|function)\s+(\w+)/);
      if (match) {
        signatures.push(`${match[2]} ${match[3]}`);
      }
    }

    // Public method/field declarations (inside classes)
    if (trimmed.match(/^\s*(public\s+)?\w+\s*\(.*\)\s*(:|=>|{)/)) {
      const methodMatch = trimmed.match(/^\s*(public\s+)?(\w+)\s*\(/);
      if (methodMatch) {
        signatures.push(`method: ${methodMatch[2]}`);
      }
    }
  }

  // Return canonical signature string
  return signatures.join(' | ') || 'unknown';
}

/**
 * Caches and retrieves embeddings for code signatures.
 * Uses Redis L1 cache (24h TTL) to avoid re-embedding identical signatures.
 */
export async function getSignatureVector(
  filePath: string,
  code: string,
  embedFunction: (text: string) => Promise<number[]>
): Promise<number[]> {
  const signature = extractSignatureFromCode(code);
  const cacheKey = `encoded_sigs:${createHash('sha256').update(signature).digest('hex')}`;

  const redis = await getRedis();

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // Ignore cache corruption
    }
  }

  // Embed signature
  const vector = await embedFunction(signature);

  // Cache for 24 hours
  await redis.setex(cacheKey, 86400, JSON.stringify(vector));

  return vector;
}

/**
 * Fallback: use function name alone if AST extraction fails.
 */
export function extractFunctionNameFromCode(code: string): string {
  const match = code.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
  if (match) return match[1];

  const classMatch = code.match(/(?:export\s+)?class\s+(\w+)/);
  if (classMatch) return classMatch[1];

  // Last resort: use first alphanumeric word
  const wordMatch = code.match(/\w+/);
  return wordMatch ? wordMatch[0] : 'unknown';
}
