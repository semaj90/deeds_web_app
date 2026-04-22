/**
 * cross-language-synthesis.ts — Cross-Language AST Synthesis
 *
 * Given a source function (TypeScript/JavaScript), synthesizes semantically
 * equivalent implementations in target languages by:
 *
 *  1. Extracting intent from codebase AST metadata (dual-vector Qdrant search)
 *  2. Fetching Lane 3 deep-research chunks for target-language best practices
 *  3. Building a grounded prompt with:
 *     - Original source code
 *     - AST cluster context (GPU k-means)
 *     - Research grounding (Docs > GitHub Issues > Reddit)
 *  4. Calling Gemma 4 tool-calling loop for structured output
 *
 * Supported languages: Python, Rust, Go, Java, C#
 *
 * Architecture constraint: this runs background-only (Lane 3 / async).
 * Never called from the interactive SSE chat path.
 */

// generateEmbedding used only for Lane 3 research queries (not AST lookup — searchCodebase embeds internally)
import { generateEmbedding } from '../grpc/embedding-client.js';
import { searchResearchChunks } from '../research/web-research-ingester.js';
import { recordResearchHits } from '../research/lane4-feedback.js';
import { callGemma4WithTools } from '../ace/gemma4-codeintel.js';
import type { Gemma4AceOpts } from '../ace/gemma4-codeintel.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SupportedLanguage = 'python' | 'rust' | 'go' | 'java' | 'csharp' | 'typescript';

export interface ASTSynthesisRequest {
  /** Source code to translate */
  sourceCode: string;
  /** Language of the source (default: typescript) */
  sourceLanguage?: SupportedLanguage;
  /** Target language(s) to synthesize */
  targetLanguages: SupportedLanguage[];
  /** Optional function/module name hint for better context retrieval */
  functionName?: string;
  /** Optional codebase context hint (e.g. 'evidence pipeline', 'auth middleware') */
  domainHint?: string;
  /** Max tokens per synthesis (default: 1024) */
  maxTokensPerTarget?: number;
}

export interface SynthesizedTarget {
  language: SupportedLanguage;
  code: string;
  notes: string;
  researchSources: string[];
  confidence: 'high' | 'medium' | 'low';
  latencyMs: number;
}

export interface ASTSynthesisResult {
  sourceLanguage: SupportedLanguage;
  functionName: string;
  targets: SynthesizedTarget[];
  astClusterHints: string[];
  totalLatencyMs: number;
  degraded: boolean;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Language idiom metadata — used to guide research queries
// ─────────────────────────────────────────────────────────────────────────────

const LANGUAGE_KEYWORDS: Record<SupportedLanguage, string> = {
  typescript: 'TypeScript async await type-safe',
  python: 'Python idiomatic type hints async',
  rust: 'Rust ownership lifetime trait impl',
  go: 'Go goroutine interface error handling',
  java: 'Java Spring interface generics',
  csharp: 'C# LINQ async Task pattern',
};

const LANGUAGE_DISPLAY: Record<SupportedLanguage, string> = {
  typescript: 'TypeScript',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  java: 'Java',
  csharp: 'C#',
};

// ─────────────────────────────────────────────────────────────────────────────
// Core synthesis function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Synthesize cross-language equivalents for a given source function.
 *
 * Grounding hierarchy per target:
 *   1. Codebase AST chunks (dual-vector search in codebase_chunks_768)
 *   2. Lane 3 deep research (official_docs > github_issue > reddit_post)
 *   3. Gemma 4 tool-calling loop for structured code generation
 */
export async function synthesizeCrossLanguage(
  req: ASTSynthesisRequest,
  opts: Pick<Gemma4AceOpts, 'model' | 'temperature'> = {}
): Promise<ASTSynthesisResult> {
  const startMs = Date.now();
  const errors: string[] = [];
  const srcLang = req.sourceLanguage ?? 'typescript';
  const fnName = req.functionName ?? extractFunctionName(req.sourceCode);
  const targets: SynthesizedTarget[] = [];
  let degraded = false;

  // Step 1: Fetch AST cluster context via codebase dual-vector search
  let astClusterHints: string[] = [];
  try {
    const { searchCodebase } = await import('../indexer/dual-embedder.js');
    const searchQuery = `${fnName} ${req.domainHint ?? ''} ${req.sourceCode.slice(0, 400)}`;
    const chunks = await searchCodebase(searchQuery, { limit: 4 }).catch(() => []);
    astClusterHints = chunks
      .filter((c) => (c.chunk as any).gpu_cluster != null)
      .map((c) => `cluster:${(c.chunk as any).gpu_cluster} ${(c.chunk as any).file_path ?? ''}`.trim())
      .filter(Boolean);
  } catch (e: any) {
    errors.push(`AST lookup: ${e.message}`);
    degraded = true;
  }

  // Step 2: Synthesize each target language in parallel
  const synthJobs = req.targetLanguages.map(async (lang): Promise<SynthesizedTarget> => {
    const langStart = Date.now();
    const researchSources: string[] = [];

    // Fetch Lane 3 research for this language
    let researchContext = '';
    try {
      const queryText = `${LANGUAGE_KEYWORDS[lang]} best practices ${fnName} ${req.domainHint ?? ''}`;
      const vec = await generateEmbedding(queryText);
      if (vec?.length === 768) {
        const chunks = await searchResearchChunks({
          queryEmbedding: vec,
          limit: 4,
          scoreThreshold: 0.45,
          // Priority: official_docs > github_issue > reddit_post
          sourceFilter: ['official_docs', 'github_issue', 'github_code', 'reddit_post'],
        });
        if (chunks.length > 0) {
          researchContext =
            `## ${LANGUAGE_DISPLAY[lang]} Research (Grounding: Docs > GitHub > Reddit)\n` +
            chunks
              .slice(0, 3)
              .map((c, i) => `[${i + 1}] [${c.source}] ${c.url}\n${c.body.slice(0, 400)}`)
              .join('\n\n');
          researchSources.push(...chunks.map((c) => c.url));
          // Lane 4: log hits for trust-score feedback (fire-and-forget)
          recordResearchHits(
            chunks.map((c) => ({ source: c.source, score: c.score })),
            'codebase',
          );
        }
      }
    } catch {
      // Non-fatal — synthesis continues without research grounding
    }

    // Build the synthesis prompt
    const systemPrompt = buildSynthesisSystemPrompt(
      srcLang,
      lang,
      astClusterHints,
      researchContext
    );

    const userMessage =
      `Translate the following ${LANGUAGE_DISPLAY[srcLang]} function to idiomatic ${LANGUAGE_DISPLAY[lang]}.\n` +
      `Function: ${fnName}\n\n` +
      `\`\`\`${srcLang}\n${req.sourceCode}\n\`\`\`\n\n` +
      `Respond with:\n` +
      `1. The translated code in a code block\n` +
      `2. Brief notes on key idioms/differences (2-3 sentences)\n` +
      `3. Confidence: high/medium/low`;

    let code = '';
    let notes = '';
    let confidence: SynthesizedTarget['confidence'] = 'medium';

    try {
      const result = await callGemma4WithTools(systemPrompt, userMessage, [], {
        model: opts.model,
        temperature: opts.temperature ?? 0.3,
        maxTokens: req.maxTokensPerTarget ?? 1024,
        lane: 'background' as any,
        taskType: 'code-synthesis' as any,
      });

      if (result.ok && result.text) {
        code = extractCodeBlock(result.text, lang);
        notes = extractNotes(result.text);
        confidence = parseConfidence(result.text);
      }
    } catch (e: any) {
      code = `// Synthesis failed: ${e.message}`;
      confidence = 'low';
    }

    return {
      language: lang,
      code,
      notes,
      researchSources,
      confidence,
      latencyMs: Date.now() - langStart,
    };
  });

  const settled = await Promise.allSettled(synthJobs);
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      targets.push(result.value);
    } else {
      errors.push(`Synthesis failed: ${result.reason}`);
      degraded = true;
    }
  }

  return {
    sourceLanguage: srcLang,
    functionName: fnName,
    targets,
    astClusterHints,
    totalLatencyMs: Date.now() - startMs,
    degraded,
    errors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildSynthesisSystemPrompt(
  srcLang: SupportedLanguage,
  targetLang: SupportedLanguage,
  astHints: string[],
  researchContext: string
): string {
  const parts: string[] = [
    `You are an expert polyglot programmer specializing in ${LANGUAGE_DISPLAY[targetLang]}.`,
    `Translate code from ${LANGUAGE_DISPLAY[srcLang]} to idiomatic ${LANGUAGE_DISPLAY[targetLang]}.`,
    `Preserve semantics exactly. Use ${LANGUAGE_DISPLAY[targetLang]}-native idioms.`,
    `Do NOT add features not in the original.`,
  ];

  if (astHints.length > 0) {
    parts.push(`\n## Codebase AST Context\n${astHints.map((h) => `- ${h}`).join('\n')}`);
  }

  if (researchContext) {
    parts.push(`\n${researchContext}`);
  }

  return parts.join('\n');
}

function extractFunctionName(code: string): string {
  const patterns = [
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    /(?:export\s+)?const\s+(\w+)\s*=/,
    /def\s+(\w+)/,
    /func\s+(\w+)/,
    /fn\s+(\w+)/,
    /public\s+\w+\s+(\w+)\s*\(/,
  ];
  for (const p of patterns) {
    const m = code.match(p);
    if (m?.[1]) return m[1];
  }
  return 'function';
}

function extractCodeBlock(text: string, lang: SupportedLanguage): string {
  const langAliases: Record<SupportedLanguage, string[]> = {
    typescript: ['typescript', 'ts'],
    python: ['python', 'py'],
    rust: ['rust', 'rs'],
    go: ['go', 'golang'],
    java: ['java'],
    csharp: ['csharp', 'cs', 'c#'],
  };
  const aliases = langAliases[lang];
  for (const alias of aliases) {
    const re = new RegExp('```' + alias + '\\s*\\n([\\s\\S]*?)\\n```', 'i');
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  // Generic code block fallback
  const generic = text.match(/```[\w]*\s*\n([\s\S]*?)\n```/);
  if (generic?.[1]) return generic[1].trim();
  return text.slice(0, 2000).trim();
}

function extractNotes(text: string): string {
  // Find content after the last code block
  const afterCode = text.replace(/```[\s\S]*?```/g, '').trim();
  return afterCode.slice(0, 500).trim();
}

function parseConfidence(text: string): SynthesizedTarget['confidence'] {
  const lower = text.toLowerCase();
  if (lower.includes('confidence: high') || lower.includes('confidence:high')) return 'high';
  if (lower.includes('confidence: low') || lower.includes('confidence:low')) return 'low';
  return 'medium';
}
